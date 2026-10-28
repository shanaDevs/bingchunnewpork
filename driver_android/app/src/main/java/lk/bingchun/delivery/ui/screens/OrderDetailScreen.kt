package lk.bingchun.delivery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.Intents
import lk.bingchun.delivery.core.JobRefreshBus
import lk.bingchun.delivery.core.NavPrimaryAction
import lk.bingchun.delivery.core.NavTarget
import lk.bingchun.delivery.core.NavTargetKind
import lk.bingchun.delivery.data.model.DriverComplaint
import lk.bingchun.delivery.data.model.JobOrder
import lk.bingchun.delivery.ui.DashboardViewModel
import lk.bingchun.delivery.ui.OrderActionViewModel
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcCard
import lk.bingchun.delivery.ui.components.BcOutlineButton
import lk.bingchun.delivery.ui.components.BcSuccessOverlay
import lk.bingchun.delivery.ui.components.InfoBadge
import lk.bingchun.delivery.ui.components.StatusChip
import lk.bingchun.delivery.ui.components.StopCustomerActions
import lk.bingchun.delivery.ui.containerViewModel
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors
import lk.bingchun.delivery.ui.theme.heroGradient

@Composable
fun OrderDetailScreen(
    jobId: String,
    orderId: String,
    onBack: () -> Unit,
) {
    val jobVm: DashboardViewModel = containerViewModel()
    val actionVm: OrderActionViewModel = containerViewModel()
    val jobState by jobVm.state.collectAsState()
    val actionState by actionVm.state.collectAsState()
    val colors = LocalBcColors.current
    val context = LocalContext.current
    val feedback = lk.bingchun.delivery.core.LocalBcFeedback.current

    fun orderFromJob(): JobOrder? = jobVm.state.value.job?.orders?.firstOrNull { it.orderId == orderId }

    LaunchedEffect(jobId) { jobVm.load(jobId, force = true) }
    LaunchedEffect(orderId) { actionVm.loadOrder(orderId) { orderFromJob() } }

    var showFailure by remember { mutableStateOf(false) }
    var showComplaint by remember { mutableStateOf(false) }
    var showVerify by remember { mutableStateOf(false) }
    var showDeliveredSuccess by remember { mutableStateOf(false) }
    var earnedOnSuccess by remember { mutableStateOf(0) }
    var navTarget by remember { mutableStateOf<NavTarget?>(null) }

    LaunchedEffect(actionState.error, actionState.otpRequired) {
        if (showVerify && (actionState.error != null || actionState.otpRequired)) {
            feedback.error()
        }
    }

    val order: JobOrder? = actionState.order
        ?: jobState.job?.orders?.firstOrNull { it.orderId == orderId }
    val job = jobState.job
    val nextPendingOrderId = remember(job?.orders) {
        job?.orders?.sortedBy { it.sequence }?.firstOrNull { it.isPending }?.orderId
    }
    val jobKnown = job != null
    val isCurrentStop = order != null && jobKnown && nextPendingOrderId == order.orderId
    val canActOnStop = order != null && order.isPending && job?.pickedUp == true && isCurrentStop
    val stopGateHint = when {
        order == null || !order.isPending -> null
        !jobKnown -> null
        job?.pickedUp != true ->
            "You'll be able to verify this delivery once you've picked up the order from the branch."
        !isCurrentStop -> "Complete the current stop first"
        else -> null
    }

    /** Keeps the dashboard sitting under this screen in sync with what we just did. */
    fun publishOrderUpdate(updated: JobOrder) {
        jobVm.applyOrderUpdate(updated)
        JobRefreshBus.refresh(jobId)
    }

    Scaffold(
        containerColor = colors.background,
        topBar = {
            BcLightStatusBarIcons()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(heroGradient(true))
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
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = order?.let { "#${it.orderNumber}" } ?: "Order",
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            fontSize = 20.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        order?.sequence?.takeIf { it > 0 }?.let { sequence ->
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "Stop %02d".format(sequence),
                                color = Color.White.copy(alpha = 0.85f),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        order?.let {
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                InfoBadge(it.paymentMethod, colors.brand)
                                InfoBadge(
                                    it.paymentStatus,
                                    if (it.paymentStatus == "PAID") colors.success else colors.accent,
                                )
                            }
                        }
                    }
                    order?.let {
                        StatusChip(
                            status = if (it.isFailed) "DELIVERY_FAILED" else it.status,
                            modifier = Modifier.padding(end = 8.dp),
                        )
                    }
                }
            }
        },
        bottomBar = {
            if (order != null && order.isPending) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp)
                        .padding(top = 10.dp, bottom = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (canActOnStop) {
                        StopCustomerActions(
                            canCall = order.customerPhone.isNotBlank(),
                            canNavigate = order.lat != null && order.lng != null,
                            onCall = { Intents.dial(context, order.customerPhone) },
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
                    BcButton(
                        label = "Mark delivered",
                        enabled = canActOnStop,
                        onClick = {
                            if (!canActOnStop) return@BcButton
                            actionVm.clearError()
                            actionVm.clearOtpRequired()
                            showVerify = true
                        },
                    )
                    BcOutlineButton(
                        label = "Report failure",
                        icon = null,
                        enabled = canActOnStop,
                        onClick = {
                            if (!canActOnStop) return@BcOutlineButton
                            actionVm.clearFailureError()
                            showFailure = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    BcOutlineButton(
                        label = "Raise complaint",
                        icon = null,
                        enabled = canActOnStop,
                        onClick = {
                            if (!canActOnStop) return@BcOutlineButton
                            actionVm.clearComplaintError()
                            showComplaint = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                (actionState.loading || jobState.loading) && order == null ->
                    CircularProgressIndicator(color = colors.brand, modifier = Modifier.align(Alignment.Center))
                order == null -> {
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            actionState.loadError ?: jobState.error ?: "This order could not be loaded.",
                            color = colors.textMuted,
                            fontSize = 14.sp,
                            textAlign = TextAlign.Center,
                        )
                        BcOutlineButton(
                            label = "Retry",
                            icon = null,
                            onClick = {
                                jobVm.load(jobId, force = true)
                                actionVm.loadOrder(orderId) { orderFromJob() }
                            },
                        )
                    }
                }
                else -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .imePadding()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        StopStatusCard(
                            order = order,
                            canActOnStop = canActOnStop,
                            gateHint = stopGateHint,
                        )

                        BcCard(modifier = Modifier.fillMaxWidth()) {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    order.customerName.ifBlank { "Customer" },
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 18.sp,
                                    color = colors.text,
                                )
                                Row(verticalAlignment = Alignment.Top) {
                                    Icon(
                                        Icons.Filled.LocationOn,
                                        contentDescription = null,
                                        tint = colors.brand,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        order.fullAddress,
                                        color = colors.text,
                                        fontSize = 14.sp,
                                        lineHeight = 20.sp,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                if (order.customerPhone.isNotBlank()) {
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { Intents.dial(context, order.customerPhone) }
                                            .padding(vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Icon(
                                            Icons.Outlined.Phone,
                                            contentDescription = "Call",
                                            tint = colors.brand,
                                            modifier = Modifier.size(16.dp),
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            order.customerPhone,
                                            color = colors.brand,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    }
                                }
                                order.notes?.takeIf { it.isNotBlank() }?.let {
                                    Text(it, color = colors.accent, fontSize = 13.sp)
                                }
                            }
                        }

                        BcCard(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                "You earn",
                                color = colors.textMuted,
                                fontSize = 12.sp,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                Format.money(order.deliveryFee),
                                color = colors.text,
                                fontWeight = FontWeight.Bold,
                                fontSize = 28.sp,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Delivery fee for this stop",
                                color = colors.textMuted,
                                fontSize = 13.sp,
                            )
                        }

                        BcCard(modifier = Modifier.fillMaxWidth()) {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Items", color = colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                order.items.forEach { item ->
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(colors.brandSubtle)
                                                .padding(horizontal = 8.dp, vertical = 4.dp),
                                        ) {
                                            Text(
                                                "${item.quantity}×",
                                                color = colors.brand,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                            )
                                        }
                                        Spacer(modifier = Modifier.width(10.dp))
                                        Text(
                                            item.productName,
                                            color = colors.text,
                                            fontSize = 14.sp,
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                            }
                        }

                        if (order.complaints.isNotEmpty()) {
                            ComplaintsSection(complaints = order.complaints)
                        }

                        actionState.error?.takeIf { !showVerify }?.let {
                            Text(it, color = colors.errorSoft, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }

    if (showFailure && order != null) {
        FailureSheet(
            submitting = actionState.acting,
            error = actionState.failureError,
            onDismiss = { showFailure = false },
            onSubmit = { outcome, note ->
                actionVm.updateStatus(
                    order.orderId,
                    "DELIVERY_FAILED",
                    note = note,
                    outcome = outcome.apiValue,
                ) { updated ->
                    publishOrderUpdate(updated)
                    showFailure = false
                    onBack()
                }
            },
        )
    }

    navTarget?.let { target ->
        val action: NavPrimaryAction? = when (target.kind) {
            is NavTargetKind.CustomerStop -> order?.let {
                NavPrimaryAction.CustomerStop(
                    callEnabled = it.customerPhone.isNotBlank(),
                    onCall = { if (it.customerPhone.isNotBlank()) Intents.dial(context, it.customerPhone) },
                    onOpenOrder = null,
                )
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

    if (showComplaint && order != null) {
        ComplaintSheet(
            submitting = actionState.filingComplaint,
            error = actionState.complaintError,
            onDismiss = { showComplaint = false },
            onSubmit = { category, description ->
                actionVm.fileComplaint(order.orderId, category, description) {
                    feedback.completed()
                    showComplaint = false
                    actionVm.loadOrder(order.orderId) { orderFromJob() }
                    jobVm.load(jobId, force = true)
                }
            },
        )
    }

    if (showVerify && order != null) {
        DeliveryVerifySheet(
            customerName = order.customerName,
            submitting = actionState.acting,
            sendingCode = actionState.sendingCode,
            codeSent = actionState.codeSent,
            error = actionState.error,
            onDismiss = { showVerify = false },
            onResend = { actionVm.sendCodeToCustomer(order.orderId) },
            onConfirm = { code ->
                actionVm.updateStatus(
                    order.orderId,
                    "DELIVERED",
                    otp = code,
                ) { updated ->
                    feedback.completed()
                    publishOrderUpdate(updated)
                    earnedOnSuccess = order.deliveryFee
                    showVerify = false
                    showDeliveredSuccess = true
                }
            },
        )
    }

    BcSuccessOverlay(
        visible = showDeliveredSuccess,
        title = "Delivered",
        subtitle = if (earnedOnSuccess > 0) "${Format.money(earnedOnSuccess)} earned" else null,
        onFinished = {
            showDeliveredSuccess = false
            onBack()
        },
    )
}

@Composable
private fun StopStatusCard(
    order: JobOrder,
    canActOnStop: Boolean,
    gateHint: String?,
) {
    val colors = LocalBcColors.current
    val finishedFallback = "This order is ${order.status.replace('_', ' ').lowercase()}."
    val (title, detail, tint, iconBg, icon) = when {
        order.isDelivered -> StopStatusTone(
            title = "Delivered",
            detail = "This stop is complete.",
            tint = colors.success,
            iconBg = colors.successSubtle,
            icon = Icons.Filled.Check,
        )
        order.isFailed -> StopStatusTone(
            title = "Delivery failed",
            detail = "Delivery reported as failed.",
            tint = colors.danger,
            iconBg = colors.dangerSubtle,
            icon = Icons.Filled.Close,
        )
        !order.isPending -> StopStatusTone(
            title = order.status.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() },
            detail = finishedFallback,
            tint = colors.textMuted,
            iconBg = colors.surfacePill,
            icon = Icons.Outlined.Schedule,
        )
        canActOnStop -> StopStatusTone(
            title = "Ready to deliver",
            detail = "You can mark this stop delivered.",
            tint = colors.brand,
            iconBg = colors.brandSubtle,
            icon = Icons.Filled.Check,
        )
        else -> StopStatusTone(
            title = "Not ready yet",
            detail = gateHint ?: "Complete the current stop first",
            tint = colors.warning,
            iconBg = colors.warningSubtle,
            icon = Icons.Outlined.Schedule,
        )
    }

    BcCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(iconBg),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = tint, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(modifier = Modifier.height(2.dp))
                Text(detail, color = colors.textMuted, fontSize = 13.sp, lineHeight = 18.sp)
            }
        }
    }
}

private data class StopStatusTone(
    val title: String,
    val detail: String,
    val tint: Color,
    val iconBg: Color,
    val icon: ImageVector,
)

@Composable
private fun ComplaintsSection(complaints: List<DriverComplaint>) {
    val colors = LocalBcColors.current
    BcCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                if (complaints.size == 1) "Your complaint" else "Your complaints",
                style = BcType.section,
                color = colors.text,
            )
            complaints.forEach { complaint ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(complaint.category, fontWeight = FontWeight.SemiBold, color = colors.text, fontSize = 14.sp)
                        InfoBadge(
                            complaint.status.replace('_', ' ').lowercase().replaceFirstChar { it.titlecase() },
                            when (complaint.status) {
                                "CONFIRMED", "RESOLVED" -> colors.success
                                "DISMISSED" -> colors.textMuted
                                else -> colors.accent
                            },
                        )
                    }
                    Text(complaint.description, color = colors.text, fontSize = 13.sp, lineHeight = 18.sp)
                    Text(Format.dateTime(complaint.createdAt), color = colors.textMuted, fontSize = 12.sp)
                }
            }
        }
    }
}
