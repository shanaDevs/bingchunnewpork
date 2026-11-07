import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Google Maps markers are bitmaps, not widgets: this paints a [CustomPainter] into a PNG
/// at the device pixel ratio and caches the result by key.
class MarkerIcons {
  MarkerIcons._();

  static final _cache = <String, BitmapDescriptor>{};
  static final _pending = <String, Future<BitmapDescriptor>>{};

  static BitmapDescriptor? peek(String key) => _cache[key];

  static Future<BitmapDescriptor> load(String key, Size size, CustomPainter painter, double dpr) {
    final hit = _cache[key];
    if (hit != null) return Future.value(hit);
    return _pending[key] ??= _render(size, painter, dpr).then((icon) {
      _cache[key] = icon;
      _pending.remove(key);
      return icon;
    });
  }

  static Future<BitmapDescriptor> _render(Size size, CustomPainter painter, double dpr) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder)..scale(dpr);
    painter.paint(canvas, size);
    final image = await recorder.endRecording().toImage((size.width * dpr).ceil(), (size.height * dpr).ceil());
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return BitmapDescriptor.bytes(data!.buffer.asUint8List(), imagePixelRatio: dpr);
  }
}

/// Resolves cached marker icons for a map widget, rebuilding once a missing icon is painted.
mixin MarkerIconMixin<T extends StatefulWidget> on State<T> {
  /// Returns the icon for [key], or null while it is still being painted (skip the marker
  /// for that frame rather than flashing the default red pin).
  BitmapDescriptor? markerIcon(String key, Size size, CustomPainter Function() painter) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final k = '$key@${size.width}x${size.height}@$dpr';
    final hit = MarkerIcons.peek(k);
    if (hit != null) return hit;
    MarkerIcons.load(k, size, painter(), dpr).then((_) {
      if (mounted) setState(() {});
    });
    return null;
  }
}
