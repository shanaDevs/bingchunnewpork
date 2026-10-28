package lk.bingchun.delivery.core

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import lk.bingchun.delivery.BingChunApp

/**
 * FCM data-message handler. Backend sends data-only NEW_JOB and ORDER_CANCELLED pushes
 * so this always runs client-side alert logic (notification + alarm/tone).
 */
class BcMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        when (data["type"]) {
            "NEW_JOB" -> {
                val jobId = data["jobId"] ?: return
                val previewsJson = data["orderPreviewsJson"]
                val alert = RideAlert(
                    jobId = jobId,
                    rideCode = data["rideCode"],
                    title = data["title"].orEmpty().ifBlank { "Delivery run" },
                    storeId = data["storeId"].orEmpty(),
                    storeName = data["storeName"].orEmpty(),
                    storeCity = data["storeCity"].orEmpty(),
                    orderCount = data["orderCount"]?.toIntOrNull() ?: 0,
                    totalCups = data["totalCups"]?.toIntOrNull() ?: 0,
                    estimatedDistanceKm = data["estimatedDistanceKm"]?.toDoubleOrNull(),
                    estimatedMinutes = data["estimatedMinutes"]?.toIntOrNull(),
                    deliveryFee = data["deliveryFee"]?.toIntOrNull() ?: 0,
                    dropoffName = data["dropoffName"].orEmpty(),
                    dropoffAddress = data["dropoffAddress"].orEmpty(),
                    extraStopCount = data["extraStopCount"]?.toIntOrNull() ?: 0,
                    orderPreviews = previewsJson?.let {
                        runCatching {
                            RideAlert.orderPreviewsFromJsonArray(org.json.JSONArray(it))
                        }.getOrDefault(emptyList())
                    } ?: emptyList(),
                )
                if (data["forceRing"] == "true") {
                    // Manual admin re-ring — ring immediately even if this job
                    // is already tracked (e.g. mid quiet-gap in its own cycle).
                    DriverAlertService.forceRing(this, alert)
                } else {
                    DriverAlertService.alertJob(this, alert)
                }
            }
            "ORDER_CANCELLED" -> {
                val orderId = data["orderId"] ?: return
                DriverAlertService.orderCancelled(
                    this,
                    jobId = data["jobId"].orEmpty(),
                    orderId = orderId,
                    orderNumber = data["orderNumber"].orEmpty(),
                )
            }
            else -> {
                message.notification?.let { n ->
                    DriverAlertService.alertJob(
                        this,
                        RideAlert(
                            jobId = message.messageId ?: "push",
                            title = n.title ?: "Bing Chun",
                        ),
                    )
                }
            }
        }
    }

    override fun onNewToken(token: String) {
        PushTokens.sendToken((application as BingChunApp).container, token)
    }
}
