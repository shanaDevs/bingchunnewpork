package lk.bingchun.delivery.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.R
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.ui.theme.BcMotion
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/** Full-width primary button — press scale, haptic, sound, loading morph. */
@Composable
fun BcButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
    enabled: Boolean = true,
    lockedRed: Boolean = false,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = BcMotion.press(),
        label = "btnScale",
    )
    val locked = lockedRed && !enabled && !loading

    Button(
        onClick = {
            feedback.tap()
            onClick()
        },
        enabled = enabled && !loading,
        interactionSource = interaction,
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .semantics { contentDescription = label },
        shape = BcRadius.buttonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.brand,
            contentColor = colors.onBrand,
            disabledContainerColor = if (locked) Color(0xFFFEE2E2) else colors.brand.copy(alpha = 0.4f),
            disabledContentColor = if (locked) Color(0xFFE11D48) else colors.onBrand.copy(alpha = 0.8f),
        ),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.5.dp,
                color = colors.onBrand,
            )
        } else {
            Text(label, style = BcType.button)
        }
    }
}

/** Soft outlined secondary button. */
@Composable
fun BcOutlineButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = BcMotion.press(),
        label = "outlineScale",
    )

    OutlinedButton(
        onClick = {
            feedback.tap()
            onClick()
        },
        enabled = enabled && !loading,
        interactionSource = interaction,
        modifier = modifier
            .height(48.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale },
        shape = BcRadius.buttonShape,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = colors.text,
            disabledContentColor = colors.textMuted,
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            if (loading) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = colors.brand)
            } else {
                if (icon != null) {
                    Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = colors.text)
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    label,
                    style = BcType.button,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Circular icon + optional caption for Call / Navigate / Maps on the current stop. */
@Composable
fun RoundActionIcon(
    caption: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    painter: Painter? = null,
    tint: Color = Color.Unspecified,
    accessibilityLabel: String? = caption,
    filled: Boolean = false,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    val a11y = accessibilityLabel ?: caption ?: "Action"
    val iconTint = when {
        filled -> colors.onBrand
        tint != Color.Unspecified -> if (enabled) tint else colors.textMuted
        painter != null -> Color.Unspecified
        enabled -> colors.brandLight
        else -> colors.textMuted
    }
    Column(
        modifier = modifier.semantics { contentDescription = a11y },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(
                    when {
                        filled && enabled -> colors.brand
                        filled -> colors.brand.copy(alpha = 0.4f)
                        enabled -> colors.iconTile
                        else -> colors.iconTile.copy(alpha = 0.6f)
                    },
                )
                .then(
                    if (filled) Modifier else Modifier.border(BorderStroke(1.dp, colors.border), CircleShape),
                )
                .clickable(enabled = enabled) {
                    feedback.tap()
                    onClick()
                },
            contentAlignment = Alignment.Center,
        ) {
            when {
                painter != null -> Icon(
                    painter = painter,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier
                        .size(22.dp)
                        .graphicsLayer { alpha = if (enabled) 1f else 0.4f },
                )
                icon != null -> Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
        if (caption != null) {
            Text(
                caption,
                style = BcType.tiny,
                color = if (enabled) colors.text else colors.textMuted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/** Circular Google Maps pin for opening turn-by-turn directions. */
@Composable
fun GoogleMapsIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    caption: String? = null,
) {
    RoundActionIcon(
        caption = caption,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        painter = painterResource(R.drawable.ic_google_maps),
        tint = Color.Unspecified,
        accessibilityLabel = caption ?: "Open in Google Maps",
    )
}

/** Even Call / Navigate / Maps row for the current stop. Optional trailing slot (e.g. Continue). */
@Composable
fun StopCustomerActions(
    canCall: Boolean,
    canNavigate: Boolean,
    onCall: () -> Unit,
    onNavigate: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    modifier: Modifier = Modifier,
    extra: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundActionIcon(
            caption = "Call",
            icon = Icons.Filled.Call,
            enabled = canCall,
            onClick = onCall,
        )
        RoundActionIcon(
            caption = "Navigate",
            icon = Icons.Filled.Navigation,
            enabled = canNavigate,
            onClick = onNavigate,
        )
        GoogleMapsIconButton(
            caption = "Maps",
            enabled = canNavigate,
            onClick = onOpenGoogleMaps,
        )
        extra?.invoke()
    }
}

/** Icon-only actions for the next stop on an in-progress run: site, Google Maps, in-app nav. */
@Composable
fun InProgressStopIconBar(
    canNavigate: Boolean,
    onOpenNextSite: () -> Unit,
    onOpenMap: () -> Unit,
    onNavigateInApp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundActionIcon(
            caption = null,
            icon = Icons.Filled.Place,
            accessibilityLabel = "Open next site",
            filled = true,
            onClick = onOpenNextSite,
        )
        GoogleMapsIconButton(
            caption = null,
            enabled = canNavigate,
            onClick = onOpenMap,
        )
        RoundActionIcon(
            caption = null,
            icon = Icons.Filled.Navigation,
            accessibilityLabel = "Navigate from our application",
            enabled = canNavigate,
            onClick = onNavigateInApp,
        )
    }
}

@Composable
fun BcTextButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    TextButton(
        onClick = { feedback.tap(); onClick() },
        enabled = enabled,
        modifier = modifier,
    ) {
        Text(label, style = BcType.button, color = colors.brand)
    }
}
