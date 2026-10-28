package lk.bingchun.delivery.ui.screens

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.JobRefreshBus
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.data.model.DeliveryRoute
import lk.bingchun.delivery.data.model.JobOrder
import lk.bingchun.delivery.ui.JobDetailViewModel
import lk.bingchun.delivery.ui.RequestLocationPermission
import lk.bingchun.delivery.ui.components.BcOutlineButton
import lk.bingchun.delivery.ui.components.MiniRouteMap
import lk.bingchun.delivery.ui.components.StatusChip
import lk.bingchun.delivery.ui.containerViewModel
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun JobDetailScreen(
    jobId: String,
    onBack: () -> Unit,
    onOpenMap: () -> Unit,
    onOpenDashboard: () -> Unit,
    onOpenOrder: (String) -> Unit,
) {
    val vm: JobDetailViewModel = containerViewModel()
    val state by vm.state.collectAsState()
    val colors = LocalBcColors.current
    val context = LocalContext.current
    val feedback = LocalBcFeedback.current
    var needLocation by remember { mutableStateOf(false) }
    var pendingStart by remember { mutableStateOf(false) }
    var pendingPickup by remember { mutableStateOf(false) }
    var showRejectDialog by remember { mutableStateOf(false) }
    var showClaimDialog by remember { mutableStateOf(false) }

    LaunchedEffect(jobId) { vm.load(jobId, force = true) }
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
            vm.pickup(jobId) {}
            return@RequestLocationPermission
        }
        if (granted && pendingStart) {
            pendingStart = false
            if (!tracker.isLocationEnabled()) {
                return@RequestLocationPermission
            }
            feedback.success()
            vm.start(jobId) { onOpenDashboard() }
        } else {
            pendingStart = false
            pendingPickup = false
        }
    }

    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    val seenFirstResume = remember { mutableStateOf(false) }
    androidx.compose.runtime.DisposableEffect(lifecycleOwner, jobId) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                if (seenFirstResume.value) vm.load(jobId, force = true) else seenFirstResume.value = true
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val job = state.job
    val claimableToday = job?.let { it.canAssign && Format.isToday(it.scheduledAt) } ?: false
    val primaryLabel = when {
        job == null -> "…"
        job.status == "COMPLETED" -> "Back"
        job.canAssign && !claimableToday -> "No longer available"
        job.canAssign -> "Claim job"
        job.needsPickup -> "Confirm pickup"
        job.canStart -> "Start run"
        job.isActive -> "Open dashboard"
        else -> "View dashboard"
    }

    Scaffold(
        containerColor = colors.background,
        topBar = {
            lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(lk.bingchun.delivery.ui.theme.heroGradient(true))
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
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

                    val historyView = job?.isHistorySnapshot == true
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (historyView) "Delivery" else "Stops",
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
                                text = "${it.store.name} • ${it.orderCount} stop${if (it.orderCount != 1) "s" else ""}",
                                color = Color.White.copy(alpha = 0.85f),
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    if (historyView) {
                        StatusChip(
                            status = job.status,
                            modifier = Modifier.padding(end = 8.dp),
                        )
                    } else {
                        val statusText = when {
                            job == null -> "Scheduled"
                            job.status == "SCHEDULED" -> "Scheduled"
                            job.needsPickup -> "Pickup"
                            job.canStart -> "Ready"
                            else -> "In Progress"
                        }
                        Box(
                            modifier = Modifier
                                .padding(end = 8.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(colors.successSubtle)
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text(
                                text = statusText,
                                color = colors.success,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
        },
        bottomBar = {
            if (job != null && !job.isHistorySnapshot) {
                Surface(
                    color = colors.card,
                    shadowElevation = 8.dp,
                    border = BorderStroke(1.dp, colors.border),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        state.error?.let {
                            Text(
                                it,
                                color = Color(0xFFDC2626),
                                fontSize = 12.sp,
                                modifier = Modifier.padding(bottom = 8.dp),
                            )
                        }

                        if (job.canReject) {
                            BcOutlineButton(
                                label = "Reject job",
                                onClick = { showRejectDialog = true },
                                enabled = !state.acting,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            )
                        }

                        // Full width Claim button
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (job.canAssign && !claimableToday) Color(0xFF94A3B8) else Color(0xFF0066FF))
                                .clickable(enabled = !state.acting && !(job.canAssign && !claimableToday)) {
                                    feedback.tap()
                                    when {
                                        job.status == "COMPLETED" -> onBack()
                                        job.canAssign -> showClaimDialog = true
                                        job.needsPickup -> {
                                            pendingPickup = true
                                            needLocation = true
                                        }
                                        job.canStart -> {
                                            pendingStart = true
                                            needLocation = true
                                        }
                                        else -> onOpenDashboard()
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (state.acting) {
                                CircularProgressIndicator(
                                    color = Color.White,
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.Center,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = primaryLabel,
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Icon(
                                        Icons.AutoMirrored.Filled.ArrowForwardIos,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(14.dp),
                                    )
                                }
                            }
                        }
                    }
                }
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
                    CircularProgressIndicator(color = colors.brand, modifier = Modifier.align(Alignment.Center))
                }
                job == null -> {
                    Text(
                        state.error ?: "Job not found",
                        color = colors.textMuted,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                else -> {
                    if (job.isHistorySnapshot) {
                        HistoryRunBody(
                            job = job,
                            route = state.route,
                            onOpenMap = onOpenMap,
                            onOpenOrder = onOpenOrder,
                        )
                    } else {
                    val stops = job.orders.sortedBy { it.sequence }
                    // A plain scrolling Column (not LazyColumn) so the embedded osmdroid
                    // MapView below is composed once and stays alive for the life of this
                    // screen, instead of being disposed/recreated every time it scrolls
                    // past the viewport edge (which froze the UI while scrolling). This
                    // screen's content is always a small, bounded set of cards, so there's
                    // no virtualization benefit being given up here.
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        // 1. Job Summary Card
                        lk.bingchun.delivery.ui.components.BcCard(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                Text(
                                    text = Format.deliverySummary(job.orderCount, job.totalCups),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 17.sp,
                                    color = colors.text,
                                )
                                Text(
                                    text = "Pickup · ${job.pickupPlaceName}",
                                    color = colors.text,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    text = "Scheduled ${Format.dateTime(job.scheduledAt)}",
                                    color = colors.textMuted,
                                    fontSize = 12.sp,
                                )

                                Spacer(modifier = Modifier.height(4.dp))

                                // Chips row
                                val route = state.route
                                val stopCount = route?.summary?.stopCount ?: job.orderCount
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    DetailMetaPill("$stopCount stop${if (stopCount != 1) "s" else ""}")
                                    DetailMetaPill(Format.km(route?.summary?.totalDistanceKm ?: job.estimatedDistanceKm ?: 0.0))
                                    DetailMetaPill(Format.minutes(route?.summary?.estimatedMinutes ?: job.estimatedMinutes ?: 0))
                                }
                            }
                        }

                        // 2. Interactive Route Map Card
                        state.route?.let { route ->
                            MiniRouteMap(
                                route = route,
                                onTap = onOpenMap,
                                activeStopSequence = route.nextStopSequence,
                                showDriverLocation = job.isActive,
                                headingToStore = job.headingToStore,
                                gpsActive = false,
                            )
                        }

                        // 3. "Delivery stops" Section
                        Text(
                            "Delivery stops",
                            color = colors.text,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 4.dp),
                        )

                        // 4. Delivery Stop Cards
                        stops.forEachIndexed { index, order ->
                            DeliveryStopDetailCard(
                                index = index,
                                order = order,
                                highlighted = index == 0 && order.isPending,
                                onOpen = { onOpenOrder(order.orderId) },
                            )
                        }

                        Spacer(Modifier.height(16.dp))
                    }
                    }
                }
            }
        }
    }

    if (showClaimDialog && job != null) {
        // Held open while the claim is in flight so the spinner shows; `act` clears `acting`
        // on both success and failure, and navigation away closes it on the happy path.
        var claimStarted by remember(jobId) { mutableStateOf(false) }
        LaunchedEffect(state.acting) {
            if (state.acting) claimStarted = true else if (claimStarted) showClaimDialog = false
        }

        ClaimJobSheet(
            storeName = Format.shortBranchName(job.store.name),
            subtitle = listOfNotNull(
                job.store.city.takeIf { it.isNotBlank() },
                Format.rideIdLabel(job.rideCode, job.id),
            ).joinToString(" · "),
            fee = job.totalDeliveryFees,
            stopCount = job.orderCount,
            distanceKm = job.estimatedDistanceKm,
            minutes = job.estimatedMinutes,
            pickupRadiusM = job.store.completionRadiusM,
            submitting = state.acting,
            onDismiss = { showClaimDialog = false },
            onConfirm = { vm.claim(jobId) { feedback.success(); onOpenDashboard() } },
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
                    onBack()
                }
            },
        )
    }
}

