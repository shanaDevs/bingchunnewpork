import '../../../core/network/dio_client.dart';
import '../../../models/delivery_job.dart';
import '../../../models/delivery_route.dart';
import '../../auth/data/auth_repository.dart';

/// Data-layer repository for delivery jobs.
///
/// Currently talks to the core backend's `/delivery/*` routes (proxied or
/// native, depending on `DELIVERY_SERVICE_ENABLED` server-side). Once the
/// Delivery Service fully owns this surface, only [DioClient.delivery] and
/// the base paths below need to change — call sites stay the same.
class JobsRepository {
  JobsRepository({DioClient? client, AuthRepository? auth})
      : _client = client ?? DioClient.core(),
        _auth = auth ?? AuthRepository();

  final DioClient _client;
  final AuthRepository _auth;
  String? _cachedToken;

  Future<String?> _token() async {
    _cachedToken ??= await _auth.getToken();
    return _cachedToken;
  }

  Future<List<JobSummary>> listJobs() async {
    final token = await _token();
    final data = await _client.get<dynamic>('/delivery/jobs', token: token);
    return (data as List<dynamic>)
        .map((e) => JobSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<DeliveryJobDetail?> getActiveJob() async {
    final token = await _token();
    final data = await _client.get<dynamic>('/delivery/jobs/active', token: token);
    if (data == null) return null;
    return DeliveryJobDetail.fromJson(data as Map<String, dynamic>);
  }

  Future<DeliveryJobDetail> getJob(String id) async {
    final token = await _token();
    return _client.get<DeliveryJobDetail>(
      '/delivery/jobs/$id',
      token: token,
      parser: DeliveryJobDetail.fromJson,
    );
  }

  Future<DeliveryJobDetail> assignJob(String id) async {
    final token = await _token();
    return _client.post<DeliveryJobDetail>(
      '/delivery/jobs/$id/assign',
      const {},
      token: token,
      parser: DeliveryJobDetail.fromJson,
    );
  }

  Future<DeliveryJobDetail> pickupJob(String id) async {
    final token = await _token();
    return _client.post<DeliveryJobDetail>(
      '/delivery/jobs/$id/pickup',
      const {},
      token: token,
      parser: DeliveryJobDetail.fromJson,
    );
  }

  Future<DeliveryJobDetail> startJob(String id) async {
    final token = await _token();
    return _client.post<DeliveryJobDetail>(
      '/delivery/jobs/$id/start',
      const {},
      token: token,
      parser: DeliveryJobDetail.fromJson,
    );
  }

  Future<DeliveryJobDetail> completeJob(String id) async {
    final token = await _token();
    return _client.post<DeliveryJobDetail>(
      '/delivery/jobs/$id/complete',
      const {},
      token: token,
      parser: DeliveryJobDetail.fromJson,
    );
  }

  Future<DeliveryRoute> getJobRoute(String id) async {
    final token = await _token();
    final data = await _client.get<Map<String, dynamic>>(
      '/delivery/jobs/$id/route',
      token: token,
      parser: (json) => json,
    );
    return DeliveryRoute.fromJson(data);
  }

  /// Updates an order's delivery status. When the store requires OTP proof
  /// of delivery, the backend responds with `ApiException.code == 'OTP_REQUIRED'`
  /// — pass [otp] on retry once the driver has entered the customer's code.
  Future<JobOrder> updateOrderStatus(
    String orderId,
    String status, {
    String? note,
    String? otp,
  }) async {
    final token = await _token();
    return _client.put<JobOrder>(
      '/delivery/orders/$orderId/status',
      {
        'status': status,
        'note': note,
        'otp': otp,
      }..removeWhere((key, value) => value == null),
      token: token,
      parser: JobOrder.fromJson,
    );
  }

  /// Re-issues the customer's delivery OTP over SMS.
  Future<void> resendOrderOtp(String orderId) async {
    final token = await _token();
    await _client.post<Map<String, dynamic>>(
      '/delivery/orders/$orderId/otp/resend',
      const {},
      token: token,
      parser: (json) => json,
    );
  }
}
