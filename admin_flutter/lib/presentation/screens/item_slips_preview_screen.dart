import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../core/runtime_config.dart';
import '../../domain/entities/order.dart';
import '../../l10n/l10n.dart';
import '../components/buttons.dart';
import '../components/snack.dart';
import '../printing/item_slips.dart';
import '../theme/pos_theme.dart';

/// Thermal slip preview (3-inch paper look) before sending to the Bluetooth printer.
class ItemSlipsPreviewScreen extends StatefulWidget {
  const ItemSlipsPreviewScreen({super.key, required this.order});
  final OrderDetail order;

  @override
  State<ItemSlipsPreviewScreen> createState() => _ItemSlipsPreviewScreenState();
}

class _ItemSlipsPreviewScreenState extends State<ItemSlipsPreviewScreen> {
  late final List<ItemSlip> _slips = ItemSlips.buildSlips(widget.order);
  bool _printing = false;

  Future<void> _print() async {
    if (_printing || _slips.isEmpty) return;
    setState(() => _printing = true);
    try {
      await ItemSlips.printSlips(_slips);
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, tr('Item slips sent to printer'), kind: PosSnackKind.success);
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
      showPosSnack(context, msg, kind: PosSnackKind.error);
    } finally {
      if (mounted) setState(() => _printing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rc = RuntimeConfig.instance;
    final printerLabel = rc.hasBluetoothPrinter
        ? (rc.bluetoothPrinterName ?? rc.bluetoothPrinterMac!)
        : tr('Not set');

    return Scaffold(
      backgroundColor: const Color(0xFF2A2A2A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1F1F1F),
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tr('Print preview'), style: PosType.heading.copyWith(color: Colors.white, fontSize: 16)),
            Text(
              tr('{n} slip(s) · 80mm / 3 inch', {'n': '${_slips.length}'}),
              style: PosType.caption.copyWith(color: Colors.white70, fontSize: 11.5),
            ),
          ],
        ),
      ),
      body: _slips.isEmpty
          ? Center(child: Text(tr('This order has no items to print'), style: PosType.body.copyWith(color: Colors.white70)))
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
              itemCount: _slips.length,
              separatorBuilder: (_, _) => const SizedBox(height: 16),
              itemBuilder: (context, i) => _SlipCard(slip: _slips[i]),
            ),
      bottomNavigationBar: Container(
        color: const Color(0xFF1F1F1F),
        padding: EdgeInsets.fromLTRB(
          PosSpacing.lg,
          PosSpacing.md,
          PosSpacing.lg,
          PosSpacing.md + MediaQuery.paddingOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${tr('Printer')}: $printerLabel',
              textAlign: TextAlign.center,
              style: PosType.caption.copyWith(color: Colors.white60),
            ),
            const SizedBox(height: PosSpacing.sm),
            PosButton(
              label: tr('Print now'),
              icon: Icons.print_rounded,
              loading: _printing,
              onPressed: _slips.isEmpty || _printing ? null : _print,
            ),
          ],
        ),
      ),
    );
  }
}

/// Mimics a torn 80 mm thermal slip on a dark preview canvas.
class _SlipCard extends StatelessWidget {
  const _SlipCard({required this.slip});
  final ItemSlip slip;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 280),
        child: AspectRatio(
          aspectRatio: 3 / 2.1,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: const Color(0xFFF7F4EC),
              borderRadius: BorderRadius.circular(4),
              boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 16, offset: Offset(0, 6))],
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'ORDER SLIP',
                    textAlign: TextAlign.center,
                    style: PosType.label.copyWith(
                      color: const Color(0xFF111827),
                      fontSize: 12,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    slip.orderNumber,
                    textAlign: TextAlign.center,
                    style: PosType.bodyStrong.copyWith(
                      color: const Color(0xFF111827),
                      fontSize: 14,
                      fontFeatures: PosType.tabular,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    slip.itemName,
                    textAlign: TextAlign.center,
                    style: PosType.heading.copyWith(color: const Color(0xFF111827), fontSize: 17),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    ItemSlips.sep,
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: PosType.caption.copyWith(color: const Color(0xFF6B7280), fontSize: 10, letterSpacing: -0.4),
                  ),
                  if (slip.total > 1) ...[
                    const SizedBox(height: 6),
                    Text(
                      '${slip.index} / ${slip.total}',
                      style: PosType.caption.copyWith(color: const Color(0xFF6B7280)),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
