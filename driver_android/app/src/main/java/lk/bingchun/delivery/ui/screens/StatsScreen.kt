package lk.bingchun.delivery.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.data.model.JobHistoryItem
import lk.bingchun.delivery.ui.AuthViewModel
import lk.bingchun.delivery.ui.JobsListViewModel
import lk.bingchun.delivery.ui.StatsPeriod
import lk.bingchun.delivery.ui.StatsViewModel
import lk.bingchun.delivery.ui.components.BcPinnedTabLayout
import lk.bingchun.delivery.ui.components.RiderReviewsSection
import lk.bingchun.delivery.ui.containerViewModel
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * Driver performance and earnings statistics screen matching the premium Bing Chun design.
 */
@Composable
fun StatsScreen(
    authViewModel: AuthViewModel,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    val vm: JobsListViewModel = containerViewModel()
    val statsVm: StatsViewModel = containerViewModel()
    val state by vm.state.collectAsState()
    val statsState by statsVm.state.collectAsState()

    LaunchedEffect(Unit) {
        vm.loadHistory()
        vm.load()
        statsVm.load(StatsPeriod.MONTH)
    }

    val statsTotals = statsState.stats?.totals
    val totalDelivered = statsTotals?.deliveredStops ?: state.history.sumOf { it.deliveredCount }
    val totalRuns = statsTotals?.completedRuns ?: state.history.size
    val totalEarnings = statsTotals?.earningsLkr ?: state.history.sumOf { it.deliveredTotal }
    val distanceLabel = Format.km(statsTotals?.totalDistanceKm ?: 0.0)
    val rating = statsState.ratingsAverage ?: statsState.stats?.rating?.average ?: state.profile?.avgRating ?: 5.0
    val ratingCount = if (statsState.ratingsCount > 0) {
        statsState.ratingsCount
    } else {
        statsState.stats?.rating?.count ?: state.profile?.ratingCount ?: 0
    }
    val meritPoints = statsState.stats?.merit?.points ?: state.profile?.meritPoints
    val meritStatus = (statsState.stats?.merit?.status ?: state.profile?.meritStatus)
        ?.takeIf { it.isNotBlank() }
        ?.uppercase()
    val meritMissing = meritPoints == null && meritStatus == null
    val meritValue = if (meritMissing) "—" else (meritPoints ?: 0).toString()
    val meritSubtitle = meritStatus ?: "—"
    val statsPending = statsState.loading && statsState.stats == null
    val statsError = statsState.error?.takeIf { statsState.stats == null }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        BcPinnedTabLayout(
            overlap = 22.dp,
            header = {
                StatsHeaderSection(
                    selectedPeriod = statsState.period,
                    onSelectPeriod = { period ->
                        statsVm.load(period, force = true)
                    },
                )
            },
        ) { topPad ->
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = topPad, bottom = 100.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
            item {
                when {
                    statsPending -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 48.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = colors.brand)
                        }
                    }
                    statsError != null -> {
                        Text(
                            text = statsError,
                            color = colors.textMuted,
                            fontSize = 14.sp,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 32.dp),
                        )
                    }
                    else -> {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            HeroEarningsCard(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                totalEarnings = totalEarnings,
                                completedRuns = totalRuns,
                            )
                            Stats2x2Grid(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                deliveredOrders = totalDelivered,
                                deliveryRuns = totalRuns,
                                rating = rating,
                                ratingCount = ratingCount,
                                meritValue = meritValue,
                                meritStatus = meritSubtitle,
                                distanceLabel = distanceLabel,
                            )
                        }
                    }
                }
            }

            if (!statsPending && statsError == null && meritStatus != null) {
                item {
                    Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                        StandingBanner(meritStatus = meritStatus)
                    }
                }
            }

            item {
                Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                    PerformanceTrendsSection(history = state.history)
                }
            }

            if (statsState.ratings.isNotEmpty() || statsState.ratingsLoading) {
                item {
                    Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                        RiderReviewsSection(
                            ratings = statsState.ratings,
                            loading = statsState.ratingsLoading,
                        )
                    }
                }
            }
            }
        }
    }
}

