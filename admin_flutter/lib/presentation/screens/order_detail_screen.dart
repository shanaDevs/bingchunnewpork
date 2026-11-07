import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_rules.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/cancel_countdown.dart';
import '../components/counter_payment_form.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/product_widgets.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../labels.dart';
import '../state/order_detail_controller.dart';
import '../theme/pos_theme.dart';
import 'item_slips_preview_screen.dart';
import 'order_edit_screen.dart';
import 'receipt_screen.dart';

/// Order details — port of the web AdminOrderDrawer. Pops `true` when the order changed.
class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({super.key, required this.orderKey, this.readOnly = false});
  final String orderKey;

  /// Super admin All Orders: details only, no status or edit actions (web view-only drawer).
  final bool readOnly;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => OrderDetailController(ctx.read<AppContainer>().orderRepository, orderKey),
      child: _OrderDetailView(readOnly: readOnly),
    );
  }
}

class _OrderDetailView extends StatefulWidget {
  const _OrderDetailView({required this.readOnly});
  final bool readOnly;

  @override
  State<_OrderDetailView> createState() => _OrderDetailViewState();
}

class _OrderDetailViewState extends State<_OrderDetailView> {
  bool _changed = false;

  void _close() => Navigator.of(context).pop(_changed);

  Future<void> _printSlips(OrderDetail order) async {
    if (order.items.isEmpty) return;
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => ItemSlipsPreviewScreen(order: order)),
    );
  }

  Future<void> _act(Future<void> Function() action, String success) async {
    try {
      await action();
      _changed = true;
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, success, kind: PosSnackKind.success);
      // Like the web drawer: a completed action dismisses the order.
      _close();
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  Future<void> _reject(OrderDetailController ctrl) async {
    final choice = await showPosSheet<_CancelChoice>(context, builder: (_) => const _CancelReasonSheet());
    if (choice == null) return;
    final number = ctrl.order!.orderNumber;
    await _act(() => ctrl.cancel(reason: choice.reason, note: choice.note), tr('Order #{n} updated', {'n': number}));
  }

  Future<void> _confirmPickup(OrderDetailController ctrl) async {
    if (!ctrl.counterPaymentReady) {
      showPosSnack(context, tr('Enter a valid cash amount or select card payment'), kind: PosSnackKind.error);
      return;
    }
    final number = ctrl.order!.orderNumber;
    try {
      final result = await ctrl.confirmPickup();
      _changed = true;
      PosFeedback.success();
      if (!mounted) return;
      final message = switch (result.kind) {
        'paid' => tr('#{n} picked up · marked paid', {'n': number}),
        'balance' => tr('#{n} picked up · collected {amount}', {'n': number, 'amount': formatMoney(result.amount)}),
        _ => tr('#{n} picked up · already paid online', {'n': number}),
      };
      showPosSnack(context, message, kind: PosSnackKind.success);
      _close();
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  Future<void> _edit(OrderDetailController ctrl, OrderEditMode mode) async {
    final updated = await Navigator.of(context).push<OrderDetail>(
      MaterialPageRoute(
        builder: (_) => OrderEditScreen(order: ctrl.order!, mode: mode),
      ),
    );
    if (updated != null) {
      _changed = true;
      ctrl.replaceOrder(updated);
    }
  }

  void _receipt(OrderDetail o) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ReceiptScreen(order: o)));

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<OrderDetailController>();
    final c = context.pos;
    final o = ctrl.order;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        backgroundColor: c.canvas,
        // Phantom keyboard insets on some phones collapsed the scroll area when the
        // footer used [bottomNavigationBar]. Allow inset only for counter cash entry.
        resizeToAvoidBottomInset:
            o != null && o.status == OrderStatus.ready && !o.isDelivery && ctrl.needsCounterPayment,
        appBar: AppBar(
          leading: BackButton(onPressed: _close),
          // The title stacks label + number + badges, which overflows the default
          // 56px toolbar and gets clipped — give it room when badges are shown.
          toolbarHeight: o != null ? 96 : 64,
          title: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(tr('Order details').toUpperCase(), style: PosType.label.copyWith(color: c.textMuted)),
              Text(
                o?.orderNumber ?? ctrl.orderKey,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: PosType.heading.copyWith(color: c.text, fontFeatures: PosType.tabular),
              ),
              if (o != null) ...[
                const SizedBox(height: 6),
                // Single scrollable row so narrow screens never wrap past the toolbar.
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      PaymentMethodBadge(method: o.paymentMethod),
                      const SizedBox(width: 6),
                      PaymentStateBadge(order: o, long: true),
                      const SizedBox(width: 6),
                      ChannelBadge(channel: o.channel),
                    ],
                  ),
                ),
              ],
            ],
          ),
          actions: [
            if (o != null)
              IconButton(
                tooltip: tr('View receipt'),
                onPressed: () => _receipt(o),
                icon: const Icon(Icons.receipt_long_outlined),
              ),
          ],
        ),
        body: Column(
          children: [
            Expanded(
              child: ctrl.loading
                  ? LoadingView(message: tr('Loading order…'))
                  : ctrl.error != null || o == null
                  ? ErrorView(message: ctrl.error ?? tr('Failed to load order'), onRetry: ctrl.load)
                  : _Body(ctrl: ctrl, order: o, onEdit: widget.readOnly ? null : (m) => _edit(ctrl, m)),
            ),
            if (o != null && !ctrl.loading && !widget.readOnly)
              _Footer(
                ctrl: ctrl,
                order: o,
                onAccept: () => _act(ctrl.accept, tr('Order #{n} updated', {'n': o.orderNumber})),
                onReject: () => _reject(ctrl),
                onComplete: () => _act(ctrl.markReady, tr('Order #{n} updated', {'n': o.orderNumber})),
                onPrint: () => _printSlips(o),
                onPickup: () => _confirmPickup(ctrl),
                onReceipt: () => _receipt(o),
              ),
          ],
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.ctrl, required this.order, this.onEdit});
  final OrderDetailController ctrl;
  final OrderDetail order;
  final ValueChanged<OrderEditMode>? onEdit;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final o = order;
    final editMode = orderEditMode(o);
    final paid = isOrderPaid(o);
    final balance = orderBalanceDue(o);
    final pickupAt = pickupTimeLabel(o, formatReceiptDate);
    final phone = customerPhone(o);
    final name = customerDisplayName(o, fallback: '');

    return ListView(
      padding: centeredPadding(context, top: PosSpacing.sm),
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            OrderStatusBadge(order: o),
            ModeBadge(mode: o.orderMode),
          ],
        ),
        const SizedBox(height: PosSpacing.md),
        PosCard(
          padding: const EdgeInsets.all(PosSpacing.md),
          child: Column(
            children: [
              if (!o.isDelivery && o.queuePosition != null) ...[
                Row(
                  children: [
                    PickupTokenBadge(token: o.queuePosition, size: 52),
                    const SizedBox(width: PosSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(tr('Pickup token'), style: PosType.caption.copyWith(color: c.textMuted)),
                          Text(
                            name.isEmpty ? tr('Walk-in customer') : name,
                            style: PosType.heading.copyWith(color: c.text),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                Divider(height: PosSpacing.xl, color: c.border.withValues(alpha: 0.6)),
              ],
              _InfoGrid(
                cells: [
                  InfoCell(
                    icon: Icons.schedule_rounded,
                    label: tr('Placed'),
                    child: Text(formatReceiptDate(o.createdAt)),
                  ),
                  if (name.isNotEmpty)
                    InfoCell(icon: Icons.person_outline_rounded, label: tr('Customer'), child: Text(name)),
                  if (phone != null)
                    InfoCell(
                      icon: Icons.phone_outlined,
                      label: tr('Phone'),
                      child: InkWell(
                        onTap: () => launchUrl(Uri.parse('tel:$phone')),
                        child: Text(phone, style: TextStyle(color: c.brand)),
                      ),
                    ),
                  if (o.processedByName != null)
                    InfoCell(icon: Icons.badge_outlined, label: tr('Processed by'), child: Text(o.processedByName!)),
                  if (ctrl.conversation != null)
                    InfoCell(
                      icon: Icons.chat_bubble_outline_rounded,
                      label: o.channel == 'TELEGRAM' ? 'Telegram' : 'WhatsApp',
                      child: Text(
                        o.channel == 'TELEGRAM'
                            ? (ctrl.conversation!.username ?? tr('Linked account'))
                            : (ctrl.conversation!.phone ?? phone ?? '—'),
                      ),
                    ),
                  if (!o.isDelivery && pickupAt != null)
                    InfoCell(icon: Icons.storefront_outlined, label: tr('Pickup time'), child: Text(pickupAt)),
                  if (o.isDelivery && o.deliveryAddressLine != null)
                    InfoCell(
                      icon: Icons.place_outlined,
                      label: tr('Deliver to'),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text([o.deliveryAddressLine, o.deliveryCity].whereType<String>().join(', ')),
                          if (o.deliveryLat != null && o.deliveryLng != null)
                            InkWell(
                              onTap: () => launchUrl(
                                Uri.parse('https://www.google.com/maps?q=${o.deliveryLat},${o.deliveryLng}'),
                                mode: LaunchMode.externalApplication,
                              ),
                              child: Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  tr('Open map'),
                                  style: PosType.caption.copyWith(color: c.brand, fontWeight: FontWeight.w600),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        if (o.status == OrderStatus.received) ...[
          const SizedBox(height: PosSpacing.md),
          CancelCountdownBadge(order: o, large: true),
        ],
        const SizedBox(height: PosSpacing.lg),
        SectionLabel(
          tr('Items'),
          trailing: editMode == null || onEdit == null
              ? null
              : TextButton.icon(
                  onPressed: () => onEdit!(editMode),
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: Text(editMode == OrderEditMode.addOnly ? tr('Add items') : tr('Edit order')),
                  style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                ),
        ),
        PosCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (final (i, item) in o.items.indexed) ...[
                if (i > 0) Divider(height: 1, color: c.border.withValues(alpha: 0.6)),
                Padding(
                  padding: const EdgeInsets.all(PosSpacing.md),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: c.brandSubtle,
                          borderRadius: BorderRadius.circular(PosRadius.sm),
                        ),
                        child: ProductImage(url: item.imageUrl, size: 42, contain: true),
                      ),
                      const SizedBox(width: PosSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item.productName, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5)),
                            Text(sizeLabel(item.size), style: PosType.caption.copyWith(color: c.textMuted)),
                            if (item.toppings.isNotEmpty)
                              Text(
                                '+ ${item.toppings.join(', ')}',
                                style: PosType.caption.copyWith(color: c.textMuted),
                              ),
                          ],
                        ),
                      ),
                      Text('×${item.quantity}', style: PosType.body.copyWith(color: c.textMuted)),
                      const SizedBox(width: PosSpacing.md),
                      Text(
                        formatMoney(item.totalPrice),
                        style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13, fontFeatures: PosType.tabular),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        if (editMode == null &&
            orderEditLockedReason(o) != null &&
            o.orderMode == OrderMode.takeaway &&
            o.status != OrderStatus.delivered &&
            o.status != OrderStatus.cancelled) ...[
          const SizedBox(height: PosSpacing.sm),
          Text(tr(orderEditLockedReason(o)!), style: PosType.caption.copyWith(color: c.textSoft)),
        ],
        const SizedBox(height: PosSpacing.md),
        PosCard(
          padding: const EdgeInsets.all(PosSpacing.md),
          child: Column(
            children: [
              MoneyRow(label: tr('Items subtotal'), amount: o.subtotal, color: c.text),
              if (o.convenientFee > 0)
                MoneyRow(label: tr('Convenience fee'), amount: o.convenientFee, hint: tr('(excl. commission)')),
              if (o.deliveryFee > 0)
                MoneyRow(label: tr('Delivery fee'), amount: o.deliveryFee, hint: tr('(excl. commission)')),
              if (o.discount > 0)
                MoneyRow(
                  label: o.promoCode == null ? tr('Discount') : '${tr('Discount')} (${o.promoCode})',
                  amount: o.discount,
                  negative: true,
                  color: c.successText,
                ),
              if (o.loyaltyDiscount > 0)
                MoneyRow(
                  label: tr('Loyalty discount'),
                  amount: o.loyaltyDiscount,
                  negative: true,
                  color: c.successText,
                ),
              Divider(height: PosSpacing.lg, color: c.border.withValues(alpha: 0.6)),
              MoneyRow(label: tr(orderTotalLabel(o)), amount: o.total, emphasis: true),
              if (paid && (o.prepaidAmount ?? 0) > 0) MoneyRow(label: tr('Paid'), amount: o.prepaidAmount!),
              if (paid && balance > 0) MoneyRow(label: tr('Balance due at counter'), amount: balance, color: c.text),
            ],
          ),
        ),
        if (o.statusEvents.isNotEmpty) ...[
          const SizedBox(height: PosSpacing.lg),
          SectionLabel(tr('Activity')),
          PosCard(
            padding: const EdgeInsets.all(PosSpacing.md),
            child: Column(
              children: [
                for (final (i, e) in o.statusEvents.indexed)
                  _TimelineRow(event: e, mode: o.orderMode, last: i == o.statusEvents.length - 1),
              ],
            ),
          ),
        ],
        if (ctrl.conversation != null && ctrl.conversation!.messages.isNotEmpty) ...[
          const SizedBox(height: PosSpacing.lg),
          SectionLabel(tr('{channel} conversation', {'channel': channelLabel(o.channel)})),
          PosCard(
            padding: const EdgeInsets.all(PosSpacing.md),
            child: Column(
              children: [
                for (final m in ctrl.conversation!.messages)
                  Align(
                    alignment: m.inbound ? Alignment.centerLeft : Alignment.centerRight,
                    child: Container(
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                      constraints: const BoxConstraints(maxWidth: 300),
                      decoration: BoxDecoration(
                        color: m.inbound ? c.surface : c.brandSubtle,
                        borderRadius: BorderRadius.circular(PosRadius.button),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (m.inbound ? tr('Customer') : tr('Bot')).toUpperCase(),
                            style: PosType.label.copyWith(color: c.textMuted, fontSize: 9.5),
                          ),
                          Text(m.body ?? '—', style: PosType.caption.copyWith(color: c.text)),
                        ],
                      ),
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

/// Two-column info grid on wide screens, single column on phones.
class _InfoGrid extends StatelessWidget {
  const _InfoGrid({required this.cells});
  final List<Widget> cells;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final cols = box.maxWidth > 420 ? 2 : 1;
        final w = (box.maxWidth - (cols - 1) * PosSpacing.md) / cols;
        return Wrap(
          spacing: PosSpacing.md,
          runSpacing: PosSpacing.md,
          children: [for (final cell in cells) SizedBox(width: w, child: cell)],
        );
      },
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.event, required this.mode, required this.last});
  final StatusEvent event;
  final String mode;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final color = orderStatusColor(context, event.status);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 10,
                height: 10,
                margin: const EdgeInsets.only(top: 4),
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              if (!last) Expanded(child: Container(width: 2, color: c.border.withValues(alpha: 0.6))),
            ],
          ),
          const SizedBox(width: PosSpacing.md),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : PosSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      text: orderEventLabel(event.status, mode),
                      style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13),
                      children: [
                        if (event.actorName != null)
                          TextSpan(
                            text: ' ${tr('by {name}', {'name': event.actorName})}',
                            style: PosType.body.copyWith(color: c.textMuted, fontSize: 13),
                          ),
                      ],
                    ),
                  ),
                  if (event.note != null) Text(event.note!, style: PosType.caption.copyWith(color: c.textMuted)),
                  if (event.createdAt != null)
                    Text(
                      formatReceiptDate(event.createdAt!),
                      style: PosType.caption.copyWith(color: c.textSoft, fontSize: 11),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({
    required this.ctrl,
    required this.order,
    required this.onAccept,
    required this.onReject,
    required this.onComplete,
    required this.onPrint,
    required this.onPickup,
    required this.onReceipt,
  });

  final OrderDetailController ctrl;
  final OrderDetail order;
  final VoidCallback onAccept;
  final VoidCallback onReject;
  final VoidCallback onComplete;
  final VoidCallback onPrint;
  final VoidCallback onPickup;
  final VoidCallback onReceipt;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final o = order;
    final paid = isOrderPaid(o);
    final balance = orderBalanceDue(o);
    final receiptButton = PosButton(
      label: tr('View receipt'),
      icon: Icons.receipt_long_outlined,
      variant: PosButtonVariant.outline,
      onPressed: onReceipt,
    );

    Widget? content;
    switch (o.status) {
      case OrderStatus.received:
        if (!ctrl.cancelWindowActive) {
          content = Row(
            children: [
              Expanded(
                flex: 3,
                child: PosButton(
                  label: tr('Accept'),
                  icon: Icons.check_circle_outline_rounded,
                  loading: ctrl.busy,
                  onPressed: onAccept,
                ),
              ),
              const SizedBox(width: PosSpacing.sm),
              Expanded(
                flex: 2,
                child: PosButton(
                  label: tr('Reject'),
                  icon: Icons.cancel_outlined,
                  variant: PosButtonVariant.danger,
                  onPressed: ctrl.busy ? null : onReject,
                ),
              ),
            ],
          );
        }
      case OrderStatus.preparing:
        content = Row(
          children: [
            Expanded(
              flex: 2,
              child: PosButton(
                label: tr('Print'),
                icon: Icons.print_outlined,
                variant: PosButtonVariant.outline,
                onPressed: ctrl.busy || o.items.isEmpty ? null : onPrint,
              ),
            ),
            const SizedBox(width: PosSpacing.sm),
            Expanded(
              flex: 3,
              child: PosButton(
                label: tr('Complete'),
                icon: Icons.check_circle_outline_rounded,
                loading: ctrl.busy,
                onPressed: onComplete,
              ),
            ),
          ],
        );
      case OrderStatus.ready when !o.isDelivery:
        final label = !paid
            ? tr('Confirm pickup & paid')
            : balance > 0
            ? tr('Confirm pickup & collect {amount}', {'amount': formatMoney(balance)})
            : tr('Confirm pickup');
        content = Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (ctrl.needsCounterPayment) ...[
              Row(
                children: [
                  Text(tr('Amount due'), style: PosType.body.copyWith(color: c.textMuted, fontSize: 13)),
                  const Spacer(),
                  Text(formatMoney(ctrl.amountDue), style: PosType.amount.copyWith(color: c.brand)),
                ],
              ),
              const SizedBox(height: PosSpacing.sm),
              CounterPaymentForm(
                amountDue: ctrl.amountDue,
                method: ctrl.method,
                cashController: ctrl.cashController,
                onMethodChanged: ctrl.setMethod,
                compact: true,
              ),
              const SizedBox(height: PosSpacing.md),
            ] else if (paid) ...[
              Text(
                tr('Customer paid online — confirm when they collect.'),
                textAlign: TextAlign.center,
                style: PosType.caption.copyWith(color: c.textMuted),
              ),
              const SizedBox(height: PosSpacing.sm),
            ],
            ListenableBuilder(
              listenable: ctrl.cashController,
              builder: (_, _) => Row(
                children: [
                  if (!ctrl.needsCounterPayment) ...[
                    PosButton(
                      label: tr('Receipt'),
                      icon: Icons.receipt_long_outlined,
                      variant: PosButtonVariant.outline,
                      expand: false,
                      onPressed: onReceipt,
                    ),
                    const SizedBox(width: PosSpacing.sm),
                  ],
                  Expanded(
                    child: PosButton(
                      label: label,
                      icon: Icons.check_circle_outline_rounded,
                      variant: PosButtonVariant.success,
                      loading: ctrl.busy,
                      onPressed: ctrl.counterPaymentReady ? onPickup : null,
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      case OrderStatus.ready:
        content = Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              tr('Order is ready — a rider is assigned from the delivery dashboard.'),
              textAlign: TextAlign.center,
              style: PosType.caption.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: PosSpacing.sm),
            receiptButton,
          ],
        );
      case OrderStatus.delivered when !o.isDelivery:
        content = Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(tr('Order confirmed — payment complete.'), style: PosType.caption.copyWith(color: c.successText)),
            const SizedBox(height: PosSpacing.sm),
            receiptButton,
          ],
        );
      default:
        content = receiptButton;
    }

    if (content == null) return const SizedBox.shrink();
    return Container(
      decoration: BoxDecoration(
        color: c.card,
        border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.7))),
        boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 24, offset: Offset(0, -8))],
      ),
      padding: EdgeInsets.fromLTRB(
        PosSpacing.lg,
        PosSpacing.md,
        PosSpacing.lg,
        PosSpacing.md + MediaQuery.paddingOf(context).bottom,
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: AnimatedSize(duration: PosMotion.standard, child: content),
        ),
      ),
    );
  }
}

