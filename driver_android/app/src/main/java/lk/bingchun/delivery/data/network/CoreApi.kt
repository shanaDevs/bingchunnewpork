package lk.bingchun.delivery.data.network

import lk.bingchun.delivery.data.model.BranchOption
import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.data.model.DeliveryRoute
import lk.bingchun.delivery.data.model.DriverBranchRequest
import lk.bingchun.delivery.data.model.DriverProfile
import lk.bingchun.delivery.data.model.DriverShiftEntry
import lk.bingchun.delivery.data.model.DutyUpdateRequest
import lk.bingchun.delivery.data.model.DutyUpdateResponse
import lk.bingchun.delivery.data.model.JobHistoryItem
import lk.bingchun.delivery.data.model.JobOrder
import lk.bingchun.delivery.data.model.JobSummary
import lk.bingchun.delivery.data.model.LoginRequest
import lk.bingchun.delivery.data.model.LoginResponse
import lk.bingchun.delivery.data.model.OrderStatusUpdateRequest
import lk.bingchun.delivery.data.model.RiderRatingsResponse
import lk.bingchun.delivery.data.model.RiderStats
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Core backend delivery endpoints (base = AppConfig.coreApiBaseUrl, e.g. https://host/api/).
 * Every method returns the standard ApiEnvelope; repositories call unwrap().
 */
interface CoreApi {

    @POST("auth/delivery/login")
    suspend fun login(@Body body: LoginRequest): ApiEnvelope<LoginResponse>

    @GET("stores")
    suspend fun listStores(): ApiEnvelope<List<BranchOption>>

    @GET("delivery/me")
    suspend fun getMe(): ApiEnvelope<DriverProfile>

    @PATCH("delivery/me/duty")
    suspend fun updateDuty(@Body body: DutyUpdateRequest): ApiEnvelope<DutyUpdateResponse>

    @POST("delivery/me/complaints")
    suspend fun createComplaint(@Body body: ComplaintRequest): ApiEnvelope<Any?>

    @POST("delivery/me/branch-requests")
    suspend fun createBranchRequest(@Body body: BranchRequestBody): ApiEnvelope<Any?>

    @GET("delivery/me/branch-requests")
    suspend fun listBranchRequests(): ApiEnvelope<List<DriverBranchRequest>>

    /** Rider's own performance figures for the Stats tab. */
    @GET("delivery/me/stats")
    suspend fun getMyStats(@Query("period") period: String): ApiEnvelope<RiderStats>

    @GET("delivery/me/ratings")
    suspend fun getMyRatings(): ApiEnvelope<RiderRatingsResponse>

    @GET("delivery/me/shifts")
    suspend fun getMyShifts(): ApiEnvelope<List<DriverShiftEntry>>

    @GET("delivery/jobs")
    suspend fun listJobs(): ApiEnvelope<List<JobSummary>>

    @GET("delivery/jobs/active")
    suspend fun getActiveJob(): ApiEnvelope<DeliveryJobDetail>

    @GET("delivery/jobs/history")
    suspend fun listJobHistory(): ApiEnvelope<List<JobHistoryItem>>

    @GET("delivery/jobs/{id}")
    suspend fun getJob(@Path("id") id: String): ApiEnvelope<DeliveryJobDetail>

    @POST("delivery/jobs/{id}/assign")
    suspend fun assignJob(
        @Path("id") id: String,
        @Body body: Map<String, String> = emptyMap(),
    ): ApiEnvelope<DeliveryJobDetail>

    @POST("delivery/jobs/{id}/claim")
    suspend fun claimJob(
        @Path("id") id: String,
        @Body body: Map<String, String> = emptyMap(),
    ): ApiEnvelope<DeliveryJobDetail>

    @POST("delivery/jobs/{id}/reject")
    suspend fun rejectJob(
        @Path("id") id: String,
        @Body body: JobRejectRequest,
    ): ApiEnvelope<Any?>

    @POST("delivery/jobs/{id}/pickup")
    suspend fun pickupJob(
        @Path("id") id: String,
        @Body body: PickupJobRequest,
    ): ApiEnvelope<DeliveryJobDetail>

    @POST("delivery/jobs/{id}/start")
    suspend fun startJob(
        @Path("id") id: String,
        @Body body: Map<String, String> = emptyMap(),
    ): ApiEnvelope<DeliveryJobDetail>

    @POST("delivery/jobs/{id}/complete")
    suspend fun completeJob(
        @Path("id") id: String,
        @Body body: CompleteJobRequest,
    ): ApiEnvelope<DeliveryJobDetail>

    @GET("delivery/jobs/{id}/route")
    suspend fun getJobRoute(@Path("id") id: String): ApiEnvelope<DeliveryRoute>

    @GET("delivery/route")
    suspend fun getOptimizedRoute(): ApiEnvelope<DeliveryRoute>

    @GET("delivery/orders/{orderId}")
    suspend fun getOrder(@Path("orderId") orderId: String): ApiEnvelope<JobOrder>

    @POST("delivery/orders/{orderId}/otp/resend")
    suspend fun resendOrderOtp(
        @Path("orderId") orderId: String,
        @Body body: Map<String, String> = emptyMap(),
    ): ApiEnvelope<Any?>

    @PUT("delivery/orders/{orderId}/status")
    suspend fun updateOrderStatus(
        @Path("orderId") orderId: String,
        @Body body: OrderStatusUpdateRequest,
    ): ApiEnvelope<JobOrder>

    @POST("delivery/jobs/vehicle-failure")
    suspend fun reportVehicleFailure(@Body body: VehicleFailureRequest): ApiEnvelope<Any?>

    @POST("delivery/locations/batch")
    suspend fun postLocationBatch(@Body body: LocationBatchRequest): ApiEnvelope<Any?>

    @POST("delivery/me/fcm-token")
    suspend fun registerFcmToken(@Body body: FcmTokenRequest): ApiEnvelope<Any?>

    @HTTP(method = "DELETE", path = "delivery/me/fcm-token", hasBody = true)
    suspend fun unregisterFcmToken(@Body body: FcmTokenDeleteRequest): ApiEnvelope<Any?>
}

@JsonClass(generateAdapter = true)
data class JobRejectRequest(
    val reason: String,
)

@JsonClass(generateAdapter = true)
data class CompleteJobRequest(
    val lat: Double,
    val lng: Double,
)

/** Pickup is geofenced to the branch, same as completion. */
@JsonClass(generateAdapter = true)
data class PickupJobRequest(
    val lat: Double,
    val lng: Double,
)

@JsonClass(generateAdapter = true)
data class VehicleFailureRequest(
    val lat: Double,
    val lng: Double,
    val note: String? = null,
)

@JsonClass(generateAdapter = true)
data class ComplaintRequest(
    val orderId: String,
    val category: String,
    val description: String,
)

@JsonClass(generateAdapter = true)
data class BranchRequestBody(
    val type: String,
    val toStoreId: String,
    val reason: String? = null,
)

@JsonClass(generateAdapter = true)
data class FcmTokenRequest(
    val token: String,
    val deviceId: String? = null,
)

@JsonClass(generateAdapter = true)
data class FcmTokenDeleteRequest(
    val deviceId: String? = null,
)
