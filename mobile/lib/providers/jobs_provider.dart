import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/jobs/data/jobs_repository.dart';
import '../features/tracking/data/location_service.dart';
import '../features/tracking/data/socket_service.dart';
import '../models/delivery_job.dart';
import '../models/delivery_route.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/job_service.dart';
import 'auth_provider.dart';

final jobServiceProvider = Provider<JobService>((ref) {
  return JobService(repository: JobsRepository(auth: ref.watch(authRepositoryProvider)));
});

class JobsListState {
  final bool loading;
  final List<JobSummary> jobs;
  final String? error;

  const JobsListState({this.loading = false, this.jobs = const [], this.error});

  JobsListState copyWith({bool? loading, List<JobSummary>? jobs, String? error, bool clearError = false}) {
    return JobsListState(
      loading: loading ?? this.loading,
      jobs: jobs ?? this.jobs,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class JobsListNotifier extends StateNotifier<JobsListState> {
  JobsListNotifier(this._jobs) : super(const JobsListState());

  final JobService _jobs;

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final jobs = await _jobs.listJobs();
      state = JobsListState(jobs: jobs);
    } on ApiException catch (e) {
      state = JobsListState(error: e.message);
    } catch (_) {
      state = const JobsListState(error: 'Failed to load jobs');
    }
  }
}

final jobsListProvider = StateNotifierProvider<JobsListNotifier, JobsListState>((ref) {
  return JobsListNotifier(ref.watch(jobServiceProvider));
});

class JobDetailState {
  final bool loading;
  final bool acting;
  final bool routeLoading;
  final DeliveryJobDetail? job;
  final DeliveryRoute? route;
  final String? error;

  const JobDetailState({
    this.loading = false,
    this.acting = false,
    this.routeLoading = false,
    this.job,
    this.route,
    this.error,
  });
}

class JobDetailNotifier extends StateNotifier<JobDetailState> {
  JobDetailNotifier(this._jobs, this.jobId) : super(const JobDetailState()) {
    load();
  }

  final JobService _jobs;
  final String jobId;

  Future<void> load() async {
    state = JobDetailState(loading: true, job: state.job, route: state.route);
    try {
      final jobFuture = _jobs.getJob(jobId);
      final routeFuture = _jobs.getJobRoute(jobId);
      final job = await jobFuture;

      if (!job.canAssign && !job.isActive) {
        state = JobDetailState(job: job);
        return;
      }

      state = JobDetailState(job: job, routeLoading: true);
      try {
        final route = await routeFuture;
        state = JobDetailState(job: job, route: route);
      } on ApiException catch (e) {
        state = JobDetailState(job: job, error: e.message);
      } catch (_) {
        state = JobDetailState(job: job, error: 'Failed to load route');
      }
    } on ApiException catch (e) {
      state = JobDetailState(error: e.message);
    } catch (e) {
      state = JobDetailState(error: e.toString());
    }
  }

  Future<DeliveryJobDetail?> assign() async {
    state = JobDetailState(acting: true, job: state.job, route: state.route);
    try {
      final job = await _jobs.assignJob(jobId);
      state = JobDetailState(job: job, route: state.route);
      return job;
    } on ApiException catch (e) {
      state = JobDetailState(job: state.job, route: state.route, error: e.message);
      return null;
    } catch (e) {
      state = JobDetailState(job: state.job, route: state.route, error: e.toString());
      return null;
    }
  }

  Future<DeliveryJobDetail?> pickup() async {
    state = JobDetailState(acting: true, job: state.job, route: state.route);
    try {
      final job = await _jobs.pickupJob(jobId);
      state = JobDetailState(job: job, route: state.route);
      return job;
    } on ApiException catch (e) {
      state = JobDetailState(job: state.job, route: state.route, error: e.message);
      return null;
    } catch (e) {
      state = JobDetailState(job: state.job, route: state.route, error: e.toString());
      return null;
    }
  }

  Future<DeliveryJobDetail?> start() async {
    state = JobDetailState(acting: true, job: state.job, route: state.route);
    try {
      final job = await _jobs.startJob(jobId);
      state = JobDetailState(job: job, route: state.route);
      return job;
    } on ApiException catch (e) {
      state = JobDetailState(job: state.job, route: state.route, error: e.message);
      return null;
    } catch (e) {
      state = JobDetailState(job: state.job, route: state.route, error: e.toString());
      return null;
    }
  }
}

final jobDetailProvider = StateNotifierProvider.family<JobDetailNotifier, JobDetailState, String>((ref, jobId) {
  return JobDetailNotifier(ref.watch(jobServiceProvider), jobId);
});

class JobRouteState {
  final bool loading;
  final DeliveryRoute? route;
  final String? error;

  const JobRouteState({this.loading = false, this.route, this.error});
}

class JobRouteNotifier extends StateNotifier<JobRouteState> {
  JobRouteNotifier(this._jobs, this.jobId, {DeliveryRoute? initialRoute})
      : super(JobRouteState(route: initialRoute)) {
    if (initialRoute == null) load();
  }

  final JobService _jobs;
  final String jobId;

  Future<void> load() async {
    state = JobRouteState(loading: true, route: state.route);
    try {
      final route = await _jobs.getJobRoute(jobId);
      state = JobRouteState(route: route);
    } on ApiException catch (e) {
      state = JobRouteState(error: e.message);
    } catch (_) {
      state = const JobRouteState(error: 'Failed to load route');
    }
  }
}

final jobRouteProvider = StateNotifierProvider.family<JobRouteNotifier, JobRouteState, String>((ref, jobId) {
  final dash = ref.watch(dashboardProvider(jobId));
  final detail = ref.watch(jobDetailProvider(jobId));
  final cached = dash.route ?? detail.route;
  return JobRouteNotifier(ref.watch(jobServiceProvider), jobId, initialRoute: cached);
});

class DashboardState {
  final bool loading;
  final bool acting;
  final DeliveryJobDetail? job;
  final DeliveryRoute? route;
  final String? error;