/**
 * Finished-run receipt: earnings, route, and a stop timeline. No live actions.
 */
@Composable
private fun HistoryRunBody(
    job: DeliveryJobDetail,
    route: DeliveryRoute?,
    onOpenMap: () -> Unit,
    onOpenOrder: (String) -> Unit,
) {
    val colors = LocalBcColors.current
    val stops = job.orders.sortedBy { it.sequence }
    val distanceKm = job.actualDistanceKm ?: job.estimatedDistanceKm
    val cupLabel = "${job.totalCups} cup${if (job.totalCups != 1) "s" else ""}"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        lk.bingchun.delivery.ui.components.BcCard(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        ) {
            Text(
                text = "Earned",
                fontSize = 12.sp,
                color = colors.textMuted,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = Format.money(job.totalDeliveryFees),
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = colors.text,
            )
            job.completedAt?.let { completedAt ->
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Completed ${Format.dateTime(completedAt)}",
                    fontSize = 13.sp,
                    color = colors.textMuted,
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DetailMetaPill("${job.deliveredCount}/${job.orderCount} delivered")
            DetailMetaPill(cupLabel)
            DetailMetaPill(if (distanceKm != null) Format.km(distanceKm) else "—")
        }

        route?.let {
            MiniRouteMap(
                route = it,
                onTap = onOpenMap,
                activeStopSequence = null,
                showDriverLocation = false,
                headingToStore = false,
                gpsActive = false,
            )
        }

        Text(
            "Delivery stops",
            color = colors.text,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 4.dp),
        )

        Column {
            stops.forEachIndexed { index, order ->
                HistoryStopTimelineRow(
                    index = index,
                    order = order,
                    isLast = index == stops.lastIndex,
                    onOpen = { onOpenOrder(order.orderId) },
                )
            }
        }

        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun HistoryStopTimelineRow(
    index: Int,
    order: JobOrder,
    isLast: Boolean,
    onOpen: () -> Unit,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    val chipStatus = if (order.isFailed) "DELIVERY_FAILED" else order.status
    val itemsSummary = order.items.joinToString(", ") { "${it.quantity}× ${it.productName}" }
    val complaintLabel = when (order.complaints.size) {
        0 -> null
        1 -> "1 complaint"
        else -> "${order.complaints.size} complaints"
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .padding(top = 14.dp)
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(colors.brandSubtle),
                contentAlignment = Alignment.Center,
            ) {
                val num = order.sequence.takeIf { it > 0 } ?: (index + 1)
                Text(
                    "%02d".format(num),
                    color = colors.brand,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                )
            }
            Spacer(modifier = Modifier.width(10.dp))
            lk.bingchun.delivery.ui.components.BcCard(
                modifier = Modifier.weight(1f),
                onClick = {
                    feedback.tap()
                    onOpen()
                },
                contentPadding = androidx.compose.foundation.layout.PaddingValues(14.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = order.customerName.ifBlank { "Customer" },
                        fontWeight = FontWeight.Bold,
                        color = colors.text,
                        fontSize = 15.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    StatusChip(chipStatus)
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = order.shortAddress.ifBlank { order.city.ifBlank { order.addressLine } },
                    color = colors.text,
                    fontSize = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (itemsSummary.isNotBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = itemsSummary,
                        color = colors.textMuted,
                        fontSize = 12.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                complaintLabel?.let { label ->
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = label,
                        color = colors.warning,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        if (!isLast) {
            Box(
                modifier = Modifier
                    .padding(start = 13.dp)
                    .width(2.dp)
                    .height(14.dp)
                    .background(colors.border),
            )
        }
    }
}

/**
 * Pill tag used for stops, km, and duration inside the summary card.
 */
@Composable
private fun DetailMetaPill(text: String) {
    val colors = LocalBcColors.current
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(colors.surfacePill)
            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(
            text = text,
            color = colors.brand,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/**
 * Styled delivery stop card matching the mockup.
 */
@Composable
private fun DeliveryStopDetailCard(
    index: Int,
    order: JobOrder,
    highlighted: Boolean,
    onOpen: () -> Unit,
) {
    val feedback = LocalBcFeedback.current
    val colors = LocalBcColors.current

    lk.bingchun.delivery.ui.components.BcCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = {
            feedback.tap()
            onOpen()
        },
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
    ) {
        Column {
            // Header Row: Number circle + Customer name + Next pill + Order number + Status
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Circle Badge "01"
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(if (colors.isDark) Color(0xFF1E293B) else Color(0xFFEBF3FF)),
                    contentAlignment = Alignment.Center,
                ) {
                    val num = order.sequence.takeIf { it > 0 } ?: (index + 1)
                    Text(
                        "%02d".format(num),
                        color = if (colors.isDark) Color(0xFF60A5FA) else Color(0xFF0066FF),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                    )
                }

                Spacer(modifier = Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = order.customerName.ifBlank { "Customer" },
                            fontWeight = FontWeight.Bold,
                            color = colors.text,
                            fontSize = 15.sp,
                        )
                        if (highlighted) {
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (colors.isDark) Color(0xFF1E293B) else Color(0xFFEBF3FF))
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                            ) {
                                Text(
                                    "Next",
                                    color = if (colors.isDark) Color(0xFF60A5FA) else Color(0xFF0066FF),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        "#${order.orderNumber} • ${Format.money(order.deliveryFee)}",
                        color = colors.textMuted,
                        fontSize = 12.sp,
                    )
                }

                // Stop status pill
                val (statusText, statusColor, statusBg) = when {
                    order.isFailed -> Triple("Failed", colors.danger, colors.dangerSubtle)
                    order.status == "CANCELLED" -> Triple("Cancelled", colors.danger, colors.dangerSubtle)
                    order.status == "DELIVERED" -> Triple("Delivered", colors.brand, colors.infoSubtle)
                    else -> Triple("Out for delivery", colors.brand, colors.infoSubtle)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(statusBg)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text(
                        text = statusText,
                        color = statusColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Address line
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = colors.brand,
                    modifier = Modifier.size(17.dp),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = order.city.ifBlank { order.addressLine },
                    color = colors.text,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Items list
            val itemsSummary = order.items.joinToString(", ") { "${it.quantity}× ${it.productName}" }
            if (itemsSummary.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = itemsSummary,
                    color = colors.textMuted,
                    fontSize = 12.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
