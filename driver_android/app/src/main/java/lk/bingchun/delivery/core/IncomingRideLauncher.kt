package lk.bingchun.delivery.core

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import lk.bingchun.delivery.IncomingRideActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * Launches the full-screen incoming ride card and builds shared intents for
 * notifications. Dedupes rapid duplicate socket/FCM/poll events.
 */
object IncomingRideLauncher {

    private const val TAG = "IncomingRideLauncher"
    private const val LAUNCH_DEBOUNCE_MS = 3_000L

    @Volatile
    private var lastLaunchedJobId: String? = null

    @Volatile
    private var lastLaunchedAtMs: Long = 0L

    /** Set while [IncomingRideActivity] is visible — overlay should stay hidden. */
    @Volatile
    var activityVisibleJobId: String? = null
        private set

    fun setActivityVisible(jobId: String?) {
        activityVisibleJobId = jobId
    }

    fun isAppInForeground(): Boolean =
        ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)

    fun buildIncomingRideIntent(
        context: Context,
        alert: RideAlert,
        accept: Boolean = false,
    ): Intent =
        Intent(context, IncomingRideActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            putExtra(IncomingRideActivity.EXTRA_JOB_ID, alert.jobId)
            putExtra(IncomingRideActivity.EXTRA_RIDE_CODE, alert.rideCode)
            putExtra(IncomingRideActivity.EXTRA_TITLE, alert.title)
            putExtra(IncomingRideActivity.EXTRA_STORE_NAME, alert.storeName)
            putExtra(IncomingRideActivity.EXTRA_STORE_ID, alert.storeId)
            putExtra(IncomingRideActivity.EXTRA_ORDER_COUNT, alert.orderCount)
            putExtra(IncomingRideActivity.EXTRA_TOTAL_CUPS, alert.totalCups)
            putExtra(IncomingRideActivity.EXTRA_EST_KM, alert.estimatedDistanceKm ?: -1.0)
            putExtra(IncomingRideActivity.EXTRA_EST_MIN, alert.estimatedMinutes ?: -1)
            putExtra(IncomingRideActivity.EXTRA_DELIVERY_FEE, alert.deliveryFee)
            putExtra(IncomingRideActivity.EXTRA_STORE_CITY, alert.storeCity)
            putExtra(IncomingRideActivity.EXTRA_DROPOFF_NAME, alert.dropoffName)
            putExtra(IncomingRideActivity.EXTRA_DROPOFF_ADDRESS, alert.dropoffAddress)
            putExtra(IncomingRideActivity.EXTRA_EXTRA_STOP_COUNT, alert.extraStopCount)
            putExtra(IncomingRideActivity.EXTRA_JOB_STATUS, alert.jobStatus)
            putExtra(
                IncomingRideActivity.EXTRA_ORDER_PREVIEWS_JSON,
                orderPreviewsJson(alert.orderPreviews),
            )
            if (accept) putExtra(IncomingRideActivity.EXTRA_AUTO_ACCEPT, true)
        }

    private fun orderPreviewsJson(previews: List<lk.bingchun.delivery.core.RideOrderPreview>): String {
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

    /**
     * @param skipIfAppInForeground when true, the in-app overlay handles the UI instead.
     */
    fun launch(
        context: Context,
        alert: RideAlert,
        accept: Boolean = false,
        skipIfAppInForeground: Boolean = false,
    ) {
        if (alert.jobId.isBlank()) return
        if (skipIfAppInForeground && isAppInForeground()) return
        if (activityVisibleJobId == alert.jobId) return

        val now = System.currentTimeMillis()
        if (lastLaunchedJobId == alert.jobId && now - lastLaunchedAtMs < LAUNCH_DEBOUNCE_MS) return

        lastLaunchedJobId = alert.jobId
        lastLaunchedAtMs = now

        runCatching {
            context.startActivity(buildIncomingRideIntent(context, alert, accept))
        }.onFailure {
            Log.w(TAG, "Could not launch incoming ride UI for ${alert.jobId}", it)
        }
    }
}
