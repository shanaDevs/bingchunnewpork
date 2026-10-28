package lk.bingchun.delivery.data.network

import com.squareup.moshi.JsonClass

/**
 * Standard backend response envelope: { success, data, message, code }.
 * Port of the unwrap logic in mobile/lib/core/network/dio_client.dart.
 */
@JsonClass(generateAdapter = true)
data class ApiEnvelope<T>(
    val success: Boolean = true,
    val data: T? = null,
    val message: String? = null,
    val code: String? = null,
) {
    /** Returns [data] or throws [ApiException] when the call was not successful. */
    fun unwrap(): T {
        if (!success) throw ApiException(message ?: "Request failed", code = code)
        @Suppress("UNCHECKED_CAST")
        return data as T
    }

    /** Like [unwrap] but tolerates a null data payload (e.g. GET active job → null). */
    fun unwrapNullable(): T? {
        if (!success) throw ApiException(message ?: "Request failed", code = code)
        return data
    }
}
