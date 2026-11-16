import '../json.dart';

/// Ports of DriverProfile.kt, DriverSession.kt, DriverShift.kt and RiderStats.kt.

class StoreRef {
  final String id;
  final String name;
  final String? city;

  const StoreRef({required this.id, required this.name, this.city});

  factory StoreRef.fromJson(Json j) => StoreRef(id: str(j, 'id'), name: str(j, 'name'), city: strOrNull(j, 'city'));
}

class DriverProfile {
  final String id;
  final String name;
  final String? phone;
  final String? nicNumber;
  final String? vehicleNumber;
  final String? profilePhotoUrl;
  final String? licenseImageUrl;
  /// True when a licence file exists in admin but presign may still be pending.
  final bool hasLicenseImage;
  final String dutyStatus;
  final String? storeId;
  final StoreRef? store;
  final List<StoreRef> accessibleStores;
  final int? meritPoints;
  final String? meritStatus;
  final double? avgRating;
  final int? ratingCount;
  final String? vehicleType;
  final String? vehicleColor;
  final String? address;
  final String? disabilities;
  final String? licenseNumber;
  final int consecutiveSuccessfulDeliveries;

  /// True when new-ride alerts should ring (not actively delivering customers).
  final bool alertEligible;
  final String activeRidePhase;

  /// False once the driver already holds a run plus a queued-next job.
  final bool canClaimMore;

  /// Socket branch-pool rooms from PATCH /delivery/me/duty when GET /me is unavailable.
  final List<String> branchPoolStoreIds;

  const DriverProfile({
    required this.id,
    required this.name,
    this.phone,
    this.nicNumber,
    this.vehicleNumber,
    this.profilePhotoUrl,
    this.licenseImageUrl,
    this.hasLicenseImage = false,
    this.dutyStatus = 'OFF_DUTY',
    this.storeId,
    this.store,
    this.accessibleStores = const [],
    this.meritPoints,
    this.meritStatus,
    this.avgRating,
    this.ratingCount,
    this.vehicleType,
    this.vehicleColor,
    this.address,
    this.disabilities,
    this.licenseNumber,
    this.consecutiveSuccessfulDeliveries = 0,
    this.alertEligible = true,
    this.activeRidePhase = 'NONE',
    this.canClaimMore = true,
    this.branchPoolStoreIds = const [],
  });

  factory DriverProfile.fromJson(Json j) {
    final store = objOrNull(j, 'store');
    return DriverProfile(
      id: str(j, 'id'),
      name: str(j, 'name'),
      phone: strOrNull(j, 'phone'),
      nicNumber: strOrNull(j, 'nicNumber'),
      vehicleNumber: strOrNull(j, 'vehicleNumber'),
      profilePhotoUrl: strOrNull(j, 'profilePhotoUrl'),
      licenseImageUrl: strOrNull(j, 'licenseImageUrl'),
      hasLicenseImage: boolOf(j, 'hasLicenseImage', strOrNull(j, 'licenseImageUrl') != null),
      dutyStatus: str(j, 'dutyStatus', 'OFF_DUTY'),
      storeId: strOrNull(j, 'storeId'),
      store: store == null ? null : StoreRef.fromJson(store),
      accessibleStores: listOf(j, 'accessibleStores', StoreRef.fromJson),
      meritPoints: intOrNull(j, 'meritPoints'),
      meritStatus: strOrNull(j, 'meritStatus'),
      avgRating: dblOrNull(j, 'avgRating'),
      ratingCount: intOrNull(j, 'ratingCount'),
      vehicleType: strOrNull(j, 'vehicleType'),
      vehicleColor: strOrNull(j, 'vehicleColor'),
      address: strOrNull(j, 'address'),
      disabilities: strOrNull(j, 'disabilities'),
      licenseNumber: strOrNull(j, 'licenseNumber'),
      consecutiveSuccessfulDeliveries: intOf(j, 'consecutiveSuccessfulDeliveries'),
      alertEligible: boolOf(j, 'alertEligible', true),
      activeRidePhase: str(j, 'activeRidePhase', 'NONE'),
      canClaimMore: boolOf(j, 'canClaimMore', true),
      branchPoolStoreIds: DriverProfile.parseStringList(j, 'branchPoolStoreIds'),
    );
  }

