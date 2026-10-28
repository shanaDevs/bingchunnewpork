import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../models/order.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../services/order_socket_service.dart';
import '../services/road_routing_service.dart';
import '../theme/bc_theme.dart';
import '../widgets/bc_map_pin.dart';

/// Full-screen realtime driver map for delivery orders (web `LiveDeliveryMap`).
class LiveDeliveryMapScreen extends ConsumerStatefulWidget {
  final String orderId;

  const LiveDeliveryMapScreen({super.key, required this.orderId});

  @override
  ConsumerState<LiveDeliveryMapScreen> createState() =>
      _LiveDeliveryMapScreenState();
}

class _LiveDeliveryMapScreenState extends ConsumerState<LiveDeliveryMapScreen> {
  final _mapController = MapController();
  LatLng? _driver;
  double? _heading;
  int? _etaMinutes;
  String? _deliveryState;
  List<LatLng> _path = [];
  bool _didFit = false;
  bool _socketAttached = false;
  int _routeRequestId = 0;
  LatLng? _lastRoutedFrom;
  DriverLocationHandler? _prevLocationHandler;
  EtaUpdateHandler? _prevEtaHandler;

  @override
  void initState() {
    super.initState();
    Future.microtask(_bootstrap);
  }

  Future<void> _bootstrap() async {
    await ref.read(orderProvider.notifier).fetchOrderDetails(widget.orderId);
    if (!mounted) return;

    final auth = ref.read(authProvider);
    if (auth.status == AuthStatus.authenticated) {
      await ref.read(orderProvider.notifier).connectRealtime(userId: auth.user?.id);
    }

    final order = _order;
    if (order != null && order.driverLat != null && order.driverLng != null) {
      setState(() {
        _driver = LatLng(order.driverLat!, order.driverLng!);
        _heading = order.driverHeading;
        _deliveryState = order.deliveryPhase ?? _deliveryState;
      });
      unawaited(_refreshPath(order));
    }

    ref.read(orderProvider.notifier).startTrackingOrder(widget.orderId);
    _attachSocket();
  }

  @override
  void dispose() {
    _detachSocket();
    super.dispose();
  }

  Order? _resolveOrder(OrderState state) {
    if (state.activeOrder?.id == widget.orderId) return state.activeOrder;
    for (final o in state.orderHistory) {
      if (o.id == widget.orderId) return o;
    }
    return state.activeOrder;
  }

  Order? get _order => _resolveOrder(ref.read(orderProvider));

  bool _matchesOrder(Map<String, dynamic> payload, Order order) {
    final orderId = payload['orderId'] as String?;
    final orderNumber = payload['orderNumber'] as String?;
    if (orderId == null && orderNumber == null) return true;
    return orderId == order.id ||
        orderId == order.orderNumber ||
        orderNumber == order.orderNumber ||
        orderNumber == order.id;
  }

  double? _asDouble(dynamic value) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  bool get _headingToOutlet {
    final state = (_deliveryState ?? _order?.deliveryPhase ?? '').toUpperCase();
    if (state == 'TO_OUTLET') return true;
    final status = _order?.status;
    return status == 'READY' && state != 'TO_CUSTOMER';
  }

  LatLng? _pathTarget(Order order) {
    if (_headingToOutlet && order.storeLat != null && order.storeLng != null) {
      return LatLng(order.storeLat!, order.storeLng!);
    }
    if (order.deliveryLat != null && order.deliveryLng != null) {
      return LatLng(order.deliveryLat!, order.deliveryLng!);
    }
    return null;
  }

  Future<void> _refreshPath(Order order) async {
    final driver = _driver;
    final target = _pathTarget(order);
    if (driver == null || target == null) return;

    if (_lastRoutedFrom != null) {
      final moved = const Distance().as(LengthUnit.Meter, _lastRoutedFrom!, driver);
      if (moved < 80 && _path.length >= 2) return;
    }

    final requestId = ++_routeRequestId;
    final fallback = [driver, target];
    if (mounted && _path.length < 2) {
      setState(() => _path = fallback);
    }

    final road = await roadRoutingService.fetchRoadPath(fallback);
    if (!mounted || requestId != _routeRequestId) return;
    setState(() {
      _path = road.length >= 2 ? road : fallback;
      _lastRoutedFrom = driver;
    });
    _fitBounds(order);
  }

  void _attachSocket() {
    final order = _order;
    if (order == null || _socketAttached) return;
    _socketAttached = true;

    _prevLocationHandler = orderSocketService.onDriverLocation;
    _prevEtaHandler = orderSocketService.onEtaUpdate;

    orderSocketService.onDriverLocation = (payload) {
      _prevLocationHandler?.call(payload);
      final current = _order;
      if (current == null || !_matchesOrder(payload, current)) return;
      final lat = _asDouble(payload['lat']);
      final lng = _asDouble(payload['lng']);
      if (lat == null || lng == null) return;
      if (!mounted) return;
      setState(() {
        _driver = LatLng(lat, lng);
        _heading = _asDouble(payload['heading']);
      });
      unawaited(_refreshPath(current));
      _fitBounds(current);
    };

    orderSocketService.onEtaUpdate = (payload) {
      _prevEtaHandler?.call(payload);
      final current = _order;
      if (current == null || !_matchesOrder(payload, current)) return;
      final mins = (payload['estimatedMinutes'] as num?)?.toInt() ??
          int.tryParse('${payload['estimatedMinutes'] ?? ''}');
      if (!mounted) return;
      setState(() {
        if (mins != null) _etaMinutes = mins;
        final state = payload['state'] as String?;
        if (state != null) _deliveryState = state;
      });
      unawaited(_refreshPath(current));
    };

    orderSocketService.trackOrder(order.id);
    orderSocketService.trackOrder(order.orderNumber);
  }

