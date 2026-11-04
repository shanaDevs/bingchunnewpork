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
import '../../state/job_controllers.dart';
import '../../tracking/location_tracker.dart';
import '../app_routes.dart';
import '../components/buttons.dart';
import '../components/route_map.dart';
import '../components/run_kit.dart';
import '../components/stop_card.dart';
import '../theme/bc_theme.dart';
import 'job_sheets.dart';
import 'navigation_screen.dart';
import '../../l10n/l10n.dart';

/// Geofence state derived from the live fix — shared by the dashboard and its nav screen.
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

/// Port of DashboardScreen.kt — the active run.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, required this.jobId});
  final String jobId;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => DashboardController(ctx.read<AppContainer>())..load(jobId),
      child: _DashboardBody(jobId: jobId),
    );
  }
}

class _DashboardBody extends StatefulWidget {
  const _DashboardBody({required this.jobId});
  final String jobId;

  @override
  State<_DashboardBody> createState() => _DashboardBodyState();
}

class _DashboardBodyState extends State<_DashboardBody> with WidgetsBindingObserver {
  StreamSubscription<String>? _dropSub;
  bool _askedLocation = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _dropSub = JobRefreshBus.droppedRides.listen((id) {
      if (id == widget.jobId && mounted) AppRoutes.popToHome(context);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _dropSub?.cancel();
    super.dispose();
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

  Future<void> _reject() async {
    final reason = await showRejectJobDialog(context);
    if (reason == null || !mounted) return;
    final ok = await _vm.reject(widget.jobId, reason);
    if (ok && mounted) {
      BcFeedback.success();
      AppRoutes.popToHome(context);
    }
  }

  Future<void> _dial(String phone) async {
    if (phone.trim().isEmpty) return;
    final messenger = ScaffoldMessenger.of(context);
    final err = await Intents.dial(phone);
    if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
  }

  Future<void> _googleMaps(double lat, double lng, String label) async {
    final messenger = ScaffoldMessenger.of(context);
    final err = await Intents.navigateTo(lat, lng, label: label);
    if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
  }

  void _openNav(NavTarget target) {
    final vm = _vm;
    NavigationScreen.open(
      context,
      target,
      wrap: (child) => ChangeNotifierProvider<DashboardController>.value(value: vm, child: child),
      actionBuilder: (ctx) {
        final state = ctx.watch<DashboardController>();
        final job = state.job;
        final geo = _Geo.of(job, ctx.read<AppContainer>().locationTracker.lastFix);
        final kind = target.kind;
        if (kind is NavKindPickup) {
          // Auto-dismiss once pickup is confirmed so the screen doesn't linger stale.
          if (job != null && !job.needsPickup) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (ctx.mounted) Navigator.of(ctx).maybePop();
            });
            return null;
          }
          return NavConfirmPickup(
            enabled: geo.within,
            loading: state.acting,
            geofenceHint: geo.hint,
            onConfirm: _confirmPickup,
          );
        }
        if (kind is NavKindReturn) {
          return NavCompleteRide(
            enabled: geo.within,
            loading: state.acting,
            onComplete: () async {
              final nav = Navigator.of(ctx);
              await _complete();
              if (nav.mounted && nav.canPop()) nav.maybePop();
            },
          );
        }
        if (kind is NavKindCustomerStop) {
          final order = job?.orders.where((o) => o.orderId == kind.orderId).firstOrNull;
          if (order == null) return null;
          return NavCustomerStop(
            callEnabled: order.customerPhone.trim().isNotEmpty,
            onCall: () => _dial(order.customerPhone),
            onOpenOrder: () {
              Navigator.of(ctx).pop();
              AppRoutes.openOrder(context, widget.jobId, order.orderId);
            },
          );
        }
        return null;
      },
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
        if (job != null && job.isActive && !_askedLocation) {
          _askedLocation = true;
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            if (await ensureLocationPermission()) await tracker.start(job.id);
          });
        }
        final stops = [...?job?.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
        final nextStop = stops.where((o) => o.isPending).firstOrNull;
        final geo = _Geo.of(job, tracker.lastFix);
        final showBottomBar =
            job != null && (job.needsPickup || job.canStart || job.isReturning || (job.pickedUp && nextStop != null));

        Widget body;
        if (vm.loading && job == null) {
          body = Center(child: CircularProgressIndicator(color: c.brand));
        } else if (job == null) {
          body = Center(
            child: Text(vm.error ?? tr('Job not found'), style: TextStyle(color: c.textMuted)),
          );
        } else {
          final route = vm.route;
          final stopCount = route?.summary.stopCount ?? job.orderCount;
          final progress = job.orderCount == 0 ? 0.0 : job.deliveredCount / job.orderCount;
          body = ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              _ActiveHeroCard(job: job, progress: progress, nextStopName: nextStop?.customerName),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _TripMetric(
                      icon: Icons.location_on_rounded,
                      value: '$stopCount',
                      label: tr('Stops'),
                      tint: c.brand,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _TripMetric(
                      icon: Icons.alt_route_rounded,
                      value: Format.km(route?.summary.totalDistanceKm ?? job.estimatedDistanceKm ?? 0),
                      label: tr('Distance'),
                      tint: c.success,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _TripMetric(
                      icon: Icons.schedule_rounded,
                      value: Format.minutes(route?.summary.estimatedMinutes ?? job.estimatedMinutes ?? 0),
                      label: tr('ETA'),
                      tint: c.warning,
                    ),
                  ),
                ],
              ),
              if (route != null) ...[
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(BcRadius.card),
                  child: MiniRouteMap(
                    route: route,
                    onTap: () => AppRoutes.openMap(context, widget.jobId),
                    activeStopSequence: nextStop?.sequence ?? route.nextStopSequence,
                    showDriverLocation: job.isActive,
                    gpsActive: job.isActive,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              if (job.needsPickup)
                _OutletPickupCard(
                  storeName: job.pickupPlaceName,
                  distanceM: geo.distanceM == null ? null : Format.metresAway(geo.distanceM!),
                  within: geo.within,
                  radiusM: job.store.completionRadiusM,
                  hint: geo.hint ?? tr('Getting GPS…'),
                  acting: vm.acting,
                  isOverride: job.hasPickupOverride,
                  onNavigate: () => _openNav(
                    NavTarget(
                      lat: job.pickupNavLat,
                      lng: job.pickupNavLng,
                      label: job.pickupPlaceName,
                      kind: const NavKindPickup(),
                    ),
                  ),
                  onGoogleMaps: () => _googleMaps(job.pickupNavLat, job.pickupNavLng, job.pickupPlaceName),
                  onConfirm: _confirmPickup,
                  onReject: _reject,
                )
              else if (job.canStart)
                RunCard(
                  borderColor: c.brand.withValues(alpha: 0.4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      RunCardHeader(
                        icon: Icons.inventory_2_rounded,
                        title: tr('Ready to start delivery?'),
                        subtitle: tr(
                          'Parcels are collected from {name}. Start delivery to route to the first customer stop.',
                          {'name': job.store.name},
                        ),
                      ),
                      const SizedBox(height: 16),
                      RunPrimaryButton(
                        label: tr('Start delivery'),
                        icon: Icons.play_arrow_rounded,
                        loading: vm.acting,
                        onPressed: _start,
                      ),
                    ],
                  ),
                )
              else if (job.isReturning)
                _ReturnToBranchCard(
                  storeName: job.store.name,
                  distanceM: geo.distanceM?.toInt(),
                  within: geo.within,
                  radiusM: job.store.completionRadiusM,
                  acting: vm.acting,
                  onNavigate: () => _openNav(
                    NavTarget(
                      lat: job.store.lat,
                      lng: job.store.lng,
                      label: job.store.name,
                      kind: const NavKindReturn(),
                    ),
                  ),
                  onGoogleMaps: () => _googleMaps(job.store.lat, job.store.lng, job.store.name),
                  onComplete: _complete,
                ),
              // Orders / stops — visible after accept; Call / Navigate stay locked until pickup.
              if (stops.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, 22, 2, 2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          job.needsPickup ? tr('Orders to pick up') : tr('Delivery stops'),
                          style: TextStyle(color: c.text, fontSize: 18, fontWeight: FontWeight.w800),
                        ),
                      ),
                      RunPill(
                        label: '${job.deliveredCount}/${job.orderCount}',
                        color: c.brand,
                        icon: Icons.check_circle_outline_rounded,
                      ),
                    ],
                  ),
                ),
                for (var i = 0; i < stops.length; i++) ...[
                  const SizedBox(height: 12),
                  Builder(
                    builder: (_) {
                      final order = stops[i];
                      final isNext = nextStop?.orderId == order.orderId;
                      return DriverStopCard(
                        stopNumber: order.sequence > 0 ? order.sequence : i + 1,
                        order: order,
                        highlighted: job.pickedUp && isNext,
                        showItems: true,
                        showCustomerActions: job.pickedUp && isNext,
                        onOpen: () {
                          BcFeedback.tap();
                          AppRoutes.openOrder(context, widget.jobId, order.orderId);
                        },
                        onCall: () => _dial(order.customerPhone),
                        onNavigate: () {
                          if (order.lat != null && order.lng != null) {
                            _openNav(
                              NavTarget(
                                lat: order.lat!,
                                lng: order.lng!,
                                label: order.customerName,
                                kind: NavKindCustomerStop(order.orderId),
                              ),
                            );
                          }
                        },
                        onOpenGoogleMaps: () {
                          if (order.lat != null && order.lng != null) {
                            _googleMaps(order.lat!, order.lng!, order.customerName);
                          }
                        },
                      );
                    },
                  ),
                ],
              ],
              const SizedBox(height: 16),
            ],
          );
        }

        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.light,
          child: Scaffold(
            backgroundColor: c.background,
            body: Column(
              children: [
                _DashboardTopBar(job: job),
                Expanded(child: body),
              ],
            ),
            bottomNavigationBar: showBottomBar
                ? _ActiveRunBottomBar(
                    job: job,
                    nextStop: nextStop,
                    within: geo.within,
                    hint: geo.hint,
                    acting: vm.acting,
                    error: vm.error,
                    onConfirmPickup: _confirmPickup,
                    onStart: _start,
                    onComplete: _complete,
                    onCall: () => _dial(nextStop?.customerPhone ?? ''),
                    onNavigate: () {
                      final s = nextStop;
                      if (s?.lat != null && s?.lng != null) {
                        _openNav(
                          NavTarget(
                            lat: s!.lat!,
                            lng: s.lng!,
                            label: s.customerName,
                            kind: NavKindCustomerStop(s.orderId),
                          ),
                        );
                      }
                    },
                    onGoogleMaps: () {
                      final s = nextStop;
                      if (s?.lat != null && s?.lng != null) _googleMaps(s!.lat!, s.lng!, s.customerName);
                    },
                    onContinue: () {
                      final s = nextStop;
                      if (s != null) AppRoutes.openOrder(context, widget.jobId, s.orderId);
                    },
                  )
                : null,
          ),
        );
      },
    );
  }
}

