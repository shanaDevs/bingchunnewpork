package lk.bingchun.delivery.tracking

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import lk.bingchun.delivery.core.systemLocationEnabled
import lk.bingchun.delivery.data.network.ApiClients
import lk.bingchun.delivery.data.network.LocationBatchRequest
import lk.bingchun.delivery.data.network.LocationPointDto
import java.time.Instant
import java.util.Collections
import kotlin.coroutines.resume

/**
 * GPS tracking while a job is IN_PROGRESS, plus a low-frequency idle mode that runs
 * whenever the driver is ONLINE so dispatch can still see where they are.
 *
 * Streams to the core socket in realtime when connected; otherwise queues
 * points and drains them via POST /api/delivery/locations/batch on stop / reconnect.
 *
 * Uses Google fused location when Play Services is present; otherwise (Huawei / no GMS)
 * streams from platform [LocationManager] so live tracking still works.
 */
class LocationTracker(
    context: Context,
    private val clients: ApiClients,
    private val socket: DeliverySocket,
) {
    private val appContext = context.applicationContext
    private val fused: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(appContext)
    private val locationManager =
        appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val queue = Collections.synchronizedList(mutableListOf<LocationPointDto>())
    private var activeJobId: String? = null
    private var tracking = false
    private var idleMode = false

    private val _lastFix = MutableStateFlow<DriverFix?>(null)
    /** Last fused / platform fix. Null when tracking is off — never a synthetic coordinate. */
    val lastFix: StateFlow<DriverFix?> = _lastFix.asStateFlow()

    private val _runTracking = MutableStateFlow(false)
    /** True only during an in-progress run (not idle duty pings). */
    val runTracking: StateFlow<Boolean> = _runTracking.asStateFlow()

    init {
        socket.addConnectListener { flushBatch() }
        if (socket.isConnected) flushBatch()
    }

    private var previousFix: DriverFix? = null

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            applyFix(loc)
        }
    }

    private val platformListener = LocationListener { loc -> applyFix(loc) }

    val isTracking: Boolean get() = tracking

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    /** True when the system location switch is on (GPS or network). */
    fun isLocationEnabled(): Boolean = systemLocationEnabled(locationManager)

    /**
     * One-off current position, independent of whether continuous tracking is running.
     * Falls back to the last known fix (or null) if a fresh fix can't be obtained.
     */
    @SuppressLint("MissingPermission")
    suspend fun getCurrentLocation(): DriverFix? {
        val cached = _lastFix.value
        if (!hasPermission()) return cached
        val fresh = try {
            if (isPlayServicesAvailable()) {
                fusedCurrentFix() ?: platformCurrentFix()
            } else {
                platformCurrentFix()
            }
        } catch (_: Exception) {
            null
        }
        return fresh ?: cached
    }

    /** High-frequency tracking for a run that is under way. [jobId] may be null when unknown. */
    fun start(jobId: String?) = beginUpdates(jobId, idle = false)

    /** Battery-friendly tracking while the driver is online but not delivering. */
    fun startIdle() = beginUpdates(null, idle = true)

    @SuppressLint("MissingPermission")
    private fun beginUpdates(jobId: String?, idle: Boolean) {
        if (!hasPermission()) return
        // Never downgrade an in-progress run back to the idle cadence.
        if (idle && tracking && !idleMode) return
        if (tracking && idleMode == idle && activeJobId == jobId) return
        if (tracking) stopUpdates()

        activeJobId = jobId
        idleMode = idle
        val intervalMs = if (idle) IDLE_INTERVAL_MS else ACTIVE_INTERVAL_MS
        val minDistanceM = if (idle) IDLE_MIN_DISTANCE_M else ACTIVE_MIN_DISTANCE_M
        tracking = true
        _runTracking.value = !idle

        if (isPlayServicesAvailable()) {
            val request = if (idle) {
                LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, IDLE_INTERVAL_MS)
                    .setMinUpdateDistanceMeters(IDLE_MIN_DISTANCE_M)
                    .build()
            } else {
                LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, ACTIVE_INTERVAL_MS)
                    .setMinUpdateDistanceMeters(ACTIVE_MIN_DISTANCE_M)
                    .build()
            }
            fused.requestLocationUpdates(request, callback, appContext.mainLooper)
                .addOnFailureListener { startPlatformUpdates(intervalMs, minDistanceM) }
            fused.lastLocation.addOnSuccessListener { loc ->
                if (loc == null) return@addOnSuccessListener
                applyFix(loc)
            }
        } else {
            startPlatformUpdates(intervalMs, minDistanceM)
        }
    }

    fun stop() {
        if (!tracking && queue.isEmpty()) return
        stopUpdates()
        tracking = false
        idleMode = false
        _runTracking.value = false
        _lastFix.value = null
        previousFix = null
        flushBatch()
        activeJobId = null
    }

    private fun stopUpdates() {
        runCatching { fused.removeLocationUpdates(callback) }
        runCatching { locationManager.removeUpdates(platformListener) }
    }

    @SuppressLint("MissingPermission")
    private fun startPlatformUpdates(intervalMs: Long, minDistanceM: Float) {
        runCatching { fused.removeLocationUpdates(callback) }
        val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
        ).filter { locationManager.allProviders.contains(it) }
        for (provider in providers) {
            runCatching {
                locationManager.requestLocationUpdates(
                    provider,
                    intervalMs,
                    minDistanceM,
                    platformListener,
                    appContext.mainLooper,
                )
            }
        }
        seedFromLastKnown()
    }

    @SuppressLint("MissingPermission")
    private fun seedFromLastKnown() {
        val loc = bestLastKnown() ?: return
        applyFix(loc)
    }

    @SuppressLint("MissingPermission")
    private fun bestLastKnown(): Location? {
        val gps = runCatching {
            locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
        }.getOrNull()
        val net = runCatching {
            locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
        }.getOrNull()
        return listOfNotNull(gps, net).maxByOrNull { it.time }
    }

    @SuppressLint("MissingPermission")
    private suspend fun fusedCurrentFix(): DriverFix? = withTimeoutOrNull(CURRENT_FIX_TIMEOUT_MS) {
        suspendCancellableCoroutine { cont ->
            fun done(loc: Location?) {
                if (cont.isActive) cont.resume(loc?.toDriverFix())
            }
            val cts = CancellationTokenSource()
            cont.invokeOnCancellation { cts.cancel() }
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { loc -> done(loc) }
                .addOnFailureListener {
                    fused.lastLocation
                        .addOnSuccessListener { loc -> done(loc) }
                        .addOnFailureListener { done(null) }
                }
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun platformCurrentFix(): DriverFix? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val providers = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
            ).filter { locationManager.allProviders.contains(it) }
            for (provider in providers) {
                val loc = withTimeoutOrNull(CURRENT_FIX_TIMEOUT_MS / 2) {
                    suspendCancellableCoroutine<Location?> { cont ->
                        val cancel = CancellationSignal()
                        cont.invokeOnCancellation { cancel.cancel() }
                        runCatching {
                            locationManager.getCurrentLocation(
                                provider,
                                cancel,
                                ContextCompat.getMainExecutor(appContext),
                            ) { loc ->
                                if (cont.isActive) cont.resume(loc)
                            }
                        }.onFailure {
                            if (cont.isActive) cont.resume(null)
                        }
                    }
                }
                if (loc != null) return loc.toDriverFix()
            }
        } else {
            val loc = withTimeoutOrNull(CURRENT_FIX_TIMEOUT_MS) {
                suspendCancellableCoroutine<Location?> { cont ->
                    val listener = LocationListener { loc ->
                        if (cont.isActive) cont.resume(loc)
                    }
                    cont.invokeOnCancellation { runCatching { locationManager.removeUpdates(listener) } }
                    val started = runCatching {
                        locationManager.requestSingleUpdate(
                            LocationManager.GPS_PROVIDER,
                            listener,
                            appContext.mainLooper,
                        )
                    }.isSuccess || runCatching {
                        locationManager.requestSingleUpdate(
                            LocationManager.NETWORK_PROVIDER,
                            listener,
                            appContext.mainLooper,
                        )
                    }.isSuccess
                    if (!started && cont.isActive) cont.resume(null)
                }
            }
            if (loc != null) return loc.toDriverFix()
        }
        return bestLastKnown()?.toDriverFix()
    }

    private fun applyFix(loc: Location) {
        val gpsHeading = if (loc.hasBearing() && loc.hasSpeed() && loc.speed > 0.5f) {
            loc.bearing.toDouble()
        } else {
            null
        }
        val prev = previousFix
        val heading = gpsHeading ?: prev?.let { prior ->
            val moved = haversineMetres(prior.lat, prior.lng, loc.latitude, loc.longitude)
            if (moved >= 5.0) bearingDeg(prior.lat, prior.lng, loc.latitude, loc.longitude) else prior.heading
        }
        val fix = DriverFix(lat = loc.latitude, lng = loc.longitude, heading = heading)
        _lastFix.value = fix
        previousFix = fix
        // Android Location.speed is m/s — convert to km/h for core.
        val speedKph = if (loc.hasSpeed()) loc.speed.toDouble() * 3.6 else null
        val recordedAt = Instant.now().toString()
        if (socket.isConnected) {
            socket.emitLocation(
                lat = loc.latitude,
                lng = loc.longitude,
                heading = heading,
                speedKph = speedKph,
                recordedAt = recordedAt,
                jobId = activeJobId,
            )
        } else {
            queue.add(
                LocationPointDto(
                    lat = loc.latitude,
                    lng = loc.longitude,
                    heading = heading,
                    speedKph = speedKph,
                    recordedAt = recordedAt,
                    jobId = activeJobId,
                ),
            )
        }
    }

    private fun isPlayServicesAvailable(): Boolean = try {
        GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(appContext) == ConnectionResult.SUCCESS
    } catch (_: Exception) {
        false
    }

    /** Sends queued points to core; keeps them on failure for the next attempt. */
    fun flushBatch() {
        if (queue.isEmpty()) return
        val batch = synchronized(queue) { queue.toList() }
        scope.launch {
            try {
                val batchJobId = batch.firstNotNullOfOrNull { it.jobId } ?: activeJobId
                clients.core.postLocationBatch(
                    LocationBatchRequest(jobId = batchJobId, points = batch),
                )
                synchronized(queue) {
                    repeat(batch.size) { if (queue.isNotEmpty()) queue.removeAt(0) }
                }
            } catch (_: Exception) {
                // Left queued for the next flush.
            }
        }
    }

    private companion object {
        const val ACTIVE_INTERVAL_MS = 5_000L
        const val ACTIVE_MIN_DISTANCE_M = 15f
        const val IDLE_INTERVAL_MS = 30_000L
        const val IDLE_MIN_DISTANCE_M = 50f
        const val CURRENT_FIX_TIMEOUT_MS = 12_000L
    }
}

