import '../json.dart';

/// `GET delivery/jobs/:id/handover` — Breakdown & Handover status for the rider whose vehicle
/// broke down on that ride: the replacement rider admin assigned, their live position while
/// on the way, the handed-over orders and a timeline (docs/driver-breakdown-handover-api.md).
///
/// Backend shape (packages/delivery-domain/src/jobHandover.ts): `stage` in lowercase,
/// `breakdownSpot`, a single `replacement`, orders with `cupCount`, and `events[]` with
/// `kind` oldest first. Parsed into the app's model; older field names still read.
class BreakdownHandover {
  final String jobId;
  final String? rideCode;
  final String title;
  final String? storeName;

  /// ISO time of the report (the `breakdown_reported` event); empty when not sent.
  final String reportedAt;

  /// The rider's report note ("Type: description"); not sent by the backend today.
  final String? note;
  final HandoverPoint? breakdownPoint;

  /// FINDING_RIDER, HANDOVER or DONE.
  final String stage;
  final List<HandoverRider> replacements;
  final List<HandoverOrder> orders;
  final int handedOverCount;
  final int totalCount;

  /// Newest first. Types: REPORTED, RIDER_ASSIGNED, ORDERS_COLLECTED (others pass through).
  final List<HandoverEvent> events;

  const BreakdownHandover({
    required this.jobId,
    this.rideCode,
    this.title = '',
    this.storeName,
    this.reportedAt = '',
    this.note,
    this.breakdownPoint,
    required this.stage,
    this.replacements = const [],
    this.orders = const [],
    this.handedOverCount = 0,
    this.totalCount = 0,
    this.events = const [],
  });

  factory BreakdownHandover.fromJson(Json j, {DateTime? now}) {
    final point = objOrNull(j, 'breakdownSpot') ?? objOrNull(j, 'breakdownPoint');

    final events = listOf(j, 'events', HandoverEvent.fromJson)
      ..sort((a, b) => (DateTime.tryParse(b.at) ?? DateTime(0)).compareTo(DateTime.tryParse(a.at) ?? DateTime(0)));
    String? eventAt(String type) {
      for (final e in events) {
        if (e.type == type) return e.at;
      }
      return null;
    }

    final collectedAt = eventAt('ORDERS_COLLECTED');
    final single = objOrNull(j, 'replacement');
    final riders = single != null
        ? [HandoverRider.fromJson(single, collectedAt: collectedAt, now: now)]
        : listOf(j, 'replacements', (r) => HandoverRider.fromJson(r, collectedAt: collectedAt, now: now));
    final collected = riders.any((r) => r.collected);

    final orders = listOf(j, 'orders', (o) => HandoverOrder.fromJson(o, collectedByReplacement: collected));
    final handed = orders.where((o) => o.handedOver).length;

    return BreakdownHandover(
      jobId: str(j, 'jobId'),
      rideCode: strOrNull(j, 'rideCode'),
      title: str(j, 'title'),
      storeName: strOrNull(j, 'storeName'),
      reportedAt: strOrNull(j, 'reportedAt') ?? eventAt('REPORTED') ?? '',
      note: strOrNull(j, 'note'),
      breakdownPoint: point == null ? null : HandoverPoint.fromJson(point),
      stage: str(j, 'stage', 'finding_rider').toUpperCase(),
      replacements: riders,
      orders: orders,
      handedOverCount: intOrNull(j, 'handedOverCount') ?? handed,
      totalCount: intOrNull(j, 'totalCount') ?? orders.length,
      events: events,
    );
  }

  bool get isFindingRider => stage == 'FINDING_RIDER';
  bool get isHandover => stage == 'HANDOVER';
  bool get isDone => stage == 'DONE';
}

class HandoverPoint {
  final double lat;
  final double lng;

  const HandoverPoint({required this.lat, required this.lng});

  factory HandoverPoint.fromJson(Json j) => HandoverPoint(lat: dbl(j, 'lat'), lng: dbl(j, 'lng'));
}

/// A replacement rider's GPS older than this is not shown as live (the backend sends the
/// last known point however old it is).
const handoverLocationMaxAge = Duration(minutes: 15);

/// Replacement rider (driver 2) taking over the handed-over orders.
class HandoverRider {
  final String driverId;
  final String name;

  /// Null once they collected the orders (no longer needed).
  final String? phone;
  final String? photoUrl;
  final String? vehicleType;
  final String? vehicleNumber;
  final double? rating;
  final int ratingCount;
  final String jobId;
  final String? rideCode;
  final String jobStatus;
  final bool accepted;
  final bool collected;
  final String? collectedAt;

  /// Live position — only while they are still on the way and the ping is fresh.
  final HandoverRiderLocation? location;
  final double? distanceKm;
  final int? etaMinutes;

  const HandoverRider({
    required this.driverId,
    required this.name,
    this.phone,
    this.photoUrl,
    this.vehicleType,
    this.vehicleNumber,
    this.rating,
    this.ratingCount = 0,
    required this.jobId,
    this.rideCode,
    required this.jobStatus,
    this.accepted = false,
    this.collected = false,
    this.collectedAt,
    this.location,
    this.distanceKm,
    this.etaMinutes,
  });

