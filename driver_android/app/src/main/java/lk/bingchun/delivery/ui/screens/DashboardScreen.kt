package lk.bingchun.delivery.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.AltRoute
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.Intents
import lk.bingchun.delivery.core.JobRefreshBus
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.core.NavPrimaryAction
import lk.bingchun.delivery.core.NavTarget
import lk.bingchun.delivery.core.NavTargetKind
import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.data.model.JobOrder
import lk.bingchun.delivery.ui.DashboardViewModel
import lk.bingchun.delivery.ui.RequestLocationPermission
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcOutlineButton
import lk.bingchun.delivery.ui.components.DriverStopCard
import lk.bingchun.delivery.ui.components.GoogleMapsIconButton
import lk.bingchun.delivery.ui.components.MiniRouteMap
import lk.bingchun.delivery.ui.components.RoundActionIcon
import lk.bingchun.delivery.ui.components.StopCustomerActions
import lk.bingchun.delivery.ui.containerViewModel
import lk.bingchun.delivery.ui.theme.BcMotion
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors
import lk.bingchun.delivery.ui.theme.rememberReducedMotion

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    jobId: String,
    onBack: () -> Unit,
    onOpenMap: () -> Unit,
    onOpenOrder: (String) -> Unit,
) {
    val vm: DashboardViewModel = containerViewModel()
    val state by vm.state.collectAsState()
    val colors = LocalBcColors.current
    val context = LocalContext.current
    val feedbackDash = LocalBcFeedback.current
    var needLocation by remember { mutableStateOf(false) }
    var pendingStart by remember { mutableStateOf(false) }
    var pendingPickup by remember { mutableStateOf(false) }
    var showRejectDialog by remember { mutableStateOf(false) }
    var navTarget by remember { mutableStateOf<NavTarget?>(null) }

    LaunchedEffect(jobId) { vm.load(jobId) }
    LaunchedEffect(jobId) {
        JobRefreshBus.droppedRides.collect { droppedId ->
            if (droppedId == jobId) onBack()
        }
    }
    LaunchedEffect(state.job?.id, state.job?.isActive) {
        if (state.job?.isActive == true) needLocation = true
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    val seenFirstResume = remember { mutableStateOf(false) }
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (seenFirstResume.value) vm.load(jobId, force = true) else seenFirstResume.value = true
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
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
            feedbackDash.success()
            vm.pickup(jobId)
            return@RequestLocationPermission
        }
        if (granted && pendingStart) {
            pendingStart = false
            if (!tracker.isLocationEnabled()) {
                vm.start(jobId)
            } else {
                feedbackDash.success()
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
    val pickupUnlockHint = job?.let {
        if (it.needsPickup && it.hasPickupOverride) {
            Format.pickupOverrideHint(distanceToBranchM, it.pickupPlaceName)
        } else {
            Format.pickupUnlockHint(distanceToBranchM, it.store.completionRadiusM, withinBranch)
        }
    }

    Scaffold(
        containerColor = colors.background,
        topBar = {
            BcLightStatusBarIcons()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(lk.bingchun.delivery.ui.theme.heroGradient(true))
                    .statusBarsPadding()
                    .padding(start = 8.dp, end = 16.dp, top = 8.dp, bottom = 18.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Color.White,
                        )
                    }

                    Spacer(modifier = Modifier.width(4.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Active run",
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            fontSize = 20.sp,
                        )
                        job?.let {
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = Format.rideIdLabel(it.rideCode, it.id),
                                color = Color.White.copy(alpha = 0.92f),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "${it.deliveredCount} of ${it.orderCount} stop${if (it.orderCount != 1) "s" else ""} completed • ${it.store.name}",
                                color = Color.White.copy(alpha = 0.85f),
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    // Top-right status chip pill
                    val pillText = when {
                        job == null -> "Pickup"
                        job.needsPickup -> "Pickup"
                        job.canStart -> "Ready"
                        job.isReturning -> "Returning"
                        else -> "Delivering"
                    }
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(colors.successSubtle)
                            .border(1.dp, colors.success.copy(alpha = 0.35f), CircleShape)
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                    ) {
                        Text(
                            text = pillText,
                            color = colors.success,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                        )
                    }
                }
            }
        },
        bottomBar = {
            val currentJob = job
            if (currentJob != null && (
                    currentJob.needsPickup ||
                        currentJob.canStart ||
                        currentJob.isReturning ||
                        (currentJob.pickedUp && nextStop != null)
                    )
            ) {
                ActiveRunBottomBar(
                    job = currentJob,
                    nextStop = nextStop,
                    withinBranch = withinBranch,
                    pickupUnlockHint = pickupUnlockHint,
                    acting = state.acting,
                    error = state.error,
                    onConfirmPickup = {
                        pendingPickup = true
                        needLocation = true
                    },
                    onStart = {
                        pendingStart = true
                        needLocation = true
                    },
                    onNavigateToStop = {
                        val stop = nextStop
                        val lat = stop?.lat
                        val lng = stop?.lng
                        if (stop != null && lat != null && lng != null) {
                            navTarget = NavTarget(
                                lat, lng, stop.customerName,
                                kind = NavTargetKind.CustomerStop(stop.orderId),
                            )
                        }
                    },
                    onCall = {
                        val phone = nextStop?.customerPhone
                        if (!phone.isNullOrBlank()) Intents.dial(context, phone)
                    },
                    onOpenGoogleMaps = {
                        val stop = nextStop
                        val lat = stop?.lat
                        val lng = stop?.lng
                        if (stop != null && lat != null && lng != null) {
                            Intents.navigateTo(context, lat, lng, stop.customerName)
                        }
                    },
                    onContinueToStop = {
                        nextStop?.let { onOpenOrder(it.orderId) }
                    },
                    onCompleteRide = {
                        val fix = lastFix
                        if (fix != null) {
                            vm.complete(jobId, fix.lat, fix.lng) {
                                feedbackDash.completed()
                                onBack()
                            }
                        } else {
                            needLocation = true
                        }
                    },
                )
            }
        },
    ) { padding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .background(colors.background),
        ) {
            when {
                state.loading && job == null -> {
                    CircularProgressIndicator(color = Color(0xFF0066FF), modifier = Modifier.align(Alignment.Center))
                }
                job == null -> {
                    Text(
                        state.error ?: "Job not found",
                        color = colors.textMuted,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                else -> {
                    val reduced = rememberReducedMotion()
                    val rawProgress = if (job.orderCount == 0) 0f else job.deliveredCount.toFloat() / job.orderCount
                    val progress by animateFloatAsState(
                        targetValue = rawProgress,
                        animationSpec = androidx.compose.animation.core.tween(
                            BcMotion.durationMs(BcMotion.SlowMs, reduced),
                            easing = BcMotion.EaseOut,
                        ),
                        label = "runProgress",
                    )

                    // A plain scrolling Column (not LazyColumn) so the embedded osmdroid
                    // MapView below is composed once and stays alive for the life of this
                    // screen. LazyColumn disposes/recreates offscreen items as they scroll
                    // past the viewport edge, which was tearing down and rebuilding the
                    // MapView (and its markers) on every scroll — freezing the UI thread.
                    // This screen's content is always a small, bounded set of cards, so
                    // there's no virtualization benefit being given up here.
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 120.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        // 1. Electric Blue Hero Status Card
                        ActiveHeroCard(
                            job = job,
                            progress = progress,
                            nextStopName = nextStop?.customerName,
                        )

                        // 2. Trip Metrics Chips Row
                        run {
                            val route = state.route
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                val stopCount = route?.summary?.stopCount ?: job.orderCount
                                TripMetricChip(
                                    icon = Icons.Default.LocationOn,
                                    text = "$stopCount stop${if (stopCount != 1) "s" else ""}",
                                    modifier = Modifier.weight(1f),
                                )
                                TripMetricChip(
                                    icon = Icons.AutoMirrored.Outlined.AltRoute,
                                    text = Format.km(route?.summary?.totalDistanceKm ?: job.estimatedDistanceKm ?: 0.0),
                                    modifier = Modifier.weight(1f),
                                )
                                TripMetricChip(
                                    icon = Icons.Outlined.Schedule,
                                    text = Format.minutes(route?.summary?.estimatedMinutes ?: job.estimatedMinutes ?: 0),
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }

                        // 3. Interactive Route Map Card
                        state.route?.let { route ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .shadow(
                                        elevation = 8.dp,
                                        shape = RoundedCornerShape(20.dp),
                                        spotColor = Color(0x180A2647),
                                        ambientColor = Color(0x0C0A2647),
                                    )
                                    .clip(RoundedCornerShape(20.dp)),
                            ) {
                                MiniRouteMap(
                                    route = route,
                                    onTap = onOpenMap,
                                    activeStopSequence = nextStop?.sequence ?: route.nextStopSequence,
                                    showDriverLocation = job.isActive,
                                    headingToStore = job.headingToStore,
                                    gpsActive = job.isActive,
                                )
                            }
                        }

                        // 4. Outlet Pickup Confirmation Card
                        if (job.needsPickup) {
                            OutletPickupCard(
                                storeName = job.pickupPlaceName,
                                distanceM = distanceToBranchM?.let { Format.metresAway(it) },
                                withinBranch = withinBranch,
                                completionRadiusM = job.store.completionRadiusM,
                                geofenceHint = pickupUnlockHint ?: "Getting GPS…",
                                onNavigate = {
                                    navTarget = NavTarget(job.pickupNavLat, job.pickupNavLng, job.pickupPlaceName, kind = NavTargetKind.Pickup)
                                },
                                onOpenGoogleMaps = {
                                    Intents.navigateTo(context, job.pickupNavLat, job.pickupNavLng, job.pickupPlaceName)
                                },
                                onConfirmPickup = {
                                    pendingPickup = true
                                    needLocation = true
                                },
                                onReject = {
                                    showRejectDialog = true
                                },
                                acting = state.acting,
                                isPickupOverride = job.hasPickupOverride,
                            )
                        } else if (job.canStart) {
                            ReadyToStartCard(
                                storeName = job.store.name,
                                acting = state.acting,
                                onStart = {
                                    pendingStart = true
                                    needLocation = true
                                },
                            )
                        } else if (job.isReturning) {
                            ReturnToBranchCard(
                                storeName = job.store.name,
                                distanceM = distanceToBranchM?.toInt(),
                                withinBranch = withinBranch,
                                completionRadiusM = job.store.completionRadiusM,
                                acting = state.acting,
                                onNavigate = {
                                    navTarget = NavTarget(job.store.lat, job.store.lng, job.store.name, kind = NavTargetKind.Return)
                                },
                                onOpenGoogleMaps = {
                                    Intents.navigateTo(context, job.store.lat, job.store.lng, job.store.name)
                                },
                                onComplete = {
                                    val fix = lastFix
                                    if (fix != null) {
                                        vm.complete(jobId, fix.lat, fix.lng) {
                                            feedbackDash.completed()
                                            onBack()
                                        }
                                    } else {
                                        needLocation = true
                                    }
                                },
                            )
                        }

                        // 5. Orders / delivery stops — visible after accept so the rider can
                        // review what to pick up. Call / Navigate stay locked until pickup.
                        if (stops.isNotEmpty()) {
                            Text(
                                if (job.needsPickup) "Orders to pick up" else "Delivery stops",
                                color = colors.text,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(top = 4.dp),
                            )

                            stops.forEachIndexed { index, order ->
                                val isNext = nextStop?.orderId == order.orderId
                                DriverStopCard(
                                    stopNumber = order.sequence.takeIf { it > 0 } ?: (index + 1),
                                    order = order,
                                    highlighted = job.pickedUp && isNext,
                                    showItems = true,
                                    showCustomerActions = job.pickedUp && isNext,
                                    onOpen = {
                                        feedbackDash.tap()
                                        onOpenOrder(order.orderId)
                                    },
                                    onCall = {
                                        if (order.customerPhone.isNotBlank()) Intents.dial(context, order.customerPhone)
                                    },
                                    onNavigate = {
                                        val lat = order.lat
                                        val lng = order.lng
                                        if (lat != null && lng != null) {
                                            navTarget = NavTarget(
                                                lat, lng, order.customerName,
                                                kind = NavTargetKind.CustomerStop(order.orderId),
                                            )
                                        }
                                    },
                                    onOpenGoogleMaps = {
                                        val lat = order.lat
                                        val lng = order.lng
                                        if (lat != null && lng != null) {
                                            Intents.navigateTo(context, lat, lng, order.customerName)
                                        }
                                    },
                                )
                            }
                        }

                        Spacer(Modifier.height(16.dp))
                    }
                }
            }
        }
    }

    navTarget?.let { target ->
        val action: NavPrimaryAction? = when (val kind = target.kind) {
            is NavTargetKind.Pickup -> NavPrimaryAction.ConfirmPickup(
                enabled = withinBranch,
                loading = state.acting,
                geofenceHint = pickupUnlockHint,
                onConfirm = {
                    pendingPickup = true
                    needLocation = true
                },
            )
            is NavTargetKind.Return -> NavPrimaryAction.CompleteRide(
                enabled = withinBranch,
                loading = state.acting,
                onComplete = {
                    val fix = lastFix
                    if (fix != null) {
                        vm.complete(jobId, fix.lat, fix.lng) {
                            feedbackDash.completed()
                            navTarget = null
                            onBack()
                        }
                    } else {
                        needLocation = true
                    }
                },
            )
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
            null -> null
        }

        // Auto-dismiss once the condition that opened this nav screen is no longer true
        // (e.g. pickup got confirmed from elsewhere), so it doesn't linger stale.
        LaunchedEffect(target.kind, job?.needsPickup) {
            if (target.kind is NavTargetKind.Pickup && job?.needsPickup != true) {
                navTarget = null
            }
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
                    feedbackDash.success()
                    onBack()
                }
            },
        )
    }
}

