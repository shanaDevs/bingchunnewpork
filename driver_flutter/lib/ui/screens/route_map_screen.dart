import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/events.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../data/models/delivery_job.dart';
import '../../data/models/delivery_route.dart';
import '../../l10n/l10n.dart';
import '../../state/job_controllers.dart';
import '../../state/jobs_controller.dart';
import '../app_routes.dart';
import '../components/app_bottom_nav.dart';
import '../components/job_cards.dart';
import '../components/qd_kit.dart';
import '../components/route_map.dart';
import '../theme/bc_theme.dart';

/// QuickDrop "Job Route": the whole job on one full-screen map — the branch, every drop-off
/// and the route through the stops still to do — with the job's next step under it and a
/// Google Maps button over the map. Opened from the Job Details map.
class RouteMapScreen extends StatelessWidget {
  const RouteMapScreen({super.key, required this.jobId});
  final String jobId;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) =>
          DashboardController(ctx.read<AppContainer>(), seed: ActiveJobCache.peek(jobId))..load(jobId, force: true),
      child: _RouteMapBody(jobId: jobId),
    );
  }
}

class _RouteMapBody extends StatefulWidget {
  const _RouteMapBody({required this.jobId});
  final String jobId;

  @override
  State<_RouteMapBody> createState() => _RouteMapBodyState();
}

class _RouteMapBodyState extends State<_RouteMapBody> {
  StreamSubscription<String>? _dropSub;
  bool _askedLocation = false;

  @override
  void initState() {
    super.initState();
    _dropSub = JobRefreshBus.droppedRides.listen((id) {
      if (id == widget.jobId && mounted) Navigator.of(context).maybePop();
    });
  }

  @override
  void dispose() {
    _dropSub?.cancel();
    super.dispose();
  }

  /// Opens Google Maps with the rest of the run: you, the branch (before pickup), then every
  /// stop still to do.
  Future<void> _openGoogleMaps(DeliveryJobDetail job, List<JobOrder> pending) async {
    final fix = context.read<AppContainer>().locationTracker.lastFix;
    final pts = <(double, double)>[
      if (fix != null) (fix.lat, fix.lng),
      if (job.needsPickup) (job.pickupNavLat, job.pickupNavLng),
      for (final o in pending)
        if (o.lat != null && o.lng != null) (o.lat!, o.lng!),
      if (pending.isEmpty && !job.needsPickup) (job.store.lat, job.store.lng),
    ];
    final messenger = ScaffoldMessenger.of(context);
    final err = await Intents.routeThrough(pts);
    if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
  }

  Future<void> _primary(DashboardController vm, DeliveryJobDetail job, JobOrder? next) async {
    BcFeedback.tap();
    if (job.canStart) {
      if (!await ensureLocationPermission()) return;
      BcFeedback.success();
      await vm.start(widget.jobId);
      // A failed start leaves its message in the controller; stay here so it can show.
      if (!mounted || vm.error != null) return;
    }
    if (!mounted) return;
    AppRoutes.openDashboard(context, widget.jobId, legOrderId: job.needsPickup ? null : next?.orderId);
  }

