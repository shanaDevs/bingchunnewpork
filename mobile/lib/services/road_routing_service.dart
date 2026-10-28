import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class RoadRoutingService {
  static const _baseUrl = 'https://router.project-osrm.org';

  Future<List<LatLng>> fetchRoadPath(List<LatLng> waypoints) async {
    if (waypoints.length < 2) return waypoints;

    try {
      return (await _requestRoute(waypoints)).path;
    } catch (_) {
      final path = <LatLng>[waypoints.first];
      for (var i = 1; i < waypoints.length; i++) {
        try {
          final leg = await _requestRoute([waypoints[i - 1], waypoints[i]]);
          path.addAll(leg.path.skip(1));
        } catch (_) {
          path.add(waypoints[i]);
        }
      }
      return path;
    }
  }

  Future<_RoadRouteResult> _requestRoute(List<LatLng> waypoints) async {
    final coords = waypoints.map((p) => '${p.longitude},${p.latitude}').join(';');
    final uri = Uri.parse('$_baseUrl/route/v1/driving/$coords?overview=full&geometries=geojson');

    final res = await http.get(uri).timeout(const Duration(seconds: 12));
    if (res.statusCode != 200) throw Exception('OSRM HTTP ${res.statusCode}');

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['code'] != 'Ok') {
      throw Exception(data['message'] ?? 'OSRM routing failed');
    }

    final routes = data['routes'] as List<dynamic>?;
    if (routes == null || routes.isEmpty) throw Exception('No route found');

    final route = routes.first as Map<String, dynamic>;
    final geometry = route['geometry'] as Map<String, dynamic>;
    final coordinates = geometry['coordinates'] as List<dynamic>;

    final path = coordinates
        .map((c) {
          final pair = c as List<dynamic>;
          return LatLng((pair[1] as num).toDouble(), (pair[0] as num).toDouble());
        })
        .toList();

    return _RoadRouteResult(path: path);
  }
}

class _RoadRouteResult {
  final List<LatLng> path;

  const _RoadRouteResult({required this.path});
}

final roadRoutingService = RoadRoutingService();
