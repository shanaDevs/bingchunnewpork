// Delivery jobs, routes and live riders from `/admin/delivery-jobs*` and
// `/admin/live-drivers` — field names follow the web types
// (AdminDeliveryJobsTable, AdminDeliveryJobDrawer, lib/deliveryRoute.ts, live page).

class GeoPoint {
  const GeoPoint(this.lat, this.lng);
  final double lat;
  final double lng;

  bool get isValid => lat.isFinite && lng.isFinite && lat.abs() <= 90 && lng.abs() <= 180 && !(lat == 0 && lng == 0);
}

/// Row in the Active / Complete / Incomplete job lists.
class DeliveryJob {
  const DeliveryJob({
    required this.id,
    required this.title,
    required this.status,
    required this.orderCount,
    required this.scheduledAt,
    this.rideCode,
    this.deliveredCount = 0,
    this.totalCups,
    this.totalRevenue,
    this.distanceKm,
    this.estimatedMinutes,
    this.actualDistanceKm,
    this.actualMinutes,
    this.hasActualRoute = false,
    this.displayStatus,
    this.completedAt,
    this.storeId,
    this.storeName,
    this.driverId,
    this.driverName,
    this.createdAt,
  });

  final String id;
  final String? rideCode;
  final String title;

  /// SCHEDULED | ASSIGNED | QUEUED | IN_PROGRESS | RETURNING | COMPLETED | CANCELLED | VEHICLE_FAILURE
  final String status;

  /// Past-due sub-status (MISSED / ABANDONED / PARTIALLY_COMPLETED / CANCELLED).
  final String? displayStatus;
  final int orderCount;
  final int deliveredCount;
  final int? totalCups;
  final double? totalRevenue;
  final double? distanceKm;
  final int? estimatedMinutes;
  final double? actualDistanceKm;
  final int? actualMinutes;
  final bool hasActualRoute;
  final DateTime scheduledAt;
  final DateTime? completedAt;
  final String? storeId;
  final String? storeName;
  final String? driverId;
  final String? driverName;

  /// When the job was published — Re-ring unlocks 30 s after this.
  final DateTime? createdAt;

  String get effectiveStatus => displayStatus ?? status;
}

class DeliveryStopItem {
  const DeliveryStopItem({required this.productName, required this.quantity, this.totalPrice, this.imageUrl});
  final String productName;
  final int quantity;
  final double? totalPrice;
  final String? imageUrl;
}

/// One customer stop on a run (job drawer "Orders" timeline).
class DeliveryStop {
  const DeliveryStop({
    required this.orderId,
    required this.orderNumber,
    required this.sequence,
    required this.status,
    required this.customerName,
    required this.customerPhone,
    required this.addressLine,
    required this.city,
    required this.deliveryState,
    this.location,
    this.total,
    this.paymentMethod,
    this.paymentStatus,
    this.items = const [],
    this.terminalEventAt,
    this.cancelReason,
    this.failureOutcome,
    this.failureNote,
  });

  final String orderId;
  final String orderNumber;
  final int sequence;
  final String status;
  final String customerName;
  final String customerPhone;
  final String addressLine;
  final String city;
  final GeoPoint? location;
  final double? total;
  final String? paymentMethod;
  final String? paymentStatus;
  final List<DeliveryStopItem> items;

  /// Delivered | Failed | Pending
  final String deliveryState;
  final DateTime? terminalEventAt;
  final String? cancelReason;
  final String? failureOutcome;
  final String? failureNote;
}

class DeliveryJobDetail {
  const DeliveryJobDetail({
    required this.id,
    required this.title,
    required this.status,
    required this.scheduledAt,
    required this.storeId,
    required this.storeName,
    required this.storeAddress,
    required this.storeLocation,
    required this.orderCount,
    required this.deliveredCount,
    required this.returningToBranch,
    required this.pickedUp,
    required this.stops,
    this.assignedAt,
    this.startedAt,
    this.returnStartedAt,
    this.completedAt,
    this.totalDistanceKm,
    this.driverName,
    this.vehicleFailure,
    this.pickupLabel,
    this.pickupLocation,
  });

  final String id;
  final String title;
  final String status;
  final DateTime scheduledAt;
  final DateTime? assignedAt;
  final DateTime? startedAt;
  final DateTime? returnStartedAt;
  final DateTime? completedAt;
  final double? totalDistanceKm;
  final String storeId;
  final String storeName;
  final String storeAddress;
  final GeoPoint storeLocation;
  final String? driverName;
  final int orderCount;
  final int deliveredCount;
  final bool returningToBranch;
  final bool pickedUp;
  final List<DeliveryStop> stops;
  final GeoPoint? vehicleFailure;

  /// Set when the run starts from a breakdown spot instead of the branch.
  final String? pickupLabel;
  final GeoPoint? pickupLocation;
}

class RouteStop {
  const RouteStop({
    required this.orderNumber,
    required this.customerName,
    required this.location,
    required this.sequence,
    this.orderId,
    this.addressLine,
    this.city,
    this.district,
    this.itemCount,
    this.distanceFromPreviousKm,
    this.etaMinutesFromPrevious,
    this.status,
  });

  final String? orderId;
  final String orderNumber;
  final String customerName;
  final GeoPoint location;
  final int sequence;
  final String? addressLine;
  final String? city;
  final String? district;
  final int? itemCount;
  final double? distanceFromPreviousKm;
  final int? etaMinutesFromPrevious;
  final String? status;
}

