package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.DriverAlertService
import lk.bingchun.delivery.core.IncomingRideLauncher
import lk.bingchun.delivery.ui.screens.IncomingRideScreen
import lk.bingchun.delivery.ui.screens.rememberIncomingOfferRoute
import lk.bingchun.delivery.ui.screens.RejectJobDialog

/**
 * Full-screen in-app takeover when a ride is ringing and the main activity is visible.
 */
@Composable
fun IncomingRideOverlay(
    onOpenJob: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val activeAlerts by DriverAlertService.activeAlerts.collectAsState()
    val ringingAlert by DriverAlertService.ringingAlert.collectAsState()
    val holdActive by DriverAlertService.postRejectHoldActive.collectAsState()
    val app = context.applicationContext as BingChunApp

    var isResumed by remember { mutableStateOf(false) }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            isResumed = when (event) {
                Lifecycle.Event.ON_RESUME -> true
                Lifecycle.Event.ON_PAUSE -> false
                else -> isResumed
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        isResumed = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val baseAlert = ringingAlert ?: activeAlerts.firstOrNull()?.takeUnless { holdActive }
    val showOverlay = baseAlert != null &&
        isResumed &&
        IncomingRideLauncher.activityVisibleJobId != baseAlert.jobId

    if (!showOverlay || baseAlert == null) return

    val alert = ringingAlert?.takeIf { it.jobId == baseAlert.jobId } ?: baseAlert

    var accepting by remember(alert.jobId) { mutableStateOf(false) }
    var rejecting by remember(alert.jobId) { mutableStateOf(false) }
    var error by remember(alert.jobId) { mutableStateOf<String?>(null) }
    var showRejectDialog by remember(alert.jobId) { mutableStateOf(false) }
    val offerRoute = rememberIncomingOfferRoute(alert.jobId)

    fun finishReject() {
        DriverAlertService.passOnOffer(context, alert)
    }

    fun acceptRide() {
        accepting = true
        error = null
        lifecycleOwner.lifecycleScope.launch {
            try {
                app.container.jobsRepository.claimJob(alert.jobId)
                DriverAlertService.silenceJob(context, alert.jobId)
                onOpenJob(alert.jobId)
            } catch (e: Exception) {
                accepting = false
                error = e.message ?: "Could not accept ride"
            }
        }
    }

    fun submitApiReject(reason: String) {
        rejecting = true
        error = null
        DriverAlertService.beginPostRejectHold(context, alert.jobId, alert.storeId)
        lifecycleOwner.lifecycleScope.launch {
            try {
                app.container.jobsRepository.rejectJob(alert.jobId, reason)
                DriverAlertService.silenceJob(context, alert.jobId)
                showRejectDialog = false
                rejecting = false
            } catch (e: Exception) {
                DriverAlertService.cancelPostRejectHold(context)
                rejecting = false
                error = e.message ?: "Reject failed"
            }
        }
    }

    if (showRejectDialog) {
        RejectJobDialog(
            submitting = rejecting,
            onDismiss = { if (!rejecting) showRejectDialog = false },
            onSubmit = { reason -> submitApiReject(reason) },
        )
    }

    Dialog(
        onDismissRequest = { },
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            IncomingRideScreen(
                alert = alert,
                accepting = accepting,
                rejecting = rejecting,
                error = error,
                route = offerRoute,
                onAccept = { acceptRide() },
                onReject = {
                    if (alert.canApiReject) {
                        showRejectDialog = true
                    } else {
                        finishReject()
                    }
                },
                onTimedOut = { finishReject() },
            )
            DeviceLockLayer(deviceRequirements = app.container.deviceRequirements)
        }
    }
}
