import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../data/models/delivery_route.dart';
import '../../tracking/location_tracker.dart';
import '../components/app_bottom_nav.dart';
import '../components/call_confirm.dart';
import '../components/job_cards.dart';
import '../components/qd_kit.dart';
import '../components/sheet_kit.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

const _navZoom = 18.0;
const _minRefetchDelta = 0.0002; // ~20m
const _minHeadingDelta = 0.00004; // ~4m
const _arrivedMetres = 40.0;
const _followTilt = 45.0;

/// Dark map palette used in dark mode, like Google Maps' night navigation view.
const _nightStyle =
    '[{"elementType":"geometry","stylers":[{"color":"#1d2c4d"}]},'
    '{"elementType":"labels.text.fill","stylers":[{"color":"#8ec3b9"}]},'
    '{"elementType":"labels.text.stroke","stylers":[{"color":"#1a3646"}]},'
    '{"featureType":"administrative.country","elementType":"geometry.stroke","stylers":[{"color":"#4b6878"}]},'
    '{"featureType":"landscape.man_made","elementType":"geometry.stroke","stylers":[{"color":"#334e87"}]},'
    '{"featureType":"landscape.natural","elementType":"geometry","stylers":[{"color":"#023e58"}]},'
    '{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#283d6a"}]},'
    '{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#6f9ba5"}]},'
    '{"featureType":"poi.park","elementType":"geometry.fill","stylers":[{"color":"#023e58"}]},'
    '{"featureType":"road","elementType":"geometry","stylers":[{"color":"#304a7d"}]},'
    '{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#98a5be"}]},'
    '{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#2c6675"}]},'
    '{"featureType":"transit","elementType":"geometry","stylers":[{"color":"#283d6a"}]},'
    '{"featureType":"water","elementType":"geometry","stylers":[{"color":"#0e1626"}]}]';

/// The rider marker: a blue disc with a white navigation arrow and a soft halo, drawn once.
Future<BitmapDescriptor> _renderRiderArrow() async {
  const size = 120.0;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder, const Rect.fromLTWH(0, 0, size, size));
  const c = Offset(size / 2, size / 2);
  canvas.drawCircle(c, 56, Paint()..color = const Color(0xFF1A73E8).withValues(alpha: 0.28));
  canvas.drawCircle(c, 36, Paint()..color = Colors.white);
  canvas.drawCircle(c, 33, Paint()..color = const Color(0xFF1A5FE0));
  final arrow = Path()
    ..moveTo(c.dx, c.dy - 20)
    ..lineTo(c.dx + 16, c.dy + 16)
    ..lineTo(c.dx, c.dy + 8)
    ..lineTo(c.dx - 16, c.dy + 16)
    ..close();
  canvas.drawPath(arrow, Paint()..color = Colors.white);
  final image = await recorder.endRecording().toImage(size.toInt(), size.toInt());
  final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
  return BitmapDescriptor.bytes(bytes, width: 48, height: 48);
}

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

class _NavigationScreenState extends State<NavigationScreen> {
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
  BitmapDescriptor? _riderIcon;

  /// Camera follows the rider (heading-up). Panning the map pauses it until "Re-center".
  bool _following = true;

  /// True while a camera move was started by us (follow, zoom buttons, re-center).
  bool _programmatic = false;

  @override
  void initState() {
    super.initState();
    _renderRiderArrow().then((icon) {
      if (mounted) setState(() => _riderIcon = icon);
    });
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
    if (_mapReady && map != null && _following) {
      _followCamera(map, fix, heading);
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

  /// Heading-up camera on the rider, slightly tilted like Google Maps navigation.
  void _followCamera(GoogleMapController map, DriverFix fix, double? heading) {
    final zoom = _zoomed ? _zoom : _navZoom;
    _zoomed = true;
    _programmatic = true;
    map.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(
          target: LatLng(fix.lat, fix.lng),
          zoom: zoom,
          bearing: heading ?? _lastHeading ?? 0,
          tilt: widget.target.upNext ? 0 : _followTilt,
        ),
      ),
    );
  }

