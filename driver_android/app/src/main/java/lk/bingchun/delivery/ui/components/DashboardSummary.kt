package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.data.model.DriverProfile
import lk.bingchun.delivery.data.model.JobHistoryItem
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.HeaderGradient
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun DashboardSummary(
    profile: DriverProfile?,
    history: List<JobHistoryItem>,
    isOnline: Boolean,
    onToggleDuty: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LocalBcColors.current
    val today = java.time.LocalDate.now().toString()
    
    // Calculate today's stats from history
    val todayRuns = history.filter {
        val dateStr = it.completedAt ?: it.scheduledAt
        dateStr?.startsWith(today) == true
    }
    
    val todayEarned = todayRuns.sumOf { it.deliveredTotal }
    val todayDeliveries = todayRuns.sumOf { it.deliveredCount }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp))
            .background(HeaderGradient)
            .padding(top = 16.dp, start = 20.dp, end = 20.dp, bottom = 24.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // Header Row: Driver Name & Online Toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Hello, ${profile?.name?.substringBefore(" ") ?: "Driver"}",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp
                    )
                    Text(
                        text = if (isOnline) "You are Online" else "You are Offline",
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 14.sp
                    )
                }
                
                Switch(
                    checked = isOnline,
                    onCheckedChange = onToggleDuty,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = colors.brand,
                        checkedTrackColor = Color.White,
                        uncheckedThumbColor = Color.LightGray,
                        uncheckedTrackColor = Color.White.copy(alpha = 0.3f)
                    )
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Stats Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                DashboardStat(
                    icon = Icons.Outlined.AccountBalanceWallet,
                    label = "Earned Today",
                    value = Format.money(todayEarned)
                )
                DashboardStat(
                    icon = Icons.Outlined.CheckCircle,
                    label = "Deliveries",
                    value = todayDeliveries.toString()
                )
                DashboardStat(
                    icon = Icons.Outlined.Star,
                    label = "Rating",
                    value = profile?.avgRating?.let { String.format("%.1f", it) } ?: "N/A"
                )
            }
        }
    }
}

@Composable
private fun DashboardStat(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = Color.White,
                modifier = Modifier.size(24.dp)
            )
        }
        Text(
            text = value,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp
        )
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 12.sp
        )
    }
}
