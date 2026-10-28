import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/order.dart';
import '../providers/shell_chrome_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../utils/order_receipt_utils.dart';
import '../utils/qr_card_exporter.dart';
import 'order_qr_code.dart';

/// Pickup QR sheet — clean QR focus + structured order summary.
class PickupQrModal extends ConsumerStatefulWidget {
  final Order order;

  const PickupQrModal({super.key, required this.order});

  static Future<void> show(BuildContext context, Order order) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.55),
      builder: (context) => PickupQrModal(order: order),
    );
  }

  @override
  ConsumerState<PickupQrModal> createState() => _PickupQrModalState();
}

class _PickupQrModalState extends ConsumerState<PickupQrModal> {
  final _exportKey = GlobalKey();
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

  Future<void> _downloadQr() async {
    setState(() => _downloading = true);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    final ok = await shareRepaintBoundaryPng(
      boundaryKey: _exportKey,
      fileName: 'bingchun-pickup-${order.orderNumber}.png',
      shareText: 'Bing Chun pickup — #${order.orderNumber}',
    );
    if (!mounted) return;
    setState(() => _downloading = false);
    if (!ok) showAppToast(context, 'Could not export QR card');
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final safeBottom = MediaQuery.paddingOf(context).bottom;

    return DraggableScrollableSheet(
      initialChildSize: 0.78,
      minChildSize: 0.45,
      maxChildSize: 0.92,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: bc.cardBg,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(top: BorderSide(color: bc.border)),
          ),
          child: Column(
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
                          'Pickup QR',
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
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                  children: [
                    RepaintBoundary(
                      key: _exportKey,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 22),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          children: [
                            OrderQrCode(
                              qrCodeBase64: order.qrCode,
                              orderNumber: order.orderNumber,
                              size: 168,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              order.orderNumber,
                              style: const TextStyle(
                                color: BcColors.lightText,
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                                letterSpacing: 0.5,
                                fontFeatures: [FontFeature.tabularFigures()],
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              order.statusDisplay,
                              style: TextStyle(
                                color: BcColors.success.withValues(alpha: 0.9),
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                            if (order.storeName != null) ...[
                              const SizedBox(height: 6),
                              Text(
                                order.storeName!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: BcColors.lightTextMuted,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                            if (order.queuePosition != null && order.isActive) ...[
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                                decoration: BoxDecoration(
                                  color: BcColors.accent.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  'Queue #${order.queuePosition}',
                                  style: const TextStyle(
                                    color: BcColors.accent,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ],
                            const SizedBox(height: 8),
                            Text(
                              formatMoney(order.total),
                              style: const TextStyle(
                                color: BcColors.lightText,
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _InfoPanel(
                      order: order,
                      surface: bc.pageBg,
                      border: bc.border,
                      onSurface: onSurface,
                      muted: bc.mutedText,
                    ),
                    if (order.items.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _ItemsPanel(
                        items: order.items,
                        surface: bc.pageBg,
                        border: bc.border,
                        onSurface: onSurface,
                        muted: bc.mutedText,
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      'Show this QR at the counter',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: bc.mutedText, fontSize: 12),
                    ),
                    SizedBox(height: 20 + safeBottom),
                  ],
                ),
              ),
              Container(
                padding: EdgeInsets.fromLTRB(20, 12, 20, 12 + safeBottom),
                decoration: BoxDecoration(
                  color: bc.cardBg,
                  border: Border(top: BorderSide(color: bc.border)),
                ),
                child: Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _downloading ? null : _downloadQr,
                        icon: _downloading
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.download_rounded, size: 20),
                        label: Text(_downloading ? 'Preparing…' : 'Download QR'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('Close'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _InfoPanel extends StatelessWidget {
  final Order order;
  final Color surface;
  final Color border;
  final Color onSurface;
  final Color muted;

  const _InfoPanel({
    required this.order,
    required this.surface,
    required this.border,
    required this.onSurface,
    required this.muted,
  });

  @override
  Widget build(BuildContext context) {
    final itemCount = order.items.fold<int>(0, (sum, i) => sum + i.quantity);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
      ),
      child: Column(
        children: [
          _infoTile(Icons.storefront_outlined, 'Store', order.storeName ?? '—'),
          if (order.pickupTime != null)
            _infoTile(Icons.schedule_rounded, 'Pickup', order.pickupTime!),
          _infoTile(
            Icons.local_cafe_outlined,
            'Items',
            itemCount > 0 ? '$itemCount drink${itemCount == 1 ? '' : 's'}' : '—',
          ),
          _infoTile(Icons.payments_outlined, 'Total', formatMoney(order.total), emphasize: true),
        ],
      ),
    );
  }

  Widget _infoTile(IconData icon, String label, String value, {bool emphasize = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 18, color: muted),
          const SizedBox(width: 10),
          SizedBox(
            width: 56,
            child: Text(label, style: TextStyle(color: muted, fontSize: 13)),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: onSurface,
                fontSize: 13,
                fontWeight: emphasize ? FontWeight.bold : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemsPanel extends StatelessWidget {
  final List<OrderItem> items;
  final Color surface;
  final Color border;
  final Color onSurface;
  final Color muted;

  const _ItemsPanel({
    required this.items,
    required this.surface,
    required this.border,
    required this.onSurface,
    required this.muted,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ORDER ITEMS',
            style: TextStyle(
              color: muted,
              fontSize: 10,
              fontWeight: FontWeight.bold,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 10),
          ...items.map((item) {
            final options = itemOptionLine(item);
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: BcColors.brand.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${item.quantity}',
                      style: const TextStyle(
                        color: BcColors.brand,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.productName,
                          style: TextStyle(
                            color: onSurface,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                        if (options.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              options,
                              style: TextStyle(color: muted, fontSize: 11),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
