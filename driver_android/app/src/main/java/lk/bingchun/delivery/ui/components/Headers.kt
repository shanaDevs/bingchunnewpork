package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.zIndex
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import lk.bingchun.delivery.ui.theme.HeaderGradient

/**
 * Pinned tab chrome: scrollable body fills the screen while the gradient header stays
 * overlaid at the top. [overlap] is how far the first body card may sit onto the header curve;
 * pass it as [content]'s top padding inset (`headerHeight - overlap`), not as negative offsets.
 */
@Composable
fun BcPinnedTabLayout(
    modifier: Modifier = Modifier,
    overlap: Dp = 20.dp,
    header: @Composable () -> Unit,
    content: @Composable (contentTopPadding: Dp) -> Unit,
) {
    var headerHeightPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val contentTopPadding = with(density) {
        (headerHeightPx.toDp() - overlap).coerceAtLeast(0.dp)
    }

    Box(modifier = modifier.fillMaxSize()) {
        content(contentTopPadding)
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .zIndex(1f)
                .onSizeChanged { headerHeightPx = it.height },
        ) {
            header()
        }
    }
}

/**
 * Dark navy gradient header, the driver counterpart of the customer app's `BcHomeHeader`.
 * Runs under the status bar and flips the status-bar icons white while it is on screen.
 */
@Composable
fun BcGradientHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    avatarInitial: String? = null,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable (ColumnScope.() -> Unit)? = null,
) {
    BcLightStatusBarIcons()
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(HeaderGradient)
            .statusBarsPadding()
            .padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (avatarInitial != null) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(BcRadius.fullShape)
                        .background(Color.White.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        avatarInitial.take(1).uppercase(),
                        style = BcType.subtitle,
                        color = Color.White,
                    )
                }
                Spacer(Modifier.width(12.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    style = BcType.title,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                subtitle?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = BcType.caption,
                        color = Color.White.copy(alpha = 0.75f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            actions()
        }
        if (content != null) {
            Spacer(Modifier.height(14.dp))
            Column(
                modifier = Modifier.padding(end = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                content = content,
            )
        }
    }
}

/** Translucent pill for use inside [BcGradientHeader] — the customer header's location chip. */
@Composable
fun BcHeaderPill(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = modifier
            .clip(BcRadius.buttonShape)
            .background(Color.White.copy(alpha = 0.10f))
            .border(1.dp, Color.White.copy(alpha = 0.18f), BcRadius.buttonShape)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

/**
 * The customer app's signature bottom scoop (`BcWaveBottomClipper`) as a Compose shape,
 * for the login hero panel.
 */
val BcWaveBottom = GenericShape { size, _ ->
    val dip = 28f
    val overshoot = 12f
    moveTo(0f, 0f)
    lineTo(0f, size.height - dip)
    quadraticTo(
        size.width * 0.5f,
        size.height + overshoot,
        size.width,
        size.height - dip,
    )
    lineTo(size.width, 0f)
    close()
}
