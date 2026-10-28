package lk.bingchun.delivery.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.automirrored.outlined.AltRoute
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.TwoWheeler
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.R
import lk.bingchun.delivery.core.DriverAlertService
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.Intents
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.data.model.JobHistoryItem
import lk.bingchun.delivery.data.model.JobSummary
import lk.bingchun.delivery.ui.AuthViewModel
import lk.bingchun.delivery.ui.JobsListViewModel
import lk.bingchun.delivery.ui.components.BcCard
import lk.bingchun.delivery.ui.components.BcPinnedTabLayout
import lk.bingchun.delivery.ui.components.BcEmptyState
import lk.bingchun.delivery.ui.components.BcErrorState
import lk.bingchun.delivery.ui.components.BcJobsSkeleton
import lk.bingchun.delivery.ui.components.BcTextButton
import lk.bingchun.delivery.ui.components.DeliveryIllustration
import lk.bingchun.delivery.ui.components.HistorySummaryRow
import lk.bingchun.delivery.ui.components.InfoBadge
import lk.bingchun.delivery.ui.components.MapPinIllustration
import lk.bingchun.delivery.ui.components.jobs.ActiveJobCard
import lk.bingchun.delivery.ui.components.jobs.ActiveRidesSectionHeader
import lk.bingchun.delivery.ui.components.jobs.BcDutyDock
import lk.bingchun.delivery.ui.components.jobs.JobsHeader
import lk.bingchun.delivery.ui.components.jobs.NoOtherJobsCard
import lk.bingchun.delivery.ui.components.jobs.ScheduledJobCard
import lk.bingchun.delivery.ui.components.jobs.jobsScheduledMillis
import lk.bingchun.delivery.ui.containerViewModel
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobsTab(
    authViewModel: AuthViewModel,
    onOpenJob: (JobSummary) -> Unit,
    modifier: Modifier = Modifier,
    historyMode: Boolean = false,
    onViewJobs: (() -> Unit)? = null,
) {
    if (historyMode) {
        HistoryScreen(
            authViewModel = authViewModel,
            onOpenJob = onOpenJob,
            modifier = modifier,
            onViewJobs = onViewJobs,
        )
        return
    }

    val vm: JobsListViewModel = containerViewModel()
    val state by vm.state.collectAsState()
    val auth by authViewModel.state.collectAsState()
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    val context = LocalContext.current
    val alertingJobIds by DriverAlertService.activeAlertJobIds.collectAsState()
    var refreshing by remember { mutableStateOf(false) }
    var newJobFlash by remember { mutableStateOf(false) }
    var pendingClaim by remember { mutableStateOf<JobSummary?>(null) }

    LaunchedEffect(Unit) {
        vm.load()
        vm.startPollingWhileOnline()
    }
    LaunchedEffect(historyMode) {
        if (historyMode) vm.loadHistory()
    }
    LaunchedEffect(state.loading, state.historyLoading) {
        if (!state.loading && !state.historyLoading) refreshing = false
    }
    LaunchedEffect(Unit) {
        vm.newJobEvents.collect {
            feedback.newJob()
            newJobFlash = true
        }
    }
    LaunchedEffect(newJobFlash) {
        if (newJobFlash) {
            kotlinx.coroutines.delay(4_000)
            newJobFlash = false
        }
    }
    LaunchedEffect(state.dutyError) {
        if (state.dutyError != null) feedback.error()
    }

    val driverName = state.profile?.name ?: auth.driver?.name ?: "Test Driver"
    val storeName = state.profile?.store?.name ?: auth.driver?.storeName ?: "DART CODES"

    var showVehicleFailureDialog by remember { mutableStateOf(false) }
    var failureAlertSubmitting by remember { mutableStateOf(false) }
    var failureAlertError by remember { mutableStateOf<String?>(null) }

    Column(modifier = modifier.fillMaxSize().background(colors.background)) {
        AnimatedVisibility(visible = newJobFlash, enter = fadeIn(), exit = fadeOut()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.brandSubtle)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Outlined.LocalShipping,
                    contentDescription = null,
                    tint = colors.brand,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    "New cup run available",
                    style = BcType.bodyStrong,
                    color = colors.brand,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }

        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                feedback.refresh()
                refreshing = true
                vm.load()
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            JobsBody(
                state = state,
                driverName = driverName,
                storeName = storeName,
                newJobFlash = newJobFlash,
                    onOpenJob = onOpenJob,
                    alertingJobIds = alertingJobIds,
                    onClaim = { id -> pendingClaim = state.jobs.find { it.id == id } },
                    onSilence = { DriverAlertService.silenceJob(context, it) },
                    onToggleDuty = { online ->
                        feedback.tap()
                        vm.setOnline(online)
                    },
                    onReportIssue = {
                        val held = setOf("IN_PROGRESS", "ASSIGNED", "RETURNING", "QUEUED")
                        val activeJob = state.jobs.firstOrNull { it.status in held }
                        if (activeJob != null) {
                            showVehicleFailureDialog = true
                        } else {
                            Toast.makeText(
                                context,
                                "No active ride to report breakdown for. Contact branch if needed.",
                                Toast.LENGTH_SHORT,
                            ).show()
                        }
                    },
                    onNotificationClick = {
                        feedback.tap()
                        Toast.makeText(context, "All delivery notifications active", Toast.LENGTH_SHORT).show()
                    },
                    onRetry = { vm.load() },
                )
            }
        }

    if (showVehicleFailureDialog) {
        VehicleFailureDialog(
            submitting = failureAlertSubmitting,
            submitError = failureAlertError,
            onDismiss = {
                if (!failureAlertSubmitting) {
                    showVehicleFailureDialog = false
                    failureAlertError = null
                }
            },
            onSubmit = { note ->
                failureAlertSubmitting = true
                failureAlertError = null
                vm.reportVehicleFailure(
                    note = note,
                    onDone = {
                        failureAlertSubmitting = false
                        showVehicleFailureDialog = false
                        feedback.success()
                        Toast.makeText(context, "Vehicle issue reported. Replacement requested.", Toast.LENGTH_LONG).show()
                    },
                    onError = { err ->
                        failureAlertSubmitting = false
                        failureAlertError = err
                        feedback.error()
                    },
                )
            },
        )
    }

    pendingClaim?.let { job ->
        val claiming = state.claimingId == job.id
        var claimStarted by remember(job.id) { mutableStateOf(false) }
        LaunchedEffect(claiming) {
            if (claiming) claimStarted = true else if (claimStarted) pendingClaim = null
        }

        ClaimJobSheet(
            storeName = Format.shortBranchName(job.storeName),
            subtitle = listOfNotNull(
                job.storeCity.takeIf { it.isNotBlank() },
                Format.rideIdLabel(job.rideCode, job.id),
            ).joinToString(" · "),
            fee = job.totalDeliveryFees,
            stopCount = job.orderCount,
            distanceKm = job.estimatedDistanceKm,
            minutes = job.estimatedMinutes,
            submitting = claiming,
            onDismiss = { pendingClaim = null },
            onConfirm = {
                DriverAlertService.silenceJob(context, job.id)
                vm.claim(job.id) { feedback.success() }
            },
        )
    }
}

