package lk.bingchun.delivery.ui.screens

import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.DriverAlertService
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.RideAlert
import lk.bingchun.delivery.data.model.DeliveryRoute
import lk.bingchun.delivery.ui.components.MiniRouteMap
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * Pickup and drop pins for the offer. Null while loading or when the route
 * call fails; the screen then keeps the address lines without a map.
 */
@Composable
fun rememberIncomingOfferRoute(jobId: String): DeliveryRoute? {
    val context = LocalContext.current
    var route by remember(jobId) { mutableStateOf<DeliveryRoute?>(null) }
    LaunchedEffect(jobId) {
        route = null
        if (jobId.isBlank()) return@LaunchedEffect
        val app = context.applicationContext as BingChunApp
        route = runCatching { app.container.jobsRepository.getJobRoute(jobId) }
            .getOrNull()
            ?.takeIf { it.hasOfferPins() }
    }
    return route
}

private fun DeliveryRoute.hasOfferPins(): Boolean {
    if (stops.isNotEmpty()) return true
    return store.lat != 0.0 || store.lng != 0.0
}

@Composable
fun IncomingRideScreen(
    alert: RideAlert,
    accepting: Boolean,
    rejecting: Boolean = false,
    error: String?,
    route: DeliveryRoute? = null,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onTimedOut: () -> Unit = onReject,
) {
    val colors = LocalBcColors.current
    val durationMs = DriverAlertService.RING_DURATION_MS
    val totalSec = (durationMs / 1000L).toInt().coerceAtLeast(1)
    var remainingSec by remember(alert.jobId) { mutableIntStateOf(totalSec) }

    LaunchedEffect(alert.jobId, accepting) {
        if (accepting) return@LaunchedEffect
        val start = SystemClock.elapsedRealtime()
        while (true) {
            val elapsed = SystemClock.elapsedRealtime() - start
            val left = ((durationMs - elapsed) / 1000L).toInt().coerceAtLeast(0)
            remainingSec = left
            if (left <= 0) {
                onTimedOut()
                break
            }
            delay(200)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        IncomingHeader(
            rideIdLabel = Format.rideIdLabel(alert.rideCode, alert.jobId),
            remainingSec = remainingSec,
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(top = 4.dp, bottom = 16.dp),
        ) {
            OfferCard(alert = alert, route = route)
            if (error != null) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = error,
                    color = colors.danger,
                    style = BcType.body,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        IncomingFooter(
            remainingSec = remainingSec,
            totalSec = totalSec,
            accepting = accepting,
            rejecting = rejecting,
            onAccept = onAccept,
            onReject = onReject,
        )
    }
}

@Composable
private fun IncomingHeader(
    rideIdLabel: String,
    remainingSec: Int,
) {
    val colors = LocalBcColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "New delivery",
                style = BcType.title,
                color = colors.text,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = rideIdLabel,
                style = BcType.caption,
                color = colors.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = "${remainingSec}s",
            style = BcType.subtitle,
            color = colors.brand,
        )
    }
}

@Composable
private fun OfferCard(
    alert: RideAlert,
    route: DeliveryRoute?,
) {
    val colors = LocalBcColors.current
    val shape = RoundedCornerShape(BcRadius.card)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.card)
            .border(1.dp, colors.border, shape)
            .padding(16.dp),
    ) {
        FeeBlock(alert)
        SectionDivider()
        OrdersBlock(alert)
        if (hasRouteFacts(alert) || (route != null && route.hasOfferPins())) {
            SectionDivider()
            RouteBlock(alert, route)
        }
    }
}

@Composable
private fun SectionDivider() {
    val colors = LocalBcColors.current
    Spacer(Modifier.height(14.dp))
    HorizontalDivider(color = colors.border, thickness = 1.dp)
    Spacer(Modifier.height(14.dp))
}

@Composable
private fun FeeBlock(alert: RideAlert) {
    val colors = LocalBcColors.current
    Text(
        text = "Delivery fee",
        style = BcType.caption,
        color = colors.textMuted,
    )
    Spacer(Modifier.height(4.dp))
    Text(
        text = Format.money(alert.deliveryFee),
        color = colors.text,
        fontSize = 32.sp,
        fontWeight = FontWeight.Bold,
        lineHeight = 36.sp,
    )
    if (alert.orderCount > 0 || alert.totalCups > 0) {
        Spacer(Modifier.height(4.dp))
        Text(
            text = Format.deliverySummary(alert.orderCount, alert.totalCups),
            style = BcType.body,
            color = colors.text,
        )
    }
}

