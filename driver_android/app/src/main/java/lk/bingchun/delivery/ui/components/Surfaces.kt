package lk.bingchun.delivery.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcSpacing
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * White card with a hairline border and a soft drop shadow on light, border-only on dark —
 * the customer app's card recipe (`bc_app_design.dart`). Used by nearly every screen, so
 * this is where the visual language is set.
 */
@Composable
fun BcCard(
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(BcSpacing.lg),
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val palette = LocalBcColors.current
    val interaction = remember { MutableInteractionSource() }
    val shadowed = palette.cardShadow != Color.Transparent
    Card(
        modifier = modifier
            .then(
                if (shadowed) {
                    Modifier.shadow(
                        elevation = 10.dp,
                        shape = BcRadius.cardShape,
                        ambientColor = palette.cardShadow,
                        spotColor = palette.cardShadow,
                    )
                } else {
                    Modifier
                },
            )
            .then(
                if (onClick != null) {
                    Modifier.clickable(interactionSource = interaction, indication = null, onClick = onClick)
                } else {
                    Modifier
                },
            ),
        shape = BcRadius.cardShape,
        colors = CardDefaults.cardColors(containerColor = palette.card),
        border = BorderStroke(1.dp, palette.border),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(contentPadding), content = content)
    }
}

/** Rounded icon square used in list rows and stat tiles — the customer app's tile. */
@Composable
fun BcIconTile(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    tint: Color = Color.Unspecified,
    size: Dp = 44.dp,
) {
    val palette = LocalBcColors.current
    Box(
        modifier = modifier
            .size(size)
            .clip(BcRadius.mdShape)
            .background(palette.iconTile),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (tint == Color.Unspecified) palette.brand else tint,
            modifier = Modifier.size(size * 0.5f),
        )
    }
}

@Composable
fun StatusChip(status: String, modifier: Modifier = Modifier) {
    val palette = LocalBcColors.current
    val (label, color) = when (status.uppercase()) {
        "SCHEDULED" -> "Scheduled" to palette.info
        "ASSIGNED" -> "Assigned" to palette.brand
        "TO_OUTLET", "PICKUP" -> "Pickup" to palette.info
        "PICKED_UP" -> "Picked up" to palette.success
        "QUEUED" -> "Queued" to palette.info
        "IN_PROGRESS" -> "On run" to palette.accent
        "RETURNING" -> "Returning" to palette.warning
        "COMPLETED" -> "Completed" to palette.success
        "CANCELLED" -> "Cancelled" to palette.danger
        "VEHICLE_FAILURE" -> "Vehicle failure" to palette.danger
        "ABANDONED", "PARTIALLY_COMPLETED" -> "Incomplete" to palette.warning
        "DELIVERED" -> "✓ Delivered" to palette.success
        "OUT_FOR_DELIVERY" -> "Out for delivery" to palette.brand
        "READY" -> "Ready" to palette.success
        "NEXT" -> "Next" to palette.brand
        "FAILED", "DELIVERY_FAILED" -> "Failed" to palette.danger
        else -> status.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() } to palette.textMuted
    }
    Box(
        modifier = modifier
            .clip(BcRadius.fullShape)
            .background(color.copy(alpha = 0.12f))
            .border(1.dp, color.copy(alpha = 0.30f), BcRadius.fullShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, style = BcType.tiny, color = color)
    }
}

@Composable
fun InfoBadge(
    label: String,
    color: Color = Color.Unspecified,
    modifier: Modifier = Modifier,
) {
    val palette = LocalBcColors.current
    val c = if (color == Color.Unspecified) palette.brand else color
    Box(
        modifier = modifier
            .clip(BcRadius.fullShape)
            .background(c.copy(alpha = 0.12f))
            .border(1.dp, c.copy(alpha = 0.30f), BcRadius.fullShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, style = BcType.tiny, color = c, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun BcSkeleton(mod: Modifier = Modifier) {
    val palette = LocalBcColors.current
    val transition = rememberInfiniteTransition(label = "shimmer")
    val shift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shimmerShift",
    )
    val brush = Brush.linearGradient(
        colorStops = arrayOf(
            0f to palette.surface,
            0.5f to palette.surfaceElevated,
            1f to palette.surface,
        ),
        start = Offset(shift - 200f, 0f),
        end = Offset(shift, 200f),
    )
    Box(
        modifier = mod
            .clip(BcRadius.mdShape)
            .background(brush),
    )
}

@Composable
fun BcSkeletonCard(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        BcSkeleton(mod = Modifier.fillMaxWidth().height(18.dp))
        BcSkeleton(mod = Modifier.fillMaxWidth(0.7f).height(14.dp))
        BcSkeleton(mod = Modifier.fillMaxWidth(0.45f).height(14.dp))
    }
}
