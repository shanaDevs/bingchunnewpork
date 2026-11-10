import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/events.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../data/models/delivery_route.dart';
import '../../state/job_controllers.dart';
import '../app_routes.dart';
import '../components/app_bottom_nav.dart';
import '../components/call_confirm.dart';
import '../components/job_cards.dart';
import '../components/qd_kit.dart';
import '../components/route_map.dart';
import '../components/run_kit.dart';
import '../components/surfaces.dart';
import '../theme/bc_theme.dart';
import 'job_sheets.dart';
import '../../l10n/l10n.dart';

/// Port of JobDetailScreen.kt — scheduled/claimed job stops, or a finished-run receipt.
class JobDetailScreen extends StatelessWidget {
  const JobDetailScreen({super.key, required this.jobId});
  final String jobId;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => JobDetailController(ctx.read<AppContainer>())..load(jobId, force: true),
      child: _JobDetailBody(jobId: jobId),
    );
  }
}

class _JobDetailBody extends StatefulWidget {
  const _JobDetailBody({required this.jobId});
  final String jobId;

  @override
  State<_JobDetailBody> createState() => _JobDetailBodyState();
}

class _JobDetailBodyState extends State<_JobDetailBody> with WidgetsBindingObserver {
  StreamSubscription<String>? _dropSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _dropSub = JobRefreshBus.droppedRides.listen((id) {
      if (id == widget.jobId && mounted) Navigator.of(context).maybePop();
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
    if (state == AppLifecycleState.resumed) context.read<JobDetailController>().load(widget.jobId, force: true);
  }

  /// The next order to deliver, in stop order.
  JobOrder? _nextPending(DeliveryJobDetail job) =>
      ([...job.orders]..sort((a, b) => a.sequence.compareTo(b.sequence))).where((o) => o.isPending).firstOrNull;

  Future<void> _primary(JobDetailController vm, DeliveryJobDetail job) async {
    BcFeedback.tap();
    if (job.status == 'COMPLETED') {
      Navigator.of(context).pop();
    } else if (job.canAssign) {
      await _claim(vm, job);
    } else if (job.needsPickup) {
      // The dashboard has the pickup navigation and the geofenced "Confirm pickup".
      AppRoutes.openDashboard(context, widget.jobId, replace: true);
    } else if (job.canStart) {
      final tracker = context.read<AppContainer>().locationTracker;
      if (!await ensureLocationPermission()) return;
      if (!await tracker.isLocationEnabled()) return;
      BcFeedback.success();
      final next = _nextPending(job);
      final ok = await vm.start(widget.jobId);
      if (ok && mounted) AppRoutes.openDashboard(context, widget.jobId, replace: true, legOrderId: next?.orderId);
    } else {
      // Heading to the next order (or back to the branch once all are done).
      AppRoutes.openDashboard(context, widget.jobId, replace: true, legOrderId: _nextPending(job)?.orderId);
    }
  }

  /// This screen already shows the full ride, so "Claim job" claims straight away —
  /// no second confirmation sheet. Progress and errors show on the screen itself.
  Future<void> _claim(JobDetailController vm, DeliveryJobDetail job) async {
    await vm.claim(widget.jobId);
    if (mounted && vm.job?.isActive == true) {
      BcFeedback.success();
      AppRoutes.openDashboard(context, widget.jobId, replace: true);
    }
  }

  Future<void> _reject(JobDetailController vm) async {
    final reason = await showRejectJobDialog(context);
    if (reason == null || !mounted) return;
    final ok = await vm.reject(widget.jobId, reason);
    if (ok && mounted) {
      BcFeedback.success();
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobDetailController>();
    final job = vm.job;
    final claimableToday = job != null && job.canAssign && Format.isToday(job.scheduledAt);
    final historyView = job?.isHistorySnapshot ?? false;

    Widget body;
    if (vm.loading && job == null) {
      body = Center(child: CircularProgressIndicator(color: c.primaryStrong));
    } else if (job == null) {
      body = Center(
        child: Text(vm.error ?? tr('Job not found'), style: TextStyle(color: c.mutedForeground)),
      );
    } else if (historyView) {
      body = _HistoryRunBody(job: job, route: vm.route);
    } else {
      body = _LiveJobBody(
        job: job,
        route: vm.route,
        error: vm.error,
        acting: vm.acting,
        claimableToday: claimableToday,
        onPrimary: () => _primary(vm, job),
        onReject: () => _reject(vm),
        onOpenMap: () => AppRoutes.openMap(context, widget.jobId),
        onOpenOrder: (o) => AppRoutes.openOrder(context, widget.jobId, o.orderId),
      );
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: context.bc.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: c.background,
        bottomNavigationBar: const AppBottomNav.overShell(),
        body: Column(
          children: [
            QdAppBar(title: tr('Job Details'), trailing: const QdBellButton()),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

/// QuickDrop "Job Details": summary, route map, pickup, every order, then the next step.
class _LiveJobBody extends StatelessWidget {
  const _LiveJobBody({
    required this.job,
    required this.route,
    required this.error,
    required this.acting,
    required this.claimableToday,
    required this.onPrimary,
    required this.onReject,
    required this.onOpenMap,
    required this.onOpenOrder,
  });

  final DeliveryJobDetail job;
  final DeliveryRoute? route;
  final String? error;
  final bool acting;
  final bool claimableToday;
  final VoidCallback onPrimary;
  final VoidCallback onReject;
  final VoidCallback onOpenMap;
  final void Function(JobOrder order) onOpenOrder;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final stops = [...job.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
    final total = job.orders.isEmpty ? job.orderCount : job.orders.length;
    final locked = job.canAssign && !claimableToday;

    // The next order to deliver, numbered by stop order.
    final next = stops.where((o) => o.isPending).firstOrNull;
    final nextNumber = next == null ? null : stops.indexOf(next) + 1;
    final primaryLabel = job.canAssign
        ? (claimableToday ? tr('Claim job') : tr('No longer available'))
        : job.needsPickup
        ? tr('Navigate to pickup')
        : (job.canStart || job.status == 'IN_PROGRESS') && nextNumber != null
        ? tr('Navigate to order {n}', {'n': nextNumber})
        : tr('Navigate to branch');
    final primaryIcon = job.canAssign ? Icons.check_circle_rounded : Icons.navigation_outlined;

    return ListView(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 20),
      children: [
        _JobSummaryCard(job: job, route: route, orderTotal: total),
        if (route != null) ...[
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(BcRadius.lg),
            child: MiniRouteMap(
              route: route!,
              height: 220,
              onTap: onOpenMap,
              activeStopSequence: route!.nextStopSequence,
              showDriverLocation: job.isActive,
            ),
          ),
        ],
        const SizedBox(height: 10),
        _PickupCard(job: job, total: total, onCall: () => confirmAndCall(context, name: job.store.name, phone: job.store.phone)),
        if (stops.isNotEmpty) ...[
          const SizedBox(height: 10),
          QdCard(
            padding: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 2),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tr('Orders ({n})', {'n': stops.length}),
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.foreground),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        tr('Tap an order to see its details.'),
                        style: TextStyle(fontSize: 13, color: c.mutedForeground),
                      ),
                    ],
                  ),
                ),
                for (var i = 0; i < stops.length; i++) ...[
                  if (i > 0) Divider(height: 1, thickness: 1, indent: 14, endIndent: 14, color: c.border),
                  _JobOrderRow(
                    order: stops[i],
                    number: i + 1,
                    onTap: () => onOpenOrder(stops[i]),
                    onCall: stops[i].customerPhone.trim().isEmpty
                        ? null
                        : () => confirmAndCall(context, name: stops[i].customerName, phone: stops[i].customerPhone),
                  ),
                ],
                Divider(height: 1, thickness: 1, color: c.border),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          tr('Total delivery fees'),
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.foreground),
                        ),
                      ),
                      Text(
                        Format.money(job.totalDeliveryFees),
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.successStrong),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 10),
        if (error != null) ...[
          RunNote(icon: Icons.error_outline_rounded, text: error!, color: c.errorStrong),
          const SizedBox(height: 12),
        ],
        PillButton(
          label: primaryLabel,
          icon: primaryIcon,
          height: 56,
          loading: acting,
          onTap: locked ? null : onPrimary,
        ),
        if (job.canReject) ...[
          const SizedBox(height: 12),
          PillButton(
            label: tr('Reject job'),
            icon: Icons.do_not_disturb_on_outlined,
            kind: PillKind.danger,
            height: 56,
            onTap: acting ? null : onReject,
          ),
        ] else if (job.isActive && job.pickedUp && next != null) ...[
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, size: 18, color: c.mutedForeground),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    tr('You can\'t reject a job after collecting orders. Use Report issue instead.'),
                    style: TextStyle(fontSize: 13, color: c.mutedForeground, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _JobSummaryCard extends StatelessWidget {
  const _JobSummaryCard({required this.job, required this.route, required this.orderTotal});
  final DeliveryJobDetail job;
  final DeliveryRoute? route;
  final int orderTotal;

  static String? _time(String? iso) {
    if (iso == null || iso.isEmpty) return null;
    try {
      return DateFormat('h:mm a').format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    const onBrand = Colors.white;
    final onBrandMuted = Colors.white.withValues(alpha: 0.75);
    final totalStops = orderTotal + 1;
    final done = (job.pickedUp ? 1 : 0) + job.deliveredCount;
    final allDone = orderTotal > 0 && job.deliveredCount >= orderTotal;
    final step = job.status == 'SCHEDULED'
        ? tr('Scheduled')
        : job.needsPickup
        ? tr('Pickup')
        : job.canStart
        ? tr('Ready')
        : allDone
        ? tr('Complete')
        : tr('Delivery');
    final time = _time(job.assignedAt ?? job.startedAt ?? job.scheduledAt);
    final eyebrow = '${(job.isActive ? tr('Active job') : tr('Scheduled')).toUpperCase()}${time == null ? '' : ' · $time'}';
    // While the route is loading, show a placeholder instead of the stored
    // estimate (which can differ from the road route). If loading fails, fall back.
    final routePending = route == null && context.select<JobDetailController, bool>((v) => v.routeLoading);
    final distance = route?.summary.totalDistanceKm ?? job.estimatedDistanceKm ?? 0;
    final minutes = route?.summary.estimatedMinutes ?? job.estimatedMinutes ?? 0;
    final ride = Format.rideIdLabel(job.rideCode, job.id).replaceFirst('·', '•');

    Widget stat(String value, String label, {bool divider = false}) => Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: divider ? BoxDecoration(border: Border(left: BorderSide(color: Colors.white.withValues(alpha: 0.15)))) : null,
        child: Column(
          children: [
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(value, style: BcType.subtitle.copyWith(color: onBrand, fontSize: 19)),
            ),
            const SizedBox(height: 2),
            Text(
              label.toUpperCase(),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: onBrandMuted),
            ),
          ],
        ),
      ),
    );