class _DashboardTopBar extends StatelessWidget {
  const _DashboardTopBar({required this.job});
  final DeliveryJobDetail? job;

  @override
  Widget build(BuildContext context) {
    final j = job;
    final pill = j == null || j.needsPickup
        ? tr('Pickup')
        : j.canStart
        ? tr('Ready')
        : j.isReturning
        ? tr('Returning')
        : tr('Delivering');
    return BcDetailTopBar(
      title: tr('Active run'),
      subtitle: j == null ? null : Format.rideIdLabel(j.rideCode, j.id),
      onBack: () => AppRoutes.popToHome(context),
      trailing: BcTopBarPill(
        label: pill,
        dotColor: j != null && j.isReturning ? const Color(0xFFFBBF24) : const Color(0xFF4ADE80),
      ),
    );
  }
}

class _ActiveHeroCard extends StatelessWidget {
  const _ActiveHeroCard({required this.job, required this.progress, required this.nextStopName});
  final DeliveryJobDetail job;
  final double progress;
  final String? nextStopName;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final status = job.needsPickup
        ? tr('Pickup in progress')
        : job.canStart
        ? tr('Pickup completed')
        : job.isReturning
        ? tr('Returning to branch')
        : tr('Delivery in progress');
    final detail = job.needsPickup
        ? tr('Confirm pickup at {name}', {'name': job.store.name})
        : job.canStart
        ? tr('Ready to start delivery')
        : nextStopName != null
        ? tr('Delivering to {nextStopName}', {'nextStopName': nextStopName})
        : tr('Return to {name}', {'name': job.store.name});
    final step = job.needsPickup || job.canStart
        ? 0
        : job.isReturning
        ? 2
        : 1;
    final muted = Colors.white.withValues(alpha: 0.85);
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BcRadius.card + 2),
        gradient: LinearGradient(
          colors: [c.brandLight, c.brand, c.brandDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [BoxShadow(color: c.brand.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -30,
            top: -40,
            child: Container(
              width: 140,
              height: 140,
              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.08)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 10)],
                      ),
                      child: Icon(Icons.local_shipping_rounded, color: c.brand, size: 26),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            status,
                            style: TextStyle(color: muted, fontSize: 12.5, fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            Format.deliverySummary(job.orderCount, job.totalCups),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            detail,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: muted, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                RunStepper(step: step),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(end: progress),
                        duration: BcMotion.slow,
                        curve: Curves.easeOut,
                        builder: (_, v, _) => ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: LinearProgressIndicator(
                            value: v,
                            minHeight: 6,
                            color: Colors.white,
                            backgroundColor: Colors.white.withValues(alpha: 0.25),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      tr('{deliveredCount} of {orderCount} completed', {
                        'deliveredCount': job.deliveredCount,
                        'orderCount': job.orderCount,
                      }),
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TripMetric extends StatelessWidget {
  const _TripMetric({required this.icon, required this.value, required this.label, required this.tint});
  final IconData icon;
  final String value;
  final String label;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return RunCard(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      child: Column(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(11)),
            child: Icon(icon, color: tint, size: 18),
          ),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(color: c.text, fontWeight: FontWeight.w800, fontSize: 15),
            ),
          ),
          const SizedBox(height: 1),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: c.textMuted, fontSize: 11.5, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

class _OutletPickupCard extends StatelessWidget {
  const _OutletPickupCard({
    required this.storeName,
    required this.distanceM,
    required this.within,
    required this.radiusM,
    required this.hint,
    required this.acting,
    required this.isOverride,
    required this.onNavigate,
    required this.onGoogleMaps,
    required this.onConfirm,
    required this.onReject,
  });

  final String storeName;
  final int? distanceM;
  final bool within;
  final int radiusM;
  final String hint;
  final bool acting;
  final bool isOverride;
  final VoidCallback onNavigate;
  final VoidCallback onGoogleMaps;
  final VoidCallback onConfirm;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final red = c.isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626);
    return RunCard(
      borderColor: within ? c.success.withValues(alpha: 0.5) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RunCardHeader(
            icon: Icons.storefront_rounded,
            title: isOverride ? tr('Confirm pickup') : tr('Confirm pickup at the outlet'),
            subtitle: storeName,
            trailing: RunPill(
              label: distanceM == null ? tr('Getting GPS…') : tr('{distanceM} m away', {'distanceM': distanceM}),
              color: within ? c.success : c.textMuted,
              icon: within ? Icons.check_circle_rounded : Icons.near_me_rounded,
            ),
          ),
          const SizedBox(height: 14),
          RunNote(
            icon: Icons.verified_user_outlined,
            color: within ? c.success : c.brand,
            text: isOverride
                ? tr('No location check needed — you were assigned directly to this pickup.')
                : tr('Pickup confirmation is available within {radiusM} m of the branch.', {'radiusM': radiusM}),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(hint, style: TextStyle(color: c.textMuted, fontSize: 12)),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: RunOutlineButton(
                  label: tr('Navigate to branch'),
                  icon: Icons.navigation_rounded,
                  onPressed: onNavigate,
                ),
              ),
              const SizedBox(width: 10),
              GoogleMapsIconButton(onTap: onGoogleMaps),
            ],
          ),
          const SizedBox(height: 10),
          RunPrimaryButton(
            label: tr('Confirm pickup'),
            icon: Icons.check_circle_rounded,
            enabled: within,
            locked: !within,
            loading: acting,
            onPressed: onConfirm,
          ),
          const SizedBox(height: 6),
          TextButton.icon(
            onPressed: acting
                ? null
                : () {
                    BcFeedback.tap();
                    onReject();
                  },
            style: TextButton.styleFrom(foregroundColor: red),
            icon: const Icon(Icons.do_not_disturb_on_outlined, size: 18),
            label: Text(tr('Reject job'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          ),
        ],
      ),
    );
  }
}

