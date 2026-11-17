import '../../core/format.dart';
import '../json.dart';

/// Ports of DeliveryJob.kt. Dates stay as ISO-8601 strings.

class JobStopPreview {
  final String customerName;
  final String addressLine;
  final String city;
  final String district;

  const JobStopPreview({
    required this.customerName,
    required this.addressLine,
    required this.city,
    required this.district,
  });

  factory JobStopPreview.fromJson(Json j) => JobStopPreview(
    customerName: str(j, 'customerName'),
    addressLine: str(j, 'addressLine'),
    city: str(j, 'city'),
    district: str(j, 'district'),
  );

  String get shortAddress => Format.shortAddress(addressLine, city, district);
}

class JobSummary {
  final String id;
  final String title;
  final String status;
  final String scheduledAt;
  final String? assignedAt;
  final String storeId;
  final String storeName;
  final String storeCity;
  final int orderCount;
  final bool isMine;

  /// Sum of the delivery fees the driver earns for this run.
  final int totalDeliveryFees;
  final String? rideCode;
  final int totalCups;
  final double? estimatedDistanceKm;
  final int? estimatedMinutes;

  /// First 3 stops in visiting order — a glance-level preview, not the full route.
  final List<JobStopPreview> previewStops;

  const JobSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.scheduledAt,
    this.assignedAt,
    this.storeId = '',
    required this.storeName,
    required this.storeCity,
    required this.orderCount,
    this.isMine = false,
    this.totalDeliveryFees = 0,
    this.rideCode,
    this.totalCups = 0,
    this.estimatedDistanceKm,
    this.estimatedMinutes,
    this.previewStops = const [],
  });

  factory JobSummary.fromJson(Json j) => JobSummary(
    id: str(j, 'id'),
    title: str(j, 'title'),
    status: str(j, 'status'),
    scheduledAt: str(j, 'scheduledAt'),
    assignedAt: strOrNull(j, 'assignedAt'),
    storeId: str(j, 'storeId'),
    storeName: str(j, 'storeName'),
    storeCity: str(j, 'storeCity'),
    orderCount: intOf(j, 'orderCount'),
    isMine: boolOf(j, 'isMine'),
    totalDeliveryFees: intOf(j, 'totalDeliveryFees'),
    rideCode: strOrNull(j, 'rideCode'),
    totalCups: intOf(j, 'totalCups'),
    estimatedDistanceKm: dblOrNull(j, 'estimatedDistanceKm'),
    estimatedMinutes: intOrNull(j, 'estimatedMinutes'),
    previewStops: listOf(j, 'previewStops', JobStopPreview.fromJson),
  );
}

/// Completed — or claimed-but-unfinished — run in the driver's history list.
class JobHistoryItem {
  final String id;
  final String title;
  final String status;

  /// "COMPLETED", "VEHICLE_FAILURE", "ABANDONED", or "PARTIALLY_COMPLETED" — null falls back to [status].
  final String? displayStatus;
  final String scheduledAt;
  final String? completedAt;
  final String storeName;
  final String storeCity;
  final int orderCount;
  final int deliveredCount;
  final int deliveredTotal;
  final int complaintCount;
  final String? rideCode;

  /// Why the rider cancelled — set only on runs they accepted then rejected.
  final String? cancelReason;

  /// Stops that ended in a failed attempt on this run (customer-side or breakdown).
  final int failedCount;

  /// Per-stop rows: current order status plus the latest failed attempt on this run.
  final List<JobHistoryOrder> orders;

  const JobHistoryItem({
    required this.id,
    required this.title,
    required this.status,
    this.displayStatus,
    required this.scheduledAt,
    this.completedAt,
    required this.storeName,
    required this.storeCity,
    required this.orderCount,
    required this.deliveredCount,
    this.deliveredTotal = 0,
    this.complaintCount = 0,
    this.rideCode,
    this.cancelReason,
    this.failedCount = 0,
    this.orders = const [],
  });

  factory JobHistoryItem.fromJson(Json j) => JobHistoryItem(
    id: str(j, 'id'),
    title: str(j, 'title'),
    status: str(j, 'status'),
    displayStatus: strOrNull(j, 'displayStatus'),
    scheduledAt: str(j, 'scheduledAt'),
    completedAt: strOrNull(j, 'completedAt'),
    storeName: str(j, 'storeName'),
    storeCity: str(j, 'storeCity'),
    orderCount: intOf(j, 'orderCount'),
    deliveredCount: intOf(j, 'deliveredCount'),
    deliveredTotal: intOf(j, 'deliveredTotal'),
    complaintCount: intOf(j, 'complaintCount'),
    rideCode: strOrNull(j, 'rideCode'),
    cancelReason: strOrNull(j, 'cancelReason'),
    failedCount: intOf(j, 'failedCount'),
    orders: listOf(j, 'orders', JobHistoryOrder.fromJson),
  );

