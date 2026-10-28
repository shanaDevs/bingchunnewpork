package lk.bingchun.delivery.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.data.model.JobHistoryItem
import lk.bingchun.delivery.data.model.JobSummary
import lk.bingchun.delivery.ui.AuthViewModel
import lk.bingchun.delivery.ui.JobsListViewModel
import lk.bingchun.delivery.ui.components.BcEmptyState
import lk.bingchun.delivery.ui.components.BcPinnedTabLayout
import lk.bingchun.delivery.ui.components.BcErrorState
import lk.bingchun.delivery.ui.components.BcJobsSkeleton
import lk.bingchun.delivery.ui.components.StatusChip
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import lk.bingchun.delivery.ui.theme.LocalBcColors
import lk.bingchun.delivery.ui.containerViewModel

private enum class HistoryTimeFilter(val label: String) {
    ALL_TIME("All Time"),
    TODAY("Today"),
    THIS_WEEK("This Week"),
    THIS_MONTH("This Month"),
}

/**
 * Driver Delivery History Screen matching the modern visual design.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    authViewModel: AuthViewModel,
    onOpenJob: (JobSummary) -> Unit,
    modifier: Modifier = Modifier,
    onViewJobs: (() -> Unit)? = null,
) {
    val vm: JobsListViewModel = containerViewModel()
    val state by vm.state.collectAsState()
    val auth by authViewModel.state.collectAsState()
    val feedback = LocalBcFeedback.current
    val colors = LocalBcColors.current
    var refreshing by remember { mutableStateOf(false) }
    var selectedFilter by remember { mutableStateOf(HistoryTimeFilter.ALL_TIME) }

    LaunchedEffect(Unit) {
        vm.loadHistory()
    }
    LaunchedEffect(state.historyLoading) {
        if (!state.historyLoading) refreshing = false
    }

    val driverName = state.profile?.name ?: auth.driver?.name ?: "Test Driver"
    val storeName = state.profile?.store?.name ?: auth.driver?.storeName ?: "DART CODES"

    // Filter history based on selected time window
    val filteredHistory = remember(state.history, selectedFilter) {
        when (selectedFilter) {
            HistoryTimeFilter.ALL_TIME -> state.history
            HistoryTimeFilter.TODAY -> state.history.filter {
                Format.isToday(it.completedAt ?: it.scheduledAt)
            }
            HistoryTimeFilter.THIS_WEEK -> state.history.filter {
                isWithinCurrentWeek(it.completedAt ?: it.scheduledAt)
            }
            HistoryTimeFilter.THIS_MONTH -> state.history.filter {
                isWithinCurrentMonth(it.completedAt ?: it.scheduledAt)
            }
        }
    }

    val historyGroups = remember(filteredHistory) { groupHistoryByDay(filteredHistory) }

    // Statistics computed from filtered history
    val completedRuns = filteredHistory.count { isCompleted(it) }
    val ordersDelivered = filteredHistory.sumOf { it.deliveredCount }
    val cancelledRuns = filteredHistory.count { isCancelled(it) }
    val vehicleFailureRuns = filteredHistory.count { isVehicleFailure(it) }
    val totalEarned = filteredHistory.sumOf { it.deliveredTotal }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                feedback.refresh()
                refreshing = true
                vm.loadHistory(force = true)
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            BcPinnedTabLayout(
                overlap = 22.dp,
                header = {
                    HistoryHeader(
                        driverName = driverName,
                        storeName = storeName,
                        onRefresh = {
                            feedback.refresh()
                            refreshing = true
                            vm.loadHistory(force = true)
                        },
                    )
                },
            ) { topPad ->
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(top = topPad, bottom = 28.dp),
                ) {
                // 2. Floating Stats Summary Card
                item {
                    HistorySummaryCard(
                        completedRuns = completedRuns,
                        ordersDelivered = ordersDelivered,
                        cancelledRuns = cancelledRuns,
                        vehicleFailureRuns = vehicleFailureRuns,
                        totalEarned = totalEarned,
                    )
                }

                // 3. Section Title + Filter Pill Row
                item {
                    RecentHistorySectionHeader(
                        selectedFilter = selectedFilter,
                        onSelectFilter = {
                            feedback.tap()
                            selectedFilter = it
                        },
                    )
                }

                // 4. History List Content
                val historyError = state.historyError
                when {
                    state.historyLoading && state.history.isEmpty() -> {
                        item {
                            Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                                BcJobsSkeleton()
                            }
                        }
                    }
                    historyError != null && state.history.isEmpty() -> {
                        item {
                            Box(modifier = Modifier.padding(16.dp)) {
                                BcErrorState(
                                    message = historyError,
                                    onRetry = { vm.loadHistory(force = true) },
                                )
                            }
                        }
                    }
                    filteredHistory.isEmpty() -> {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 24.dp),
                            ) {
                                BcEmptyState(
                                    title = if (selectedFilter == HistoryTimeFilter.ALL_TIME) {
                                        "No completed runs yet"
                                    } else {
                                        "No runs for ${selectedFilter.label.lowercase()}"
                                    },
                                    message = "Finished rides and deliveries will appear here.",
                                    actionLabel = if (onViewJobs != null) "View available jobs" else null,
                                    onAction = onViewJobs,
                                )
                            }
                        }
                    }
                    else -> {
                        historyGroups.forEach { group ->
                            item(key = "day-${group.key}") {
                                Text(
                                    text = group.label,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = colors.textMuted,
                                    modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 2.dp),
                                )
                            }
                            items(group.runs, key = { it.id }) { run ->
                                HistoryItemCard(
                                    run = run,
                                    onClick = {
                                        feedback.tap()
                                        onOpenJob(
                                            JobSummary(
                                                id = run.id,
                                                title = run.title,
                                                status = run.status,
                                                scheduledAt = run.scheduledAt,
                                                storeName = run.storeName,
                                                storeCity = run.storeCity,
                                                orderCount = run.orderCount,
                                                rideCode = run.rideCode,
                                            ),
                                        )
                                    },
                                )
                            }
                        }
                    }
                }
                }
            }
        }
    }
}

/**
 * Curved Deep Navy Blue Header matching the design mockup.
 */
