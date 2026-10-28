package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.DriverAlertService
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

private val PageBg = Color(0xFFF3F6FB)
private val Navy = Color(0xFF0B2A6B)
private val DropRed = Color(0xFFE11D48)

/**
 * Full-screen in-app takeover when a stop on the active ride is cancelled.
 * Heads-up notifications are suppressed while MainActivity is resumed, so this
 * is the alert the rider actually sees mid-run.
 */
@Composable
fun OrderCancelledOverlay() {
    val context = LocalContext.current
    val pending by DriverAlertService.pendingCancellations.collectAsState()
    val alert = pending.firstOrNull() ?: return
    val app = context.applicationContext as BingChunApp
    val colors = LocalBcColors.current
    val label = alert.displayNumber

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
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(PageBg),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            DropRed,
                            shape = RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp),
                        )
                        .statusBarsPadding()
                        .padding(horizontal = 24.dp, vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.18f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Cancel,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(40.dp),
                        )
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "ORDER CANCELLED",
                        color = Color.White,
                        style = BcType.title.copy(fontWeight = FontWeight.Bold),
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = label,
                        color = Color.White,
                        style = BcType.largeTitle,
                        textAlign = TextAlign.Center,
                    )
                }

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 24.dp, vertical = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Skip this stop. Do not deliver it — it has been marked Cancelled on your run.",
                        color = Navy,
                        style = BcType.body,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = "Continue with any remaining stops on this ride.",
                        color = colors.textMuted,
                        style = BcType.caption,
                        textAlign = TextAlign.Center,
                    )
                }

                Button(
                    onClick = {
                        DriverAlertService.acknowledgeCancellation(context, alert.orderId)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 16.dp)
                        .height(52.dp),
                    shape = BcRadius.buttonShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Navy,
                        contentColor = Color.White,
                    ),
                ) {
                    Text("Got it — skip this stop", style = BcType.button)
                }
            }
            DeviceLockLayer(deviceRequirements = app.container.deviceRequirements)
        }
    }
}
