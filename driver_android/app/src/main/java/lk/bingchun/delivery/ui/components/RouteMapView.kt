package lk.bingchun.delivery.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.outlined.CropFree
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.flow.combine
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.data.model.DeliveryRoute
import lk.bingchun.delivery.data.model.RouteLiveTarget
import lk.bingchun.delivery.data.model.RoutePathPoint
import lk.bingchun.delivery.data.model.RouteStop
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.LocalBcColors
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Overlay
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline
import org.osmdroid.views.Projection
import android.graphics.DashPathEffect
import android.graphics.Path
import lk.bingchun.delivery.tracking.DriverFix

/**
 * OpenStreetMap route view. Route overlays rebuild only when the route changes.
 * Driver pulse is updated from [LocationTracker] without recomposing the screen.
 *
 * @param contentPaddingBottomPx height of UI covering the bottom of the map (e.g. a bottom
 *   sheet). The camera fit keeps the route above it instead of centring it behind.
 * @param refitKey bump to re-run the camera fit after the driver has panned away.
 * @param pickupRadiusM branch geofence in metres. When set, the zone where Confirm Pickup
 *   unlocks is drawn as a dashed ring around the store so the driver can see how close they
 *   need to get instead of only reading it in the copy.
 */
@Composable
fun RouteMap(
    route: DeliveryRoute,
    modifier: Modifier = Modifier,
    activeStopSequence: Int? = null,
    interactive: Boolean = true,
    compact: Boolean = false,
    showDriverLocation: Boolean = false,
    liveTarget: RouteLiveTarget? = null,
    contentPaddingBottomPx: Int = 0,
    refitKey: Any? = null,
    pickupRadiusM: Int? = null,
) {
    val context = LocalContext.current
    val container = (context.applicationContext as BingChunApp).container
    val colors = LocalBcColors.current
    val brandArgb = colors.brand.toArgb()
    val brandDark = colors.brandDark
    val success = colors.success
    val danger = colors.danger
    val textOnBrand = colors.onBrand

    val targetPoint = remember(route, liveTarget) {
        when (liveTarget) {
            null -> null
            RouteLiveTarget.Store -> RoutePathPoint(route.store.lat, route.store.lng)
            is RouteLiveTarget.Stop -> route.stops.firstOrNull { it.sequence == liveTarget.sequence }
                ?.let { RoutePathPoint(it.lat, it.lng) }
        }
    }
    val tailStops = remember(route, liveTarget) {
        val pending = route.stops
            .filter { it.status.uppercase() !in setOf("DELIVERED", "CANCELLED", "DELIVERY_FAILED", "FAILED") }
            .sortedBy { it.sequence }
        when (liveTarget) {
            null -> emptyList()
            RouteLiveTarget.Store -> pending
            is RouteLiveTarget.Stop -> pending.filter { it.sequence > liveTarget.sequence }
        }
    }

    // Static plan: the whole route when there's no live target to follow.
    var staticPath by remember(route, liveTarget) {
        mutableStateOf(if (liveTarget == null) route.path else emptyList())
    }
    // Tail: the plan beyond the live target — fetched once per target change, not per GPS fix.
    var tailPath by remember(route, liveTarget) { mutableStateOf(emptyList<RoutePathPoint>()) }
    // Lead: rider's current position -> the live target, refetched as they move.
    var leadPath by remember(route, liveTarget) { mutableStateOf(emptyList<RoutePathPoint>()) }

    val roadPath = if (targetPoint != null) leadPath + tailPath else staticPath

    val fitted = remember(
        route.summary.generatedAt,
        route.stops.size,
        liveTarget,
        contentPaddingBottomPx,
        refitKey,
        // The ring widens the area worth framing, so a radius arriving late must refit.
        pickupRadiusM,
    ) { booleanArrayOf(false) }
    val pulse = remember { PulseLocationOverlay(brandArgb) }

    LaunchedEffect(route, liveTarget) {
        if (targetPoint == null) {
            staticPath = if (route.path.size >= 2) route.path else container.routeRepository.fetchRoadPath(route.waypoints)
            return@LaunchedEffect
        }
        tailPath = when {
            tailStops.isEmpty() -> emptyList()
            // Nothing delivered yet — the backend's precomputed store->stops path already
            // covers this tail exactly, no reason to refetch it client-side.
            liveTarget == RouteLiveTarget.Store && tailStops.size == route.stops.size ->
                if (route.path.size >= 2) route.path else container.routeRepository.fetchRoadPath(route.waypoints)
            else -> container.routeRepository.fetchRoadPath(
                listOf(targetPoint) + tailStops.map { RoutePathPoint(it.lat, it.lng) },
            )
        }
    }

    LaunchedEffect(liveTarget, targetPoint) {
        if (targetPoint == null) return@LaunchedEffect
        var last: lk.bingchun.delivery.tracking.DriverFix? = null
        container.locationTracker.lastFix.collect { fix ->
            if (fix == null) {
                leadPath = emptyList()
                return@collect
            }
            val prev = last
            last = fix
            if (prev != null) {
                val dLat = fix.lat - prev.lat
                val dLng = fix.lng - prev.lng
                if (dLat * dLat + dLng * dLng < 0.0007 * 0.0007 && leadPath.size >= 2) return@collect
            }
            leadPath = container.routeRepository.fetchRoadPath(
                listOf(RoutePathPoint(fix.lat, fix.lng), targetPoint),
            )
        }
    }

    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(interactive)
            setBuiltInZoomControls(false)
            isClickable = interactive
        }
    }

    DisposableEffect(Unit) {
        mapView.onResume()
        onDispose {
            pulse.stop()
            mapView.overlays.remove(pulse)
            mapView.onPause()
            // onPause() alone leaves osmdroid's tile-loading thread pool and caches
            // running; onDetach() fully releases them so repeated create/dispose cycles
            // (e.g. this card scrolling on/off screen) don't accumulate resources.
            mapView.onDetach()
        }
    }

    LaunchedEffect(showDriverLocation, mapView) {
        if (!showDriverLocation) {
            pulse.setActive(mapView, null, false)
            return@LaunchedEffect
        }
        combine(container.locationTracker.lastFix, container.locationTracker.runTracking) { fix, tracking ->
            fix to tracking
        }.collect { (fix, tracking) ->
            pulse.setActive(mapView, fix, tracking)
        }
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
        update = { map ->
            map.overlays.removeAll { it !== pulse }
            val keptPulse = map.overlays.contains(pulse)

            // Added first so the route line and every pin draw on top of the fill.
            val pickupZone = if (pickupRadiusM != null && pickupRadiusM > 0) {
                Polygon(map).apply {
                    points = Polygon.pointsAsCircle(
                        GeoPoint(route.store.lat, route.store.lng),
                        pickupRadiusM.toDouble(),
                    )
                    fillPaint.color = PickupZoneGreen.copy(alpha = 0.14f).toArgb()
                    outlinePaint.color = PickupZoneGreen.toArgb()
                    outlinePaint.strokeWidth = if (compact) 3f else 4f
                    outlinePaint.pathEffect = DashPathEffect(floatArrayOf(14f, 10f), 0f)
                    // An info window here would fight the store pin's own tap target.
                    setOnClickListener { _, _, _ -> false }
                }.also { map.overlays.add(it) }
            } else {
                null
            }

            val line = if (roadPath.size >= 2) roadPath else route.waypoints
            if (line.size >= 2) {
                val polyline = Polyline(map).apply {
                    setPoints(line.map { GeoPoint(it.lat, it.lng) })
                    outlinePaint.color = brandArgb
                    outlinePaint.strokeWidth = if (compact) 8f else 12f
                }
                map.overlays.add(polyline)
            }

            map.overlays.add(
                numberedMarker(
                    map = map,
                    point = GeoPoint(route.store.lat, route.store.lng),
                    label = "S",
                    title = if (pickupRadiusM != null && pickupRadiusM > 0) {
                        "Store: ${route.store.name} · pickup unlocks within ${pickupRadiusM}m"
                    } else {
                        "Store: ${route.store.name}"
                    },
                    fill = brandDark,
                    text = textOnBrand,
                    next = false,
                    compact = compact,
                ),
            )

            val nextSeq = activeStopSequence ?: route.nextStopSequence
            route.stops.forEach { stop ->
                map.overlays.add(stopMarker(map, stop, nextSeq, compact, success, danger, textOnBrand))
            }

            if (keptPulse || pulse.isActive) {
                map.overlays.remove(pulse)
                map.overlays.add(pulse)
            }

            // The ring can reach past the route itself (a lone nearby stop, or a wide branch
            // override), so fit it too rather than letting it spill out of frame.
            val boundsPoints = (if (line.isNotEmpty()) line else route.waypoints)
                .map { GeoPoint(it.lat, it.lng) } + (pickupZone?.actualPoints ?: emptyList())
            if (!fitted[0] && boundsPoints.isNotEmpty()) {
                // Deferred: map.height is 0 until the view is laid out, and the fit needs it.
                map.post { fitCamera(map, boundsPoints, contentPaddingBottomPx, compact) }
                fitted[0] = true
            }
            map.invalidate()
        },
    )
}