@Composable
private fun HistoryHeader(
    driverName: String,
    storeName: String,
    onRefresh: () -> Unit,
) {
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
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Delivery History",
                    style = lk.bingchun.delivery.ui.theme.BcType.title,
                    color = Color.White,
                )
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = "$driverName • $storeName",
                    style = lk.bingchun.delivery.ui.theme.BcType.caption,
                    color = Color.White.copy(alpha = 0.75f),
                )
            }

            IconButton(
                onClick = onRefresh,
                modifier = Modifier.size(36.dp),
            ) {
                Icon(
                    Icons.Outlined.Refresh,
                    contentDescription = "Refresh",
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
    }
}

/**
 * Floating summary card with 4 metric columns and total earnings banner.
 */
@Composable
private fun HistorySummaryCard(
    completedRuns: Int,
    ordersDelivered: Int,
    cancelledRuns: Int,
    vehicleFailureRuns: Int,
    totalEarned: Int,
) {
    val colors = LocalBcColors.current
    lk.bingchun.delivery.ui.components.BcCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column {
            // 4 Stats columns
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                MetricColumn(
                    icon = Icons.Filled.Check,
                    iconBg = colors.successSubtle,
                    iconTint = colors.success,
                    count = completedRuns,
                    label = "Completed\nRuns",
                    modifier = Modifier.weight(1f),
                )
                MetricColumn(
                    icon = Icons.Outlined.Inventory2,
                    iconBg = colors.infoSubtle,
                    iconTint = colors.brand,
                    count = ordersDelivered,
                    label = "Orders\nDelivered",
                    modifier = Modifier.weight(1f),
                )
                MetricColumn(
                    icon = Icons.Filled.Close,
                    iconBg = colors.dangerSubtle,
                    iconTint = colors.danger,
                    count = cancelledRuns,
                    label = "Cancelled\nRuns",
                    modifier = Modifier.weight(1f),
                )
                MetricColumn(
                    icon = Icons.Filled.Warning,
                    iconBg = colors.warningSubtle,
                    iconTint = colors.warning,
                    count = vehicleFailureRuns,
                    label = "Vehicle Failure\nRuns",
                    modifier = Modifier.weight(1f),
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Total Earned Pill / Banner
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.surfacePill)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(colors.brand),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Outlined.AccountBalanceWallet,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column {
                            Text(
                                text = Format.money(totalEarned),
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.text,
                            )
                            Text(
                                text = "Total Earned",
                                fontSize = 12.sp,
                                color = colors.textMuted,
                            )
                        }
                    }

                    // Decorative trend wave & arrow on the right
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Canvas(modifier = Modifier.size(width = 44.dp, height = 24.dp)) {
                            val path = Path().apply {
                                moveTo(0f, size.height * 0.75f)
                                cubicTo(
                                    size.width * 0.35f, size.height * 0.70f,
                                    size.width * 0.65f, size.height * 0.15f,
                                    size.width, size.height * 0.25f,
                                )
                            }
                            drawPath(
                                path,
                                colors.brand.copy(alpha = 0.25f),
                                style = Stroke(width = 2.5.dp.toPx()),
                            )
                        }
                        Icon(
                            Icons.AutoMirrored.Outlined.TrendingUp,
                            contentDescription = null,
                            tint = colors.brand,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }
        }
    }
}

