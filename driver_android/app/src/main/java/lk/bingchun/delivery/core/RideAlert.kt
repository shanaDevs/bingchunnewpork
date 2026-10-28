package lk.bingchun.delivery.core

import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.data.model.JobOrderPreview
import lk.bingchun.delivery.data.model.JobSummary

/** Per-order glance on the incoming ring UI (no customer PII). */
data class RideOrderPreview(
    val orderNumber: String,
    val deliveryFee: Int = 0,
)

/**
 * Rich ride alert payload shared by FCM, socket, and the full-screen incoming UI.
 */
data class RideAlert(
    val jobId: String,
    val rideCode: String? = null,
    val title: String = "Delivery run",
    val storeId: String = "",
    val storeName: String = "",
    val storeCity: String = "",
    val orderCount: Int = 0,
    val totalCups: Int = 0,
    val estimatedDistanceKm: Double? = null,
    val estimatedMinutes: Int? = null,
    val deliveryFee: Int = 0,
    val dropoffName: String = "",
    val dropoffAddress: String = "",
    val extraStopCount: Int = 0,
    val orderPreviews: List<RideOrderPreview> = emptyList(),
    /** When set, ring reject may call the pre-pickup reject API (ASSIGNED / QUEUED). */
    val jobStatus: String? = null,
) {
    val canApiReject: Boolean
        get() = jobStatus == "ASSIGNED" || jobStatus == "QUEUED"

    val displayRideId: String
        get() = Format.displayRideId(rideCode, jobId)

    val notificationTitle: String
        get() = "NEW DELIVERY — tap to accept"

    val notificationBody: String
        get() = buildString {
            append("Ride ID: ").append(displayRideId)
            if (storeName.isNotBlank()) append("\nBranch: ").append(storeName)
            if (orderCount > 0) append("\nOrders: ").append(orderCount)
            if (totalCups > 0) append("\nTotal Cups: ").append(totalCups)
            if (estimatedDistanceKm != null) {
                append("\nEstimated Distance: ").append(estimatedDistanceKm).append(" KM")
            }
            if (estimatedMinutes != null) {
                append("\nEstimated Time: ").append(estimatedMinutes).append(" Minutes")
            }
            if (deliveryFee > 0) append("\nDelivery Fee: Rs. ").append(deliveryFee)
        }

    val shortBody: String
        get() = buildString {
            append("Tap to accept · ").append(displayRideId)
            if (storeName.isNotBlank()) append(" · ").append(storeName)
            if (orderCount > 0) append(" · ").append(orderCount).append(if (orderCount == 1) " order" else " orders")
        }

    fun mergeRicher(other: RideAlert): RideAlert {
        if (other.jobId != jobId) return this
        return copy(
            rideCode = other.rideCode ?: rideCode,
            title = other.title.ifBlank { title },
            storeId = other.storeId.ifBlank { storeId },
            storeName = other.storeName.ifBlank { storeName },
            storeCity = other.storeCity.ifBlank { storeCity },
            orderCount = maxOf(orderCount, other.orderCount),
            totalCups = maxOf(totalCups, other.totalCups),
            estimatedDistanceKm = other.estimatedDistanceKm ?: estimatedDistanceKm,
            estimatedMinutes = other.estimatedMinutes ?: estimatedMinutes,
            deliveryFee = maxOf(deliveryFee, other.deliveryFee),
            dropoffName = other.dropoffName.ifBlank { dropoffName },
            dropoffAddress = other.dropoffAddress.ifBlank { dropoffAddress },
            extraStopCount = maxOf(extraStopCount, other.extraStopCount),
            orderPreviews = other.orderPreviews.ifEmpty { orderPreviews },
            jobStatus = other.jobStatus ?: jobStatus,
        )
    }

    companion object {
        fun fromJobSummary(job: JobSummary): RideAlert {
            val first = job.previewStops.firstOrNull()
            val previews = job.orderPreviews.map { RideOrderPreview(it.orderNumber, it.deliveryFee) }
                .ifEmpty {
                    emptyList()
                }
            return RideAlert(
                jobId = job.id,
                rideCode = job.rideCode,
                title = job.title,
                storeId = job.storeId,
                storeName = job.storeName,
                storeCity = job.storeCity,
                orderCount = job.orderCount,
                totalCups = job.totalCups,
                estimatedDistanceKm = job.estimatedDistanceKm,
                estimatedMinutes = job.estimatedMinutes,
                deliveryFee = job.totalDeliveryFees,
                dropoffName = first?.customerName.orEmpty(),
                dropoffAddress = first?.shortAddress.orEmpty(),
                extraStopCount = (job.orderCount - 1).coerceAtLeast(0),
                orderPreviews = previews,
                jobStatus = job.status,
            )
        }

        fun fromJobDetail(job: DeliveryJobDetail): RideAlert {
            val sorted = job.orders.sortedBy { it.sequence }
            return RideAlert(
                jobId = job.id,
                rideCode = job.rideCode,
                title = job.title,
                storeId = job.store.id,
                storeName = job.store.name,
                storeCity = job.store.city,
                orderCount = job.orderCount,
                totalCups = job.totalCups,
                estimatedDistanceKm = job.estimatedDistanceKm,
                estimatedMinutes = job.estimatedMinutes,
                deliveryFee = job.totalDeliveryFees,
                dropoffName = sorted.firstOrNull()?.customerName.orEmpty(),
                dropoffAddress = sorted.firstOrNull()?.shortAddress.orEmpty(),
                extraStopCount = (job.orderCount - 1).coerceAtLeast(0),
                orderPreviews = sorted.take(3).map { RideOrderPreview(it.orderNumber, it.deliveryFee) },
                jobStatus = job.status,
            )
        }

        fun orderPreviewsFromJsonArray(arr: org.json.JSONArray?): List<RideOrderPreview> {
            if (arr == null) return emptyList()
            return buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val num = o.optString("orderNumber")
                    if (num.isBlank()) continue
                    add(RideOrderPreview(num, resolveLkrInt(o, "deliveryFee", "totalDeliveryFees")))
                }
            }
        }

        fun resolveLkrInt(obj: org.json.JSONObject, vararg keys: String): Int {
            for (key in keys) {
                if (!obj.has(key) || obj.isNull(key)) continue
                val raw = obj.opt(key)
                when (raw) {
                    is Number -> return raw.toInt()
                    is String -> return raw.trim().substringBefore('.').toIntOrNull() ?: continue
                }
            }
            return 0
        }
    }
}
