import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class RoadRoutingService {
  static const _baseUrl = 'https://router.project-osrm.org';

  Future<List<LatLng>> fetchRoadPath(List<LatLng> waypoints) async {
    if (waypoints.length < 2) return waypoints;
    try {
      return await _request(waypoints);
    } catch (_) {
      return waypoints;
    }
  }

  Future<List<LatLng>> _request(List<LatLng> waypoints) async {
    final coords = waypoints.map((p) => '${p.longitude},${p.latitude}').join(';');
    final uri = Uri.parse(
      '$_baseUrl/route/v1/driving/$coords?overview=full&geometries=geojson',
    );
    final res = await http.get(uri).timeout(const Duration(seconds: 12));
    if (res.statusCode != 200) throw Exception('OSRM HTTP ${res.statusCode}');
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['code'] != 'Ok') throw Exception(data['message'] ?? 'OSRM failed');
    final routes = data['routes'] as List<dynamic>?;
    if (routes == null || routes.isEmpty) throw Exception('No route');
    final geometry = (routes.first as Map)['geometry'] as Map?;
    final coordinates = geometry?['coordinates'] as List?;
    if (coordinates == null || coordinates.length < 2) throw Exception('No geometry');
    return [
      for (final c in coordinates)
        if (c is List && c.length >= 2)
          LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()),
    ];
  }
}

final roadRoutingService = RoadRoutingService();
