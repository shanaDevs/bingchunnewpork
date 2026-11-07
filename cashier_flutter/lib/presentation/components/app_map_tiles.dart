import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart';

import '../../core/runtime_config.dart';

/// Map tiles that follow the Google Maps key saved in app settings.
class AppMapTiles extends StatefulWidget {
  const AppMapTiles({
    super.key,
    this.userAgentPackageName = 'com.bingchun.bing_chun_cashier',
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
    final url = await _googleTileUrl(AppConfig.apiBaseUrl);
    if (!mounted || url == null) return;
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

Future<String?> _googleTileUrl(String apiBase) async {
  try {
    final root = apiBase.endsWith('/') ? apiBase.substring(0, apiBase.length - 1) : apiBase;
    final dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 8), receiveTimeout: const Duration(seconds: 8)));
    final settings = await dio.get<dynamic>('$root/settings/app');
    final body = settings.data;
    final data = body is Map && body['data'] is Map ? body['data'] as Map : body;
    if (data is! Map) return null;
    final key = (data['googleMapsApiKey'] ?? '').toString().trim();
    if (key.isEmpty) return null;
    final sessionRes = await dio.post<dynamic>(
      'https://tile.googleapis.com/v1/createSession',
      queryParameters: {'key': key},
      data: {'mapType': 'roadmap', 'language': 'en-US', 'region': 'LK'},
    );
    final sessionBody = sessionRes.data;
    final session = sessionBody is Map ? sessionBody['session']?.toString() ?? '' : '';
    if (session.isEmpty) return null;
    return 'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${Uri.encodeQueryComponent(session)}&key=${Uri.encodeQueryComponent(key)}';
  } catch (_) {
    return null;
  }
}
