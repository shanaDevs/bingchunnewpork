package lk.bingchun.delivery.core

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * App-wide "this job changed" signal.
 *
 * ViewModels are scoped per nav destination, so a screen sitting in the back stack
 * (dashboard, job detail) cannot see an update made on top of it. Screens subscribe
 * here and force-reload when the job they show is emitted.
 */
object JobRefreshBus {
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val events: SharedFlow<String> = _events.asSharedFlow()

    private val _droppedRides = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val droppedRides: SharedFlow<String> = _droppedRides.asSharedFlow()

    fun refresh(jobId: String) {
        if (jobId.isNotBlank()) _events.tryEmit(jobId)
    }

    fun dropRide(jobId: String) {
        if (jobId.isNotBlank()) _droppedRides.tryEmit(jobId)
    }
}
