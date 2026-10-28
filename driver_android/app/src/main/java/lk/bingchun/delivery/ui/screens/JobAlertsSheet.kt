package lk.bingchun.delivery.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.BatteryAlert
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Fullscreen
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import lk.bingchun.delivery.core.BcNotifications
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcOutlineButton
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * Clean bottom sheet allowing drivers to configure notification reliability,
 * battery optimization bypass, and Android 14 full-screen intent permissions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobAlertsSheet(
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var isBatteryUnrestricted by remember {
        mutableStateOf(isIgnoringBatteryOptimizations(context))
    }
    var canFsi by remember {
        mutableStateOf(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                BcNotifications.canUseFullScreenIntent(context)
            } else true
        )
    }

    LifecycleResumeEffect(Unit) {
        isBatteryUnrestricted = isIgnoringBatteryOptimizations(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            canFsi = BcNotifications.canUseFullScreenIntent(context)
        }
        onPauseOrDispose { }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = colors.card,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 36.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Job Alerts & Reliability",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.text,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "Never miss incoming delivery rides",
                        fontSize = 13.sp,
                        color = colors.textMuted,
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Outlined.Close,
                        contentDescription = "Close",
                        tint = colors.textMuted,
                    )
                }
            }

            // 1. Battery Optimization Card
            AlertOptionCard(
                icon = Icons.Outlined.BatteryAlert,
                iconBg = if (colors.isDark) Color(0xFF2E2415) else Color(0xFFFEF3C7),
                iconTint = if (colors.isDark) Color(0xFFFBBF24) else Color(0xFFD97706),
                title = "Background Running",
                subtitle = if (isBatteryUnrestricted) {
                    "Battery optimizations disabled. The app can alert you when minimized."
                } else {
                    "Android may put the app to sleep and delay new delivery jobs."
                },
                isDone = isBatteryUnrestricted,
                actionLabel = if (isBatteryUnrestricted) "Settings" else "Allow background running",
                onAction = {
                    feedback.tap()
                    requestIgnoreBatteryOptimizations(context)
                },
            )

            // 2. Full-Screen Ride Alerts (Android 14+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                AlertOptionCard(
                    icon = Icons.Outlined.Fullscreen,
                    iconBg = if (colors.isDark) Color(0xFF1E293B) else Color(0xFFE0EDFD),
                    iconTint = if (colors.isDark) Color(0xFF60A5FA) else Color(0xFF1D4ED8),
                    title = "Full-Screen Ride Alerts",
                    subtitle = if (canFsi) {
                        "Allowed. Incoming jobs can ring over the lock screen immediately."
                    } else {
                        "Permission required to pop up incoming jobs over locked screens."
                    },
                    isDone = canFsi,
                    actionLabel = if (canFsi) "Enabled" else "Allow full-screen alerts",
                    actionEnabled = !canFsi,
                    onAction = {
                        feedback.tap()
                        try {
                            context.startActivity(
                                Intent(
                                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                                    Uri.parse("package:${context.packageName}"),
                                ),
                            )
                        } catch (_: Exception) {
                            context.startActivity(
                                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                    data = Uri.parse("package:${context.packageName}")
                                },
                            )
                        }
                    },
                )
            }

            // 3. Notification Settings Shortcut
            AlertOptionCard(
                icon = Icons.Outlined.NotificationsActive,
                iconBg = if (colors.isDark) Color(0xFF3B1E22) else Color(0xFFFDE8E8),
                iconTint = if (colors.isDark) Color(0xFFF87171) else Color(0xFFDC2626),
                title = "System Notification Sounds",
                subtitle = "Ensure Bing Chun notification channels are set to High Priority with sound.",
                isDone = true,
                actionLabel = "Open app notification settings",
                onAction = {
                    feedback.tap()
                    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    }
                    try {
                        context.startActivity(intent)
                    } catch (_: Exception) {
                        context.startActivity(
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.parse("package:${context.packageName}")
                            },
                        )
                    }
                },
            )

            // 4. OEM / Autostart Guidance
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(colors.card)
                    .border(1.dp, colors.border, RoundedCornerShape(16.dp))
                    .padding(16.dp),
            ) {
                Row(verticalAlignment = Alignment.Top) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(if (colors.isDark) Color(0xFF1E293B) else Color(0xFFF1F5F9)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Outlined.Smartphone,
                            contentDescription = null,
                            tint = colors.textMuted,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Xiaomi, Redmi & Samsung Devices",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                            color = colors.text,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "1. Enable 'Autostart' in Security / App Info.\n" +
                                "2. Set Battery Saver to 'No restrictions'.\n" +
                                "3. Lock the app in Recent Apps so the OS does not kill it.",
                            fontSize = 12.5.sp,
                            color = colors.textMuted,
                            lineHeight = 18.sp,
                        )
                    }
                }
            }

            Spacer(Modifier.height(4.dp))
            BcOutlineButton(
                label = "Done",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun AlertOptionCard(
    icon: ImageVector,
    iconBg: Color,
    iconTint: Color,
    title: String,
    subtitle: String,
    isDone: Boolean,
    actionLabel: String,
    actionEnabled: Boolean = true,
    onAction: () -> Unit,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(colors.card)
            .border(1.dp, colors.border, RoundedCornerShape(18.dp))
            .padding(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(iconBg),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = iconTint,
                        modifier = Modifier.size(22.dp),
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = title,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = colors.text,
                        )
                        if (isDone) {
                            Box(
                                modifier = Modifier
                                    .size(20.dp)
                                    .clip(CircleShape)
                                    .background(if (colors.isDark) Color(0xFF064E3B).copy(alpha = 0.45f) else Color(0xFFE8F8F0)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    Icons.Filled.Check,
                                    contentDescription = "Active",
                                    tint = if (colors.isDark) Color(0xFF34D399) else Color(0xFF10B981),
                                    modifier = Modifier.size(13.dp),
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(3.dp))
                    Text(
                        text = subtitle,
                        fontSize = 12.5.sp,
                        color = colors.textMuted,
                        lineHeight = 17.sp,
                    )
                }
            }
            BcButton(
                label = actionLabel,
                onClick = onAction,
                enabled = actionEnabled,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(context.packageName)
}

private fun requestIgnoreBatteryOptimizations(context: Context) {
    try {
        val intent = Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        ).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    } catch (_: Exception) {
        try {
            context.startActivity(
                Intent(
                    Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (_: Exception) {
        }
    }
}
