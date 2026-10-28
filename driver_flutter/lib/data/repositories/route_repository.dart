import '../json.dart';
import '../models/delivery_route.dart';
import '../network/api_client.dart';

/// Road-following path via public OSRM — port of RouteRepository.kt.
/// Falls back to the raw waypoints (straight lines) when OSRM is unavailable.
class RouteRepository {
  RouteRepository(this._api);

  final ApiClient _api;

  Future<List<RoutePathPoint>> fetchRoadPath(List<RoutePathPoint> waypoints) async =>
      (await fetchRoadRoute(waypoints)).path;

  /// Same OSRM lookup as [fetchRoadPath] but also returns the route's total distance/duration.
  Future<RoadRoute> fetchRoadRoute(List<RoutePathPoint> waypoints) async {
    if (waypoints.length < 2) return RoadRoute(waypoints);
    try {
      final coords = waypoints.map((p) => '${p.lng},${p.lat}').join(';');
      final res = await _api.raw.get<dynamic>(
        'https://router.project-osrm.org/route/v1/driving/$coords',
        queryParameters: {'overview': 'full', 'geometries': 'geojson'},
      );
      final body = asJson(res.data);
      final routes = body['routes'];
      if (str(body, 'code') != 'Ok' || routes is! List || routes.isEmpty) return RoadRoute(waypoints);
      final route = asJson(routes.first);
      final coordsList = asJson(route['geometry'])['coordinates'];
      if (coordsList is! List || coordsList.isEmpty) return RoadRoute(waypoints);
      final path = coordsList
          .whereType<List>()
          .where((c) => c.length >= 2)
          .map((c) => RoutePathPoint((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();
      return RoadRoute(
        path,
        distanceMeters: dblOrNull(route, 'distance'),
        durationSeconds: dblOrNull(route, 'duration'),
      );
    } catch (_) {
      return RoadRoute(waypoints);
    }
  }
}

class RoadRoute {
  final List<RoutePathPoint> path;
  final double? distanceMeters;
  final double? durationSeconds;

  const RoadRoute(this.path, {this.distanceMeters, this.durationSeconds});
}