  factory HandoverRider.fromJson(Json j, {String? collectedAt, DateTime? now}) {
    final loc = objOrNull(j, 'location');
    var location = loc == null ? null : HandoverRiderLocation.fromJson(loc);
    // Drop a stale ping: an old point (and the distance/ETA worked out from it) would
    // show the rider somewhere they no longer are.
    final at = location == null ? null : DateTime.tryParse(location.recordedAt);
    if (at != null && (now ?? DateTime.now()).toUtc().difference(at.toUtc()) > handoverLocationMaxAge) {
      location = null;
    }
    final collected = boolOf(j, 'collected');
    return HandoverRider(
      driverId: str(j, 'driverId'),
      name: str(j, 'name'),
      phone: strOrNull(j, 'phone'),
      photoUrl: strOrNull(j, 'profilePhotoUrl') ?? strOrNull(j, 'photoUrl'),
      vehicleType: strOrNull(j, 'vehicleType'),
      vehicleNumber: strOrNull(j, 'vehicleNumber'),
      rating: dblOrNull(j, 'averageRating') ?? dblOrNull(j, 'rating'),
      ratingCount: intOf(j, 'ratingCount'),
      jobId: str(j, 'jobId'),
      rideCode: strOrNull(j, 'rideCode'),
      jobStatus: str(j, 'jobStatus'),
      accepted: boolOf(j, 'accepted'),
      collected: collected,
      collectedAt: strOrNull(j, 'collectedAt') ?? (collected ? collectedAt : null),
      location: location,
      distanceKm: location == null ? null : dblOrNull(j, 'distanceKm'),
      etaMinutes: location == null ? null : intOrNull(j, 'etaMinutes'),
    );
  }

  /// "Bajaj Pulsar 150 · WP BHT-4521" (whatever parts are set).
  String? get vehicleLabel {
    final parts = [vehicleType, vehicleNumber].whereType<String>().where((s) => s.trim().isNotEmpty);
    return parts.isEmpty ? null : parts.join(' · ');
  }

  String get initials {
    final words = name.trim().split(' ').where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return '?';
    if (words.length == 1) return words.first.substring(0, 1).toUpperCase();
    return '${words.first[0]}${words.last[0]}'.toUpperCase();
  }
}

class HandoverRiderLocation {
  final double lat;
  final double lng;
  final double? heading;
  final String recordedAt;

  const HandoverRiderLocation({required this.lat, required this.lng, this.heading, required this.recordedAt});

  factory HandoverRiderLocation.fromJson(Json j) => HandoverRiderLocation(
    lat: dbl(j, 'lat'),
    lng: dbl(j, 'lng'),
    heading: dblOrNull(j, 'heading'),
    recordedAt: str(j, 'recordedAt'),
  );
}

class HandoverOrder {
  final String orderId;
  final String orderNumber;
  final String status;
  final String? area;
  final int itemCount;
  final bool handedOver;
  final String? deliveredAt;

  const HandoverOrder({
    required this.orderId,
    required this.orderNumber,
    required this.status,
    this.area,
    this.itemCount = 0,
    this.handedOver = false,
    this.deliveredAt,
  });

  /// [collectedByReplacement]: the replacement rider picked the orders up from the
  /// breakdown spot — the backend has no per-order flag, so every order counts as handed
  /// over then (and delivered/cancelled ones already are).
  factory HandoverOrder.fromJson(Json j, {bool collectedByReplacement = false}) {
    final status = str(j, 'status');
    final settled = const {'DELIVERED', 'CANCELLED', 'REFUNDED', 'RETURNED'}.contains(status);
    return HandoverOrder(
      orderId: str(j, 'orderId'),
      orderNumber: str(j, 'orderNumber'),
      status: status,
      area: strOrNull(j, 'area'),
      itemCount: intOrNull(j, 'cupCount') ?? intOf(j, 'itemCount'),
      handedOver: j.containsKey('handedOver') ? boolOf(j, 'handedOver') : (collectedByReplacement || settled),
      deliveredAt: strOrNull(j, 'deliveredAt'),
    );
  }

  bool get isDelivered => status == 'DELIVERED';
  bool get isCancelled => status == 'CANCELLED' || status == 'REFUNDED';
}

/// One timeline step. [type] is normalised from the backend's `kind`:
/// `breakdown_reported` → REPORTED, `rider_assigned` → RIDER_ASSIGNED,
/// `orders_collected` → ORDERS_COLLECTED; anything else is upper-cased.
class HandoverEvent {
  final String type;
  final String at;

  /// The backend's English label, shown for kinds the app has no wording for.
  final String? label;
  final String? riderName;
  final String? orderNumber;

  const HandoverEvent({required this.type, required this.at, this.label, this.riderName, this.orderNumber});

  static const _kinds = {
    'breakdown_reported': 'REPORTED',
    'rider_assigned': 'RIDER_ASSIGNED',
    'orders_collected': 'ORDERS_COLLECTED',
  };

  factory HandoverEvent.fromJson(Json j) {
    final kind = strOrNull(j, 'kind');
    return HandoverEvent(
      type: kind != null ? (_kinds[kind] ?? kind.toUpperCase()) : str(j, 'type'),
      at: str(j, 'at'),
      label: strOrNull(j, 'label'),
      riderName: strOrNull(j, 'riderName'),
      orderNumber: strOrNull(j, 'orderNumber'),
    );
  }
}