  static List<String> parseStringList(Json j, String key) {
    final raw = j[key];
    if (raw is! List) return const [];
    return raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
  }

  bool get isOnline => dutyStatus == 'ONLINE' || dutyStatus == 'ON_DELIVERY';

  DriverProfile copyWith({
    String? dutyStatus,
    bool? alertEligible,
    String? activeRidePhase,
    bool? canClaimMore,
    List<String>? branchPoolStoreIds,
    String? licenseImageUrl,
    bool? hasLicenseImage,
  }) {
    return DriverProfile(
      id: id,
      name: name,
      phone: phone,
      nicNumber: nicNumber,
      vehicleNumber: vehicleNumber,
      profilePhotoUrl: profilePhotoUrl,
      licenseImageUrl: licenseImageUrl ?? this.licenseImageUrl,
      hasLicenseImage: hasLicenseImage ?? this.hasLicenseImage,
      dutyStatus: dutyStatus ?? this.dutyStatus,
      storeId: storeId,
      store: store,
      accessibleStores: accessibleStores,
      meritPoints: meritPoints,
      meritStatus: meritStatus,
      avgRating: avgRating,
      ratingCount: ratingCount,
      vehicleType: vehicleType,
      vehicleColor: vehicleColor,
      address: address,
      disabilities: disabilities,
      licenseNumber: licenseNumber,
      consecutiveSuccessfulDeliveries: consecutiveSuccessfulDeliveries,
      alertEligible: alertEligible ?? this.alertEligible,
      activeRidePhase: activeRidePhase ?? this.activeRidePhase,
      canClaimMore: canClaimMore ?? this.canClaimMore,
      branchPoolStoreIds: branchPoolStoreIds ?? this.branchPoolStoreIds,
    );
  }

  /// Every branch pool this rider should be joined to.
  List<String> get poolStoreIds => {
    if (storeId != null) storeId!,
    if (store != null) store!.id,
    ...accessibleStores.map((s) => s.id),
    ...branchPoolStoreIds,
  }.where((id) => id.trim().isNotEmpty).toList();
}

class BranchOption {
  final String id;
  final String name;
  final String? city;

  /// Street address, phone and open state — shown on the branch cards.
  final String? addressLine;
  final String? phone;
  final bool isActive;

  const BranchOption({
    required this.id,
    required this.name,
    this.city,
    this.addressLine,
    this.phone,
    this.isActive = true,
  });

  factory BranchOption.fromJson(Json j) => BranchOption(
    id: str(j, 'id'),
    name: str(j, 'name'),
    city: strOrNull(j, 'city'),
    addressLine: strOrNull(j, 'addressLine'),
    phone: strOrNull(j, 'phone'),
    isActive: boolOf(j, 'isActive', true),
  );
}

/// Rider's own add/change/remove-branch request (super-admin review).
class DriverBranchRequest {
  final String id;
  final String type;
  final String toStoreId;
  final String? toStoreName;
  final String? fromStoreName;
  final String status;
  final String? reason;
  final String? reviewNote;
  final String? reviewedAt;
  final String? createdAt;

  const DriverBranchRequest({
    required this.id,
    required this.type,
    required this.toStoreId,
    this.toStoreName,
    this.fromStoreName,
    this.status = 'PENDING',
    this.reason,
    this.reviewNote,
    this.reviewedAt,
    this.createdAt,
  });