    return QdCard(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(BcRadius.lg),
        child: QdBrandHeader(
          rounded: false,
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                eyebrow,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1, color: onBrandMuted),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                ride,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: BcType.subtitle.copyWith(color: onBrand, fontSize: 24),
                              ),
                            ],
                          ),
                        ),
                        if (job.totalDeliveryFees > 0) ...[
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                tr('You earn').toUpperCase(),
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 1, color: onBrandMuted),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                Format.money(job.totalDeliveryFees),
                                style: BcType.subtitle.copyWith(color: c.accent, fontSize: 24),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${job.store.name} · ${trn(orderTotal, '{n} order', '{n} orders')}',
                      style: TextStyle(fontSize: 14, color: onBrandMuted),
                    ),
                    const SizedBox(height: 12),
                    SegmentedProgress(completed: done, total: totalStops, done: allDone, onBrand: true),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            tr('{done} of {total} stops', {'done': done, 'total': totalStops}),
                            style: TextStyle(fontSize: 14, color: onBrandMuted),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(99)),
                          child: Text(step, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: onBrand)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.15)))),
                child: Row(
                  children: [
                    stat(routePending ? '—' : Format.km(distance), tr('Distance')),
                    stat(routePending ? '—' : Format.minutes(minutes), tr('Estimated time'), divider: true),
                    stat('$orderTotal', tr('Orders'), divider: true),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PickupCard extends StatelessWidget {
  const _PickupCard({required this.job, required this.total, required this.onCall});
  final DeliveryJobDetail job;
  final int total;
  final VoidCallback onCall;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final collected = job.pickedUp ? total : 0;
    final place = job.hasPickupOverride ? job.pickupPlaceName : job.store.name;
    final address = job.hasPickupOverride
        ? tr('Pickup location')
        : [job.store.addressLine, job.store.city].where((s) => s.trim().isNotEmpty).join(', ');
    final phone = job.hasPickupOverride ? '' : job.store.phone.trim();
    return QdCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  tr('Pickup'),
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.foreground),
                ),
              ),
              Text(
                tr('{done} of {total} collected', {'done': collected, 'total': total}),
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: job.pickedUp ? c.successStrong : c.primary),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(BcRadius.md)),
                child: Icon(Icons.storefront_outlined, color: c.primaryStrong, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(place, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: c.foreground)),
                    if (address.isNotEmpty)
                      Text(address, style: TextStyle(fontSize: 13, color: c.mutedForeground)),
                    if (phone.isNotEmpty)
                      Text(Format.lkMobileDisplay(phone), style: TextStyle(fontSize: 13, color: c.mutedForeground)),
                  ],
                ),
              ),
            ],
          ),
          if (phone.isNotEmpty) ...[
            const SizedBox(height: 12),
            PillButton(label: tr('Call branch'), icon: Icons.call_rounded, kind: PillKind.call, onTap: onCall),
          ],
        ],
      ),
    );
  }
}

