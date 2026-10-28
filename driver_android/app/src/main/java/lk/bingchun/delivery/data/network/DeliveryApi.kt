package lk.bingchun.delivery.data.network

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Delivery service endpoints (legacy / optional when DELIVERY_SERVICE_ENABLED=true).
 * GPS batch prefers core [CoreApi.postLocationBatch].
 */
interface DeliveryApi {

    @POST("locations/batch")
    suspend fun postLocationBatch(@Body body: LocationBatchRequest): ApiEnvelope<Any?>
}

@JsonClass(generateAdapter = true)
data class LocationBatchRequest(
    val jobId: String? = null,
    val points: List<LocationPointDto>,
)

/** Serializes preferred core field names; aliases kept for older servers. */
@JsonClass(generateAdapter = true)
data class LocationPointDto(
    val lat: Double,
    val lng: Double,
    val heading: Double? = null,
    @Json(name = "speedKph") val speedKph: Double? = null,
    @Json(name = "recordedAt") val recordedAt: String,
    val jobId: String? = null,
)
