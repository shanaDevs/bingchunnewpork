import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/events.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../data/models/delivery_route.dart';
import '../../state/job_controllers.dart';
import '../app_routes.dart';
import '../components/buttons.dart';
import '../components/driver_ops.dart';
import '../components/route_map.dart';
import '../components/run_kit.dart';
import '../components/stop_card.dart';
import '../components/surfaces.dart';
import '../theme/bc_theme.dart';
import 'job_sheets.dart';
import 'navigation_screen.dart';
import '../../l10n/l10n.dart';

/// Full-screen route map with the run's action bar — port of RouteMapScreen.kt.
class RouteMapScreen extends StatelessWidget {
  const RouteMapScreen({super.key, required this.jobId});
  final String jobId;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => DashboardController(ctx.read<AppContainer>())..load(jobId),
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
  int _refitKey = 0;
  double _barHeight = 0;
  final _barKey = GlobalKey();
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

  void _measureBar() {
    final box = _barKey.currentContext?.findRenderObject() as RenderBox?;
    final h = box?.size.height ?? 0;
    if (h != _barHeight && mounted) setState(() => _barHeight = h);
  }

  Future<void> _googleMaps(double lat, double lng, String label) async {
    final messenger = ScaffoldMessenger.of(context);
    final err = await Intents.navigateTo(lat, lng, label: label);
    if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<DashboardController>();
    final tracker = context.read<AppContainer>().locationTracker;
    WidgetsBinding.instance.addPostFrameCallback((_) => _measureBar());

    return ListenableBuilder(
      listenable: tracker,
      builder: (context, _) {
        final job = vm.job;
        final route = vm.route;
        if (job != null && job.isActive && !_askedLocation) {
          _askedLocation = true;
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            if (await ensureLocationPermission()) await tracker.start(job.id);
          });
        }
        final stops = [...?job?.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
        final nextStop = stops.where((o) => o.isPending).firstOrNull;
        final fix = tracker.lastFix;
        double? distanceM;
        if (job != null && fix != null) {
          distanceM = haversineMetres(
            fix.lat,
            fix.lng,
            job.needsPickup ? job.pickupNavLat : job.store.lat,
            job.needsPickup ? job.pickupNavLng : job.store.lng,
          );
        }
        final within = job == null
            ? false
            : job.needsPickup
            ? job.pickupUnlockedAt(distanceM)
            : job.canCompleteAt(distanceM);
        final inProgressNav = job?.status == 'IN_PROGRESS' && nextStop != null;
        final primaryLabel = job == null
            ? null
            : job.needsPickup
            ? tr('Confirm pickup')
            : job.canStart
            ? tr('Start delivery')
            : job.isReturning && within
            ? tr('Complete Ride')
            : job.isReturning
            ? tr('Return to branch')
            : null;
        final chipStatus = job == null
            ? null
            : job.needsPickup
            ? 'PICKUP'
            : job.canStart
            ? 'PICKED_UP'
            : job.isReturning
            ? 'RETURNING'
            : job.status;

        Widget content;
        if (vm.loading && job == null) {
          content = Center(child: CircularProgressIndicator(color: c.brand));
        } else if (job == null) {
          content = Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(vm.error ?? tr('Not found'), style: TextStyle(color: c.textMuted)),
            ),
          );
        } else if (route == null) {
          content = Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(tr('Route unavailable'), style: BcType.body.copyWith(color: c.textMuted)),
            ),
          );
        } else {
          final activeSeq = nextStop?.sequence ?? route.nextStopSequence;
          final top = MediaQuery.paddingOf(context).top;
          content = Stack(
            children: [
              Positioned.fill(
                child: RouteMap(
                  route: route,
                  showDriverLocation: job.isActive,
                  liveTarget: liveRouteTarget(route, job, activeSeq),
                  activeStopSequence: activeSeq,
                  bottomInset: _barHeight,
                  refitKey: _refitKey,
                  // No geofence applies at a pickup-override spot — don't draw a misleading ring.
                  pickupRadiusM: job.hasPickupOverride ? null : job.store.completionRadiusM,
                ),
              ),
              Positioned(
                top: top + 8,
                left: 12,
                right: 12,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _FloatingHeader(
                      title: tr('Cup run'),
                      subtitle:
                          '${Format.rideIdLabel(job.rideCode, job.id)} · ${Format.shortBranchName(job.store.name)}',
                      status: chipStatus == null ? null : statusLabel(context, chipStatus).$1,
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _MapChip(
                          icon: Icons.location_on_rounded,
                          label: trn(route.summary.stopCount, '{n} stop', '{n} stops'),
                          tint: c.brand,
                        ),
                        _MapChip(
                          icon: Icons.route_rounded,
                          label: Format.km(route.summary.totalDistanceKm),
                          tint: c.success,
                        ),
                        _MapChip(
                          icon: Icons.schedule_rounded,
                          label: Format.minutes(route.summary.estimatedMinutes),
                          tint: c.warning,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Positioned(
                top: top + 128,
                right: 12,
                child: MapControlButton(
                  icon: Icons.my_location,
                  label: tr('Recentre route'),
                  onTap: () => setState(() => _refitKey++),
                ),
              ),
              if (inProgressNav || primaryLabel != null || job.canReject || job.isReturning)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: KeyedSubtree(
                    key: _barKey,
                    child: Container(
                      decoration: BoxDecoration(
                        color: c.card,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                        boxShadow: [
                          BoxShadow(
                            color: c.isDark ? const Color(0x55000000) : const Color(0x260A2647),
                            blurRadius: 24,
                            offset: const Offset(0, -4),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(16, 10, 16, 14 + MediaQuery.paddingOf(context).bottom),
                        child: inProgressNav
                            ? Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  const _PanelHandle(),
                                  RunCardHeader(
                                    icon: Icons.person_pin_circle_rounded,
                                    title: tr('Stop {n} · {name}', {
                                      'n': '${stops.indexOf(nextStop) + 1}'.padLeft(2, '0'),
                                      'name': nextStop.customerName.trim().isEmpty
                                          ? tr('Customer')
                                          : nextStop.customerName,
                                    }),
                                    subtitle: nextStop.shortAddress,
                                  ),
                                  const SizedBox(height: 14),
                                  InProgressStopIconBar(
                                    canNavigate: nextStop.lat != null && nextStop.lng != null,
                                    onOpenNextSite: () => AppRoutes.openOrder(context, widget.jobId, nextStop.orderId),
                                    onOpenMap: () {
                                      if (nextStop.lat != null) {
                                        _googleMaps(nextStop.lat!, nextStop.lng!, nextStop.customerName);
                                      }
                                    },
                                    onNavigateInApp: () {
                                      if (nextStop.lat == null || nextStop.lng == null) return;
                                      NavigationScreen.open(
                                        context,
                                        NavTarget(
                                          lat: nextStop.lat!,
                                          lng: nextStop.lng!,
                                          label: nextStop.customerName,
                                          kind: NavKindCustomerStop(nextStop.orderId),
                                        ),
                                        actionBuilder: (ctx) => NavCustomerStop(
                                          callEnabled: nextStop.customerPhone.trim().isNotEmpty,
                                          onCall: () => Intents.dial(nextStop.customerPhone),
                                          onOpenOrder: () {
                                            Navigator.of(ctx).pop();
                                            AppRoutes.openOrder(context, widget.jobId, nextStop.orderId);
                                          },
                                        ),
                                      );
                                    },
                                  ),
                                ],
                              )
                            : Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  const _PanelHandle(),
                                  Builder(
                                    builder: (_) {
                                      final preview = stops.where((o) => o.isPending).take(3).toList();
                                      if (preview.isEmpty) return const SizedBox.shrink();
                                      return Padding(
                                        padding: const EdgeInsets.only(bottom: 10),
                                        child: StopPreviewList(
                                          stops: [
                                            for (final o in preview)
                                              StopPreviewItem(
                                                customerName: o.customerName,
                                                shortAddress: o.shortAddress,
                                                orderId: o.orderId,
                                              ),
                                          ],
                                          onTap: (id) => AppRoutes.openOrder(context, widget.jobId, id),
                                        ),
                                      );
                                    },
                                  ),
                                  RunActionBar(
                                    job: job,
                                    distanceToBranchM: distanceM,
                                    withinBranch: within,
                                    primaryLabel: primaryLabel,
                                    acting: vm.acting,
                                    error: vm.error,
                                    onNavigateBranch: () => job.needsPickup
                                        ? _googleMaps(job.pickupNavLat, job.pickupNavLng, job.pickupPlaceName)
                                        : _googleMaps(job.store.lat, job.store.lng, job.store.name),
                                    onReject: () async {
                                      final reason = await showRejectJobDialog(context);
                                      if (reason == null || !context.mounted) return;
                                      final ok = await vm.reject(widget.jobId, reason);
                                      if (ok && context.mounted) {
                                        BcFeedback.success();
                                        AppRoutes.popToHome(context);
                                      }
                                    },
                                    onPrimary: () async {
                                      if (job.needsPickup) {
                                        if (!await ensureLocationPermission()) return;
                                        BcFeedback.success();
                                        await vm.pickup(widget.jobId);
                                      } else if (job.canStart) {
                                        if (!await ensureLocationPermission()) return;
                                        BcFeedback.success();
                                        await vm.start(widget.jobId);
                                      } else if (job.isReturning && within) {
                                        final f = tracker.lastFix ?? await tracker.getCurrentLocation();
                                        if (f == null) return;
                                        final ok = await vm.complete(widget.jobId, f.lat, f.lng);
                                        if (ok && context.mounted) {
                                          BcFeedback.completed();
                                          AppRoutes.popToHome(context);
                                        }
                                      }
                                    },
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        }
        return Scaffold(backgroundColor: c.background, body: content);
      },
    );
  }
}

class _PanelHandle extends StatelessWidget {
  const _PanelHandle();

  @override
  Widget build(BuildContext context) => Center(
    child: Container(
      width: 40,
      height: 4,
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: context.bc.border, borderRadius: BorderRadius.circular(99)),
    ),
  );
}

/// Back button + gradient title card + status pill, floating over the map.
class _FloatingHeader extends StatelessWidget {
  const _FloatingHeader({required this.title, required this.subtitle, this.status});
  final String title;
  final String subtitle;
  final String? status;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Row(
      children: [
        Material(
          color: c.card,
          shape: const CircleBorder(),
          elevation: 4,
          shadowColor: const Color(0x330A2647),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => Navigator.of(context).maybePop(),
            child: Tooltip(
              message: tr('Back'),
              child: SizedBox(width: 46, height: 46, child: Icon(Icons.arrow_back_rounded, color: c.text)),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 9, 10, 9),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: LinearGradient(
                colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [BoxShadow(color: c.brand.withValues(alpha: 0.3), blurRadius: 14, offset: const Offset(0, 5))],
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12),
                      ),
                    ],
                  ),
                ),
                if (status != null) ...[const SizedBox(width: 8), BcTopBarPill(label: status!)],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// White pill with a tinted icon, floating over the map.
class _MapChip extends StatelessWidget {
  const _MapChip({required this.icon, required this.label, required this.tint});
  final IconData icon;
  final String label;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 6, 12, 6),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(99),
        boxShadow: const [BoxShadow(color: Color(0x220A2647), blurRadius: 10, offset: Offset(0, 3))],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(shape: BoxShape.circle, color: tint.withValues(alpha: 0.14)),
            child: Icon(icon, size: 13, color: tint),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(color: c.text, fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
