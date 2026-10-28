package lk.bingchun.delivery.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import lk.bingchun.delivery.core.AppContainer
import lk.bingchun.delivery.core.DriverAlertService
import lk.bingchun.delivery.core.JobRefreshBus
import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.data.model.DeliveryRoute
import lk.bingchun.delivery.data.model.DriverProfile
import lk.bingchun.delivery.data.model.JobHistoryItem
import lk.bingchun.delivery.data.model.JobOrder
import lk.bingchun.delivery.data.model.JobSummary
import lk.bingchun.delivery.data.network.ApiException
import lk.bingchun.delivery.tracking.DriverFix
import org.json.JSONObject

/**
 * Branch-geofenced actions (pickup, complete) must send the rider's position. Resolve it
 * here so a missing fix surfaces as a readable message instead of a server 400.
 */
private suspend fun AppContainer.requireFix(): DriverFix =
    locationTracker.getCurrentLocation()
        ?: throw IllegalStateException("Can't read your location. Turn on GPS and try again.")

/** Pre-pickup vehicle/order failure is blocked — reject the claimed job instead. */
const val REJECT_JOB_BEFORE_FAILURE_MESSAGE =
    "reject job if you want to remove the accepted job"

// ---------------- Jobs list ----------------

data class JobsListState(
    val loading: Boolean = false,
    val dutyLoading: Boolean = false,
    val claimingId: String? = null,
    val jobs: List<JobSummary> = emptyList(),
    val profile: DriverProfile? = null,
    val error: String? = null,
    /** Off-duty rejection. Survives [JobsListViewModel.load] so a job refresh cannot hide it. */
    val dutyError: String? = null,
    val banner: String? = null,
    /** Non-fatal note that survives a background [JobsListViewModel.load]. */
    val notice: String? = null,
    val historyLoading: Boolean = false,
    val history: List<JobHistoryItem> = emptyList(),
    val historyError: String? = null,
    val historyLoaded: Boolean = false,
    val activeJobDetail: DeliveryJobDetail? = null,
) {
    val isOnline: Boolean get() = profile?.isOnline == true
}

class JobsListViewModel(private val container: AppContainer) : ViewModel() {
    private val jobsRepo = container.jobsRepository
    private val authRepo = container.authRepository
    private val socket = container.deliverySocket
    private val _state = MutableStateFlow(JobsListState())
    val state: StateFlow<JobsListState> = _state.asStateFlow()

    /** Fires when a new job lands while the app is open, for in-app sound + banner. */
    private val _newJobEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val newJobEvents: SharedFlow<Unit> = _newJobEvents.asSharedFlow()

    private val newJobHandler: (Array<out Any>) -> Unit = {
        // Prefer full refresh — payload date shapes vary and missed joins are common.
        _newJobEvents.tryEmit(Unit)
        load()
    }

    private val jobClaimedHandler: (Array<out Any>) -> Unit = handler@{ args ->
        val raw = args.firstOrNull()
        try {
            if (raw != null) {
                val obj = when (raw) {
                    is JSONObject -> raw
                    is String -> JSONObject(raw)
                    else -> JSONObject(raw.toString())
                }
                val jobId = obj.optString("jobId")
                val driverId = obj.optString("driverId")
                val me = _state.value.profile?.id
                if (jobId.isNotBlank() && driverId != me) {
                    _state.value = _state.value.copy(jobs = _state.value.jobs.filter { it.id != jobId })
                    return@handler
                }
            }
        } catch (_: Exception) {
            // fall through to load()
        }
        load()
    }

    private val jobAssignedHandler: (Array<out Any>) -> Unit = {
        load()
    }

    init {
        socket.on("newDeliveryJob", newJobHandler)
        socket.on("jobAssignedToDriver", jobAssignedHandler)
        socket.on("deliveryJobClaimed", jobClaimedHandler)
        viewModelScope.launch {
            JobRefreshBus.events.collect { load() }
        }
    }

