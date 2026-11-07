import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../domain/entities/admin_notification.dart';
import '../../domain/entities/order.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/states.dart';
import '../labels.dart';
import '../routes.dart';
import '../state/order_alerts_controller.dart';
import '../theme/pos_theme.dart';

/// New-order alerts (web notification bell).
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  Future<void> _open(BuildContext context, OrderAlertsController alerts, AdminNotice n) async {
    alerts.markRead(n);
    final key = n.orderNumber ?? n.orderId;
    if (key != null) await AppRoutes.openOrder(context, key);
  }

  @override
  Widget build(BuildContext context) {
    final alerts = context.watch<OrderAlertsController>();
    final c = context.pos;
    final notices = alerts.notices;
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Notifications')),
        actions: [
          if (alerts.unreadCount > 0) TextButton(onPressed: alerts.markAllRead, child: Text(tr('Mark all read'))),
        ],
      ),
      body: notices.isEmpty
          ? EmptyView(message: tr('No new order alerts'), icon: Icons.notifications_none_rounded)
          : ListView.separated(
              padding: centeredPadding(context, maxWidth: 760, top: PosSpacing.lg),
              itemCount: notices.length,
              separatorBuilder: (_, _) => const SizedBox(height: PosSpacing.sm),
              itemBuilder: (context, i) {
                final n = notices[i];
                final delivery = n.orderMode == OrderMode.delivery;
                return PosCard(
                  onTap: () => _open(context, alerts, n),
                  padding: const EdgeInsets.all(PosSpacing.md),
                  borderColor: n.read ? null : c.brand.withValues(alpha: 0.5),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: (delivery ? c.accent : c.brand).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(PosRadius.button),
                        ),
                        child: Icon(
                          delivery ? Icons.delivery_dining_rounded : Icons.shopping_bag_outlined,
                          color: delivery ? c.accent : c.brand,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: PosSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    n.orderNumber == null ? n.title : tr('New order #{n}', {'n': n.orderNumber}),
                                    style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5),
                                  ),
                                ),
                                if (!n.read)
                                  Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(color: c.brand, shape: BoxShape.circle),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(n.message, style: PosType.caption.copyWith(color: c.textMuted)),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                if (n.orderMode != null) ModeBadge(mode: n.orderMode!),
                                if (n.queuePosition != null)
                                  PosBadge(label: tr('Token {n}', {'n': n.queuePosition}), color: c.brand),
                                if (n.total != null) PosBadge(label: formatMoney(n.total!), color: c.textMuted),
                                Text(
                                  formatShortDateTime(n.receivedAt),
                                  style: PosType.caption.copyWith(color: c.textSoft, fontSize: 11),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}

/// One-line summary for the in-app new-order toast.
String noticeHeadline(AdminNotice n) {
  final parts = <String>[
    if (n.orderNumber != null) tr('New order #{n}', {'n': n.orderNumber}) else n.title,
    if (n.orderMode != null) modeLabel(n.orderMode!),
    if (n.customerName != null) n.customerName!,
  ];
  return parts.join(' · ');
}