class _CancelChoice {
  const _CancelChoice({this.reason, this.note});
  final CancelReason? reason;
  final String? note;
}

/// Reject flow: pick a reason or type another (web cancel step + "Other reason" modal).
class _CancelReasonSheet extends StatefulWidget {
  const _CancelReasonSheet();

  @override
  State<_CancelReasonSheet> createState() => _CancelReasonSheetState();
}

class _CancelReasonSheetState extends State<_CancelReasonSheet> {
  CancelReason? _reason;
  bool _other = false;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  bool get _valid => _other ? _note.text.trim().isNotEmpty : _reason != null;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    Widget option({required bool selected, required String label, required VoidCallback onTap}) => Padding(
      padding: const EdgeInsets.only(bottom: PosSpacing.sm),
      child: Material(
        color: selected ? c.danger.withValues(alpha: 0.1) : c.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(PosRadius.button),
          side: BorderSide(color: selected ? c.danger.withValues(alpha: 0.6) : c.border.withValues(alpha: 0.7)),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(PosRadius.button),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                Icon(
                  selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                  size: 20,
                  color: selected ? c.danger : c.textMuted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(label, style: PosType.body.copyWith(color: c.text, fontSize: 13.5)),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 0, PosSpacing.xl, PosSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(tr('Cancel order'), style: PosType.heading.copyWith(color: c.text)),
            const SizedBox(height: 2),
            Text(
              tr('Select a reason. This action cannot be undone.'),
              style: PosType.caption.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: PosSpacing.lg),
            for (final r in CancelReason.values)
              option(
                selected: !_other && _reason == r,
                label: tr(r.label),
                onTap: () => setState(() {
                  _reason = r;
                  _other = false;
                }),
              ),
            option(selected: _other, label: tr('Other'), onTap: () => setState(() => _other = true)),
            if (_other) ...[
              TextField(
                controller: _note,
                autofocus: true,
                minLines: 3,
                maxLines: 4,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(hintText: tr('Describe why this order is being cancelled…')),
              ),
              const SizedBox(height: PosSpacing.sm),
            ],
            const SizedBox(height: PosSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: PosButton(
                    label: tr('Go back'),
                    variant: PosButtonVariant.outline,
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
                const SizedBox(width: PosSpacing.sm),
                Expanded(
                  flex: 2,
                  child: PosButton(
                    label: tr('Confirm cancellation'),
                    icon: Icons.cancel_outlined,
                    variant: PosButtonVariant.danger,
                    onPressed: _valid
                        ? () => Navigator.pop(
                            context,
                            _other ? _CancelChoice(note: _note.text.trim()) : _CancelChoice(reason: _reason),
                          )
                        : null,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
