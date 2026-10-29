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
import '../components/driver_ops.dart';
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

  Future<void> _dial(String phone) async {
    final messenger = ScaffoldMessenger.of(context);
    final err = await Intents.dial(phone);
    if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
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
    });
    if (failed && mounted) Navigator.of(context).pop();
  }

  Future<void> _raiseComplaint(OrderActionController vm, JobOrder order) async {
    vm.clearComplaintError();
    await showComplaintSheet(context, vm, (category, description) async {
      final ok = await vm.fileComplaint(order.orderId, category, description);
      if (ok) {
        BcFeedback.completed();
        _loadOrder();
        if (mounted) context.read<DashboardController>().load(widget.jobId, force: true);
      }
      return ok;
    });
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
      body = Center(child: CircularProgressIndicator(color: c.brand));
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
                style: TextStyle(color: c.textMuted, fontSize: 14),
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
      final itemCount = order.items.fold<int>(0, (s, i) => s + i.quantity);
      body = ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          _StopStatusCard(order: order, canAct: canAct, gateHint: gateHint),
          const SizedBox(height: 12),
          RunCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: c.brandSubtle),
                      alignment: Alignment.center,
                      child: Text(
                        name.trim()[0].toUpperCase(),
                        style: TextStyle(color: c.brand, fontWeight: FontWeight.w800, fontSize: 20),
                      ),
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
                            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: c.text),
                          ),
                          if (order.customerPhone.trim().isNotEmpty)
                            Text(order.customerPhone, style: TextStyle(color: c.textMuted, fontSize: 13)),
                        ],
                      ),
                    ),
                    if (order.customerPhone.trim().isNotEmpty)
                      Material(
                        color: c.successSubtle,
                        shape: const CircleBorder(),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () => _dial(order.customerPhone),
                          child: Tooltip(
                            message: tr('Call'),
                            child: SizedBox(
                              width: 44,
                              height: 44,
                              child: Icon(Icons.call_rounded, color: c.success, size: 21),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: c.iconTile, borderRadius: BorderRadius.circular(14)),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.location_on_rounded, color: c.brand, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(order.fullAddress, style: TextStyle(color: c.text, fontSize: 14, height: 1.45)),
                      ),
                    ],
                  ),
                ),
                if (order.notes != null && order.notes!.trim().isNotEmpty) ...[
                  const SizedBox(height: 10),
                  RunNote(icon: Icons.sticky_note_2_outlined, text: order.notes!, color: c.warning),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(BcRadius.card),
              gradient: LinearGradient(
                colors: c.isDark
                    ? [const Color(0xFF064E3B), const Color(0xFF065F46)]
                    : [const Color(0xFFECFDF5), const Color(0xFFD1FAE5)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: c.success.withValues(alpha: 0.25)),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(15)),
                  child: Icon(Icons.payments_rounded, color: c.success, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tr('You earn'), style: TextStyle(color: c.textMuted, fontSize: 12.5)),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          Format.money(order.deliveryFee),
                          style: TextStyle(color: c.text, fontWeight: FontWeight.w800, fontSize: 26),
                        ),
                      ),
                      Text(tr('Delivery fee for this stop'), style: TextStyle(color: c.textMuted, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          RunCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                RunCardHeader(
                  icon: Icons.local_cafe_rounded,
                  title: tr('Items'),
                  trailing: RunPill(label: trn(itemCount, '{n} item', '{n} items'), color: c.brand),
                ),
                for (var i = 0; i < order.items.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: c.border),
                  Padding(
                    padding: EdgeInsets.only(top: i == 0 ? 12 : 10, bottom: 10),
                    child: Row(
                      children: [
                        Container(
                          constraints: const BoxConstraints(minWidth: 38),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                          decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(10)),
                          alignment: Alignment.center,
                          child: Text(
                            '${order.items[i].quantity}×',
                            style: TextStyle(color: c.brand, fontWeight: FontWeight.w800, fontSize: 13),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            order.items[i].productName,
                            style: TextStyle(color: c.text, fontSize: 14, fontWeight: FontWeight.w500),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (order.complaints.isNotEmpty) ...[
            const SizedBox(height: 12),
            _ComplaintsSection(complaints: order.complaints),
          ],
          if (vm.error != null) ...[
            const SizedBox(height: 12),
            RunNote(icon: Icons.error_outline_rounded, text: vm.error!, color: c.danger),
          ],
        ],
      );
    }

    final red = c.isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.background,
        body: Column(
          children: [
            _OrderTopBar(order: order),
            Expanded(child: body),
          ],
        ),
        bottomNavigationBar: (order != null && order.isPending)
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
                padding: EdgeInsets.fromLTRB(16, 14, 16, 12 + MediaQuery.paddingOf(context).bottom),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (canAct) ...[
                      StopCustomerActions(
                        canCall: order.customerPhone.trim().isNotEmpty,
                        canNavigate: order.lat != null && order.lng != null,
                        onCall: () => _dial(order.customerPhone),
                        onNavigate: () {
                          if (order.lat == null || order.lng == null) return;
                          NavigationScreen.open(
                            context,
                            NavTarget(
                              lat: order.lat!,
                              lng: order.lng!,
                              label: order.customerName,
                              kind: NavKindCustomerStop(order.orderId),
                            ),
                            actionBuilder: (_) => NavCustomerStop(
                              callEnabled: order.customerPhone.trim().isNotEmpty,
                              onCall: () => Intents.dial(order.customerPhone),
                            ),
                          );
                        },
                        onOpenGoogleMaps: () {
                          if (order.lat != null && order.lng != null) {
                            Intents.navigateTo(order.lat!, order.lng!, label: order.customerName);
                          }
                        },
                        extra: RoundActionIcon(
                          caption: tr('Failure'),
                          icon: Icons.error_outline_rounded,
                          tint: red,
                          onTap: () => _reportFailure(vm, order),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    RunPrimaryButton(
                      label: tr('Mark delivered'),
                      icon: Icons.verified_rounded,
                      enabled: canAct,
                      locked: !canAct,
                      colors: const [Color(0xFF34D399), Color(0xFF10B981), Color(0xFF059669)],
                      onPressed: () => _markDelivered(vm, order),
                    ),
                    const SizedBox(height: 10),
                    RunOutlineButton(
                      label: tr('Raise complaint'),
                      icon: Icons.feedback_outlined,
                      color: c.warning,
                      enabled: canAct,
                      onPressed: () => _raiseComplaint(vm, order),
                    ),
                  ],
                ),
              )
            : null,
      ),
    );
  }
}

