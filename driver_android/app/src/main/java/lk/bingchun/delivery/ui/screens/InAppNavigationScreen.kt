package lk.bingchun.delivery.ui.screens

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import lk.bingchun.delivery.core.NavPrimaryAction
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcOutlineButton
import lk.bingchun.delivery.ui.components.GoogleMapsIconButton
import lk.bingchun.delivery.ui.components.NavigationMap
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * Full-screen in-app turn-by-turn-style navigation to a single destination, drawing the road
 * route and the driver's live position instead of handing off to Google Maps. Rendered in its
 * own [Dialog] window (like [lk.bingchun.delivery.ui.components.BcSuccessOverlay]) so it always
 * overlays the screen it was opened from, regardless of that screen's own layout.
 *
 * [primaryAction] surfaces the one job action relevant to why navigation was opened (confirm
 * pickup, complete the ride, or call/open a customer's order) directly on this screen, so the
 * driver doesn't have to back out to the dashboard to act.
 */
@Composable
fun NavigationScreen(
    destLat: Double,
    destLng: Double,
    destLabel: String,
    onBack: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    primaryAction: NavPrimaryAction? = null,
) {
    val colors = LocalBcColors.current
    var recenterRequests by remember { mutableIntStateOf(0) }
    var distanceMeters by remember { mutableStateOf<Double?>(null) }
    var durationSeconds by remember { mutableStateOf<Double?>(null) }

    Dialog(
        onDismissRequest = onBack,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.background),
        ) {
            NavigationMap(
                destLat = destLat,
                destLng = destLng,
                destLabel = destLabel,
                onRouteUpdate = { dist, dur -> distanceMeters = dist; durationSeconds = dur },
                recenterRequests = recenterRequests,
                modifier = Modifier.fillMaxSize(),
            )

            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .statusBarsPadding()
                    .align(Alignment.TopStart)
                    .padding(12.dp)
                    .clip(CircleShape)
                    .background(colors.card.copy(alpha = 0.94f)),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = colors.text)
            }

            IconButton(
                onClick = { recenterRequests++ },
                modifier = Modifier
                    .statusBarsPadding()
                    .align(Alignment.TopEnd)
                    .padding(12.dp)
                    .clip(CircleShape)
                    .background(colors.card.copy(alpha = 0.94f)),
            ) {
                Icon(Icons.Outlined.GpsFixed, contentDescription = "Recenter", tint = colors.brand)
            }

            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(16.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(colors.card)
                    .padding(16.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Navigation, contentDescription = null, tint = colors.brand, modifier = Modifier.padding(end = 8.dp))
                    Text(
                        destLabel,
                        style = BcType.body,
                        color = colors.text,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    GoogleMapsIconButton(onClick = onOpenGoogleMaps)
                }
                Text(
                    formatRouteSummary(distanceMeters, durationSeconds),
                    style = BcType.tiny,
                    color = colors.textMuted,
                    modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
                )
                NavActionRow(primaryAction)
            }
        }
    }
}

@Composable
private fun NavActionRow(action: NavPrimaryAction?) {
    val colors = LocalBcColors.current
    when (action) {
        is NavPrimaryAction.ConfirmPickup -> {
            action.geofenceHint?.let { hint ->
                Text(
                    hint,
                    style = BcType.tiny,
                    color = colors.textMuted,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }
            BcButton(
                label = "Confirm pickup",
                loading = action.loading,
                enabled = action.enabled,
                lockedRed = true,
                onClick = action.onConfirm,
            )
        }
        is NavPrimaryAction.CompleteRide -> {
            BcButton(
                label = "Complete Ride",
                loading = action.loading,
                enabled = action.enabled,
                onClick = action.onComplete,
            )
        }
        is NavPrimaryAction.CustomerStop -> {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                BcOutlineButton(
                    label = "Call",
                    icon = Icons.Filled.Call,
                    enabled = action.callEnabled,
                    onClick = action.onCall,
                    modifier = Modifier.weight(1f),
                )
                if (action.onOpenOrder != null) {
                    BcButton(
                        label = "Open order",
                        onClick = action.onOpenOrder,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        null -> Unit
    }
}

private fun formatRouteSummary(distanceMeters: Double?, durationSeconds: Double?): String {
    if (distanceMeters == null || durationSeconds == null) return "Locating…"
    val distance = if (distanceMeters >= 1000) {
        "%.1f km".format(distanceMeters / 1000)
    } else {
        "${distanceMeters.toInt()} m"
    }
    val minutes = (durationSeconds / 60).toInt().coerceAtLeast(1)
    return "$distance · ~$minutes min"
}
