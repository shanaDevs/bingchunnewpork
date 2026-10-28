import '../config/dev_config.dart';
import '../data/mock_delivery_jobs.dart';
import '../features/jobs/data/jobs_repository.dart';
import '../models/delivery_job.dart';
import '../models/delivery_route.dart';

/// @deprecated Thin wrapper around [JobsRepository] kept so
/// `providers/jobs_provider.dart` keeps working unchanged, plus preview-mode
/// mocking for UI development without a backend. New code should use
/// [JobsRepository] directly.
class JobService {
  JobService({JobsRepository? repository}) : _repository = repository ?? JobsRepository();

  final JobsRepository _repository;

  Future<List<JobSummary>> listJobs() async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      return mockJobStore.listSummaries();
    }
    return _repository.listJobs();
  }

  Future<DeliveryJobDetail?> getActiveJob() async {
    if (kUiPreviewMode) {
      return mockJobStore.getActiveJob();
    }
    return _repository.getActiveJob();
  }

  Future<DeliveryJobDetail> getJob(String id) async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
      return mockJobStore.getJob(id);
    }
    return _repository.getJob(id);
  }

  Future<DeliveryJobDetail> assignJob(String id) async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return mockJobStore.assignJob(id);
    }
    return _repository.assignJob(id);
  }

  Future<DeliveryJobDetail> pickupJob(String id) async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      return mockJobStore.pickupJob(id);
    }
    return _repository.pickupJob(id);
  }

  Future<DeliveryJobDetail> startJob(String id) async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return mockJobStore.startJob(id);
    }
    return _repository.startJob(id);
  }

  Future<DeliveryRoute> getJobRoute(String id) async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      return mockJobStore.jobRoute(id);
    }
    return _repository.getJobRoute(id);
  }

  Future<JobOrder> updateOrderStatus(String orderId, String status, {String? note, String? otp}) async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 350));
      return mockJobStore.updateOrderStatus(orderId, status);
    }
    return _repository.updateOrderStatus(orderId, status, note: note, otp: otp);
  }

  Future<void> resendOrderOtp(String orderId) async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
      return;
    }
    return _repository.resendOrderOtp(orderId);
  }

  Future<DeliveryJobDetail> completeJob(String id) async {
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return mockJobStore.completeJob(id);
    }
    return _repository.completeJob(id);
  }
}
