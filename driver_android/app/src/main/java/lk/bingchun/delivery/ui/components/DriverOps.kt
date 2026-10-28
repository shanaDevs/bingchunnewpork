package lk.bingchun.delivery.ui.components

import android.content.Intent
import android.provider.Settings
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material.icons.outlined.GpsNotFixed
import androidx.compose.material.icons.outlined.GpsOff
import androidx.compose.material.icons.outlined.LocationOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.delay
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.ui.theme.BcMotion
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcSpacing
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

enum class GpsUiState {
    ACTIVE,
    SEARCHING,
    DISABLED,
    PERMISSION,
}

/** Binds to the real LocationTracker — never invents a GPS-active state. */
@Composable
fun GpsStatusBanner(
    runActive: Boolean,
    onRequestPermission: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    val context = LocalContext.current
    val tracker = (context.applicationContext as BingChunApp).container.locationTracker
    val runTracking by tracker.runTracking.collectAsState()
    var state by remember { mutableStateOf<GpsUiState?>(null) }

    fun refresh() {
        state = when {
            !tracker.hasPermission() -> GpsUiState.PERMISSION
            !tracker.isLocationEnabled() -> GpsUiState.DISABLED
            runActive && runTracking -> GpsUiState.ACTIVE
            runActive -> GpsUiState.SEARCHING
            else -> null
        }
    }

    LifecycleResumeEffect(runActive, runTracking) {
        refresh()
        onPauseOrDispose { }
    }
    LaunchedEffect(runActive, runTracking) { refresh() }

    val ui = state ?: return
    val (icon, title, message, action) = when (ui) {
        GpsUiState.ACTIVE -> Quad(
            Icons.Outlined.GpsFixed,
            "GPS active",
            "Tracking this run.",
            null,
        )
        GpsUiState.SEARCHING -> Quad(
            Icons.Outlined.GpsNotFixed,
            "Finding your location…",
            "Stay outdoors if this takes more than a few seconds.",
            null,
        )
        GpsUiState.DISABLED -> Quad(
            Icons.Outlined.GpsOff,
            "Location is off",
            "Turn on location to start GPS tracking.",
            "Open settings",
        )
        GpsUiState.PERMISSION -> Quad(
            Icons.Outlined.LocationOff,
            "Location permission required",
            "Delivery tracking needs your location.",
            "Allow location",
        )
    }
    val tint = when (ui) {
        GpsUiState.ACTIVE -> colors.success
        GpsUiState.SEARCHING -> colors.brand
        GpsUiState.DISABLED, GpsUiState.PERMISSION -> colors.warning
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(BcRadius.mdShape)
            .background(tint.copy(alpha = 0.12f))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(icon, contentDescription = title, tint = tint, modifier = Modifier.size(20.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = BcType.bodyStrong, color = tint)
            Text(message, style = BcType.tiny, color = colors.textMuted)
        }
        if (action != null) {
            BcTextButton(
                label = action,
                onClick = {
                    when (ui) {
                        GpsUiState.PERMISSION -> onRequestPermission()
                        GpsUiState.DISABLED -> {
                            context.startActivity(
                                Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        }
                        else -> Unit
                    }
                },
            )
        }
    }
}

/**
 * Status-aware action content for an active run: contextual copy, "Navigate to branch",
 * "Reject job", and the primary action button. Purely presentational — behaviour is driven
 * entirely by the passed lambdas so it can be reused inside a bottom bar (dashboard) or a
 * floating card (full-screen map) without either screen sharing a ViewModel.
 */
@Composable
fun RunActionBar(
    job: DeliveryJobDetail,
    distanceToBranchM: Double?,
    withinBranch: Boolean,
    primaryLabel: String?,
    acting: Boolean,
    error: String?,
    onNavigateBranch: () -> Unit,
    onPrimaryClick: () -> Unit,
    onReject: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    Column(modifier = modifier) {
        error?.let {
            Text(it, color = colors.errorSoft, style = BcType.caption, modifier = Modifier.padding(bottom = 8.dp))
        }
        if (job.needsPickup) {
            Text(
                if (job.hasPickupOverride) "Confirm pickup" else "Confirm pickup at the outlet",
                style = BcType.bodyStrong,
                color = colors.text,
            )
            Text(
                if (job.hasPickupOverride) {
                    Format.pickupOverrideHint(distanceToBranchM, job.pickupPlaceName)
                } else {
                    Format.pickupUnlockHint(distanceToBranchM, job.store.completionRadiusM, withinBranch)
                },
                style = BcType.caption,
                color = colors.textMuted,
                modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
            )
            if (!withinBranch) {
                BcOutlineButton(
                    label = "Navigate to branch",
                    icon = Icons.Filled.Navigation,
                    onClick = onNavigateBranch,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                )
            }
        } else if (job.canStart) {
            Text("Ready to start delivery?", style = BcType.bodyStrong, color = colors.text)
            Text(
                "Pickup is done. Start delivery to navigate to the first customer.",
                style = BcType.caption,
                color = colors.textMuted,
                modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
            )
        } else if (job.isReturning) {
            Text("Return to branch to complete", style = BcType.bodyStrong, color = colors.text)
            val distHint = distanceToBranchM?.let { "${it.toInt()}m away" } ?: "Getting GPS…"
            Text(
                if (withinBranch) {
                    "You are within ${job.store.completionRadiusM}m — Complete Ride is available."
                } else {
                    "Navigate back to ${Format.shortBranchName(job.store.name)} ($distHint). Complete Ride unlocks within ${job.store.completionRadiusM}m."
                },
                style = BcType.caption,
                color = colors.textMuted,
                modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
            )
            BcOutlineButton(
                label = "Navigate to branch",
                icon = Icons.Filled.Navigation,
                onClick = onNavigateBranch,
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            )
        }
        if (job.canReject) {
            BcOutlineButton(
                label = "Reject job",
                onClick = onReject,
                enabled = !acting,
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            )
        }
        if (primaryLabel != null) {
            BcButton(
                label = primaryLabel,
                loading = acting,
                enabled = if (job.needsPickup || job.isReturning) withinBranch else true,
                lockedRed = job.needsPickup && !job.hasPickupOverride && !withinBranch,
                onClick = onPrimaryClick,
            )
        }
    }
}

private data class Quad<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

@Composable
fun SettingRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    trailing: @Composable () -> Unit,
) {
    val colors = LocalBcColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, style = BcType.body, color = colors.text)
            if (subtitle != null) {
                Text(subtitle, style = BcType.caption, color = colors.textMuted)
            }
        }
        trailing()
    }
}