  factory DriverBranchRequest.fromJson(Json j) => DriverBranchRequest(
    id: str(j, 'id'),
    type: str(j, 'type'),
    toStoreId: str(j, 'toStoreId'),
    toStoreName: strOrNull(j, 'toStoreName'),
    fromStoreName: strOrNull(j, 'fromStoreName'),
    status: str(j, 'status', 'PENDING'),
    reason: strOrNull(j, 'reason'),
    reviewNote: strOrNull(j, 'reviewNote'),
    reviewedAt: strOrNull(j, 'reviewedAt'),
    createdAt: strOrNull(j, 'createdAt'),
  );
}

class DriverSession {
  final String id;
  final String name;
  final String role;
  final String? storeId;
  final String? storeName;
  final String? storeCity;

  const DriverSession({
    required this.id,
    required this.name,
    required this.role,
    this.storeId,
    this.storeName,
    this.storeCity,
  });

  factory DriverSession.fromJson(Json j) => DriverSession(
    id: str(j, 'id'),
    name: str(j, 'name'),
    role: str(j, 'role'),
    storeId: strOrNull(j, 'storeId'),
    storeName: strOrNull(j, 'storeName'),
    storeCity: strOrNull(j, 'storeCity'),
  );

  Json toJson() => compact({
    'id': id,
    'name': name,
    'role': role,
    'storeId': storeId,
    'storeName': storeName,
    'storeCity': storeCity,
  });
}

/// A single duty on/off period. [endedAt] is null while the driver is still on duty.
class DriverShiftEntry {
  final String id;
  final String storeId;
  final String startedAt;
  final String? endedAt;
  final int durationMinutes;

  const DriverShiftEntry({
    required this.id,
    required this.storeId,
    required this.startedAt,
    this.endedAt,
    this.durationMinutes = 0,
  });

  factory DriverShiftEntry.fromJson(Json j) => DriverShiftEntry(
    id: str(j, 'id'),
    storeId: str(j, 'storeId'),
    startedAt: str(j, 'startedAt'),
    endedAt: strOrNull(j, 'endedAt'),
    durationMinutes: intOf(j, 'durationMinutes'),
  );
}

// ---------------- Rider stats (GET /delivery/me/stats) ----------------

class RiderStatsTotals {
  final int completedRuns;
  final int deliveredStops;
  final double totalDistanceKm;

  /// Sum of delivery fees on delivered stops — same basis as the History tab total.
  final int earningsLkr;
  final int onlineMinutes;
  final int attendanceDays;
  final int? averagePickupMinutes;
  final int? averageDeliveryMinutes;

  const RiderStatsTotals({
    this.completedRuns = 0,
    this.deliveredStops = 0,
    this.totalDistanceKm = 0,
    this.earningsLkr = 0,
    this.onlineMinutes = 0,
    this.attendanceDays = 0,
    this.averagePickupMinutes,
    this.averageDeliveryMinutes,
  });

  factory RiderStatsTotals.fromJson(Json j) => RiderStatsTotals(
    completedRuns: intOf(j, 'completedRuns'),
    deliveredStops: intOf(j, 'deliveredStops'),
    totalDistanceKm: dbl(j, 'totalDistanceKm'),
    earningsLkr: intOf(j, 'earningsLkr'),
    onlineMinutes: intOf(j, 'onlineMinutes'),
    attendanceDays: intOf(j, 'attendanceDays'),
    averagePickupMinutes: intOrNull(j, 'averagePickupMinutes'),
    averageDeliveryMinutes: intOrNull(j, 'averageDeliveryMinutes'),
  );
}

class RiderRatingItem {
  final String id;
  final String? orderNumber;
  final int stars;
  final String? comment;
  final String? createdAt;

  const RiderRatingItem({required this.id, this.orderNumber, this.stars = 0, this.comment, this.createdAt});

  factory RiderRatingItem.fromJson(Json j) => RiderRatingItem(
    id: str(j, 'id'),
    orderNumber: strOrNull(j, 'orderNumber'),
    stars: intOf(j, 'stars'),
    comment: strOrNull(j, 'comment'),
    createdAt: strOrNull(j, 'createdAt'),
  );
}