    fun load() {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val profile = try {
                    authRepo.getMe()
                } catch (_: Exception) {
                    _state.value.profile
                }
                val jobs = jobsRepo.listJobs()
                val heldStatuses = setOf("IN_PROGRESS", "ASSIGNED", "RETURNING", "QUEUED")
                val active = jobs.firstOrNull { it.status in heldStatuses }
                val detail = if (active != null) {
                    try {
                        jobsRepo.getJob(active.id)
                    } catch (_: Exception) {
                        _state.value.activeJobDetail
                    }
                } else null
                _state.value = _state.value.copy(
                    loading = false,
                    jobs = jobs,
                    activeJobDetail = detail,
                    profile = profile,
                    banner = if (profile != null && !profile.isOnline) {
                        "Go online to receive jobs"
                    } else {
                        null
                    },
                )
                if (profile != null && profile.isOnline) {
                    ensureSocketPool(profile)
                    DriverAlertService.start(container.appContext)
                }
            } catch (e: ApiException) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Failed to load jobs")
            }
        }
    }

    /** Completed runs for the History tab. Cached after the first load; pass force to refresh. */
    fun loadHistory(force: Boolean = false) {
        if (_state.value.historyLoading) return
        if (_state.value.historyLoaded && !force) return
        _state.value = _state.value.copy(historyLoading = true, historyError = null)
        viewModelScope.launch {
            try {
                val history = jobsRepo.listJobHistory()
                _state.value = _state.value.copy(
                    historyLoading = false,
                    history = history,
                    historyLoaded = true,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    historyLoading = false,
                    historyError = e.message ?: "Failed to load history",
                )
            }
        }
    }

    suspend fun listStoresForBranchRequest(): List<lk.bingchun.delivery.data.model.BranchOption> =
        authRepo.listStores()

    suspend fun listMyBranchRequests(): List<lk.bingchun.delivery.data.model.DriverBranchRequest> =
        authRepo.listBranchRequests()

    suspend fun getShiftHistory(): List<lk.bingchun.delivery.data.model.DriverShiftEntry> =
        authRepo.getShiftHistory()

    fun createBranchRequest(
        type: String,
        toStoreId: String,
        reason: String?,
        onDone: () -> Unit,
        onError: (String) -> Unit,
    ) {
        viewModelScope.launch {
            try {
                authRepo.createBranchRequest(type, toStoreId, reason)
                load()
                onDone()
            } catch (e: ApiException) {
                onError(e.message)
            } catch (e: Exception) {
                onError(e.message ?: "Request failed")
            }
        }
    }

    /** Driver's vehicle broke down mid-ride — flag it (with location) so admin can send a replacement. */
    fun reportVehicleFailure(note: String?, onDone: () -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val active = jobsRepo.getActiveJob()
                if (active?.canReject == true) {
                    onError(REJECT_JOB_BEFORE_FAILURE_MESSAGE)
                    return@launch
                }
                val fix = container.locationTracker.getCurrentLocation()
                    ?: throw IllegalStateException("Could not get your location. Enable GPS and try again.")
                val activeJobId = active?.id ?: _state.value.jobs.firstOrNull {
                    it.status == "IN_PROGRESS" || it.status == "ASSIGNED" || it.status == "RETURNING"
                }?.id
                jobsRepo.reportVehicleFailure(lat = fix.lat, lng = fix.lng, note = note)
                if (activeJobId != null) {
                    _state.value = _state.value.copy(
                        jobs = _state.value.jobs.filter { it.id != activeJobId },
                    )
                }
                container.locationTracker.stop()
                DriverAlertService.stopTracking(container.appContext)
                load()
                loadHistory(force = true)
                if (activeJobId != null) {
                    JobRefreshBus.refresh(activeJobId)
                    JobRefreshBus.dropRide(activeJobId)
                }
                onDone()
            } catch (e: ApiException) {
                onError(e.message)
            } catch (e: Exception) {
                onError(e.message ?: "Could not report vehicle failure")
            }
        }
    }

    /** While online, periodically re-fetch so missed socket events still show jobs. */
    fun startPollingWhileOnline() {
        viewModelScope.launch {
            while (true) {
                kotlinx.coroutines.delay(8_000)
                if (_state.value.isOnline) {
                    try {
                        val jobs = jobsRepo.listJobs()
                        if (jobs.map { it.id }.toSet() != _state.value.jobs.map { it.id }.toSet()) {
                            _state.value = _state.value.copy(jobs = jobs)
                        }
                        _state.value.profile?.let { ensureSocketPool(it) }
                    } catch (_: Exception) {
                        // keep previous list
                    }
                }
            }
        }
    }

    fun setOnline(online: Boolean) {
        if (_state.value.dutyLoading) return
        if (!online && _state.value.jobs.any { it.status in HELD_DUTY_STATUSES }) {
            _state.value = _state.value.copy(dutyError = OFF_DUTY_BLOCKED)
            return
        }
        _state.value = _state.value.copy(dutyLoading = true, error = null, dutyError = null)
        viewModelScope.launch {
            try {
                val profile = authRepo.setDuty(if (online) "ONLINE" else "OFF_DUTY")
                _state.value = _state.value.copy(
                    dutyLoading = false,
                    dutyError = null,
                    profile = profile,
                    banner = if (!profile.isOnline) "Go online to receive jobs" else null,
                )
                if (online) {
                    ensureSocketPool(profile)
                    DriverAlertService.start(container.appContext)
                    DriverAlertService.setAlertEligible(container.appContext, profile.alertEligible)
                    container.locationTracker.startIdle()
                } else {
                    DriverAlertService.stopTracking(container.appContext)
                    DriverAlertService.stop(container.appContext)
                    container.locationTracker.stop()
                    socket.disconnect()
                }
            } catch (e: ApiException) {
                _state.value = _state.value.copy(dutyLoading = false, dutyError = dutyErrorMessage(e))
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    dutyLoading = false,
                    dutyError = e.message ?: "Duty update failed",
                )
            }
        }
    }

    fun claim(jobId: String, onDone: () -> Unit = {}) {
        if (!_state.value.isOnline) {
            _state.value = _state.value.copy(error = "Go online to claim jobs")
            return
        }
        if (_state.value.jobs.any { it.status == "IN_PROGRESS" || it.status == "ASSIGNED" || it.status == "QUEUED" }) {
            _state.value = _state.value.copy(error = "Finish your current delivery before claiming another job")
            return
        }
        if (_state.value.claimingId != null) return
        _state.value = _state.value.copy(claimingId = jobId, error = null, notice = null)
        viewModelScope.launch {
            try {
                val job = jobsRepo.claimJob(jobId)
                val queued = job.status == "QUEUED"
                _state.value = _state.value.copy(
                    claimingId = null,
                    notice = if (queued) QUEUED_NOTICE else null,
                )
                // The one extra claim allowed while returning is now used — stop ringing.
                if (queued) DriverAlertService.setAlertEligible(container.appContext, false)
                load()
                if (!queued) {
                    container.deliverySocket.connect()
                    container.locationTracker.start(jobId)
                    DriverAlertService.startTracking(container.appContext, jobId)
                    // Mute ringing for other jobs immediately — don't wait for the
                    // next poll cycle to notice this driver is now ASSIGNED.
                    DriverAlertService.setAlertEligible(container.appContext, false)
                    onDone()
                }
            } catch (e: ApiException) {
                // Claiming a second run while one is live queues it — a success, not a failure.
                if (e.code == "QUEUED" || e.code == "JOB_QUEUED") {
                    _state.value = _state.value.copy(claimingId = null, notice = QUEUED_NOTICE)
                    DriverAlertService.setAlertEligible(container.appContext, false)
                    load()
                } else {
                    _state.value = _state.value.copy(claimingId = null, error = e.message)
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(claimingId = null, error = e.message ?: "Claim failed")
            }
        }
    }

    fun rejectJob(jobId: String, reason: String, onDone: () -> Unit = {}) {
        if (_state.value.claimingId != null) return
        _state.value = _state.value.copy(claimingId = jobId, error = null, notice = null)
        val storeId = _state.value.jobs.find { it.id == jobId }?.storeId.orEmpty()
        DriverAlertService.beginPostRejectHold(container.appContext, jobId, storeId)
        viewModelScope.launch {
            try {
                jobsRepo.rejectJob(jobId, reason)
                DriverAlertService.silenceJob(container.appContext, jobId)
                val blocked = try {
                    jobsRepo.listJobs().any {
                        it.status == "IN_PROGRESS" || it.status == "ASSIGNED" || it.status == "QUEUED"
                    }
                } catch (_: Exception) {
                    false
                }
                DriverAlertService.setAlertEligible(container.appContext, !blocked)
                _state.value = _state.value.copy(claimingId = null, notice = "Job rejected.")
                load()
                onDone()
            } catch (e: ApiException) {
                DriverAlertService.cancelPostRejectHold(container.appContext)
                _state.value = _state.value.copy(claimingId = null, error = e.message)
            } catch (e: Exception) {
                DriverAlertService.cancelPostRejectHold(container.appContext)
                _state.value = _state.value.copy(claimingId = null, error = e.message ?: "Reject failed")
            }
        }
    }

    fun pickupJob(jobId: String, onDone: () -> Unit = {}) {
        if (_state.value.claimingId != null) return
        _state.value = _state.value.copy(claimingId = jobId, error = null, notice = null)
        viewModelScope.launch {
            try {
                val fix = container.requireFix()
                jobsRepo.pickupJob(jobId, fix.lat, fix.lng)
                _state.value = _state.value.copy(claimingId = null)
                load()
                onDone()
            } catch (e: ApiException) {
                _state.value = _state.value.copy(claimingId = null, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(claimingId = null, error = e.message ?: "Pickup failed")
            }
        }
    }

    fun clearNotice() { _state.value = _state.value.copy(notice = null) }

    private fun ensureSocketPool(profile: DriverProfile) {
        socket.connect()
        val storeIds = buildList {
            profile.storeId?.let { add(it) }
            profile.store?.id?.let { add(it) }
            profile.accessibleStores.forEach { add(it.id) }
        }.distinct().filter { it.isNotBlank() }
        socket.joinBranchPool(storeIds)
    }

    override fun onCleared() {
        // Targeted removal so DriverAlertService's listener keeps working.
        socket.off("newDeliveryJob", newJobHandler)
        socket.off("jobAssignedToDriver", jobAssignedHandler)
        socket.off("deliveryJobClaimed", jobClaimedHandler)
        super.onCleared()
    }

    private companion object {
        const val QUEUED_NOTICE =
            "Job queued — it starts once your current run is finished."

        const val OFF_DUTY_BLOCKED =
            "Cannot go off duty while a delivery run is active. Finish or hand over the run first."

        val HELD_DUTY_STATUSES = setOf("ASSIGNED", "QUEUED", "IN_PROGRESS", "RETURNING")

        fun dutyErrorMessage(e: ApiException): String = when {
            e.code == "ACTIVE_JOB" || e.message.contains("ACTIVE_JOB", ignoreCase = true) ->
                OFF_DUTY_BLOCKED
            else -> e.message
        }
    }
}

// ---------------- Job detail ----------------

data class JobDetailState(
    val loading: Boolean = false,
    val acting: Boolean = false,
    val routeLoading: Boolean = false,
    val job: DeliveryJobDetail? = null,
    val route: DeliveryRoute? = null,
    val error: String? = null,
)

class JobDetailViewModel(private val container: AppContainer) : ViewModel() {
    private val repo = container.jobsRepository
    private val _state = MutableStateFlow(JobDetailState())
    val state: StateFlow<JobDetailState> = _state.asStateFlow()
    private var loadedId: String? = null

    init {
        viewModelScope.launch {
            JobRefreshBus.events.collect { id ->
                if (id == loadedId) load(id, force = true)
            }
        }
    }

    fun load(jobId: String, force: Boolean = false) {
        if (!force && loadedId == jobId && _state.value.job != null) return
        loadedId = jobId
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val job = repo.getJob(jobId)
                _state.value = _state.value.copy(loading = false, job = job)
                if (job.isActive) beginTracking(jobId)
                if (job.isActive || job.canAssign || job.isHistorySnapshot) {
                    _state.value = _state.value.copy(routeLoading = true)
                    try {
                        val route = repo.getJobRoute(jobId, job)
                        _state.value = _state.value.copy(routeLoading = false, route = route)
                    } catch (_: Exception) {
                        _state.value = _state.value.copy(routeLoading = false)
                    }
                }
            } catch (e: ApiException) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Failed to load job")
            }
        }
    }

    fun assign(jobId: String, onDone: () -> Unit) = act(onDone) { repo.assignJob(jobId) }

    fun claim(jobId: String, onDone: () -> Unit) = act(onDone) { repo.claimJob(jobId) }

    fun start(jobId: String, onDone: () -> Unit) = act(onDone) { repo.startJob(jobId) }

    fun pickup(jobId: String, onDone: () -> Unit) = act(onDone) {
        val fix = container.requireFix()
        repo.pickupJob(jobId, fix.lat, fix.lng)
    }

    private fun beginTracking(jobId: String) {
        container.deliverySocket.connect()
        container.locationTracker.start(jobId)
        DriverAlertService.startTracking(container.appContext, jobId)
        refreshAlertEligibility()
    }

    /** New-job rings stay muted while any job is ASSIGNED/IN_PROGRESS/QUEUED — a QUEUED
     *  job means the one extra claim allowed while returning is already taken. */
    private fun refreshAlertEligibility() {
        viewModelScope.launch {
            val blocked = try {
                repo.listJobs().any {
                    it.status == "IN_PROGRESS" || it.status == "ASSIGNED" || it.status == "QUEUED"
                }
            } catch (_: Exception) {
                false
            }
            DriverAlertService.setAlertEligible(container.appContext, !blocked)
        }
    }

    fun reject(jobId: String, reason: String, onDone: () -> Unit) {
        if (_state.value.acting) return
        _state.value = _state.value.copy(acting = true, error = null)
        val storeId = _state.value.job?.store?.id.orEmpty()
        DriverAlertService.beginPostRejectHold(container.appContext, jobId, storeId)
        viewModelScope.launch {
            try {
                repo.rejectJob(jobId, reason)
                container.locationTracker.stop()
                DriverAlertService.silenceJob(container.appContext, jobId)
                refreshAlertEligibility()
                _state.value = _state.value.copy(acting = false, job = null)
                JobRefreshBus.refresh(jobId)
                onDone()
            } catch (e: ApiException) {
                DriverAlertService.cancelPostRejectHold(container.appContext)
                _state.value = _state.value.copy(acting = false, error = e.message)
            } catch (e: Exception) {
                DriverAlertService.cancelPostRejectHold(container.appContext)
                _state.value = _state.value.copy(acting = false, error = e.message ?: "Reject failed")
            }
        }
    }

    private fun act(onDone: () -> Unit, block: suspend () -> DeliveryJobDetail) {
        if (_state.value.acting) return
        _state.value = _state.value.copy(acting = true, error = null)
        viewModelScope.launch {
            try {
                val job = block()
                if (job.isActive) beginTracking(job.id)
                val route = if (job.isActive) {
                    try { repo.getJobRoute(job.id) } catch (_: Exception) { _state.value.route }
                } else {
                    _state.value.route
                }
                _state.value = _state.value.copy(acting = false, job = job, route = route)
                JobRefreshBus.refresh(job.id)
                onDone()
            } catch (e: ApiException) {
                _state.value = _state.value.copy(acting = false, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(acting = false, error = e.message ?: "Action failed")
            }
        }
    }
}

