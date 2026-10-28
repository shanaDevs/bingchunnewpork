package lk.bingchun.delivery.data.repository

import com.squareup.moshi.JsonClass
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import lk.bingchun.delivery.data.model.RoutePathPoint
import lk.bingchun.delivery.data.network.ApiClients
import okhttp3.Request
import java.io.IOException

/**
 * Road-following path via public OSRM — port of mobile/lib/services/road_routing_service.dart.
 * Falls back to the raw waypoints (straight lines) when OSRM is unavailable.
 */
class RouteRepository(private val clients: ApiClients) {

    private val geometryAdapter = clients.moshi.adapter(OsrmResponse::class.java)

    suspend fun fetchRoadPath(waypoints: List<RoutePathPoint>): List<RoutePathPoint> {
        if (waypoints.size < 2) return waypoints
        return withContext(Dispatchers.IO) {
            try {
                val parsed = requestOsrm(waypoints) ?: return@withContext waypoints
                val line = parsed.routes.firstOrNull()?.geometry?.coordinates
                if (parsed.code == "Ok" && !line.isNullOrEmpty()) {
                    line.map { RoutePathPoint(lat = it[1], lng = it[0]) }
                } else {
                    waypoints
                }
            } catch (_: IOException) {
                waypoints
            } catch (_: Exception) {
                waypoints
            }
        }
    }

    /** Same OSRM lookup as [fetchRoadPath] but also returns the route's total distance/duration. */
    suspend fun fetchRoadRoute(waypoints: List<RoutePathPoint>): RoadRoute {
        if (waypoints.size < 2) return RoadRoute(waypoints, null, null)
        return withContext(Dispatchers.IO) {
            try {
                val parsed = requestOsrm(waypoints) ?: return@withContext RoadRoute(waypoints, null, null)
                val route = parsed.routes.firstOrNull()
                val line = route?.geometry?.coordinates
                if (parsed.code == "Ok" && !line.isNullOrEmpty()) {
                    RoadRoute(
                        path = line.map { RoutePathPoint(lat = it[1], lng = it[0]) },
                        distanceMeters = route.distance,
                        durationSeconds = route.duration,
                    )
                } else {
                    RoadRoute(waypoints, null, null)
                }
            } catch (_: IOException) {
                RoadRoute(waypoints, null, null)
            } catch (_: Exception) {
                RoadRoute(waypoints, null, null)
            }
        }
    }

    private fun requestOsrm(waypoints: List<RoutePathPoint>): OsrmResponse? {
        val coords = waypoints.joinToString(";") { "${it.lng},${it.lat}" }
        val url = "https://router.project-osrm.org/route/v1/driving/$coords?overview=full&geometries=geojson"
        val request = Request.Builder().url(url).build()
        clients.rawOkHttp.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val body = resp.body?.string() ?: return null
            return geometryAdapter.fromJson(body)
        }
    }
}

data class RoadRoute(
    val path: List<RoutePathPoint>,
    val distanceMeters: Double?,
    val durationSeconds: Double?,
)

@JsonClass(generateAdapter = true)
data class OsrmResponse(
    val code: String? = null,
    val routes: List<OsrmRoute> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class OsrmRoute(
    val geometry: OsrmGeometry? = null,
    val distance: Double? = null,
    val duration: Double? = null,
)

@JsonClass(generateAdapter = true)
data class OsrmGeometry(
    val coordinates: List<List<Double>> = emptyList(),
)
