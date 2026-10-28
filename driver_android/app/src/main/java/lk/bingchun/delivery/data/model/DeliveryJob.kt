package lk.bingchun.delivery.data.model

import com.squareup.moshi.JsonClass
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.data.network.LkrInt

/** Ports of mobile/lib/models/delivery_job.dart. Dates stay as ISO-8601 strings. */

@JsonClass(generateAdapter = true)
data class JobSummary(
    val id: String,
    val title: String,
    val status: String,
    val scheduledAt: String,
    val assignedAt: String? = null,
    val storeId: String = "",
    val storeName: String,
    val storeCity: String,
    val orderCount: Int,
    val isMine: Boolean = false,
    /** Sum of the delivery fees the driver earns for this run. */
    @param:LkrInt val totalDeliveryFees: Int = 0,
    val rideCode: String? = null,
    val totalCups: Int = 0,
    val estimatedDistanceKm: Double? = null,
    val estimatedMinutes: Int? = null,
    /** First 3 stops in visiting order — a glance-level preview, not the full route. */
    val previewStops: List<JobStopPreview> = emptyList(),
    val orderPreviews: List<JobOrderPreview> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class JobOrderPreview(
    val orderNumber: String,
    @param:LkrInt val deliveryFee: Int = 0,
)

@JsonClass(generateAdapter = true)
data class JobStopPreview(
    val customerName: String,
    val addressLine: String,
    val city: String,
    val district: String,
) {
    val shortAddress: String get() = Format.shortAddress(addressLine, city, district)
}

/** Completed — or claimed-but-unfinished — run in the driver's history list. */
@JsonClass(generateAdapter = true)
data class JobHistoryItem(
    val id: String,
    val title: String,
    val status: String,
    /** "COMPLETED", "VEHICLE_FAILURE", "ABANDONED", or "PARTIALLY_COMPLETED" — null falls back to [status]. */
    val displayStatus: String? = null,
    val scheduledAt: String,
    val completedAt: String? = null,
    val storeName: String,
    val storeCity: String,
    val orderCount: Int,
    val deliveredCount: Int,
    val deliveredTotal: Int = 0,
    val complaintCount: Int = 0,
    val rideCode: String? = null,
) {
    val isIncomplete: Boolean
        get() = displayStatus == "ABANDONED" ||
            displayStatus == "PARTIALLY_COMPLETED" ||
            displayStatus == "VEHICLE_FAILURE"
}

/** Driver-raised complaint on an order stop. */
@JsonClass(generateAdapter = true)
data class DriverComplaint(
    val id: String,
    val category: String,
    val description: String,
    val status: String,
    val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class JobStore(
    val id: String,
    val name: String,
    val addressLine: String,
    val city: String,
    val lat: Double,
    val lng: Double,
    val deliveryOtpRequired: Boolean = false,
    val completionRadiusM: Int = 100,
)

/** Set when this job's pickup point is NOT the outlet — e.g. a vehicle-failure
 *  redelivery, where the new rider must collect parcels from the stranded rider's
 *  breakdown spot instead of the branch. No geofence applies here (see [DeliveryJobDetail]). */
@JsonClass(generateAdapter = true)
data class JobPickup(
    val lat: Double,
    val lng: Double,
    val label: String,
)

@JsonClass(generateAdapter = true)
data class JobOrderItem(
    val productName: String,
    val quantity: Int,
    /** Omitted by the backend for drivers — order money stays hidden. */
    val totalPrice: Int? = null,
)

@JsonClass(generateAdapter = true)
data class JobOrder(
    val orderId: String,
    val orderNumber: String,
    val sequence: Int,
    val status: String,
    val paymentMethod: String,
    val paymentStatus: String,
    /** Omitted by the backend for drivers — order money stays hidden. */
    val total: Int? = null,
    @param:LkrInt val deliveryFee: Int = 0,
    val estimatedMinutes: Int,
    val notes: String? = null,
    val customerName: String,
    val customerPhone: String,
    val addressLine: String,
    val city: String,
    val district: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val items: List<JobOrderItem> = emptyList(),
    val deliveryFailed: Boolean = false,
    /** Store/global rule: driver must enter the customer code to mark delivered. */
    val deliveryOtpRequired: Boolean = false,
    val complaints: List<DriverComplaint> = emptyList(),
) {
    val fullAddress: String
        get() = Format.shortAddress(addressLine, city, district)

    /** Street + area only for compact cards. */
    val shortAddress: String
        get() = Format.shortAddress(addressLine, city, null)

    val isDelivered: Boolean get() = status == "DELIVERED"
    val isFailed: Boolean get() = deliveryFailed || status == "DELIVERY_FAILED"
    val isPending: Boolean get() = !isDelivered && status != "CANCELLED" && !isFailed
}

@JsonClass(generateAdapter = true)
data class DeliveryJobDetail(
    val id: String,
    val title: String,
    val status: String,
    val scheduledAt: String,
    val assignedAt: String? = null,
    val startedAt: String? = null,
    val returnStartedAt: String? = null,
    val completedAt: String? = null,
    val store: JobStore,
    /** Non-null when pickup must happen somewhere other than the outlet (e.g. a
     *  vehicle-failure breakdown spot). No geofence is enforced when this is set. */
    val pickup: JobPickup? = null,
    val orderCount: Int,
    val deliveredCount: Int,
    val orders: List<JobOrder> = emptyList(),
    /** Sum of the delivery fees the driver earns for this run. */
    @param:LkrInt val totalDeliveryFees: Int = 0,
    /** True after the driver confirmed collecting the order at the outlet. */
    val pickedUp: Boolean = false,
    val rideCode: String? = null,
    val totalCups: Int = 0,
    val estimatedDistanceKm: Double? = null,
    val estimatedMinutes: Int? = null,
    val actualDistanceKm: Double? = null,
    val canComplete: Boolean = false,
    /** False once the viewing driver already holds a run plus a queued-next job. */
    val canClaimMore: Boolean = true,
) {
    val canAssign: Boolean get() = status == "SCHEDULED" && canClaimMore
    val needsPickup: Boolean get() = status == "ASSIGNED" && !pickedUp
    val headingToStore: Boolean get() = needsPickup
    val canStart: Boolean get() = status == "ASSIGNED" && pickedUp
    /** Pre-pickup reject — matches API (ASSIGNED/QUEUED, not yet picked up). */
    val canReject: Boolean get() = (status == "ASSIGNED" || status == "QUEUED") && !pickedUp
    val isReturning: Boolean get() = status == "RETURNING"
    val isActive: Boolean
        get() = status == "ASSIGNED" || status == "QUEUED" || status == "IN_PROGRESS" || status == "RETURNING"

    /** Finished runs opened from Delivery History. Live and scheduled jobs stay operational. */
    val isHistorySnapshot: Boolean
        get() = status == "COMPLETED" ||
            status == "CANCELLED" ||
            status == "ABANDONED" ||
            status == "VEHICLE_FAILURE" ||
            status == "PARTIALLY_COMPLETED"
    val allDelivered: Boolean get() = deliveredCount == orderCount && orderCount > 0
    /** Server sets canComplete for RETURNING; client still requires geofence locally. */
    fun canCompleteAt(distanceM: Double?): Boolean {
        if (status != "RETURNING" || !allDelivered) return false
        if (distanceM == null) return false
        return distanceM <= store.completionRadiusM
    }
    /** Branch-radius check with no status requirement — used to gate pickup confirmation. */
    fun withinBranchAt(distanceM: Double?): Boolean =
        distanceM != null && distanceM <= store.completionRadiusM

    /** True when pickup happens somewhere other than the outlet (e.g. a vehicle-failure
     *  breakdown spot) — no geofence is enforced there; the admin already hand-picked
     *  this rider for this job. */
    val hasPickupOverride: Boolean get() = pickup != null
    val pickupNavLat: Double get() = pickup?.lat ?: store.lat
    val pickupNavLng: Double get() = pickup?.lng ?: store.lng
    val pickupPlaceName: String get() = pickup?.label ?: store.name
    /** Pickup leg is always unlocked when there's an override; otherwise the usual
     *  branch-radius geofence applies. */
    fun pickupUnlockedAt(distanceM: Double?): Boolean =
        hasPickupOverride || withinBranchAt(distanceM)
}

@JsonClass(generateAdapter = true)
data class OrderStatusUpdateRequest(
    val status: String,
    val note: String? = null,
    val otp: String? = null,
    val outcome: String? = null,
)

/** Structured failure reason sent with DELIVERY_FAILED alongside the free-text note. */
enum class DeliveryOutcome(val label: String, val apiValue: String) {
    CUSTOMER_UNREACHABLE("Customer not available", "CUSTOMER_UNREACHABLE"),
    WRONG_ADDRESS("Wrong / incomplete address", "WRONG_ADDRESS"),
    REFUSED("Customer refused delivery", "REFUSED"),
    PAYMENT_FAILED("Payment issue", "PAYMENT_FAILED"),
    OTHER("Driver error", "OTHER"),
}