// ---------------- Dashboard ----------------

data class DashboardState(
    val loading: Boolean = false,
    val acting: Boolean = false,
    val job: DeliveryJobDetail? = null,
    val route: DeliveryRoute? = null,
    val error: String? = null,
)

class DashboardViewModel(private val container: AppContainer) : ViewModel() {
    private val repo = container.jobsRepository
    private val _state = MutableStateFlow(DashboardState())
    val state: StateFlow<DashboardState> = _state.asStateFlow()
    private var loadedId: String? = null

    init {
        viewModelScope.launch {
            JobRefreshBus.events.collect { id ->
                if (id == loadedId) load(id, force = true)
            }
        }
    }

    fun load(jobId: String, force: Boolean = false) {
        if (!force && loadedId == jobId && _state.value.job != null) return
        loadedId = jobId
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val job = repo.getJob(jobId)
                val route: DeliveryRoute? = try {
                    repo.getJobRoute(jobId, job)
                } catch (_: Exception) {
                    _state.value.route
                }
                if (job.isActive) beginTracking(jobId)
                _state.value = _state.value.copy(loading = false, job = job, route = route)
            } catch (e: ApiException) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Failed to load dashboard")
            }
        }
    }

    fun start(jobId: String) {
        if (_state.value.acting) return
        if (!container.locationTracker.hasPermission()) {
            _state.value = _state.value.copy(
                error = "Location permission is required for delivery tracking.",
            )
            return
        }
        if (!container.locationTracker.isLocationEnabled()) {
            _state.value = _state.value.copy(
                error = "Location is off. Turn it on to start this run.",
            )
            return
        }
        _state.value = _state.value.copy(acting = true, error = null)
        viewModelScope.launch {
            try {
                val job = repo.startJob(jobId)
                val route = try { repo.getJobRoute(jobId) } catch (_: Exception) { _state.value.route }
                beginTracking(jobId)
                val gpsOk = container.locationTracker.isTracking
                _state.value = _state.value.copy(
                    acting = false,
                    job = job,
                    route = route,
                    error = if (gpsOk) null else
                        "Run started, but GPS tracking didn't start. Check location settings.",
                )
                JobRefreshBus.refresh(jobId)
            } catch (e: ApiException) {
                _state.value = _state.value.copy(acting = false, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(acting = false, error = e.message ?: "Failed to start")
            }
        }
    }

    fun pickup(jobId: String) {
        if (_state.value.acting) return
        _state.value = _state.value.copy(acting = true, error = null)
        viewModelScope.launch {
            try {
                val fix = container.requireFix()
                val job = repo.pickupJob(jobId, fix.lat, fix.lng)
                val route = try { repo.getJobRoute(jobId) } catch (_: Exception) { _state.value.route }
                beginTracking(jobId)
                _state.value = _state.value.copy(acting = false, job = job, route = route)
                JobRefreshBus.refresh(jobId)
            } catch (e: ApiException) {
                _state.value = _state.value.copy(acting = false, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(acting = false, error = e.message ?: "Failed to confirm pickup")
            }
        }
    }

    fun reject(jobId: String, reason: String, onDone: () -> Unit) {
        if (_state.value.acting) return
        _state.value = _state.value.copy(acting = true, error = null)
        val storeId = _state.value.job?.store?.id.orEmpty()
        DriverAlertService.beginPostRejectHold(container.appContext, jobId, storeId)
        viewModelScope.launch {
            try {
                repo.rejectJob(jobId, reason)
                DriverAlertService.silenceJob(container.appContext, jobId)
                _state.value = _state.value.copy(acting = false)
                endTracking()
                refreshAlertEligibility()
                onDone()
            } catch (e: ApiException) {
                DriverAlertService.cancelPostRejectHold(container.appContext)
                _state.value = _state.value.copy(acting = false, error = e.message)
            } catch (e: Exception) {
                DriverAlertService.cancelPostRejectHold(container.appContext)
                _state.value = _state.value.copy(acting = false, error = e.message ?: "Reject failed")
            }
        }
    }

    fun complete(jobId: String, lat: Double, lng: Double, onDone: () -> Unit) {
        if (_state.value.acting) return
        _state.value = _state.value.copy(acting = true, error = null)
        viewModelScope.launch {
            try {
                val job = repo.completeJob(jobId, lat, lng)
                _state.value = _state.value.copy(acting = false, job = job)
                JobRefreshBus.refresh(jobId)
                endTracking()
                refreshAlertEligibility()
                onDone()
            } catch (e: ApiException) {
                _state.value = _state.value.copy(acting = false, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(acting = false, error = e.message ?: "Failed to complete")
            }
        }
    }

    /** Locally patch an order after a status update and recompute deliveredCount. */
    fun applyOrderUpdate(updated: JobOrder) {
        val job = _state.value.job ?: return
        val orders = job.orders.map { if (it.orderId == updated.orderId) updated else it }
        val resolved = orders.count { it.isDelivered || it.isFailed || it.status == "CANCELLED" }
        val allDone = resolved == orders.size && orders.isNotEmpty()
        val nextStatus = if (allDone && job.status == "IN_PROGRESS") "RETURNING" else job.status
        _state.value = _state.value.copy(
            job = job.copy(orders = orders, deliveredCount = resolved, status = nextStatus),
        )
        if (nextStatus == "RETURNING") {
            refreshAlertEligibility()
        }
    }

    private fun beginTracking(jobId: String) {
        container.deliverySocket.connect()
        // Keep Compose-side tracker for live map; service owns background continuity.
        container.locationTracker.start(jobId)
        DriverAlertService.startTracking(container.appContext, jobId)
        refreshAlertEligibility()
    }

    private fun endTracking() {
        container.locationTracker.stop()
        DriverAlertService.stopTracking(container.appContext)
    }

    /** New-job rings stay muted while any job is ASSIGNED/IN_PROGRESS/QUEUED — a QUEUED
     *  job means the one extra claim allowed while returning is already taken. */
    private fun refreshAlertEligibility() {
        viewModelScope.launch {
            val blocked = try {
                repo.listJobs().any {
                    it.status == "IN_PROGRESS" || it.status == "ASSIGNED" || it.status == "QUEUED"
                }
            } catch (_: Exception) {
                false
            }
            DriverAlertService.setAlertEligible(container.appContext, !blocked)
        }
    }
}

// ---------------- Order action ----------------

data class OrderActionState(
    val acting: Boolean = false,
    val error: String? = null,
    val failureError: String? = null,
    val otpRequired: Boolean = false,
    val lastUpdated: JobOrder? = null,
    val sendingCode: Boolean = false,
    val codeSent: Boolean = false,
    val loading: Boolean = false,
    val order: JobOrder? = null,
    val loadError: String? = null,
    val filingComplaint: Boolean = false,
    val complaintError: String? = null,
)

class OrderActionViewModel(container: AppContainer) : ViewModel() {
    private val repo = container.jobsRepository
    private val _state = MutableStateFlow(OrderActionState())
    val state: StateFlow<OrderActionState> = _state.asStateFlow()

    /**
     * Loads the stop straight from the API so the screen works even when the parent
     * job payload is stale or was never fetched; [fallback] covers older backends
     * that do not expose the single-order endpoint yet.
     */
    fun loadOrder(orderId: String, fallback: () -> JobOrder?) {
        if (_state.value.loading) return
        _state.value = _state.value.copy(loading = true, loadError = null)
        viewModelScope.launch {
            try {
                val order = repo.getOrder(orderId)
                _state.value = _state.value.copy(loading = false, order = order)
            } catch (e: Exception) {
                val local = fallback()
                _state.value = _state.value.copy(
                    loading = false,
                    order = local,
                    loadError = if (local != null) null else (e.message ?: "Failed to load order"),
                )
            }
        }
    }

    fun setOrder(order: JobOrder) {
        _state.value = _state.value.copy(order = order, loadError = null)
    }

    fun updateStatus(
        orderId: String,
        status: String,
        otp: String? = null,
        note: String? = null,
        outcome: String? = null,
        onSuccess: (JobOrder) -> Unit,
    ) {
        if (_state.value.acting) return
        val isFailure = status == "DELIVERY_FAILED"
        _state.value = _state.value.copy(
            acting = true,
            error = if (isFailure) _state.value.error else null,
            failureError = if (isFailure) null else _state.value.failureError,
            otpRequired = false,
        )
        viewModelScope.launch {
            try {
                val order = repo.updateOrderStatus(orderId, status, note = note, otp = otp, outcome = outcome)
                _state.value = _state.value.copy(acting = false, lastUpdated = order, order = order)
                onSuccess(order)
            } catch (e: ApiException) {
                _state.value = _state.value.copy(
                    acting = false,
                    error = if (isFailure) _state.value.error else e.message,
                    failureError = if (isFailure) e.message else _state.value.failureError,
                    otpRequired = if (isFailure) false else e.isOtpRequired,
                )
            } catch (e: Exception) {
                val msg = e.message ?: "Update failed"
                _state.value = _state.value.copy(
                    acting = false,
                    error = if (isFailure) _state.value.error else msg,
                    failureError = if (isFailure) msg else _state.value.failureError,
                )
            }
        }
    }

    /** Sends a fresh delivery code to the customer so they can read it back to the driver. */
    fun sendCodeToCustomer(orderId: String) {
        if (_state.value.sendingCode) return
        _state.value = _state.value.copy(sendingCode = true, error = null, codeSent = false)
        viewModelScope.launch {
            try {
                repo.resendOrderOtp(orderId)
                _state.value = _state.value.copy(sendingCode = false, codeSent = true)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    sendingCode = false,
                    error = e.message ?: "Could not send the code",
                )
            }
        }
    }

    fun clearOtpRequired() { _state.value = _state.value.copy(otpRequired = false) }
    fun clearError() { _state.value = _state.value.copy(error = null) }
    fun clearFailureError() { _state.value = _state.value.copy(failureError = null) }
    fun clearComplaintError() { _state.value = _state.value.copy(complaintError = null) }

    fun fileComplaint(orderId: String, category: String, description: String, onSuccess: () -> Unit) {
        if (_state.value.filingComplaint) return
        _state.value = _state.value.copy(filingComplaint = true, complaintError = null)
        viewModelScope.launch {
            try {
                repo.createComplaint(orderId, category, description)
                _state.value = _state.value.copy(filingComplaint = false)
                onSuccess()
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    filingComplaint = false,
                    complaintError = e.message ?: "Could not file complaint",
                )
            }
        }
    }
}

