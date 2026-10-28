import 'dart:math' as math;

import '../../core/format.dart';
import '../json.dart';
import 'delivery_job.dart';

/// Ports of DeliveryRoute.kt.

class RouteStore {
  final String id;
  final String name;
  final String addressLine;
  final String city;
  final double lat;
  final double lng;

  const RouteStore({
    required this.id,
    required this.name,
    required this.addressLine,
    required this.city,
    required this.lat,
    required this.lng,
  });

  factory RouteStore.fromJson(Json j) => RouteStore(
    id: str(j, 'id'),
    name: str(j, 'name'),
    addressLine: str(j, 'addressLine'),
    city: str(j, 'city'),
    lat: dbl(j, 'lat'),
    lng: dbl(j, 'lng'),
  );
}

class RouteStop {
  final String orderId;
  final String orderNumber;
  final String customerName;
  final String customerPhone;
  final String addressLine;
  final String city;
  final String district;
  final String status;
  final int total;
  final int itemCount;
  final double lat;
  final double lng;
  final int sequence;
  final double distanceFromPreviousKm;
  final int etaMinutesFromPrevious;

  const RouteStop({
    required this.orderId,
    required this.orderNumber,
    required this.customerName,
    required this.customerPhone,
    required this.addressLine,
    required this.city,
    required this.district,
    required this.status,
    required this.total,
    required this.itemCount,
    required this.lat,
    required this.lng,
    required this.sequence,
    required this.distanceFromPreviousKm,
    required this.etaMinutesFromPrevious,
  });

  factory RouteStop.fromJson(Json j) => RouteStop(
    orderId: str(j, 'orderId'),
    orderNumber: str(j, 'orderNumber'),
    customerName: str(j, 'customerName'),
    customerPhone: str(j, 'customerPhone'),
    addressLine: str(j, 'addressLine'),
    city: str(j, 'city'),
    district: str(j, 'district'),
    status: str(j, 'status'),
    total: intOf(j, 'total'),
    itemCount: intOf(j, 'itemCount'),
    lat: dbl(j, 'lat'),
    lng: dbl(j, 'lng'),
    sequence: intOf(j, 'sequence'),
    distanceFromPreviousKm: dbl(j, 'distanceFromPreviousKm'),
    etaMinutesFromPrevious: intOf(j, 'etaMinutesFromPrevious'),
  );

  String get fullAddress => Format.shortAddress(addressLine, city, district);

  bool get isResolved {
    final s = status.toUpperCase();
    return s == 'DELIVERED' || s == 'CANCELLED' || s == 'DELIVERY_FAILED' || s == 'FAILED';
  }
}

class RouteSummary {
  final int stopCount;
  final double totalDistanceKm;
  final int estimatedMinutes;
  final String generatedAt;

  const RouteSummary({
    required this.stopCount,
    required this.totalDistanceKm,
    required this.estimatedMinutes,
    required this.generatedAt,
  });

  factory RouteSummary.fromJson(Json j) => RouteSummary(
    stopCount: intOf(j, 'stopCount'),
    totalDistanceKm: dbl(j, 'totalDistanceKm'),
    estimatedMinutes: intOf(j, 'estimatedMinutes'),
    generatedAt: str(j, 'generatedAt'),
  );
}

class RoutePathPoint {
  final double lat;
  final double lng;

  const RoutePathPoint(this.lat, this.lng);

  factory RoutePathPoint.fromJson(Json j) => RoutePathPoint(dbl(j, 'lat'), dbl(j, 'lng'));
}

class DeliveryRoute {
  final RouteStore store;
  final List<RouteStop> stops;
  final RouteSummary summary;
  final List<RoutePathPoint> path;

  const DeliveryRoute({required this.store, this.stops = const [], required this.summary, this.path = const []});

  factory DeliveryRoute.fromJson(Json j) => DeliveryRoute(
    store: RouteStore.fromJson(objOrNull(j, 'store') ?? const {}),
    stops: listOf(j, 'stops', RouteStop.fromJson),
    summary: RouteSummary.fromJson(objOrNull(j, 'summary') ?? const {}),
    path: listOf(j, 'path', RoutePathPoint.fromJson),
  );

  List<RouteStop> get sortedStops => [...stops]..sort((a, b) => a.sequence.compareTo(b.sequence));

  /// First undelivered stop sequence, or null when every stop is done/failed.
  int? get nextStopSequence {
    for (final stop in sortedStops) {
      if (!stop.isResolved) return stop.sequence;
    }
    return null;
  }

  /// store + stops in visiting order.
  List<RoutePathPoint> get waypoints => [
    RoutePathPoint(store.lat, store.lng),
    ...stops.map((s) => RoutePathPoint(s.lat, s.lng)),
  ];
}

/// Where the rider is currently headed, if anywhere — drives live route-following.
sealed class RouteLiveTarget {
  const RouteLiveTarget();
}

class RouteLiveTargetStore extends RouteLiveTarget {
  const RouteLiveTargetStore();
}

class RouteLiveTargetStop extends RouteLiveTarget {
  final int sequence;
  const RouteLiveTargetStop(this.sequence);
}

/// `Store` covers both "heading to the branch to pick up" and "returning after the last stop".
RouteLiveTarget? liveRouteTarget(DeliveryRoute route, DeliveryJobDetail job, int? activeStopSequence) {
  if (job.needsPickup || job.isReturning) return const RouteLiveTargetStore();
  if (job.status == 'IN_PROGRESS') {
    final seq = activeStopSequence ?? route.nextStopSequence;
    return seq == null ? null : RouteLiveTargetStop(seq);
  }
  return null;
}

DeliveryRoute fallbackRouteFor(DeliveryJobDetail job) {
  final store = job.store;
  final stops = <RouteStop>[];
  for (var i = 0; i < job.orders.length; i++) {
    final order = job.orders[i];
    final lat = order.lat;
    final lng = order.lng;
    if (lat == null || lng == null) continue;
    stops.add(
      RouteStop(
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        addressLine: order.addressLine,
        city: order.city,
        district: order.district,
        status: order.status,
        total: order.total ?? 0,
        itemCount: order.itemCount,
        lat: lat,
        lng: lng,
        sequence: order.sequence > 0 ? order.sequence : i + 1,
        distanceFromPreviousKm: 0,
        etaMinutesFromPrevious: 0,
      ),
    );
  }
  return DeliveryRoute(
    store: RouteStore(
      id: store.id,
      name: store.name,
      addressLine: store.addressLine,
      city: store.city,
      lat: store.lat,
      lng: store.lng,
    ),
    stops: stops,
    summary: RouteSummary(
      stopCount: stops.length,
      totalDistanceKm: 0,
      estimatedMinutes: math.max(1, stops.length * 8),
      generatedAt: DateTime.now().toUtc().toIso8601String(),
    ),
  );
}