/// Planned route (`/route`) — road path plus ordered stops.
class DeliveryRoute {
  const DeliveryRoute({
    required this.startName,
    required this.start,
    required this.stops,
    required this.path,
    required this.totalDistanceKm,
    required this.estimatedMinutes,
    this.startAddress,
  });

  final String startName;
  final String? startAddress;
  final GeoPoint start;
  final List<RouteStop> stops;
  final List<GeoPoint> path;
  final double totalDistanceKm;
  final int estimatedMinutes;
}

/// GPS trail the rider actually drove (`/actual-route`).
class ActualRoute {
  const ActualRoute({
    required this.start,
    required this.startName,
    required this.path,
    required this.stops,
    this.estimatedDistanceKm,
    this.estimatedMinutes,
    this.actualDistanceKm,
    this.actualMinutes,
  });

  final GeoPoint start;
  final String startName;
  final List<GeoPoint> path;
  final List<({String orderNumber, GeoPoint location})> stops;
  final double? estimatedDistanceKm;
  final int? estimatedMinutes;
  final double? actualDistanceKm;
  final int? actualMinutes;
}

/// Rider on the Live Drivers map.
class LiveDriver {
  const LiveDriver({
    required this.driverId,
    required this.name,
    required this.dutyStatus,
    this.storeName,
    this.location,
    this.heading,
    this.updatedAt,
    this.jobId,
    this.trail = const [],
  });

  final String driverId;
  final String name;

  /// ON_DUTY | OFF_DUTY | ON_RUN ...
  final String dutyStatus;
  final String? storeName;
  final GeoPoint? location;
  final double? heading;
  final DateTime? updatedAt;
  final String? jobId;
  final List<GeoPoint> trail;

  /// Trail points kept per rider (web LIVE_PATH_LIMIT-style cap).
  static const maxTrail = 120;

  LiveDriver moved(GeoPoint p, {double? heading, DateTime? at, String? jobId}) {
    final next = [...trail, p];
    return LiveDriver(
      driverId: driverId,
      name: name,
      dutyStatus: dutyStatus,
      storeName: storeName,
      location: p,
      heading: heading ?? this.heading,
      updatedAt: at ?? updatedAt,
      jobId: jobId ?? this.jobId,
      trail: next.length > maxTrail ? next.sublist(next.length - maxTrail) : next,
    );
  }
}

/// Live `driverLocation` socket event.
class DriverPing {
  const DriverPing({required this.location, this.driverId, this.jobId, this.heading, this.at});
  final String? driverId;
  final String? jobId;
  final GeoPoint location;
  final double? heading;
  final DateTime? at;
}

class DriverOption {
  const DriverOption({required this.id, required this.name});
  final String id;
  final String name;
}

/// READY delivery order waiting to be grouped into a run
/// (`/admin/delivery/pending-orders`, web AdminDeliveryClassificationTable).
class PendingDeliveryOrder {
  const PendingDeliveryOrder({
    required this.orderId,
    required this.orderNumber,
    required this.customerName,
    required this.customerPhone,
    required this.addressLine,
    required this.city,
    required this.district,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.items,
    this.createdAt,
    this.location,
  });

  final String orderId;
  final String orderNumber;
  final DateTime? createdAt;
  final String customerName;
  final String customerPhone;
  final String addressLine;
  final String city;
  final String district;
  final String paymentMethod;
  final String paymentStatus;
  final GeoPoint? location;
  final List<DeliveryStopItem> items;
}

/// One suggested run from `/admin/delivery/classify`.
class DeliveryCluster {
  const DeliveryCluster({
    required this.id,
    required this.label,
    required this.orderIds,
    required this.stops,
    this.route,
  });
  final String id;
  final String label;
  final List<String> orderIds;

  /// Stops in route order (the preview's when present, else the cluster's).
  final List<ClusterStop> stops;

  /// Ready-made road route; when missing the app asks `/preview-route`.
  final DeliveryRoute? route;

  int get totalCups => stops.fold(0, (n, s) => n + s.itemCount);
}

class ClusterStop {
  const ClusterStop({
    required this.orderNumber,
    required this.customerName,
    required this.itemCount,
    required this.sequence,
    this.addressLine,
    this.city,
    this.district,
    this.location,
    this.paymentMethod,
    this.paymentStatus,
  });
  final String orderNumber;
  final String customerName;
  final int itemCount;
  final int sequence;
  final String? addressLine;
  final String? city;
  final String? district;
  final GeoPoint? location;
  final String? paymentMethod;
  final String? paymentStatus;
}

/// `/admin/delivery/classify` result.
class ClassifyResult {
  const ClassifyResult({
    required this.clusters,
    required this.mode,
    required this.totalCups,
    required this.maxCupsPerRider,
    this.store,
  });
  final List<DeliveryCluster> clusters;

  /// `manual` (under 10 cups, one list) or `directional` (split by compass direction).
  final String mode;
  final int totalCups;
  final int maxCupsPerRider;
  final ({String name, String? address, GeoPoint location})? store;

  ClassifyResult without(String clusterId) => ClassifyResult(
    clusters: clusters.where((c) => c.id != clusterId).toList(),
    mode: mode,
    totalCups: totalCups,
    maxCupsPerRider: maxCupsPerRider,
    store: store,
  );
}
