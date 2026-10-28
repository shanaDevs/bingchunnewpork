import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../features/proof/presentation/otp_sheet.dart';
import '../models/delivery_job.dart';
import '../providers/jobs_provider.dart';
import '../theme/bc_theme.dart';

class OrderDetailScreen extends ConsumerWidget {
  final String jobId;
  final String orderId;

  const OrderDetailScreen({super.key, required this.jobId, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dash = ref.watch(dashboardProvider(jobId));
    final action = ref.watch(orderActionProvider);
    JobOrder? order;
    for (final o in dash.job?.orders ?? const []) {
      if (o.orderId == orderId) {
        order = o;
        break;
      }
    }

    return Theme(
      data: BcTheme.stopLight,
      child: _buildBody(context, ref, dash, action, order),
    );
  }

  Widget _buildBody(
    BuildContext context,
    WidgetRef ref,
    DashboardState dash,
    OrderActionState action,
    JobOrder? order,
  ) {
    if (dash.loading && order == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: BcColors.brand)),
      );
    }

    if (order == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Order not found')),
      );
    }

    final o = order;
    final inProgress = dash.job?.status == 'IN_PROGRESS' && !o.isDelivered;
    final canMarkOut = inProgress && o.status == 'READY';
    final canMarkDelivered = inProgress && (o.status == 'OUT_FOR_DELIVERY' || o.status == 'READY');
    final canFail = inProgress && (o.status == 'OUT_FOR_DELIVERY' || o.status == 'READY');

    return Scaffold(
      backgroundColor: BcColors.stopCanvas,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '#${o.orderNumber}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: BcColors.stopInk),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _pill(o.paymentMethod.replaceAll('_', ' '), tint: BcColors.stopBrandWash, ink: BcColors.brandDark),
                _paymentPill(o.paymentStatus),
              ],
            ),
          ],
        ),
        toolbarHeight: 76,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          _StopCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  o.customerName,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: BcColors.stopInk),
                ),
                const SizedBox(height: 6),
                Text(
                  o.fullAddress,
                  style: const TextStyle(color: BcColors.stopMuted, height: 1.45, fontSize: 13.5),
                ),
                if (o.notes != null && o.notes!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF7E8),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      o.notes!,
                      style: const TextStyle(fontSize: 13, color: Color(0xFFB45309), height: 1.35),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          _StopCard(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Delivery fee',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: BcColors.stopInk),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'What you earn for this stop.',
                        style: TextStyle(fontSize: 12.5, color: BcColors.stopMuted),
                      ),
                    ],
                  ),
                ),
                Text(
                  'Rs. ${NumberFormat('#,###').format(o.deliveryFee)}',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: BcColors.brand,
                    letterSpacing: -0.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _StopCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Items',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: BcColors.stopInk),
                ),
                const SizedBox(height: 10),
                ...o.items.asMap().entries.map((entry) {
                  final item = entry.value;
                  final last = entry.key == o.items.length - 1;
                  return Padding(
                    padding: EdgeInsets.only(bottom: last ? 0 : 8),
                    child: Text(
                      '${item.quantity}× ${item.productName}',
                      style: const TextStyle(fontSize: 14, color: BcColors.stopInk, height: 1.35),
                    ),
                  );
                }),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _ActionRow(order: o),
          if (o.isDelivered) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(
                color: BcColors.stopPaidBg,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Row(
                children: [
                  Icon(Icons.check_circle_rounded, color: BcColors.stopPaidFg),
                  SizedBox(width: 10),
                  Text(
                    'Order delivered',
                    style: TextStyle(color: BcColors.stopPaidFg, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ],
          if (action.error != null && !canMarkDelivered)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(action.error!, style: const TextStyle(color: BcColors.error, fontSize: 13)),
            ),
        ],
      ),
      bottomNavigationBar: inProgress
          ? _StopFooter(
              canMarkOut: canMarkOut,
              canMarkDelivered: canMarkDelivered,
              canFail: canFail,
              acting: action.acting,
              onMarkOut: () => _updateStatus(context, ref, 'OUT_FOR_DELIVERY'),
              onMarkDelivered: () => _openVerifyModal(context, ref),
              onReportFailure: () => _reportFailure(context, ref),
            )
          : null,
    );
  }

  Future<void> _openVerifyModal(BuildContext context, WidgetRef ref) async {
    final updated = await showDeliveryVerifyModal(
      context,
      onConfirm: (otp) => ref.read(orderActionProvider.notifier).updateStatus(orderId, 'DELIVERED', otp: otp),
      onResend: () => ref.read(orderActionProvider.notifier).resendOtp(orderId),
      errorMessage: () => ref.read(orderActionProvider).error,
    );
    if (updated == null) return;
    ref.read(dashboardProvider(jobId).notifier).applyOrderUpdate(updated);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        behavior: SnackBarBehavior.floating,
        content: Text('Order marked delivered'),
      ),
    );
  }

  Future<void> _updateStatus(BuildContext context, WidgetRef ref, String status, {String? note}) async {
    final updated = await ref.read(orderActionProvider.notifier).updateStatus(
          orderId,
          status,
          note: note,
        );
    if (updated == null) {
      if (!context.mounted) return;
      final err = ref.read(orderActionProvider).error;
      if (err != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
      }
      return;
    }
    ref.read(dashboardProvider(jobId).notifier).applyOrderUpdate(updated);
    if (!context.mounted) return;
    final message = status == 'OUT_FOR_DELIVERY'
        ? 'Out for delivery'
        : status == 'DELIVERY_FAILED'
            ? 'Failure reported'
            : 'Updated';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(behavior: SnackBarBehavior.floating, content: Text(message)),
    );
  }

  Future<void> _reportFailure(BuildContext context, WidgetRef ref) async {
    const reasons = [
      ('Customer not available', 'Customer not available / cannot contact'),
      ('Wrong address', 'Wrong address'),
      ('Customer refused', 'Customer refused'),
      ('Payment issue', 'Payment issue'),
      ('Other', 'Other'),
    ];

    final note = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Theme(
        data: BcTheme.stopLight,
        child: Container(
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          padding: const EdgeInsets.fromLTRB(8, 12, 8, 16),
          decoration: BoxDecoration(
            color: BcColors.stopCard,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: BcColors.stopBorder),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(12, 4, 12, 8),
                child: Text(
                  'Report failure',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: BcColors.stopInk),
                ),
              ),
              ...reasons.map(
                (r) => ListTile(
                  title: Text(r.$1, style: const TextStyle(fontWeight: FontWeight.w600, color: BcColors.stopInk)),
                  onTap: () => Navigator.of(ctx).pop(r.$2),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (note == null || !context.mounted) return;
    await _updateStatus(context, ref, 'DELIVERY_FAILED', note: note);
  }

  Widget _paymentPill(String status) {
    final paid = status.toUpperCase() == 'PAID';
    return _pill(
      status.replaceAll('_', ' '),
      tint: paid ? BcColors.stopPaidBg : const Color(0xFFFFF4D6),
      ink: paid ? BcColors.stopPaidFg : const Color(0xFFB45309),
    );
  }

  Widget _pill(String label, {required Color tint, required Color ink}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(20)),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.3, color: ink),
      ),
    );
  }
}