/** Navy header with the period chips visible on the gradient. */
@Composable
private fun StatsHeaderSection(
    selectedPeriod: StatsPeriod,
    onSelectPeriod: (StatsPeriod) -> Unit,
) {
    val colors = LocalBcColors.current
    BcLightStatusBarIcons()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(lk.bingchun.delivery.ui.components.BcWaveBottom)
            .background(lk.bingchun.delivery.ui.theme.heroGradient(true))
            .statusBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(top = 16.dp, bottom = 38.dp),
    ) {
        Text(
            text = "Performance & Stats",
            style = lk.bingchun.delivery.ui.theme.BcType.title,
            color = Color.White,
        )
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = "Your delivery performance at a glance",
            style = lk.bingchun.delivery.ui.theme.BcType.caption,
            color = Color.White.copy(alpha = 0.75f),
        )
        Spacer(modifier = Modifier.height(14.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StatsPeriod.entries.forEach { period ->
                val selected = period == selectedPeriod
                Text(
                    text = period.label,
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(if (selected) colors.brand else Color.White.copy(alpha = 0.16f))
                        .clickable { onSelectPeriod(period) }
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                )
            }
        }
    }
}

@Composable
private fun HeroEarningsCard(
    totalEarnings: Int,
    completedRuns: Int,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    lk.bingchun.delivery.ui.components.BcCard(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
    ) {
        Text(
            text = "Total earned",
            color = colors.textMuted,
            fontSize = 12.sp,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = Format.money(totalEarnings),
            color = colors.text,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = "Across $completedRuns completed runs",
            color = colors.textMuted,
            fontSize = 13.sp,
        )
    }
}

/**
 * 2x2 Metric Grid:
 * 1. Delivered Orders
 * 2. Driver Rating
 * 3. Merit Score
 * 4. Completion Rate
 */
@Composable
private fun Stats2x2Grid(
    deliveredOrders: Int,
    deliveryRuns: Int,
    rating: Double,
    ratingCount: Int,
    meritValue: String,
    meritStatus: String,
    distanceLabel: String,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MetricCard(
                modifier = Modifier.weight(1f),
                icon = Icons.Outlined.Inventory2,
                iconBg = colors.brandSubtle,
                iconTint = colors.brand,
                label = "Delivered Orders",
                value = deliveredOrders.toString(),
                subtitle = "$deliveryRuns delivery runs",
            )
            MetricCard(
                modifier = Modifier.weight(1f),
                icon = Icons.Outlined.Star,
                iconBg = colors.warningSubtle,
                iconTint = colors.warning,
                label = "Driver Rating",
                value = String.format("%.1f", rating),
                subtitle = if (rating >= 4.8) "Top rated" else if (ratingCount > 0) "$ratingCount reviews" else "Top rated",
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MetricCard(
                modifier = Modifier.weight(1f),
                icon = Icons.AutoMirrored.Outlined.TrendingUp,
                iconBg = colors.accent.copy(alpha = 0.16f),
                iconTint = colors.accent,
                label = "Merit Score",
                value = meritValue,
                subtitle = meritStatus,
                subtitleColor = if (meritStatus == "—") colors.textMuted else colors.accent,
            )
            MetricCard(
                modifier = Modifier.weight(1f),
                icon = Icons.Outlined.LocalShipping,
                iconBg = colors.successSubtle,
                iconTint = colors.success,
                label = "Distance",
                value = distanceLabel,
                subtitle = "In this period",
            )
        }
    }
}

@Composable
private fun MetricCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    iconBg: Color,
    iconTint: Color,
    label: String,
    value: String,
    subtitle: String,
    subtitleColor: Color? = null,
) {
    val colors = LocalBcColors.current
    lk.bingchun.delivery.ui.components.BcCard(
        modifier = modifier,
        contentPadding = PaddingValues(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(iconBg),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(19.dp),
                )
            }
            Text(
                text = label,
                color = colors.textMuted,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = value,
                color = colors.text,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = subtitle,
                color = subtitleColor ?: colors.textMuted,
                fontSize = 12.sp,
                fontWeight = if (subtitleColor != null && subtitle != "—") FontWeight.Bold else FontWeight.Normal,
            )
        }
    }
}

