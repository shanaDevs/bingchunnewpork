import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../providers/auth_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import 'bc_map_pin.dart';
import 'design/bc_app_design.dart';

/// Delivery location picker — customer logo, outlet pins, road route animation, branch slider.
class DeliveryLocationPicker extends ConsumerStatefulWidget {
  final VoidCallback onBack;
  final VoidCallback onChangeMethod;
  final VoidCallback onDone;

  const DeliveryLocationPicker({
    super.key,
    required this.onBack,
    required this.onChangeMethod,
    required this.onDone,
  });

  @override
  ConsumerState<DeliveryLocationPicker> createState() => _DeliveryLocationPickerState();
}

class _DeliveryLocationPickerState extends ConsumerState<DeliveryLocationPicker>
    with SingleTickerProviderStateMixin {
  final _mapController = MapController();
  late final PageController _pageController;
  late final AnimationController _pathAnim;

  LatLng _customer = const LatLng(6.9271, 79.8612);
  String _address = 'Select location on map';
  bool _resolving = false;
  bool _locating = false;
  bool _validating = false;
  bool _confirming = false;
  bool _syncingPage = false;

  Map<String, dynamic>? _validation;
  List<Map<String, dynamic>> _branches = [];
  String? _selectedBranchId;
  List<LatLng> _routePoints = [];
  int _routeRequestId = 0;
  bool _hasFittedOnce = false;
  bool _draggingPin = false;
  LatLng? _dragPreview;
  final _mapKey = GlobalKey();
  Timer? _dragCommitTimer;
  int _mapViewTick = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(viewportFraction: 0.88);
    _pathAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    // Start GPS, but never block branch loading if permission/GPS fails.
    final locate = _locateCustomer(promptIfNeeded: false);
    await Future.any([
      locate,
      Future<void>.delayed(const Duration(milliseconds: 900)),
    ]);
    if (!mounted) return;
    if (_validation == null && !_validating) {
      await _setCustomer(_customer, moveCamera: false, fitAfterRoute: false);
    }
    await locate;
    if (!mounted) return;
    if (_branches.isEmpty) {
      await _loadStoresFallback();
    }
  }

  @override
  void dispose() {
    _dragCommitTimer?.cancel();
    _pageController.dispose();
    _pathAnim.dispose();
    super.dispose();
  }

  LatLng? _branchLatLng(Map<String, dynamic> b) {
    final lat = (b['lat'] as num?)?.toDouble();
    final lng = (b['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return null;
    return LatLng(lat, lng);
  }

  Map<String, dynamic>? get _selectedBranch {
    final id = _selectedBranchId;
    if (id == null) return null;
    for (final b in _branches) {
      if (b['id'] == id) return b;
    }
    return null;
  }

  LatLng? get _outletPoint {
    final store = _validation?['store'];
    if (store is Map) {
      final lat = (store['lat'] as num?)?.toDouble();
      final lng = (store['lng'] as num?)?.toDouble();
      if (lat != null && lng != null) return LatLng(lat, lng);
    }
    final b = _selectedBranch;
    return b == null ? null : _branchLatLng(b);
  }

  Future<bool> _ensureLocation({required bool promptIfNeeded}) async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      if (promptIfNeeded && mounted) {
        final open = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Turn on location'),
            content: const Text('Enable GPS so we can find branches near you.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
              TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Open settings')),
            ],
          ),
        );
        if (open == true) await Geolocator.openLocationSettings();
      }
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      if (promptIfNeeded && mounted) {
        showAppToast(context, 'Location permission is needed for delivery.');
      }
      return false;
    }
    if (permission == LocationPermission.deniedForever) {
      if (promptIfNeeded && mounted) {
        final open = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Location permission'),
            content: const Text('Location is blocked. Open app settings to allow it.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
              TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('App settings')),
            ],
          ),
        );
        if (open == true) await Geolocator.openAppSettings();
      }
      return false;
    }
    return true;
  }

  Future<void> _locateCustomer({required bool promptIfNeeded}) async {
    if (_locating) return;
    setState(() => _locating = true);
    try {
      final ok = await _ensureLocation(promptIfNeeded: promptIfNeeded);
      if (!ok) {
        // Still resolve nearest branches for the current map pin.
        if (_validation == null) {
          await _setCustomer(_customer, moveCamera: false, fitAfterRoute: false);
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (!mounted) return;
      await _setCustomer(
        LatLng(pos.latitude, pos.longitude),
        moveCamera: true,
        fitAfterRoute: true,
      );
    } catch (_) {
      if (mounted && promptIfNeeded) {
        showAppToast(context, 'Could not get your location.');
      }
      if (_validation == null) {
        await _setCustomer(_customer, moveCamera: false, fitAfterRoute: false);
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _moveCamera(LatLng point, double zoom) {
    try {
      _mapController.move(point, zoom);
    } catch (_) {}
  }

  LatLng? _latLngFromGlobal(Offset global) {
    final box = _mapKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return null;
    final local = box.globalToLocal(global);
    return _mapController.camera.offsetToCrs(local);
  }

  void _startPinDrag(Offset globalPosition) {
    final point = _latLngFromGlobal(globalPosition) ?? _customer;
    setState(() {
      _draggingPin = true;
      _dragPreview = point;
    });
  }

  void _updatePinDrag(Offset globalPosition) {
    if (!_draggingPin) return;
    final point = _latLngFromGlobal(globalPosition);
    if (point == null) return;
    setState(() => _dragPreview = point);
  }

  void _endPinDrag() {
    if (!_draggingPin) return;
    final point = _dragPreview ?? _customer;
    setState(() {
      _draggingPin = false;
      _dragPreview = null;
      // Keep showing the dropped pin immediately, but force a route refresh below.
      _customer = point;
      _routePoints = [];
    });
    _dragCommitTimer?.cancel();
    _dragCommitTimer = Timer(const Duration(milliseconds: 80), () {
      if (!mounted) return;
      _setCustomer(point, moveCamera: false, fitAfterRoute: false, force: true);
    });
  }

  Future<void> _setCustomer(
    LatLng point, {
    required bool moveCamera,
    required bool fitAfterRoute,
    bool force = false,
  }) async {
    final same = (_customer.latitude - point.latitude).abs() < 0.00005 &&
        (_customer.longitude - point.longitude).abs() < 0.00005;
    if (!force && same && !_resolving && _validation != null && _routePoints.length >= 2) {
      return;
    }

    setState(() {
      _customer = point;
      _resolving = true;
      _routePoints = [];
      // Location changed — drop previous branch so we re-pick the nearest.
      _selectedBranchId = null;
    });
    if (moveCamera) {
      _moveCamera(point, 15);
    }

    final api = ref.read(apiClientProvider);
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/stores/address/reverse?lat=${point.latitude}&lng=${point.longitude}',
        requireAuth: false,
      );
      if (!mounted) return;
      setState(() {
        _address = data['address'] as String? ??
            '${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)}';
        _resolving = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _address =
            '${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)}';
        _resolving = false;
      });
    }
    // Never pass an old storeId after the pin moves — API picks nearest.
    await _validate(fitAfterRoute: fitAfterRoute);
  }

  List<Map<String, dynamic>> _parseBranches(dynamic raw) {
    if (raw is! List) return [];
    final out = <Map<String, dynamic>>[];
    for (final item in raw) {
      if (item is Map<String, dynamic>) {
        out.add(item);
      } else if (item is Map) {
        out.add(Map<String, dynamic>.from(item));
      }
    }
    out.sort((a, b) {
      final da = (a['distanceKm'] as num?)?.toDouble() ?? 9999;
      final db = (b['distanceKm'] as num?)?.toDouble() ?? 9999;
      return da.compareTo(db);
    });
    return out;
  }

  String? _nearestBranchId(List<Map<String, dynamic>> branches) {
    if (branches.isEmpty) return null;
    final suggested = branches.where((b) => b['suggested'] == true).toList();
    final pool = suggested.isNotEmpty ? suggested : branches;
    return pool.first['id'] as String?;
  }

  Future<void> _loadStoresFallback() async {
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.get<List<dynamic>>(
        '/stores',
        requireAuth: false,
        listParser: (list) => list,
      );
      final branches = <Map<String, dynamic>>[];
      for (final item in data) {
        if (item is! Map) continue;
        final store = Map<String, dynamic>.from(item);
        final lat = (store['lat'] as num?)?.toDouble() ?? (store['latitude'] as num?)?.toDouble();
        final lng = (store['lng'] as num?)?.toDouble() ?? (store['longitude'] as num?)?.toDouble();
        if (lat == null || lng == null) continue;
        store['lat'] = lat;
        store['lng'] = lng;
        final km = Geolocator.distanceBetween(
              _customer.latitude,
              _customer.longitude,
              lat,
              lng,
            ) /
            1000.0;
        store['distanceKm'] = double.parse(km.toStringAsFixed(1));
        store['suggested'] = km <= 10;
        store['fee'] ??= km <= 1 ? 150 : (150 + (km - 1) * 100).round();
        store['addressLine'] ??= store['address'] ?? '';
        branches.add(store);
      }
      branches.sort((a, b) {
        final da = (a['distanceKm'] as num?)?.toDouble() ?? 9999;
        final db = (b['distanceKm'] as num?)?.toDouble() ?? 9999;
        return da.compareTo(db);
      });
      if (!mounted || branches.isEmpty) return;
      setState(() {
        _branches = branches;
        _selectedBranchId = _nearestBranchId(branches);
      });
      await _loadRoadRoute();
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncPageToSelection(animate: false));
    } catch (_) {}
  }

  Future<void> _validate({
    String? storeId,
    bool fitAfterRoute = false,
    bool snapToNearestIfInvalid = true,
  }) async {
    setState(() => _validating = true);
    final api = ref.read(apiClientProvider);
    try {
      final data = await api.post<Map<String, dynamic>>(
        '/stores/validate-delivery',
        {
          'lat': _customer.latitude,
          'lng': _customer.longitude,
          'address': _address,
          if (storeId != null) 'storeId': storeId,
        },
        requireAuth: false,
      );
      if (!mounted) return;

      var branches = _parseBranches(data['suggestedBranches']);
      if (branches.isEmpty) {
        if (_branches.isEmpty) {
          await _loadStoresFallback();
          branches = List<Map<String, dynamic>>.from(_branches);
        } else {
          branches = List<Map<String, dynamic>>.from(_branches)
            ..sort((a, b) {
              final da = (a['distanceKm'] as num?)?.toDouble() ?? 9999;
              final db = (b['distanceKm'] as num?)?.toDouble() ?? 9999;
              return da.compareTo(db);
            });
        }
      }

      final eligible = data['eligible'] == true;
      String? selectedId;

      if (eligible && data['store'] is Map) {
        selectedId = (data['store'] as Map)['id'] as String?;
      } else if (snapToNearestIfInvalid) {
        selectedId = _nearestBranchId(branches);
        if (selectedId != null && selectedId != storeId) {
          setState(() {
            _branches = branches;
            _selectedBranchId = selectedId;
          });
          await _validate(
            storeId: selectedId,
            fitAfterRoute: fitAfterRoute,
            snapToNearestIfInvalid: false,
          );
          return;
        }
      } else {
        // User explicitly picked an out-of-range branch — keep it and show the error.
        selectedId = storeId ?? _nearestBranchId(branches);
      }

      selectedId ??= _nearestBranchId(branches);

      setState(() {
        _validation = data;
        if (branches.isNotEmpty) _branches = branches;
        _selectedBranchId = selectedId;
        _validating = false;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        _syncPageToSelection(animate: true);
        _loadRoadRoute();
        if (fitAfterRoute && !_hasFittedOnce) {
          _hasFittedOnce = true;
          _moveCamera(_customer, 14.5);
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _validating = false);
      if (_branches.isEmpty) {
        await _loadStoresFallback();
      }
      if (mounted && _branches.isEmpty) {
        showAppToast(context, 'Could not load nearby branches. Pull to retry or check your connection.');
      }
    }
  }

  Future<void> _loadRoadRoute() async {
    final outlet = _outletPoint;
    final requestId = ++_routeRequestId;
    if (outlet == null) {
      if (mounted) setState(() => _routePoints = []);
      return;
    }

    final fallback = [_customer, outlet];
    // Always show at least a provisional path while OSRM loads.
    if (mounted) {
      setState(() => _routePoints = fallback);
    }

    try {
      final uri = Uri.parse(
        'https://router.project-osrm.org/route/v1/driving/'
        '${_customer.longitude},${_customer.latitude};'
        '${outlet.longitude},${outlet.latitude}'
        '?overview=full&geometries=geojson',
      );
      final res = await http.get(uri).timeout(const Duration(seconds: 10));
      if (!mounted || requestId != _routeRequestId) return;

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final routes = body['routes'] as List?;
        if (routes != null && routes.isNotEmpty) {
          final geometry = (routes.first as Map)['geometry'] as Map?;
          final coords = geometry?['coordinates'] as List?;
          if (coords != null && coords.length >= 2) {
            final points = <LatLng>[
              for (final c in coords)
                if (c is List && c.length >= 2)
                  LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()),
            ];
            if (points.length >= 2) {
              setState(() => _routePoints = points);
              return;
            }
          }
        }
      }
      setState(() => _routePoints = fallback);
    } catch (_) {
      if (!mounted || requestId != _routeRequestId) return;
      setState(() => _routePoints = fallback);
    }
  }

  void _onBranchChosen(Map<String, dynamic> branch, {bool fromSlider = false}) {
    final id = branch['id'] as String?;
    if (id == null || id == _selectedBranchId) return;
    setState(() => _selectedBranchId = id);
    if (!fromSlider) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncPageToSelection(animate: true));
    }
    // Keep camera on customer; only refresh route/eligibility for the branch.
    _validate(storeId: id, fitAfterRoute: false, snapToNearestIfInvalid: false);
  }

  void _syncPageToSelection({required bool animate}) {
    if (_branches.isEmpty || !_pageController.hasClients) return;
    final i = _branches.indexWhere((b) => b['id'] == _selectedBranchId);
    if (i < 0) return;
    _syncingPage = true;
    if (animate) {
      _pageController
          .animateToPage(i, duration: const Duration(milliseconds: 280), curve: Curves.easeOutCubic)
          .whenComplete(() => _syncingPage = false);
    } else {
      _pageController.jumpToPage(i);
      _syncingPage = false;
    }
  }

  double _pathLength(List<LatLng> points) {
    if (points.length < 2) return 0;
    var total = 0.0;
    for (var i = 1; i < points.length; i++) {
      total += const Distance().as(LengthUnit.Meter, points[i - 1], points[i]);
    }
    return total;
  }

  /// Points from start through fraction [t] of the full road path.
  List<LatLng> _prefixAlong(List<LatLng> points, double t) {
    if (points.isEmpty) return const [];
    if (points.length == 1 || t <= 0) return [points.first];
    if (t >= 1) return List<LatLng>.from(points);

    final total = _pathLength(points);
    if (total <= 0) return [points.first];
    final target = total * t.clamp(0.0, 1.0);

    var walked = 0.0;
    final out = <LatLng>[points.first];
    for (var i = 1; i < points.length; i++) {
      final seg = const Distance().as(LengthUnit.Meter, points[i - 1], points[i]);
      if (walked + seg >= target) {
        final remain = (target - walked) / (seg == 0 ? 1 : seg);
        out.add(LatLng(
          points[i - 1].latitude + (points[i].latitude - points[i - 1].latitude) * remain,
          points[i - 1].longitude + (points[i].longitude - points[i - 1].longitude) * remain,
        ));
        break;
      }
      walked += seg;
      out.add(points[i]);
    }
    return out;
  }

  LatLng _pointAlong(List<LatLng> points, double t) {
    final prefix = _prefixAlong(points, t);
    return prefix.isEmpty ? _customer : prefix.last;
  }

  Future<void> _confirm() async {
    if (_address.isEmpty || _confirming) return;
    final eligible = _validation?['eligible'] == true;
    if (!eligible) {
      showAppToast(context, _validation?['message'] as String? ?? 'Delivery is not available here.');
      return;
    }
    setState(() => _confirming = true);
    final result = await ref.read(fulfillmentProvider.notifier).validateAndSetDelivery(
          address: _address,
          lat: _customer.latitude,
          lng: _customer.longitude,
          storeId: _selectedBranchId,
        );
    if (!mounted) return;
    setState(() => _confirming = false);
    if (result != null && result['eligible'] == true) {
      widget.onDone();
    } else {
      showAppToast(context, result?['message'] as String? ?? 'Could not set delivery.');
    }
  }

  String get _confirmSubtitle {
    final name = (_selectedBranch?['name'] as String?) ??
        (_validation?['store'] is Map ? (_validation!['store'] as Map)['name'] as String? : null) ??
        'a branch';
    final short = name.contains(' - ') ? name.split(' - ').last.trim() : name;
    return 'Deliver from $short';
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    final outlet = _outletPoint;
    final eligible = _validation?['eligible'] == true;

    return Theme(
      data: BcTheme.light,
      child: Scaffold(
        backgroundColor: const Color(0xFFF5F7FB),
        body: Column(
          children: [
            _DeliveryHeader(
              topInset: top,
              onBack: widget.onBack,
              onChangeMethod: widget.onChangeMethod,
            ),
            Expanded(
              child: Stack(
                children: [
                  Listener(
                    behavior: HitTestBehavior.translucent,
                    onPointerMove: (e) {
                      if (_draggingPin) _updatePinDrag(e.position);
                    },
                    onPointerUp: (_) {
                      if (_draggingPin) _endPinDrag();
                    },
                    onPointerCancel: (_) {
                      if (_draggingPin) _endPinDrag();
                    },
                    child: FlutterMap(
                      key: _mapKey,
                      mapController: _mapController,
                      options: MapOptions(
                        initialCenter: _customer,
                        initialZoom: 13,
                        interactionOptions: InteractionOptions(
                          flags: _draggingPin
                              ? InteractiveFlag.none
                              : (InteractiveFlag.all & ~InteractiveFlag.rotate),
                        ),
                        onMapEvent: (event) {
                          if (_draggingPin) return;
                          if (event is MapEventMove || event is MapEventScrollWheelZoom) {
                            setState(() => _mapViewTick++);
                          }
                        },
                      ),
                      children: [
                        TileLayer(
                          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName: 'lk.bingchun.bing_chun_customer',
                        ),
                        if (_routePoints.length >= 2 && !_draggingPin)
                          AnimatedBuilder(
                            animation: _pathAnim,
                            builder: (context, _) {
                              final t = Curves.easeInOut.transform(_pathAnim.value);
                              final drawT = (t < 0.5) ? t * 2 : 1.0;
                              final drawn = _prefixAlong(_routePoints, drawT);
                              return PolylineLayer(
                                polylines: [
                                  Polyline(
                                    points: _routePoints,
                                    strokeWidth: 5,
                                    color: BcColors.brand.withValues(alpha: 0.22),
                                    borderStrokeWidth: 1,
                                    borderColor: Colors.white.withValues(alpha: 0.5),
                                  ),
                                  if (drawn.length >= 2)
                                    Polyline(
                                      points: drawn,
                                      strokeWidth: 5,
                                      color: BcColors.brand,
                                      borderStrokeWidth: 2,
                                      borderColor: Colors.white.withValues(alpha: 0.9),
                                    ),
                                ],
                              );
                            },
                          ),
                        MarkerLayer(
                          markers: [
                            for (final b in _branches)
                              if (_branchLatLng(b) != null && b['id'] != _selectedBranchId)
                                Marker(
                                  point: _branchLatLng(b)!,
                                  width: 36,
                                  height: 46,
                                  alignment: Alignment.bottomCenter,
                                  child: BcLogoMapPin(
                                    selected: false,
                                    size: 30,
                                    onTap: () => _onBranchChosen(b),
                                  ),
                                ),
                            if (outlet != null)
                              Marker(
                                point: outlet,
                                width: 110,
                                height: 86,
                                alignment: Alignment.bottomCenter,
                                child: BcLogoMapPin(
                                  selected: true,
                                  size: 44,
                                  label: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(10),
                                      boxShadow: [
                                        BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 6),
                                      ],
                                    ),
                                    child: const Text(
                                      'Outlet',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w800,
                                        color: BcDesign.cardNavy,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        if (_routePoints.length >= 2 && !_draggingPin)
                          AnimatedBuilder(
                            animation: _pathAnim,
                            builder: (context, _) {
                              final t = Curves.easeInOut.transform(_pathAnim.value);
                              final travel = t < 0.45 ? 0.0 : ((t - 0.45) / 0.55).clamp(0.0, 1.0);
                              final mid = _pointAlong(_routePoints, travel);
                              return MarkerLayer(
                                markers: [
                                  Marker(
                                    point: mid,
                                    width: 28,
                                    height: 28,
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        shape: BoxShape.circle,
                                        border: Border.all(color: BcColors.brand, width: 2),
                                        boxShadow: [
                                          BoxShadow(
                                            color: BcColors.brand.withValues(alpha: 0.35),
                                            blurRadius: 8,
                                          ),
                                        ],
                                      ),
                                      child: const Icon(Icons.delivery_dining_rounded, color: BcColors.brand, size: 16),
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                      ],
                    ),
                  ),
                  // Customer pin as overlay (not a map marker) so it receives drag gestures.
                  Builder(
                    builder: (context) {
                      // ignore: unused_local_variable
                      final tick = _mapViewTick;
                      Offset screen;
                      try {
                        final p = _mapController.camera.latLngToScreenPoint(_dragPreview ?? _customer);
                        screen = Offset(p.x, p.y);
                      } catch (_) {
                        return const SizedBox.shrink();
                      }
                      const pinW = 120.0;
                      const pinH = 110.0;
                      return Positioned(
                        left: screen.dx - pinW / 2,
                        top: screen.dy - pinH,
                        width: pinW,
                        height: pinH,
                        child: Listener(
                          behavior: HitTestBehavior.opaque,
                          onPointerDown: (e) => _startPinDrag(e.position),
                          onPointerMove: (e) {
                            if (_draggingPin) _updatePinDrag(e.position);
                          },
                          onPointerUp: (_) {
                            if (_draggingPin) _endPinDrag();
                          },
                          onPointerCancel: (_) {
                            if (_draggingPin) _endPinDrag();
                          },
                          child: Align(
                            alignment: Alignment.bottomCenter,
                            child: BcCustomerCupPin(
                              size: _draggingPin ? 54 : 48,
                              label: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(10),
                                  boxShadow: [
                                    BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 6),
                                  ],
                                ),
                                child: Text(
                                  _draggingPin ? 'Drop to set' : 'You · drag pin',
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: BcDesign.cardNavy,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                  Positioned(
                    left: 16,
                    right: 16,
                    top: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 4)),
                        ],
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.place_rounded, color: BcColors.brand, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _resolving ? 'Resolving address...' : _address,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: BcDesign.cardNavy,
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                                height: 1.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    right: 16,
                    bottom: 12,
                    child: Material(
                      color: Colors.white,
                      shape: const CircleBorder(),
                      elevation: 3,
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: _locating || _draggingPin ? null : () => _locateCustomer(promptIfNeeded: true),
                        child: SizedBox(
                          width: 48,
                          height: 48,
                          child: Icon(
                            _locating ? Icons.hourglass_top_rounded : Icons.my_location_rounded,
                            color: BcColors.brand,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(0, 10, 0, 0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Nearest branches',
                        style: TextStyle(
                          color: BcDesign.cardNavy,
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (_validating)
                    const Padding(
                      padding: EdgeInsets.all(20),
                      child: CircularProgressIndicator(color: BcColors.brand),
                    )
                  else if (_branches.isEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      child: Text(
                        _validation?['message'] as String? ??
                            'Tap the map or use your location to find nearby outlets.',
                        style: const TextStyle(color: BcDesign.muted, fontSize: 13),
                      ),
                    )
                  else
                    SizedBox(
                      height: 128,
                      child: PageView.builder(
                        controller: _pageController,
                        itemCount: _branches.length,
                        onPageChanged: (i) {
                          if (_syncingPage) return;
                          _onBranchChosen(_branches[i], fromSlider: true);
                        },
                        itemBuilder: (context, i) {
                          final b = _branches[i];
                          final selected = b['id'] == _selectedBranchId;
                          final canServe = b['suggested'] == true;
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(10, 4, 10, 8),
                            child: _BranchSlideCard(
                              branch: b,
                              selected: selected,
                              canServe: canServe,
                              onTap: () => _onBranchChosen(b),
                            ),
                          );
                        },
                      ),
                    ),
                  if (_validation != null && !eligible)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: Text(
                        _validation!['message'] as String? ?? 'This branch cannot deliver here.',
                        style: const TextStyle(color: BcColors.error, fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ),
                ],
              ),
            ),
            _DeliveryConfirmBar(
              subtitle: _confirmSubtitle,
              enabled: eligible && !_confirming && !_validating,
              loading: _confirming,
              fee: (_validation?['zone'] is Map) ? (_validation!['zone'] as Map)['fee'] : null,
              eta: _validation?['estimatedMinutes'] as int?,
              onConfirm: _confirm,
            ),
          ],
        ),
      ),
    );
  }
}

class _DeliveryHeader extends StatelessWidget {
  final double topInset;
  final VoidCallback onBack;
  final VoidCallback onChangeMethod;

  const _DeliveryHeader({
    required this.topInset,
    required this.onBack,
    required this.onChangeMethod,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0A1630), Color(0xFF142A5C), Color(0xFF1E3A8A)],
        ),
      ),
      padding: EdgeInsets.fromLTRB(8, topInset + 4, 12, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
              ),
              const Expanded(
                child: Text(
                  'Delivery location',
                  style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                ),
              ),
              TextButton(
                onPressed: onChangeMethod,
                child: const Text(
                  'Change method',
                  style: TextStyle(color: BcColors.brandLight, fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Pin where we should deliver',
            style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, height: 1.2),
          ),
          const SizedBox(height: 4),
          Text(
            'Drag your pin to set the delivery point. Zoom and pan freely without moving it.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.72), fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _BranchSlideCard extends StatelessWidget {
  final Map<String, dynamic> branch;
  final bool selected;
  final bool canServe;
  final VoidCallback onTap;

  const _BranchSlideCard({
    required this.branch,
    required this.selected,
    required this.canServe,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final name = branch['name'] as String? ?? 'Branch';
    final addr = branch['addressLine'] as String? ?? '';
    final dist = (branch['distanceKm'] as num?)?.toDouble();
    final fee = branch['fee'];

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? BcColors.brand : const Color(0xFFE4EAF3),
              width: selected ? 1.8 : 1,
            ),
            boxShadow: selected
                ? [BoxShadow(color: BcColors.brand.withValues(alpha: 0.16), blurRadius: 10, offset: const Offset(0, 3))]
                : null,
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  width: 48,
                  height: 48,
                  color: const Color(0xFFE8F1FF),
                  child: Image.asset(
                    'assets/brand/mascot-hover.png',
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        const Icon(Icons.storefront_rounded, color: BcColors.brand),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: BcDesign.cardNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      addr,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: BcDesign.muted, fontSize: 11),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (dist != null) '${dist.toStringAsFixed(1)} km',
                        if (fee != null) 'Fee LKR $fee',
                        canServe ? 'Can deliver' : 'Out of range',
                      ].join('  ·  '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: canServe ? BcColors.success : BcColors.error,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                color: selected ? BcColors.brand : const Color(0xFFC5CEDC),
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DeliveryConfirmBar extends StatelessWidget {
  final String subtitle;
  final bool enabled;
  final bool loading;
  final dynamic fee;
  final int? eta;
  final VoidCallback onConfirm;

  const _DeliveryConfirmBar({
    required this.subtitle,
    required this.enabled,
    required this.loading,
    required this.fee,
    required this.eta,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + bottom),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, -3)),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.delivery_dining_rounded, color: BcColors.brand, size: 26),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: BcDesign.cardNavy, fontWeight: FontWeight.w800, fontSize: 14),
                ),
                if (fee != null || eta != null)
                  Text(
                    [
                      if (fee != null) 'LKR $fee',
                      if (eta != null) '~$eta min',
                    ].join('  ·  '),
                    style: const TextStyle(color: BcDesign.muted, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          ElevatedButton(
            onPressed: enabled ? onConfirm : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: BcColors.brand,
              foregroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFFC5CEDC),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: loading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Deliver here', style: TextStyle(fontWeight: FontWeight.w800)),
                      SizedBox(width: 6),
                      Icon(Icons.arrow_forward_rounded, size: 18),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
