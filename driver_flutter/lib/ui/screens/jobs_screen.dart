import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/alert_service.dart';
import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/local_profile.dart';
import '../../data/network/api_client.dart';
import '../../data/models/delivery_job.dart';
import '../../state/auth_controller.dart';
import '../../state/jobs_controller.dart';
import '../../data/models/driver.dart';
import '../app_routes.dart';
import '../components/headers.dart';
import '../components/job_cards.dart';
import '../components/snack.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';
import 'breakdown_screen.dart';
import 'report_breakdown_screen.dart';
import 'report_issue_sheet.dart';
import 'job_sheets.dart';
import '../../l10n/l10n.dart';

const _heldStatuses = {'IN_PROGRESS', 'ASSIGNED', 'RETURNING', 'QUEUED'};

/// Port of JobsScreen.kt (JobsTab).
class JobsTab extends StatefulWidget {
  const JobsTab({super.key, required this.onOpenJob, this.onOpenProfile});
  final void Function(JobSummary job) onOpenJob;

  /// Switches the shell to the Me tab (branch row / settings menu).
  final VoidCallback? onOpenProfile;

  @override
  State<JobsTab> createState() => _JobsTabState();
}

class _JobsTabState extends State<JobsTab> {
  bool _newJobFlash = false;
  Timer? _flashTimer;
  StreamSubscription<void>? _newJobSub;
  DriverShiftEntry? _lastShift;
  bool _wasOnline = false;

  @override
  void initState() {
    super.initState();
    final vm = context.read<JobsController>();
    vm.load();
    vm.startPollingWhileOnline();
    _loadLastShift(vm);
    _newJobSub = vm.newJobEvents.listen((_) {
      BcFeedback.newJob();
      setState(() => _newJobFlash = true);
      _flashTimer?.cancel();
      _flashTimer = Timer(const Duration(seconds: 4), () {
        if (mounted) setState(() => _newJobFlash = false);
      });
    });
  }

  @override
  void dispose() {
    _flashTimer?.cancel();
    _newJobSub?.cancel();
    super.dispose();
  }

  Future<void> _loadLastShift(JobsController vm) async {
    try {
      final shifts = await vm.getShiftHistory();
      final done = shifts.where((s) => s.endedAt != null).toList()
        ..sort((a, b) => jobsScheduledMillis(b.startedAt).compareTo(jobsScheduledMillis(a.startedAt)));
      if (mounted) setState(() => _lastShift = done.firstOrNull);
    } catch (_) {
      // Last shift is decorative; ignore failures.
    }
  }

  /// "Report an issue" chooser: delivery failure per collected order, vehicle breakdown
  /// (hands the job to another rider) or support.
  Future<void> _openReportSheet(JobsController vm) async {
    final detail = vm.activeJobDetail;
    final choice = await showReportIssueSheet(context, orders: reportableOrders(detail));
    if (!mounted || choice == null) return;
    switch (choice.kind) {
      case 'order':
        final order = detail?.orders.where((o) => o.orderId == choice.orderId).firstOrNull;
        if (detail == null || order == null) return;
        if (await reportOrderDeliveryFailure(context, jobId: detail.id, order: order)) vm.load();
      case 'breakdown':
        await _reportIssue(vm);
      case 'support':
        await openSupport(context);
    }
  }

  Future<void> _reportIssue(JobsController vm) async {
    final active = vm.jobs.where((j) => _heldStatuses.contains(j.status)).firstOrNull;
    final messenger = ScaffoldMessenger.of(context);
    if (active == null) {
      messenger.showSnackBar(
        SnackBar(content: Text(tr('No active ride to report breakdown for. Contact branch if needed.'))),
      );
      return;
    }
    final job = active;
    final reported = await ReportBreakdownScreen.open(
      context,
      onSubmit: vm.reportVehicleFailure,
      rideLabel: Format.rideIdLabel(job.rideCode, job.id).replaceFirst('·', '•'),
    );
    if (!mounted) return;
    if (reported) {
      BcFeedback.success();
      messenger.showSnackBar(
        SnackBar(content: Text(tr('Vehicle issue reported. Replacement requested.')), duration: Duration(seconds: 4)),
      );
    } else {
      BcFeedback.error();
    }
  }

  Future<void> _claim(JobsController vm, JobSummary job) async {
    final alerts = context.read<AppContainer>().alertService;
    await showClaimJobSheet(
      context,
      storeName: Format.shortBranchName(job.storeName),
      subtitle: [
        if (job.storeCity.trim().isNotEmpty) job.storeCity,
        Format.rideIdLabel(job.rideCode, job.id),
      ].join(' · '),
      fee: job.totalDeliveryFees,
      stopCount: job.orderCount,
      distanceKm: job.estimatedDistanceKm,
      minutes: job.estimatedMinutes,
      onConfirm: () async {
        alerts.silenceJob(job.id);
        final live = await vm.claim(job.id);
        if (live) BcFeedback.success();
        return vm.claimingId == null;
      },
    );
  }

