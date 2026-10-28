package lk.bingchun.delivery.ui.components

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.GpsOff
import androidx.compose.material.icons.outlined.SignalWifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.DeviceRequirementState
import lk.bingchun.delivery.core.DeviceRequirements
import lk.bingchun.delivery.ui.theme.BcSpacing
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * Full-screen blocking overlay when GPS or internet is off.
 * Covers login, home, jobs, and incoming ride — nothing underneath is tappable.
 */
@Composable
fun DeviceLockOverlay(
    state: DeviceRequirementState,
    modifier: Modifier = Modifier,
) {
    if (state.isSatisfied) return

    val colors = LocalBcColors.current
    val context = LocalContext.current

    Box(
        modifier = modifier
            .fillMaxSize()
            .zIndex(100f)
            .background(colors.background)
            .clickable(
                indication = null,
                interactionSource = remember { MutableInteractionSource() },
                onClick = { /* swallow taps */ },
            )
            .statusBarsPadding()
            .padding(horizontal = BcSpacing.xl, vertical = BcSpacing.xxl),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(BcSpacing.md),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = "Rider App locked",
                style = BcType.title,
                color = colors.text,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "රයිඩර් ඇප් අගුලු දමා ඇත",
                style = BcType.body,
                color = colors.textMuted,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(BcSpacing.md))

            if (state.needsGps) {
                Icon(
                    Icons.Outlined.GpsOff,
                    contentDescription = null,
                    tint = colors.danger,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = "Turn on GPS to use the Rider App",
                    style = BcType.subtitle,
                    color = colors.text,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = "රයිඩර් ඇප් භාවිතා කිරීමට GPS සක්‍රිය කරන්න",
                    style = BcType.caption,
                    color = colors.textMuted,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(4.dp))
                BcButton(
                    label = "Turn on GPS",
                    onClick = {
                        context.startActivity(
                            Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            },
                        )
                    },
                )
            }

            if (state.needsGps && state.needsInternet) {
                Spacer(Modifier.height(BcSpacing.sm))
            }

            if (state.needsInternet) {
                Icon(
                    Icons.Outlined.SignalWifiOff,
                    contentDescription = null,
                    tint = colors.danger,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = "Turn on mobile data or Wi‑Fi",
                    style = BcType.subtitle,
                    color = colors.text,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = "ජංගම දත්ත හෝ Wi‑Fi සක්‍රිය කරන්න",
                    style = BcType.caption,
                    color = colors.textMuted,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(4.dp))
                BcButton(
                    label = "Turn on Data",
                    onClick = {
                        context.startActivity(
                            Intent(Settings.ACTION_WIRELESS_SETTINGS).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            },
                        )
                    },
                )
            }
        }
    }
}

/**
 * Observes [DeviceRequirements], refreshes on resume (e.g. after permission grant),
 * and draws [DeviceLockOverlay] when requirements are not met.
 */
@Composable
fun DeviceLockLayer(
    deviceRequirements: DeviceRequirements? = null,
) {
    val context = LocalContext.current
    val requirements = deviceRequirements
        ?: remember {
            (context.applicationContext as BingChunApp).container.deviceRequirements
        }
    val state by requirements.state.collectAsState()
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner, requirements) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                requirements.refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    DeviceLockOverlay(state = state)
}