  void _recenter() {
    BcFeedback.tap();
    final fix = _tracker.lastFix;
    final map = _map;
    setState(() => _following = true);
    if (fix != null && map != null) _followCamera(map, fix, _lastHeading);
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

  void _zoomBy(bool zoomIn) {
    BcFeedback.tap();
    _programmatic = true;
    _map?.animateCamera(zoomIn ? CameraUpdate.zoomIn() : CameraUpdate.zoomOut());
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
              onCameraMoveStarted: () {
                // A move we didn't start is the rider panning: stop following.
                if (!_programmatic && _following) setState(() => _following = false);
              },
              onCameraIdle: () => _programmatic = false,
              style: c.isDark ? _nightStyle : null,
              zoomControlsEnabled: false,
              // Plain blue dot only until the arrow marker below is ready.
              myLocationEnabled: _riderIcon == null,
              myLocationButtonEnabled: false,
              mapToolbarEnabled: false,
              compassEnabled: false,
              // Google-style route: a bright cyan line with a darker outline.
              polylines: {
                if (!t.upNext && _roadPath.length >= 2) ...[
                  Polyline(
                    polylineId: const PolylineId('nav-route-outline'),
                    points: _roadPath.map((p) => LatLng(p.lat, p.lng)).toList(),
                    color: const Color(0xFF0B57D0),
                    width: 13,
                    jointType: JointType.round,
                    startCap: Cap.roundCap,
                    endCap: Cap.roundCap,
                  ),
                  Polyline(
                    polylineId: const PolylineId('nav-route'),
                    points: _roadPath.map((p) => LatLng(p.lat, p.lng)).toList(),
                    color: const Color(0xFF22D3EE),
                    width: 8,
                    zIndex: 1,
                    jointType: JointType.round,
                    startCap: Cap.roundCap,
                    endCap: Cap.roundCap,
                  ),
                ],
              },
              // Google's standard red pin at the destination; the rider is the blue navigation arrow.
              markers: {
                if (fix != null && _riderIcon != null)
                  Marker(
                    markerId: const MarkerId('rider'),
                    position: LatLng(fix.lat, fix.lng),
                    icon: _riderIcon!,
                    anchor: const Offset(0.5, 0.5),
                    // Flat + heading rotation: with the camera bearing on the heading,
                    // the arrow points up on screen.
                    flat: true,
                    rotation: _lastHeading ?? 0,
                    zIndexInt: 10,
                  ),
                Marker(
                  markerId: const MarkerId('destination'),
                  position: LatLng(t.lat, t.lng),
                  infoWindow: InfoWindow(title: t.label, snippet: t.address.trim().isEmpty ? null : t.address),
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
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // Shown after the rider pans the map away from the arrow.
                    if (!_following)
                      Material(
                        color: Colors.black.withValues(alpha: 0.92),
                        shape: const StadiumBorder(),
                        elevation: 4,
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: _recenter,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.navigation_rounded, color: Color(0xFF4C8DFF), size: 20),
                                const SizedBox(width: 8),
                                Text(
                                  tr('Re-center'),
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    const Spacer(),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Zoom controls (the native ones are off so they sit with our buttons).
                        Material(
                          color: c.inverse,
                          elevation: 4,
                          borderRadius: BorderRadius.circular(BcRadius.full),
                          clipBehavior: Clip.antiAlias,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              InkWell(
                                onTap: () => _zoomBy(true),
                                child: Tooltip(
                                  message: tr('Zoom in'),
                                  child: SizedBox(
                                    width: 48,
                                    height: 48,
                                    child: Icon(Icons.add_rounded, color: c.primary, size: 26),
                                  ),
                                ),
                              ),
                              Container(width: 24, height: 1, color: c.primary.withValues(alpha: 0.3)),
                              InkWell(
                                onTap: () => _zoomBy(false),
                                child: Tooltip(
                                  message: tr('Zoom out'),
                                  child: SizedBox(
                                    width: 48,
                                    height: 48,
                                    child: Icon(Icons.remove_rounded, color: c.primary, size: 26),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Material(
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
                      ],
                    ),
                  ],
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