class _ReturnToBranchCard extends StatelessWidget {
  const _ReturnToBranchCard({
    required this.storeName,
    required this.distanceM,
    required this.within,
    required this.radiusM,
    required this.acting,
    required this.onNavigate,
    required this.onGoogleMaps,
    required this.onComplete,
  });

  final String storeName;
  final int? distanceM;
  final bool within;
  final int radiusM;
  final bool acting;
  final VoidCallback onNavigate;
  final VoidCallback onGoogleMaps;
  final VoidCallback onComplete;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final distHint = distanceM == null ? tr('Getting GPS…') : tr('{distanceM} m away', {'distanceM': distanceM});
    return RunCard(
      borderColor: within ? c.success.withValues(alpha: 0.5) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RunCardHeader(
            icon: Icons.flag_rounded,
            tint: c.warning,
            bg: c.warningSubtle,
            title: tr('Return to branch to complete'),
            subtitle: storeName,
            trailing: RunPill(
              label: distHint,
              color: within ? c.success : c.textMuted,
              icon: within ? Icons.check_circle_rounded : Icons.near_me_rounded,
            ),
          ),
          const SizedBox(height: 14),
          RunNote(
            icon: within ? Icons.check_circle_outline_rounded : Icons.info_outline_rounded,
            color: within ? c.success : c.warning,
            text: within
                ? tr('You are within {radiusM}m of {storeName}. Complete Ride is available.', {
                    'radiusM': radiusM,
                    'storeName': storeName,
                  })
                : tr('Navigate back to {storeName} ({distHint}). Complete Ride unlocks within {radiusM}m.', {
                    'storeName': storeName,
                    'distHint': distHint,
                    'radiusM': radiusM,
                  }),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: RunOutlineButton(
                  label: tr('Navigate to branch'),
                  icon: Icons.navigation_rounded,
                  onPressed: onNavigate,
                ),
              ),
              const SizedBox(width: 10),
              GoogleMapsIconButton(onTap: onGoogleMaps),
            ],
          ),
          const SizedBox(height: 10),
          RunPrimaryButton(
            label: tr('Complete Ride'),
            icon: Icons.flag_circle_rounded,
            enabled: within,
            locked: !within,
            loading: acting,
            onPressed: onComplete,
          ),
        ],
      ),
    );
  }
}

