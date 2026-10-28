import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../data/models/delivery_route.dart';
import '../../tracking/location_tracker.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Delivery stops are red map pins carrying their stop number. Fixed reds rather than
/// theme tokens: a pin sits on light OSM tiles in both themes.
const _stopPinRed = Color(0xFFE53935);
const _stopPinRedNext = Color(0xFFC62828);

/// Pickup-zone ring — the admin route map's zone green.
const pickupZoneGreen = Color(0xFF16A34A);

const _osmTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const _userAgentPackage = 'lk.bingchun.bing_chun_delivery';

/// OpenStreetMap route view — port of RouteMapView.kt.
///
/// [bottomInset]: height of UI covering the bottom of the map; the camera fit keeps
/// the route above it. [refitKey]: change to re-run the camera fit after panning.
/// [pickupRadiusM]: branch geofence drawn as a dashed ring around the store.
class RouteMap extends StatefulWidget {
  const RouteMap({
    super.key,
    required this.route,
    this.activeStopSequence,
    this.interactive = true,
    this.compact = false,
    this.showDriverLocation = false,
    this.liveTarget,
    this.bottomInset = 0,
    this.refitKey,
    this.pickupRadiusM,
  });

  final DeliveryRoute route;
  final int? activeStopSequence;
  final bool interactive;
  final bool compact;
  final bool showDriverLocation;
  final RouteLiveTarget? liveTarget;
  final double bottomInset;
  final Object? refitKey;
  final int? pickupRadiusM;

  @override
  State<RouteMap> createState() => _RouteMapState();
}

class _RouteMapState extends State<RouteMap> {
  final _map = MapController();
  bool _ready = false;
  List<RoutePathPoint> _staticPath = const [];
  List<RoutePathPoint> _tailPath = const [];
  List<RoutePathPoint> _leadPath = const [];
  DriverFix? _lastLeadFix;
  LocationTracker? _tracker;
  int _loadToken = 0;

  RoutePathPoint? get _targetPoint {
    final t = widget.liveTarget;
    final r = widget.route;
    if (t == null) return null;
    if (t is RouteLiveTargetStore) return RoutePathPoint(r.store.lat, r.store.lng);
    if (t is RouteLiveTargetStop) {
      final stop = r.stops.where((s) => s.sequence == t.sequence).firstOrNull;
      return stop == null ? null : RoutePathPoint(stop.lat, stop.lng);
    }
    return null;
  }

  List<RouteStop> get _tailStops {
    final t = widget.liveTarget;
    final pending = widget.route.sortedStops.where((s) => !s.isResolved).toList();
    if (t == null) return const [];
    if (t is RouteLiveTargetStore) return pending;
    if (t is RouteLiveTargetStop) return pending.where((s) => s.sequence > t.sequence).toList();
    return const [];
  }

  @override
  void initState() {
    super.initState();
    _tracker = context.read<AppContainer>().locationTracker;
    _tracker!.addListener(_onFix);
    _loadPaths();
  }

