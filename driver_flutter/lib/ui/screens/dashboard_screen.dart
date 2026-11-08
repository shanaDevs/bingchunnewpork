import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../core/app_container.dart';
import '../../core/events.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../core/runtime_config.dart';
import '../../data/models/delivery_job.dart';
import '../../l10n/l10n.dart';
import '../../state/job_controllers.dart';
import '../../state/jobs_controller.dart';
import '../../tracking/location_tracker.dart';
import '../app_routes.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';
import 'navigation_screen.dart';
import 'report_breakdown_screen.dart';
import 'report_issue_sheet.dart';

/// Geofence state derived from the live fix.
class _Geo {
  final double? distanceM;
  final bool within;
  final String? hint;
  const _Geo(this.distanceM, this.within, this.hint);

  factory _Geo.of(DeliveryJobDetail? job, DriverFix? fix) {
    if (job == null) return const _Geo(null, false, null);
    double? d;
    if (fix != null) {
      final lat = job.needsPickup ? job.pickupNavLat : job.store.lat;
      final lng = job.needsPickup ? job.pickupNavLng : job.store.lng;
      d = haversineMetres(fix.lat, fix.lng, lat, lng);
    }
    final within = job.needsPickup ? job.pickupUnlockedAt(d) : job.canCompleteAt(d);
    final hint = job.needsPickup && job.hasPickupOverride
        ? Format.pickupOverrideHint(d, job.pickupPlaceName)
        : Format.pickupUnlockHint(d, job.store.completionRadiusM, within);
    return _Geo(d, within, hint);
  }
}

/// The active run (QuickDrop navigate screen): full-screen map and route to the current
/// leg — the branch, each customer in stop order, then back to the branch — with the one
/// next step as a slide at the bottom.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, required this.jobId, this.legOrderId});
  final String jobId;

  /// Start already heading to this order (set when the rider tapped "Navigate to order N" elsewhere).
  final String? legOrderId;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) {
        return DashboardController(ctx.read<AppContainer>(), seed: ActiveJobCache.peek(jobId))..load(jobId, force: true);
      },
      child: _DashboardBody(jobId: jobId, legOrderId: legOrderId),
    );
  }
}

class _DashboardBody extends StatefulWidget {
  const _DashboardBody({required this.jobId, this.legOrderId});
  final String jobId;
  final String? legOrderId;

  @override
  State<_DashboardBody> createState() => _DashboardBodyState();
}

class _DashboardBodyState extends State<_DashboardBody> with WidgetsBindingObserver {
  StreamSubscription<String>? _dropSub;
  bool _askedLocation = false;

