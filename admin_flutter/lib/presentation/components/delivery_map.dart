import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../domain/entities/delivery.dart';
import '../theme/pos_theme.dart';

LatLng ll(GeoPoint p) => LatLng(p.lat, p.lng);

enum MapPinKind { branch, stop, delivered, failed, rider, breakdown }

class MapPin {
  const MapPin({required this.at, required this.kind, this.label, this.selected = false, this.onTap});
  final GeoPoint at;
  final MapPinKind kind;

  /// Stop sequence or rider initial.
  final String? label;
  final bool selected;
  final VoidCallback? onTap;
}

class MapLine {
  const MapLine({required this.points, required this.color, this.width = 4, this.dashed = false});
  final List<GeoPoint> points;
  final Color color;
  final double width;
  final bool dashed;
}

/// OpenStreetMap view (same tiles as the web Leaflet maps) that fits every pin
/// and line on first layout. [focus] re-centres when it changes.
class DeliveryMap extends StatefulWidget {
  const DeliveryMap({
    super.key,
    this.pins = const [],
    this.lines = const [],
    this.focus,
    this.focusNonce = 0,
    this.fitNonce = 0,
  });

  final List<MapPin> pins;
  final List<MapLine> lines;
  final GeoPoint? focus;
  final int focusNonce;

  /// Bump to re-frame every pin and line ("View full route").
  final int fitNonce;

  @override
  State<DeliveryMap> createState() => _DeliveryMapState();
}

class _DeliveryMapState extends State<DeliveryMap> {
  final _map = MapController();
  bool _ready = false;

  /// Whether the camera has framed real points yet (riders can appear after the map opens).
  bool _framed = false;

  /// Web default centre (`COLOMBO`) when there is nothing to show yet.
  static const _colombo = LatLng(6.9271, 79.8612);

  List<LatLng> get _all => [for (final p in widget.pins) ll(p.at), for (final l in widget.lines) ...l.points.map(ll)];

  @override
  void didUpdateWidget(covariant DeliveryMap old) {
    super.didUpdateWidget(old);
    if (!_ready) return;
    if (widget.fitNonce != old.fitNonce) {
      _framed = false;
      _frame();
    } else if (widget.focus != null && widget.focusNonce != old.focusNonce) {
      _map.move(ll(widget.focus!), 16);
    } else if (!_framed) {
      _frame();
    }
  }

  void _frame() {
    final pts = _all;
    if (pts.isEmpty) return;
    _framed = true;
    final fit = _fit;
    fit == null ? _map.move(pts.first, 15) : _map.fitCamera(fit);
  }

  void _zoom(double delta) {
    final cam = _map.camera;
    _map.move(cam.center, (cam.zoom + delta).clamp(3, 19));
  }

  CameraFit? get _fit {
    final pts = _all;
    if (pts.length < 2) return null;
    return CameraFit.coordinates(coordinates: pts, padding: const EdgeInsets.all(48), maxZoom: 16);
  }

  @override
  Widget build(BuildContext context) {
    final pts = _all;
    _framed = _framed || pts.isNotEmpty;
    final center = pts.isEmpty ? _colombo : pts.first;
    return Listener(
      onPointerDown: (_) => _lockPageScroll(true),
      onPointerUp: (_) => _lockPageScroll(false),
      onPointerCancel: (_) => _lockPageScroll(false),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(PosRadius.card),
        child: FlutterMap(
          mapController: _map,
          options: MapOptions(
            initialCenter: center,
            initialZoom: pts.length == 1 ? 15 : 12,
            initialCameraFit: _fit,
            onMapReady: () => _ready = true,
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.bingchun.bing_chun_admin',
              maxNativeZoom: 19,
              // Keep the last tiles while new ones load instead of flashing grey.
              keepBuffer: 4,
            ),
            PolylineLayer(
              polylines: [
                for (final l in widget.lines)
                  if (l.points.length >= 2)
                    Polyline(
                      points: l.points.map(ll).toList(),
                      color: l.color,
                      strokeWidth: l.width,
                      pattern: l.dashed ? StrokePattern.dashed(segments: const [10, 8]) : const StrokePattern.solid(),
                    ),
              ],
            ),
            MarkerLayer(
              markers: [
                for (final p in widget.pins)
                  Marker(
                    point: ll(p.at),
                    width: p.kind == MapPinKind.rider ? 44 : 36,
                    height: p.kind == MapPinKind.rider ? 44 : 36,
                    child: GestureDetector(
                      onTap: p.onTap,
                      child: _PinView(pin: p),
                    ),
                  ),
              ],
            ),
            const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
            // Web Leaflet zoom control (top right).
            Positioned(
              top: 10,
              right: 10,
              child: _ZoomButtons(onZoomIn: () => _zoom(1), onZoomOut: () => _zoom(-1)),
            ),
          ],
        ),
      ),
    );
  }

  /// Maps sit inside scrolling pages: while a finger is on the map the page
  /// stops scrolling, so vertical drags pan the map like on the web.
  void _lockPageScroll(bool locked) {
    final position = Scrollable.maybeOf(context)?.position;
    if (position == null) return;
    position.context.setCanDrag(!locked && position.physics.shouldAcceptUserOffset(position));
  }
}

class _PinView extends StatelessWidget {
  const _PinView({required this.pin});
  final MapPin pin;

  @override
  Widget build(BuildContext context) {
    final (Color color, IconData? icon) = switch (pin.kind) {
      MapPinKind.branch => (const Color(0xFF1A1953), Icons.storefront_rounded),
      MapPinKind.stop => (const Color(0xFF307EF2), null),
      MapPinKind.delivered => (const Color(0xFF16A34A), null),
      MapPinKind.failed => (const Color(0xFFDC2626), null),
      MapPinKind.rider => (const Color(0xFFEA580C), Icons.two_wheeler_rounded),
      MapPinKind.breakdown => (const Color(0xFFDC2626), Icons.car_crash_rounded),
    };
    return Container(
      decoration: BoxDecoration(
        color: color,
        shape: pin.kind == MapPinKind.branch ? BoxShape.rectangle : BoxShape.circle,
        borderRadius: pin.kind == MapPinKind.branch ? BorderRadius.circular(10) : null,
        border: Border.all(color: Colors.white, width: pin.selected ? 3.5 : 2.5),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.45),
            blurRadius: pin.selected ? 14 : 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: icon != null
          ? Icon(icon, color: Colors.white, size: 18)
          : Text(
              pin.label ?? '',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13),
            ),
    );
  }
}

class _ZoomButtons extends StatelessWidget {
  const _ZoomButtons({required this.onZoomIn, required this.onZoomOut});
  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;

  @override
  Widget build(BuildContext context) {
    Widget button(IconData icon, VoidCallback onTap) => InkWell(
      onTap: onTap,
      child: SizedBox(width: 36, height: 36, child: Icon(icon, size: 20, color: const Color(0xFF1F2937))),
    );
    return Material(
      color: Colors.white,
      elevation: 2,
      borderRadius: BorderRadius.circular(8),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          button(Icons.add_rounded, onZoomIn),
          const SizedBox(width: 36, child: Divider(height: 1, color: Color(0xFFE5E7EB))),
          button(Icons.remove_rounded, onZoomOut),
        ],
      ),
    );
  }
}