@Composable
private fun JobsBody(
    state: lk.bingchun.delivery.ui.JobsListState,
    driverName: String,
    storeName: String,
    newJobFlash: Boolean,
    onOpenJob: (JobSummary) -> Unit,
    alertingJobIds: Set<String>,
    onClaim: (String) -> Unit,
    onSilence: (String) -> Unit,
    onToggleDuty: (Boolean) -> Unit,
    onReportIssue: () -> Unit,
    onNotificationClick: () -> Unit,
    onRetry: () -> Unit,
) {
    val colors = LocalBcColors.current
    when {
        state.loading && state.jobs.isEmpty() && state.profile == null -> BcJobsSkeleton()
        state.error != null && state.jobs.isEmpty() && state.profile == null ->
            BcErrorState(message = state.error, onRetry = onRetry)
        else -> {
            val heldStatuses = setOf("IN_PROGRESS", "ASSIGNED", "RETURNING", "QUEUED")
            val active = state.jobs
                .filter { it.status in heldStatuses }
                .sortedByDescending { jobsScheduledMillis(it.scheduledAt) }
            val scheduled = state.jobs
                .filter { it.status !in heldStatuses }
                .sortedByDescending { jobsScheduledMillis(it.scheduledAt) }
            val hasBlockingRun = state.jobs.any { it.status in heldStatuses }

            BcPinnedTabLayout(
                overlap = 22.dp,
                header = {
                    JobsHeader(
                        driverName = driverName,
                        storeName = storeName,
                        onNotificationClick = onNotificationClick,
                        onReportIssue = onReportIssue,
                    )
                },
            ) { topPad ->
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(top = topPad, bottom = 28.dp),
                ) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 6.dp),
                        ) {
                            BcDutyDock(
                                isOnline = state.isOnline,
                                activeCount = active.size,
                                onToggleDuty = onToggleDuty,
                                newJobPulse = newJobFlash,
                            )
                        }
                    }

                    state.dutyError?.let { err ->
                        item {
                            Text(
                                err,
                                style = BcType.caption,
                                color = colors.errorSoft,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            )
                        }
                    }

                    state.error?.let { err ->
                        item {
                            Text(
                                err,
                                style = BcType.caption,
                                color = colors.errorSoft,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            )
                        }
                    }
                    state.notice?.let { note ->
                        item {
                            Text(
                                note,
                                style = BcType.caption,
                                color = colors.brand,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            )
                        }
                    }

                    // Active Deliveries Section
                    if (active.isNotEmpty()) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 6.dp),
                            ) {
                                ActiveRidesSectionHeader(activeCount = active.size)
                            }
                        }

                        items(active, key = { it.id }) { job ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 6.dp),
                            ) {
                                ActiveJobCard(
                                    job = job,
                                    detail = state.activeJobDetail?.takeIf { it.id == job.id },
                                    onOpen = { onOpenJob(job) },
                                )
                            }
                        }
                    }

                    // Up Next / Scheduled Deliveries Section
                    if (scheduled.isNotEmpty()) {
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text(
                                        text = "Up Next",
                                        style = BcType.bodyStrong,
                                        color = colors.text,
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Box(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(colors.infoSubtle)
                                            .padding(horizontal = 8.dp, vertical = 2.dp),
                                    ) {
                                        Text(
                                            text = "${scheduled.size}",
                                            style = BcType.tiny,
                                            color = colors.info,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                                Text(
                                    text = "Scheduled runs",
                                    style = BcType.tiny,
                                    color = colors.textMuted,
                                )
                            }
                        }

                        items(scheduled, key = { it.id }) { job ->
                            val isToday = Format.isToday(job.scheduledAt)
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 6.dp),
                            ) {
                                ScheduledJobCard(
                                    job = job,
                                    onOpen = { onOpenJob(job) },
                                    claimEnabled = state.isOnline && !hasBlockingRun && isToday,
                                    disabledLabel = when {
                                        !isToday -> "No longer available"
                                        !state.isOnline -> "Go online to claim"
                                        else -> "Finish current delivery to claim"
                                    },
                                    claiming = state.claimingId == job.id,
                                    alerting = job.id in alertingJobIds,
                                    onClaim = { onClaim(job.id) },
                                    onSilence = { onSilence(job.id) },
                                )
                            }
                        }
                    }

                    // Empty State when no jobs at all
                    if (active.isEmpty() && scheduled.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 16.dp),
                            ) {
                                NoOtherJobsCard()
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Legacy entry kept so any remaining JobsScreen references compile during migration. */
@Composable
fun JobsScreen(
    authViewModel: AuthViewModel,
    onOpenJob: (JobSummary) -> Unit,
) {
    JobsTab(authViewModel = authViewModel, onOpenJob = onOpenJob, historyMode = false)
}
