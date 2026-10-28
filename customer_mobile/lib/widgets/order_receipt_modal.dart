import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../providers/shell_chrome_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../utils/order_receipt_pdf.dart';
import '../utils/qr_card_exporter.dart';
import 'order_receipt_card.dart';

/// Receipt sheet — preview + save PDF to Files/Downloads (no share sheet).
class OrderReceiptModal extends ConsumerStatefulWidget {
  final Order order;

  const OrderReceiptModal({
    super.key,
    required this.order,
  });

  static Future<void> show(BuildContext context, Order order) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.55),
      builder: (context) => OrderReceiptModal(order: order),
    );
  }

  @override
  ConsumerState<OrderReceiptModal> createState() => _OrderReceiptModalState();
}

class _OrderReceiptModalState extends ConsumerState<OrderReceiptModal> {
  bool _downloading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) suppressShellChrome(ref);
    });
  }

  @override
  void dispose() {
    restoreShellChrome(ref);
    super.dispose();
  }

  Order get order => widget.order;

  Future<void> _downloadReceipt() async {
    if (_downloading) return;
    setState(() => _downloading = true);

    String? savedPath;
    try {
      final bytes = await buildOrderReceiptPdf(order);
      savedPath = await saveBytesToDownloads(
        bytes: bytes,
        fileName: 'bingchun-receipt-${order.orderNumber}.pdf',
        mimeType: 'application/pdf',
      );
    } catch (_) {
      savedPath = null;
    }

    if (!mounted) return;
    setState(() => _downloading = false);

    if (savedPath != null) {
      showAppToast(
        context,
        'PDF saved to Files → Download → BingChun',
        isError: false,
      );
    } else {
      showAppToast(context, 'Could not save receipt PDF', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.92;

    return Align(
      alignment: Alignment.bottomCenter,
      child: Container(
        constraints: BoxConstraints(maxHeight: maxHeight),
        decoration: BoxDecoration(
          color: bc.cardBg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: bc.border)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: bc.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 4, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Text(
                        'Order Receipt',
                        style: TextStyle(
                          color: onSurface,
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: Icon(Icons.close_rounded, color: bc.mutedText),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: Theme(
                  data: ThemeData(
                    brightness: Brightness.light,
                    scaffoldBackgroundColor: Colors.white,
                    colorScheme: ColorScheme.fromSeed(
                      seedColor: BcColors.brand,
                      brightness: Brightness.light,
                    ),
                    extensions: const [BcAdaptive.light],
                    cardTheme: const CardThemeData(
                      color: Colors.white,
                      elevation: 0,
                      margin: EdgeInsets.zero,
                    ),
                  ),
                  child: ColoredBox(
                    color: Colors.white,
                    child: OrderReceiptCard(order: order),
                  ),
                ),
              ),
            ),
            Container(
              width: double.infinity,
              padding: EdgeInsets.fromLTRB(20, 12, 20, 12 + safeBottom),
              decoration: BoxDecoration(
                color: bc.cardBg,
                border: Border(top: BorderSide(color: bc.border)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FilledButton.icon(
                    onPressed: _downloading ? null : _downloadReceipt,
                    icon: _downloading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.picture_as_pdf_outlined, size: 20),
                    label: Text(
                      _downloading ? 'Saving PDF…' : 'Download Receipt',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: BcColors.brand,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: BcColors.brand.withValues(alpha: 0.55),
                      disabledForegroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(48),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Close'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
