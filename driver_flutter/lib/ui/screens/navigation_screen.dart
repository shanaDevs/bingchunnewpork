import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../data/models/delivery_route.dart';
import '../../tracking/location_tracker.dart';
import '../components/app_map_tiles.dart';
import '../components/buttons.dart';
import '../components/run_kit.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

const _navZoom = 18.0;
const _minRefetchDelta = 0.0002; // ~20m
const _minHeadingDelta = 0.00004; // ~4m

/// The one contextual action shown on the nav screen — port of NavPrimaryAction (Intents.kt).
/// Rebuilt from current state on every frame via [NavigationScreen.actionBuilder].
sealed class NavPrimaryAction {
  const NavPrimaryAction();
}

class NavConfirmPickup extends NavPrimaryAction {
  final bool enabled;
  final bool loading;
  final String? geofenceHint;
  final VoidCallback onConfirm;
  const NavConfirmPickup({required this.enabled, required this.loading, this.geofenceHint, required this.onConfirm});
}

class NavCompleteRide extends NavPrimaryAction {
  final bool enabled;
  final bool loading;
  final VoidCallback onComplete;
  const NavCompleteRide({required this.enabled, required this.loading, required this.onComplete});
}

class NavCustomerStop extends NavPrimaryAction {
  final bool callEnabled;
  final VoidCallback onCall;
  final VoidCallback? onOpenOrder;
  const NavCustomerStop({required this.callEnabled, required this.onCall, this.onOpenOrder});
}

/// Full-screen in-app navigation to a single destination — port of InAppNavigationScreen.kt.
///
/// [actionBuilder] is called on every rebuild so the action reflects current state;
/// wrap the route in the caller's providers so it can `watch` them.
class NavigationScreen extends StatefulWidget {
  const NavigationScreen({super.key, required this.target, this.actionBuilder});

  final NavTarget target;
  final NavPrimaryAction? Function(BuildContext context)? actionBuilder;

  /// Pushes the nav screen; [wrap] re-provides the caller's state (e.g. a controller).
  static Future<void> open(
    BuildContext context,
    NavTarget target, {
    NavPrimaryAction? Function(BuildContext context)? actionBuilder,
    Widget Function(Widget child)? wrap,
  }) {
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) {
          final screen = NavigationScreen(target: target, actionBuilder: actionBuilder);
          return wrap == null ? screen : wrap(screen);
        },
      ),
    );
  }

  @override
  State<NavigationScreen> createState() => _NavigationScreenState();
}

class _NavigationScreenState extends State<NavigationScreen> {
  final _map = MapController();
  late final LocationTracker _tracker = context.read<AppContainer>().locationTracker;
  bool _mapReady = false;
  bool _zoomed = false;
  DriverFix? _last;
  DriverFix? _lastFetch;
  double? _lastHeading;
  List<RoutePathPoint> _roadPath = const [];
  double? _distanceM;
  double? _durationS;

  @override
  void initState() {
    super.initState();
    _tracker.addListener(_onFix);
    WidgetsBinding.instance.addPostFrameCallback((_) => _onFix());
  }

  @override
  void dispose() {
    _tracker.removeListener(_onFix);
    _map.dispose();
    super.dispose();
  }

  void _onFix() {
    final fix = _tracker.lastFix;
    if (!mounted || fix == null) {
      if (mounted) setState(() {});
      return;
    }
    // Prefer the device bearing; fall back to the bearing between the last two fixes.
    final prev = _last;
    final movedEnough =
        prev != null &&
        ((fix.lat - prev.lat) * (fix.lat - prev.lat) + (fix.lng - prev.lng) * (fix.lng - prev.lng)) >
            _minHeadingDelta * _minHeadingDelta;
    final heading = fix.heading ?? (movedEnough ? bearingDeg(prev.lat, prev.lng, fix.lat, fix.lng) : _lastHeading);
    if (heading != null) _lastHeading = heading;
    _last = fix;

    if (_mapReady) {
      final center = LatLng(fix.lat, fix.lng);
      final zoom = _zoomed ? _map.camera.zoom : _navZoom;
      _zoomed = true;
      // Heading-up: rotate the map so the direction of travel points up.
      _map.moveAndRotate(center, zoom, -(heading ?? 0));
    }
    setState(() {});

    final lf = _lastFetch;
    if (lf != null &&
        _roadPath.length >= 2 &&
        ((fix.lat - lf.lat) * (fix.lat - lf.lat) + (fix.lng - lf.lng) * (fix.lng - lf.lng)) <
            _minRefetchDelta * _minRefetchDelta) {
      return;
    }
    _lastFetch = fix;
    _fetchRoute(fix);
  }

