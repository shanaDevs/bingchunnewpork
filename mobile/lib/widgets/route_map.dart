import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../models/delivery_route.dart';
import 'app_map_tiles.dart';
import '../services/road_routing_service.dart';
import '../theme/bc_theme.dart';

class RouteMap extends StatefulWidget {
  final DeliveryRoute route;
  final int? activeStopSequence;
  final bool interactive;
  final bool compact;
  final EdgeInsets boundsPadding;
  final bool headingToStore;

  const RouteMap({
    super.key,
    required this.route,
    this.activeStopSequence,
    this.interactive = true,
    this.compact = false,
    this.boundsPadding = const EdgeInsets.all(48),
    this.headingToStore = false,
  });

  @override
  State<RouteMap> createState() => _RouteMapState();
}

class _RouteMapState extends State<RouteMap> {
  List<LatLng>? _roadPath;
  bool _loadingPath = false;
  LatLng? _driver;

  @override
  void initState() {
    super.initState();
    _loadRoadPath();
  }

  @override
  void didUpdateWidget(RouteMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.route != widget.route || oldWidget.headingToStore != widget.headingToStore) {
      _loadRoadPath();
    }
  }

  Future<void> _loadRoadPath() async {
    if (widget.headingToStore) {
      await _loadPathToStore();
      return;
    }
    if (widget.route.path.length >= 2) {
      setState(() {
        _roadPath = widget.route.path.map((p) => LatLng(p.lat, p.lng)).toList();
        _loadingPath = false;
      });
      return;
    }

    final waypoints = widget.route.waypoints.map((p) => LatLng(p.lat, p.lng)).toList();
    if (waypoints.length < 2) {
      setState(() {
        _roadPath = waypoints;
        _loadingPath = false;
      });
      return;
    }

    setState(() => _loadingPath = true);
    try {
      final path = await roadRoutingService.fetchRoadPath(waypoints);
      if (!mounted) return;
      setState(() {
        _roadPath = path;
        _loadingPath = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _roadPath = waypoints;
        _loadingPath = false;
      });
    }
  }

  Future<void> _loadPathToStore() async {
    final store = LatLng(widget.route.store.lat, widget.route.store.lng);
    setState(() => _loadingPath = true);
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        await Geolocator.requestPermission();
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (!mounted) return;
      final origin = LatLng(pos.latitude, pos.longitude);
      _driver = origin;
      final path = await roadRoutingService.fetchRoadPath([origin, store]);
      if (!mounted) return;
      setState(() {
        _roadPath = path.length >= 2 ? path : [origin, store];
        _loadingPath = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _roadPath = [store];
        _loadingPath = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.route.store;
    final waypoints = widget.route.waypoints.map((p) => LatLng(p.lat, p.lng)).toList();
    final linePoints = (_roadPath != null && _roadPath!.length >= 2) ? _roadPath! : waypoints;
    final boundsPoints = linePoints.isNotEmpty ? linePoints : waypoints;

    final bounds = boundsPoints.length == 1
        ? LatLngBounds(boundsPoints.first, boundsPoints.first)
        : LatLngBounds.fromPoints(boundsPoints);

    final storePinSize = widget.compact ? 36.0 : 48.0;
    final stopPinSize = widget.compact ? 32.0 : 44.0;

    return Stack(
      fit: StackFit.expand,
      children: [
        FlutterMap(
          options: MapOptions(
            initialCameraFit: CameraFit.bounds(
              bounds: bounds,
              padding: widget.boundsPadding,
            ),
            interactionOptions: InteractionOptions(
              flags: widget.interactive ? InteractiveFlag.all & ~InteractiveFlag.rotate : InteractiveFlag.none,
            ),
          ),
          children: [
            const AppMapTiles(),
            if (linePoints.length > 1)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: linePoints,
                    color: BcColors.brand,
                    strokeWidth: widget.compact ? 3 : 4,
                  ),
                ],
              ),
            MarkerLayer(
              markers: [
                Marker(
                  point: LatLng(store.lat, store.lng),
                  width: storePinSize,
                  height: storePinSize,
                  alignment: Alignment.bottomCenter,
                  child: _StoreMapPin(compact: widget.compact),
                ),
                ...widget.route.stops.map((stop) {
                  final active = stop.sequence == widget.activeStopSequence;
                  return Marker(
                    point: LatLng(stop.lat, stop.lng),
                    width: stopPinSize,
                    height: stopPinSize,
                    alignment: Alignment.bottomCenter,
                    child: _StopMapPin(
                      sequence: stop.sequence,
                      active: active && !widget.headingToStore,
                      compact: widget.compact,
                    ),
                  );
                }),
                if (_driver != null)
                  Marker(
                    point: _driver!,
                    width: widget.compact ? 36 : 44,
                    height: widget.compact ? 36 : 44,
                    alignment: Alignment.center,
                    child: Container(
                      decoration: BoxDecoration(
                        color: BcColors.brand,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2.5),
                      ),
                      child: const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 18),
                    ),
                  ),
              ],
            ),
          ],
        ),
        if (_loadingPath)
          const Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: EdgeInsets.only(top: 12),
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: BcColors.brand),
              ),
            ),
          ),
      ],
    );
  }
}

