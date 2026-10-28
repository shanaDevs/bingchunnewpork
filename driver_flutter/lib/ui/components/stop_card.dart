import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../theme/bc_theme.dart';
import 'buttons.dart';
import 'surfaces.dart';
import '../../l10n/l10n.dart';

/// Customer stop card — port of DriverStopCard.kt.
class DriverStopCard extends StatelessWidget {
  const DriverStopCard({
    super.key,
    required this.stopNumber,
    required this.order,
    required this.onOpen,
    required this.onCall,
    required this.onNavigate,
    required this.onOpenGoogleMaps,
    this.highlighted = false,
    this.showItems = false,
    this.showCustomerActions = true,
  });

  final int stopNumber;
  final JobOrder order;
  final VoidCallback onOpen;
  final VoidCallback onCall;
  final VoidCallback onNavigate;
  final VoidCallback onOpenGoogleMaps;
  final bool highlighted;
  final bool showItems;

  /// False before Confirm pickup, and for later stops until they become the current pending stop.
  final bool showCustomerActions;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final border = order.isFailed
        ? c.danger.withValues(alpha: 0.5)
        : highlighted
        ? c.brand
        : order.isDelivered
        ? c.success.withValues(alpha: 0.5)
        : c.border;
    final badgeBg = order.isDelivered
        ? c.successSubtle
        : order.isFailed
        ? c.dangerSubtle
        : highlighted
        ? c.infoSubtle
        : c.surfacePill;
    final badgeBorder = order.isDelivered
        ? c.success.withValues(alpha: 0.35)
        : order.isFailed
        ? c.danger.withValues(alpha: 0.35)
        : highlighted
        ? c.brand.withValues(alpha: 0.35)
        : c.border;
    final name = order.customerName.trim().isNotEmpty
        ? order.customerName
        : (order.customerPhone.trim().isNotEmpty ? order.customerPhone : tr('Customer'));

    return AnimatedContainer(
      duration: BcMotion.standard,
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: border, width: highlighted || order.isDelivered ? 1.5 : 1),
        boxShadow: [
          BoxShadow(color: const Color(0x180A2647), blurRadius: highlighted ? 14 : 6, offset: const Offset(0, 2)),
        ],
      ),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: badgeBg,
                        border: Border.all(color: badgeBorder),
                      ),
                      alignment: Alignment.center,
                      child: order.isDelivered
                          ? Icon(Icons.check_circle, color: c.success, size: 24, semanticLabel: tr('Delivered'))
                          : Text(
                              '$stopNumber'.padLeft(2, '0'),
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: highlighted ? c.brand : c.text,
                              ),
                            ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: c.text),
                                ),
                              ),
                              if (highlighted && order.isPending) ...[
                                const SizedBox(width: 8),
                                const StatusChip('NEXT'),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '#${order.orderNumber} · ${Format.money(order.deliveryFee)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12.5, color: c.textMuted),
                          ),
                          if (order.complaints.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            InfoBadge(
                              order.complaints.length == 1
                                  ? tr('Complaint filed')
                                  : tr('{n} complaints', {'n': order.complaints.length}),
                              color: c.accent,
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (order.isDelivered)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: c.successSubtle,
                          borderRadius: BorderRadius.circular(BcRadius.full),
                          border: Border.all(color: c.success.withValues(alpha: 0.35)),
                        ),
                        child: Text(
                          tr('✓ Delivered'),
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.success),
                        ),
                      )
                    else
                      StatusChip(order.isFailed ? 'FAILED' : order.status),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 2, right: 8),
                      child: Icon(Icons.place, color: c.brand, size: 18),
                    ),
                    Expanded(
                      child: Text(
                        order.shortAddress,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13.5, color: c.text.withValues(alpha: 0.88)),
                      ),
                    ),
                  ],
                ),
                if (showItems && order.items.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(
                    order.items.map((i) => '${i.quantity}× ${i.productName}').join(' · '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, color: c.textMuted),
                  ),
                ],
                if (order.isPending && showCustomerActions) ...[
                  const SizedBox(height: 10),
                  StopCustomerActions(
                    canCall: order.customerPhone.trim().isNotEmpty,
                    canNavigate: order.lat != null && order.lng != null,
                    onCall: onCall,
                    onNavigate: onNavigate,
                    onOpenGoogleMaps: onOpenGoogleMaps,
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      tr('View order'),
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.brand),
                    ),
                    const SizedBox(width: 4),
                    Icon(Icons.arrow_forward_ios, size: 11, color: c.brand),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Glance-level stop for [StopPreviewList].
class StopPreviewItem {
  final String customerName;
  final String shortAddress;

  /// Null when the row isn't individually tappable.
  final String? orderId;

  const StopPreviewItem({required this.customerName, required this.shortAddress, this.orderId});
}

/// Horizontal strip of up to the first 3 stops, in visiting order.
class StopPreviewList extends StatelessWidget {
  const StopPreviewList({super.key, required this.stops, this.onTap});

  final List<StopPreviewItem> stops;
  final ValueChanged<String>? onTap;

  @override
  Widget build(BuildContext context) {
    if (stops.isEmpty) return const SizedBox.shrink();
    final c = context.bc;
    final list = stops.take(3).toList();
    return SizedBox(
      height: 72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: list.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final s = list[i];
          final current = i == 0;
          return Material(
            color: current ? c.brandSubtle : c.card,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: current ? c.brand : c.border, width: current ? 1.5 : 1),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: (s.orderId != null && onTap != null) ? () => onTap!(s.orderId!) : null,
              child: SizedBox(
                width: 190,
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Row(
                    children: [
                      Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: current ? c.brand : c.iconTile),
                        alignment: Alignment.center,
                        child: Text(
                          '${i + 1}'.padLeft(2, '0'),
                          style: TextStyle(
                            color: current ? Colors.white : c.textMuted,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              s.customerName.trim().isEmpty ? tr('Customer') : s.customerName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: c.text, fontSize: 13.5, fontWeight: FontWeight.w700),
                            ),
                            Text(
                              s.shortAddress,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: c.textMuted, fontSize: 11.5, height: 1.25),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
