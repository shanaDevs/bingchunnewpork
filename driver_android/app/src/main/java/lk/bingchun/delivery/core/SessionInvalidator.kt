package lk.bingchun.delivery.core

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Fan-out when the current rider JWT is no longer valid — another device
 * signed in ([SESSION_SUPERSEDED]) or the token was rejected with 401.
 */
class SessionInvalidator {
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val events: SharedFlow<String> = _events.asSharedFlow()

    fun notify(reason: String) {
        _events.tryEmit(reason)
    }

    companion object {
        const val SESSION_SUPERSEDED = "SESSION_SUPERSEDED"
    }
}
