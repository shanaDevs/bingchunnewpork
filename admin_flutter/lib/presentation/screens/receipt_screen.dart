import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/format.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_rules.dart';
import '../../l10n/l10n.dart';
import '../components/pos_app_bar.dart';
import '../components/layout.dart';
import '../components/snack.dart';
import '../labels.dart';
import '../theme/pos_theme.dart';

/// Order receipt (web AdminReceiptModal → OrderReceipt, admin view).
/// "Copy" puts a plain-text receipt on the clipboard for sharing.
class ReceiptScreen extends StatelessWidget {
  const ReceiptScreen({super.key, required this.order});
  final OrderDetail order;

  String _plainText() {
    final o = order;
    final b = StringBuffer()
      ..writeln('Bing Chun${o.storeName == null ? '' : ' — ${o.storeName}'}')
      ..writeln('${tr('Order')} #${o.orderNumber}')
      ..writeln(formatReceiptDate(o.createdAt));
    if (o.queuePosition != null) b.writeln('${tr('Pickup token')}: ${o.queuePosition}');
    b.writeln('--------------------------------');
    for (final i in o.items) {
      b.writeln('${i.quantity} × ${i.productName}  ${formatMoney(i.totalPrice)}');
      if (i.toppings.isNotEmpty) b.writeln('   + ${i.toppings.join(', ')}');
    }
    b
      ..writeln('--------------------------------')
      ..writeln('${tr('Items subtotal')}: ${formatMoney(o.subtotal)}');
    if (o.convenientFee > 0) b.writeln('${tr('Convenience fee')}: ${formatMoney(o.convenientFee)}');
    if (o.deliveryFee > 0) b.writeln('${tr('Delivery fee')}: ${formatMoney(o.deliveryFee)}');
    if (o.discount > 0) b.writeln('${tr('Discount')}: -${formatMoney(o.discount)}');
    if (o.loyaltyDiscount > 0) b.writeln('${tr('Loyalty discount')}: -${formatMoney(o.loyaltyDiscount)}');
    b
      ..writeln('${tr(orderTotalLabel(o))}: ${formatMoney(o.total)}')
      ..writeln('${paymentMethodLabel(o.paymentMethod)} · ${paymentStateLong(o)}');
    return b.toString();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final o = order;
    final name = customerDisplayName(o, fallback: '');
    return Scaffold(
      appBar: PosAppBar(
        title: tr('Receipt'),
        eyebrow: '#${order.orderNumber}',
        actions: [
          IconButton(
            tooltip: tr('Copy receipt'),
            icon: const Icon(Icons.copy_rounded),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: _plainText()));
              if (context.mounted) showPosSnack(context, tr('Receipt copied'), kind: PosSnackKind.success);
            },
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(PosSpacing.lg),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              padding: const EdgeInsets.all(PosSpacing.xl),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(PosRadius.lg),
                boxShadow: [BoxShadow(color: c.cardShadow.withValues(alpha: 0.2), blurRadius: 24)],
              ),
              child: DefaultTextStyle(
                style: PosType.body.copyWith(color: const Color(0xFF111827), fontSize: 13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: BrandMark(size: 52)),
                    const SizedBox(height: PosSpacing.sm),
                    Text(
                      'Bing Chun',
                      textAlign: TextAlign.center,
                      style: PosType.heading.copyWith(color: const Color(0xFF111827)),
                    ),
                    if (o.storeName != null)
                      Text(
                        o.storeName!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xFF4B5563)),
                      ),
                    const SizedBox(height: PosSpacing.md),
                    _Dashed(),
                    _Line(tr('Order'), '#${o.orderNumber}', bold: true),
                    _Line(tr('Date'), formatReceiptDate(o.createdAt)),
                    if (o.queuePosition != null) _Line(tr('Pickup token'), '${o.queuePosition}', bold: true),
                    _Line(tr('Type'), modeLabel(o.orderMode)),
                    if (name.isNotEmpty) _Line(tr('Customer'), name),
                    if (customerPhone(o) != null) _Line(tr('Phone'), customerPhone(o)!),
                    if (o.processedByName != null) _Line(tr('Processed by'), o.processedByName!),
                    _Dashed(),
                    for (final i in o.items) ...[
                      _Line('${i.quantity} × ${i.productName}', formatMoney(i.totalPrice)),
                      if (i.toppings.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(left: 14, bottom: 2),
                          child: Text(
                            '+ ${i.toppings.join(', ')}',
                            style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12),
                          ),
                        ),
                    ],
                    _Dashed(),
                    _Line(tr('Items subtotal'), formatMoney(o.subtotal)),
                    if (o.convenientFee > 0) _Line(tr('Convenience fee'), formatMoney(o.convenientFee)),
                    if (o.deliveryFee > 0) _Line(tr('Delivery fee'), formatMoney(o.deliveryFee)),
                    if (o.discount > 0) _Line(tr('Discount'), '-${formatMoney(o.discount)}'),
                    if (o.loyaltyDiscount > 0) _Line(tr('Loyalty discount'), '-${formatMoney(o.loyaltyDiscount)}'),
                    const SizedBox(height: 4),
                    _Line(tr(orderTotalLabel(o)), formatMoney(o.total), bold: true, big: true),
                    if (isOrderPaid(o) && orderBalanceDue(o) > 0)
                      _Line(tr('Balance due at counter'), formatMoney(orderBalanceDue(o)), bold: true),
                    _Dashed(),
                    _Line(tr('Payment'), paymentMethodLabel(o.paymentMethod)),
                    _Line(tr('Status'), paymentStateLong(o)),
                    const SizedBox(height: PosSpacing.md),
                    Text(
                      tr('Thank you! 🧋'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF1A5CD4)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.bold = false, this.big = false});
  final String label;
  final String value;
  final bool bold;
  final bool big;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
      fontSize: big ? 16 : 13,
      fontFeatures: PosType.tabular,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: style)),
          const SizedBox(width: 12),
          Text(value, style: style),
        ],
      ),
    );
  }
}

class _Dashed extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: LayoutBuilder(
      builder: (_, box) => Row(
        children: List.generate(
          (box.maxWidth / 7).floor(),
          (_) =>
              Container(width: 4, height: 1, margin: const EdgeInsets.only(right: 3), color: const Color(0xFFD1D5DB)),
        ),
      ),
    ),
  );
}