  /// The order the rider has set off for; any other pending order shows as "Up next".
  late String? _legOrderId = widget.legOrderId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    RuntimeConfig.instance.addListener(_applyWakelock);
    _applyWakelock();
    _dropSub = JobRefreshBus.droppedRides.listen((id) {
      if (id == widget.jobId && mounted) AppRoutes.popToHome(context);
    });
  }

  @override
  void dispose() {
    RuntimeConfig.instance.removeListener(_applyWakelock);
    WakelockPlus.disable().catchError((_) {});
    WidgetsBinding.instance.removeObserver(this);
    _dropSub?.cancel();
    super.dispose();
  }

  void _applyWakelock() {
    final on = RuntimeConfig.instance.keepScreenOn;
    (on ? WakelockPlus.enable() : WakelockPlus.disable()).catchError((_) {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) context.read<DashboardController>().load(widget.jobId, force: true);
  }

  DashboardController get _vm => context.read<DashboardController>();
  LocationTracker get _tracker => context.read<AppContainer>().locationTracker;

  Future<void> _confirmPickup() async {
    if (!await ensureLocationPermission()) return;
    BcFeedback.success();
    await _vm.pickup(widget.jobId);
  }

  Future<void> _start() async {
    if (!await ensureLocationPermission()) return;
    BcFeedback.success();
    await _vm.start(widget.jobId);
  }

  Future<void> _complete() async {
    final fix = _tracker.lastFix ?? await _tracker.getCurrentLocation();
    if (fix == null) {
      await ensureLocationPermission();
      return;
    }
    final ok = await _vm.complete(widget.jobId, fix.lat, fix.lng);
    if (ok && mounted) {
      BcFeedback.completed();
      AppRoutes.popToHome(context);
    }
  }

  /// Report-a-problem menu, opposite the back button.
  Future<void> _openProblemMenu(DeliveryJobDetail job) async {
    final vm = _vm;
    final choice = await showReportIssueSheet(context, orders: reportableOrders(job));
    if (!mounted || choice == null) return;
    switch (choice.kind) {
      case 'order':
        final order = job.orders.where((o) => o.orderId == choice.orderId).firstOrNull;
        if (order == null) return;
        if (await reportOrderDeliveryFailure(context, jobId: job.id, order: order)) vm.load(job.id, force: true);
      case 'breakdown':
        final ok = await ReportBreakdownScreen.open(
          context,
          onSubmit: (note) => vm.reportVehicleFailure(job.id, note),
          rideLabel: Format.rideIdLabel(job.rideCode, job.id).replaceFirst('·', '•'),
        );
        if (ok && mounted) {
          BcFeedback.success();
          AppRoutes.popToHome(context);
        }
      case 'support':
        await openSupport(context);
    }
  }

  Widget _message(BuildContext context, Widget child) {
    final c = context.bc;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: c.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: c.background,
        body: Column(
          children: [
            QdAppBar(title: tr('Active run')),
            Expanded(child: Center(child: child)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<DashboardController>();
    final tracker = context.read<AppContainer>().locationTracker;
    // Rebuild on every fix so the geofence updates as the rider moves.
    return ListenableBuilder(
      listenable: tracker,
      builder: (context, _) {
        final job = vm.job;
        if (vm.loading && job == null) {
          return _message(context, CircularProgressIndicator(color: c.primaryStrong));
        }
        if (job == null) {
          return _message(
            context,
            Text(vm.error ?? tr('Job not found'), style: TextStyle(color: c.mutedForeground)),
          );
        }
        if (job.isActive && !_askedLocation) {
          _askedLocation = true;
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            if (await ensureLocationPermission()) await tracker.start(job.id);
          });
        }

        final stops = [...job.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
        final next = stops.where((o) => o.isPending).firstOrNull;
        final geo = _Geo.of(job, tracker.lastFix);
        final storeAddress = '${job.store.addressLine}, ${job.store.city}';

        // Where the rider is going now, and the one step to take there.
        final NavTarget target;
        final NavPrimaryAction action;
        if (job.needsPickup) {
          target = NavTarget(
            lat: job.pickupNavLat,
            lng: job.pickupNavLng,
            label: job.pickupPlaceName,
            kind: const NavKindPickup(),
            address: job.hasPickupOverride ? '' : storeAddress,
            phone: job.hasPickupOverride ? '' : job.store.phone,
          );
          action = NavConfirmPickup(
            enabled: geo.within,
            loading: vm.acting,
            geofenceHint: geo.hint,
            onConfirm: _confirmPickup,
          );
        } else if (job.canStart && next != null) {
          // Picked up: the first order is "Up next"; tapping starts the run and sets off.
          final n = stops.indexOf(next) + 1;
          target = _stopTarget(next, job, n, upNext: true);
          action = NavButtonAction(
            label: tr('Navigate to order {n}', {'n': n}),
            icon: Icons.navigation_outlined,
            loading: vm.acting,
            onTap: () async {
              await _start();
              if (mounted) setState(() => _legOrderId = next.orderId);
            },
          );
        } else if (job.status == 'IN_PROGRESS' && next != null) {
          final n = stops.indexOf(next) + 1;
          if (_legOrderId == next.orderId) {
            target = _stopTarget(next, job, n);
            action = NavSlideAction(
              label: tr('Slide to confirm delivery'),
              onConfirm: () => AppRoutes.openOrder(context, widget.jobId, next.orderId),
            );
          } else {
            // Between legs: show the next stop; the rider sets off when ready.
            target = _stopTarget(next, job, n, upNext: true);
            action = NavButtonAction(
              label: tr('Navigate to order {n}', {'n': n}),
              icon: Icons.navigation_outlined,
              onTap: () => setState(() => _legOrderId = next.orderId),
            );
          }
        } else {
          target = NavTarget(
            lat: job.store.lat,
            lng: job.store.lng,
            label: job.store.name,
            kind: const NavKindReturn(),
            address: storeAddress,
            phone: job.store.phone,
          );
          action = NavCompleteRide(enabled: geo.within, loading: vm.acting, onComplete: _complete);
        }

        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.light,
          child: NavigationScreen(
            // A new leg is a new route: rebuild the map state for it.
            key: ValueKey('${target.kind.runtimeType}-${target.lat}-${target.lng}-${target.upNext}'),
            target: target,
            actionBuilder: (_) => action,
            trailing: _ProblemButton(onTap: () => _openProblemMenu(job)),
            onOpenDestination: target.kind is NavKindCustomerStop
                ? () => AppRoutes.openOrder(context, widget.jobId, (target.kind as NavKindCustomerStop).orderId)
                : null,
          ),
        );
      },
    );
  }

  NavTarget _stopTarget(JobOrder o, DeliveryJobDetail job, int number, {bool upNext = false}) => NavTarget(
    lat: o.lat ?? job.store.lat,
    lng: o.lng ?? job.store.lng,
    label: o.customerName.trim().isEmpty ? tr('Customer') : o.customerName,
    kind: NavKindCustomerStop(o.orderId),
    address: '${o.addressLine}, ${o.city}',
    phone: o.customerPhone,
    stopNumber: number,
    upNext: upNext,
  );
}

class _ProblemButton extends StatelessWidget {
  const _ProblemButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Material(
      color: c.errorSoftBg,
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Tooltip(
          message: tr('Report an issue'),
          child: SizedBox(width: 44, height: 44, child: Icon(Icons.warning_amber_rounded, color: c.errorStrong, size: 22)),
        ),
      ),
    );
  }
}
