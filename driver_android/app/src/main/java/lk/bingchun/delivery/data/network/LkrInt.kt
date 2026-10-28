package lk.bingchun.delivery.data.network

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonQualifier
import com.squareup.moshi.ToJson

/** Whole LKR amounts from the API may be JSON numbers or decimal strings (e.g. `"350"`). */
@Retention(AnnotationRetention.RUNTIME)
@JsonQualifier
annotation class LkrInt

class LkrIntAdapter {
    @FromJson
    @LkrInt
    fun fromJson(value: Any?): Int = when (value) {
        null -> 0
        is Number -> value.toInt()
        is String -> value.trim().substringBefore('.').toIntOrNull() ?: 0
        else -> 0
    }

    @ToJson
    fun toJson(@LkrInt value: Int): Int = value
}