/** Single column in the 4-stat metric grid. */
@Composable
private fun MetricColumn(
    icon: ImageVector,
    iconBg: Color,
    iconTint: Color,
    count: Int,
    label: String,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(CircleShape)
                .background(iconBg),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(19.dp),
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "$count",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = colors.text,
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = label,
            fontSize = 11.sp,
            color = colors.textMuted,
            textAlign = TextAlign.Center,
            lineHeight = 13.sp,
        )
    }
}

/** "Recent History" title with the time-range chips visible in one row. */
@Composable
private fun RecentHistorySectionHeader(
    selectedFilter: HistoryTimeFilter,
    onSelectFilter: (HistoryTimeFilter) -> Unit,
) {
    val colors = LocalBcColors.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 8.dp),
    ) {
        Text(
            text = "Recent History",
            fontSize = 19.sp,
            fontWeight = FontWeight.Bold,
            color = colors.text,
            letterSpacing = (-0.3).sp,
        )
        Spacer(modifier = Modifier.height(10.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            HistoryTimeFilter.entries.forEach { filter ->
                val selected = filter == selectedFilter
                Text(
                    text = filter.label,
                    fontSize = 13.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (selected) Color.White else colors.text,
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(if (selected) colors.brand else colors.card)
                        .border(
                            BorderStroke(1.dp, if (selected) colors.brand else colors.border),
                            RoundedCornerShape(20.dp),
                        )
                        .clickable { onSelectFilter(filter) }
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                )
            }
        }
    }
}

