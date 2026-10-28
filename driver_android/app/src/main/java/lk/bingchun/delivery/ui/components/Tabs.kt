package lk.bingchun.delivery.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.ui.theme.BcMotion
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/** Segmented control with sliding indicator. */
@Composable
fun BcSegmentedTabs(
    tabs: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    filled: Boolean = false,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    val density = LocalDensity.current
    var widthPx by remember { mutableIntStateOf(0) }
    val tabWidth = if (widthPx == 0 || tabs.isEmpty()) 0.dp else with(density) { (widthPx / tabs.size).toDp() }
    val indicatorOffset by animateDpAsState(
        targetValue = tabWidth * selectedIndex,
        animationSpec = BcMotion.move(),
        label = "tabIndicator",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(BcRadius.fullShape)
            .background(colors.surface)
            .onSizeChanged { widthPx = it.width }
            .padding(4.dp),
    ) {
        if (tabWidth > 0.dp) {
            Box(
                modifier = Modifier
                    .offset(x = indicatorOffset)
                    .width(tabWidth - 0.dp)
                    .fillMaxHeight()
                    .clip(BcRadius.fullShape)
                    .background(if (filled) colors.brand else colors.brand.copy(alpha = 0.18f)),
            )
        }
        Row(modifier = Modifier.fillMaxWidth().fillMaxHeight()) {
            tabs.forEachIndexed { index, label ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(BcRadius.fullShape)
                        .clickable {
                            feedback.tap()
                            onSelect(index)
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        style = BcType.label,
                        color = when {
                            index != selectedIndex -> colors.textMuted
                            filled -> colors.onBrand
                            else -> colors.brand
                        },
                    )
                }
            }
        }
    }
}

/** Simple pill tab used in headers. */
@Composable
fun TabPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    Box(
        modifier = modifier
            .clip(BcRadius.fullShape)
            .background(if (selected) colors.brand.copy(alpha = 0.16f) else colors.surface)
            .clickable {
                feedback.tap()
                onClick()
            }
            .padding(horizontal = 18.dp, vertical = 8.dp),
    ) {
        Text(
            label,
            style = BcType.label,
            color = if (selected) colors.brand else colors.textMuted,
        )
    }
}