private fun Location.toDriverFix(): DriverFix = DriverFix(lat = latitude, lng = longitude)

/** Last fused GPS fix with optional travel heading (0 = north, clockwise). */
data class DriverFix(
    val lat: Double,
    val lng: Double,
    val heading: Double? = null,
)

/** Initial bearing from origin to destination in degrees (0 = north). */
private fun bearingDeg(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val toRad = { d: Double -> Math.toRadians(d) }
    val phi1 = toRad(lat1)
    val phi2 = toRad(lat2)
    val dLng = toRad(lng2 - lng1)
    val y = kotlin.math.sin(dLng) * kotlin.math.cos(phi2)
    val x = kotlin.math.cos(phi1) * kotlin.math.sin(phi2) -
        kotlin.math.sin(phi1) * kotlin.math.cos(phi2) * kotlin.math.cos(dLng)
    return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360
}

private fun haversineMetres(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val r = 6_371_000.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLng = Math.toRadians(lng2 - lng1)
    val a = kotlin.math.sin(dLat / 2).let { it * it } +
        kotlin.math.cos(Math.toRadians(lat1)) * kotlin.math.cos(Math.toRadians(lat2)) *
        kotlin.math.sin(dLng / 2).let { it * it }
    return r * 2 * kotlin.math.atan2(kotlin.math.sqrt(a), kotlin.math.sqrt(1 - a))
}
