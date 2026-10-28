package lk.bingchun.delivery.data.repository

import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.data.model.DeliveryRoute
import lk.bingchun.delivery.data.model.JobHistoryItem
import lk.bingchun.delivery.data.model.JobOrder
import lk.bingchun.delivery.data.model.JobSummary
import lk.bingchun.delivery.data.model.OrderStatusUpdateRequest
import lk.bingchun.delivery.data.model.RiderRatingsResponse
import lk.bingchun.delivery.data.model.RiderStats
import lk.bingchun.delivery.data.model.toFallbackRoute
import lk.bingchun.delivery.data.network.ApiClients
import lk.bingchun.delivery.data.network.JobRejectRequest
import lk.bingchun.delivery.data.network.apiCall
import lk.bingchun.delivery.data.network.apiCallNullable

/** Port of mobile/lib/features/jobs/data/jobs_repository.dart */
class JobsRepository(private val clients: ApiClients) {

    suspend fun listJobs(): List<JobSummary> =
        apiCall(clients.moshi) { clients.core.listJobs() }

    suspend fun getActiveJob(): DeliveryJobDetail? =
        apiCallNullable(clients.moshi) { clients.core.getActiveJob() }

    suspend fun listJobHistory(): List<JobHistoryItem> =
        apiCall(clients.moshi) { clients.core.listJobHistory() }

    suspend fun getMyStats(period: String): RiderStats =
        apiCall(clients.moshi) { clients.core.getMyStats(period) }

    suspend fun getMyRatings(): RiderRatingsResponse =
        apiCall(clients.moshi) { clients.core.getMyRatings() }

    suspend fun getJob(id: String): DeliveryJobDetail =
        apiCall(clients.moshi) { clients.core.getJob(id) }

    suspend fun assignJob(id: String): DeliveryJobDetail =
        apiCall(clients.moshi) { clients.core.assignJob(id) }

    suspend fun claimJob(id: String): DeliveryJobDetail =
        apiCall(clients.moshi) { clients.core.claimJob(id) }

    /** Declines an assigned job so dispatch can hand it to another driver. */
    suspend fun rejectJob(id: String, reason: String) {
        apiCallNullable(clients.moshi) { clients.core.rejectJob(id, JobRejectRequest(reason)) }
    }

    /** Confirms the driver collected the parcels at the branch — geofenced to the branch. */
    suspend fun pickupJob(id: String, lat: Double, lng: Double): DeliveryJobDetail =
        apiCall(clients.moshi) {
            clients.core.pickupJob(id, lk.bingchun.delivery.data.network.PickupJobRequest(lat = lat, lng = lng))
        }

    suspend fun startJob(id: String): DeliveryJobDetail =
        apiCall(clients.moshi) { clients.core.startJob(id) }

    suspend fun completeJob(id: String, lat: Double, lng: Double): DeliveryJobDetail =
        apiCall(clients.moshi) {
            clients.core.completeJob(id, lk.bingchun.delivery.data.network.CompleteJobRequest(lat = lat, lng = lng))
        }

    suspend fun getJobRoute(id: String, fallbackJob: DeliveryJobDetail? = null): DeliveryRoute =
        try {
            apiCall(clients.moshi) { clients.core.getJobRoute(id) }
        } catch (_: Exception) {
            val job = fallbackJob ?: getJob(id)
            job.toFallbackRoute()
        }

    suspend fun getOrder(orderId: String): JobOrder =
        apiCall(clients.moshi) { clients.core.getOrder(orderId) }

    /** Issues a new customer delivery code and sends it to the customer. */
    suspend fun resendOrderOtp(orderId: String) {
        apiCallNullable(clients.moshi) { clients.core.resendOrderOtp(orderId) }
    }

    suspend fun updateOrderStatus(
        orderId: String,
        status: String,
        note: String? = null,
        otp: String? = null,
        outcome: String? = null,
    ): JobOrder = apiCall(clients.moshi) {
        clients.core.updateOrderStatus(
            orderId,
            OrderStatusUpdateRequest(status = status, note = note, otp = otp, outcome = outcome),
        )
    }

    suspend fun createComplaint(orderId: String, category: String, description: String) {
        apiCallNullable(clients.moshi) {
            clients.core.createComplaint(
                lk.bingchun.delivery.data.network.ComplaintRequest(orderId, category, description),
            )
        }
    }

    /** Reports the driver's vehicle has broken down mid-ride so admin can send a replacement rider. */
    suspend fun reportVehicleFailure(lat: Double, lng: Double, note: String? = null) {
        apiCallNullable(clients.moshi) {
            clients.core.reportVehicleFailure(
                lk.bingchun.delivery.data.network.VehicleFailureRequest(lat = lat, lng = lng, note = note),
            )
        }
    }
}