@Composable
private fun OrdersBlock(alert: RideAlert) {
    val colors = LocalBcColors.current
    Text(
        text = "Orders",
        style = BcType.section,
        color = colors.text,
    )
    Spacer(Modifier.height(10.dp))
    if (alert.orderPreviews.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            alert.orderPreviews.forEach { preview ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "#${preview.orderNumber}",
                        style = BcType.bodyStrong,
                        color = colors.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = Format.money(preview.deliveryFee),
                        style = BcType.bodyStrong,
                        color = colors.text,
                    )
                }
            }
            val extra = (alert.orderCount - alert.orderPreviews.size).coerceAtLeast(0)
            if (extra > 0) {
                Text(
                    text = if (extra == 1) "+1 more" else "+$extra more",
                    style = BcType.caption,
                    color = colors.textMuted,
                )
            }
        }
    } else {
        Text(
            text = "Order lines loading",
            style = BcType.caption,
            color = colors.textMuted,
        )
    }
}

private fun hasRouteFacts(alert: RideAlert): Boolean {
    if (alert.storeName.isNotBlank() || alert.storeCity.isNotBlank()) return true
    if (alert.dropoffName.isNotBlank() || alert.dropoffAddress.isNotBlank()) return true
    return alert.estimatedDistanceKm != null || alert.estimatedMinutes != null
}

@Composable
private fun RouteBlock(
    alert: RideAlert,
    route: DeliveryRoute?,
) {
    val context = LocalContext.current
    val colors = LocalBcColors.current
    val pickupQuery = listOf(alert.storeName, alert.storeCity).filter { it.isNotBlank() }.joinToString(", ")
    val dropQuery = listOf(alert.dropoffName, alert.dropoffAddress).filter { it.isNotBlank() }.joinToString(", ")
    val showPickup = pickupQuery.isNotBlank()
    val showDrop = alert.dropoffName.isNotBlank() || alert.dropoffAddress.isNotBlank()

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (showPickup) {
            PlaceRow(
                label = "Pickup",
                title = alert.storeName.ifBlank { "Pickup" },
                subtitle = alert.storeCity,
                onClick = { openMaps(context, pickupQuery) },
            )
        }
        if (showDrop) {
            val extra = if (alert.extraStopCount > 0) {
                val word = if (alert.extraStopCount == 1) "stop" else "stops"
                "+${alert.extraStopCount} more $word"
            } else {
                ""
            }
            PlaceRow(
                label = "Drop-off",
                title = alert.dropoffName.ifBlank { "Customer" },
                subtitle = listOf(alert.dropoffAddress, extra).filter { it.isNotBlank() }.joinToString(" · "),
                onClick = { if (dropQuery.isNotBlank()) openMaps(context, dropQuery) },
            )
        }
        val meta = listOfNotNull(
            alert.estimatedDistanceKm?.let { Format.km(it) },
            alert.estimatedMinutes?.let { Format.minutes(it) },
        )
        if (meta.isNotEmpty()) {
            Text(
                text = meta.joinToString(" · "),
                style = BcType.caption,
                color = colors.textMuted,
            )
        }
        if (route != null && route.hasOfferPins()) {
            MiniRouteMap(
                route = route,
                onTap = {},
                mapHeight = 120.dp,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PlaceRow(
    label: String,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    val colors = LocalBcColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Text(text = label, style = BcType.caption, color = colors.textMuted)
        Spacer(Modifier.height(2.dp))
        Text(
            text = title,
            style = BcType.bodyStrong,
            color = colors.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (subtitle.isNotBlank()) {
            Text(
                text = subtitle,
                style = BcType.caption,
                color = colors.textMuted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun IncomingFooter(
    remainingSec: Int,
    totalSec: Int,
    accepting: Boolean,
    rejecting: Boolean,
    onAccept: () -> Unit,
    onReject: () -> Unit,
) {
    val colors = LocalBcColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.background)
            .navigationBarsPadding()
            .padding(horizontal = 16.dp)
            .padding(bottom = 10.dp, top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Button(
                onClick = onReject,
                enabled = !accepting && !rejecting,
                modifier = Modifier.weight(1f).height(52.dp),
                shape = BcRadius.buttonShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (colors.isDark) Color(0xFF1E293B) else Color(0xFFE8EEF5),
                    contentColor = if (colors.isDark) Color(0xFFE2E8F0) else Color(0xFF334155),
                    disabledContainerColor = if (colors.isDark) Color(0xFF1E293B) else Color(0xFFE8EEF5),
                    disabledContentColor = colors.textMuted,
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
            ) {
                Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Reject", fontWeight = FontWeight.SemiBold)
            }
            Button(
                onClick = onAccept,
                enabled = !accepting && !rejecting,
                modifier = Modifier.weight(1.2f).height(52.dp),
                shape = BcRadius.buttonShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = colors.brand,
                    contentColor = colors.onBrand,
                ),
            ) {
                if (accepting) {
                    CircularProgressIndicator(
                        color = colors.onBrand,
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Accept Ride", fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            text = "Closes in $remainingSec seconds",
            style = BcType.caption,
            color = colors.textMuted,
        )
        Spacer(Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { remainingSec.toFloat() / totalSec.toFloat() },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(99.dp)),
            color = colors.brand,
            trackColor = colors.border,
        )
    }
}

private fun openMaps(context: android.content.Context, query: String) {
    val uri = Uri.parse("geo:0,0?q=${Uri.encode(query)}")
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }
}
