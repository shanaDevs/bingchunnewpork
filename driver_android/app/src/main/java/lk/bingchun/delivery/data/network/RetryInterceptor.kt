package lk.bingchun.delivery.data.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * Retries transient network failures with exponential backoff.
 *
 * - IOExceptions (request never reached the server) are retried for every method — safe, since
 *   no response was ever received and no side effect could have been applied.
 * - 502/503/504 responses are retried only for GET requests. POST/PATCH (claim job, duty toggle,
 *   order status update) are left alone on a server-error response since the server may have
 *   partially applied the change — the existing error banner + manual retry is safer there.
 */
class RetryInterceptor(private val context: Context) : Interceptor {

    private companion object {
        const val MAX_ATTEMPTS = 3
        const val MAX_TOTAL_DELAY_MS = 5_000L
        val BACKOFF_MS = longArrayOf(500L, 1_000L, 2_000L)
        val RETRYABLE_STATUS = setOf(502, 503, 504)
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var totalDelayMs = 0L
        var attempt = 0

        while (true) {
            val isLastAttempt = attempt >= MAX_ATTEMPTS - 1
            var response: Response? = null
            var thrown: IOException? = null
            try {
                response = chain.proceed(request)
            } catch (e: IOException) {
                thrown = e
            }

            if (thrown == null) {
                val shouldRetry = !isLastAttempt &&
                    request.method == "GET" &&
                    response!!.code in RETRYABLE_STATUS
                if (!shouldRetry) return response!!
                response.close()
            } else if (isLastAttempt) {
                throw thrown
            }

            val delayMs = BACKOFF_MS.getOrElse(attempt) { BACKOFF_MS.last() }
            if (totalDelayMs + delayMs > MAX_TOTAL_DELAY_MS || !isOnline()) {
                if (thrown != null) throw thrown
                return response!!
            }
            Thread.sleep(delayMs)
            totalDelayMs += delayMs
            attempt++
        }
    }

    private fun isOnline(): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (_: Exception) {
            true
        }
    }
}
