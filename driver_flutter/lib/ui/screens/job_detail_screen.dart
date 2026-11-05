import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/events.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../data/models/delivery_route.dart';
import '../../state/job_controllers.dart';
import '../app_routes.dart';
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

  Future<void> _primary(JobDetailController vm, DeliveryJobDetail job) async {
    BcFeedback.tap();
    if (job.status == 'COMPLETED') {
      Navigator.of(context).pop();
    } else if (job.canAssign) {
      await _claim(vm, job);
    } else if (job.needsPickup) {
      if (!await ensureLocationPermission()) return;
      BcFeedback.success();
      await vm.pickup(widget.jobId);
    } else if (job.canStart) {
      final tracker = context.read<AppContainer>().locationTracker;
      if (!await ensureLocationPermission()) return;
      if (!await tracker.isLocationEnabled()) return;
      BcFeedback.success();
      final ok = await vm.start(widget.jobId);
      if (ok && mounted) AppRoutes.openDashboard(context, widget.jobId, replace: true);
    } else {
      AppRoutes.openDashboard(context, widget.jobId, replace: true);
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
    final primaryLabel = job == null
        ? '…'
        : job.status == 'COMPLETED'
        ? tr('Back')
        : job.canAssign && !claimableToday
        ? tr('No longer available')
        : job.canAssign
        ? tr('Claim job')
        : job.needsPickup
        ? tr('Confirm pickup')
        : job.canStart
        ? tr('Start run')
        : job.isActive
        ? tr('Open dashboard')
        : tr('View dashboard');
    final primaryIcon = job == null
        ? Icons.arrow_forward_rounded
        : job.canAssign
        ? Icons.check_circle_rounded
        : job.needsPickup
        ? Icons.storefront_rounded
        : job.canStart
        ? Icons.play_arrow_rounded
        : Icons.dashboard_rounded;
    final historyView = job?.isHistorySnapshot ?? false;

    Widget body;
    if (vm.loading && job == null) {
      body = Center(child: CircularProgressIndicator(color: c.brand));
    } else if (job == null) {
      body = Center(
        child: Text(vm.error ?? tr('Job not found'), style: TextStyle(color: c.textMuted)),
      );
    } else if (historyView) {
      body = _HistoryRunBody(job: job, route: vm.route);
    } else {
      final stops = [...job.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
      final route = vm.route;
      final stopCount = route?.summary.stopCount ?? job.orderCount;
      body = ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          if (job.totalDeliveryFees > 0) ...[
            _EarningsBanner(
              label: tr('Delivery Fee'),
              amount: job.totalDeliveryFees,
              caption: tr('Scheduled {p1}', {'p1': Format.dateTime(job.scheduledAt)}),
            ),
            const SizedBox(height: 12),
          ],
          RunFactRow(
            tiles: [
              RunFactTile(icon: Icons.location_on_rounded, tint: c.brand, value: '$stopCount', label: tr('Stops')),
              RunFactTile(
                icon: Icons.route_rounded,
                tint: c.success,
                value: Format.km(route?.summary.totalDistanceKm ?? job.estimatedDistanceKm ?? 0),
                label: tr('Distance'),
              ),
              RunFactTile(
                icon: Icons.schedule_rounded,
                tint: c.warning,
                value: Format.minutes(route?.summary.estimatedMinutes ?? job.estimatedMinutes ?? 0),
                label: tr('ETA'),
              ),
              if (job.totalCups > 0)
                RunFactTile(icon: Icons.local_cafe_rounded, tint: _rose, value: '${job.totalCups}', label: tr('Cups')),
            ],
          ),
          const SizedBox(height: 12),
          RunCard(
            child: RunCardHeader(
              icon: Icons.storefront_rounded,
              title: tr('Pickup · {pickupPlaceName}', {'pickupPlaceName': job.pickupPlaceName}),
              subtitle: Format.deliverySummary(job.orderCount, job.totalCups),
            ),
          ),
          if (route != null) ...[
            const SizedBox(height: 12),
            _MapCard(
              child: MiniRouteMap(
                route: route,
                onTap: () => AppRoutes.openMap(context, widget.jobId),
                activeStopSequence: route.nextStopSequence,
                showDriverLocation: job.isActive,
              ),
            ),
          ],
          _StopsHeader(done: job.deliveredCount, total: job.orderCount),
          for (var i = 0; i < stops.length; i++)
            _StopTimelineRow(
              number: i + 1,
              order: stops[i],
              isFirst: i == 0,
              isLast: i == stops.length - 1,
              highlighted: i == 0 && stops[i].isPending,
              onOpen: () => AppRoutes.openOrder(context, widget.jobId, stops[i].orderId),
            ),
        ],
      );
    }

    final locked = job != null && job.canAssign && !claimableToday;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.background,
        body: Column(
          children: [
            _GradientTopBar(job: job, historyView: historyView),
            Expanded(child: body),
          ],
        ),
        bottomNavigationBar: (job != null && !job.isHistorySnapshot)
            ? Container(
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
                padding: EdgeInsets.fromLTRB(16, 16, 16, 12 + MediaQuery.paddingOf(context).bottom),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (vm.error != null) ...[
                      RunNote(icon: Icons.error_outline_rounded, text: vm.error!, color: c.danger),
                      const SizedBox(height: 10),
                    ],
                    RunPrimaryButton(
                      label: primaryLabel,
                      icon: primaryIcon,
                      loading: vm.acting,
                      enabled: !locked,
                      locked: locked,
                      onPressed: () => _primary(vm, job),
                    ),
                    if (job.canReject) ...[
                      const SizedBox(height: 10),
                      RunOutlineButton(
                        label: tr('Reject job'),
                        icon: Icons.do_not_disturb_on_outlined,
                        color: c.isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626),
                        enabled: !vm.acting,
                        onPressed: () => _reject(vm),
                      ),
                    ],
                  ],
                ),
              )
            : null,
      ),
    );
  }
}