/**
 * Frames [points] in the part of the map left visible above [bottomPx] of overlaying UI.
 *
 * osmdroid only pads a bounding box symmetrically, so instead of offsetting the camera we
 * stretch the box southward: fitting the taller box to the full viewport leaves the real
 * content sitting in the top `height - bottomPx` band.
 */
private fun fitCamera(map: MapView, points: List<GeoPoint>, bottomPx: Int, compact: Boolean) {
    val border = if (compact) 40 else 80
    val visible = (map.height - bottomPx).coerceAtLeast(1)
    // Below a third of the viewport there is no band worth fitting into — centre normally
    // rather than zooming out to nothing.
    val obscured = bottomPx > 0 && map.height > 0 && visible >= map.height / 3

    if (points.size == 1) {
        val only = points.first()
        if (!obscured) {
            map.controller.setZoom(15.0)
            map.controller.setCenter(only)
            return
        }
        // A lone pin has no span of its own, so fit a small box around it and bias that
        // south. The zoom lands near 15 for a ~0.01° box on a phone viewport.
        val span = 0.01
        val extra = span * 2 * (map.height - visible).toDouble() / visible
        map.zoomToBoundingBox(
            BoundingBox(
                only.latitude + span,
                only.longitude + span,
                only.latitude - span - extra,
                only.longitude - span,
            ),
            false,
            border,
        )
        return
    }

    var box = BoundingBox.fromGeoPoints(points).increaseByScale(1.4f)
    if (obscured) {
        val extra = box.latitudeSpan * (map.height - visible).toDouble() / visible
        box = BoundingBox(
            box.latNorth,
            box.lonEast,
            (box.latSouth - extra).coerceAtLeast(-85.0),
            box.lonWest,
        )
    }
    map.zoomToBoundingBox(box, false, border)
}

