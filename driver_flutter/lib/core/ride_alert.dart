import 'dart:math' as math;

import '../data/json.dart';
import '../data/models/delivery_job.dart';
import 'format.dart';
import '../l10n/l10n.dart';

/// Rich ride alert payload shared by FCM, socket, and the full-screen incoming UI.
/// Port of RideAlert.kt.
class RideAlert {
  final String jobId;
  final String? rideCode;
  final String title;
  final String storeId;
  final String storeName;
  final String storeCity;
  final int orderCount;
  final int totalCups;
  final double? estimatedDistanceKm;
  final int? estimatedMinutes;
  final int deliveryFee;
  final String dropoffName;
  final String dropoffAddress;
  final int extraStopCount;


  const RideAlert({
    required this.jobId,
    this.rideCode,
    this.title = 'Delivery run',
    this.storeId = '',
    this.storeName = '',
    this.storeCity = '',
    this.orderCount = 0,
    this.totalCups = 0,
    this.estimatedDistanceKm,
    this.estimatedMinutes,
    this.deliveryFee = 0,
    this.dropoffName = '',
    this.dropoffAddress = '',
    this.extraStopCount = 0,
  });

  String get displayRideId => Format.displayRideId(rideCode, jobId);

  String get notificationTitle => deliveryFee > 0
      ? tr('New delivery · {fee}', {'fee': Format.money(deliveryFee)})
      : tr('New delivery — tap to accept');

  /// "3 orders · 3 cups · 3.3 km · 9 min" — whichever facts are known.
  String get _facts => [
    if (orderCount > 0) trn(orderCount, '{n} order', '{n} orders'),
    if (totalCups > 0) trn(totalCups, '{n} cup', '{n} cups'),
    if (estimatedDistanceKm != null) Format.km(estimatedDistanceKm!),
    if (estimatedMinutes != null) Format.minutes(estimatedMinutes!),
  ].join(' · ');

  /// Expanded heads-up text: pickup, facts and ride id on separate lines.
  /// No customer name or address — the notification shows on the lock screen.
  String get notificationBody {
    final lines = <String>[
      if (storeName.trim().isNotEmpty) tr('Pickup: {store}', {'store': storeName}),
      if (_facts.isNotEmpty) _facts,
      if (deliveryFee > 0) tr('Delivery Fee: {fee}', {'fee': Format.money(deliveryFee)}),
      tr('Ride ID: {displayRideId}', {'displayRideId': displayRideId}),
    ];
    return lines.join('\n');
  }

  /// Collapsed one-liner.
  String get shortBody {
    final parts = [if (storeName.trim().isNotEmpty) storeName, if (_facts.isNotEmpty) _facts];
    return parts.isEmpty ? tr('Tap to accept · {displayRideId}', {'displayRideId': displayRideId}) : parts.join(' · ');
  }

  /// Socket `newDeliveryJob` / `jobAssignedToDriver` payload.
  factory RideAlert.fromSocket(Json obj) {
    final preview = obj['previewStops'];
    final first = preview is List && preview.isNotEmpty ? asJson(preview.first) : null;
    final orderCount = intOf(obj, 'orderCount');
    final previewLen = preview is List ? preview.length : 0;
    final rideCode = str(obj, 'rideCode');
    final id = str(obj, 'id');
    final title = str(obj, 'title');
    return RideAlert(
      jobId: id.isNotEmpty ? id : str(obj, 'jobId'),
      rideCode: rideCode.isEmpty ? null : rideCode,
      title: title.isEmpty ? tr('Delivery run') : title,
      storeId: str(obj, 'storeId'),
      storeName: str(obj, 'storeName'),
      storeCity: str(obj, 'storeCity'),
      orderCount: orderCount,
      totalCups: intOf(obj, 'totalCups'),
      estimatedDistanceKm: dblOrNull(obj, 'estimatedDistanceKm'),
      estimatedMinutes: intOrNull(obj, 'estimatedMinutes'),
      deliveryFee: intOf(obj, 'deliveryFee'),
      dropoffName: first == null ? '' : str(first, 'customerName'),
      dropoffAddress: first == null
          ? ''
          : Format.shortAddress(str(first, 'addressLine'), str(first, 'city'), str(first, 'district')),
      extraStopCount: math.max(math.max(previewLen - 1, 0), math.max(orderCount - 1, 0)),
    );
  }