class _JobOrderRow extends StatelessWidget {
  const _JobOrderRow({required this.order, required this.number, required this.onTap, required this.onCall});
  final JobOrder order;
  final int number;
  final VoidCallback onTap;
  final VoidCallback? onCall;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final name = order.customerName.trim().isEmpty ? tr('Customer') : order.customerName;
    return InkWell(
      onTap: () {
        BcFeedback.tap();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(shape: BoxShape.circle, color: c.primarySoft),
              child: Text('$number', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: c.primaryStrong)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: c.foreground),
                  ),
                  Text(
                    '${order.city} · ${trn(order.itemCount, '{n} item', '{n} items')}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, color: c.mutedForeground),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              Format.money(order.deliveryFee),
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: c.foreground),
            ),
            if (onCall != null) ...[
              const SizedBox(width: 10),
              Material(
                color: c.call,
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onCall,
                  child: Tooltip(
                    message: tr('Call'),
                    child: SizedBox(width: 40, height: 40, child: Icon(Icons.call_rounded, color: c.callForeground, size: 20)),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Finished-run receipt (QuickDrop "Job Details"): summary, orders, failures, read-only note.
class _HistoryRunBody extends StatelessWidget {
  const _HistoryRunBody({required this.job, required this.route});
  final DeliveryJobDetail job;
  final DeliveryRoute? route;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final stops = [...job.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
    final distanceKm = job.actualDistanceKm ?? job.estimatedDistanceKm;
    // Earned = fees of the stops actually delivered (the stored ride total can be stale).
    final earned = job.orders.isEmpty
        ? job.totalDeliveryFees
        : job.orders.where((o) => o.isDelivered && !o.isFailed).fold<int>(0, (s, o) => s + o.deliveryFee);
    final finishedIso = job.completedAt ?? job.returnStartedAt ?? job.startedAt ?? job.scheduledAt;
    final finished = Format.toLocal(finishedIso);
    final acceptedIso = job.assignedAt ?? job.startedAt;
    final accepted = Format.toLocal(acceptedIso);
    final minutes = (accepted != null && finished != null && job.completedAt != null)
        ? finished.difference(accepted).inMinutes
        : null;
    final dateLabel = finished == null ? '' : DateFormat('EEE, MMM d', L10n.dateLocale).format(finished).toUpperCase();
    final failedOrders = stops.where((o) => o.isFailed).toList();
    final failureCount = failedOrders.length + stops.fold<int>(0, (n, o) => n + o.complaints.length);
    final heading = TextStyle(fontFamily: BcFonts.heading, fontSize: 17, fontWeight: FontWeight.w700, color: c.foreground);

    return ListView(
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 24),
      children: [
        QdCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (dateLabel.isNotEmpty)
                            Text(
                              dateLabel,
                              style: TextStyle(color: c.primaryStrong, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.8),
                            ),
                          const SizedBox(height: 4),
                          Text(
                            Format.displayRideId(job.rideCode, job.id),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontFamily: BcFonts.heading, fontSize: 22, fontWeight: FontWeight.w700, color: c.foreground),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Icon(Icons.storefront_outlined, size: 16, color: c.mutedForeground),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  Format.shortBranchName(job.store.name),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: c.mutedForeground, fontSize: 14),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          tr('Earnings').toUpperCase(),
                          style: TextStyle(color: c.mutedForeground, fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.8),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          Format.money(earned),
                          style: TextStyle(
                            fontFamily: BcFonts.heading,
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            color: earned > 0 ? c.success : c.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Divider(height: 1, thickness: 1, color: c.border),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    if (accepted != null) _HistoryKv(label: tr('Accepted at'), value: Format.dateTime(acceptedIso)),
                    if (job.startedAt != null)
                      _HistoryKv(label: tr('Ride started'), value: Format.dateTime(job.startedAt)),
                    if (job.returnStartedAt != null)
                      _HistoryKv(label: tr('Returned to branch'), value: Format.dateTime(job.returnStartedAt)),
                    if (finished != null) _HistoryKv(label: tr('Finished'), value: Format.dateTime(finishedIso)),
                    if (minutes != null && minutes >= 0) _HistoryKv(label: tr('Time taken'), value: Format.duration(minutes)),
                    if (distanceKm != null) _HistoryKv(label: tr('Distance'), value: Format.km(distanceKm)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        QdCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                child: Text(tr('Orders ({n})', {'n': stops.length}), style: heading),
              ),
              for (var i = 0; i < stops.length; i++) _HistoryOrderRow(number: i + 1, order: stops[i], divider: i > 0),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(tr('Delivery Failures'), style: heading),
        ),
        const SizedBox(height: 12),
        QdCard(
          padding: failureCount == 0 ? const EdgeInsets.all(20) : EdgeInsets.zero,
          child: failureCount == 0
              ? Text(
                  tr('No delivery failures were reported for this job.'),
                  style: TextStyle(color: c.mutedForeground, fontSize: 15),
                )
              : Column(
                  children: [
                    for (final o in failedOrders)
                      _HistoryFailureRow(reason: tr('Delivery failed'), detail: '#${o.orderNumber} · ${o.customerName}'),
                    for (final o in stops)
                      for (final cp in o.complaints)
                        _HistoryFailureRow(
                          reason: cp.category.replaceAll('_', ' '),
                          detail: '#${o.orderNumber} · ${o.customerName} · ${Format.dateTime(cp.createdAt)}',
                          note: cp.description,
                        ),
                  ],
                ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline_rounded, size: 16, color: c.mutedForeground),
            const SizedBox(width: 8),
            Text(tr('Past jobs are read-only.'), style: TextStyle(color: c.mutedForeground, fontSize: 13)),
          ],
        ),
      ],
    );
  }
}