@Composable
fun HistorySummaryRow(
    runs: Int,
    deliveries: Int,
    earned: Int,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        SummaryCell("$runs", "Runs")
        Box(
            Modifier
                .width(1.dp)
                .height(36.dp)
                .background(colors.border),
        )
        SummaryCell("$deliveries", "Deliveries")
        Box(
            Modifier
                .width(1.dp)
                .height(36.dp)
                .background(colors.border),
        )
        SummaryCell(lk.bingchun.delivery.core.Format.money(earned), "Earned")
    }
}

@Composable
private fun SummaryCell(value: String, label: String) {
    val colors = LocalBcColors.current
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = BcType.amount, color = colors.text)
        Text(label, style = BcType.tiny, color = colors.textMuted)
    }
}

/**
 * Filled stat tile — the same value-over-label pairing as [SummaryCell], but on its own
 * surface so a row of them reads as distinct figures without needing divider rules.
 * [accent] lifts the headline figure (the fee) above its neighbours.
 */
@Composable
fun BcStatTile(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Boolean = false,
) {
    val colors = LocalBcColors.current
    Column(
        modifier = modifier
            .clip(BcRadius.mdShape)
            .background(colors.iconTile)
            .padding(vertical = BcSpacing.md, horizontal = BcSpacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(BcSpacing.xxs),
    ) {
        Text(
            value,
            modifier = Modifier.fillMaxWidth(),
            style = BcType.amount.copy(fontSize = 16.sp, lineHeight = 20.sp),
            color = if (accent) colors.brand else colors.text,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            label,
            modifier = Modifier.fillMaxWidth(),
            style = BcType.tiny,
            color = colors.textMuted,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BcConfirmationSheet(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    confirming: Boolean = false,
    details: List<Pair<String, String>> = emptyList(),
) {
    val colors = LocalBcColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = colors.card,
        shape = BcRadius.xxlShape,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(BcSpacing.md),
        ) {
            Text(title, style = BcType.subtitle, color = colors.text)
            Text(message, style = BcType.body, color = colors.textMuted)
            details.forEach { (k, v) ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(k, style = BcType.caption, color = colors.textMuted)
                    Text(v, style = BcType.bodyStrong, color = colors.text)
                }
            }
            BcButton(
                label = if (confirming) "Working…" else confirmLabel,
                onClick = onConfirm,
                loading = confirming,
            )
            BcTextButton(label = "Cancel", onClick = onDismiss, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
fun BcSuccessOverlay(
    visible: Boolean,
    title: String,
    subtitle: String? = null,
    onFinished: () -> Unit,
) {
    if (!visible) return
    val colors = LocalBcColors.current
    var play by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (play) 1f else 0.72f,
        animationSpec = tween(BcMotion.SuccessMs, easing = BcMotion.EaseOut),
        label = "successScale",
    )
    LaunchedEffect(visible) {
        play = true
        delay(BcMotion.SuccessMs.toLong())
        onFinished()
    }
    Dialog(
        onDismissRequest = onFinished,
        properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
    ) {
        Column(
            modifier = Modifier
                .clip(BcRadius.xlShape)
                .background(colors.card)
                .padding(horizontal = 28.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Outlined.CheckCircle,
                contentDescription = title,
                tint = colors.success,
                modifier = Modifier
                    .size(56.dp)
                    .graphicsLayer { scaleX = scale; scaleY = scale },
            )
            Spacer(Modifier.height(12.dp))
            Text(title, style = BcType.subtitle, color = colors.text)
            if (subtitle != null) {
                Spacer(Modifier.height(4.dp))
                Text(subtitle, style = BcType.caption, color = colors.success)
            }
        }
    }
}