/**
 * Electric blue hero card showing active run progress.
 */
@Composable
private fun ActiveHeroCard(
    job: DeliveryJobDetail,
    progress: Float,
    nextStopName: String?,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 8.dp,
                shape = RoundedCornerShape(20.dp),
                spotColor = Color(0x200A2647),
                ambientColor = Color(0x0C0A2647),
            )
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF0066FF),
                        Color(0xFF005CE6),
                    ),
                ),
            )
            .padding(16.dp),
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Circular White Icon Container
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(Color.White),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Outlined.LocalShipping,
                        contentDescription = null,
                        tint = Color(0xFF0066FF),
                        modifier = Modifier.size(26.dp),
                    )
                }

                Spacer(modifier = Modifier.width(14.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = when {
                            job.needsPickup -> "Pickup in progress"
                            job.canStart -> "Pickup completed"
                            job.isReturning -> "Returning to branch"
                            else -> "Delivery in progress"
                        },
                        color = Color.White.copy(alpha = 0.85f),
                        fontSize = 13.sp,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = Format.deliverySummary(job.orderCount, job.totalCups),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = when {
                            job.needsPickup -> "Confirm pickup at ${job.store.name}"
                            job.canStart -> "Ready to start delivery"
                            nextStopName != null -> "Delivering to $nextStopName"
                            else -> "Return to ${job.store.name}"
                        },
                        color = Color.White.copy(alpha = 0.85f),
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Progress bar
            LinearProgressIndicator(
                progress = { progress },
                color = Color.White,
                trackColor = Color.White.copy(alpha = 0.35f),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(5.dp)
                    .clip(RoundedCornerShape(999.dp)),
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "${job.deliveredCount} of ${job.orderCount} completed",
                color = Color.White.copy(alpha = 0.85f),
                fontSize = 12.sp,
            )
        }
    }
}

