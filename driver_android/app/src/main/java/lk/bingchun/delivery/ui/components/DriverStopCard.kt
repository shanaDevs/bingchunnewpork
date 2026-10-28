package lk.bingchun.delivery.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.data.model.JobOrder
import lk.bingchun.delivery.ui.theme.BcMotion
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * Driver Stop Card styled to match the modern visual design mockup:
 * Rounded card (20.dp), clean border, green checkmark icon badge,
 * "✓ Delivered" pill, pin location, items summary, and "View order >".
 */
@Composable
fun DriverStopCard(
    stopNumber: Int,
    order: JobOrder,
    onOpen: () -> Unit,
    onCall: () -> Unit,
    onNavigate: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    modifier: Modifier = Modifier,
    highlighted: Boolean = false,
    showItems: Boolean = false,
    /** False before Confirm pickup, and for later stops until they become the current pending stop. */
    showCustomerActions: Boolean = true,
) {
    val colors = LocalBcColors.current
    val cardShape = RoundedCornerShape(20.dp)

    val targetBorder = when {
        order.isFailed -> colors.danger.copy(alpha = 0.5f)
        highlighted -> colors.brand
        order.isDelivered -> colors.success.copy(alpha = 0.5f)
        else -> colors.border
    }
    val borderColor by animateColorAsState(targetBorder, animationSpec = BcMotion.standard(), label = "stopBorder")
    val elevation by animateDpAsState(
        targetValue = if (highlighted) 6.dp else 2.dp,
        animationSpec = BcMotion.standard(),
        label = "stopElev",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = elevation,
                shape = cardShape,
                spotColor = Color(0x180A2647),
                ambientColor = Color(0x0C0A2647),
            )
            .clip(cardShape)
            .background(colors.card)
            .border(BorderStroke(if (highlighted || order.isDelivered) 1.5.dp else 1.dp, borderColor), cardShape)
            .clickable(onClick = onOpen)
            .padding(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Top Row: Status Icon, Customer Details, Status Chip
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Leading Status Avatar / Circle Badge
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                order.isDelivered -> colors.successSubtle
                                order.isFailed -> colors.dangerSubtle
                                highlighted -> colors.infoSubtle
                                else -> colors.surfacePill
                            },
                        )
                        .border(
                            1.dp,
                            when {
                                order.isDelivered -> colors.success.copy(alpha = 0.35f)
                                order.isFailed -> colors.danger.copy(alpha = 0.35f)
                                highlighted -> colors.brand.copy(alpha = 0.35f)
                                else -> colors.border
                            },
                            CircleShape,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    if (order.isDelivered) {
                        Icon(
                            Icons.Filled.CheckCircle,
                            contentDescription = "Delivered",
                            tint = colors.success,
                            modifier = Modifier.size(24.dp),
                        )
                    } else {
                        Text(
                            text = stopNumber.toString().padStart(2, '0'),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (highlighted) colors.brand else colors.text,
                        )
                    }
                }

                Spacer(Modifier.width(12.dp))

                // Customer info column
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = order.customerName.ifBlank { order.customerPhone.ifBlank { "Customer" } },
                            fontSize = 15.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.text,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (highlighted && order.isPending) {
                            Spacer(Modifier.width(8.dp))
                            StatusChip("NEXT")
                        }
                    }
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "#${order.orderNumber} · ${Format.money(order.deliveryFee)}",
                        fontSize = 12.5.sp,
                        color = colors.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (order.complaints.isNotEmpty()) {
                        Spacer(Modifier.height(2.dp))
                        InfoBadge(
                            label = if (order.complaints.size == 1) "Complaint filed" else "${order.complaints.size} complaints",
                            color = colors.accent,
                        )
                    }
                }

                // Trailing Status Chip
                if (order.isDelivered) {
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(colors.successSubtle)
                            .border(1.dp, colors.success.copy(alpha = 0.35f), CircleShape)
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                    ) {
                        Text(
                            text = "✓ Delivered",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = colors.success,
                        )
                    }
                } else {
                    StatusChip(
                        status = when {
                            order.isFailed -> "FAILED"
                            else -> order.status
                        },
                    )
                }
            }

            // Address Row
            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    Icons.Filled.Place,
                    contentDescription = null,
                    tint = colors.brand,
                    modifier = Modifier.padding(top = 2.dp, end = 8.dp).size(18.dp),
                )
                Text(
                    text = order.shortAddress,
                    fontSize = 13.5.sp,
                    color = colors.text.copy(alpha = 0.88f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }

            // Order items summary
            if (showItems && order.items.isNotEmpty()) {
                Text(
                    text = order.items.joinToString(" · ") { "${it.quantity}× ${it.productName}" },
                    fontSize = 12.5.sp,
                    color = colors.textMuted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Pending Actions (Call / Navigate)
            if (order.isPending && showCustomerActions) {
                StopCustomerActions(
                    canCall = order.customerPhone.isNotBlank(),
                    canNavigate = order.lat != null && order.lng != null,
                    onCall = onCall,
                    onNavigate = onNavigate,
                    onOpenGoogleMaps = onOpenGoogleMaps,
                )
            }

            // Bottom "View order >" link
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End,
            ) {
                Text(
                    text = "View order",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.brand,
                )
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.AutoMirrored.Filled.ArrowForwardIos,
                    contentDescription = "View order",
                    tint = colors.brand,
                    modifier = Modifier.size(11.dp),
                )
            }
        }
    }
}

/** Glance-level stop for [StopPreviewList] — lighter than [JobOrder]/[DriverStopCard]. */
data class StopPreviewItem(
    val customerName: String,
    val shortAddress: String,
    /** Null when the row isn't individually tappable (e.g. the Jobs-list card, where the whole card is one tap target). */
    val orderId: String? = null,
)

/**
 * Horizontal strip of up to the first 3 stops, in visiting order.
 */
@Composable
fun StopPreviewList(
    stops: List<StopPreviewItem>,
    modifier: Modifier = Modifier,
    onTap: ((String) -> Unit)? = null,
) {
    if (stops.isEmpty()) return
    val colors = LocalBcColors.current
    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        itemsIndexed(stops.take(3)) { index, stop ->
            val current = index == 0
            Surface(
                modifier = Modifier
                    .width(170.dp)
                    .alpha(if (current) 1f else 0.5f)
                    .let { m ->
                        if (stop.orderId != null && onTap != null) {
                            m.clickable { onTap(stop.orderId) }
                        } else {
                            m
                        }
                    },
                shape = BcRadius.mdShape,
                color = colors.card,
                border = BorderStroke(if (current) 1.5.dp else 1.dp, if (current) colors.brand else colors.border),
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Text(
                        stop.customerName.ifBlank { "Customer" },
                        style = BcType.bodyStrong,
                        color = colors.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        stop.shortAddress,
                        style = BcType.tiny,
                        color = colors.textMuted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
        }
    }
}
