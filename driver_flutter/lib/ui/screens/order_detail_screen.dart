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
import '../components/buttons.dart';
import '../components/app_bottom_nav.dart';
import '../components/call_confirm.dart';
import '../components/driver_ops.dart';
import '../components/job_cards.dart';
import '../components/qd_kit.dart';
import '../components/run_kit.dart';
import '../components/surfaces.dart';
import '../theme/bc_theme.dart';
import 'navigation_screen.dart';
import 'order_sheets.dart';
import '../../l10n/l10n.dart';

/// One customer stop — port of OrderDetailScreen.kt.
class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({super.key, required this.jobId, required this.orderId});
  final String jobId;
  final String orderId;

  @override
  Widget build(BuildContext context) {
    final c = context.read<AppContainer>();
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => DashboardController(c)..load(jobId, force: true)),
        ChangeNotifierProvider(create: (_) => OrderActionController(c)),
      ],
      child: _OrderDetailBody(jobId: jobId, orderId: orderId),
    );
  }
}

class _OrderDetailBody extends StatefulWidget {
  const _OrderDetailBody({required this.jobId, required this.orderId});
  final String jobId;
  final String orderId;

  @override
  State<_OrderDetailBody> createState() => _OrderDetailBodyState();
}

class _OrderDetailBodyState extends State<_OrderDetailBody> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadOrder());
  }

  JobOrder? _orderFromJob() =>
      context.read<DashboardController>().job?.orders.where((o) => o.orderId == widget.orderId).firstOrNull;

  void _loadOrder() => context.read<OrderActionController>().loadOrder(widget.orderId, _orderFromJob);

  /// Keeps the dashboard sitting under this screen in sync with what we just did.
  void _publish(JobOrder updated) {
    context.read<DashboardController>().applyOrderUpdate(updated);
    JobRefreshBus.refresh(widget.jobId);
  }

  Future<void> _markDelivered(OrderActionController vm, JobOrder order) async {
    vm.clearError();
    vm.clearOtpRequired();
    var delivered = false;
    await showDeliveryVerifySheet(
      context,
      vm,
      customerName: order.customerName,
      onResend: () => vm.sendCodeToCustomer(order.orderId),
      onConfirm: (code) async {
        final updated = await vm.updateStatus(order.orderId, 'DELIVERED', otp: code);
        if (updated == null) {
          BcFeedback.error();
          return false;
        }
        BcFeedback.completed();
        _publish(updated);
        delivered = true;
        return true;
      },
    );
    if (delivered && mounted) {
      await showBcSuccess(
        context,
        title: tr('Delivered'),
        subtitle: order.deliveryFee > 0 ? tr('{amount} earned', {'amount': Format.money(order.deliveryFee)}) : null,
      );
      if (mounted) Navigator.of(context).pop();
    }
  }

  Future<void> _reportFailure(OrderActionController vm, JobOrder order) async {
    vm.clearFailureError();
    var failed = false;
    await showFailureSheet(context, vm, (outcome, note) async {
      final updated = await vm.updateStatus(order.orderId, 'DELIVERY_FAILED', note: note, outcome: outcome.apiValue);
      if (updated == null) return false;
      _publish(updated);
      failed = true;
      return true;
    }, orderNumber: order.orderNumber);
    if (failed && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final jobVm = context.watch<DashboardController>();
    final vm = context.watch<OrderActionController>();
    final job = jobVm.job;
    final order = vm.order ?? job?.orders.where((o) => o.orderId == widget.orderId).firstOrNull;
    final sorted = [...?job?.orders]..sort((a, b) => a.sequence.compareTo(b.sequence));
    final nextPendingId = sorted.where((o) => o.isPending).firstOrNull?.orderId;
    final isCurrent = order != null && job != null && nextPendingId == order.orderId;
    final canAct = order != null && order.isPending && (job?.pickedUp ?? false) && isCurrent;
    final gateHint = (order == null || !order.isPending || job == null)
        ? null
        : !job.pickedUp
        ? tr('You\'ll be able to verify this delivery once you\'ve picked up the order from the branch.')
        : !isCurrent
        ? tr('Complete the current stop first')
        : null;

    Widget body;
    if ((vm.loading || jobVm.loading) && order == null) {
      body = Center(child: CircularProgressIndicator(color: c.primaryStrong));
    } else if (order == null) {
      body = Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                vm.loadError ?? jobVm.error ?? tr('This order could not be loaded.'),
                textAlign: TextAlign.center,
                style: TextStyle(color: c.mutedForeground, fontSize: 14),
              ),
              const SizedBox(height: 12),
              BcOutlineButton(
                label: tr('Retry'),
                onPressed: () {
                  jobVm.load(widget.jobId, force: true);
                  _loadOrder();
                },
              ),
            ],
          ),
        ),
      );
    } else {
      final name = order.customerName.trim().isEmpty ? tr('Customer') : order.customerName;
      final itemCount = order.itemCount;
      final hasPhone = order.customerPhone.trim().isNotEmpty;
      final hasCoords = order.lat != null && order.lng != null;
      final pending = order.isPending;
      final fix = context.read<AppContainer>().locationTracker.lastFix;
      final awayM = (fix == null || order.lat == null || order.lng == null)
          ? null
          : haversineMetres(fix.lat, fix.lng, order.lat!, order.lng!);
      final awayText = (awayM == null || !pending)
          ? null
          : (awayM >= 1000 ? '${(awayM / 1000).toStringAsFixed(1)} km' : '${awayM.round()} m');
      final paidOnline = order.paymentStatus == 'PAID' && !order.paymentMethod.contains('CASH');

      void navigate() {
        if (!hasCoords) return;
        if (canAct) {
          NavigationScreen.open(
            context,
            NavTarget(
              lat: order.lat!,
              lng: order.lng!,
              label: order.customerName,
              kind: NavKindCustomerStop(order.orderId),
              address: '${order.addressLine}, ${order.city}',
              phone: order.customerPhone,
            ),
            actionBuilder: (_) => NavCustomerStop(
              callEnabled: hasPhone,
              onCall: () => Intents.dial(order.customerPhone),
            ),
          );
        } else {
          Intents.navigateTo(order.lat!, order.lng!, label: order.customerName);
        }
      }

      body = ListView(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 20),
        children: [
          // 1. The stop: who, what it pays, where to go, how to get there, problems.
          QdCard(
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
                                  '${order.sequence > 0 ? '${tr('Stop {n}', {'n': order.sequence})} · ' : ''}ORD-${order.orderNumber}'.toUpperCase(),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1, color: c.primary),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: BcType.subtitle.copyWith(color: c.foreground, fontSize: 24),
                                ),
                              ],
                            ),
                          ),
                          if (order.deliveryFee > 0) ...[
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  tr('You earn').toUpperCase(),
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 1, color: c.mutedForeground),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  Format.money(order.deliveryFee),
                                  style: BcType.subtitle.copyWith(
                                    fontSize: 24,
                                    color: order.isFailed ? c.mutedForeground : c.successStrong,
                                    decoration: order.isFailed ? TextDecoration.lineThrough : null,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                      if (!pending) ...[
                        const SizedBox(height: 10),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: QdBadge(
                            order.isDelivered
                                ? tr('Delivered')
                                : order.isFailed
                                ? tr('Delivery failed')
                                : tr(order.status.replaceAll('_', ' ').toLowerCase()),
                            tone: order.isDelivered
                                ? QdTone.success
                                : order.isFailed
                                ? QdTone.error
                                : QdTone.neutral,
                            dot: true,
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      NextStopPanel(
                        icon: Icons.place_outlined,
                        eyebrow: tr('Drop-off'),
                        title: order.addressLine.trim().isEmpty ? order.fullAddress : order.addressLine,
                        subtitle: awayText == null ? order.city : '${tr('{distance} away', {'distance': awayText})} · ${order.city}',
                        onTap: navigate,
                      ),
                      if (pending) ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: PillButton(
                                label: tr('Navigate'),
                                icon: Icons.navigation_outlined,
                                onTap: hasCoords ? navigate : null,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: PillButton(
                                label: tr('Contact'),
                                icon: Icons.call_rounded,
                                kind: PillKind.call,
                                onTap: hasPhone ? () => confirmAndCall(context, name: name, phone: order.customerPhone) : null,
                              ),
                            ),
                          ],
                        ),
                      ],
                      if (order.displayNotes != null) ...[
                        const SizedBox(height: 14),
                        RunNote(icon: Icons.sticky_note_2_outlined, text: order.displayNotes!, color: c.warning),
                      ],
                      if (gateHint != null) ...[
                        const SizedBox(height: 14),
                        RunNote(icon: Icons.hourglass_top_rounded, text: gateHint, color: c.warning),
                      ],
                    ],
                  ),
                ),
                if (pending) ...[
                  Divider(height: 1, thickness: 1, color: c.border),
                  Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (canAct) ...[
                          PillButton(
                            label: tr('Mark as delivered'),
                            icon: Icons.inventory_2_outlined,
                            kind: PillKind.accent,
                            height: 56,
                            onTap: () => _markDelivered(vm, order),
                          ),
                          const SizedBox(height: 12),
                        ],
                        PillButton(
                          label: tr('Report delivery failure'),
                          icon: Icons.warning_amber_rounded,
                          kind: PillKind.danger,
                          onTap: canAct ? () => _reportFailure(vm, order) : null,
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 10),
          // 2. What's in the bag and how it was paid.
          QdCard(
            padding: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              tr('Order Items'),
                              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.foreground),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              trn(itemCount, '{n} item', '{n} items'),
                              style: TextStyle(fontSize: 13, color: c.mutedForeground),
                            ),
                          ],
                        ),
                      ),
                      QdBadge(
                        paidOnline ? tr('Paid online') : tr('Cash on delivery'),
                        tone: paidOnline ? QdTone.success : QdTone.warning,
                        dot: true,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                for (var i = 0; i < order.items.length; i++) ...[
                  if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 32,
                          child: Text(
                            '${order.items[i].quantity}×',
                            style: TextStyle(color: c.primary, fontWeight: FontWeight.w800, fontSize: 15),
                          ),
                        ),
                        Expanded(
                          child: Text(
                            order.items[i].productName,
                            style: TextStyle(color: c.foreground, fontSize: 15),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (order.total != null) ...[
                  Divider(height: 1, thickness: 1, color: c.border),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            tr('Order total'),
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.foreground),
                          ),
                        ),
                        Text(
                          Format.money(order.total!),
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.foreground),
                        ),
                      ],
                    ),
                  ),
                ] else
                  const SizedBox(height: 8),
              ],
            ),
          ),
          if (order.complaints.isNotEmpty) ...[
            const SizedBox(height: 10),
            _ComplaintsSection(complaints: order.complaints),
          ],
          if (vm.error != null) ...[
            const SizedBox(height: 12),
            RunNote(icon: Icons.error_outline_rounded, text: vm.error!, color: c.errorStrong),
          ],
        ],
      );
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: context.bc.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: c.background,
        bottomNavigationBar: const AppBottomNav.overShell(),
        body: Column(
          children: [
            QdAppBar(title: tr('Order Details'), trailing: const QdBellButton()),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

class _ComplaintsSection extends StatelessWidget {
  const _ComplaintsSection({required this.complaints});
  final List<DriverComplaint> complaints;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return RunCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RunCardHeader(
            icon: Icons.feedback_outlined,
            tint: c.warning,
            bg: c.warningSubtle,
            title: complaints.length == 1 ? tr('Your complaint') : tr('Your complaints'),
            trailing: RunPill(label: '${complaints.length}', color: c.warning),
          ),
          for (final cp in complaints) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(14)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          tr(cp.category),
                          style: TextStyle(fontWeight: FontWeight.w700, color: c.foreground, fontSize: 14),
                        ),
                      ),
                      InfoBadge(
                        _titleCase(cp.status.replaceAll('_', ' ').toLowerCase()),
                        color: switch (cp.status) {
                          'CONFIRMED' || 'RESOLVED' => c.success,
                          'DISMISSED' => c.mutedForeground,
                          _ => c.accent,
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(cp.description, style: TextStyle(color: c.foreground, fontSize: 13, height: 1.4)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(Icons.schedule_rounded, size: 13, color: c.mutedForeground),
                      const SizedBox(width: 4),
                      Text(Format.dateTime(cp.createdAt), style: TextStyle(color: c.mutedForeground, fontSize: 12)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _titleCase(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}