/**
 * Metric chip for trip summary (stops, distance, time).
 */
@Composable
private fun TripMetricChip(
    icon: ImageVector,
    text: String,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = modifier
            .shadow(
                elevation = 4.dp,
                shape = RoundedCornerShape(14.dp),
                spotColor = Color(0x100A2647),
                ambientColor = Color(0x080A2647),
            )
            .clip(RoundedCornerShape(14.dp))
            .background(colors.card)
            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 11.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = colors.brand,
                modifier = Modifier.size(17.dp),
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = text,
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                maxLines = 1,
            )
        }
    }
}

/**
 * Stop Action Card: Confirm pickup at outlet matching the mockup.
 */
@Composable
private fun OutletPickupCard(
    storeName: String,
    distanceM: Int?,
    withinBranch: Boolean,
    completionRadiusM: Int,
    geofenceHint: String,
    onNavigate: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    onConfirmPickup: () -> Unit,
    onReject: () -> Unit,
    acting: Boolean,
    isPickupOverride: Boolean = false,
) {
    val feedback = LocalBcFeedback.current
    val colors = LocalBcColors.current

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 10.dp,
                shape = RoundedCornerShape(20.dp),
                spotColor = Color(0x200A2647),
                ambientColor = Color(0x0E0A2647),
            )
            .clip(RoundedCornerShape(20.dp))
            .background(colors.card)
            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(20.dp))
            .padding(18.dp),
    ) {
        Column {
            // Header Row: Badge 1 + Title + Distance pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(colors.brand),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("1", color = colors.onBrand, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }

                Spacer(modifier = Modifier.width(10.dp))

                Text(
                    text = if (isPickupOverride) "Confirm pickup" else "Confirm pickup at the outlet",
                    color = colors.text,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    modifier = Modifier.weight(1f),
                )

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (withinBranch) colors.successSubtle else colors.surfacePill)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    val distLabel = distanceM?.let { "$it m away" } ?: "Getting GPS…"
                    Text(
                        text = distLabel,
                        color = if (withinBranch) colors.success else colors.textMuted,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp,
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Outlet Branch Row
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(colors.iconTile),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Outlined.Storefront,
                        contentDescription = null,
                        tint = colors.brand,
                        modifier = Modifier.size(18.dp),
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = storeName,
                    color = colors.text,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Proximity rule banner
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(colors.infoSubtle)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Outlined.VerifiedUser,
                        contentDescription = null,
                        tint = colors.brand,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isPickupOverride) {
                            "No location check needed — you were assigned directly to this pickup."
                        } else {
                            "Pickup confirmation is available within ${completionRadiusM} m of the branch."
                        },
                        color = colors.text,
                        fontSize = 12.5.sp,
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = geofenceHint,
                color = colors.textMuted,
                fontSize = 12.sp,
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Action 1: Navigate to branch (in-app) + Google Maps fallback
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(colors.card)
                        .border(BorderStroke(1.2.dp, colors.brand), RoundedCornerShape(12.dp))
                        .clickable {
                            feedback.tap()
                            onNavigate()
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.Navigation,
                            contentDescription = null,
                            tint = colors.brand,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Navigate to branch",
                            color = colors.brand,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )
                    }
                }
                GoogleMapsIconButton(onClick = onOpenGoogleMaps)
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Action 2: Confirm pickup
            val canConfirmPickup = withinBranch && !acting
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        if (withinBranch || acting) colors.brand else colors.dangerSubtle,
                    )
                    .clickable(enabled = canConfirmPickup) {
                        feedback.tap()
                        onConfirmPickup()
                    },
                contentAlignment = Alignment.Center,
            ) {
                if (acting) {
                    CircularProgressIndicator(color = colors.onBrand, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    val actionColor = if (withinBranch) colors.onBrand else colors.danger
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = actionColor,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Confirm pickup",
                            color = actionColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Action 3: Reject job
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !acting) {
                        feedback.tap()
                        onReject()
                    }
                    .padding(vertical = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Outlined.Warning,
                        contentDescription = null,
                        tint = Color(0xFFDC2626),
                        modifier = Modifier.size(17.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Reject job",
                        color = Color(0xFFDC2626),
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                }
            }
        }
    }
}