  @override
  void didUpdateWidget(RouteMap old) {
    super.didUpdateWidget(old);
    final routeChanged = old.route != widget.route || !_sameTarget(old.liveTarget, widget.liveTarget);
    if (routeChanged) {
      _leadPath = const [];
      _lastLeadFix = null;
      _loadPaths();
    }
    if (routeChanged ||
        old.refitKey != widget.refitKey ||
        old.bottomInset != widget.bottomInset ||
        old.pickupRadiusM != widget.pickupRadiusM) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fit());
    }
  }

  static bool _sameTarget(RouteLiveTarget? a, RouteLiveTarget? b) {
    if (a is RouteLiveTargetStop && b is RouteLiveTargetStop) return a.sequence == b.sequence;
    return a.runtimeType == b.runtimeType;
  }

  @override
  void dispose() {
    _tracker?.removeListener(_onFix);
    _map.dispose();
    super.dispose();
  }

  Future<void> _loadPaths() async {
    final token = ++_loadToken;
    final repo = context.read<AppContainer>().routeRepository;
    final r = widget.route;
    final target = _targetPoint;
    if (target == null) {
      final path = r.path.length >= 2 ? r.path : await repo.fetchRoadPath(r.waypoints);
      if (mounted && token == _loadToken) setState(() => _staticPath = path);
      return;
    }
    final tail = _tailStops;
    List<RoutePathPoint> tailPath;
    if (tail.isEmpty) {
      tailPath = const [];
    } else if (widget.liveTarget is RouteLiveTargetStore && tail.length == r.stops.length) {
      // Nothing delivered yet — the backend's precomputed store->stops path covers this tail.
      tailPath = r.path.length >= 2 ? r.path : await repo.fetchRoadPath(r.waypoints);
    } else {
      tailPath = await repo.fetchRoadPath([target, ...tail.map((s) => RoutePathPoint(s.lat, s.lng))]);
    }
    if (mounted && token == _loadToken) setState(() => _tailPath = tailPath);
    _onFix();
  }

  /// Lead: rider's current position -> the live target, refetched as they move (~70m).
  Future<void> _onFix() async {
    if (!mounted) return;
    final target = _targetPoint;
    final fix = _tracker?.lastFix;
    if (widget.showDriverLocation) setState(() {});
    if (target == null) return;
    if (fix == null) {
      if (_leadPath.isNotEmpty) setState(() => _leadPath = const []);
      return;
    }
    final prev = _lastLeadFix;
    if (prev != null && _leadPath.length >= 2) {
      final dLat = fix.lat - prev.lat;
      final dLng = fix.lng - prev.lng;
      if (dLat * dLat + dLng * dLng < 0.0007 * 0.0007) return;
    }
    _lastLeadFix = fix;
    final lead = await context.read<AppContainer>().routeRepository.fetchRoadPath([
      RoutePathPoint(fix.lat, fix.lng),
      target,
    ]);
    if (mounted) setState(() => _leadPath = lead);
  }

  List<RoutePathPoint> get _line {
    final road = _targetPoint != null ? [..._leadPath, ..._tailPath] : _staticPath;
    return road.length >= 2 ? road : widget.route.waypoints;
  }

  List<LatLng> _zonePoints() {
    final radius = widget.pickupRadiusM;
    if (radius == null || radius <= 0) return const [];
    return circlePoints(LatLng(widget.route.store.lat, widget.route.store.lng), radius.toDouble());
  }

  void _fit() {
    if (!_ready || !mounted) return;
    final points = [..._line.map((p) => LatLng(p.lat, p.lng)), ..._zonePoints()];
    if (points.isEmpty) return;
    final border = widget.compact ? 40.0 : 80.0;
    final padding = EdgeInsets.fromLTRB(border, border, border, border + widget.bottomInset);
    try {
      if (points.length == 1) {
        _map.move(points.first, 15);
        return;
      }
      _map.fitCamera(CameraFit.coordinates(coordinates: points, padding: padding, maxZoom: 17));
    } catch (_) {
      // Map not laid out yet — the next frame retries via onMapReady.
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final r = widget.route;
    final line = _line;
    final zone = _zonePoints();
    final nextSeq = widget.activeStopSequence ?? r.nextStopSequence;
    final fix = widget.showDriverLocation ? _tracker?.lastFix : null;
    final tracking = _tracker?.runTracking ?? false;

    return FlutterMap(
      mapController: _map,
      options: MapOptions(
        initialCenter: LatLng(r.store.lat, r.store.lng),
        initialZoom: 14,
        interactionOptions: InteractionOptions(
          flags: widget.interactive ? InteractiveFlag.all & ~InteractiveFlag.rotate : InteractiveFlag.none,
        ),
        onMapReady: () {
          _ready = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => _fit());
        },
      ),
      children: [
        TileLayer(urlTemplate: _osmTiles, userAgentPackageName: _userAgentPackage),
        if (zone.isNotEmpty)
          PolygonLayer(
            polygons: [
              Polygon(
                points: zone,
                color: pickupZoneGreen.withValues(alpha: 0.14),
                borderColor: pickupZoneGreen,
                borderStrokeWidth: widget.compact ? 1.5 : 2,
                pattern: StrokePattern.dashed(segments: const [7, 5]),
              ),
            ],
          ),
        if (line.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: line.map((p) => LatLng(p.lat, p.lng)).toList(),
                color: c.brand,
                strokeWidth: widget.compact ? 4 : 6,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            _pinMarker(LatLng(r.store.lat, r.store.lng), 'S', c.brandDark, next: false),
            for (final stop in r.stops) _stopMarker(stop, nextSeq, c),
          ],
        ),
        if (fix != null && tracking)
          MarkerLayer(
            markers: [
              Marker(
                point: LatLng(fix.lat, fix.lng),
                width: 80,
                height: 80,
                child: DriverPulse(heading: fix.heading ?? 0, color: c.brand),
              ),
            ],
          ),
      ],
    );
  }

  Marker _stopMarker(RouteStop stop, int? nextSeq, BcColors c) {
    final s = stop.status.toUpperCase();
    final delivered = s == 'DELIVERED';
    final failed = s == 'DELIVERY_FAILED' || s == 'FAILED';
    final next = stop.sequence == nextSeq && !delivered && !failed;
    final fill = delivered
        ? c.success
        : failed
        ? c.danger
        : next
        ? _stopPinRedNext
        : _stopPinRed;
    final glyph = delivered
        ? '✓'
        : failed
        ? '!'
        : '${stop.sequence}';
    return _pinMarker(LatLng(stop.lat, stop.lng), glyph, fill, next: next);
  }

  Marker _pinMarker(LatLng point, String label, Color fill, {required bool next}) {
    final head = next ? 34.0 : (widget.compact ? 26.0 : 30.0);
    final w = head + 4;
    final h = w * 1.42;
    return Marker(
      point: point,
      width: w,
      height: h,
      // A pin points at its location, so the tip is the anchor.
      alignment: Alignment.topCenter,
      child: MapPin(label: label, fill: fill, next: next),
    );
  }
}