const _rose = Color(0xFFE11D48);
const _greens = [Color(0xFF34D399), Color(0xFF10B981), Color(0xFF059669)];

class _GradientTopBar extends StatelessWidget {
  const _GradientTopBar({required this.job, required this.historyView});
  final DeliveryJobDetail? job;
  final bool historyView;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final j = job;
    String? pill;
    var dot = const Color(0xFF4ADE80);
    if (j != null) {
      if (historyView) {
        final (label, color) = statusLabel(context, j.status);
        pill = label;
        dot = color == c.danger
            ? const Color(0xFFF87171)
            : color == c.warning
            ? const Color(0xFFFBBF24)
            : const Color(0xFF4ADE80);
      } else {
        pill = j.status == 'SCHEDULED'
            ? tr('Scheduled')
            : j.needsPickup
            ? tr('Pickup')
            : j.canStart
            ? tr('Ready')
            : tr('In Progress');
      }
    }
    return BcDetailTopBar(
      title: historyView ? tr('Delivery') : tr('Stops'),
      subtitle: j == null ? null : Format.rideIdLabel(j.rideCode, j.id),
      trailing: pill == null ? null : BcTopBarPill(label: pill, dotColor: dot),
      bottom: j == null
          ? null
          : Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _TopTag(icon: Icons.storefront_rounded, label: Format.shortBranchName(j.store.name)),
                _TopTag(icon: Icons.location_on_rounded, label: trn(j.orderCount, '{n} stop', '{n} stops')),
                if (j.totalCups > 0)
                  _TopTag(icon: Icons.local_cafe_rounded, label: trn(j.totalCups, '{n} cup', '{n} cups')),
              ],
            ),
    );
  }
}

class _TopTag extends StatelessWidget {
  const _TopTag({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white, size: 14),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// Green gradient earnings card (same look as the incoming-ride fee card).
class _EarningsBanner extends StatelessWidget {
  const _EarningsBanner({required this.label, required this.amount, this.caption, this.badge});
  final String label;
  final int amount;
  final String? caption;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BcRadius.card),
        gradient: LinearGradient(
          colors: c.isDark ? [const Color(0xFF064E3B), const Color(0xFF065F46)] : _greens,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [BoxShadow(color: _greens[1].withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -24,
            top: -30,
            child: Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.1)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.account_balance_wallet_rounded, color: Colors.white, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          Format.money(amount),
                          style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800),
                        ),
                      ),
                      if (caption != null)
                        Text(
                          caption!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12),
                        ),
                    ],
                  ),
                ),
                if (badge != null) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_circle_rounded, color: _greens[2], size: 15),
                        const SizedBox(width: 4),
                        Text(
                          badge!,
                          style: TextStyle(color: _greens[2], fontSize: 11.5, fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MapCard extends StatelessWidget {
  const _MapCard({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return RunCard(
      padding: const EdgeInsets.all(6),
      child: ClipRRect(borderRadius: BorderRadius.circular(BcRadius.card - 4), child: child),
    );
  }
}

class _StopsHeader extends StatelessWidget {
  const _StopsHeader({required this.done, required this.total});
  final int done;
  final int total;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 22, 2, 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              tr('Delivery stops'),
              style: TextStyle(color: c.text, fontSize: 18, fontWeight: FontWeight.w800),
            ),
          ),
          RunPill(
            label: tr('{deliveredCount}/{orderCount} delivered', {'deliveredCount': done, 'orderCount': total}),
            color: done == total && total > 0 ? c.success : c.brand,
            icon: Icons.check_circle_outline_rounded,
          ),
        ],
      ),
    );
  }
}

