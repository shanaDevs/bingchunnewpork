package lk.bingchun.delivery.core

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import lk.bingchun.delivery.MainActivity
import lk.bingchun.delivery.R

/**
 * System notification channels + builders for the driver app.
 *
 * Channel ids are versioned (_v1) because Android freezes a channel's sound and
 * importance at creation time — change the suffix if the tone or behaviour changes.
 */
object BcNotifications {

    // v2 is intentionally silent: DriverAlertService owns the looping alert
    // sound so it can continue until the rider explicitly silences that job.
    const val CHANNEL_NEW_JOB = "bc_new_job_v2"
    const val CHANNEL_DUTY = "bc_duty_v1"
    // Also silent: DriverAlertService plays a single short tone for cancellations so it
    // is clearly distinct from the looping new-job alert.
    const val CHANNEL_ORDER_CANCELLED = "bc_order_cancelled_v1"

    const val DUTY_NOTIFICATION_ID = 1001
    private const val NEW_JOB_BASE_ID = 2000
    private const val ORDER_CANCELLED_BASE_ID = 3000

    const val EXTRA_OPEN_TAB = "openTab"
    const val TAB_JOBS = "jobs"

    val CANCEL_VIBRATE_PATTERN = longArrayOf(0, 250, 150, 250)

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (nm.getNotificationChannel(CHANNEL_NEW_JOB) == null) {
            val channel = NotificationChannel(
                CHANNEL_NEW_JOB,
                "New delivery jobs",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Alerts that ring until the driver silences them"
                setSound(null, null)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 350, 200, 350, 200, 500)
                enableLights(true)
                setShowBadge(true)
            }
            nm.createNotificationChannel(channel)
        }

        if (nm.getNotificationChannel(CHANNEL_ORDER_CANCELLED) == null) {
            val channel = NotificationChannel(
                CHANNEL_ORDER_CANCELLED,
                "Cancelled orders",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Alerts when a stop on your active ride is cancelled"
                setSound(null, null)
                enableVibration(true)
                vibrationPattern = CANCEL_VIBRATE_PATTERN
                enableLights(true)
                setShowBadge(true)
            }
            nm.createNotificationChannel(channel)
        }

        if (nm.getNotificationChannel(CHANNEL_DUTY) == null) {
            val channel = NotificationChannel(
                CHANNEL_DUTY,
                "On duty status",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Shown while you are online and waiting for jobs"
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
            }
            nm.createNotificationChannel(channel)
        }
    }

    fun canUseFullScreenIntent(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return nm.canUseFullScreenIntent()
    }

    /** Ongoing notification that keeps the duty foreground service alive. */
    fun buildDutyNotification(context: Context, trackingActive: Boolean = false): Notification {
        ensureChannels(context)
        val text = if (trackingActive) {
            "Tracking active ride…"
        } else {
            "Waiting for delivery jobs…"
        }
        return NotificationCompat.Builder(context, CHANNEL_DUTY)
            .setSmallIcon(R.drawable.ic_stat_duty)
            .setContentTitle("On duty")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(openAppIntent(context))
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setShowWhen(false)
            .build()
    }

    /** Loud heads-up / full-screen alert for a new delivery ride. */
    fun notifyNewJob(context: Context, alert: RideAlert) {
        ensureChannels(context)
        val body = alert.notificationBody
        val acceptPending = incomingRidePendingIntent(context, alert, accept = true)
        val silencePending = silenceJobIntent(context, alert.jobId)
        val openPending = incomingRidePendingIntent(context, alert)

        val builder = NotificationCompat.Builder(context, CHANNEL_NEW_JOB)
            .setSmallIcon(R.drawable.ic_stat_duty)
            .setContentTitle(alert.notificationTitle)
            .setContentText(alert.shortBody)
            .setAutoCancel(false)
            .setOngoing(true)
            .setContentIntent(openPending)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOnlyAlertOnce(true)
            .setDefaults(0)
            .setDeleteIntent(silenceJobIntent(context, alert.jobId, requestCodeOffset = 0x5A5A))

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val caller = Person.Builder()
                .setName(alert.storeName.ifBlank { "New delivery ride" })
                .setImportant(true)
                .build()
            builder.setStyle(
                NotificationCompat.CallStyle.forIncomingCall(
                    caller,
                    silencePending,
                    acceptPending,
                ),
            )
        } else {
            builder
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .addAction(R.drawable.ic_stat_duty, "ACCEPT RIDE", acceptPending)
                .addAction(R.drawable.ic_stat_duty, "Reject", silencePending)
        }

        if (canUseFullScreenIntent(context)) {
            builder.setFullScreenIntent(openPending, true)
        }

        try {
            NotificationManagerCompat.from(context)
                .notify(newJobNotificationId(alert.jobId), builder.build())
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS denied — nothing we can do here.
        }
    }

    /** Backward-compatible overload used by older call sites. */
    fun notifyNewJob(context: Context, jobId: String, title: String, body: String) {
        notifyNewJob(
            context,
            RideAlert(jobId = jobId, title = title),
        )
    }

    fun cancelJob(context: Context, jobId: String) {
        NotificationManagerCompat.from(context).cancel(newJobNotificationId(jobId))
    }

    /** Heads-up alert when a stop on the rider's active ride is cancelled. */
    fun notifyOrderCancelled(context: Context, orderId: String, orderNumber: String) {
        ensureChannels(context)
        val label = orderNumber.ifBlank { "An order" }
        val builder = NotificationCompat.Builder(context, CHANNEL_ORDER_CANCELLED)
            .setSmallIcon(R.drawable.ic_stat_duty)
            .setContentTitle("Order cancelled")
            .setContentText("$label was cancelled — skip this stop.")
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("$label was cancelled by the customer. Do not deliver this stop; it has been marked Cancelled on your run."),
            )
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(context))
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(0)
            .setVibrate(CANCEL_VIBRATE_PATTERN)

        try {
            NotificationManagerCompat.from(context)
                .notify(orderCancelledNotificationId(orderId), builder.build())
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS denied — nothing we can do here.
        }
    }

    /**
     * Direct vibrator pulse for a cancelled stop. Notification-channel vibration
     * is suppressed while the ride screen is in the foreground; this is not gated
     * by the Me-screen haptics toggle.
     */
    fun vibrateCancel(context: Context) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val mgr = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                mgr?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            } ?: return
            if (!vibrator.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(CANCEL_VIBRATE_PATTERN, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(CANCEL_VIBRATE_PATTERN, -1)
            }
        } catch (_: Exception) {
        }
    }

    fun cancelOrderCancelled(context: Context, orderId: String) {
        NotificationManagerCompat.from(context).cancel(orderCancelledNotificationId(orderId))
    }

    private fun newJobNotificationId(jobId: String): Int =
        NEW_JOB_BASE_ID + (jobId.hashCode() and 0x7FFF)

    private fun orderCancelledNotificationId(orderId: String): Int =
        ORDER_CANCELLED_BASE_ID + (orderId.hashCode() and 0x7FFF)

    private fun silenceJobIntent(
        context: Context,
        jobId: String,
        requestCodeOffset: Int = 0,
    ): PendingIntent {
        val intent = Intent(context, DriverAlertService::class.java).apply {
            action = DriverAlertService.ACTION_SILENCE_JOB
            putExtra(DriverAlertService.EXTRA_JOB_ID, jobId)
        }
        return PendingIntent.getService(
            context,
            jobId.hashCode() + requestCodeOffset,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun incomingRidePendingIntent(
        context: Context,
        alert: RideAlert,
        accept: Boolean = false,
    ): PendingIntent {
        val intent = IncomingRideLauncher.buildIncomingRideIntent(context, alert, accept)
        return PendingIntent.getActivity(
            context,
            alert.jobId.hashCode() + if (accept) 1 else 0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun openAppIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_OPEN_TAB, TAB_JOBS)
        }
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