/// Points approximating a circle of [radiusM] metres around [center].
List<LatLng> circlePoints(LatLng center, double radiusM, [int segments = 64]) {
  const earth = 6371000.0;
  final lat = center.latitude * math.pi / 180;
  final lng = center.longitude * math.pi / 180;
  final d = radiusM / earth;
  return [
    for (var i = 0; i <= segments; i++)
      () {
        final brng = 2 * math.pi * i / segments;
        final lat2 = math.asin(math.sin(lat) * math.cos(d) + math.cos(lat) * math.sin(d) * math.cos(brng));
        final lng2 =
            lng +
            math.atan2(math.sin(brng) * math.sin(d) * math.cos(lat), math.cos(d) - math.sin(lat) * math.sin(lat2));
        return LatLng(lat2 * 180 / math.pi, lng2 * 180 / math.pi);
      }(),
  ];
}

/// Teardrop map pin with a centred glyph; the next stop gets a halo.
class MapPin extends StatelessWidget {
  const MapPin({super.key, required this.label, required this.fill, this.next = false});
  final String label;
  final Color fill;
  final bool next;

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _PinPainter(label, fill, next));
}

class _PinPainter extends CustomPainter {
  _PinPainter(this.label, this.fill, this.next);
  final String label;
  final Color fill;
  final bool next;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final radius = (size.width - 4) / 2 - 1;
    final cy = radius + 2;
    final tipY = size.height - 1;
    if (next) {
      canvas.drawCircle(Offset(cx, cy), radius + 2, Paint()..color = fill.withValues(alpha: 0.28));
    }
    // Tail vertices sit on the head circle so the union has no waist.
    final tail = Path()
      ..moveTo(cx - radius * 0.62, cy + radius * 0.78)
      ..lineTo(cx + radius * 0.62, cy + radius * 0.78)
      ..lineTo(cx, tipY)
      ..close();
    final head = Path()..addOval(Rect.fromCircle(center: Offset(cx, cy), radius: radius));
    final body = Path.combine(PathOperation.union, head, tail);
    canvas.drawPath(body, Paint()..color = fill);
    canvas.drawPath(
      body,
      Paint()
        ..color = Colors.white.withValues(alpha: 220 / 255)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
    final tp = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: label.length > 1 ? radius * 2 * 0.42 : radius * 2 * 0.52,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(cx - tp.width / 2, cy - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _PinPainter old) => old.label != label || old.fill != fill || old.next != next;
}

/// Live driver arrow with a fading pulse, rotated by heading (0 = north).
class DriverPulse extends StatefulWidget {
  const DriverPulse({super.key, required this.heading, required this.color});
  final double heading;
  final Color color;

