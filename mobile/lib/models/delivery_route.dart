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

  factory RouteStore.fromJson(Map<String, dynamic> json) {
    return RouteStore(
      id: json['id'] as String,
      name: json['name'] as String,
      addressLine: json['addressLine'] as String,
      city: json['city'] as String,
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
    );
  }
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

  factory RouteStop.fromJson(Map<String, dynamic> json) {
    return RouteStop(
      orderId: json['orderId'] as String,
      orderNumber: json['orderNumber'] as String,
      customerName: json['customerName'] as String,
      customerPhone: json['customerPhone'] as String,
      addressLine: json['addressLine'] as String,
      city: json['city'] as String,
      district: json['district'] as String,
      status: json['status'] as String,
      total: json['total'] as int,
      itemCount: json['itemCount'] as int,
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      sequence: json['sequence'] as int,
      distanceFromPreviousKm: (json['distanceFromPreviousKm'] as num).toDouble(),
      etaMinutesFromPrevious: json['etaMinutesFromPrevious'] as int,
    );
  }

  String get fullAddress {
    final parts = [addressLine, city, district].where((p) => p.isNotEmpty);
    return parts.join(', ');
  }
}

class RouteSummary {
  final int stopCount;
  final double totalDistanceKm;
  final int estimatedMinutes;
  final DateTime generatedAt;

  const RouteSummary({
    required this.stopCount,
    required this.totalDistanceKm,
    required this.estimatedMinutes,
    required this.generatedAt,
  });

  factory RouteSummary.fromJson(Map<String, dynamic> json) {
    return RouteSummary(
      stopCount: json['stopCount'] as int,
      totalDistanceKm: (json['totalDistanceKm'] as num).toDouble(),
      estimatedMinutes: json['estimatedMinutes'] as int,
      generatedAt: DateTime.parse(json['generatedAt'] as String),
    );
  }
}

class DeliveryRoute {
  final RouteStore store;
  final List<RouteStop> stops;
  final RouteSummary summary;
  final List<RoutePathPoint> path;

  const DeliveryRoute({
    required this.store,
    required this.stops,
    required this.summary,
    this.path = const [],
  });

  List<RoutePathPoint> get waypoints => [
        RoutePathPoint(lat: store.lat, lng: store.lng),
        ...stops.map((s) => RoutePathPoint(lat: s.lat, lng: s.lng)),
      ];

  factory DeliveryRoute.fromJson(Map<String, dynamic> json) {
    return DeliveryRoute(
      store: RouteStore.fromJson(json['store'] as Map<String, dynamic>),
      stops: (json['stops'] as List<dynamic>)
          .map((e) => RouteStop.fromJson(e as Map<String, dynamic>))
          .toList(),
      summary: RouteSummary.fromJson(json['summary'] as Map<String, dynamic>),
      path: json['path'] != null
          ? (json['path'] as List<dynamic>)
              .map((e) => RoutePathPoint.fromJson(e as Map<String, dynamic>))
              .toList()
          : const [],
    );
  }
}

class RoutePathPoint {
  final double lat;
  final double lng;

  const RoutePathPoint({required this.lat, required this.lng});

  factory RoutePathPoint.fromJson(Map<String, dynamic> json) {
    return RoutePathPoint(
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
    );
  }
}