class _HistoryKv extends StatelessWidget {
  const _HistoryKv({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: c.mutedForeground, fontSize: 15)),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(color: c.foreground, fontSize: 15, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _HistoryOrderRow extends StatelessWidget {
  const _HistoryOrderRow({required this.number, required this.order, required this.divider});
  final int number;
  final JobOrder order;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final area = order.city.trim().isNotEmpty
        ? order.city
        : (order.district.trim().isNotEmpty ? order.district : order.shortAddress);
    final unpaid = order.isFailed || order.isCancelled;
    final status = order.isFailed ? 'DELIVERY_FAILED' : order.status;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(border: divider ? Border(top: BorderSide(color: c.border)) : null),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: c.primarySoft, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: Text('$number', style: TextStyle(color: c.primaryStrong, fontSize: 15, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        order.customerName.trim().isEmpty ? tr('Customer') : order.customerName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: c.foreground, fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      Format.money(order.deliveryFee),
                      style: TextStyle(
                        color: unpaid ? c.mutedForeground : c.success,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        decoration: unpaid ? TextDecoration.lineThrough : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  area.trim().isEmpty ? '#${order.orderNumber}' : '#${order.orderNumber} · $area',
                  style: TextStyle(color: c.mutedForeground, fontSize: 14),
                ),
                if (!order.isDelivered) ...[
                  const SizedBox(height: 6),
                  Align(alignment: Alignment.centerRight, child: StatusChip(status)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HistoryFailureRow extends StatelessWidget {
  const _HistoryFailureRow({required this.reason, required this.detail, this.note});
  final String reason;
  final String detail;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(Icons.cancel_outlined, size: 16, color: c.error),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(reason, style: TextStyle(color: c.error, fontSize: 14, fontWeight: FontWeight.w600)),
                if (note != null && note!.trim().isNotEmpty)
                  Text(
                    '“${note!.trim()}”',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c.mutedForeground, fontSize: 14),
                  ),
                Text(detail, style: TextStyle(color: c.mutedForeground, fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
