package lk.bingchun.delivery.tracking

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import lk.bingchun.delivery.core.AppConfig
import lk.bingchun.delivery.core.SessionInvalidator
import lk.bingchun.delivery.data.local.SecureStore
import org.json.JSONArray
import org.json.JSONObject
import java.net.URISyntaxException

/**
 * socket.io connection to the **core** backend (default namespace).
 *
 * Emits: joinBranchPool, driver:location
 * Listens: newDeliveryJob, deliveryJobClaimed, orderCancelled (via [on])
 */
class DeliverySocket(
    private val store: SecureStore,
    private val invalidator: SessionInvalidator,
) {

    private var socket: Socket? = null

    /**
     * Handlers keyed by event. The underlying socket only ever gets one dispatcher
     * listener per event which reads this map live, so handlers can be added and
     * removed independently (e.g. the ViewModel and DriverAlertService both listen
     * for newDeliveryJob without clobbering each other).
     */
    private val handlers = mutableMapOf<String, MutableList<(Array<out Any>) -> Unit>>()
    private val attachedEvents = mutableSetOf<String>()
    private var pendingStoreIds: List<String> = emptyList()
    private var lastJoinedKey: String? = null
    private var lastJoinedAtMs: Long = 0L
    private val connectListeners = mutableListOf<() -> Unit>()

    val isConnected: Boolean get() = socket?.connected() == true

    /** Fired on every socket connect/reconnect (e.g. flush queued GPS). */
    fun addConnectListener(listener: () -> Unit) {
        synchronized(connectListeners) { connectListeners.add(listener) }
    }

    fun connect(token: String? = store.token) {
        if (socket != null) {
            // Already created — still flush any pending pool join if we're connected.
            if (socket?.connected() == true && pendingStoreIds.isNotEmpty()) {
                emitJoinBranchPool(pendingStoreIds)
            }
            return
        }
        val jwt = token ?: return

        try {
            val opts = IO.Options().apply {
                transports = arrayOf("websocket")
                path = "/socket.io"
                auth = mapOf("token" to jwt)
                reconnection = true
            }
            val url = AppConfig.coreSocketOrigin
            socket = IO.socket(url, opts).also { sock ->
                synchronized(handlers) {
                    attachedEvents.clear()
                    handlers.keys.forEach { event -> attachDispatcher(sock, event) }
                }
                sock.on(Socket.EVENT_CONNECT) {
                    Log.d(TAG, "Core socket connected")
                    lastJoinedKey = null
                    val ids = pendingStoreIds
                    if (ids.isNotEmpty()) emitJoinBranchPool(ids, force = true)
                    val listeners = synchronized(connectListeners) { connectListeners.toList() }
                    listeners.forEach { listener ->
                        try {
                            listener()
                        } catch (e: Exception) {
                            Log.w(TAG, "Connect listener failed", e)
                        }
                    }
                }
                sock.on(Socket.EVENT_CONNECT_ERROR) { args ->
                    Log.w(TAG, "Core socket connect error: ${args.firstOrNull()}")
                    val msg = args.firstOrNull()?.toString().orEmpty()
                    if (msg.contains(SessionInvalidator.SESSION_SUPERSEDED)) {
                        invalidator.notify(SessionInvalidator.SESSION_SUPERSEDED)
                    }
                }
                sock.on("session_revoked") {
                    invalidator.notify(SessionInvalidator.SESSION_SUPERSEDED)
                }
                sock.connect()
            }
            Log.d(TAG, "Connecting to core socket $url")
        } catch (e: URISyntaxException) {
            Log.e(TAG, "Bad socket URL", e)
        }
    }

    /** Join branch pool rooms so admin-created jobs fan out to this driver. */
    fun joinBranchPool(storeIds: List<String>) {
        val ids = storeIds.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (ids.isEmpty()) return
        pendingStoreIds = ids
        if (socket?.connected() == true) {
            emitJoinBranchPool(ids)
        } else {
            // Ensure a connection attempt is in flight; join runs on EVENT_CONNECT.
            connect()
            Log.d(TAG, "joinBranchPool queued until connect: ${ids.joinToString()}")
        }
    }

    private fun emitJoinBranchPool(storeIds: List<String>, force: Boolean = false) {
        val key = storeIds.sorted().joinToString(",")
        val now = System.currentTimeMillis()
        if (!force && key == lastJoinedKey && now - lastJoinedAtMs < JOIN_DEBOUNCE_MS) return
        lastJoinedKey = key
        lastJoinedAtMs = now
        val payload = JSONObject().apply {
            put("storeIds", JSONArray(storeIds))
        }
        socket?.emit("joinBranchPool", payload)
        Log.d(TAG, "joinBranchPool emitted ${storeIds.joinToString()}")
    }

    fun goOnline() {
        // Core duty is authoritative via PATCH /delivery/me/duty; keep emit for DS compatibility.
        socket?.emit("driver:online")
    }

    fun goOffline() {
        socket?.emit("driver:offline")
    }

    /**
     * @param speedKph speed in km/h (caller converts from m/s if needed)
     * @param recordedAt ISO-8601 timestamp
     */
    fun emitLocation(
        lat: Double,
        lng: Double,
        heading: Double?,
        speedKph: Double?,
        recordedAt: String = java.time.Instant.now().toString(),
        jobId: String? = null,
    ) {
        val payload = JSONObject().apply {
            put("lat", lat)
            put("lng", lng)
            if (heading != null) put("heading", heading)
            if (speedKph != null) {
                put("speedKph", speedKph)
                put("speed", speedKph) // legacy alias accepted by core
            }
            put("recordedAt", recordedAt)
            put("timestamp", recordedAt)
            if (jobId != null) put("jobId", jobId)
        }
        socket?.emit("driver:location", payload)
    }

    fun on(event: String, handler: (Array<out Any>) -> Unit) {
        synchronized(handlers) {
            handlers.getOrPut(event) { mutableListOf() }.add(handler)
            socket?.let { attachDispatcher(it, event) }
        }
    }

    /** Remove one handler; other listeners for the same event keep working. */
    fun off(event: String, handler: (Array<out Any>) -> Unit) {
        synchronized(handlers) {
            handlers[event]?.remove(handler)
        }
    }

    fun off(event: String) {
        synchronized(handlers) {
            handlers.remove(event)
        }
    }

    private fun attachDispatcher(sock: Socket, event: String) {
        if (!attachedEvents.add(event)) return
        sock.on(event) { args ->
            val snapshot = synchronized(handlers) { handlers[event]?.toList() }.orEmpty()
            snapshot.forEach { handler ->
                try {
                    handler(args)
                } catch (e: Exception) {
                    Log.w(TAG, "Handler for $event failed", e)
                }
            }
        }
    }

    fun disconnect() {
        pendingStoreIds = emptyList()
        socket?.let {
            it.emit("driver:offline")
            it.disconnect()
            it.off()
        }
        socket = null
        synchronized(handlers) { attachedEvents.clear() }
    }

    companion object {
        private const val TAG = "DeliverySocket"
        private const val JOIN_DEBOUNCE_MS = 15_000L
    }
}