  Future<void> _fetchRoute(DriverFix fix) async {
    final t = widget.target;
    final result = await context.read<AppContainer>().routeRepository.fetchRoadRoute([
      RoutePathPoint(fix.lat, fix.lng),
      RoutePathPoint(t.lat, t.lng),
    ]);
    if (!mounted) return;
    setState(() {
      _roadPath = result.path;
      _distanceM = result.distanceMeters;
      _durationS = result.durationSeconds;
    });
  }

  void _recenter() {
    final fix = _tracker.lastFix;
    if (fix == null || !_mapReady) return;
    _map.move(LatLng(fix.lat, fix.lng), _map.camera.zoom);
  }

  String get _summary {
    final d = _distanceM;
    final s = _durationS;
    if (d == null || s == null) return tr('Locating…');
    final distance = d >= 1000 ? '${(d / 1000).toStringAsFixed(1)} km' : '${d.toInt()} m';
    final minutes = (s / 60).floor().clamp(1, 1 << 30);
    return tr('{distance} · ~{minutes} min', {'distance': distance, 'minutes': minutes});
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final t = widget.target;
    final fix = _tracker.lastFix;
    final action = widget.actionBuilder?.call(context);
    final hasHeading = _lastHeading != null;

    return Scaffold(
      backgroundColor: c.background,
      body: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: LatLng(t.lat, t.lng),
                initialZoom: _navZoom,
                onMapReady: () {
                  _mapReady = true;
                  _onFix();
                },
              ),
              children: [
                const AppMapTiles(),
                if (_roadPath.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: _roadPath.map((p) => LatLng(p.lat, p.lng)).toList(),
                        color: c.brand,
                        strokeWidth: 7,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: LatLng(t.lat, t.lng),
                      width: 34,
                      height: 44,
                      alignment: Alignment.topCenter,
                      rotate: true,
                      child: CustomPaint(painter: _DestinationPinPainter(c.brandDark)),
                    ),
                    if (fix != null)
                      Marker(
                        point: LatLng(fix.lat, fix.lng),
                        width: 72,
                        height: 72,
                        // The map is heading-up, so the arrow always points up on screen.
                        rotate: true,
                        child: _NavDriverArrow(color: c.brand, hasHeading: hasHeading),
                      ),
                  ],
                ),
              ],
            ),
          ),
          if (fix == null) Center(child: CircularProgressIndicator(color: c.brand)),
          // Guidance card: where we're heading and how far, over the top of the map.
          Positioned(
            top: MediaQuery.paddingOf(context).top + 10,
            left: 12,
            right: 12,
            child: Row(
              children: [
                _CircleButton(
                  icon: Icons.arrow_back_rounded,
                  tooltip: tr('Back'),
                  color: c.text,
                  onTap: () => Navigator.of(context).pop(),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(12, 10, 14, 10),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      gradient: LinearGradient(
                        colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: [
                        BoxShadow(color: c.brand.withValues(alpha: 0.3), blurRadius: 14, offset: const Offset(0, 5)),
                      ],
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.navigation_rounded, color: Colors.white, size: 21),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _summary,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800),
                              ),
                              Text(
                                tr('to {place}', {'place': t.label}),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Destination panel docked to the bottom.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 12, bottom: 12),
                  child: _CircleButton(
                    icon: Icons.my_location_rounded,
                    tooltip: tr('Recenter'),
                    color: c.brand,
                    onTap: _recenter,
                  ),
                ),
                Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: c.card,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                    boxShadow: [
                      BoxShadow(
                        color: c.isDark ? const Color(0x55000000) : const Color(0x260A2647),
                        blurRadius: 24,
                        offset: const Offset(0, -4),
                      ),
                    ],
                  ),
                  padding: EdgeInsets.fromLTRB(16, 10, 16, 14 + MediaQuery.paddingOf(context).bottom),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(99)),
                        ),
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: RunCardHeader(
                              icon: switch (t.kind) {
                                NavKindPickup() => Icons.storefront_rounded,
                                NavKindReturn() => Icons.flag_rounded,
                                _ => Icons.person_pin_circle_rounded,
                              },
                              title: t.label,
                              subtitle: switch (t.kind) {
                                NavKindPickup() => tr('Pickup Location'),
                                NavKindReturn() => tr('Return to branch'),
                                _ => tr('Drop-off Location'),
                              },
                            ),
                          ),
                          const SizedBox(width: 8),
                          GoogleMapsIconButton(
                            onTap: () async {
                              final messenger = ScaffoldMessenger.of(context);
                              final err = await Intents.navigateTo(t.lat, t.lng, label: t.label);
                              if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
                            },
                          ),
                        ],
                      ),
                      if (action != null) ...[const SizedBox(height: 14), _NavActionRow(action: action)],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NavActionRow extends StatelessWidget {
  const _NavActionRow({required this.action});
  final NavPrimaryAction action;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final a = action;
    switch (a) {
      case NavConfirmPickup():
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (a.geofenceHint != null) ...[
              RunNote(
                icon: a.enabled ? Icons.check_circle_outline_rounded : Icons.info_outline_rounded,
                color: a.enabled ? c.success : c.brand,
                text: a.geofenceHint!,
              ),
              const SizedBox(height: 10),
            ],
            RunPrimaryButton(
              label: tr('Confirm pickup'),
              icon: Icons.check_circle_rounded,
              loading: a.loading,
              enabled: a.enabled,
              locked: !a.enabled,
              onPressed: a.onConfirm,
            ),
          ],
        );
      case NavCompleteRide():
        return RunPrimaryButton(
          label: tr('Complete Ride'),
          icon: Icons.flag_circle_rounded,
          loading: a.loading,
          enabled: a.enabled,
          locked: !a.enabled,
          onPressed: a.onComplete,
        );
      case NavCustomerStop():
        return Row(
          children: [
            Expanded(
              child: RunOutlineButton(
                label: tr('Call'),
                icon: Icons.call_rounded,
                color: c.success,
                enabled: a.callEnabled,
                onPressed: a.onCall,
                height: 52,
              ),
            ),
            if (a.onOpenOrder != null) ...[
              const SizedBox(width: 10),
              Expanded(
                child: RunPrimaryButton(
                  label: tr('Open order'),
                  icon: Icons.receipt_long_rounded,
                  onPressed: a.onOpenOrder,
                ),
              ),
            ],
          ],
        );
    }
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({required this.icon, required this.tooltip, required this.color, required this.onTap});
  final IconData icon;
  final String tooltip;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.bc.card,
      shape: const CircleBorder(),
      elevation: 4,
      shadowColor: const Color(0x330A2647),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Tooltip(
          message: tooltip,
          child: SizedBox(width: 46, height: 46, child: Icon(icon, color: color, size: 22)),
        ),
      ),
    );
  }
}

