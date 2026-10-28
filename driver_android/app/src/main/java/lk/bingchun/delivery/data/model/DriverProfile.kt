package lk.bingchun.delivery.data.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class StoreRef(
    val id: String,
    val name: String,
    val city: String? = null,
)

@JsonClass(generateAdapter = true)
data class DriverProfile(
    val id: String,
    val name: String,
    val phone: String? = null,
    val nicNumber: String? = null,
    val vehicleNumber: String? = null,
    val profilePhotoUrl: String? = null,
    val licenseImageUrl: String? = null,
    val dutyStatus: String = "OFF_DUTY",
    val storeId: String? = null,
    val store: StoreRef? = null,
    val accessibleStores: List<StoreRef> = emptyList(),
    val meritPoints: Int? = null,
    val meritStatus: String? = null,
    val avgRating: Double? = null,
    val ratingCount: Int? = null,
    val vehicleType: String? = null,
    val vehicleColor: String? = null,
    val address: String? = null,
    val disabilities: String? = null,
    val licenseNumber: String? = null,
    val consecutiveSuccessfulDeliveries: Int = 0,
    /** True when new-ride alerts should ring (not actively delivering customers). */
    val alertEligible: Boolean = true,
    val activeRidePhase: String = "NONE",
    /** False once the driver already holds a run plus a queued-next job. */
    val canClaimMore: Boolean = true,
) {
    val isOnline: Boolean get() = dutyStatus == "ONLINE" || dutyStatus == "ON_DELIVERY"
}

@JsonClass(generateAdapter = true)
data class DutyUpdateRequest(val dutyStatus: String)

@JsonClass(generateAdapter = true)
data class DutyUpdateResponse(
    val id: String,
    val dutyStatus: String,
)

@JsonClass(generateAdapter = true)
data class BranchOption(
    val id: String,
    val name: String,
    val city: String? = null,
)

/** Rider's own add/change/remove-branch request (super-admin review). */
@JsonClass(generateAdapter = true)
data class DriverBranchRequest(
    val id: String,
    val type: String,
    val toStoreId: String,
    val toStoreName: String? = null,
    val fromStoreName: String? = null,
    val status: String = "PENDING",
    val reason: String? = null,
    val reviewNote: String? = null,
    val createdAt: String? = null,
)
