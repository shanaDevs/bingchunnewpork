package lk.bingchun.delivery.data.model

import com.squareup.moshi.JsonClass

/** A single duty on/off period. [endedAt] is null while the driver is still on duty. */
@JsonClass(generateAdapter = true)
data class DriverShiftEntry(
    val id: String,
    val storeId: String,
    val startedAt: String,
    val endedAt: String? = null,
    val durationMinutes: Int = 0,
)
