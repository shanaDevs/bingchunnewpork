import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../data/models/delivery_route.dart';
import '../../tracking/location_tracker.dart';
import '../components/app_bottom_nav.dart';
import '../components/call_confirm.dart';
import '../components/job_cards.dart';
import '../components/qd_kit.dart';
import '../components/sheet_kit.dart';
import '../components/map_bitmaps.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

const _navZoom = 18.0;
const _minRefetchDelta = 0.0002; // ~20m
const _minHeadingDelta = 0.00004; // ~4m
const _arrivedMetres = 40.0;

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

/// A generic "slide to confirm" action (e.g. confirm a delivery).
class NavSlideAction extends NavPrimaryAction {
  final String label;
  final bool enabled;
  final bool loading;
  final String? hint;
  final VoidCallback onConfirm;
  const NavSlideAction({
    required this.label,
    required this.onConfirm,
    this.enabled = true,
    this.loading = false,
    this.hint,
  });
}

/// A generic full-width button action (e.g. start delivery).
class NavButtonAction extends NavPrimaryAction {
  final String label;
  final IconData icon;
  final bool enabled;
  final bool loading;
  final VoidCallback onTap;
  const NavButtonAction({
    required this.label,
    required this.icon,
    required this.onTap,
    this.enabled = true,
    this.loading = false,
  });
}

/// Full-screen in-app navigation to a single destination — port of InAppNavigationScreen.kt.
///
/// [actionBuilder] is called on every rebuild so the action reflects current state;
/// wrap the route in the caller's providers so it can `watch` them.
class NavigationScreen extends StatefulWidget {
  const NavigationScreen({super.key, required this.target, this.actionBuilder, this.trailing, this.onOpenDestination});

  final NavTarget target;

  /// Optional control opposite the back button (e.g. report a problem).
  final Widget? trailing;

  /// Tapping the destination panel (customers: opens the order). Shows a chevron when set.
  final VoidCallback? onOpenDestination;
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

class _NavigationScreenState extends State<NavigationScreen> with MarkerIconMixin {
  GoogleMapController? _map;
  late final LocationTracker _tracker = context.read<AppContainer>().locationTracker;
  bool _mapReady = false;
  bool _zoomed = false;
  double _zoom = _navZoom;
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
    _map?.dispose();
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

    final map = _map;
    if (_mapReady && map != null) {
      final center = LatLng(fix.lat, fix.lng);
      final zoom = _zoomed ? _zoom : _navZoom;
      _zoomed = true;
      // Heading-up: the camera bearing follows the direction of travel.
      map.animateCamera(
        CameraUpdate.newCameraPosition(CameraPosition(target: center, zoom: zoom, bearing: heading ?? 0)),
      );
    }
    setState(() {});

    if (widget.target.upNext) return;
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