  bool get isVehicleFailure => displayStatus == 'VEHICLE_FAILURE' || status == 'VEHICLE_FAILURE';

  /// Stops this rider handed over because of the breakdown (left undelivered on the run).
  List<JobHistoryOrder> get handedOverOrders => orders.where((o) => o.isVehicleFailure).toList();

  /// The note the rider sent with the breakdown report ("Type: description"), as stored on
  /// the server. Null when the run had no stops left to hand over (RETURNING) or the server
  /// only recorded its default text.
  String? get vehicleFailureNote {
    for (final o in orders) {
      final n = o.failureNote?.trim();
      if (o.isVehicleFailure && n != null && n.isNotEmpty && n != 'Vehicle failure') return n;
    }
    return null;
  }

  /// Closed by an admin (the server reports "ADMIN_CLOSED", or a CANCELLED run in history).
  bool get isAdminClosed => displayStatus == 'ADMIN_CLOSED' || status == 'ADMIN_CLOSED' || status == 'CANCELLED';

  bool get isIncomplete =>
      displayStatus == 'ABANDONED' || displayStatus == 'PARTIALLY_COMPLETED' || displayStatus == 'VEHICLE_FAILURE';
}

/// One stop on a past run (`GET delivery/jobs/history` → `orders[]`).
class JobHistoryOrder {
  final String orderId;

  /// The order's current status — after a breakdown handover this follows the new rider.
  final String status;
  final bool deliveryFailed;

  /// Latest failed attempt on this run, e.g. "VEHICLE_FAILURE" or "CUSTOMER_UNAVAILABLE".
  final String? failureOutcome;
  final String? failureNote;
  final String? failureReason;

  const JobHistoryOrder({
    required this.orderId,
    required this.status,
    this.deliveryFailed = false,
    this.failureOutcome,
    this.failureNote,
    this.failureReason,
  });

  factory JobHistoryOrder.fromJson(Json j) => JobHistoryOrder(
    orderId: str(j, 'orderId'),
    status: str(j, 'status'),
    deliveryFailed: boolOf(j, 'deliveryFailed'),
    failureOutcome: strOrNull(j, 'failureOutcome'),
    failureNote: strOrNull(j, 'failureNote'),
    failureReason: strOrNull(j, 'failureReason'),
  );

  bool get isVehicleFailure => failureOutcome == 'VEHICLE_FAILURE';

  bool get isDelivered => status == 'DELIVERED';

  /// No further delivery will happen on this order (delivered, cancelled or refunded).
  bool get isSettled => const {'DELIVERED', 'CANCELLED', 'REFUNDED', 'RETURNED'}.contains(status);

  /// Picked up by the replacement rider and on its way.
  bool get isOutForDelivery => status == 'OUT_FOR_DELIVERY';
}

/// Response of `POST delivery/jobs/vehicle-failure`.
class VehicleFailureResult {
  final String jobId;

  /// First stop that was handed over; empty when the run had none left (RETURNING).
  final String orderId;
  final bool rideReleased;

  const VehicleFailureResult({required this.jobId, required this.orderId, this.rideReleased = true});

  factory VehicleFailureResult.fromJson(Json j) => VehicleFailureResult(
    jobId: str(j, 'jobId'),
    orderId: str(j, 'orderId'),
    rideReleased: boolOf(j, 'rideReleased', true),
  );
}

/// Driver-raised complaint on an order stop.
class DriverComplaint {
  final String id;
  final String category;
  final String description;
  final String status;
  final String createdAt;
  final String? orderId;
  final String? resolvedAt;

  const DriverComplaint({
    required this.id,
    required this.category,
    required this.description,
    required this.status,
    required this.createdAt,
    this.orderId,
    this.resolvedAt,
  });

  factory DriverComplaint.fromJson(Json j) => DriverComplaint(
    id: str(j, 'id'),
    category: str(j, 'category'),
    description: str(j, 'description'),
    status: str(j, 'status'),
    createdAt: str(j, 'createdAt'),
    orderId: strOrNull(j, 'orderId'),
    resolvedAt: strOrNull(j, 'resolvedAt'),
  );
}

class JobStore {
  final String id;
  final String name;
  final String addressLine;
  final String city;
  final double lat;
  final double lng;
  final bool deliveryOtpRequired;
  final int completionRadiusM;

