package lk.bingchun.delivery.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.Intents
import lk.bingchun.delivery.core.JobRefreshBus
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.core.NavPrimaryAction
import lk.bingchun.delivery.core.NavTarget
import lk.bingchun.delivery.core.NavTargetKind
import lk.bingchun.delivery.data.model.liveRouteTarget
import lk.bingchun.delivery.ui.DashboardViewModel
import lk.bingchun.delivery.ui.RequestLocationPermission
import lk.bingchun.delivery.ui.components.BcGlassSurface
import lk.bingchun.delivery.ui.components.InfoBadge
import lk.bingchun.delivery.ui.components.InProgressStopIconBar
import lk.bingchun.delivery.ui.components.MapControlButton
import lk.bingchun.delivery.ui.components.RouteMap
import lk.bingchun.delivery.ui.components.RunActionBar
import lk.bingchun.delivery.ui.components.StatusChip
import lk.bingchun.delivery.ui.components.StopPreviewItem
import lk.bingchun.delivery.ui.components.StopPreviewList
import lk.bingchun.delivery.ui.containerViewModel
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun RouteMapScreen(
    jobId: String,
    onBack: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onFinishRun: () -> Unit,
) {
    val vm: DashboardViewModel = containerViewModel()
    val state by vm.state.collectAsState()
    val colors = LocalBcColors.current
    val context = LocalContext.current
    val feedback = LocalBcFeedback.current
    var needLocation by remember { mutableStateOf(false) }
    var pendingStart by remember { mutableStateOf(false) }
    var pendingPickup by remember { mutableStateOf(false) }
    var showRejectDialog by remember { mutableStateOf(false) }
    var navTarget by remember { mutableStateOf<NavTarget?>(null) }
    var refitKey by remember { mutableFloatStateOf(0f) }
    var actionBarHeightPx by remember { mutableIntStateOf(0) }

    LaunchedEffect(jobId) { vm.load(jobId) }
    LaunchedEffect(jobId) {
        JobRefreshBus.droppedRides.collect { droppedId ->
            if (droppedId == jobId) onBack()
        }
    }
    LaunchedEffect(state.job?.id, state.job?.isActive) {
        if (state.job?.isActive == true) needLocation = true
    }

    RequestLocationPermission(request = needLocation) { granted ->
        needLocation = false
        val tracker = (context.applicationContext as BingChunApp).container.locationTracker
        val currentJob = vm.state.value.job
        if (granted && currentJob?.isActive == true) {
            tracker.start(currentJob.id)
        }
        if (granted && pendingPickup) {
            pendingPickup = false
            feedback.success()
            vm.pickup(jobId)
            return@RequestLocationPermission
        }
        if (granted && pendingStart) {
            pendingStart = false
            if (!tracker.isLocationEnabled()) {
                vm.start(jobId)
            } else {
                feedback.success()
                vm.start(jobId)
            }
        } else {
            pendingStart = false
            pendingPickup = false
        }
    }

    val job = state.job
    val stops = remember(job?.orders) { job?.orders?.sortedBy { it.sequence }.orEmpty() }
    val nextStop = stops.firstOrNull { it.isPending }
    val locationTracker = remember {
        (context.applicationContext as BingChunApp).container.locationTracker
    }
    val lastFix by locationTracker.lastFix.collectAsState()
    val distanceToBranchM = remember(lastFix, job?.store, job?.pickup, job?.needsPickup) {
        val fix = lastFix
        val j = job
        if (fix == null || j == null) null
        else {
            val targetLat = if (j.needsPickup) j.pickupNavLat else j.store.lat
            val targetLng = if (j.needsPickup) j.pickupNavLng else j.store.lng
            val results = FloatArray(1)
            android.location.Location.distanceBetween(
                fix.lat, fix.lng, targetLat, targetLng, results,
            )
            results[0].toDouble()
        }
    }
    val withinBranch = when {
        job == null -> false
        job.needsPickup -> job.pickupUnlockedAt(distanceToBranchM)
        else -> job.canCompleteAt(distanceToBranchM)
    }
    val inProgressNav = job?.status == "IN_PROGRESS" && nextStop != null
    val primaryLabel = when {
        job == null -> null
        job.needsPickup -> "Confirm pickup"
        job.canStart -> "Start delivery"
        job.isReturning && withinBranch -> "Complete Ride"
        job.isReturning -> "Return to branch"
        else -> null
    }
    val chipStatus = when {
        job == null -> null
        job.needsPickup -> "PICKUP"
        job.canStart -> "PICKED_UP"
        job.isReturning -> "RETURNING"
        else -> job.status
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        val route = state.route
        when {
            state.loading && job == null ->
                CircularProgressIndicator(color = colors.brand, modifier = Modifier.align(Alignment.Center))
            job == null ->
                Text(
                    state.error ?: "Not found",
                    color = colors.textMuted,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
            route == null ->
                Text(
                    "Route unavailable",
                    color = colors.textMuted,
                    style = BcType.body,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
            else -> {
                RouteMap(
                    route = route,
                    interactive = true,
                    showDriverLocation = job.isActive,
                    liveTarget = route.liveRouteTarget(job, nextStop?.sequence ?: route.nextStopSequence),
                    activeStopSequence = nextStop?.sequence ?: route.nextStopSequence,
                    contentPaddingBottomPx = actionBarHeightPx,
                    refitKey = refitKey,
                    // No geofence applies at a pickup-override spot (e.g. vehicle-failure
                    // breakdown location) — don't draw a misleading unlock ring around it.
                    pickupRadiusM = if (job.hasPickupOverride) null else job.store.completionRadiusM,
                    modifier = Modifier.fillMaxSize(),
                )

                Column(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .statusBarsPadding()
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        IconButton(
                            onClick = onBack,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(colors.card.copy(alpha = 0.94f)),
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = colors.text)
                        }
                        BcGlassSurface(cornerRadius = BcRadius.md) {
                            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
                                Text("Cup run", style = BcType.bodyStrong, color = colors.text)
                                Text(
                                    Format.rideIdLabel(job.rideCode, job.id),
                                    color = colors.textMuted,
                                    fontSize = 12.sp,
                                )
                                Text(
                                    Format.shortBranchName(job.store.name),
                                    color = colors.textMuted,
                                    fontSize = 12.sp,
                                )
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        chipStatus?.let { StatusChip(it) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        InfoBadge("${route.summary.stopCount} stops")
                        InfoBadge(Format.km(route.summary.totalDistanceKm))
                        InfoBadge(Format.minutes(route.summary.estimatedMinutes))
                    }
                }

                MapControlButton(
                    icon = Icons.Filled.MyLocation,
                    label = "Recentre route",
                    onClick = { refitKey += 1f },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(top = 104.dp, end = 12.dp),
                )

                if (inProgressNav || primaryLabel != null || job.canReject || job.isReturning) {
                    BcGlassSurface(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .onSizeChanged { actionBarHeightPx = it.height },
                        cornerRadius = 20.dp,
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .navigationBarsPadding()
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            if (inProgressNav && nextStop != null) {
                                val nextStopLat = nextStop.lat
                                val nextStopLng = nextStop.lng
                                val canNavigate = nextStopLat != null && nextStopLng != null
                                InProgressStopIconBar(
                                    canNavigate = canNavigate,
                                    onOpenNextSite = { onOpenOrder(nextStop.orderId) },
                                    onOpenMap = {
                                        if (nextStopLat != null && nextStopLng != null) {
                                            Intents.navigateTo(context, nextStopLat, nextStopLng, nextStop.customerName)
                                        }
                                    },
                                    onNavigateInApp = {
                                        if (nextStopLat != null && nextStopLng != null) {
                                            navTarget = NavTarget(
                                                nextStopLat,
                                                nextStopLng,
                                                nextStop.customerName,
                                                kind = NavTargetKind.CustomerStop(nextStop.orderId),
                                            )
                                        }
                                    },
                                )
                            } else {
                                val previewOrders = remember(stops) { stops.filter { it.isPending }.take(3) }
                                if (previewOrders.isNotEmpty()) {
                                    StopPreviewList(
                                        stops = previewOrders.map { o ->
                                            StopPreviewItem(
                                                customerName = o.customerName,
                                                shortAddress = o.shortAddress,
                                                orderId = o.orderId,
                                            )
                                        },
                                        onTap = onOpenOrder,
                                    )
                                }
                                RunActionBar(
                                    job = job,
                                    distanceToBranchM = distanceToBranchM,
                                    withinBranch = withinBranch,
                                    primaryLabel = primaryLabel,
                                    acting = state.acting,
                                    error = state.error,
                                    onNavigateBranch = {
                                        if (job.needsPickup) {
                                            Intents.navigateTo(context, job.pickupNavLat, job.pickupNavLng, job.pickupPlaceName)
                                        } else {
                                            Intents.navigateTo(context, job.store.lat, job.store.lng, job.store.name)
                                        }
                                    },
                                    onReject = { showRejectDialog = true },
                                    onPrimaryClick = {
                                        when {
                                            job.needsPickup -> {
                                                pendingPickup = true
                                                needLocation = true
                                            }
                                            job.canStart -> {
                                                pendingStart = true
                                                needLocation = true
                                            }
                                            job.isReturning && withinBranch -> {
                                                val fix = lastFix
                                                if (fix != null) {
                                                    vm.complete(jobId, fix.lat, fix.lng) {
                                                        feedback.completed()
                                                        onFinishRun()
                                                    }
                                                } else {
                                                    needLocation = true
                                                }
                                            }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    navTarget?.let { target ->
        val action: NavPrimaryAction? = when (val kind = target.kind) {
            is NavTargetKind.CustomerStop -> {
                val order = stops.firstOrNull { it.orderId == kind.orderId }
                if (order == null) {
                    null
                } else {
                    NavPrimaryAction.CustomerStop(
                        callEnabled = order.customerPhone.isNotBlank(),
                        onCall = { if (order.customerPhone.isNotBlank()) Intents.dial(context, order.customerPhone) },
                        onOpenOrder = {
                            navTarget = null
                            onOpenOrder(order.orderId)
                        },
                    )
                }
            }
            else -> null
        }

        NavigationScreen(
            destLat = target.lat,
            destLng = target.lng,
            destLabel = target.label,
            onBack = { navTarget = null },
            onOpenGoogleMaps = { Intents.navigateTo(context, target.lat, target.lng, target.label) },
            primaryAction = action,
        )
    }

    if (showRejectDialog) {
        RejectJobDialog(
            submitting = state.acting,
            onDismiss = { if (!state.acting) showRejectDialog = false },
            onSubmit = { reason ->
                vm.reject(jobId, reason) {
                    showRejectDialog = false
                    feedback.success()
                    onFinishRun()
                }
            },
        )
    }
}