  @override
  State<DriverPulse> createState() => _DriverPulseState();
}

class _DriverPulseState extends State<DriverPulse> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
    ..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _ctrl,
    builder: (_, _) => CustomPaint(painter: _PulsePainter(_ctrl.value, widget.heading, widget.color)),
  );
}

class _PulsePainter extends CustomPainter {
  _PulsePainter(this.t, this.heading, this.color);
  final double t;
  final double heading;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    canvas.drawCircle(c, 11 + 13 * t, Paint()..color = color.withValues(alpha: (1 - t) * 0.35));
    canvas.drawCircle(c, 11, Paint()..color = color);
    canvas.drawCircle(
      c,
      11,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.75,
    );
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(heading * math.pi / 180);
    const s = 9.0;
    final arrow = Path()
      ..moveTo(0, -s)
      ..lineTo(-s * 0.62, s * 0.72)
      ..lineTo(0, s * 0.2)
      ..lineTo(s * 0.62, s * 0.72)
      ..close();
    canvas.drawPath(arrow, Paint()..color = Colors.white);
    canvas.drawPath(
      arrow,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _PulsePainter old) => true;
}

/// Small floating icon button used to overlay controls (recentre, expand) on a map.
class MapControlButton extends StatelessWidget {
  const MapControlButton({super.key, required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: c.card,
        shape: const CircleBorder(),
        elevation: 4,
        shadowColor: const Color(0x330A2647),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Tooltip(
            message: label,
            child: SizedBox(width: 44, height: 44, child: Icon(icon, color: c.brand, size: 21)),
          ),
        ),
      ),
    );
  }
}

/// Non-interactive map card that opens the full-screen map on tap.
class MiniRouteMap extends StatelessWidget {
  const MiniRouteMap({
    super.key,
    required this.route,
    required this.onTap,
    this.activeStopSequence,
    this.showDriverLocation = false,
    this.gpsActive = false,
    this.height = 260,
  });

  final DeliveryRoute route;
  final VoidCallback onTap;
  final int? activeStopSequence;
  final bool showDriverLocation;
  final bool gpsActive;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: tr('Route map, tap for full screen'),
      child: Container(
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Positioned.fill(
              child: RouteMap(
                route: route,
                activeStopSequence: activeStopSequence,
                interactive: false,
                compact: true,
                showDriverLocation: showDriverLocation,
              ),
            ),
            Positioned.fill(
              child: Material(
                type: MaterialType.transparency,
                child: InkWell(onTap: onTap),
              ),
            ),
            Positioned(
              top: 10,
              right: 10,
              child: MapControlButton(icon: Icons.fullscreen, label: tr('Full screen map'), onTap: onTap),
            ),
            if (gpsActive)
              Positioned(
                top: 12,
                left: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDCFCE7).withValues(alpha: 0.95),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFBBF7D0)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.gps_fixed, color: Color(0xFF16A34A), size: 20),
                      SizedBox(width: 6),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            tr('GPS active'),
                            style: TextStyle(color: Color(0xFF166534), fontWeight: FontWeight.w700, fontSize: 12),
                          ),
                          Text(tr('Tracking this run'), style: TextStyle(color: Color(0xFF15803D), fontSize: 10)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