  /// Branch phone, for the "Call branch" button (empty when the branch has none).
  final String phone;

  const JobStore({
    required this.id,
    required this.name,
    required this.addressLine,
    required this.city,
    required this.lat,
    required this.lng,
    this.deliveryOtpRequired = false,
    this.completionRadiusM = 100,
    this.phone = '',
  });

  factory JobStore.fromJson(Json j) => JobStore(
    id: str(j, 'id'),
    name: str(j, 'name'),
    addressLine: str(j, 'addressLine'),
    city: str(j, 'city'),
    lat: dbl(j, 'lat'),
    lng: dbl(j, 'lng'),
    deliveryOtpRequired: boolOf(j, 'deliveryOtpRequired'),
    completionRadiusM: intOf(j, 'completionRadiusM', 100),
    phone: str(j, 'phone'),
  );
}

/// Set when this job's pickup point is NOT the outlet — e.g. a vehicle-failure
/// redelivery, where the new rider collects parcels from the breakdown spot.
class JobPickup {
  final double lat;
  final double lng;
  final String label;

  const JobPickup({required this.lat, required this.lng, required this.label});

  factory JobPickup.fromJson(Json j) => JobPickup(lat: dbl(j, 'lat'), lng: dbl(j, 'lng'), label: str(j, 'label'));
}

class JobOrderItem {
  final String productName;
  final int quantity;

  /// Omitted by the backend for drivers — order money stays hidden.
  final int? totalPrice;

  const JobOrderItem({required this.productName, required this.quantity, this.totalPrice});

  factory JobOrderItem.fromJson(Json j) => JobOrderItem(
    productName: str(j, 'productName'),
    quantity: intOf(j, 'quantity'),
    totalPrice: intOrNull(j, 'totalPrice'),
  );
}

class JobOrder {
  final String orderId;
  final String orderNumber;
  final int sequence;
  final String status;
  final String paymentMethod;
  final String paymentStatus;

  /// Omitted by the backend for drivers — order money stays hidden.
  final int? total;
  final int deliveryFee;
  final int estimatedMinutes;
  final String? notes;
  final String customerName;
  final String customerPhone;
  final String addressLine;
  final String city;
  final String district;
  final double? lat;
  final double? lng;
  final List<JobOrderItem> items;
  final bool deliveryFailed;

  /// Reason the rider gave when marking this order as failed.
  final String? failureReason;

  /// Latest failed attempt on this ride, e.g. "CUSTOMER_UNREACHABLE" or "VEHICLE_FAILURE".
  final String? failureOutcome;

  /// Note the rider wrote with that failed attempt ("Reason: description").
  final String? failureNote;

  /// Store/global rule: driver must enter the customer code to mark delivered.
  final bool deliveryOtpRequired;
  final List<DriverComplaint> complaints;

  const JobOrder({
    required this.orderId,
    required this.orderNumber,
    required this.sequence,
    required this.status,
    required this.paymentMethod,
    required this.paymentStatus,
    this.total,
    this.deliveryFee = 0,
    required this.estimatedMinutes,
    this.notes,
    required this.customerName,
    required this.customerPhone,
    required this.addressLine,
    required this.city,
    required this.district,
    this.lat,
    this.lng,
    this.items = const [],
    this.deliveryFailed = false,
    this.failureReason,
    this.failureOutcome,
    this.failureNote,
    this.deliveryOtpRequired = false,
    this.complaints = const [],
  });

  factory JobOrder.fromJson(Json j) => JobOrder(
    orderId: str(j, 'orderId'),
    orderNumber: str(j, 'orderNumber'),
    sequence: intOf(j, 'sequence'),
    status: str(j, 'status'),
    paymentMethod: str(j, 'paymentMethod'),
    paymentStatus: str(j, 'paymentStatus'),
    total: intOrNull(j, 'total'),
    deliveryFee: intOf(j, 'deliveryFee'),
    estimatedMinutes: intOf(j, 'estimatedMinutes'),
    notes: strOrNull(j, 'notes'),
    customerName: str(j, 'customerName'),
    customerPhone: str(j, 'customerPhone'),
    addressLine: str(j, 'addressLine'),
    city: str(j, 'city'),
    district: str(j, 'district'),
    lat: dblOrNull(j, 'lat'),
    lng: dblOrNull(j, 'lng'),
    items: listOf(j, 'items', JobOrderItem.fromJson),
    deliveryFailed: boolOf(j, 'deliveryFailed'),
    failureReason: strOrNull(j, 'failureReason'),
    failureOutcome: strOrNull(j, 'failureOutcome'),
    failureNote: strOrNull(j, 'failureNote'),
    deliveryOtpRequired: boolOf(j, 'deliveryOtpRequired'),
    complaints: listOf(j, 'complaints', DriverComplaint.fromJson),
  );

