package lk.bingchun.delivery.ui.components.jobs

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.TwoWheeler
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.ui.components.BcGlassSurface
import lk.bingchun.delivery.ui.components.BcHeroMesh
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun JobsHeader(
    driverName: String,
    storeName: String,
    onNotificationClick: () -> Unit,
    onReportIssue: () -> Unit,
) {
    val colors = LocalBcColors.current
    BcLightStatusBarIcons()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(lk.bingchun.delivery.ui.components.BcWaveBottom)
            .background(lk.bingchun.delivery.ui.theme.heroGradient(true))
            .statusBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(top = 16.dp, bottom = 38.dp),
    ) {
        // Driver Profile & Quick Actions Top Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.18f))
                    .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.35f)), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                val initial = driverName.firstOrNull()?.uppercase() ?: "D"
                Text(
                    text = initial,
                    style = BcType.subtitle,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = driverName,
                    style = BcType.bodyStrong,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = storeName.uppercase(),
                    style = BcType.tiny,
                    color = Color.White.copy(alpha = 0.70f),
                    letterSpacing = 0.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Top Actions
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                GlowingReportButton(onClick = onReportIssue)

                // Notification Bell
                IconButton(onClick = onNotificationClick, modifier = Modifier.size(36.dp)) {
                    Box(contentAlignment = Alignment.TopEnd) {
                        Icon(
                            Icons.Outlined.Notifications,
                            contentDescription = "Notifications",
                            tint = Color.White,
                            modifier = Modifier.size(22.dp),
                        )
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(colors.danger)
                                .border(BorderStroke(1.2.dp, Color.White), CircleShape),
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(18.dp))
        Text(text = "Delivery Jobs", style = BcType.title, color = Color.White)
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = "Active routes & scheduled cup runs",
            style = BcType.caption,
            color = Color.White.copy(alpha = 0.75f),
        )
    }
}

@Composable
private fun GlowingReportButton(
    onClick: () -> Unit,
) {
    val flickerTransition = rememberInfiniteTransition(label = "reportFlicker")
    val flicker by flickerTransition.animateFloat(
        initialValue = 0f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 3200
                0f at 0
                0f at 200
                1f at 700
                1f at 1000
                0f at 1500
                0f at 1700
                1f at 2200
                1f at 2500
                0f at 3000
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "reportFlicker",
    )
    val red = Color(0xFFEF4444)
    val ink = lerp(Color(0xFFB91C1C), Color.White, flicker)
    val fill = lerp(Color.White, red, flicker)
    val borderColor = lerp(red, Color.White, flicker)
    val borderWidth = (1.6f + 0.4f * flicker).dp
    Box(
        modifier = Modifier
            .shadow(
                elevation = (2f + 14f * flicker).dp,
                shape = CircleShape,
                ambientColor = red.copy(alpha = 0.2f + 0.75f * flicker),
                spotColor = red.copy(alpha = 0.25f + 0.75f * flicker),
            )
            .clip(CircleShape)
            .background(fill)
            .border(BorderStroke(borderWidth, borderColor), CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(
                Icons.Outlined.Build,
                contentDescription = "Report failure",
                tint = ink,
                modifier = Modifier.size(14.dp),
            )
            Text(
                "Report failure",
                style = BcType.tiny,
                color = ink,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
fun BcDutyDock(
    isOnline: Boolean,
    activeCount: Int,
    onToggleDuty: (Boolean) -> Unit,
    newJobPulse: Boolean = false,
) {
    val colors = LocalBcColors.current
    val pulseTransition = rememberInfiniteTransition(label = "dutyPulse")
    val pulseAlpha by pulseTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "pulseAlpha",
    )

    lk.bingchun.delivery.ui.components.BcCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggleDuty(!isOnline) },
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f),
            ) {
                // Online/Offline status dot with animated pulse
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(
                            if (isOnline) {
                                colors.success.copy(alpha = if (newJobPulse) pulseAlpha else 1f)
                            } else {
                                colors.disabled
                            }
                        ),
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = if (isOnline) "On duty" else "Off duty",
                            style = BcType.bodyStrong,
                            color = colors.text,
                        )
                        if (isOnline) {
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(colors.successSubtle)
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                            ) {
                                Text(
                                    text = "ONLINE",
                                    style = BcType.tiny,
                                    color = colors.success,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 10.sp,
                                )
                            }
                        }
                    }
                    Text(
                        text = if (isOnline) "Ready for cup runs" else "Tap to switch online",
                        style = BcType.tiny,
                        color = colors.textMuted,
                    )
                }
            }

            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(28.dp)
                    .background(colors.border),
            )

            Row(
                modifier = Modifier
                    .weight(0.75f)
                    .padding(start = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(colors.brandSubtle),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Outlined.TwoWheeler,
                        contentDescription = null,
                        tint = colors.brand,
                        modifier = Modifier.size(19.dp),
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = "$activeCount",
                        style = BcType.subtitle,
                        color = colors.text,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = if (activeCount == 1) "Active run" else "Active runs",
                        style = BcType.tiny,
                        color = colors.textMuted,
                    )
                }
            }
        }
    }
}

@Composable
fun ActiveRidesSectionHeader(activeCount: Int) {
    val colors = LocalBcColors.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Active Deliveries",
                style = BcType.bodyStrong,
                color = colors.text,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            if (activeCount > 0) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(colors.brandSubtle)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text(
                        text = "$activeCount",
                        style = BcType.tiny,
                        color = colors.brand,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        Text(
            text = if (activeCount > 0) "In progress" else "No active run",
            style = BcType.tiny,
            color = colors.textMuted,
        )
    }
}

fun jobsScheduledMillis(iso: String?): Long = try {
    java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
} catch (_: Exception) {
    Long.MIN_VALUE
}