class _OrderTopBar extends StatelessWidget {
  const _OrderTopBar({required this.order});
  final JobOrder? order;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final status = o == null ? null : statusLabel(context, o.isFailed ? 'DELIVERY_FAILED' : o.status).$1;
    return BcDetailTopBar(
      title: o == null ? tr('Order') : '#${o.orderNumber}',
      subtitle: o != null && o.sequence > 0 ? tr('Stop {n}', {'n': '${o.sequence}'.padLeft(2, '0')}) : null,
      trailing: status == null
          ? null
          : BcTopBarPill(
              label: status,
              dotColor: o!.isDelivered
                  ? const Color(0xFF4ADE80)
                  : o.isFailed
                  ? const Color(0xFFF87171)
                  : const Color(0xFFFBBF24),
            ),
      bottom: o == null
          ? null
          : Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _TopBarTag(icon: Icons.account_balance_wallet_outlined, label: o.paymentMethod),
                _TopBarTag(
                  icon: o.paymentStatus == 'PAID' ? Icons.check_circle_outline_rounded : Icons.schedule_rounded,
                  label: o.paymentStatus,
                ),
              ],
            ),
    );
  }
}

class _TopBarTag extends StatelessWidget {
  const _TopBarTag({required this.icon, required this.label});
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

class _StopStatusCard extends StatelessWidget {
  const _StopStatusCard({required this.order, required this.canAct, required this.gateHint});
  final JobOrder order;
  final bool canAct;
  final String? gateHint;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final pretty = order.status.replaceAll('_', ' ').toLowerCase();
    final (title, detail, tint, icon) = order.isDelivered
        ? (tr('Delivered'), tr('This stop is complete.'), c.success, Icons.check_circle_rounded)
        : order.isFailed
        ? (tr('Delivery failed'), tr('Delivery reported as failed.'), c.danger, Icons.cancel_rounded)
        : !order.isPending
        ? (
            pretty.isEmpty ? pretty : pretty[0].toUpperCase() + pretty.substring(1),
            tr('This order is {pretty}.', {'pretty': pretty}),
            c.textMuted,
            Icons.schedule_rounded,
          )
        : canAct
        ? (tr('Ready to deliver'), tr('You can mark this stop delivered.'), c.brand, Icons.task_alt_rounded)
        : (
            tr('Not ready yet'),
            gateHint ?? tr('Complete the current stop first'),
            c.warning,
            Icons.hourglass_top_rounded,
          );
    return Container(
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(BcRadius.card),
        border: Border.all(color: tint.withValues(alpha: 0.35), width: 1.3),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 16, offset: const Offset(0, 5))],
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 5, color: tint),
            Expanded(
              child: Container(
                color: tint.withValues(alpha: 0.05),
                padding: const EdgeInsets.fromLTRB(14, 14, 16, 14),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: tint.withValues(alpha: 0.14)),
                      child: Icon(icon, color: tint, size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            title,
                            style: TextStyle(color: tint, fontWeight: FontWeight.w800, fontSize: 16),
                          ),
                          const SizedBox(height: 2),
                          Text(detail, style: TextStyle(color: c.textMuted, fontSize: 13, height: 1.4)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
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
              decoration: BoxDecoration(color: c.iconTile, borderRadius: BorderRadius.circular(14)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          tr(cp.category),
                          style: TextStyle(fontWeight: FontWeight.w700, color: c.text, fontSize: 14),
                        ),
                      ),
                      InfoBadge(
                        _titleCase(cp.status.replaceAll('_', ' ').toLowerCase()),
                        color: switch (cp.status) {
                          'CONFIRMED' || 'RESOLVED' => c.success,
                          'DISMISSED' => c.textMuted,
                          _ => c.accent,
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(cp.description, style: TextStyle(color: c.text, fontSize: 13, height: 1.4)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(Icons.schedule_rounded, size: 13, color: c.textMuted),
                      const SizedBox(width: 4),
                      Text(Format.dateTime(cp.createdAt), style: TextStyle(color: c.textMuted, fontSize: 12)),
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
