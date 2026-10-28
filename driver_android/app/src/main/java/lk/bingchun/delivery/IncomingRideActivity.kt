package lk.bingchun.delivery

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import lk.bingchun.delivery.core.DriverAlertService
import lk.bingchun.delivery.core.IncomingRideLauncher
import lk.bingchun.delivery.core.RideAlert
import lk.bingchun.delivery.ui.components.DeviceLockLayer
import lk.bingchun.delivery.ui.screens.IncomingRideScreen
import lk.bingchun.delivery.ui.screens.rememberIncomingOfferRoute
import lk.bingchun.delivery.ui.screens.RejectJobDialog
import lk.bingchun.delivery.ui.theme.BingChunTheme

/**
 * Full-screen incoming ride alert — shown via Notification fullScreenIntent
 * even when the app is backgrounded / the screen is locked.
 */
class IncomingRideActivity : ComponentActivity() {

    override fun onDestroy() {
        IncomingRideLauncher.setActivityVisible(null)
        super.onDestroy()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
        )
        setShowWhenLocked(true)
        setTurnScreenOn(true)

        val initialAlert = intentToAlert(intent)
        IncomingRideLauncher.setActivityVisible(initialAlert.jobId)
        val autoAccept = intent.getBooleanExtra(EXTRA_AUTO_ACCEPT, false)
        val app = application as BingChunApp

        setContent {
            BingChunTheme {
                val ringingAlert by DriverAlertService.ringingAlert.collectAsState()
                val alert = ringingAlert?.takeIf { it.jobId == initialAlert.jobId }
                    ?: initialAlert

                var accepting by remember { mutableStateOf(false) }
                var rejecting by remember { mutableStateOf(false) }
                var error by remember { mutableStateOf<String?>(null) }
                var showRejectDialog by remember { mutableStateOf(false) }
                val deviceState by app.container.deviceRequirements.state.collectAsState()
                val offerRoute = rememberIncomingOfferRoute(alert.jobId)

                fun finishReject() {
                    DriverAlertService.passOnOffer(this@IncomingRideActivity, alert)
                    window.decorView.post {
                        if (!isFinishing) finish()
                    }
                }

                fun acceptRide() {
                    accepting = true
                    error = null
                    lifecycleScope.launch {
                        try {
                            app.container.jobsRepository.claimJob(alert.jobId)
                            DriverAlertService.silenceJob(this@IncomingRideActivity, alert.jobId)
                            startActivity(
                                Intent(this@IncomingRideActivity, MainActivity::class.java).apply {
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                                    putExtra(MainActivity.EXTRA_OPEN_JOB_ID, alert.jobId)
                                },
                            )
                            finish()
                        } catch (e: Exception) {
                            accepting = false
                            error = e.message ?: "Could not accept ride"
                        }
                    }
                }

                if (showRejectDialog) {
                    RejectJobDialog(
                        submitting = rejecting,
                        onDismiss = { if (!rejecting) showRejectDialog = false },
                        onSubmit = { reason ->
                            rejecting = true
                            error = null
                            DriverAlertService.beginPostRejectHold(
                                this@IncomingRideActivity,
                                alert.jobId,
                                alert.storeId,
                            )
                            lifecycleScope.launch {
                                try {
                                    app.container.jobsRepository.rejectJob(alert.jobId, reason)
                                    DriverAlertService.silenceJob(this@IncomingRideActivity, alert.jobId)
                                    showRejectDialog = false
                                    rejecting = false
                                    finish()
                                } catch (e: Exception) {
                                    DriverAlertService.cancelPostRejectHold(this@IncomingRideActivity)
                                    rejecting = false
                                    error = e.message ?: "Reject failed"
                                }
                            }
                        },
                    )
                }

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

                    LaunchedEffect(autoAccept, deviceState.isSatisfied, accepting, error) {
                        if (autoAccept && deviceState.isSatisfied && !accepting && error == null) {
                            acceptRide()
                        }
                    }

                    DeviceLockLayer(deviceRequirements = app.container.deviceRequirements)
                }
            }
        }
    }

    companion object {
        const val EXTRA_JOB_ID = "jobId"
        const val EXTRA_RIDE_CODE = "rideCode"
        const val EXTRA_TITLE = "title"
        const val EXTRA_STORE_NAME = "storeName"
        const val EXTRA_STORE_ID = "storeId"
        const val EXTRA_ORDER_COUNT = "orderCount"
        const val EXTRA_TOTAL_CUPS = "totalCups"
        const val EXTRA_EST_KM = "estimatedDistanceKm"
        const val EXTRA_EST_MIN = "estimatedMinutes"
        const val EXTRA_DELIVERY_FEE = "deliveryFee"
        const val EXTRA_STORE_CITY = "storeCity"
        const val EXTRA_DROPOFF_NAME = "dropoffName"
        const val EXTRA_DROPOFF_ADDRESS = "dropoffAddress"
        const val EXTRA_EXTRA_STOP_COUNT = "extraStopCount"
        const val EXTRA_JOB_STATUS = "jobStatus"
        const val EXTRA_ORDER_PREVIEWS_JSON = "orderPreviewsJson"
        const val EXTRA_AUTO_ACCEPT = "autoAccept"

        fun intentToAlert(intent: Intent): RideAlert =
            DriverAlertService.parseAlertFromIntent(intent)
                ?: RideAlert(jobId = intent.getStringExtra(EXTRA_JOB_ID).orEmpty())
    }
}