@Composable
fun MiniRouteMap(
    route: DeliveryRoute,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
    activeStopSequence: Int? = null,
    showDriverLocation: Boolean = false,
    headingToStore: Boolean = false,
    gpsActive: Boolean = false,
    mapHeight: Dp = 260.dp,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(mapHeight)
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(18.dp))
            .semantics { contentDescription = "Route map, tap for full screen" },
    ) {
        RouteMap(
            route = route,
            activeStopSequence = activeStopSequence,
            interactive = false,
            compact = true,
            showDriverLocation = showDriverLocation,
            modifier = Modifier.fillMaxSize(),
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(onClick = onTap),
        )

        MapControlButton(
            icon = Icons.Filled.Fullscreen,
            label = "Full screen map",
            onClick = onTap,
            modifier = Modifier.align(Alignment.TopEnd).padding(10.dp),
        )

        // GPS active overlay on top left
        if (gpsActive) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(12.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFFDCFCE7).copy(alpha = 0.95f))
                    .border(1.dp, Color(0xFFBBF7D0), RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Outlined.GpsFixed,
                        contentDescription = null,
                        tint = Color(0xFF16A34A),
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Column {
                        Text(
                            "GPS active",
                            color = Color(0xFF166534),
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                        )
                        Text(
                            "Tracking this run",
                            color = Color(0xFF15803D),
                            fontSize = 10.sp,
                        )
                    }
                }
            }
        }
    }
}

