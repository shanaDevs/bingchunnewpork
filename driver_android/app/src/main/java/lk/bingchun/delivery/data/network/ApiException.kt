package lk.bingchun.delivery.data.network

/** Port of mobile/lib/core/network/api_exception.dart */
class ApiException(
    override val message: String,
    val status: Int = 0,
    val code: String? = null,
    val data: Any? = null,
) : Exception(message) {
    val isOtpRequired: Boolean
        get() = code == "OTP_REQUIRED" ||
            code == "OTP_INVALID" ||
            message.contains("OTP", ignoreCase = true) && message.contains("required", ignoreCase = true) ||
            message.contains("Incorrect OTP", ignoreCase = true)
    val isMultipleBranches: Boolean
        get() = status == 409 && (code == "MULTIPLE_BRANCHES" || message.contains("multiple branches", ignoreCase = true))
}