class _ActiveRunBottomBar extends StatelessWidget {
  const _ActiveRunBottomBar({
    required this.job,
    required this.nextStop,
    required this.within,
    required this.hint,
    required this.acting,
    required this.error,
    required this.onConfirmPickup,
    required this.onStart,
    required this.onComplete,
    required this.onCall,
    required this.onNavigate,
    required this.onGoogleMaps,
    required this.onContinue,
  });

  final DeliveryJobDetail job;
  final JobOrder? nextStop;
  final bool within;
  final String? hint;
  final bool acting;
  final String? error;
  final VoidCallback onConfirmPickup;
  final VoidCallback onStart;
  final VoidCallback onComplete;
  final VoidCallback onCall;
  final VoidCallback onNavigate;
  final VoidCallback onGoogleMaps;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    Widget heading(IconData icon, String text, {String? sub}) => Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(11)),
          child: Icon(icon, color: c.brand, size: 19),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: c.text, fontWeight: FontWeight.w800, fontSize: 15),
              ),
              if (sub != null)
                Text(
                  sub,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: c.textMuted, fontSize: 12),
                ),
            ],
          ),
        ),
      ],
    );

    final children = <Widget>[];
    if (error != null) {
      children.add(RunNote(icon: Icons.error_outline_rounded, text: error!, color: c.danger));
    }
    if (job.needsPickup) {
      children.addAll([
        heading(
          Icons.storefront_rounded,
          job.hasPickupOverride ? tr('Confirm pickup') : tr('Confirm pickup at the outlet'),
          sub: hint ?? tr('Getting GPS…'),
        ),
        RunPrimaryButton(
          label: tr('Confirm pickup'),
          icon: Icons.check_circle_rounded,
          loading: acting,
          enabled: within,
          locked: !job.hasPickupOverride && !within,
          onPressed: onConfirmPickup,
        ),
      ]);
    } else if (job.canStart) {
      children.addAll([
        heading(Icons.inventory_2_rounded, tr('Ready to start delivery?')),
        RunPrimaryButton(
          label: tr('Start delivery'),
          icon: Icons.play_arrow_rounded,
          loading: acting,
          onPressed: onStart,
        ),
      ]);
    } else if (job.isReturning) {
      children.addAll([
        heading(Icons.flag_rounded, tr('Return to branch to complete')),
        RunPrimaryButton(
          label: tr('Complete Ride'),
          icon: Icons.flag_circle_rounded,
          loading: acting,
          enabled: within,
          locked: !within,
          onPressed: onComplete,
        ),
      ]);
    } else if (nextStop != null) {
      final s = nextStop!;
      final n = s.sequence > 0 ? s.sequence : 1;
      children.addAll([
        heading(
          Icons.person_pin_circle_rounded,
          tr('Stop {n} · {name}', {
            'n': '$n'.padLeft(2, '0'),
            'name': s.customerName.trim().isEmpty ? tr('Customer') : s.customerName,
          }),
          sub: s.shortAddress,
        ),
        StopCustomerActions(
          canCall: s.customerPhone.trim().isNotEmpty,
          canNavigate: s.lat != null && s.lng != null,
          onCall: onCall,
          onNavigate: onNavigate,
          onOpenGoogleMaps: onGoogleMaps,
          extra: RoundActionIcon(caption: tr('Continue'), icon: Icons.arrow_forward, filled: true, onTap: onContinue),
        ),
      ]);
    }
    return Container(
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: c.isDark ? const Color(0x55000000) : const Color(0x1F0A2647),
            blurRadius: 24,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      padding: EdgeInsets.fromLTRB(16, 10, 16, 14 + MediaQuery.paddingOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(99)),
            ),
          ),
          for (var i = 0; i < children.length; i++) ...[if (i > 0) const SizedBox(height: 12), children[i]],
        ],
      ),
    );
  }
}