@Composable
private fun StandingBanner(meritStatus: String) {
    val colors = LocalBcColors.current
    val excellent = meritStatus.equals("EXCELLENT", ignoreCase = true)
    val title = if (excellent) {
        "Great performance"
    } else {
        meritStatus.lowercase().replaceFirstChar { it.uppercase() }
    }
    val detail = if (excellent) "Keep up the good work!" else "Your current merit standing"
    val bannerBg = if (colors.isDark) Color(0xFF16233B) else Color(0xFFEBF3FD)
    val bannerBorder = if (colors.isDark) Color(0xFF1E3A5F) else Color(0xFFE2EAF8)
    val waveCol = if (colors.isDark) Color(0xFF1E304F) else Color(0xFFDEEBFA)
    val trophyBg = if (colors.isDark) Color(0xFF1E3A8A) else Color(0xFFD6E7FD)
    val trophyTint = if (colors.isDark) Color(0xFF60A5FA) else Color(0xFF2563EB)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 4.dp,
                shape = RoundedCornerShape(18.dp),
                spotColor = if (colors.isDark) Color(0x33000000) else Color(0x100F172A),
                ambientColor = if (colors.isDark) Color(0x22000000) else Color(0x080F172A),
            )
            .clip(RoundedCornerShape(18.dp))
            .background(bannerBg)
            .border(BorderStroke(1.dp, bannerBorder), RoundedCornerShape(18.dp)),
    ) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val w = size.width
            val h = size.height
            val wavePath = Path().apply {
                moveTo(w * 0.65f, h)
                cubicTo(
                    w * 0.78f, h * 0.55f,
                    w * 0.90f, h * 0.85f,
                    w, h * 0.40f,
                )
                lineTo(w, h)
                close()
            }
            drawPath(path = wavePath, color = waveCol)
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(trophyBg),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Outlined.EmojiEvents,
                    contentDescription = null,
                    tint = trophyTint,
                    modifier = Modifier.size(24.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    color = colors.text,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = detail,
                    color = colors.textMuted,
                    fontSize = 13.sp,
                )
            }
        }
    }
}

/** Last 7 calendar days of delivered stops. Empty days stay short; nothing is invented. */
@Composable
private fun PerformanceTrendsSection(
    history: List<JobHistoryItem>,
) {
    val colors = LocalBcColors.current
    val today = remember { LocalDate.now(ZoneId.systemDefault()) }
    val days = remember(today) { (6L downTo 0L).map { today.minusDays(it) } }
    val countsByDay = remember(history, days) {
        days.map { date ->
            history.sumOf { item ->
                val whenDate = historyLocalDate(item.completedAt ?: item.scheduledAt)
                if (whenDate == date) item.deliveredCount else 0
            }
        }
    }
    val maxCount = countsByDay.maxOrNull()?.coerceAtLeast(1) ?: 1
    val hasActivity = countsByDay.any { it > 0 }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column {
            Text(
                text = "Last 7 days",
                color = colors.text,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = if (hasActivity) "Delivered stops by day" else "No deliveries in the last 7 days",
                color = colors.textMuted,
                fontSize = 13.sp,
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(
                    elevation = 6.dp,
                    shape = RoundedCornerShape(18.dp),
                    spotColor = if (colors.isDark) Color(0x33000000) else Color(0x140F172A),
                    ambientColor = if (colors.isDark) Color(0x22000000) else Color(0x0A0F172A),
                )
                .clip(RoundedCornerShape(18.dp))
                .background(colors.card)
                .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(18.dp))
                .padding(horizontal = 16.dp, vertical = 20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                days.forEachIndexed { index, date ->
                    val count = countsByDay[index]
                    val proportion = if (!hasActivity || count == 0) {
                        0.12f
                    } else {
                        (count.toFloat() / maxCount).coerceIn(0.2f, 1f)
                    }
                    DayCapsuleBar(
                        day = date.format(weekdayFmt),
                        proportion = proportion,
                        highlighted = date == today,
                    )
                }
            }
        }
    }
}

private val weekdayFmt: DateTimeFormatter =
    DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH)

private fun historyLocalDate(iso: String?): LocalDate? {
    if (iso.isNullOrBlank()) return null
    return try {
        val raw = iso.trim()
        val instant = try {
            OffsetDateTime.parse(raw).toInstant()
        } catch (_: Exception) {
            try {
                Instant.parse(raw)
            } catch (_: Exception) {
                LocalDateTime.parse(raw).toInstant(ZoneOffset.UTC)
            }
        }
        instant.atZone(ZoneId.systemDefault()).toLocalDate()
    } catch (_: Exception) {
        null
    }
}

/**
 * Vertical capsule bar column with theme track and brand fill.
 */
@Composable
private fun DayCapsuleBar(
    day: String,
    proportion: Float,
    highlighted: Boolean,
) {
    val colors = LocalBcColors.current
    val animatedProportion by animateFloatAsState(
        targetValue = proportion.coerceIn(0.12f, 1.0f),
        animationSpec = tween(durationMillis = 650),
        label = "barHeight",
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .width(28.dp)
                .height(105.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(if (colors.isDark) colors.surfaceElevated else colors.iconTile),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(animatedProportion)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (highlighted) colors.brand else colors.brand.copy(alpha = 0.55f)),
            )
        }
        Text(
            text = day,
            color = if (highlighted) colors.brand else colors.textMuted,
            fontSize = 12.sp,
            fontWeight = if (highlighted) FontWeight.Bold else FontWeight.Medium,
        )
    }
}
