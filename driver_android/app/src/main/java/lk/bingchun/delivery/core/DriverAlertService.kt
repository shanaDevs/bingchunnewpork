package lk.bingchun.delivery.core

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.R
import lk.bingchun.delivery.data.model.JobSummary
import org.json.JSONArray
import org.json.JSONObject
import java.util.Collections
import java.util.LinkedHashMap

/**
 * Foreground service that runs while the driver is ON DUTY. It keeps the core
 * socket connected (joined to every accessible branch pool) and fires a loud
 * system notification when a new delivery job arrives — even when the app is
 * backgrounded or swiped away from recents.
 *
 * Also owns active-ride GPS tracking so the actual route continues when the
 * Compose UI is destroyed.
 *
 * Ringing is gated by [alertEligible]: muted while ASSIGNED/IN_PROGRESS,
 * active again during RETURNING (return to branch).
 *
 * Cancellation alerts ([ACTION_ORDER_CANCELLED]) are deliberately outside that gate and
 * outside the ring cycle: a rider mid-run is exactly when new-job rings are muted, and
 * exactly when they most need to know a stop just died.
 */
class DriverAlertService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var container: AppContainer
    private var loopStarted = false
    private var alertPlayer: MediaPlayer? = null
    private val activeAlerts = LinkedHashMap<String, RideAlert>()
    private val seenJobIds: MutableSet<String> = Collections.synchronizedSet(HashSet())
    @Volatile private var alertEligible: Boolean = true
    @Volatile private var trackingJobId: String? = null
    private var ringWakeLock: PowerManager.WakeLock? = null
    private var ringCycleJob: Job? = null
    private var ringingJobId: String? = null
    private var postRejectHoldJob: Job? = null
    @Volatile private var lastRejectedJobId: String? = null
    @Volatile private var lastRejectedStoreId: String? = null
    @Volatile private var postRejectHoldUntilElapsed: Long = 0L
    /** Own player so a cancellation never disturbs the looping new-job alert. */
    private var cancelPlayer: MediaPlayer? = null
    private val alertedCancellations: MutableSet<String> = Collections.synchronizedSet(HashSet())

    private val newJobHandler: (Array<out Any>) -> Unit = { args -> onSocketNewJob(args) }
    private val jobAssignedHandler: (Array<out Any>) -> Unit = { args -> onSocketJobAssigned(args) }
    private val jobClaimedHandler: (Array<out Any>) -> Unit = { args -> onSocketJobClaimed(args) }
    private val orderCancelledHandler: (Array<out Any>) -> Unit = { args -> onSocketOrderCancelled(args) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        container = (application as BingChunApp).container
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (container.secureStore.token == null) {
            intent?.getStringExtra(EXTRA_JOB_ID)?.let { BcNotifications.cancelJob(this, it) }
            stopRequested = true
            stopSelf()
            return START_NOT_STICKY
        }
        startAsForeground()
        when (intent?.action) {
            ACTION_SILENCE_JOB -> {
                intent.getStringExtra(EXTRA_JOB_ID)?.let(::silenceJob)
            }
            ACTION_CLEAR_SEEN -> {
                intent.getStringExtra(EXTRA_JOB_ID)?.let(::clearSeenInternal)
            }
            ACTION_ALERT_JOB -> {
                parseAlertFromIntent(intent)?.let(::alertJob)
            }
            ACTION_FORCE_RING -> {
                // Manual admin re-ring via FCM — ring immediately regardless of
                // whether this job is already tracked (mirrors the socket path).
                parseAlertFromIntent(intent)?.let { alert ->
                    if (alertEligible) forceRingNow(alert)
                }
            }
            ACTION_BEGIN_POST_REJECT_HOLD -> {
                beginPostRejectHoldInternal(
                    jobId = intent.getStringExtra(EXTRA_JOB_ID).orEmpty(),
                    storeId = intent.getStringExtra(EXTRA_STORE_ID).orEmpty(),
                )
            }
            ACTION_CANCEL_POST_REJECT_HOLD -> {
                cancelPostRejectHoldInternal()
            }
            ACTION_RESUME_RING -> {
                // Fired by AlarmManager after the quiet gap — survives the
                // process having been killed while idle. Ring whichever job
                // is currently oldest; no-op if everything resolved meanwhile.
                promoteFrontIfNeeded()
            }
            ACTION_SET_ELIGIBLE -> {
                alertEligible = intent.getBooleanExtra(EXTRA_ALERT_ELIGIBLE, true)
                if (!alertEligible) {
                    // Pause ringing while actively delivering — keep the alerts
                    // queued so ringing resumes once eligible again.
                    pauseRingCycle()
                } else {
                    promoteFrontIfNeeded()
                }
            }
            ACTION_START_TRACKING -> {
                val jobId = intent.getStringExtra(EXTRA_JOB_ID)
                if (!jobId.isNullOrBlank()) {
                    trackingJobId = jobId
                    container.deliverySocket.connect()
                    container.locationTracker.start(jobId)
                    startAsForeground(trackingActive = true)
                }
            }
            ACTION_STOP_TRACKING -> {
                trackingJobId = null
                runCatching { container.locationTracker.stop() }
                startAsForeground(trackingActive = false)
            }
            ACTION_ORDER_CANCELLED -> {
                alertOrderCancelled(
                    jobId = intent.getStringExtra(EXTRA_JOB_ID).orEmpty(),
                    orderId = intent.getStringExtra(EXTRA_ORDER_ID).orEmpty(),
                    orderNumber = intent.getStringExtra(EXTRA_ORDER_NUMBER).orEmpty(),
                )
            }
            ACTION_ACK_CANCELLED -> {
                intent.getStringExtra(EXTRA_ORDER_ID)?.let(::acknowledgeCancellationInternal)
            }
        }
        if (!loopStarted) {
            loopStarted = true
            container.deliverySocket.on("newDeliveryJob", newJobHandler)
            container.deliverySocket.on("jobAssignedToDriver", jobAssignedHandler)
            container.deliverySocket.on("deliveryJobClaimed", jobClaimedHandler)
            container.deliverySocket.on("orderCancelled", orderCancelledHandler)
            scope.launch { runLoop() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        container.deliverySocket.off("newDeliveryJob", newJobHandler)
        container.deliverySocket.off("jobAssignedToDriver", jobAssignedHandler)
        container.deliverySocket.off("deliveryJobClaimed", jobClaimedHandler)
        container.deliverySocket.off("orderCancelled", orderCancelledHandler)
        activeAlerts.keys.toList().forEach { BcNotifications.cancelJob(this, it) }
        activeAlerts.clear()
        publishActiveAlerts()
        pauseRingCycle()
        postRejectHoldJob?.cancel()
        stopCancelSound()
        val shouldRestart = !stopRequested && container.secureStore.token != null
        if (!shouldRestart) {
            runCatching { container.locationTracker.stop() }
            clearPendingCancellations()
        }
        scope.cancel()
        super.onDestroy()
        if (shouldRestart) {
            runCatching { start(applicationContext) }
                .onFailure { Log.w(TAG, "Could not restart duty service after destroy", it) }
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        if (!stopRequested && container.secureStore.token != null) {
            runCatching { start(this) }
                .onFailure { Log.w(TAG, "Could not restart duty service after task removed", it) }
        }
    }

    private fun startAsForeground(trackingActive: Boolean = trackingJobId != null) {
        val notification = BcNotifications.buildDutyNotification(this, trackingActive)
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        } else {
            0
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                BcNotifications.DUTY_NOTIFICATION_ID,
                notification,
                type,
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                BcNotifications.DUTY_NOTIFICATION_ID,
                notification,
                type,
            )
        } else {
            startForeground(BcNotifications.DUTY_NOTIFICATION_ID, notification)
        }
    }

    private suspend fun runLoop() {
        var cycle = 0
        var consecutiveFailures = 0
        while (true) {
            try {
                // Re-synced every cycle (not just every 4th) so a driver who just
                // finished a delivery doesn't stay muted for up to a minute while
                // a new job is broadcast.
                val profile = container.authRepository.getMe()
                if (!profile.isOnline) {
                    Log.d(TAG, "Driver went off duty — stopping alert service")
                    stopRequested = true
                    stopSelf()
                    return
                }
                alertEligible = profile.alertEligible
                if (cycle % 4 == 0) {
                    val storeIds = buildList {
                        profile.storeId?.let { add(it) }
                        profile.store?.id?.let { add(it) }
                        profile.accessibleStores.forEach { add(it.id) }
                    }.distinct().filter { it.isNotBlank() }
                    container.deliverySocket.connect()
                    container.deliverySocket.joinBranchPool(storeIds)
                }
                pollJobs()
                consecutiveFailures = 0
            } catch (e: Exception) {
                Log.w(TAG, "Alert loop cycle failed: ${e.message}")
                consecutiveFailures += 1
            }
            cycle += 1
            delay(pollDelayFor(consecutiveFailures))
        }
    }

    /** Fixed 15s cadence while healthy; backs off (30s, 60s, capped at 60s) across a failure streak. */
    private fun pollDelayFor(consecutiveFailures: Int): Long =
        if (consecutiveFailures <= 0) {
            POLL_INTERVAL_MS
        } else {
            (POLL_INTERVAL_MS shl consecutiveFailures.coerceAtMost(2)).coerceAtMost(MAX_POLL_INTERVAL_MS)
        }

    private suspend fun pollJobs() {
        val jobs = container.jobsRepository.listJobs()
        val availableIds = jobs.filter { it.status == "SCHEDULED" }.mapTo(HashSet()) { it.id }
        activeAlerts.keys.filterNot { it in availableIds }.toList().forEach(::silenceJob)
        if (seenJobIds.size > 500) {
            seenJobIds.clear()
            seenJobIds.addAll(jobs.map { it.id })
            return
        }
        val fresh = jobs.filter { seenJobIds.add(it.id) }
        fresh.filter { it.status == "SCHEDULED" }.forEach { notifyJob(it) }
    }

    private fun socketPayload(raw: Any): JSONObject = when (raw) {
        is JSONObject -> raw
        is String -> JSONObject(raw)
        is Map<*, *> -> JSONObject(raw)
        else -> {
            val s = raw.toString()
            if (s.startsWith("{")) JSONObject(s) else throw IllegalArgumentException("Bad socket payload")
        }
    }

    private fun onSocketNewJob(args: Array<out Any>) {
        try {
            val raw = args.firstOrNull() ?: return
            val obj = socketPayload(raw)
            val id = obj.optString("id")
            if (id.isBlank()) return
            val isRebroadcast = obj.has("broadcastedAt") && !obj.isNull("broadcastedAt")
            val forceRing = obj.optBoolean("forceRing", false) ||
                obj.optString("forceRing") == "true"
            val scheduledAt = obj.optString("scheduledAt").ifBlank { null }
            if (!forceRing && scheduledAt != null && !Format.isToday(scheduledAt)) {
                Log.d(TAG, "Skipping ring for $id — not scheduled today")
                return
            }
            if (isRebroadcast) {
                val alert = parseAlertFromJson(obj)
                if (isSilenced(id) && !forceRing) {
                    // This rider passed/rejected — other branch drivers still ring.
                    return
                }
                seenJobIds.remove(id)
                unsilence(id)
                if (forceRing) {
                    if (alertEligible) forceRingNow(alert)
                } else {
                    enqueueRebroadcast(alert)
                }
                return
            }
            if (!seenJobIds.add(id)) return
            alertJob(parseAlertFromJson(obj))
        } catch (e: Exception) {
            Log.w(TAG, "Bad newDeliveryJob payload — falling back to poll", e)
            scope.launch {
                try {
                    pollJobs()
                } catch (_: Exception) {
                }
            }
        }
    }

    private fun notifyJob(job: JobSummary) {
        alertJob(RideAlert.fromJobSummary(job))
    }

    private fun onSocketJobAssigned(args: Array<out Any>) {
        try {
            val raw = args.firstOrNull() ?: return
            val obj = socketPayload(raw)
            val id = obj.optString("id").ifBlank { obj.optString("jobId") }
            if (id.isBlank()) return
            // Admin hand-picked this rider — ring if eligible, never silence.
            alertJob(parseAlertFromJson(obj))
        } catch (e: Exception) {
            Log.w(TAG, "Bad jobAssignedToDriver payload", e)
        }
    }

    private fun onSocketJobClaimed(args: Array<out Any>) {
        val raw = args.firstOrNull() ?: return
        val id = runCatching {
            val obj = socketPayload(raw)
            obj.optString("id").ifBlank { obj.optString("jobId") }
        }.getOrNull().orEmpty()
        if (id.isNotBlank()) silenceJob(id)
    }

    private fun onSocketOrderCancelled(args: Array<out Any>) {
        try {
            val obj = socketPayload(args.firstOrNull() ?: return)
            alertOrderCancelled(
                jobId = obj.optString("jobId"),
                orderId = obj.optString("orderId"),
                orderNumber = obj.optString("orderNumber"),
            )
        } catch (e: Exception) {
            Log.w(TAG, "Bad orderCancelled payload", e)
        }
    }

    /**
     * A stop on the active ride was cancelled. Dedicated descending cancel tone
     * plus a heads-up notification — never the looping / rising new-job alert, and
     * never gated by [alertEligible], since a mid-run rider is muted for new jobs
     * but must still hear this.
     */
    private fun alertOrderCancelled(jobId: String, orderId: String, orderNumber: String) {
        if (orderId.isBlank()) return
        // Socket and FCM both deliver this; only alert once per order.
        if (!alertedCancellations.add(orderId)) return
        if (alertedCancellations.size > 200) {
            alertedCancellations.clear()
            alertedCancellations.add(orderId)
        }

        enqueuePendingCancellation(
            CancelledOrderAlert(
                jobId = jobId,
                orderId = orderId,
                orderNumber = orderNumber,
            ),
        )
        BcNotifications.notifyOrderCancelled(this, orderId, orderNumber)
        BcNotifications.vibrateCancel(this)
        startCancelSound()
        if (jobId.isNotBlank()) JobRefreshBus.refresh(jobId)
    }

    private fun acknowledgeCancellationInternal(orderId: String) {
        acknowledgePendingCancellation(orderId)
        BcNotifications.cancelOrderCancelled(this, orderId)
    }

    private fun startCancelSound() {
        stopCancelSound()
        cancelPlayer = runCatching {
            MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(
                    this@DriverAlertService,
                    Uri.parse("android.resource://$packageName/${R.raw.order_cancelled_alert}"),
                )
                isLooping = false
                setOnCompletionListener { stopCancelSound() }
                prepare()
                start()
            }
        }.onFailure { Log.e(TAG, "Could not play cancellation tone", it) }.getOrNull()

        // Hard stop in case the clip is longer than a cancellation alert warrants.
        scope.launch {
            delay(CANCEL_TONE_MS)
            stopCancelSound()
        }
    }

    private fun stopCancelSound() {
        cancelPlayer?.runCatching {
            if (isPlaying) stop()
            release()
        }
        cancelPlayer = null
    }

    private fun alertJob(alert: RideAlert) {
        if (alert.jobId.isBlank()) return
        if (isSilenced(alert.jobId) || activeAlerts.containsKey(alert.jobId)) return
        if (!alertEligible) {
            // Local flag can be up to one poll cycle stale — verify against the
            // server before dropping the ring outright, instead of trusting it.
            scope.launch {
                val stillMuted = runCatching {
                    !container.authRepository.getMe().alertEligible
                }.getOrDefault(true)
                if (stillMuted) {
                    Log.d(TAG, "Skipping ring for ${alert.jobId} — driver not alert-eligible")
                } else {
                    alertEligible = true
                    ringForJob(alert)
                }
            }
            return
        }
        ringForJob(alert)
    }

    private fun ringForJob(alert: RideAlert) {
        if (isSilenced(alert.jobId) || activeAlerts.containsKey(alert.jobId)) return
        activeAlerts[alert.jobId] = alert
        publishActiveAlerts()
        maybeHydrateAlert(alert)
        promoteFrontIfNeeded()
    }

    private fun maybeHydrateAlert(alert: RideAlert) {
        val sparse = alert.orderCount <= 0 && alert.deliveryFee <= 0 && alert.orderPreviews.isEmpty()
        if (!sparse && alert.orderCount > 0 && alert.deliveryFee > 0) return
        scope.launch {
            try {
                val enriched = enrichAlert(alert) ?: return@launch
                if (!activeAlerts.containsKey(alert.jobId)) return@launch
                activeAlerts[alert.jobId] = enriched
                if (ringingJobId == alert.jobId) {
                    _ringingAlert.value = enriched
                }
                publishActiveAlerts()
            } catch (_: Exception) {
            }
        }
    }

    private suspend fun enrichAlert(alert: RideAlert): RideAlert? {
        val jobs = container.jobsRepository.listJobs()
        val summary = jobs.find { it.id == alert.jobId }
        if (summary != null) {
            return alert.mergeRicher(RideAlert.fromJobSummary(summary))
        }
        if (alert.orderCount <= 0 && alert.deliveryFee <= 0) {
            return try {
                val detail = container.jobsRepository.getJob(alert.jobId)
                alert.mergeRicher(RideAlert.fromJobDetail(detail))
            } catch (_: Exception) {
                null
            }
        }
        return null
    }

    /** Reject/admin rebroadcast of a job that may already be tracked. Enqueue, do not jump the queue. */
    private fun enqueueRebroadcast(alert: RideAlert) {
        if (alert.jobId.isBlank()) return
        activeAlerts[alert.jobId] = alert
        publishActiveAlerts()
        if (alertEligible) promoteFrontIfNeeded()
    }

    private fun beginPostRejectHoldInternal(jobId: String, storeId: String) {
        lastRejectedJobId = jobId.takeIf { it.isNotBlank() }
        lastRejectedStoreId = storeId.takeIf { it.isNotBlank() }
        pauseRingCycle()
        postRejectHoldJob?.cancel()
        postRejectHoldUntilElapsed = SystemClock.elapsedRealtime() + POST_REJECT_HOLD_MS
        _postRejectHoldActive.value = true
        publishActiveAlerts()
        postRejectHoldJob = scope.launch {
            delay(POST_REJECT_HOLD_MS)
            postRejectHoldUntilElapsed = 0L
            _postRejectHoldActive.value = false
            publishActiveAlerts()
            promoteFrontIfNeeded()
        }
    }

    private fun cancelPostRejectHoldInternal() {
        postRejectHoldJob?.cancel()
        postRejectHoldJob = null
        postRejectHoldUntilElapsed = 0L
        lastRejectedJobId = null
        lastRejectedStoreId = null
        _postRejectHoldActive.value = false
        publishActiveAlerts()
    }

    private fun isPostRejectHoldActive(): Boolean =
        SystemClock.elapsedRealtime() < postRejectHoldUntilElapsed

    private fun silenceJob(jobId: String) {
        markSilenced(jobId)
        activeAlerts.remove(jobId)
        publishActiveAlerts()
        BcNotifications.cancelJob(this, jobId)
        onAlertRemoved(jobId)
    }

    private fun clearSeenInternal(jobId: String) {
        seenJobIds.remove(jobId)
        unsilence(jobId)
        activeAlerts.remove(jobId)
        publishActiveAlerts()
        BcNotifications.cancelJob(this, jobId)
        onAlertRemoved(jobId)
    }

    /** Ring right now for this job, even if it's already tracked/mid quiet-gap. */
    private fun forceRingNow(alert: RideAlert) {
        activeAlerts[alert.jobId] = alert
        publishActiveAlerts()
        startRingCycle(alert)
    }

    private fun onAlertRemoved(jobId: String) {
        if (ringingJobId == jobId) {
            pauseRingCycle()
        }
        promoteFrontIfNeeded()
    }

    /** Ensure the next unclaimed job (if any) is the one actively ringing. */
    private fun promoteFrontIfNeeded() {
        if (isPostRejectHoldActive()) return
        val next = pickNextRideAlert(activeAlerts.values, lastRejectedJobId, lastRejectedStoreId)
        if (next == null) {
            pauseRingCycle()
            return
        }
        if (ringingJobId == next.jobId && ringCycleJob?.isActive == true) return
        startRingCycle(next)
    }

    /**
     * Ring ~30s, then arm an [AlarmManager] wake-up ~3min out and stop.
     * The gap is deliberately NOT an in-process delay() — this service can be
     * (and on some OEMs, will be) killed while idle with no wake lock held,
     * which would silently strand an in-memory timer. AlarmManager survives
     * that: it fires (and restarts this service via the PendingIntent) at the
     * scheduled time regardless of whether the process is still alive.
     */
    private fun startRingCycle(alert: RideAlert) {
        ringCycleJob?.cancel()
        ringingJobId = alert.jobId
        _ringingAlert.value = alert
        ringCycleJob = scope.launch {
            val current = activeAlerts[alert.jobId] ?: return@launch
            BcNotifications.notifyNewJob(this@DriverAlertService, current)
            IncomingRideLauncher.launch(this@DriverAlertService, current, skipIfAppInForeground = false)
            acquireRingWakeLock()
            startAlertSound()
            delay(RING_BURST_MS)
            stopAlertSound()
            releaseRingWakeLock()
            if (activeAlerts.containsKey(alert.jobId)) {
                scheduleNextRing(alert.jobId)
            }
        }
    }

    private fun scheduleNextRing(jobId: String) {
        val am = getSystemService(ALARM_SERVICE) as AlarmManager
        val triggerAt = SystemClock.elapsedRealtime() + RING_GAP_MS
        val pendingIntent = resumeRingPendingIntent()
        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        try {
            if (canExact) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not schedule re-ring alarm for $jobId", e)
        }
    }

    private fun cancelScheduledRing() {
        val am = getSystemService(ALARM_SERVICE) as AlarmManager
        am.cancel(resumeRingPendingIntent())
    }

    private fun resumeRingPendingIntent(): PendingIntent {
        val intent = Intent(this, DriverAlertService::class.java).apply {
            action = ACTION_RESUME_RING
        }
        return PendingIntent.getService(
            this,
            RESUME_RING_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun pauseRingCycle() {
        ringCycleJob?.cancel()
        ringCycleJob = null
        ringingJobId = null
        _ringingAlert.value = null
        stopAlertSound()
        releaseRingWakeLock()
        cancelScheduledRing()
    }

    private fun startAlertSound() {
        if (!alertEligible) return
        if (alertPlayer?.isPlaying == true) return
        stopAlertSound()
        alertPlayer = runCatching {
            MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(
                    this@DriverAlertService,
                    Uri.parse("android.resource://$packageName/${R.raw.new_job_alert}"),
                )
                isLooping = true
                prepare()
                start()
            }
        }.onFailure { Log.e(TAG, "Could not start looping job alert", it) }.getOrNull()
    }

    private fun stopAlertSound() {
        alertPlayer?.runCatching {
            if (isPlaying) stop()
            release()
        }
        alertPlayer = null
    }

    private fun acquireRingWakeLock() {
        if (ringWakeLock?.isHeld == true) return
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        ringWakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "bc:incoming_ride",
        ).apply {
            setReferenceCounted(false)
            acquire(60_000L)
        }
    }

    private fun releaseRingWakeLock() {
        ringWakeLock?.runCatching {
            if (isHeld) release()
        }
        ringWakeLock = null
    }

    private fun publishActiveAlerts() {
        val alerts = prioritizedRideAlerts(activeAlerts.values, lastRejectedJobId, lastRejectedStoreId)
        _activeAlertJobIds.value = alerts.map { it.jobId }.toSet()
        _activeAlerts.value = alerts
    }

    private fun isSilenced(jobId: String): Boolean =
        getSharedPreferences(ALERT_PREFS, MODE_PRIVATE).getStringSet(SILENCED_IDS, emptySet())
            ?.contains(jobId) == true

    private fun markSilenced(jobId: String) {
        val prefs = getSharedPreferences(ALERT_PREFS, MODE_PRIVATE)
        val ids = prefs.getStringSet(SILENCED_IDS, emptySet()).orEmpty().toMutableSet()
        ids += jobId
        if (ids.size > 500) ids.remove(ids.first())
        prefs.edit().putStringSet(SILENCED_IDS, ids).apply()
    }

    private fun unsilence(jobId: String) {
        val prefs = getSharedPreferences(ALERT_PREFS, MODE_PRIVATE)
        val ids = prefs.getStringSet(SILENCED_IDS, emptySet()).orEmpty().toMutableSet()
        if (!ids.remove(jobId)) return
        prefs.edit().putStringSet(SILENCED_IDS, ids).apply()
    }

    companion object {
        private const val TAG = "DriverAlertService"
        private const val POLL_INTERVAL_MS = 15_000L
        private const val RING_GAP_MS = 180_000L
        private const val POST_REJECT_HOLD_MS = 5_000L
        private const val CANCEL_TONE_MS = 3_000L
        private const val RESUME_RING_REQUEST_CODE = 7821
        private const val MAX_POLL_INTERVAL_MS = 60_000L
        private const val ALERT_PREFS = "bc_job_alerts"
        private const val SILENCED_IDS = "silenced_job_ids"

        const val ACTION_ALERT_JOB = "lk.bingchun.delivery.ALERT_JOB"
        const val ACTION_FORCE_RING = "lk.bingchun.delivery.FORCE_RING"
        const val ACTION_BEGIN_POST_REJECT_HOLD = "lk.bingchun.delivery.BEGIN_POST_REJECT_HOLD"
        const val ACTION_CANCEL_POST_REJECT_HOLD = "lk.bingchun.delivery.CANCEL_POST_REJECT_HOLD"
        const val ACTION_RESUME_RING = "lk.bingchun.delivery.RESUME_RING"
        const val ACTION_SILENCE_JOB = "lk.bingchun.delivery.SILENCE_JOB"
        const val ACTION_CLEAR_SEEN = "lk.bingchun.delivery.CLEAR_SEEN"
        const val ACTION_SET_ELIGIBLE = "lk.bingchun.delivery.SET_ELIGIBLE"
        const val ACTION_START_TRACKING = "lk.bingchun.delivery.START_TRACKING"
        const val ACTION_STOP_TRACKING = "lk.bingchun.delivery.STOP_TRACKING"
        const val ACTION_ORDER_CANCELLED = "lk.bingchun.delivery.ORDER_CANCELLED"
        const val ACTION_ACK_CANCELLED = "lk.bingchun.delivery.ACK_CANCELLED"
        const val EXTRA_JOB_ID = "jobId"
        const val EXTRA_ORDER_ID = "orderId"
        const val EXTRA_ORDER_NUMBER = "orderNumber"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val EXTRA_ALERT_ELIGIBLE = "alertEligible"
        const val EXTRA_RIDE_CODE = "rideCode"
        const val EXTRA_STORE_NAME = "storeName"
        const val EXTRA_STORE_ID = "storeId"
        const val EXTRA_ORDER_COUNT = "orderCount"
        const val EXTRA_TOTAL_CUPS = "totalCups"
        const val EXTRA_EST_KM = "estimatedDistanceKm"
        const val EXTRA_EST_MIN = "estimatedMinutes"
        const val EXTRA_DELIVERY_FEE = "deliveryFee"
        const val EXTRA_STORE_CITY = "storeCity"
        const val EXTRA_DROPOFF_NAME = "dropoffName"
        const val EXTRA_DROPOFF_ADDRESS = "dropoffAddress"
        const val EXTRA_EXTRA_STOP_COUNT = "extraStopCount"
        const val EXTRA_JOB_STATUS = "jobStatus"
        const val EXTRA_ORDER_PREVIEWS_JSON = "orderPreviewsJson"
        const val RING_DURATION_MS = 30_000L
        private const val RING_BURST_MS = RING_DURATION_MS

        private val _activeAlertJobIds = MutableStateFlow<Set<String>>(emptySet())
        val activeAlertJobIds = _activeAlertJobIds.asStateFlow()

        private val _activeAlerts = MutableStateFlow<List<RideAlert>>(emptyList())
        val activeAlerts = _activeAlerts.asStateFlow()

        private val _ringingAlert = MutableStateFlow<RideAlert?>(null)
        val ringingAlert = _ringingAlert.asStateFlow()

        private val _postRejectHoldActive = MutableStateFlow(false)
        val postRejectHoldActive = _postRejectHoldActive.asStateFlow()

        private val _pendingCancellations = MutableStateFlow<List<CancelledOrderAlert>>(emptyList())
        val pendingCancellations = _pendingCancellations.asStateFlow()

        private fun enqueuePendingCancellation(alert: CancelledOrderAlert) {
            val next = _pendingCancellations.value.toMutableList()
            if (next.any { it.orderId == alert.orderId }) return
            next += alert
            _pendingCancellations.value = next
        }

        private fun acknowledgePendingCancellation(orderId: String) {
            _pendingCancellations.value = _pendingCancellations.value.filterNot { it.orderId == orderId }
        }

        private fun clearPendingCancellations() {
            _pendingCancellations.value = emptyList()
        }

        @Volatile
        var stopRequested: Boolean = false
            private set

        fun start(context: Context) {
            stopRequested = false
            val intent = Intent(context, DriverAlertService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            stopRequested = true
            context.stopService(Intent(context, DriverAlertService::class.java))
        }

        fun alertJob(context: Context, alert: RideAlert) {
            val intent = Intent(context, DriverAlertService::class.java).apply {
                action = ACTION_ALERT_JOB
                putRideAlertExtras(this, alert)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        /** Manual admin re-ring — rings immediately even if the job is already tracked. */
        fun forceRing(context: Context, alert: RideAlert) {
            val intent = Intent(context, DriverAlertService::class.java).apply {
                action = ACTION_FORCE_RING
                putRideAlertExtras(this, alert)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun beginPostRejectHold(context: Context, jobId: String, storeId: String) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, DriverAlertService::class.java).apply {
                    action = ACTION_BEGIN_POST_REJECT_HOLD
                    putExtra(EXTRA_JOB_ID, jobId)
                    putExtra(EXTRA_STORE_ID, storeId)
                },
            )
        }

        fun cancelPostRejectHold(context: Context) {
            context.startService(
                Intent(context, DriverAlertService::class.java).apply {
                    action = ACTION_CANCEL_POST_REJECT_HOLD
                },
            )
        }

        fun alertJob(context: Context, jobId: String, title: String, body: String) {
            alertJob(context, RideAlert(jobId = jobId, title = title))
        }

        fun silenceJob(context: Context, jobId: String) {
            context.startService(Intent(context, DriverAlertService::class.java).apply {
                action = ACTION_SILENCE_JOB
                putExtra(EXTRA_JOB_ID, jobId)
            })
        }

        /** Pass on a pool offer — local mute only; other riders keep ringing. */
        fun passOnOffer(context: Context, alert: RideAlert) {
            beginPostRejectHold(context, alert.jobId, alert.storeId)
            silenceJob(context, alert.jobId)
        }

        fun clearSeen(context: Context, jobId: String) {
            val prefs = context.getSharedPreferences(ALERT_PREFS, Context.MODE_PRIVATE)
            val ids = prefs.getStringSet(SILENCED_IDS, emptySet()).orEmpty().toMutableSet()
            if (ids.remove(jobId)) {
                prefs.edit().putStringSet(SILENCED_IDS, ids).apply()
            }
            context.startService(Intent(context, DriverAlertService::class.java).apply {
                action = ACTION_CLEAR_SEEN
                putExtra(EXTRA_JOB_ID, jobId)
            })
        }

        fun setAlertEligible(context: Context, eligible: Boolean) {
            context.startService(Intent(context, DriverAlertService::class.java).apply {
                action = ACTION_SET_ELIGIBLE
                putExtra(EXTRA_ALERT_ELIGIBLE, eligible)
            })
        }

        fun startTracking(context: Context, jobId: String) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, DriverAlertService::class.java).apply {
                    action = ACTION_START_TRACKING
                    putExtra(EXTRA_JOB_ID, jobId)
                },
            )
        }

        fun stopTracking(context: Context) {
            context.startService(Intent(context, DriverAlertService::class.java).apply {
                action = ACTION_STOP_TRACKING
            })
        }

        /** Entry point for both the socket and FCM cancellation paths. */
        fun orderCancelled(context: Context, jobId: String, orderId: String, orderNumber: String) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, DriverAlertService::class.java).apply {
                    action = ACTION_ORDER_CANCELLED
                    putExtra(EXTRA_JOB_ID, jobId)
                    putExtra(EXTRA_ORDER_ID, orderId)
                    putExtra(EXTRA_ORDER_NUMBER, orderNumber)
                },
            )
        }

        fun acknowledgeCancellation(context: Context, orderId: String) {
            acknowledgePendingCancellation(orderId)
            context.startService(
                Intent(context, DriverAlertService::class.java).apply {
                    action = ACTION_ACK_CANCELLED
                    putExtra(EXTRA_ORDER_ID, orderId)
                },
            )
        }

        fun parseAlertFromJson(obj: JSONObject): RideAlert {
            val estKm = if (obj.has("estimatedDistanceKm") && !obj.isNull("estimatedDistanceKm")) {
                obj.optDouble("estimatedDistanceKm")
            } else {
                null
            }
            val estMin = if (obj.has("estimatedMinutes") && !obj.isNull("estimatedMinutes")) {
                obj.optInt("estimatedMinutes")
            } else {
                null
            }
            val preview = obj.optJSONArray("previewStops")
            val first = preview?.optJSONObject(0)
            val dropoffName = first?.optString("customerName").orEmpty()
            val dropoffAddress = if (first != null) {
                Format.shortAddress(
                    first.optString("addressLine"),
                    first.optString("city"),
                    first.optString("district"),
                )
            } else {
                ""
            }
            val orderCount = obj.optInt("orderCount", 0)
            val extraFromPreview = ((preview?.length() ?: 0) - 1).coerceAtLeast(0)
            val extraFromOrders = (orderCount - 1).coerceAtLeast(0)
            return RideAlert(
                jobId = obj.optString("id").ifBlank { obj.optString("jobId") },
                rideCode = obj.optString("rideCode").takeIf { it.isNotBlank() },
                title = obj.optString("title").ifBlank { "Delivery run" },
                storeId = obj.optString("storeId"),
                storeName = obj.optString("storeName"),
                storeCity = obj.optString("storeCity"),
                orderCount = orderCount,
                totalCups = obj.optInt("totalCups", 0),
                estimatedDistanceKm = estKm,
                estimatedMinutes = estMin,
                deliveryFee = RideAlert.resolveLkrInt(obj, "deliveryFee", "totalDeliveryFees"),
                dropoffName = dropoffName,
                dropoffAddress = dropoffAddress,
                extraStopCount = maxOf(extraFromPreview, extraFromOrders),
                orderPreviews = RideAlert.orderPreviewsFromJsonArray(obj.optJSONArray("orderPreviews")),
                jobStatus = obj.optString("status").takeIf { it.isNotBlank() },
            )
        }

        fun parseAlertFromIntent(intent: Intent): RideAlert? {
            val jobId = intent.getStringExtra(EXTRA_JOB_ID).orEmpty()
            if (jobId.isBlank()) return null
            val estKm = intent.getDoubleExtra(EXTRA_EST_KM, -1.0)
            val estMin = intent.getIntExtra(EXTRA_EST_MIN, -1)
            return RideAlert(
                jobId = jobId,
                rideCode = intent.getStringExtra(EXTRA_RIDE_CODE),
                title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "Delivery run" },
                storeId = intent.getStringExtra(EXTRA_STORE_ID).orEmpty(),
                storeName = intent.getStringExtra(EXTRA_STORE_NAME).orEmpty(),
                storeCity = intent.getStringExtra(EXTRA_STORE_CITY).orEmpty(),
                orderCount = intent.getIntExtra(EXTRA_ORDER_COUNT, 0),
                totalCups = intent.getIntExtra(EXTRA_TOTAL_CUPS, 0),
                estimatedDistanceKm = estKm.takeIf { it >= 0 },
                estimatedMinutes = estMin.takeIf { it >= 0 },
                deliveryFee = intent.getIntExtra(EXTRA_DELIVERY_FEE, 0),
                dropoffName = intent.getStringExtra(EXTRA_DROPOFF_NAME).orEmpty(),
                dropoffAddress = intent.getStringExtra(EXTRA_DROPOFF_ADDRESS).orEmpty(),
                extraStopCount = intent.getIntExtra(EXTRA_EXTRA_STOP_COUNT, 0),
                orderPreviews = orderPreviewsFromIntentJson(
                    intent.getStringExtra(EXTRA_ORDER_PREVIEWS_JSON),
                ),
                jobStatus = intent.getStringExtra(EXTRA_JOB_STATUS),
            )
        }

        private fun orderPreviewsFromIntentJson(raw: String?): List<RideOrderPreview> {
            if (raw.isNullOrBlank()) return emptyList()
            return runCatching {
                RideAlert.orderPreviewsFromJsonArray(JSONArray(raw))
            }.getOrDefault(emptyList())
        }

        private fun orderPreviewsToJson(previews: List<RideOrderPreview>): String {
            val arr = JSONArray()
            previews.forEach { p ->
                arr.put(
                    JSONObject()
                        .put("orderNumber", p.orderNumber)
                        .put("deliveryFee", p.deliveryFee),
                )
            }
            return arr.toString()
        }

        private fun putRideAlertExtras(intent: Intent, alert: RideAlert) {
            intent.putExtra(EXTRA_JOB_ID, alert.jobId)
            intent.putExtra(EXTRA_TITLE, alert.title)
            intent.putExtra(EXTRA_RIDE_CODE, alert.rideCode)
            intent.putExtra(EXTRA_STORE_ID, alert.storeId)
            intent.putExtra(EXTRA_STORE_NAME, alert.storeName)
            intent.putExtra(EXTRA_STORE_CITY, alert.storeCity)
            intent.putExtra(EXTRA_ORDER_COUNT, alert.orderCount)
            intent.putExtra(EXTRA_TOTAL_CUPS, alert.totalCups)
            intent.putExtra(EXTRA_EST_KM, alert.estimatedDistanceKm ?: -1.0)
            intent.putExtra(EXTRA_EST_MIN, alert.estimatedMinutes ?: -1)
            intent.putExtra(EXTRA_DELIVERY_FEE, alert.deliveryFee)
            intent.putExtra(EXTRA_DROPOFF_NAME, alert.dropoffName)
            intent.putExtra(EXTRA_DROPOFF_ADDRESS, alert.dropoffAddress)
            intent.putExtra(EXTRA_EXTRA_STOP_COUNT, alert.extraStopCount)
            intent.putExtra(EXTRA_JOB_STATUS, alert.jobStatus)
            intent.putExtra(EXTRA_ORDER_PREVIEWS_JSON, orderPreviewsToJson(alert.orderPreviews))
        }
    }
}