class _DestinationPinPainter extends CustomPainter {
  _DestinationPinPainter(this.fill);
  final Color fill;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final r = size.width / 2 - 3;
    final cy = r + 3;
    final paint = Paint()..color = fill;
    canvas.drawPath(
      Path()
        ..moveTo(cx - r * 0.62, cy + r * 0.62)
        ..lineTo(cx, size.height)
        ..lineTo(cx + r * 0.62, cy + r * 0.62)
        ..close(),
      paint,
    );
    canvas.drawCircle(Offset(cx, cy), r, paint);
    canvas.drawCircle(
      Offset(cx, cy),
      r,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
    canvas.drawCircle(Offset(cx, cy), r * 0.34, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(covariant _DestinationPinPainter old) => old.fill != fill;
}

/// Pulse plus a fixed upward arrowhead; a plain dot until a heading is known.
class _NavDriverArrow extends StatefulWidget {
  const _NavDriverArrow({required this.color, required this.hasHeading});
  final Color color;
  final bool hasHeading;

  @override
  State<_NavDriverArrow> createState() => _NavDriverArrowState();
}

class _NavDriverArrowState extends State<_NavDriverArrow> with SingleTickerProviderStateMixin {
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
    builder: (_, _) => CustomPaint(painter: _NavArrowPainter(_ctrl.value, widget.color, widget.hasHeading)),
  );
}

class _NavArrowPainter extends CustomPainter {
  _NavArrowPainter(this.t, this.color, this.hasHeading);
  final double t;
  final Color color;
  final bool hasHeading;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    canvas.drawCircle(c, 8 + 10 * t, Paint()..color = color.withValues(alpha: (1 - t) * 0.35));
    if (hasHeading) {
      const s = 13.0;
      final arrow = Path()
        ..moveTo(c.dx, c.dy - s)
        ..lineTo(c.dx - s * 0.62, c.dy + s * 0.55)
        ..lineTo(c.dx, c.dy + s * 0.18)
        ..lineTo(c.dx + s * 0.62, c.dy + s * 0.55)
        ..close();
      canvas.drawPath(arrow, Paint()..color = color);
      canvas.drawPath(
        arrow,
        Paint()
          ..color = Colors.white
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    } else {
      canvas.drawCircle(c, 5.5, Paint()..color = color.withValues(alpha: 0.9));
      canvas.drawCircle(c, 2.25, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(covariant _NavArrowPainter old) => true;
}
