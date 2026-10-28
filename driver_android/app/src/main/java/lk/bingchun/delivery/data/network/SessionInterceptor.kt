package lk.bingchun.delivery.data.network

import com.squareup.moshi.Moshi
import lk.bingchun.delivery.core.SessionInvalidator
import lk.bingchun.delivery.data.local.SecureStore
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/**
 * On authenticated 401s (not PIN login), tell [SessionInvalidator] so the
 * rider is signed out. Wrong-PIN 401s on login are ignored.
 */
class SessionInterceptor(
    private val store: SecureStore,
    private val invalidator: SessionInvalidator,
    private val moshi: Moshi,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)
        if (response.code != 401) return response
        if (isLoginRequest(request)) return response
        if (store.token.isNullOrEmpty()) return response

        val code = peekErrorCode(response)
        invalidator.notify(code ?: "UNAUTHORIZED")
        return response
    }

    private fun isLoginRequest(request: Request): Boolean {
        val path = request.url.encodedPath
        return path.endsWith("/auth/delivery/login")
    }

    private fun peekErrorCode(response: Response): String? {
        return try {
            val body = response.peekBody(8 * 1024).string()
            if (body.isBlank()) return null
            moshi.adapter(ErrorPayload::class.java).fromJson(body)?.code
        } catch (_: Exception) {
            null
        }
    }
}
