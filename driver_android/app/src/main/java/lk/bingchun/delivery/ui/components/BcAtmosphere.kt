package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.HeaderGradient
import lk.bingchun.delivery.ui.theme.LocalBcColors
import lk.bingchun.delivery.ui.theme.heroGradient
import lk.bingchun.delivery.ui.theme.riderTabHeaderGradient

enum class BcHeroStyle {
    BrandBlue,
    LoginHero,
    NavySubtle,
}

val BcHeroScoopBottom = GenericShape { size, _ ->
    val scoop = size.width * 0.12f
    moveTo(0f, 0f)
    lineTo(size.width, 0f)
    lineTo(size.width, size.height - scoop)
    quadraticTo(size.width / 2f, size.height + scoop * 0.35f, 0f, size.height - scoop)
    close()
}

@Composable
fun BcHeroMesh(
    modifier: Modifier = Modifier,
    height: Dp = Dp.Unspecified,
    bottomCornerRadius: Dp = 28.dp,
    showWaveStroke: Boolean = true,
    style: BcHeroStyle = BcHeroStyle.BrandBlue,
    content: @Composable BoxScope.() -> Unit,
) {
    val colors = LocalBcColors.current
    val shape = RoundedCornerShape(bottomStart = bottomCornerRadius, bottomEnd = bottomCornerRadius)
    val headerBrush = when (style) {
        BcHeroStyle.BrandBlue -> riderTabHeaderGradient()
        BcHeroStyle.LoginHero -> heroGradient(dark = true)
        BcHeroStyle.NavySubtle -> HeaderGradient
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .then(if (height != Dp.Unspecified) Modifier.height(height) else Modifier)
            .clip(shape)
            .background(headerBrush),
    ) {
        if (style != BcHeroStyle.NavySubtle) {
            Box(
                modifier = Modifier
                    .size(180.dp)
                    .align(Alignment.BottomStart)
                    .offset(x = (-30).dp, y = 40.dp)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(colors.brand.copy(alpha = 0.65f), Color.Transparent),
                        ),
                        CircleShape,
                    ),
            )
            Box(
                modifier = Modifier
                    .size(160.dp)
                    .align(Alignment.TopEnd)
                    .offset(x = 20.dp, y = 30.dp)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(colors.accentPurple.copy(alpha = 0.45f), Color.Transparent),
                        ),
                        CircleShape,
                    ),
            )
        }
        if (showWaveStroke) {
            // matchParentSize overlays the header content. fillMaxSize would
            // expand this hero to the full incoming max height and hide
            // everything below it on the incoming-ride screen.
            Canvas(modifier = Modifier.matchParentSize()) {
                val path = Path().apply {
                    moveTo(size.width * 0.58f, 0f)
                    cubicTo(
                        size.width * 0.75f, size.height * 0.45f,
                        size.width * 0.85f, size.height * 0.15f,
                        size.width, size.height * 0.70f,
                    )
                }
                drawPath(
                    path,
                    Color.White.copy(alpha = 0.05f),
                    style = Stroke(width = 24.dp.toPx()),
                )
            }
        }
        content()
    }
}

@Composable
fun BcGlassSurface(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = BcRadius.lg,
    content: @Composable BoxScope.() -> Unit,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(colors.card.copy(alpha = if (colors.isDark) 0.92f else 0.96f))
            .border(1.dp, colors.border.copy(alpha = 0.85f), RoundedCornerShape(cornerRadius)),
        content = content,
    )
}

enum class BcPearlKind {
    Pickup,
    Dropoff,
    Neutral,
}

@Composable
fun BcRoutePearl(
    index: Int,
    kind: BcPearlKind = BcPearlKind.Neutral,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    val fill = when (kind) {
        BcPearlKind.Pickup -> colors.stopCyan
        BcPearlKind.Dropoff -> colors.accentPurple
        BcPearlKind.Neutral -> colors.brand
    }
    Box(
        modifier = modifier
            .size(22.dp)
            .clip(CircleShape)
            .background(fill.copy(alpha = 0.22f))
            .border(1.5.dp, fill, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = index.toString(), style = BcType.tiny, color = fill)
    }
}