  String get fullAddress => Format.shortAddress(addressLine, city, district);

  /// Street + area only for compact cards.
  String get shortAddress => Format.shortAddress(addressLine, city, null);

  bool get isDelivered => status == 'DELIVERED';
  bool get isFailed => deliveryFailed || status == 'DELIVERY_FAILED';

  /// Untranslated heading for this stop's failure, e.g. "Customer not available".
  /// A driver-side "OTHER" outcome stays generic — the rider's own reason is in the note.
  String get failureTitle {
    final label = deliveryFailureOutcomeLabels[failureOutcome];
    if (label != null) return label;
    final reason = failureReason?.trim();
    return reason != null && reason.isNotEmpty ? reason : 'Delivery failed';
  }

  /// The rider's note for this failure, or null when the server only stored its default
  /// text (the outcome code or its label).
  String? get failureDetailNote {
    final n = failureNote?.trim();
    if (n == null || n.isEmpty) return null;
    final lower = n.toLowerCase();
    if (lower == failureOutcome?.toLowerCase() || lower == failureTitle.toLowerCase()) return null;
    return n;
  }

  bool get isCancelled => status == 'CANCELLED';
  bool get isPending => !isDelivered && status != 'CANCELLED' && !isFailed;

  /// Customer instructions to show the rider. Internal test/seed markers written by
  /// simulation scripts ("Simulated order (scripts/sim-new-job.ts)", "seed-…") are hidden.
  String? get displayNotes {
    final n = notes?.trim();
    if (n == null || n.isEmpty) return null;
    if (RegExp(r'^(simulated order|seed-)', caseSensitive: false).hasMatch(n) || n.contains('scripts/')) return null;
    return n;
  }

  int get itemCount => items.fold(0, (sum, i) => sum + i.quantity);
}

class DeliveryJobDetail {
  final String id;
  final String title;
  final String status;
  final String scheduledAt;
  final String? assignedAt;
  final String? startedAt;
  final String? returnStartedAt;
  final String? completedAt;
  final JobStore store;

  /// Non-null when pickup must happen somewhere other than the outlet.
  final JobPickup? pickup;
  final int orderCount;
  final int deliveredCount;
  final List<JobOrder> orders;
  final int totalDeliveryFees;

  /// True after the driver confirmed collecting the order at the outlet.
  final bool pickedUp;
  final String? rideCode;
  final int totalCups;
  final double? estimatedDistanceKm;
  final int? estimatedMinutes;
  final double? actualDistanceKm;
  final bool canComplete;

  /// False once the viewing driver already holds a run plus a queued-next job.
  final bool canClaimMore;

  const DeliveryJobDetail({
    required this.id,
    required this.title,
    required this.status,
    required this.scheduledAt,
    this.assignedAt,
    this.startedAt,
    this.returnStartedAt,
    this.completedAt,
    required this.store,
    this.pickup,
    required this.orderCount,
    required this.deliveredCount,
    this.orders = const [],
    this.totalDeliveryFees = 0,
    this.pickedUp = false,
    this.rideCode,
    this.totalCups = 0,
    this.estimatedDistanceKm,
    this.estimatedMinutes,
    this.actualDistanceKm,
    this.canComplete = false,
    this.canClaimMore = true,
  });

  factory DeliveryJobDetail.fromJson(Json j) {
    final pickup = objOrNull(j, 'pickup');
    return DeliveryJobDetail(
      id: str(j, 'id'),
      title: str(j, 'title'),
      status: str(j, 'status'),
      scheduledAt: str(j, 'scheduledAt'),
      assignedAt: strOrNull(j, 'assignedAt'),
      startedAt: strOrNull(j, 'startedAt'),
      returnStartedAt: strOrNull(j, 'returnStartedAt'),
      completedAt: strOrNull(j, 'completedAt'),
      store: JobStore.fromJson(objOrNull(j, 'store') ?? const {}),
      pickup: pickup == null ? null : JobPickup.fromJson(pickup),
      orderCount: intOf(j, 'orderCount'),
      deliveredCount: intOf(j, 'deliveredCount'),
      orders: listOf(j, 'orders', JobOrder.fromJson),
      totalDeliveryFees: intOf(j, 'totalDeliveryFees'),
      pickedUp: boolOf(j, 'pickedUp'),
      rideCode: strOrNull(j, 'rideCode'),
      totalCups: intOf(j, 'totalCups'),
      estimatedDistanceKm: dblOrNull(j, 'estimatedDistanceKm'),
      estimatedMinutes: intOrNull(j, 'estimatedMinutes'),
      actualDistanceKm: dblOrNull(j, 'actualDistanceKm'),
      canComplete: boolOf(j, 'canComplete'),
      canClaimMore: boolOf(j, 'canClaimMore', true),
    );
  }

