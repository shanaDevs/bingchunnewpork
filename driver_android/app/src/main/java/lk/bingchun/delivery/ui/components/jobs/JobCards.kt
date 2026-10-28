package lk.bingchun.delivery.ui.components.jobs

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.automirrored.outlined.AltRoute
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.Intents
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.data.model.DeliveryJobDetail
import lk.bingchun.delivery.data.model.JobSummary
import lk.bingchun.delivery.ui.components.BcPearlKind
import lk.bingchun.delivery.ui.components.BcRoutePearl
import lk.bingchun.delivery.ui.components.BcTextButton
import lk.bingchun.delivery.ui.components.DeliveryIllustration
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun ActiveJobCard(
    job: JobSummary,
    detail: DeliveryJobDetail?,
    onOpen: () -> Unit,
) {
    val context = LocalContext.current
    val feedback = LocalBcFeedback.current
    val colors = LocalBcColors.current

    val activeOrder = detail?.orders?.firstOrNull { it.isPending } ?: detail?.orders?.firstOrNull()
    val previewStop = job.previewStops.firstOrNull()

    val storeTitle = job.storeName.ifBlank { "Branch" }
    val storeAddress = detail?.store?.addressLine?.takeIf { it.isNotBlank() }
        ?: job.storeCity.ifBlank { "Pickup location" }

    val customerName = activeOrder?.customerName?.takeIf { it.isNotBlank() }
        ?: previewStop?.customerName?.takeIf { it.isNotBlank() }
        ?: "Customer"
    val customerAddress = activeOrder?.shortAddress?.takeIf { it.isNotBlank() }
        ?: previewStop?.shortAddress?.takeIf { it.isNotBlank() }
        ?: "Delivery address"
    val customerPhone = activeOrder?.customerPhone?.trim() ?: ""

    val destLat = activeOrder?.lat ?: detail?.store?.lat ?: 6.8344
    val destLng = activeOrder?.lng ?: detail?.store?.lng ?: 79.8653

    val estMinutes = job.estimatedMinutes?.takeIf { it > 0 }
        ?: activeOrder?.estimatedMinutes?.takeIf { it > 0 }
        ?: 18
    val distanceKm = job.estimatedDistanceKm?.takeIf { it > 0.0 } ?: 5.2

    val orderCode = Format.rideIdLabel(job.rideCode, job.id)
    val statusLabel = when (job.status) {
        "IN_PROGRESS" -> "IN PROGRESS"
        "ASSIGNED" -> "ASSIGNED"
        "RETURNING" -> "RETURNING"
        "QUEUED" -> "QUEUED"
        else -> job.status.replace('_', ' ')
    }

    lk.bingchun.delivery.ui.components.BcCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = {
            feedback.tap()
            onOpen()
        },
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
    ) {
        // Status & Order Code Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(colors.successSubtle)
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            ) {
                Text(
                    text = statusLabel,
                    style = BcType.tiny,
                    color = colors.success,
                    fontWeight = FontWeight.Bold,
                )
            }
            Text(
                text = orderCode,
                style = BcType.caption,
                color = colors.textMuted,
                fontWeight = FontWeight.Medium,
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Route overview
        Column(modifier = Modifier.fillMaxWidth()) {
            // Pickup stop
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(colors.brand),
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = storeTitle,
                        style = BcType.bodyStrong,
                        color = colors.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = storeAddress,
                        style = BcType.tiny,
                        color = colors.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            // Connector line
            Box(
                modifier = Modifier
                    .padding(start = 4.dp, top = 2.dp, bottom = 2.dp)
                    .width(1.5.dp)
                    .height(18.dp)
                    .background(colors.border),
            )

            // Dropoff stop
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(colors.success),
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = customerName,
                        style = BcType.bodyStrong,
                        color = colors.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = customerAddress,
                        style = BcType.tiny,
                        color = colors.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Info chips row: Time, Distance, Stops
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.surfacePill)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Outlined.AccessTime,
                        contentDescription = null,
                        tint = colors.brand,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = "$estMinutes min",
                        style = BcType.tiny,
                        color = colors.text,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.surfacePill)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.AutoMirrored.Outlined.AltRoute,
                        contentDescription = null,
                        tint = colors.brand,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = "$distanceKm km",
                        style = BcType.tiny,
                        color = colors.text,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            if (job.totalDeliveryFees > 0) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.surfacePill)
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = Format.money(job.totalDeliveryFees),
                        style = BcType.tiny,
                        color = colors.brand,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Actions: Call & Navigate
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(12.dp))
                    .clickable {
                        feedback.tap()
                        if (customerPhone.isNotBlank()) Intents.dial(context, customerPhone)
                        else Toast.makeText(context, "No customer phone available", Toast.LENGTH_SHORT).show()
                    },
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Phone, contentDescription = null, tint = colors.text, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "Call", style = BcType.caption, color = colors.text, fontWeight = FontWeight.SemiBold)
                }
            }

            Box(
                modifier = Modifier
                    .weight(1.3f)
                    .height(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.brand)
                    .clickable {
                        feedback.tap()
                        Intents.navigateTo(context, destLat, destLng, customerName)
                    },
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Navigation, contentDescription = null, tint = colors.onBrand, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "Navigate", style = BcType.caption, color = colors.onBrand, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun ScheduledJobCard(
    job: JobSummary,
    onOpen: () -> Unit,
    claimEnabled: Boolean = false,
    disabledLabel: String = "Go online to claim",
    claiming: Boolean = false,
    alerting: Boolean = false,
    onClaim: () -> Unit,
    onSilence: () -> Unit,
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
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(colors.brandSubtle),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.LocalShipping,
                    contentDescription = null,
                    tint = colors.brand,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = Format.deliverySummary(job.orderCount, job.totalCups),
                    style = BcType.bodyStrong,
                    color = colors.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "${job.storeName} • ${job.storeCity}",
                    style = BcType.caption,
                    color = colors.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Outlined.CalendarToday,
                        contentDescription = null,
                        tint = colors.textMuted,
                        modifier = Modifier.size(12.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = Format.jobDateTime(job.scheduledAt),
                        style = BcType.tiny,
                        color = colors.textMuted,
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(colors.infoSubtle)
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                ) {
                    Text(
                        text = "SCHEDULED",
                        style = BcType.tiny,
                        color = colors.info,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = Format.money(job.totalDeliveryFees),
                    style = BcType.bodyStrong,
                    color = colors.brand,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Claim CTA button
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (claimEnabled) colors.brand else colors.disabled)
                .clickable(enabled = claimEnabled && !claiming) {
                    feedback.tap()
                    onClaim()
                },
            contentAlignment = Alignment.Center,
        ) {
            if (claiming) {
                CircularProgressIndicator(
                    color = colors.onBrand,
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                )
            } else {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (!claimEnabled) disabledLabel else "Claim cup run",
                        style = BcType.caption,
                        color = colors.onBrand,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowForwardIos,
                        contentDescription = null,
                        tint = colors.onBrand,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }
        }

        if (alerting) {
            Spacer(modifier = Modifier.height(8.dp))
            BcTextButton(label = "Silence alert", onClick = onSilence)
        }
    }
}

@Composable
fun NoOtherJobsCard() {
    val colors = LocalBcColors.current
    lk.bingchun.delivery.ui.components.BcCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(18.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(colors.brandSubtle),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.LocalShipping,
                    contentDescription = null,
                    tint = colors.brand,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Queue is clear",
                    style = BcType.bodyStrong,
                    color = colors.text,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "New cup runs will appear here automatically.",
                    style = BcType.caption,
                    color = colors.textMuted,
                )
            }
        }
    }
}
