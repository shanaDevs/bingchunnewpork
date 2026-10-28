package lk.bingchun.delivery.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.TwoWheeler
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.data.model.JobSummary
import lk.bingchun.delivery.ui.AuthViewModel
import lk.bingchun.delivery.ui.theme.LocalBcColors

/** Authenticated shell: Jobs / History / Stats / Me bottom navigation. */
@Composable
fun HomeShellScreen(
    authViewModel: AuthViewModel,
    onOpenJob: (JobSummary) -> Unit,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    var tab by rememberSaveable { mutableIntStateOf(0) }

    // Ask once after login so new-job alerts can be posted (Android 13+).
    RequestNotificationPermission()

    Scaffold(
        containerColor = colors.background,
        bottomBar = {
            FloatingFrostedBottomNav(
                currentTab = tab,
                onSelectTab = { selected ->
                    feedback.tap()
                    tab = selected
                },
            )
        },
    ) { padding ->
        val tabModifier = Modifier.padding(bottom = padding.calculateBottomPadding())
        when (tab) {
            0 -> JobsTab(
                authViewModel = authViewModel,
                onOpenJob = onOpenJob,
                modifier = tabModifier,
                historyMode = false,
            )
            1 -> HistoryScreen(
                authViewModel = authViewModel,
                onOpenJob = onOpenJob,
                modifier = tabModifier,
                onViewJobs = { tab = 0 },
            )
            2 -> StatsScreen(
                authViewModel = authViewModel,
                modifier = tabModifier,
            )
            else -> MeScreen(
                authViewModel = authViewModel,
                modifier = tabModifier,
            )
        }
    }
}

private data class NavTabItem(
    val label: String,
    val icon: ImageVector,
    val index: Int,
)

/**
 * Floating frosted glass capsule bottom navigation bar matching the design mockup.
 */
@Composable
private fun FloatingFrostedBottomNav(
    currentTab: Int,
    onSelectTab: (Int) -> Unit,
) {
    val colors = LocalBcColors.current
    val items = listOf(
        NavTabItem("Jobs", Icons.Outlined.TwoWheeler, 0),
        NavTabItem("History", Icons.Outlined.History, 1),
        NavTabItem("Stats", Icons.AutoMirrored.Outlined.TrendingUp, 2),
        NavTabItem("Me", Icons.Outlined.Person, 3),
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        // Floating pill container with translucent frosted background and soft shadow
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(
                    elevation = 16.dp,
                    shape = RoundedCornerShape(36.dp),
                    spotColor = Color(0x330A2647),
                    ambientColor = Color(0x180A2647),
                )
                .clip(RoundedCornerShape(36.dp))
                .background(colors.card.copy(alpha = 0.95f))
                .border(
                    BorderStroke(1.dp, colors.border),
                    RoundedCornerShape(36.dp),
                )
                .padding(horizontal = 6.dp, vertical = 6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                items.forEachIndexed { idx, item ->
                    val isSelected = currentTab == item.index
                    val interaction = remember { MutableInteractionSource() }

                    val iconScale by animateFloatAsState(
                        targetValue = if (isSelected) 1.05f else 1f,
                        label = "iconScale",
                    )
                    val iconColor by animateColorAsState(
                        targetValue = if (isSelected) colors.brand else colors.textMuted,
                        label = "iconColor",
                    )
                    val textColor by animateColorAsState(
                        targetValue = if (isSelected) colors.brand else colors.textMuted,
                        label = "textColor",
                    )

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(26.dp))
                            .then(
                                if (isSelected) {
                                    Modifier.background(colors.brandSubtle)
                                } else {
                                    Modifier
                                },
                            )
                            .clickable(
                                interactionSource = interaction,
                                indication = null,
                                onClick = { onSelectTab(item.index) },
                            )
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = item.icon,
                                contentDescription = item.label,
                                tint = iconColor,
                                modifier = Modifier
                                    .size(24.dp)
                                    .graphicsLayer {
                                        scaleX = iconScale
                                        scaleY = iconScale
                                    },
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = item.label,
                                color = textColor,
                                fontSize = 11.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            )
                        }
                    }

                    // Vertical hairline divider between unselected adjacent items
                    if (idx < items.size - 1 && !isSelected && currentTab != idx + 1) {
                        Box(
                            modifier = Modifier
                                .width(1.dp)
                                .height(20.dp)
                                .background(colors.border.copy(alpha = 0.5f)),
                        )
                    }
                }
            }
        }
    }
}