class RiderRatingSummary {
  final double? average;
  final int count;
  final List<RiderRatingItem> recent;

  const RiderRatingSummary({this.average, this.count = 0, this.recent = const []});

  factory RiderRatingSummary.fromJson(Json j) => RiderRatingSummary(
    average: dblOrNull(j, 'average'),
    count: intOf(j, 'count'),
    recent: listOf(j, 'recent', RiderRatingItem.fromJson),
  );
}

class RiderRatingsResponse {
  final double? average;
  final int count;
  final List<RiderRatingItem> ratings;

  const RiderRatingsResponse({this.average, this.count = 0, this.ratings = const []});

  factory RiderRatingsResponse.fromJson(Json j) => RiderRatingsResponse(
    average: dblOrNull(j, 'average'),
    count: intOf(j, 'count'),
    ratings: listOf(j, 'ratings', RiderRatingItem.fromJson),
  );
}

class RiderMeritItem {
  final String id;
  final int changedPoints;
  final int newPoints;
  final String reason;
  final String eventType;
  final String? createdAt;

  const RiderMeritItem({
    required this.id,
    this.changedPoints = 0,
    this.newPoints = 0,
    this.reason = '',
    this.eventType = '',
    this.createdAt,
  });

  factory RiderMeritItem.fromJson(Json j) => RiderMeritItem(
    id: str(j, 'id'),
    changedPoints: intOf(j, 'changedPoints'),
    newPoints: intOf(j, 'newPoints'),
    reason: str(j, 'reason'),
    eventType: str(j, 'eventType'),
    createdAt: strOrNull(j, 'createdAt'),
  );
}

class RiderMeritSummary {
  final int points;
  final String status;
  final List<RiderMeritItem> recent;

  const RiderMeritSummary({this.points = 0, this.status = '', this.recent = const []});

  factory RiderMeritSummary.fromJson(Json j) => RiderMeritSummary(
    points: intOf(j, 'points'),
    status: str(j, 'status'),
    recent: listOf(j, 'recent', RiderMeritItem.fromJson),
  );
}

/// Offer outcomes for a stats period, counted by the server (missed offers aren't tracked there).
class RiderOfferStats {
  final int accepted;
  final int declined;
  final int missed;

  const RiderOfferStats({this.accepted = 0, this.declined = 0, this.missed = 0});

  factory RiderOfferStats.fromJson(Json j) =>
      RiderOfferStats(accepted: intOf(j, 'accepted'), declined: intOf(j, 'declined'), missed: intOf(j, 'missed'));
}

class RiderStats {
  final String periodKey;
  final RiderStatsTotals totals;
  final RiderRatingSummary rating;
  final RiderMeritSummary merit;

  /// Null when talking to an older backend without offer counts.
  final RiderOfferStats? offers;

  const RiderStats({
    this.periodKey = '7d',
    this.totals = const RiderStatsTotals(),
    this.rating = const RiderRatingSummary(),
    this.merit = const RiderMeritSummary(),
    this.offers,
  });

  factory RiderStats.fromJson(Json j) => RiderStats(
    periodKey: str(objOrNull(j, 'period') ?? const {}, 'key', '7d'),
    totals: RiderStatsTotals.fromJson(objOrNull(j, 'totals') ?? const {}),
    rating: RiderRatingSummary.fromJson(objOrNull(j, 'rating') ?? const {}),
    merit: RiderMeritSummary.fromJson(objOrNull(j, 'merit') ?? const {}),
    offers: objOrNull(j, 'offers') == null ? null : RiderOfferStats.fromJson(objOrNull(j, 'offers')!),
  );

  /// True when the window holds nothing worth charting — drives the empty state.
  bool get isEmpty =>
      totals.completedRuns == 0 && totals.deliveredStops == 0 && totals.onlineMinutes == 0 && rating.count == 0;
}
