package lk.bingchun.delivery.core

/** A stop on the rider's held ride was cancelled and needs an in-app takeover. */
data class CancelledOrderAlert(
    val jobId: String,
    val orderId: String,
    val orderNumber: String,
) {
    val displayNumber: String
        get() = orderNumber.ifBlank { "An order" }
}
