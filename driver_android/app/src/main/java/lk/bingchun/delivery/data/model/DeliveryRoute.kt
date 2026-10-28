package lk.bingchun.delivery.data.model

import com.squareup.moshi.JsonClass
import lk.bingchun.delivery.core.Format

/** Ports of mobile/lib/models/delivery_route.dart */

@JsonClass(generateAdapter = true)
data class RouteStore(
    val id: String,
    val name: String,
    val addressLine: String,
    val city: String,
    val lat: Double,
    val lng: Double,
)

@JsonClass(generateAdapter = true)
data class RouteStop(
    val orderId: String,
    val orderNumber: String,
    val customerName: String,
    val customerPhone: String,
    val addressLine: String,
    val city: String,
    val district: String,
    val status: String,
    val total: Int,
    val itemCount: Int,
    val lat: Double,
    val lng: Double,
    val sequence: Int,
    val distanceFromPreviousKm: Double,
    val etaMinutesFromPrevious: Int,
) {
    val fullAddress: String get() = Format.shortAddress(addressLine, city, district)
}

@JsonClass(generateAdapter = true)
data class RouteSummary(
    val stopCount: Int,
    val totalDistanceKm: Double,
    val estimatedMinutes: Int,
    val generatedAt: String,
)

@JsonClass(generateAdapter = true)
data class RoutePathPoint(
    val lat: Double,
    val lng: Double,
)

@JsonClass(generateAdapter = true)
data class DeliveryRoute(
    val store: RouteStore,
    val stops: List<RouteStop> = emptyList(),
    val summary: RouteSummary,
    val path: List<RoutePathPoint> = emptyList(),
) {
    /** First undelivered stop sequence, or null when every stop is done/failed. */
    val nextStopSequence: Int?
        get() = stops.sortedBy { it.sequence }.firstOrNull { stop ->
            val s = stop.status.uppercase()
            s != "DELIVERED" && s != "CANCELLED" && s != "DELIVERY_FAILED" && s != "FAILED"
        }?.sequence
    /** store + stops in visiting order (RouteStop is the customer waypoints). */
    val waypoints: List<RoutePathPoint>
        get() = buildList {
            add(RoutePathPoint(store.lat, store.lng))
            addAll(stops.map { RoutePathPoint(it.lat, it.lng) })
        }
}

/** Where the rider is currently headed, if anywhere — drives live route-following. */
sealed class RouteLiveTarget {
    object Store : RouteLiveTarget()
    data class Stop(val sequence: Int) : RouteLiveTarget()
}

/**
 * `Store` covers both "heading to the branch to pick up" and "returning after the last
 * stop" — the two don't need to be told apart here because the pending-stops list a
 * caller derives from it naturally resolves to everything before pickup and nothing once
 * returning (reaching RETURNING requires every stop to already be delivered/failed).
 */
fun DeliveryRoute.liveRouteTarget(job: DeliveryJobDetail, activeStopSequence: Int?): RouteLiveTarget? = when {
    job.needsPickup || job.isReturning -> RouteLiveTarget.Store
    job.status == "IN_PROGRESS" -> (activeStopSequence ?: nextStopSequence)?.let { RouteLiveTarget.Stop(it) }
    else -> null
}

fun DeliveryJobDetail.toFallbackRoute(): DeliveryRoute {
    val routeStore = RouteStore(
        id = store.id,
        name = store.name,
        addressLine = store.addressLine,
        city = store.city,
        lat = store.lat,
        lng = store.lng,
    )
    val routeStops = orders.mapIndexedNotNull { index, order ->
        val lat = order.lat ?: return@mapIndexedNotNull null
        val lng = order.lng ?: return@mapIndexedNotNull null
        RouteStop(
            orderId = order.orderId,
            orderNumber = order.orderNumber,
            customerName = order.customerName,
            customerPhone = order.customerPhone,
            addressLine = order.addressLine,
            city = order.city,
            district = order.district,
            status = order.status,
            total = order.total ?: 0,
            itemCount = order.items.sumOf { it.quantity },
            lat = lat,
            lng = lng,
            sequence = if (order.sequence > 0) order.sequence else index + 1,
            distanceFromPreviousKm = 0.0,
            etaMinutesFromPrevious = 0,
        )
    }
    return DeliveryRoute(
        store = routeStore,
        stops = routeStops,
        summary = RouteSummary(
            stopCount = routeStops.size,
            totalDistanceKm = 0.0,
            estimatedMinutes = (routeStops.size * 8).coerceAtLeast(1),
            generatedAt = java.time.Instant.now().toString(),
        ),
        path = emptyList(),
    )
}
