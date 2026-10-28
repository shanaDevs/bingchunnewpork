package lk.bingchun.delivery.data.model

import com.squareup.moshi.JsonClass

/** Port of mobile/lib/models/driver_session.dart */
@JsonClass(generateAdapter = true)
data class DriverSession(
    val id: String,
    val name: String,
    val role: String,
    val storeId: String? = null,
    val storeName: String? = null,
    val storeCity: String? = null,
)

/** Response body of POST /auth/delivery/login (the unwrapped `data`). */
@JsonClass(generateAdapter = true)
data class LoginResponse(
    val token: String,
    val driver: DriverSession,
)

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val pin: String,
    val storeId: String? = null,
)