  /// Errors and notices show as a toast once, then clear — the list never fills with error boxes.
  /// The full-screen error state still handles "nothing could load at all".
  void _toastMessages(JobsController vm, bool fatalError) {
    final error = fatalError ? null : vm.error;
    final notice = vm.notice;
    if (error == null && notice == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (error != null) {
        final offline = error == networkErrorMessage(DioExceptionType.connectionError);
        showBcSnack(context, error, kind: offline ? BcSnackKind.warning : BcSnackKind.error);
        vm.clearError();
      } else if (notice != null) {
        showBcSnack(context, notice, kind: BcSnackKind.success);
        vm.clearNotice();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    final auth = context.watch<AuthController>();
    final alerts = context.watch<AlertService>();

    final driverName = vm.profile?.name ?? auth.driver?.name ?? tr('Driver');

    final active = vm.jobs.where((j) => _heldStatuses.contains(j.status)).toList()
      ..sort((a, b) => jobsScheduledMillis(b.scheduledAt).compareTo(jobsScheduledMillis(a.scheduledAt)));
    final scheduled = vm.jobs.where((j) => !_heldStatuses.contains(j.status)).toList()
      ..sort((a, b) => jobsScheduledMillis(b.scheduledAt).compareTo(jobsScheduledMillis(a.scheduledAt)));
    final hasBlockingRun = active.isNotEmpty;
    final alerting = alerts.activeAlertJobIds;
    final firstLoad = vm.loading && vm.jobs.isEmpty && vm.profile == null;
    final fatalError = vm.error != null && vm.jobs.isEmpty && vm.profile == null;
    _toastMessages(vm, fatalError);

    // Refresh the last-shift card when the rider goes offline (a shift just ended).
    if (_wasOnline && !vm.isOnline) _loadLastShift(vm);
    _wasOnline = vm.isOnline;

    final branches = <StoreRef>[
      ...?vm.profile?.accessibleStores,
    ];
    if (branches.isEmpty && vm.profile?.store != null) branches.add(vm.profile!.store!);
    final homeStoreId = vm.profile?.store?.id ?? vm.profile?.storeId;

    return _HomeScaffold(
      header: HomeHeader(
        driverName: driverName,
        isOnline: vm.isOnline,
        dutyLoading: vm.dutyLoading,
        onToggleDuty: (online) {
          BcFeedback.tap();
          vm.setOnline(online);
        },
      ),
      onRefresh: () async {
        BcFeedback.refresh();
        await vm.load();
      },
      children: [
        // New-job banner lives in the list so it never shifts or covers the header.
        AnimatedSize(
          duration: BcMotion.standard,
          child: _newJobFlash
              ? Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: BcInlineBanner(
                    message: tr('New cup run available'),
                    color: c.primary,
                    icon: Icons.local_shipping_outlined,
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
        const BreakdownBanner(),
        if (firstLoad)
          const BcJobsSkeleton()
        else if (fatalError)
          SizedBox(
            height: 320,
            child: BcErrorState(message: vm.error!, onRetry: vm.load),
          )
        else ...[
          for (final job in active)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              // Rebuilds when the rider cancels the breakdown so the button flips back.
              child: ListenableBuilder(
                listenable: LocalProfile.instance,
                builder: (context, _) => ActiveJobCard(
                  job: job,
                  detail: vm.activeJobDetail?.id == job.id ? vm.activeJobDetail : null,
                  onOpen: () => widget.onOpenJob(job),
                  onViewDetails: () => AppRoutes.openJobDetail(context, job.id),
                  onReportIssue: () => _openReportSheet(vm),
                  onViewBreakdown: isBreakdownOpen(vm) ? () => openBreakdownStatus(context) : null,
                ),
              ),
            ),
          if (active.isEmpty && scheduled.isEmpty) NoOtherJobsCard(isOnline: vm.isOnline),
          if (scheduled.isNotEmpty) ...[
            QdSectionTitle(tr('Up next'), topGap: active.isEmpty ? 0 : 8),
            for (final job in scheduled)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Builder(
                  builder: (context) {
                    final isToday = Format.isToday(job.scheduledAt);
                    return ScheduledJobCard(
                      job: job,
                      onOpen: () => widget.onOpenJob(job),
                      claimEnabled: vm.isOnline && !hasBlockingRun && isToday,
                      disabledLabel: !isToday
                          ? tr('No longer available')
                          : !vm.isOnline
                          ? tr('Go online to claim')
                          : tr('Finish current delivery to claim'),
                      claiming: vm.claimingId == job.id,
                      alerting: alerting.contains(job.id),
                      onClaim: () => _claim(vm, job),
                      onSilence: () => alerts.silenceJob(job.id),
                    );
                  },
                ),
              ),
          ],
          if (active.isEmpty) ...[
            const SizedBox(height: 12),
            AssignedBranchesCard(
              branches: branches,
              homeStoreId: homeStoreId,
              onTap: () {
                BcFeedback.tap();
                widget.onOpenProfile?.call();
              },
            ),
            if (!vm.isOnline) ...[
              const SizedBox(height: 12),
              LastShiftCard(shift: _lastShift),
            ],
          ],
        ],
      ],
    );
  }
}

/// Home layout: the tall brand hero scrolls with the content on the page background.
class _HomeScaffold extends StatelessWidget {
  const _HomeScaffold({required this.header, required this.children, required this.onRefresh});

  final Widget header;
  final List<Widget> children;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: ColoredBox(
        color: c.background,
        child: RefreshIndicator(
          color: c.primary,
          edgeOffset: MediaQuery.paddingOf(context).top,
          onRefresh: onRefresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              SliverToBoxAdapter(child: header),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(10, 12, 10, 24),
                sliver: SliverList.list(children: children),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
