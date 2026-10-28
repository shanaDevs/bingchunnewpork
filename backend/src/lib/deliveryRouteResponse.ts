import { fetchRoadPath, fetchRoadRoute, buildRouteWaypoints } from './roadRouting';
import { getCachedRoute, routeCacheKey, setCachedRoute } from './routeCache';
import {
  totalRouteDistanceKm,
  totalRouteEtaMinutes,
  haversineKm,
  type LatLng,
  type RouteStop,
} from './routeOptimizer';

export async function buildDeliveryRoutePayload(
  store: LatLng & { id: string; name: string; addressLine: string; city: string },
  stops: RouteStop[],
  cacheJobId?: string
) {
  if (cacheJobId) {
    const key = routeCacheKey(
      cacheJobId,
      stops.map((s) => s.orderId)
    );
    const cached = getCachedRoute<Awaited<ReturnType<typeof buildDeliveryRoutePayload>>>(key);
    if (cached) return cached;
  }
  const waypoints = buildRouteWaypoints(
    { lat: store.lat, lng: store.lng },
    stops.map((s) => ({ lat: s.lat, lng: s.lng }))
  );

  let path = waypoints;
  let totalDistanceKm = totalRouteDistanceKm(stops);
  if (stops.length > 0) {
    const last = stops[stops.length - 1];
    totalDistanceKm = Math.round(
      (totalDistanceKm + haversineKm(last, { lat: store.lat, lng: store.lng })) * 100
    ) / 100;
  }
  let estimatedMinutes = totalRouteEtaMinutes(stops);

  if (waypoints.length >= 2) {
    try {
      const road = await fetchRoadRoute(waypoints);
      path = road.path;
      totalDistanceKm = road.distanceKm;
      estimatedMinutes = road.durationMinutes;
    } catch {
      path = await fetchRoadPath(waypoints);
    }
  }

  const payload = {
    store,
    stops,
    path,
    summary: {
      stopCount: stops.length,
      totalDistanceKm,
      estimatedMinutes,
      generatedAt: new Date().toISOString(),
    },
  };

  if (cacheJobId) {
    setCachedRoute(
      routeCacheKey(
        cacheJobId,
        stops.map((s) => s.orderId)
      ),
      payload
    );
  }

  return payload;
}