  Future<void> _openGoogleMaps() async {
    final t = widget.target;
    final messenger = ScaffoldMessenger.of(context);
    final err = await Intents.navigateTo(t.lat, t.lng, label: t.label);
    if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final t = widget.target;
    final fix = _tracker.lastFix;
    final action = widget.actionBuilder?.call(context);
    final hasHeading = _lastHeading != null;
    final destIcon = markerIcon(
      'nav-dest-${c.action.toARGB32()}',
      const Size(34, 44),
      () => _DestinationPinPainter(c.action),
    );
    final driverIcon = fix == null
        ? null
        : markerIcon(
            'nav-driver-${c.primaryStrong.toARGB32()}-$hasHeading',
            const Size(72, 72),
            () => _NavArrowPainter(0.35, c.primaryStrong, hasHeading),
          );

    final top = MediaQuery.paddingOf(context).top;
    final remainingM = fix == null ? null : Geolocator.distanceBetween(fix.lat, fix.lng, t.lat, t.lng);
    final arrived =
        !t.upNext && (action is NavConfirmPickup && action.enabled) ||
        (remainingM != null && remainingM <= _arrivedMetres);
    final eyebrow = switch (t.kind) {
      NavKindPickup() => tr('Heading to pickup'),
      NavKindReturn() => tr('Heading back to branch'),
      _ when t.upNext && t.stopNumber != null => tr('Up next · order {n}', {'n': t.stopNumber!}),
      _ when t.stopNumber != null => tr('Heading to order {n}', {'n': t.stopNumber!}),
      _ => tr('Heading to delivery'),
    };
    final markerIconData = switch (t.kind) {
      NavKindPickup() => Icons.storefront_outlined,
      NavKindReturn() => Icons.flag_outlined,
      _ => Icons.place_outlined,
    };
    final address = t.address.trim().replaceAll(RegExp(r'^,\s*|,\s*$'), '').isEmpty
        ? switch (t.kind) {
            NavKindPickup() => tr('Pickup Location'),
            NavKindReturn() => tr('Return to branch'),
            _ => tr('Drop-off Location'),
          }
        : t.address;
    final a = action;
    final canCall = a is NavCustomerStop ? a.callEnabled : t.phone.trim().isNotEmpty;
    final onCall = t.phone.trim().isNotEmpty
        ? () => confirmAndCall(context, name: t.label, phone: t.phone)
        : (a is NavCustomerStop ? a.onCall : () {});

    final awayText = remainingM == null
        ? null
        : (remainingM >= 1000 ? '${(remainingM / 1000).toStringAsFixed(1)} km' : '${remainingM.round()} m');
    final etaMinutes = _durationS == null ? null : (_durationS! / 60).floor().clamp(1, 1 << 30);
    final etaDistance = _distanceM == null
        ? null
        : (_distanceM! >= 1000 ? '${(_distanceM! / 1000).toStringAsFixed(1)} km' : '${_distanceM!.toInt()} m');

    return Scaffold(
      backgroundColor: c.background,
      bottomNavigationBar: const AppBottomNav.overShell(),
      body: Stack(
        children: [
          Positioned.fill(
            child: GoogleMap(
              initialCameraPosition: CameraPosition(target: LatLng(t.lat, t.lng), zoom: _navZoom),
              onMapCreated: (controller) {
                _map = controller;
                _mapReady = true;
                _onFix();
              },
              onCameraMove: (position) => _zoom = position.zoom,
              zoomControlsEnabled: false,
              myLocationButtonEnabled: false,
              mapToolbarEnabled: false,
              compassEnabled: false,
              polylines: {
                if (!t.upNext && _roadPath.length >= 2)
                  Polyline(
                    polylineId: const PolylineId('nav-route'),
                    points: _roadPath.map((p) => LatLng(p.lat, p.lng)).toList(),
                    color: c.primaryStrong,
                    width: 7,
                  ),
              },
              markers: {
                if (destIcon != null)
                  Marker(
                    markerId: const MarkerId('destination'),
                    position: LatLng(t.lat, t.lng),
                    icon: destIcon,
                    anchor: const Offset(0.5, 1),
                    consumeTapEvents: true,
                  ),
                if (fix != null && driverIcon != null)
                  Marker(
                    markerId: const MarkerId('driver'),
                    position: LatLng(fix.lat, fix.lng),
                    icon: driverIcon,
                    anchor: const Offset(0.5, 0.5),
                    // Flat + heading rotation: with the camera bearing on the heading,
                    // the arrow points up on screen.
                    flat: true,
                    rotation: _lastHeading ?? 0,
                    zIndexInt: 10,
                    consumeTapEvents: true,
                  ),
              },
            ),
          ),
          if (fix == null) Center(child: CircularProgressIndicator(color: c.primaryStrong)),
          // Header pinned to the top edge: back, where to, how far / how long, the destination.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: EdgeInsets.fromLTRB(12, top + 10, 12, 12),
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(BcRadius.xl)),
                boxShadow: [
                  BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 24, offset: const Offset(0, 8)),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      QdBackButton(onTap: () => Navigator.of(context).maybePop()),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: arrived ? c.success : c.primary,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    eyebrow,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: c.mutedForeground,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            if (t.upNext)
                              Text(
                                awayText == null ? tr('Locating…') : tr('{distance} away', {'distance': awayText}),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: BcType.subtitle.copyWith(
                                  color: c.foreground,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                ),
                              )
                            else if (arrived)
                              Text(
                                tr('You\'ve arrived'),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: BcType.subtitle.copyWith(
                                  color: c.successStrong,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                ),
                              )
                            else if (etaMinutes == null)
                              Text(
                                tr('Locating…'),
                                style: BcType.subtitle.copyWith(
                                  color: c.foreground,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                ),
                              )
                            else
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.baseline,
                                textBaseline: TextBaseline.alphabetic,
                                children: [
                                  Text(
                                    tr('{n} min', {'n': etaMinutes}),
                                    style: BcType.subtitle.copyWith(
                                      color: c.foreground,
                                      fontSize: 26,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text(
                                      etaDistance ?? '',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w600,
                                        color: c.mutedForeground,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),
                      if (widget.trailing != null) ...[const SizedBox(width: 12), widget.trailing!],
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.fromLTRB(8, 8, 10, 8),
                    decoration: BoxDecoration(color: c.highlight, borderRadius: BorderRadius.circular(BcRadius.md)),
                    child: Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: widget.onOpenDestination,
                            borderRadius: BorderRadius.circular(BcRadius.sm),
                            child: Row(
                              children: [
                                Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(shape: BoxShape.circle, color: c.inverse),
                                  child: Icon(markerIconData, size: 20, color: c.inverseForeground),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        t.label,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w700,
                                          color: c.highlightForeground,
                                        ),
                                      ),
                                      Text(
                                        address,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: c.highlightForeground.withValues(alpha: 0.75),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (widget.onOpenDestination != null)
                                  Icon(
                                    Icons.chevron_right_rounded,
                                    size: 22,
                                    color: c.highlightForeground.withValues(alpha: 0.5),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        if (canCall) ...[
                          const SizedBox(width: 8),
                          Material(
                            color: c.call,
                            shape: const CircleBorder(),
                            clipBehavior: Clip.antiAlias,
                            child: InkWell(
                              onTap: onCall,
                              child: Tooltip(
                                message: tr('Call'),
                                child: SizedBox(
                                  width: 44,
                                  height: 44,
                                  child: Icon(Icons.call_rounded, color: c.callForeground, size: 22),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Bottom: the directions button over the map, then the one next step.
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: Material(
                    color: c.inverse,
                    shape: const CircleBorder(),
                    elevation: 4,
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: _openGoogleMaps,
                      child: Tooltip(
                        message: tr('Open in Google Maps'),
                        child: SizedBox(
                          width: 56,
                          height: 56,
                          child: Icon(Icons.directions_rounded, color: c.primary, size: 28),
                        ),
                      ),
                    ),
                  ),
                ),
                if (a != null) ...[const SizedBox(height: 12), _NavActionRow(action: a)],
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
    Widget floating(Widget child) => DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BcRadius.full),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 24, offset: const Offset(0, 8))],
      ),
      child: child,
    );
    switch (a) {
      case NavConfirmPickup():
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (a.geofenceHint != null && !a.enabled) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(BcRadius.md)),
                child: Row(
                  children: [
                    Icon(Icons.info_outline_rounded, size: 18, color: c.primaryStrong),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(a.geofenceHint!, style: TextStyle(fontSize: 13, color: c.foreground)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
            floating(
              BcSlideToConfirm(
                label: tr('Slide to confirm pickup'),
                color: c.error,
                foreground: c.errorForeground,
                enabled: a.enabled,
                loading: a.loading,
                onConfirm: a.onConfirm,
              ),
            ),
          ],
        );
      case NavCompleteRide():
        return floating(
          BcSlideToConfirm(
            label: tr('Slide to complete ride'),
            color: c.error,
            foreground: c.errorForeground,
            enabled: a.enabled,
            loading: a.loading,
            onConfirm: a.onComplete,
          ),
        );
      case NavSlideAction():
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (a.hint != null && !a.enabled) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(BcRadius.md)),
                child: Row(
                  children: [
                    Icon(Icons.info_outline_rounded, size: 18, color: c.primaryStrong),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(a.hint!, style: TextStyle(fontSize: 13, color: c.foreground)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
            floating(
              BcSlideToConfirm(
                label: a.label,
                color: c.error,
                foreground: c.errorForeground,
                enabled: a.enabled,
                loading: a.loading,
                onConfirm: a.onConfirm,
              ),
            ),
          ],
        );
      case NavButtonAction():
        return floating(
          PillButton(label: a.label, icon: a.icon, height: 56, loading: a.loading, onTap: a.enabled ? a.onTap : null),
        );
      case NavCustomerStop():
        if (a.onOpenOrder == null) return const SizedBox.shrink();
        return floating(
          PillButton(label: tr('Open order'), icon: Icons.receipt_long_rounded, height: 56, onTap: a.onOpenOrder),
        );
    }
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

/// Pulse ring plus an upward arrowhead; a plain dot until a heading is known.
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
