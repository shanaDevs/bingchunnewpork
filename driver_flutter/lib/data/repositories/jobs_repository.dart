import '../json.dart';
import '../models/delivery_job.dart';
import '../models/delivery_route.dart';
import '../models/driver.dart';
import '../network/api_client.dart';

/// Port of JobsRepository.kt.
class JobsRepository {
  JobsRepository(this._api);

  final ApiClient _api;

  Future<List<JobSummary>> listJobs() =>
      _api.call(() => _api.core.get<dynamic>('delivery/jobs'), (d) => _list(d, JobSummary.fromJson));

  Future<DeliveryJobDetail?> getActiveJob() => _api.callNullable(
    () => _api.core.get<dynamic>('delivery/jobs/active'),
    (d) => DeliveryJobDetail.fromJson(asJson(d)),
  );

  Future<List<JobHistoryItem>> listJobHistory() =>
      _api.call(() => _api.core.get<dynamic>('delivery/jobs/history'), (d) => _list(d, JobHistoryItem.fromJson));

  Future<RiderStats> getMyStats(String period) => _api.call(
    () => _api.core.get<dynamic>('delivery/me/stats', queryParameters: {'period': period}),
    (d) => RiderStats.fromJson(asJson(d)),
  );

  Future<RiderRatingsResponse> getMyRatings() =>
      _api.call(() => _api.core.get<dynamic>('delivery/me/ratings'), (d) => RiderRatingsResponse.fromJson(asJson(d)));

  Future<DeliveryJobDetail> getJob(String id) =>
      _api.call(() => _api.core.get<dynamic>('delivery/jobs/$id'), (d) => DeliveryJobDetail.fromJson(asJson(d)));

  Future<DeliveryJobDetail> assignJob(String id) => _jobAction(id, 'assign');

  Future<DeliveryJobDetail> claimJob(String id) => _jobAction(id, 'claim');

  Future<DeliveryJobDetail> startJob(String id) => _jobAction(id, 'start');

  /// Declines an assigned job so dispatch can hand it to another driver.
  Future<void> rejectJob(String id, String reason) =>
      _api.callNullable(() => _api.core.post<dynamic>('delivery/jobs/$id/reject', data: {'reason': reason}), (_) {});

  /// Confirms the driver collected the parcels at the branch — geofenced to the branch.
  Future<DeliveryJobDetail> pickupJob(String id, double lat, double lng) =>
      _jobAction(id, 'pickup', {'lat': lat, 'lng': lng});

  Future<DeliveryJobDetail> completeJob(String id, double lat, double lng) =>
      _jobAction(id, 'complete', {'lat': lat, 'lng': lng});

  Future<DeliveryJobDetail> _jobAction(String id, String action, [Json body = const {}]) => _api.call(
    () => _api.core.post<dynamic>('delivery/jobs/$id/$action', data: body),
    (d) => DeliveryJobDetail.fromJson(asJson(d)),
  );

  Future<DeliveryRoute> getJobRoute(String id, [DeliveryJobDetail? fallbackJob]) async {
    try {
      return await _api.call(
        () => _api.core.get<dynamic>('delivery/jobs/$id/route'),
        (d) => DeliveryRoute.fromJson(asJson(d)),
      );
    } catch (_) {
      final job = fallbackJob ?? await getJob(id);
      return fallbackRouteFor(job);
    }
  }

  Future<JobOrder> getOrder(String orderId) =>
      _api.call(() => _api.core.get<dynamic>('delivery/orders/$orderId'), (d) => JobOrder.fromJson(asJson(d)));

  /// Issues a new customer delivery code and sends it to the customer.
  Future<void> resendOrderOtp(String orderId) =>
      _api.callNullable(() => _api.core.post<dynamic>('delivery/orders/$orderId/otp/resend', data: const {}), (_) {});

  Future<JobOrder> updateOrderStatus(String orderId, String status, {String? note, String? otp, String? outcome}) =>
      _api.call(
        () => _api.core.put<dynamic>(
          'delivery/orders/$orderId/status',
          data: compact({'status': status, 'note': note, 'otp': otp, 'outcome': outcome}),
        ),
        (d) => JobOrder.fromJson(asJson(d)),
      );

  Future<void> createComplaint(String orderId, String category, String description) => _api.callNullable(
    () => _api.core.post<dynamic>(
      'delivery/me/complaints',
      data: {'orderId': orderId, 'category': category, 'description': description},
    ),
    (_) {},
  );

  /// Reports the driver's vehicle has broken down mid-ride so admin can send a replacement rider.
  Future<void> reportVehicleFailure(double lat, double lng, {String? note}) => _api.callNullable(
    () =>
        _api.core.post<dynamic>('delivery/jobs/vehicle-failure', data: compact({'lat': lat, 'lng': lng, 'note': note})),
    (_) {},
  );

  Future<void> postLocationBatch(String? jobId, List<Json> points) => _api.callNullable(
    () => _api.core.post<dynamic>('delivery/locations/batch', data: compact({'jobId': jobId, 'points': points})),
    (_) {},
  );

  Future<void> registerFcmToken(String token, String? deviceId) => _api.callNullable(
    () => _api.core.post<dynamic>('delivery/me/fcm-token', data: compact({'token': token, 'deviceId': deviceId})),
    (_) {},
  );

  Future<void> unregisterFcmToken(String? deviceId) => _api.callNullable(
    () => _api.core.delete<dynamic>('delivery/me/fcm-token', data: compact({'deviceId': deviceId})),
    (_) {},
  );
}

List<T> _list<T>(Object? data, T Function(Json) parse) =>
    data is List ? data.whereType<Map>().map((e) => parse(asJson(e))).toList() : <T>[];