class _StopCard extends StatelessWidget {
  const _StopCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: BcColors.stopCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: BcColors.stopBorder),
        boxShadow: const [
          BoxShadow(color: Color(0x0A0B1F3A), blurRadius: 16, offset: Offset(0, 6)),
        ],
      ),
      child: child,
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.order});

  final JobOrder order;

  Uri get _mapsUri => Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}',
      );

  @override
  Widget build(BuildContext context) {
    final hasCoords = order.lat != null && order.lng != null;
    return Row(
      children: [
        Expanded(
          child: _ActionChip(
            icon: Icons.phone_rounded,
            label: 'Call',
            onTap: order.customerPhone.isEmpty
                ? null
                : () => launchUrl(Uri.parse('tel:${order.customerPhone}')),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _ActionChip(
            icon: Icons.navigation_rounded,
            label: 'Navigate',
            onTap: hasCoords ? () => launchUrl(_mapsUri, mode: LaunchMode.externalApplication) : null,
          ),
        ),
        const SizedBox(width: 8),
        Material(
          color: BcColors.stopCard,
          shape: const CircleBorder(side: BorderSide(color: BcColors.stopBorder)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: hasCoords ? () => launchUrl(_mapsUri, mode: LaunchMode.externalApplication) : null,
            child: const SizedBox(
              width: 48,
              height: 48,
              child: Icon(Icons.map_rounded, color: BcColors.brand),
            ),
          ),
        ),
      ],
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({required this.icon, required this.label, this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.stopCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: BcColors.stopBorder),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: onTap == null ? BcColors.stopMuted : BcColors.brand),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: onTap == null ? BcColors.stopMuted : BcColors.stopInk,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StopFooter extends StatelessWidget {
  const _StopFooter({
    required this.canMarkOut,
    required this.canMarkDelivered,
    required this.canFail,
    required this.acting,
    required this.onMarkOut,
    required this.onMarkDelivered,
    required this.onReportFailure,
  });

  final bool canMarkOut;
  final bool canMarkDelivered;
  final bool canFail;
  final bool acting;
  final VoidCallback onMarkOut;
  final VoidCallback onMarkDelivered;
  final VoidCallback onReportFailure;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.stopCard,
      elevation: 12,
      shadowColor: const Color(0x1A0B1F3A),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (canMarkOut) ...[
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: OutlinedButton(
                    onPressed: acting ? null : onMarkOut,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: BcColors.brandDark,
                      side: const BorderSide(color: BcColors.brand, width: 1.4),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text(acting ? 'Updating…' : 'Mark out for delivery'),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (canMarkDelivered)
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: acting ? null : onMarkDelivered,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: BcColors.brand,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text('Mark delivered', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  ),
                ),
              if (canFail) ...[
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: TextButton(
                    onPressed: acting ? null : onReportFailure,
                    style: TextButton.styleFrom(
                      foregroundColor: BcColors.stopInk,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: const BorderSide(color: BcColors.stopBorder),
                      ),
                    ),
                    child: const Text('Report failure', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
