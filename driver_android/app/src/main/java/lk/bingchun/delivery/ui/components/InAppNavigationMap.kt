package lk.bingchun.delivery.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.drawable.BitmapDrawable
import android.os.SystemClock
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.data.model.RoutePathPoint
import lk.bingchun.delivery.tracking.DriverFix
import lk.bingchun.delivery.ui.theme.LocalBcColors
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.Projection
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Overlay
import org.osmdroid.views.overlay.Polyline

private const val NAV_ZOOM = 18.5
private const val MIN_REFETCH_DELTA = 0.0002 // ~20m
private const val MIN_HEADING_DELTA = 0.00004 // ~4m — small enough to pick up heading while walking/driving slowly

/** Great-circle initial bearing from (lat1,lng1) to (lat2,lng2), in degrees clockwise from north. */
private fun bearingBetween(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val phi1 = Math.toRadians(lat1)
    val phi2 = Math.toRadians(lat2)
    val deltaLambda = Math.toRadians(lng2 - lng1)
    val y = kotlin.math.sin(deltaLambda) * kotlin.math.cos(phi2)
    val x = kotlin.math.cos(phi1) * kotlin.math.sin(phi2) -
        kotlin.math.sin(phi1) * kotlin.math.cos(phi2) * kotlin.math.cos(deltaLambda)
    val theta = kotlin.math.atan2(y, x)
    return (Math.toDegrees(theta) + 360) % 360
}

/**
 * Full-screen, single-destination live navigation map: draws a road-following route from the
 * driver's current fix to [destLat]/[destLng], rotates so the direction of travel points up
 * (heading-up, like turn-by-turn navigation) once a GPS bearing is available, keeps the camera
 * centered on the driver, and reports live distance/duration via [onRouteUpdate].
 */
@Composable
fun NavigationMap(
    destLat: Double,
    destLng: Double,
    destLabel: String,
    onRouteUpdate: (distanceMeters: Double?, durationSeconds: Double?) -> Unit,
    modifier: Modifier = Modifier,
    recenterRequests: Int = 0,
) {
    val context = LocalContext.current
    val container = (context.applicationContext as BingChunApp).container
    val scope = rememberCoroutineScope()
    val colors = LocalBcColors.current
    val brandArgb = colors.brand.toArgb()
    val brandDark = colors.brandDark
    val onBrand = colors.onBrand
    val onRouteUpdateState = rememberUpdatedState(onRouteUpdate)

    var roadPath by remember { mutableStateOf<List<RoutePathPoint>>(emptyList()) }
    var hasFix by remember { mutableStateOf(false) }
    val zoomed = remember { booleanArrayOf(false) }
    val arrow = remember { DriverArrowOverlay(brandArgb) }

    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            setBuiltInZoomControls(false)
            controller.setZoom(NAV_ZOOM)
            controller.setCenter(GeoPoint(destLat, destLng))
        }
    }

    DisposableEffect(Unit) {
        mapView.onResume()
        onDispose {
            arrow.stop()
            mapView.overlays.remove(arrow)
            mapView.onPause()
        }
    }

    LaunchedEffect(destLat, destLng) {
        var last: DriverFix? = null
        var lastHeading: Double? = null
        container.locationTracker.lastFix.collect { fix ->
            if (fix == null) {
                arrow.setActive(mapView, null, false, false)
                return@collect
            }
            hasFix = true

            // Prefer the device-reported GPS bearing; most providers (and mock/emulator
            // locations) only report this while actually moving at speed, so fall back to a
            // bearing computed from the last two fixes — this is also how Google Maps'
            // heading-up mode behaves when a device bearing isn't available.
            val prev = last
            val movedEnoughForHeading = prev != null && run {
                val dLat = fix.lat - prev.lat
                val dLng = fix.lng - prev.lng
                dLat * dLat + dLng * dLng > MIN_HEADING_DELTA * MIN_HEADING_DELTA
            }
            val heading = fix.heading
                ?: if (movedEnoughForHeading) bearingBetween(prev!!.lat, prev.lng, fix.lat, fix.lng) else lastHeading
            if (heading != null) {
                lastHeading = heading
                mapView.mapOrientation = (-heading).toFloat()
            }
            arrow.setActive(mapView, GeoPoint(fix.lat, fix.lng), true, heading != null)

            if (!zoomed[0]) {
                mapView.controller.setZoom(NAV_ZOOM)
                mapView.controller.setCenter(GeoPoint(fix.lat, fix.lng))
                zoomed[0] = true
            } else {
                mapView.controller.animateTo(GeoPoint(fix.lat, fix.lng))
            }

            last = fix
            if (prev != null) {
                val dLat = fix.lat - prev.lat
                val dLng = fix.lng - prev.lng
                if (dLat * dLat + dLng * dLng < MIN_REFETCH_DELTA * MIN_REFETCH_DELTA && roadPath.size >= 2) {
                    return@collect
                }
            }
            scope.launch {
                val result = container.routeRepository.fetchRoadRoute(
                    listOf(RoutePathPoint(fix.lat, fix.lng), RoutePathPoint(destLat, destLng)),
                )
                roadPath = result.path
                onRouteUpdateState.value(result.distanceMeters, result.durationSeconds)
            }
        }
    }

    LaunchedEffect(recenterRequests) {
        if (recenterRequests == 0) return@LaunchedEffect
        val fix = container.locationTracker.lastFix.value ?: return@LaunchedEffect
        mapView.controller.animateTo(GeoPoint(fix.lat, fix.lng))
    }

    Box(modifier = modifier) {
        AndroidView(
            factory = { mapView },
            modifier = Modifier.fillMaxSize(),
            update = { map ->
                map.overlays.removeAll { it !== arrow }

                if (roadPath.size >= 2) {
                    val polyline = Polyline(map).apply {
                        setPoints(roadPath.map { GeoPoint(it.lat, it.lng) })
                        outlinePaint.color = brandArgb
                        outlinePaint.strokeWidth = 14f
                    }
                    map.overlays.add(polyline)
                }

                map.overlays.add(
                    destinationPinMarker(
                        map = map,
                        point = GeoPoint(destLat, destLng),
                        title = destLabel,
                        fill = brandDark,
                        text = onBrand,
                    ),
                )

                if (!map.overlays.contains(arrow) && arrow.isActive) {
                    map.overlays.add(arrow)
                }

                map.invalidate()
            },
        )

        if (!hasFix) {
            CircularProgressIndicator(color = colors.brand, modifier = Modifier.align(Alignment.Center))
        }
    }
}

