import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';

/// Map tiles that follow the Google Maps key saved in app settings.
class AppMapTiles extends StatefulWidget {
  const AppMapTiles({
    super.key,
    this.userAgentPackageName = 'lk.bingchun.bing_chun_customer',
    this.maxNativeZoom,
    this.keepBuffer,
  });

  final String userAgentPackageName;
  final int? maxNativeZoom;
  final int? keepBuffer;

  @override
  State<AppMapTiles> createState() => _AppMapTilesState();
}

class _AppMapTilesState extends State<AppMapTiles> {
  static const _osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  String _url = _osm;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final url = await resolveGoogleMapTileUrl(ApiConfig.baseUrl);
    if (!mounted || url == null || url == _url) return;
    setState(() => _url = url);
  }

  @override
  Widget build(BuildContext context) {
    return TileLayer(
      urlTemplate: _url,
      userAgentPackageName: widget.userAgentPackageName,
      maxNativeZoom: widget.maxNativeZoom,
      keepBuffer: widget.keepBuffer ?? 2,
    );
  }
}

Future<String?> resolveGoogleMapTileUrl(String apiBase) async {
  try {
    final root = apiBase.endsWith('/') ? apiBase.substring(0, apiBase.length - 1) : apiBase;
    final tiles = await http
        .get(Uri.parse('$root/stores/address/tiles'))
        .timeout(const Duration(seconds: 8));
    if (tiles.statusCode == 200) {
      final tilesBody = jsonDecode(tiles.body);
      final tilesData = tilesBody is Map && tilesBody['data'] is Map
          ? tilesBody['data'] as Map
          : tilesBody;
      final tileUrl = tilesData is Map ? (tilesData['url'] ?? '').toString() : '';
      if (tileUrl.isNotEmpty) return tileUrl;
    }
    final settings = await http
        .get(Uri.parse('$root/settings/app'))
        .timeout(const Duration(seconds: 8));
    if (settings.statusCode != 200) return null;
    final body = jsonDecode(settings.body);
    final data = body is Map && body['data'] is Map ? body['data'] as Map : body;
    if (data is! Map) return null;
    final key = (data['googleMapsApiKey'] ?? '').toString().trim();
    if (key.isEmpty) return null;
    final sessionRes = await http
        .post(
          Uri.parse('https://tile.googleapis.com/v1/createSession?key=${Uri.encodeQueryComponent(key)}'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode({
            'mapType': 'roadmap',
            'language': 'en-US',
            'region': 'LK',
          }),
        )
        .timeout(const Duration(seconds: 8));
    if (sessionRes.statusCode != 200) return null;
    final sessionBody = jsonDecode(sessionRes.body);
    final session = sessionBody is Map ? sessionBody['session']?.toString() ?? '' : '';
    if (session.isEmpty) return null;
    return 'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${Uri.encodeQueryComponent(session)}&key=${Uri.encodeQueryComponent(key)}';
  } catch (_) {
    return null;
  }
}
