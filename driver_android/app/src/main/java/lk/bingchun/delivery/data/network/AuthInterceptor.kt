package lk.bingchun.delivery.data.network

import lk.bingchun.delivery.data.local.SecureStore
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds `Authorization: Bearer <token>` when the request doesn't already carry one.
 * Mirrors the Dio onRequest interceptor in dio_client.dart.
 */
class AuthInterceptor(private val store: SecureStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header("Authorization") != null) return chain.proceed(request)

        val token = store.token
        val newRequest = if (!token.isNullOrEmpty()) {
            request.newBuilder().addHeader("Authorization", "Bearer $token").build()
        } else {
            request
        }
        return chain.proceed(newRequest)
    }
}