  const DashboardState({this.loading = false, this.acting = false, this.job, this.route, this.error});
}

class DashboardNotifier extends StateNotifier<DashboardState> {
  DashboardNotifier(this._jobs, this.jobId, {AuthService? auth})
      : _auth = auth ?? AuthService(),
        super(const DashboardState()) {
    load();
  }

  final JobService _jobs;
  final AuthService _auth;
  final String jobId;

  Future<void> load() async {
    state = DashboardState(loading: true, job: state.job, route: state.route);
    try {
      final jobFuture = _jobs.getJob(jobId);
      final routeFuture = _jobs.getJobRoute(jobId);
      final job = await jobFuture;
      DeliveryRoute? route;
      if (job.isActive) {
        try {
          route = await routeFuture;
        } catch (_) {
          route = state.route;
        }
      }
      if (job.isActive) {
        await _beginTracking();
      }
      state = DashboardState(job: job, route: route);
    } on ApiException catch (e) {
      state = DashboardState(error: e.message);
    } catch (e) {
      state = DashboardState(error: e.toString());
    }
  }

  Future<bool> pickup() async {
    state = DashboardState(acting: true, job: state.job, route: state.route);
    try {
      final job = await _jobs.pickupJob(jobId);
      state = DashboardState(job: job, route: state.route);
      await _beginTracking();
      return true;
    } on ApiException catch (e) {
      state = DashboardState(job: state.job, route: state.route, error: e.message);
      return false;
    } catch (_) {
      state = DashboardState(job: state.job, route: state.route, error: 'Failed to confirm pickup');
      return false;
    }
  }

  Future<bool> start() async {
    state = DashboardState(acting: true, job: state.job, route: state.route);
    try {
      final job = await _jobs.startJob(jobId);
      state = DashboardState(job: job, route: state.route);
      await _beginTracking();
      return true;
    } on ApiException catch (e) {
      state = DashboardState(job: state.job, route: state.route, error: e.message);
      return false;
    } catch (_) {
      state = DashboardState(job: state.job, route: state.route, error: 'Failed to start job');
      return false;
    }
  }

  Future<bool> complete() async {
    state = DashboardState(acting: true, job: state.job, route: state.route);
    try {
      await _jobs.completeJob(jobId);
      state = const DashboardState();
      await _endTracking();
      return true;
    } on ApiException catch (e) {
      state = DashboardState(job: state.job, route: state.route, error: e.message);
      return false;
    } catch (e) {
      state = DashboardState(job: state.job, route: state.route, error: e.toString());
      return false;
    }
  }

  /// Starts GPS streaming + goes online on the delivery socket while this
  /// job is `IN_PROGRESS`. Failures are swallowed — location tracking is a
  /// best-effort enhancement, not a blocker for the delivery run.
  Future<void> _beginTracking() async {
    try {
      final token = await _auth.getToken();
      if (token != null) {
        socketService.connect(token);
        socketService.goOnline();
      }
      await locationService.startTracking(jobId);
    } catch (_) {
      // Best-effort — tracking failures shouldn't block the driver.
    }
  }

  Future<void> _endTracking() async {
    try {
      await locationService.stopTracking();
      socketService.goOffline();
    } catch (_) {
      // Best-effort cleanup.
    }
  }

  @override
  void dispose() {
    unawaited(_endTracking());
    super.dispose();
  }

  void applyOrderUpdate(JobOrder updated) {
    final job = state.job;
    if (job == null) return;

    final orders = job.orders
        .map((o) => o.orderId == updated.orderId ? updated : o)
        .toList();
    final deliveredCount = orders.where((o) => o.isDelivered).length;

    state = DashboardState(job: job.copyWith(orders: orders, deliveredCount: deliveredCount), route: state.route);
  }
}

final dashboardProvider = StateNotifierProvider.family<DashboardNotifier, DashboardState, String>((ref, jobId) {
  return DashboardNotifier(ref.watch(jobServiceProvider), jobId, auth: ref.watch(authServiceProvider));
});

class OrderActionState {
  final bool acting;
  final String? error;
  final bool otpRequired;

  const OrderActionState({this.acting = false, this.error, this.otpRequired = false});
}

class OrderActionNotifier extends StateNotifier<OrderActionState> {
  OrderActionNotifier(this._jobs) : super(const OrderActionState());

  final JobService _jobs;

  Future<JobOrder?> updateStatus(String orderId, String status, {String? otp, String? note}) async {
    state = const OrderActionState(acting: true);
    try {
      final order = await _jobs.updateOrderStatus(orderId, status, otp: otp, note: note);
      state = const OrderActionState();
      return order;
    } on ApiException catch (e) {
      state = OrderActionState(error: e.message, otpRequired: e.isOtpRequired);
      return null;
    } catch (_) {
      state = const OrderActionState(error: 'Failed to update status');
      return null;
    }
  }

  Future<bool> resendOtp(String orderId) async {
    try {
      await _jobs.resendOrderOtp(orderId);
      return true;
    } on ApiException catch (e) {
      state = OrderActionState(error: e.message, otpRequired: state.otpRequired);
      return false;
    } catch (_) {
      state = OrderActionState(
        error: 'Failed to resend OTP',
        otpRequired: state.otpRequired,
      );
      return false;
    }
  }
}

final orderActionProvider = StateNotifierProvider<OrderActionNotifier, OrderActionState>((ref) {
  return OrderActionNotifier(ref.watch(jobServiceProvider));
});
