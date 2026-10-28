package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.ui.theme.BcSpacing
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun BcEmptyState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.Outlined.Inbox,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val colors = LocalBcColors.current
    Column(
        modifier = modifier.fillMaxWidth().padding(BcSpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(BcSpacing.sm),
    ) {
        Icon(icon, contentDescription = null, tint = colors.textMuted, modifier = Modifier.size(52.dp))
        Text(title, style = BcType.subtitle, color = colors.text, textAlign = TextAlign.Center)
        Text(message, style = BcType.caption, color = colors.textMuted, textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(8.dp))
            BcOutlineButton(label = actionLabel, onClick = onAction, modifier = Modifier.fillMaxWidth(0.6f))
        }
    }
}

@Composable
fun BcErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    Column(
        modifier = modifier.fillMaxSize().padding(BcSpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = colors.danger, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text(message, style = BcType.body, color = colors.errorSoft, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        BcOutlineButton(label = "Retry", onClick = onRetry, modifier = Modifier.fillMaxWidth(0.5f))
    }
}

@Composable
fun BcOfflineBanner(modifier: Modifier = Modifier) {
    val colors = LocalBcColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.accent.copy(alpha = 0.15f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
        Text("You're offline — go online to receive jobs", style = BcType.caption, color = colors.accent)
    }
}

/** Sticky bottom action bar with safe-area padding. */
@Composable
fun BcStickyBar(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.background.copy(alpha = 0.96f))
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        content()
    }
}

@Composable
fun BcJobsSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(4) {
            BcCard {
                BcSkeletonCard()
            }
        }
    }
}
