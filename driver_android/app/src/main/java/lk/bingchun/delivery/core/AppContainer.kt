package lk.bingchun.delivery.core

import android.content.Context
import lk.bingchun.delivery.BuildConfig
import lk.bingchun.delivery.data.local.SecureStore
import lk.bingchun.delivery.data.network.ApiClients
import lk.bingchun.delivery.data.repository.AuthRepository
import lk.bingchun.delivery.data.repository.JobsRepository
import lk.bingchun.delivery.data.repository.RouteRepository
import lk.bingchun.delivery.tracking.DeliverySocket
import lk.bingchun.delivery.tracking.LocationTracker

/**
 * Manual dependency container (lightweight alternative to Hilt).
 * Created once in [lk.bingchun.delivery.BingChunApp] and shared across the app.
 */
class AppContainer(context: Context) {
    val appContext: Context = context.applicationContext

    val sessionInvalidator = SessionInvalidator()
    val secureStore: SecureStore by lazy { SecureStore(appContext) }
    val apiClients: ApiClients by lazy { ApiClients(appContext, secureStore, BuildConfig.DEBUG, sessionInvalidator) }

    val authRepository: AuthRepository by lazy { AuthRepository(apiClients, secureStore) }
    val jobsRepository: JobsRepository by lazy { JobsRepository(apiClients) }
    val routeRepository: RouteRepository by lazy { RouteRepository(apiClients) }

    val deliverySocket: DeliverySocket by lazy { DeliverySocket(secureStore, sessionInvalidator) }
    val locationTracker: LocationTracker by lazy {
        LocationTracker(appContext, apiClients, deliverySocket)
    }
    val deviceRequirements: DeviceRequirements by lazy {
        DeviceRequirements(appContext).also { it.start() }
    }

    /**
     * Persist new API hosts and rebuild Retrofit + disconnect any live socket
     * so the next login/request uses the new base URLs.
     */
    fun applyServerUrls(coreUrl: String, deliveryUrl: String, storeId: String?) {
        RuntimeConfig.coreApiBaseUrl = coreUrl
        RuntimeConfig.deliveryApiBaseUrl = deliveryUrl
        RuntimeConfig.storeId = storeId
        deliverySocket.disconnect()
        apiClients.rebuild()
    }

    fun resetServerUrlsToDefaults() {
        RuntimeConfig.resetToBuildDefaults()
        deliverySocket.disconnect()
        apiClients.rebuild()
    }
}
