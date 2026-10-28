package lk.bingchun.delivery.data.repository

import lk.bingchun.delivery.core.AppConfig
import lk.bingchun.delivery.data.local.SecureStore
import lk.bingchun.delivery.data.model.BranchOption
import lk.bingchun.delivery.data.model.DriverBranchRequest
import lk.bingchun.delivery.data.model.DriverProfile
import lk.bingchun.delivery.data.model.DriverSession
import lk.bingchun.delivery.data.model.DriverShiftEntry
import lk.bingchun.delivery.data.model.DutyUpdateRequest
import lk.bingchun.delivery.data.model.LoginRequest
import lk.bingchun.delivery.data.network.ApiClients
import lk.bingchun.delivery.data.network.apiCall

/** Port of mobile/lib/features/auth/data/auth_repository.dart */
class AuthRepository(
    private val clients: ApiClients,
    private val store: SecureStore,
) {
    private val jsonAdapter = clients.moshi.adapter(DriverSession::class.java)

    suspend fun login(pin: String, storeId: String? = null): DriverSession {
        val branchId = storeId ?: AppConfig.storeId
        val response = apiCall(clients.moshi) {
            clients.core.login(LoginRequest(pin = pin, storeId = branchId?.takeIf { it.isNotBlank() }))
        }
        store.token = response.token
        store.driverJson = jsonAdapter.toJson(response.driver)
        return response.driver
    }

    suspend fun listStores(): List<BranchOption> =
        apiCall(clients.moshi) { clients.core.listStores() }

    suspend fun createBranchRequest(type: String, toStoreId: String, reason: String? = null) {
        apiCall(clients.moshi) {
            clients.core.createBranchRequest(
                lk.bingchun.delivery.data.network.BranchRequestBody(
                    type = type,
                    toStoreId = toStoreId,
                    reason = reason?.takeIf { it.isNotBlank() },
                ),
            )
        }
    }

    suspend fun listBranchRequests(): List<DriverBranchRequest> =
        apiCall(clients.moshi) { clients.core.listBranchRequests() }

    suspend fun getMe(): DriverProfile =
        apiCall(clients.moshi) { clients.core.getMe() }

    suspend fun getShiftHistory(): List<DriverShiftEntry> =
        apiCall(clients.moshi) { clients.core.getMyShifts() }

    suspend fun setDuty(dutyStatus: String): DriverProfile {
        apiCall(clients.moshi) {
            clients.core.updateDuty(DutyUpdateRequest(dutyStatus = dutyStatus))
        }
        return getMe()
    }

    /** Restores a persisted session; returns the driver only when a token is present. */
    fun restore(): DriverSession? {
        val token = store.token
        if (token.isNullOrEmpty()) return null
        val raw = store.driverJson ?: return null
        return try {
            jsonAdapter.fromJson(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun logout() = store.clear()
}