  void _detachSocket() {
    if (!_socketAttached) return;
    orderSocketService.onDriverLocation = _prevLocationHandler;
    orderSocketService.onEtaUpdate = _prevEtaHandler;
    _socketAttached = false;
  }

  void _fitBounds(Order order) {
    final points = <LatLng>[..._path];
    if (order.storeLat != null && order.storeLng != null) {
      points.add(LatLng(order.storeLat!, order.storeLng!));
    }
    if (order.deliveryLat != null && order.deliveryLng != null) {
      points.add(LatLng(order.deliveryLat!, order.deliveryLng!));
    }
    if (_driver != null) points.add(_driver!);
    if (points.isEmpty) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      try {
        if (points.length == 1) {
          _mapController.move(points.first, 15);
        } else {
          final bounds = LatLngBounds.fromPoints(points);
          _mapController.fitCamera(
            CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(56)),
          );
        }
        _didFit = true;
      } catch (_) {
        /* map not ready */
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final orderState = ref.watch(orderProvider);
    final order = _resolveOrder(orderState);
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    if (order == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Live tracking')),
        body: orderState.isLoading
            ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
            : const Center(child: Text('Order not found')),
      );
    }

    if (!_socketAttached) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _attachSocket();
      });
    }

    final destLat = order.deliveryLat;
    final destLng = order.deliveryLng;
    if (destLat == null || destLng == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Live tracking'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => context.pop(),
          ),
        ),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Delivery location is not available for this order.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final destination = LatLng(destLat, destLng);
    final store = (order.storeLat != null && order.storeLng != null)
        ? LatLng(order.storeLat!, order.storeLng!)
        : null;

    if (!_didFit) {
      _fitBounds(order);
    }

    final eta = _etaMinutes ?? order.estimatedMinutes;
    final address = [
      order.deliveryAddressLine,
      order.deliveryCity,
    ].whereType<String>().where((s) => s.trim().isNotEmpty).join(', ');

    final statusLabel = _driver == null
        ? 'Waiting for driver location…'
        : _headingToOutlet
            ? 'Driver is heading to the outlet'
            : 'Driver is on the way';

    final line = _path.length >= 2
        ? _path
        : (_driver != null ? [_driver!, _headingToOutlet && store != null ? store : destination] : <LatLng>[]);

    return Scaffold(
      backgroundColor: bc.pageBg,
      body: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: destination,
                initialZoom: 14,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'lk.bingchun.bing_chun_customer',
                ),
                if (line.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: line,
                        strokeWidth: 5,
                        color: BcColors.brand.withValues(alpha: 0.9),
                        borderStrokeWidth: 2,
                        borderColor: Colors.white.withValues(alpha: 0.85),
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    if (store != null)
                      Marker(
                        point: store,
                        width: 48,
                        height: 60,
                        alignment: Alignment.bottomCenter,
                        child: const BcLogoMapPin(size: 40),
                      ),
                    Marker(
                      point: destination,
                      width: 56,
                      height: 64,
                      alignment: Alignment.bottomCenter,
                      child: const BcCustomerCupPin(size: 48),
                    ),
                    if (_driver != null)
                      Marker(
                        point: _driver!,
                        width: 56,
                        height: 56,
                        alignment: Alignment.center,
                        child: _DriverScooterPin(size: 52, headingDegrees: _heading),
                      ),
                  ],
                ),
              ],
            ),
          ),

          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Material(
                      color: bc.cardBg,
                      elevation: 2,
                      shape: const CircleBorder(),
                      child: IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                        onPressed: () => context.pop(),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Material(
                        color: bc.cardBg,
                        elevation: 2,
                        borderRadius: BorderRadius.circular(14),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Live delivery',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                  color: onSurface,
                                ),
                              ),
                              Text(
                                '#${order.orderNumber}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: bc.mutedText,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          Positioned(
            left: 16,
            right: 16,
            bottom: 16 + MediaQuery.paddingOf(context).bottom,
            child: Material(
              color: bc.cardBg,
              elevation: 8,
              borderRadius: BorderRadius.circular(18),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: _driver != null
                                ? const Color(0xFF22C55E)
                                : BcColors.accent,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            statusLabel,
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                              color: onSurface,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: BcColors.brand.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            'ETA $eta min',
                            style: const TextStyle(
                              color: BcColors.brand,
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (address.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.location_on_outlined, size: 18, color: bc.mutedText),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              address,
                              style: TextStyle(
                                fontSize: 13,
                                color: bc.mutedText,
                                height: 1.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => _fitBounds(order),
                            icon: const Icon(Icons.my_location_rounded, size: 18),
                            label: const Text('Recenter'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: BcColors.brand,
                              side: BorderSide(color: bc.border),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: () => context.pop(),
                            icon: const Icon(Icons.receipt_long_outlined, size: 18),
                            label: const Text('Order details'),
                            style: FilledButton.styleFrom(
                              backgroundColor: BcColors.brand,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Driver GPS marker — local to this screen so hot restart always has it.
class _DriverScooterPin extends StatelessWidget {
  final double size;
  final double? headingDegrees;

  const _DriverScooterPin({this.size = 52, this.headingDegrees});

  @override
  Widget build(BuildContext context) {
    final heading = headingDegrees;
    // Icon faces right (~90°); GPS heading is clockwise from north.
    final angle = heading == null ? 0.0 : ((heading - 90) * 3.1415926535 / 180);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: BcColors.brand,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: [
          BoxShadow(
            color: BcColors.brand.withValues(alpha: 0.45),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Transform.rotate(
        angle: angle,
        child: Icon(
          Icons.delivery_dining_rounded,
          color: Colors.white,
          size: size * 0.5,
        ),
      ),
    );
  }
}