  /// FCM data message (all values are strings).
  factory RideAlert.fromPush(Map<String, dynamic> data) {
    String s(String k) => data[k]?.toString() ?? '';
    final title = s('title');
    final rideCode = s('rideCode');
    return RideAlert(
      jobId: s('jobId'),
      rideCode: rideCode.isEmpty ? null : rideCode,
      title: title.isEmpty ? tr('Delivery run') : title,
      storeId: s('storeId'),
      storeName: s('storeName'),
      storeCity: s('storeCity'),
      orderCount: int.tryParse(s('orderCount')) ?? 0,
      totalCups: int.tryParse(s('totalCups')) ?? 0,
      estimatedDistanceKm: double.tryParse(s('estimatedDistanceKm')),
      estimatedMinutes: int.tryParse(s('estimatedMinutes')),
      deliveryFee: int.tryParse(s('deliveryFee')) ?? 0,
      dropoffName: s('dropoffName'),
      dropoffAddress: s('dropoffAddress'),
      extraStopCount: int.tryParse(s('extraStopCount')) ?? 0,
    );
  }

  factory RideAlert.fromJob(JobSummary job) {
    final first = job.previewStops.isEmpty ? null : job.previewStops.first;
    return RideAlert(
      jobId: job.id,
      rideCode: job.rideCode,
      title: job.title,
      storeId: job.storeId,
      storeName: job.storeName,
      storeCity: job.storeCity,
      orderCount: job.orderCount,
      totalCups: job.totalCups,
      estimatedDistanceKm: job.estimatedDistanceKm,
      estimatedMinutes: job.estimatedMinutes,
      deliveryFee: job.totalDeliveryFees,
      dropoffName: first?.customerName ?? '',
      dropoffAddress: first?.shortAddress ?? '',
      extraStopCount: math.max(job.orderCount - 1, 0),
    );
  }

  /// Serialized into notification payloads so a tap can rebuild the alert.
  Json toJson() => compact({
    'jobId': jobId,
    'rideCode': rideCode,
    'title': title,
    'storeId': storeId,
    'storeName': storeName,
    'storeCity': storeCity,
    'orderCount': '$orderCount',
    'totalCups': '$totalCups',
    'estimatedDistanceKm': estimatedDistanceKm?.toString(),
    'estimatedMinutes': estimatedMinutes?.toString(),
    'deliveryFee': '$deliveryFee',
    'dropoffName': dropoffName,
    'dropoffAddress': dropoffAddress,
    'extraStopCount': '$extraStopCount',
  });
}

/// A stop on the rider's held ride was cancelled and needs an in-app takeover.
class CancelledOrderAlert {
  final String jobId;
  final String orderId;
  final String orderNumber;

  const CancelledOrderAlert({required this.jobId, required this.orderId, required this.orderNumber});

  String get displayNumber => orderNumber.trim().isEmpty ? tr('An order') : orderNumber;
}

/// After a rider rejects a claimed job, later popups prefer other branches, then
/// other jobs at the same branch, and only then the job they just rejected.
/// Port of RideAlertPriority.kt.
List<RideAlert> prioritizedRideAlerts(
  Iterable<RideAlert> alerts,
  String? lastRejectedJobId,
  String? lastRejectedStoreId,
) {
  final list = alerts.toList();
  if (list.isEmpty) return const [];
  final rejectedId = (lastRejectedJobId?.trim().isEmpty ?? true) ? null : lastRejectedJobId;
  final rejectedStore = (lastRejectedStoreId?.trim().isEmpty ?? true) ? null : lastRejectedStoreId;
  final otherBranch = list
      .where(
        (a) =>
            a.jobId != rejectedId && rejectedStore != null && a.storeId.trim().isNotEmpty && a.storeId != rejectedStore,
      )
      .toList();
  final otherBranchIds = otherBranch.map((a) => a.jobId).toSet();
  final sameBranchOrUnknown = list.where((a) => a.jobId != rejectedId && !otherBranchIds.contains(a.jobId)).toList();
  final rejected = list.where((a) => a.jobId == rejectedId).toList();
  return [...otherBranch, ...sameBranchOrUnknown, ...rejected];
}

RideAlert? pickNextRideAlert(Iterable<RideAlert> alerts, String? lastRejectedJobId, String? lastRejectedStoreId) {
  final list = prioritizedRideAlerts(alerts, lastRejectedJobId, lastRejectedStoreId);
  return list.isEmpty ? null : list.first;
}