class MiniRouteMap extends StatelessWidget {
  static const double height = 200;

  final DeliveryRoute route;
  final int? activeStopSequence;
  final VoidCallback onTap;
  final bool headingToStore;

  const MiniRouteMap({
    super.key,
    required this.route,
    this.activeStopSequence,
    required this.onTap,
    this.headingToStore = false,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: height,
        child: Stack(
          fit: StackFit.expand,
          children: [
            IgnorePointer(
              child: RouteMap(
                route: route,
                activeStopSequence: activeStopSequence,
                interactive: false,
                compact: true,
                headingToStore: headingToStore,
                boundsPadding: const EdgeInsets.all(28),
              ),
            ),
            Positioned.fill(
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: onTap,
                  child: Align(
                    alignment: Alignment.bottomRight,
                    child: Container(
                      margin: const EdgeInsets.all(10),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: BcColors.navyCard.withValues(alpha: 0.92),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: BcColors.navyBorder),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.fullscreen_rounded, size: 16, color: BcColors.brandLight),
                          SizedBox(width: 4),
                          Text(
                            'Full screen',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: BcColors.brandLight),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoreMapPin extends StatelessWidget {
  final bool compact;

  const _StoreMapPin({required this.compact});

  @override
  Widget build(BuildContext context) {
    final pinSize = compact ? 36.0 : 48.0;
    final badgeSize = compact ? 16.0 : 22.0;
    final iconSize = compact ? 10.0 : 13.0;

    return _MapLocationPin(
      pinSize: pinSize,
      color: BcColors.brandDark,
      badge: Container(
        width: badgeSize,
        height: badgeSize,
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.storefront_rounded, size: iconSize, color: BcColors.brandDark),
      ),
    );
  }
}

class _StopMapPin extends StatelessWidget {
  final int sequence;
  final bool active;
  final bool compact;

  const _StopMapPin({
    required this.sequence,
    required this.active,
    required this.compact,
  });

  static Color _colorFor(int sequence, bool active) {
    if (active) return BcColors.accent;
    return switch (sequence) {
      1 => BcColors.brand,
      2 => const Color(0xFF22D3EE),
      3 => const Color(0xFFA78BFA),
      _ => BcColors.success,
    };
  }

  @override
  Widget build(BuildContext context) {
    final pinSize = compact ? 32.0 : 44.0;
    final badgeSize = compact ? 15.0 : 20.0;
    final fontSize = compact ? 9.0 : 11.0;
    final color = _colorFor(sequence, active);

    return _MapLocationPin(
      pinSize: pinSize,
      color: color,
      highlighted: active,
      badge: Container(
        width: badgeSize,
        height: badgeSize,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: active ? Border.all(color: BcColors.accent, width: 2) : null,
        ),
        alignment: Alignment.center,
        child: Text(
          '$sequence',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: fontSize,
            color: color,
            height: 1,
          ),
        ),
      ),
    );
  }
}

class _MapLocationPin extends StatelessWidget {
  final double pinSize;
  final Color color;
  final Widget badge;
  final bool highlighted;

  const _MapLocationPin({
    required this.pinSize,
    required this.color,
    required this.badge,
    this.highlighted = false,
  });

  @override
  Widget build(BuildContext context) {
    final badgeTop = pinSize * 0.17;

    return SizedBox(
      width: pinSize,
      height: pinSize,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.bottomCenter,
        children: [
          if (highlighted)
            Positioned(
              bottom: 0,
              child: Container(
                width: pinSize * 0.28,
                height: pinSize * 0.28,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.35),
                  shape: BoxShape.circle,
                ),
              ),
            ),
          Icon(
            Icons.location_on_rounded,
            size: pinSize,
            color: color,
            shadows: [
              Shadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          Positioned(
            top: badgeTop,
            child: badge,
          ),
        ],
      ),
    );
  }
}