  DeliveryJobDetail copyWith({List<JobOrder>? orders, int? deliveredCount, String? status}) => DeliveryJobDetail(
    id: id,
    title: title,
    status: status ?? this.status,
    scheduledAt: scheduledAt,
    assignedAt: assignedAt,
    startedAt: startedAt,
    returnStartedAt: returnStartedAt,
    completedAt: completedAt,
    store: store,
    pickup: pickup,
    orderCount: orderCount,
    deliveredCount: deliveredCount ?? this.deliveredCount,
    orders: orders ?? this.orders,
    totalDeliveryFees: totalDeliveryFees,
    pickedUp: pickedUp,
    rideCode: rideCode,
    totalCups: totalCups,
    estimatedDistanceKm: estimatedDistanceKm,
    estimatedMinutes: estimatedMinutes,
    actualDistanceKm: actualDistanceKm,
    canComplete: canComplete,
    canClaimMore: canClaimMore,
  );

  bool get canAssign => status == 'SCHEDULED' && canClaimMore;
  bool get needsPickup => status == 'ASSIGNED' && !pickedUp;
  bool get headingToStore => needsPickup;
  bool get canStart => status == 'ASSIGNED' && pickedUp;

  /// Pre-pickup reject — matches API (ASSIGNED/QUEUED, not yet picked up).
  bool get canReject => (status == 'ASSIGNED' || status == 'QUEUED') && !pickedUp;
  bool get isReturning => status == 'RETURNING';
  bool get isQueued => status == 'QUEUED';
  bool get isActive => status == 'ASSIGNED' || status == 'QUEUED' || status == 'IN_PROGRESS' || status == 'RETURNING';

  /// Finished runs opened from Delivery History. Live and scheduled jobs stay operational.
  bool get isHistorySnapshot =>
      status == 'COMPLETED' ||
      status == 'CANCELLED' ||
      status == 'ABANDONED' ||
      status == 'VEHICLE_FAILURE' ||
      status == 'PARTIALLY_COMPLETED';

  bool get allDelivered => deliveredCount == orderCount && orderCount > 0;

  /// Server sets canComplete for RETURNING; client still requires geofence locally.
  bool canCompleteAt(double? distanceM) {
    if (status != 'RETURNING' || !allDelivered) return false;
    if (distanceM == null) return false;
    return distanceM <= store.completionRadiusM;
  }

  /// Branch-radius check with no status requirement — used to gate pickup confirmation.
  bool withinBranchAt(double? distanceM) => distanceM != null && distanceM <= store.completionRadiusM;

  bool get hasPickupOverride => pickup != null;
  double get pickupNavLat => pickup?.lat ?? store.lat;
  double get pickupNavLng => pickup?.lng ?? store.lng;
  String get pickupPlaceName => pickup?.label ?? store.name;

  /// Pickup leg is always unlocked when there's an override; otherwise the
  /// usual branch-radius geofence applies.
  bool pickupUnlockedAt(double? distanceM) => hasPickupOverride || withinBranchAt(distanceM);
}

/// Headings for a failed attempt's outcome (keys of the backend's DeliveryAttemptOutcome).
/// "OTHER" is left out on purpose: the server files any reason it can't classify there,
/// so it is shown as a plain "Delivery failed" with the rider's note.
const deliveryFailureOutcomeLabels = <String, String>{
  'CUSTOMER_UNREACHABLE': 'Customer not available',
  'WRONG_ADDRESS': 'Wrong / incomplete address',
  'REFUSED': 'Customer refused delivery',
  'PAYMENT_FAILED': 'Payment issue',
  'VEHICLE_FAILURE': 'Vehicle failure',
};

/// Structured failure reason sent with DELIVERY_FAILED alongside the free-text note.
enum DeliveryOutcome {
  customerUnreachable('Customer not available', 'CUSTOMER_UNREACHABLE'),
  wrongAddress('Wrong / incomplete address', 'WRONG_ADDRESS'),
  refused('Customer refused delivery', 'REFUSED'),
  paymentFailed('Payment issue', 'PAYMENT_FAILED'),
  other('Driver error', 'OTHER');

  const DeliveryOutcome(this.label, this.apiValue);
  final String label;
  final String apiValue;
}