/** Small floating icon button used to overlay controls (recentre, expand) on a [RouteMap]. */
@Composable
fun MapControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    IconButton(
        onClick = onClick,
        modifier = modifier
            .size(40.dp)
            .clip(BcRadius.mdShape)
            .background(colors.card.copy(alpha = 0.94f))
            .border(1.dp, colors.border, BcRadius.mdShape)
            .semantics { contentDescription = label },
    ) {
        Icon(icon, contentDescription = null, tint = colors.brandLight, modifier = Modifier.size(20.dp))
    }
}

/**
 * Delivery stops are red map pins carrying their stop number — the map convention drivers
 * already read. Fixed reds rather than theme tokens: a pin sits on light MAPNIK tiles in
 * both themes, so it should not follow the app's background.
 */
private val StopPinRed = Color(0xFFE53935)
private val StopPinRedNext = Color(0xFFC62828)

/**
 * Pickup-zone ring. Fixed green rather than `colors.success` for the same reason as the pins:
 * MAPNIK tiles are light in both themes, and the dark palette's success green washes out on
 * them. This is the admin route map's zone green, so both audiences read one colour.
 */
private val PickupZoneGreen = Color(0xFF16A34A)

private fun stopMarker(
    map: MapView,
    stop: RouteStop,
    nextSeq: Int?,
    compact: Boolean,
    success: Color,
    danger: Color,
    onFill: Color,
): Marker {
    val status = stop.status.uppercase()
    val delivered = status == "DELIVERED"
    val failed = status == "DELIVERY_FAILED" || status == "FAILED"
    val next = stop.sequence == nextSeq && !delivered && !failed
    val fill = when {
        delivered -> success
        failed -> danger
        // The next stop is a deeper red and gets the halo + larger head from `next`.
        next -> StopPinRedNext
        else -> StopPinRed
    }
    val glyph = when {
        delivered -> "✓"
        failed -> "!"
        else -> stop.sequence.toString()
    }
    return numberedMarker(
        map = map,
        point = GeoPoint(stop.lat, stop.lng),
        label = glyph,
        title = "${stop.sequence}. ${stop.customerName}",
        fill = fill,
        text = onFill,
        next = next,
        compact = compact,
    )
}

/**
 * Cache key for a rasterised marker icon. Markers only vary by their glyph, colours, and
 * size class, so the same bitmap can be reused across every `update()` pass instead of
 * being re-rasterised (which otherwise runs on the UI thread on every recomposition and
 * every time the map is recreated, e.g. after scrolling it back into view).
 */
private data class MarkerIconKey(
    val label: String,
    val fillArgb: Int,
    val textArgb: Int,
    val next: Boolean,
    val compact: Boolean,
)

private val markerIconCache = java.util.concurrent.ConcurrentHashMap<MarkerIconKey, BitmapDrawable>()

internal fun numberedMarker(
    map: MapView,
    point: GeoPoint,
    label: String,
    title: String,
    fill: Color,
    text: Color,
    next: Boolean,
    compact: Boolean,
): Marker {
    val key = MarkerIconKey(label, fill.toArgb(), text.toArgb(), next, compact)
    val iconDrawable = markerIconCache.getOrPut(key) { renderMarkerIcon(map, label, fill, text, next, compact) }
    return Marker(map).apply {
        position = point
        // A pin points at its location, so the tip is the anchor.
        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        this.title = title
        icon = iconDrawable
    }
}