/** Individual history item card: status accent, ride id, and run totals. */
@Composable
private fun HistoryItemCard(
    run: JobHistoryItem,
    onClick: () -> Unit,
) {
    val colors = LocalBcColors.current
    val vehFailure = isVehicleFailure(run)
    val cancelled = isCancelled(run)
    val accent = when {
        vehFailure -> colors.warning
        cancelled -> colors.danger
        run.isIncomplete -> colors.warning
        else -> colors.success
    }
    val titleText = when {
        vehFailure -> "Vehicle failure · ${run.orderCount} order${if (run.orderCount != 1) "s" else ""}"
        cancelled -> "Cancelled · ${run.orderCount} order${if (run.orderCount != 1) "s" else ""}"
        else -> run.title.ifBlank {
            "Delivery · ${run.orderCount} order${if (run.orderCount != 1) "s" else ""}"
        }
    }
    val place = listOf(run.storeName, run.storeCity).filter { it.isNotBlank() }.joinToString(" · ")
    val chipStatus = run.displayStatus?.takeIf { it.isNotBlank() } ?: run.status

    lk.bingchun.delivery.ui.components.BcCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 5.dp),
        onClick = onClick,
        contentPadding = PaddingValues(14.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = accent,
                        size = Size(3.dp.toPx(), size.height),
                    )
                }
                .padding(start = 12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = Format.rideIdLabel(run.rideCode, run.id),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = colors.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    StatusChip(chipStatus)
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = titleText,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (place.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = place,
                        fontSize = 12.sp,
                        color = colors.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(modifier = Modifier.height(10.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(colors.border),
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = Format.dateTime(run.completedAt ?: run.scheduledAt),
                            fontSize = 12.sp,
                            color = colors.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "${run.deliveredCount}/${run.orderCount} delivered",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = colors.text,
                        )
                    }
                    if (run.complaintCount > 0) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(end = 8.dp),
                        ) {
                            Icon(
                                Icons.Filled.Warning,
                                contentDescription = "Complaints",
                                tint = colors.warning,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(modifier = Modifier.width(3.dp))
                            Text(
                                text = "${run.complaintCount}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = colors.warning,
                            )
                        }
                    }
                    Text(
                        text = Format.money(run.deliveredTotal),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.brand,
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowForwardIos,
                        contentDescription = null,
                        tint = colors.textMuted,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }
        }
    }
}

private data class HistoryDayGroup(
    val key: String,
    val label: String,
    val runs: List<JobHistoryItem>,
)

private val historyDayLabelFmt: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)

private fun groupHistoryByDay(items: List<JobHistoryItem>): List<HistoryDayGroup> {
    val today = LocalDate.now(ZoneId.systemDefault())
    val yesterday = today.minusDays(1)
    return items
        .groupBy { parseLocalDate(it.completedAt ?: it.scheduledAt) }
        .entries
        .sortedByDescending { it.key ?: LocalDate.MIN }
        .map { (date, runs) ->
            val label = when (date) {
                null -> "Earlier"
                today -> "Today"
                yesterday -> "Yesterday"
                else -> date.format(historyDayLabelFmt)
            }
            val key = date?.toString() ?: "earlier"
            HistoryDayGroup(key = key, label = label, runs = runs)
        }
}

// Helpers for classification
private fun isCompleted(item: JobHistoryItem): Boolean =
    item.status == "COMPLETED" && item.displayStatus != "VEHICLE_FAILURE" &&
        item.displayStatus != "ABANDONED" && item.displayStatus != "CANCELLED"

private fun isCancelled(item: JobHistoryItem): Boolean =
    item.status == "ABANDONED" || item.status == "CANCELLED" ||
        item.displayStatus == "ABANDONED" || item.displayStatus == "CANCELLED" ||
        item.title.contains("Cancelled", ignoreCase = true)

private fun isVehicleFailure(item: JobHistoryItem): Boolean =
    item.status == "VEHICLE_FAILURE" || item.displayStatus == "VEHICLE_FAILURE" ||
        item.title.contains("Vehicle failure", ignoreCase = true)

private fun isWithinCurrentWeek(iso: String?): Boolean {
    val date = parseLocalDate(iso) ?: return false
    val now = LocalDate.now(ZoneId.systemDefault())
    val daysBetween = ChronoUnit.DAYS.between(date, now)
    return daysBetween in 0..7
}

private fun isWithinCurrentMonth(iso: String?): Boolean {
    val date = parseLocalDate(iso) ?: return false
    val now = LocalDate.now(ZoneId.systemDefault())
    return date.year == now.year && date.month == now.month
}

private fun parseLocalDate(iso: String?): LocalDate? {
    if (iso.isNullOrBlank()) return null
    return try {
        val raw = iso.trim()
        val instant = try {
            OffsetDateTime.parse(raw).toInstant()
        } catch (_: Exception) {
            try {
                Instant.parse(raw)
            } catch (_: Exception) {
                java.time.LocalDateTime.parse(raw).toInstant(ZoneOffset.UTC)
            }
        }
        instant.atZone(ZoneId.systemDefault()).toLocalDate()
    } catch (_: Exception) {
        null
    }
}