/// Finished-run receipt: earnings, facts, route, and a stop timeline. No live actions.
class _HistoryRunBody extends StatelessWidget {
  const _HistoryRunBody({required this.job, required this.route});
  final DeliveryJobDetail job;
  final DeliveryRoute? route;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final stops = [...job.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
    final distanceKm = job.actualDistanceKm ?? job.estimatedDistanceKm;
    final allDone = job.orderCount > 0 && job.deliveredCount == job.orderCount;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        _EarningsBanner(
          label: tr('Earned'),
          amount: job.totalDeliveryFees,
          caption: job.completedAt == null ? null : tr('Completed {p1}', {'p1': Format.dateTime(job.completedAt)}),
          badge: allDone ? tr('All delivered') : null,
        ),
        const SizedBox(height: 12),
        RunFactRow(
          tiles: [
            RunFactTile(
              icon: Icons.task_alt_rounded,
              tint: c.success,
              value: '${job.deliveredCount}/${job.orderCount}',
              label: tr('Delivered'),
            ),
            RunFactTile(icon: Icons.local_cafe_rounded, tint: _rose, value: '${job.totalCups}', label: tr('Cups')),
            RunFactTile(
              icon: Icons.route_rounded,
              tint: c.brand,
              value: distanceKm != null ? Format.km(distanceKm) : '—',
              label: tr('Distance'),
            ),
          ],
        ),
        if (route != null) ...[
          const SizedBox(height: 12),
          _MapCard(
            child: MiniRouteMap(route: route!, onTap: () => AppRoutes.openMap(context, job.id)),
          ),
        ],
        _StopsHeader(done: job.deliveredCount, total: job.orderCount),
        for (var i = 0; i < stops.length; i++)
          _StopTimelineRow(
            number: i + 1,
            order: stops[i],
            isFirst: i == 0,
            isLast: i == stops.length - 1,
            onOpen: () => AppRoutes.openOrder(context, job.id, stops[i].orderId),
          ),
      ],
    );
  }
}

/// One stop in a vertical timeline: numbered/status badge + connector, then a tappable card.
/// Numbers follow list position, so duplicate server sequences never show twice.
class _StopTimelineRow extends StatelessWidget {
  const _StopTimelineRow({
    required this.number,
    required this.order,
    required this.isFirst,
    required this.isLast,
    required this.onOpen,
    this.highlighted = false,
  });

  final int number;
  final JobOrder order;
  final bool isFirst;
  final bool isLast;
  final bool highlighted;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final tint = order.isDelivered
        ? c.success
        : order.isFailed || order.isCancelled
        ? c.danger
        : c.brand;
    final items = order.items.map((i) => '${i.quantity}× ${i.productName}').join(', ');
    final address = order.shortAddress.trim().isNotEmpty
        ? order.shortAddress
        : (order.city.trim().isNotEmpty ? order.city : order.addressLine);
    final complaints = order.complaints.length;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 34,
            child: Column(
              children: [
                Container(width: 2, height: 16, color: isFirst ? Colors.transparent : c.border),
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: order.isDelivered ? c.success : tint.withValues(alpha: 0.12),
                    border: Border.all(color: tint.withValues(alpha: 0.35), width: 1.2),
                  ),
                  alignment: Alignment.center,
                  child: order.isDelivered
                      ? const Icon(Icons.check_rounded, color: Colors.white, size: 18)
                      : Text(
                          '$number'.padLeft(2, '0'),
                          style: TextStyle(color: tint, fontWeight: FontWeight.w800, fontSize: 11.5),
                        ),
                ),
                Expanded(child: Container(width: 2, color: isLast ? Colors.transparent : c.border)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
              child: Material(
                color: c.card,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(BcRadius.card),
                  side: BorderSide(color: highlighted ? c.brand : c.border, width: highlighted ? 1.5 : 1),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () {
                    BcFeedback.tap();
                    onOpen();
                  },
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
                    child: Row(
                      children: [
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
                                      style: TextStyle(fontWeight: FontWeight.w800, color: c.text, fontSize: 15),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  if (highlighted)
                                    RunPill(label: tr('Next'), color: c.brand)
                                  else
                                    StatusChip(order.isFailed ? 'DELIVERY_FAILED' : order.status),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(Icons.location_on_rounded, size: 15, color: tint),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                      address,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(color: c.text, fontSize: 13, height: 1.35),
                                    ),
                                  ),
                                ],
                              ),
                              if (items.trim().isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Icon(Icons.local_cafe_outlined, size: 14, color: c.textMuted),
                                    const SizedBox(width: 5),
                                    Expanded(
                                      child: Text(
                                        items,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(color: c.textMuted, fontSize: 12, height: 1.35),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Text(
                                    '#${order.orderNumber}',
                                    style: TextStyle(color: c.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
                                  ),
                                  const Spacer(),
                                  if (complaints > 0) ...[
                                    RunPill(
                                      label: complaints == 1
                                          ? tr('1 complaint')
                                          : tr('{n} complaints', {'n': complaints}),
                                      color: c.warning,
                                      icon: Icons.feedback_outlined,
                                    ),
                                    const SizedBox(width: 6),
                                  ],
                                  Text(
                                    Format.money(order.deliveryFee),
                                    style: TextStyle(color: c.success, fontSize: 13, fontWeight: FontWeight.w800),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(Icons.chevron_right_rounded, color: c.textMuted),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