/** Pin-shaped destination marker (teardrop, anchored at its tip) instead of a plain dot. */
private fun destinationPinMarker(map: MapView, point: GeoPoint, title: String, fill: Color, text: Color): Marker {
    val density = map.context.resources.displayMetrics.density
    val w = (34f * density).toInt().coerceAtLeast(28)
    val h = (44f * density).toInt().coerceAtLeast(36)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    val cx = w / 2f
    val r = w / 2f - 3f * density
    val cy = r + 3f * density

    val tip = Path().apply {
        moveTo(cx - r * 0.62f, cy + r * 0.62f)
        lineTo(cx, h.toFloat())
        lineTo(cx + r * 0.62f, cy + r * 0.62f)
        close()
    }
    paint.color = fill.toArgb()
    canvas.drawPath(tip, paint)
    canvas.drawCircle(cx, cy, r, paint)

    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 1.5f * density
    paint.color = android.graphics.Color.WHITE
    canvas.drawCircle(cx, cy, r, paint)

    paint.style = Paint.Style.FILL
    paint.color = text.toArgb()
    canvas.drawCircle(cx, cy, r * 0.34f, paint)

    return Marker(map).apply {
        position = point
        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        this.title = title
        icon = BitmapDrawable(map.context.resources, bmp)
    }
}

/**
 * Driver marker for the nav screen: a fading pulse plus a fixed upward-pointing arrowhead.
 * The arrow always points "up" on screen because the map itself rotates to heading-up
 * ([NavigationMap] sets [MapView.setMapOrientation]) — falls back to a plain dot when no
 * GPS bearing is available yet, so it never shows a stale or wrong direction.
 */
private class DriverArrowOverlay(private val brandArgb: Int) : Overlay() {
    var location: GeoPoint? = null
        private set
    var isActive: Boolean = false
        private set
    private var hasHeading: Boolean = false

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = android.graphics.Color.WHITE
        strokeWidth = 3f
    }
    private var mapView: MapView? = null
    private val tick = object : Runnable {
        override fun run() {
            val map = mapView ?: return
            if (!isActive) return
            map.postInvalidate()
            map.postDelayed(this, 50)
        }
    }

    fun setActive(map: MapView, point: GeoPoint?, tracking: Boolean, heading: Boolean) {
        mapView = map
        location = point
        hasHeading = heading
        val was = isActive
        isActive = tracking && point != null
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
        val x = pt.x.toFloat()
        val y = pt.y.toFloat()

        val t = (SystemClock.uptimeMillis() % 1400L) / 1400f
        val pulseR = 16f + 20f * t
        fill.color = brandArgb
        fill.alpha = ((1f - t) * 90).toInt().coerceIn(0, 90)
        c.drawCircle(x, y, pulseR, fill)

        if (hasHeading) {
            val size = 26f
            val arrow = Path().apply {
                moveTo(x, y - size)
                lineTo(x - size * 0.62f, y + size * 0.55f)
                lineTo(x, y + size * 0.18f)
                lineTo(x + size * 0.62f, y + size * 0.55f)
                close()
            }
            fill.color = brandArgb
            fill.alpha = 255
            c.drawPath(arrow, fill)
            c.drawPath(arrow, stroke)
        } else {
            fill.alpha = 230
            c.drawCircle(x, y, 11f, fill)
            fill.color = android.graphics.Color.WHITE
            fill.alpha = 255
            c.drawCircle(x, y, 4.5f, fill)
        }
    }
}
