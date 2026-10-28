package lk.bingchun.delivery.data.network

import android.content.Context
import com.squareup.moshi.Moshi
import lk.bingchun.delivery.core.AppConfig
import lk.bingchun.delivery.core.SessionInvalidator
import lk.bingchun.delivery.data.local.SecureStore
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Builds the shared Moshi/OkHttp/Retrofit stack for the core + delivery hosts.
 * Call [rebuild] after [lk.bingchun.delivery.core.RuntimeConfig] URLs change.
 */
class ApiClients(
    context: Context,
    private val store: SecureStore,
    private val debug: Boolean,
    invalidator: SessionInvalidator,
) {

    private val appContext = context.applicationContext

    val moshi: Moshi = Moshi.Builder()
        .add(LkrIntAdapter())
        .build()

    private val okHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .addInterceptor(AuthInterceptor(store))
        .addInterceptor(SessionInterceptor(store, invalidator, moshi))
        .addInterceptor(RetryInterceptor(appContext))
        .apply {
            if (debug) {
                addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
            }
        }
        .build()

    private val converter = MoshiConverterFactory.create(moshi)

    @Volatile
    private var coreApi: CoreApi = buildCore()

    @Volatile
    private var deliveryApi: DeliveryApi = buildDelivery()

    val core: CoreApi get() = coreApi
    val delivery: DeliveryApi get() = deliveryApi

    /** Shared OkHttp for external calls (OSRM). */
    val rawOkHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .addInterceptor(RetryInterceptor(appContext))
        .build()

    /** Rebuild Retrofit clients so they pick up new [AppConfig] base URLs. */
    fun rebuild() {
        coreApi = buildCore()
        deliveryApi = buildDelivery()
    }

    private fun buildCore(): CoreApi = Retrofit.Builder()
        .baseUrl(AppConfig.coreApiBaseUrl)
        .client(okHttp)
        .addConverterFactory(converter)
        .build()
        .create(CoreApi::class.java)

    private fun buildDelivery(): DeliveryApi = Retrofit.Builder()
        .baseUrl(AppConfig.deliveryApiBaseUrl)
        .client(okHttp)
        .addConverterFactory(converter)
        .build()
        .create(DeliveryApi::class.java)
}

/**
 * Runs a Retrofit suspend call and maps failures to [ApiException] the same way
 * dio_client.dart's _mapDioError does: HTTP errors surface the payload message/code,
 * network errors surface a "cannot reach server" message.
 */
suspend fun <T> apiCall(
    moshi: Moshi,
    block: suspend () -> ApiEnvelope<T>,
): T = runEnvelope(moshi, block).unwrap()

suspend fun <T> apiCallNullable(
    moshi: Moshi,
    block: suspend () -> ApiEnvelope<T>,
): T? = runEnvelope(moshi, block).unwrapNullable()

private suspend fun <T> runEnvelope(
    moshi: Moshi,
    block: suspend () -> ApiEnvelope<T>,
): ApiEnvelope<T> {
    try {
        return block()
    } catch (e: HttpException) {
        throw mapHttpException(moshi, e)
    } catch (e: ApiException) {
        throw e
    } catch (e: IOException) {
        val detail = e.message?.takeIf { it.isNotBlank() }?.let { " ($it)" }.orEmpty()
        throw ApiException("Cannot reach server. Is the API running?$detail", status = 0)
    }
}

private fun mapHttpException(moshi: Moshi, e: HttpException): ApiException {
    val status = e.code()
    val errorBody = e.response()?.errorBody()?.string()
    if (!errorBody.isNullOrBlank()) {
        try {
            val adapter = moshi.adapter(ErrorPayload::class.java)
            val payload = adapter.fromJson(errorBody)
            if (payload != null) {
                return ApiException(
                    payload.message ?: "Request failed",
                    status = status,
                    code = payload.code,
                    data = payload.data,
                )
            }
        } catch (_: Exception) {
            // fall through
        }
    }
    return ApiException("Request failed", status = status)
}

@com.squareup.moshi.JsonClass(generateAdapter = true)
data class ErrorPayload(
    val success: Boolean = false,
    val message: String? = null,
    val code: String? = null,
    val data: ErrorData? = null,
)

@com.squareup.moshi.JsonClass(generateAdapter = true)
data class ErrorData(
    val branches: List<lk.bingchun.delivery.data.model.BranchOption>? = null,
)