private fun renderMarkerIcon(
    map: MapView,
    label: String,
    fill: Color,
    text: Color,
    next: Boolean,
    compact: Boolean,
): BitmapDrawable {
    val density = map.context.resources.displayMetrics.density
    val headDp = when {
        next -> 34f
        compact -> 26f
        else -> 30f
    }
    val head = (headDp * density).toInt().coerceAtLeast(26)
    val width = head + (4f * density).toInt() // room for the halo and outline
    val height = (width * 1.42f).toInt()
    val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    val cx = width / 2f
    val radius = head / 2f - 1f * density
    val cy = radius + 2f * density
    val tipY = height - 1f * density

    if (next) {
        paint.color = fill.copy(alpha = 0.28f).toArgb()
        canvas.drawCircle(cx, cy, radius + 2f * density, paint)
    }

    // Tail vertices sit on the head circle (0.62² + 0.78² ≈ 1) so the union has no waist.
    val tail = Path().apply {
        moveTo(cx - radius * 0.62f, cy + radius * 0.78f)
        lineTo(cx + radius * 0.62f, cy + radius * 0.78f)
        lineTo(cx, tipY)
        close()
    }
    val headPath = Path().apply { addCircle(cx, cy, radius, Path.Direction.CW) }
    val body = Path().apply { op(headPath, tail, Path.Op.UNION) }

    paint.style = Paint.Style.FILL
    paint.color = fill.toArgb()
    canvas.drawPath(body, paint)

    paint.style = Paint.Style.STROKE
    paint.color = android.graphics.Color.WHITE
    paint.alpha = 220
    paint.strokeWidth = 1.5f * density
    canvas.drawPath(body, paint)

    paint.style = Paint.Style.FILL
    paint.alpha = 255
    paint.color = text.toArgb()
    paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    paint.textAlign = Paint.Align.CENTER
    paint.textSize = if (label.length > 1) head * 0.42f else head * 0.52f
    val textY = cy - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(label, cx, textY, paint)

    return BitmapDrawable(map.context.resources, bmp)
}

/**
 * Draws a live driver arrow with a fading pulse. Ticks the map locally so Compose
 * does not rebuild the Active Run screen on each GPS fix.
 */
internal class PulseLocationOverlay(
    private val brandArgb: Int,
) : Overlay() {
    var location: GeoPoint? = null
        private set
    var heading: Float = 0f
        private set
    var isActive: Boolean = false
        private set

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = android.graphics.Color.WHITE
    }
    private val arrowPath = Path()
    private var mapView: MapView? = null
    private val tick = object : Runnable {
        override fun run() {
            val map = mapView ?: return
            if (!isActive) return
            map.postInvalidate()
            map.postDelayed(this, 50)
        }
    }

    fun setActive(map: MapView, fix: DriverFix?, tracking: Boolean) {
        mapView = map
        location = fix?.let { GeoPoint(it.lat, it.lng) }
        heading = fix?.heading?.toFloat() ?: heading
        val was = isActive
        isActive = tracking && location != null
        if (isActive) {
            if (!map.overlays.contains(this)) map.overlays.add(this)
            if (!was) map.post(tick)
        } else {
            map.overlays.remove(this)
            map.removeCallbacks(tick)
        }
        map.invalidate()
    }

    fun stop() {
        isActive = false
        mapView?.removeCallbacks(tick)
        mapView = null
    }

    override fun draw(c: AndroidCanvas, p: Projection) {
        if (!isActive) return
        val loc = location ?: return
        val pt = p.toPixels(loc, null)
        val cx = pt.x.toFloat()
        val cy = pt.y.toFloat()
        val t = (SystemClock.uptimeMillis() % 1400L) / 1400f
        val pulseR = 22f + 26f * t
        fill.color = brandArgb
        fill.alpha = ((1f - t) * 90).toInt().coerceIn(0, 90)
        c.drawCircle(cx, cy, pulseR, fill)

        // Brand circle behind the arrow
        fill.alpha = 255
        c.drawCircle(cx, cy, 22f, fill)
        stroke.strokeWidth = 3.5f
        c.drawCircle(cx, cy, 22f, stroke)

        // Large directional arrow — points up at 0° (north), rotated by heading
        c.save()
        c.rotate(heading, cx, cy)
        val arrowSize = 18f
        arrowPath.reset()
        arrowPath.moveTo(cx, cy - arrowSize)
        arrowPath.lineTo(cx - arrowSize * 0.62f, cy + arrowSize * 0.72f)
        arrowPath.lineTo(cx, cy + arrowSize * 0.2f)
        arrowPath.lineTo(cx + arrowSize * 0.62f, cy + arrowSize * 0.72f)
        arrowPath.close()
        fill.color = android.graphics.Color.WHITE
        fill.alpha = 255
        c.drawPath(arrowPath, fill)
        stroke.strokeWidth = 2f
        stroke.color = brandArgb
        c.drawPath(arrowPath, stroke)
        c.restore()
    }
}