  Widget _title(BuildContext context, {Widget? body}) {
    final c = context.bc;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: c.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: c.background,
        bottomNavigationBar: const AppBottomNav.overShell(),
        body: Column(
          children: [
            QdAppBar(title: tr('Job Route'), trailing: const QdBellButton()),
            Expanded(child: body ?? const SizedBox.shrink()),
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

    return ListenableBuilder(
      listenable: tracker,
      builder: (context, _) {
        final job = vm.job;
        if (job == null) {
          return _title(
            context,
            body: Center(
              child: vm.loading
                  ? CircularProgressIndicator(color: c.primaryStrong)
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(vm.error ?? tr('Job not found'), style: TextStyle(color: c.mutedForeground)),
                    ),
            ),
          );
        }
        if (job.isActive && !_askedLocation) {
          _askedLocation = true;
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            if (await ensureLocationPermission()) await tracker.start(job.id);
          });
        }

        // The route arrives a moment after the job; until then (or if it can't be fetched)
        // draw the straight stops from the job itself so the map never comes up empty.
        final route = vm.route ?? fallbackRouteFor(job);
        final stops = [...job.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
        final pending = stops.where((o) => o.isPending).toList();
        final next = pending.firstOrNull;
        final nextNumber = next == null ? null : stops.indexOf(next) + 1;
        final activeSeq = next?.sequence ?? route.nextStopSequence;
        final viaBranch = job.needsPickup;
        final allDone = !viaBranch && pending.isEmpty && !job.isReturning;
        final showAction = job.isActive && !job.canAssign;
        final ride = Format.rideIdLabel(job.rideCode, job.id).replaceFirst('·', '•');

        final primaryLabel = job.needsPickup
            ? tr('Navigate to pickup')
            : (job.canStart || job.status == 'IN_PROGRESS') && nextNumber != null
            ? tr('Navigate to order {n}', {'n': nextNumber})
            : tr('Navigate to branch');

        return _title(
          context,
          body: Column(
            children: [
              Expanded(
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: RouteMap(
                        route: route,
                        showDriverLocation: job.isActive,
                        liveTarget: liveRouteTarget(route, job, activeSeq),
                        activeStopSequence: activeSeq,
                        pickupRadiusM: job.hasPickupOverride ? null : job.store.completionRadiusM,
                      ),
                    ),
                    Positioned(
                      right: 12,
                      bottom: 16,
                      child: Material(
                        color: c.inverse,
                        shape: const CircleBorder(),
                        elevation: 4,
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () => _openGoogleMaps(job, pending),
                          child: Tooltip(
                            message: tr('Open in Google Maps'),
                            child: SizedBox(
                              width: 56,
                              height: 56,
                              child: Icon(Icons.directions_rounded, color: c.primary, size: 28),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(BcRadius.xl)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: c.isDark ? 0.4 : 0.12),
                      blurRadius: 24,
                      offset: const Offset(0, -8),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      ride.toUpperCase(),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1, color: c.primary),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      allDone
                          ? tr('All orders delivered')
                          : '${Format.km(route.summary.totalDistanceKm)} · ${Format.minutes(route.summary.estimatedMinutes)}',
                      style: BcType.title.copyWith(color: c.foreground, fontSize: 26),
                    ),
                    if (!allDone) ...[
                      const SizedBox(height: 2),
                      Text(
                        viaBranch
                            ? trn(pending.length, 'Via the branch, then {n} drop-off', 'Via the branch, then {n} drop-offs')
                            : trn(pending.length, '{n} stop left', '{n} stops left'),
                        style: TextStyle(fontSize: 14, color: c.mutedForeground),
                      ),
                    ],
                    const SizedBox(height: 14),
                    Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        _Legend(
                          swatch: const Color(0xFF101828),
                          border: Colors.white,
                          icon: const Icon(Icons.storefront_outlined, size: 12, color: Colors.white),
                          label: tr('Pickup'),
                        ),
                        _Legend(
                          swatch: Colors.white,
                          border: const Color(0xFF2563EB),
                          icon: const Icon(Icons.place_outlined, size: 12, color: Color(0xFF2563EB)),
                          label: tr('Drop-off'),
                        ),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 20,
                              height: 4,
                              decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(99)),
                            ),
                            const SizedBox(width: 6),
                            Text(tr('Route'), style: TextStyle(fontSize: 13, color: c.mutedForeground)),
                          ],
                        ),
                      ],
                    ),
                    if (allDone) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: c.successSoft, borderRadius: BorderRadius.circular(BcRadius.md)),
                        child: Row(
                          children: [
                            Icon(Icons.check_circle_outline_rounded, color: c.successStrong, size: 22),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                tr('Head back to the branch to complete the job.'),
                                style: TextStyle(fontSize: 14, color: c.foreground, height: 1.35),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (showAction) ...[
                      const SizedBox(height: 14),
                      PillButton(
                        label: primaryLabel,
                        icon: Icons.navigation_outlined,
                        height: 56,
                        loading: vm.acting,
                        onTap: () => _primary(vm, job, next),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.swatch, required this.border, required this.icon, required this.label});
  final Color swatch;
  final Color border;
  final Widget icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: swatch, border: Border.all(color: border, width: 1.5)),
          child: icon,
        ),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(fontSize: 13, color: context.bc.mutedForeground)),
      ],
    );
  }
}