/**
 * Stop Action Card: Ready to start delivery.
 */
@Composable
private fun ReadyToStartCard(
    storeName: String,
    acting: Boolean,
    onStart: () -> Unit,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 10.dp,
                shape = RoundedCornerShape(20.dp),
                spotColor = Color(0x200A2647),
                ambientColor = Color(0x0E0A2647),
            )
            .clip(RoundedCornerShape(20.dp))
            .background(colors.card)
            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(20.dp))
            .padding(18.dp),
    ) {
        Column {
            Text(
                "Ready to start delivery?",
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Parcels are collected from $storeName. Start delivery to route to the first customer stop.",
                color = colors.textMuted,
                fontSize = 13.sp,
            )
            Spacer(modifier = Modifier.height(14.dp))
            BcButton(
                label = "Start delivery",
                loading = acting,
                onClick = onStart,
            )
        }
    }
}

/**
 * Stop Action Card: Return to branch to complete.
 */
@Composable
private fun ReturnToBranchCard(
    storeName: String,
    distanceM: Int?,
    withinBranch: Boolean,
    completionRadiusM: Int,
    acting: Boolean,
    onNavigate: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    onComplete: () -> Unit,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 10.dp,
                shape = RoundedCornerShape(20.dp),
                spotColor = Color(0x200A2647),
                ambientColor = Color(0x0E0A2647),
            )
            .clip(RoundedCornerShape(20.dp))
            .background(colors.card)
            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(20.dp))
            .padding(18.dp),
    ) {
        Column {
            Text(
                "Return to branch to complete",
                color = colors.text,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
            Spacer(modifier = Modifier.height(4.dp))
            val distHint = distanceM?.let { "$it m away" } ?: "Getting GPS…"
            Text(
                if (withinBranch) {
                    "You are within ${completionRadiusM}m of $storeName. Complete Ride is available."
                } else {
                    "Navigate back to $storeName ($distHint). Complete Ride unlocks within ${completionRadiusM}m."
                },
                color = colors.textMuted,
                fontSize = 13.sp,
            )
            Spacer(modifier = Modifier.height(14.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(colors.surfaceElevated)
                        .border(1.dp, colors.border, RoundedCornerShape(12.dp))
                        .clickable(onClick = onNavigate),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            Icons.Filled.Navigation,
                            contentDescription = null,
                            tint = colors.text,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            "Navigate to branch",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                            color = colors.text,
                        )
                    }
                }
                GoogleMapsIconButton(onClick = onOpenGoogleMaps)
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (withinBranch) colors.brand else colors.disabled)
                    .clickable(enabled = withinBranch && !acting, onClick = onComplete),
                contentAlignment = Alignment.Center,
            ) {
                if (acting) {
                    CircularProgressIndicator(
                        color = colors.onBrand,
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text(
                        "Complete Ride",
                        color = colors.onBrand,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun ActiveRunBottomBar(
    job: DeliveryJobDetail,
    nextStop: JobOrder?,
    withinBranch: Boolean,
    pickupUnlockHint: String?,
    acting: Boolean,
    error: String?,
    onConfirmPickup: () -> Unit,
    onStart: () -> Unit,
    onNavigateToStop: () -> Unit,
    onCall: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    onContinueToStop: () -> Unit,
    onCompleteRide: () -> Unit,
) {
    val colors = LocalBcColors.current
    Surface(
        color = colors.card,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        shadowElevation = 14.dp,
        border = BorderStroke(1.dp, colors.border),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            error?.let {
                Text(it, color = colors.danger, fontSize = 12.sp)
            }
            when {
                job.needsPickup -> {
                    Text(
                        if (job.hasPickupOverride) "Confirm pickup" else "Confirm pickup at the outlet",
                        color = colors.text,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                    Text(
                        pickupUnlockHint ?: "Getting GPS…",
                        color = colors.textMuted,
                        fontSize = 12.sp,
                    )
                    BcButton(
                        label = "Confirm pickup",
                        loading = acting,
                        enabled = withinBranch,
                        lockedRed = !job.hasPickupOverride && !withinBranch,
                        onClick = onConfirmPickup,
                    )
                }
                job.canStart -> {
                    Text(
                        "Ready to start delivery?",
                        color = colors.text,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                    BcButton(
                        label = "Start delivery",
                        loading = acting,
                        onClick = onStart,
                    )
                }
                job.isReturning -> {
                    Text(
                        "Return to branch to complete",
                        color = colors.text,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                    BcButton(
                        label = "Complete Ride",
                        loading = acting,
                        enabled = withinBranch,
                        lockedRed = !withinBranch,
                        onClick = onCompleteRide,
                    )
                }
                nextStop != null -> {
                    val stopNumber = nextStop.sequence.takeIf { it > 0 } ?: 1
                    Text(
                        "Stop ${stopNumber.toString().padStart(2, '0')} · ${nextStop.customerName.ifBlank { "Customer" }}",
                        color = colors.text,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    StopCustomerActions(
                        canCall = nextStop.customerPhone.isNotBlank(),
                        canNavigate = nextStop.lat != null && nextStop.lng != null,
                        onCall = onCall,
                        onNavigate = onNavigateToStop,
                        onOpenGoogleMaps = onOpenGoogleMaps,
                        extra = {
                            RoundActionIcon(
                                caption = "Continue",
                                icon = Icons.AutoMirrored.Filled.ArrowForward,
                                onClick = onContinueToStop,
                                filled = true,
                            )
                        },
                    )
                }
            }
        }
    }
}
