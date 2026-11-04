import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_rules.dart';
import '../../domain/logic/takeaway_queue.dart';
import '../../l10n/l10n.dart';
import '../labels.dart';
import '../state/takeaway_queue_controller.dart';
import '../theme/pos_theme.dart';
import 'layout.dart';
import 'pos_card.dart';
import 'sheets.dart';
import 'snack.dart';
import 'states.dart';
import 'tabs.dart';

/// "Takeaway pickup queue" card at the top of Orders — port of the web
/// AdminTakeawayQueuePanel: reorder with arrows, sort by ordered time, move
/// each order forward through Received → Preparing → Ready.
class TakeawayQueuePanel extends StatelessWidget {
  const TakeawayQueuePanel({super.key});

  String _sortLabel(QueueSort s) => switch (s) {
    QueueSort.queue => tr('Queue order'),
    QueueSort.orderedAsc => tr('Ordered · oldest first'),
    QueueSort.orderedDesc => tr('Ordered · newest first'),
  };

  Future<void> _run(BuildContext context, Future<void> Function() action, String done, String failed) async {
    try {
      await action();
      if (context.mounted) showPosSnack(context, done, kind: PosSnackKind.success);
    } catch (e) {
      if (context.mounted) {
        final msg = e.toString();
        showPosSnack(context, msg.isEmpty ? failed : msg, kind: PosSnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<TakeawayQueueController>();
    final c = context.pos;
    final orders = ctrl.displayed;

    return PosCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: ctrl.toggleExpanded,
            borderRadius: BorderRadius.circular(PosRadius.card),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.sm, PosSpacing.md),
              child: Row(
                children: [
                  Icon(Icons.format_list_numbered_rounded, color: c.brand, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                tr('Takeaway pickup queue'),
                                overflow: TextOverflow.ellipsis,
                                style: PosType.section.copyWith(color: c.text),
                              ),
                            ),
                            const SizedBox(width: 6),
                            _CountPill(count: ctrl.count),
                          ],
                        ),
                        Text(
                          ctrl.sort == QueueSort.queue
                              ? tr('Reorder with arrows · update prep status')
                              : tr('Switch to “Queue order” to reorder · sorted by ordered time'),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: tr('Refresh'),
                    onPressed: () => ctrl.refresh(),
                    icon: Icon(Icons.refresh_rounded, color: c.textMuted, size: 20),
                  ),
                  Icon(ctrl.expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: c.textMuted),
                ],
              ),
            ),
          ),
          if (ctrl.expanded) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(PosSpacing.lg, 0, PosSpacing.lg, PosSpacing.sm),
              child: Align(
                alignment: Alignment.centerLeft,
                child: FilterPill(
                  icon: Icons.swap_vert_rounded,
                  label: _sortLabel(ctrl.sort),
                  active: ctrl.sort != QueueSort.queue,
                  onTap: () async {
                    final picked = await showOptionSheet<QueueSort>(
                      context,
                      title: tr('Sort queue'),
                      selected: ctrl.sort,
                      options: [for (final s in QueueSort.values) (s, _sortLabel(s))],
                    );
                    if (picked != null) ctrl.setSort(picked);
                  },
                ),
              ),
            ),
            if (ctrl.loading && orders.isEmpty)
              LoadingView(message: tr('Loading queue…'))
            else if (ctrl.error != null && orders.isEmpty)
              ErrorView(message: ctrl.error!, onRetry: ctrl.refresh)
            else if (orders.isEmpty)
              Padding(
                padding: const EdgeInsets.all(PosSpacing.xl),
                child: Text(
                  tr('No active takeaway orders in queue'),
                  textAlign: TextAlign.center,
                  style: PosType.body.copyWith(color: c.textMuted),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.fromLTRB(PosSpacing.md, 0, PosSpacing.md, PosSpacing.md),
                child: ResponsiveGrid(
                  minItemWidth: 420,
                  children: [
                    for (final (i, o) in orders.indexed)
                      _QueueRow(
                        order: o,
                        position: o.queuePosition ?? i + 1,
                        canUp: ctrl.canReorder && i > 0,
                        canDown: ctrl.canReorder && i < orders.length - 1,
                        busy: ctrl.busyId == o.id,
                        onMove: (dir) =>
                            _run(context, () => ctrl.move(i, dir), tr('Queue updated'), tr('Reorder failed')),
                        onStatus: (s) => _run(context, () => ctrl.setStatus(o, s), tr('Status updated'), tr('Failed')),
                      ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _CountPill extends StatelessWidget {
  const _CountPill({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(PosRadius.pill)),
      child: Text(
        '$count',
        style: PosType.caption.copyWith(color: c.brand, fontWeight: FontWeight.w800, fontFeatures: PosType.tabular),
      ),
    );
  }
}

/// One queued order: position, ▲ ▼, order, customer, items, total, times, status.
class _QueueRow extends StatelessWidget {
  const _QueueRow({
    required this.order,
    required this.position,
    required this.canUp,
    required this.canDown,
    required this.busy,
    required this.onMove,
    required this.onStatus,
  });

  final OrderSummary order;
  final int position;
  final bool canUp;
  final bool canDown;
  final bool busy;
  final ValueChanged<int> onMove;
  final ValueChanged<String> onStatus;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final qty = queueItemCount(order);
    final pickup = order.scheduledPickupAt;
    return Container(
      padding: const EdgeInsets.all(PosSpacing.md),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(PosRadius.card - 2),
        border: Border.all(color: c.border.withValues(alpha: 0.7)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: c.brand, shape: BoxShape.circle),
                child: Text(
                  '$position',
                  style: PosType.bodyStrong.copyWith(color: Colors.white, fontFeatures: PosType.tabular),
                ),
              ),
              const SizedBox(height: 6),
              _MoveButton(icon: Icons.keyboard_arrow_up_rounded, enabled: canUp, onTap: () => onMove(-1)),
              const SizedBox(height: 4),
              _MoveButton(icon: Icons.keyboard_arrow_down_rounded, enabled: canDown, onTap: () => onMove(1)),
            ],
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
                        order.orderNumber,
                        overflow: TextOverflow.ellipsis,
                        style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular),
                      ),
                    ),
                    Text(
                      formatMoney(order.total),
                      style: PosType.bodyStrong.copyWith(color: c.successText, fontFeatures: PosType.tabular),
                    ),
                  ],
                ),
                Text(customerDisplayName(order), style: PosType.caption.copyWith(color: c.textMuted)),
                const SizedBox(height: 6),
                if (order.items.isEmpty)
                  Text('—', style: PosType.caption.copyWith(color: c.textMuted))
                else
                  for (final item in order.items)
                    Text.rich(
                      TextSpan(
                        text: item.productName,
                        children: [
                          TextSpan(
                            text: ' ×${item.quantity}',
                            style: TextStyle(color: c.textMuted),
                          ),
                        ],
                      ),
                      style: PosType.caption.copyWith(color: c.text, fontSize: 12.5),
                    ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: PosSpacing.md,
                  runSpacing: 4,
                  children: [
                    _Fact(label: tr('Qty'), value: qty == 0 ? '—' : '$qty'),
                    _Fact(label: tr('Ordered'), value: formatShortDateTime(order.createdAt)),
                    _Fact(label: tr('Pickup'), value: pickup == null ? '—' : formatTime(pickup), accent: true),
                  ],
                ),
                const SizedBox(height: PosSpacing.sm),
                _QueueStatusSelect(status: order.status, busy: busy, onChanged: onStatus),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value, this.accent = false});
  final String label;
  final String value;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Text.rich(
      TextSpan(
        text: '${label.toUpperCase()}  ',
        style: PosType.label.copyWith(color: c.textMuted, fontSize: 9.5),
        children: [
          TextSpan(
            text: value,
            style: PosType.caption.copyWith(
              color: accent ? c.brand : c.text,
              fontWeight: FontWeight.w600,
              fontFeatures: PosType.tabular,
            ),
          ),
        ],
      ),
    );
  }
}

class _MoveButton extends StatelessWidget {
  const _MoveButton({required this.icon, required this.enabled, required this.onTap});
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Opacity(
      opacity: enabled ? 1 : 0.3,
      child: Material(
        color: c.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(PosRadius.button),
          side: BorderSide(color: c.border),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(PosRadius.button),
          onTap: enabled
              ? () {
                  PosFeedback.tap();
                  onTap();
                }
              : null,
          child: SizedBox(width: 44, height: 40, child: Icon(icon, size: 24, color: c.text)),
        ),
      ),
    );
  }
}

/// Coloured status picker; earlier statuses are disabled (web QueueStatusSelect).
class _QueueStatusSelect extends StatelessWidget {
  const _QueueStatusSelect({required this.status, required this.busy, required this.onChanged});
  final String status;
  final bool busy;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final current = takeawayQueueStatuses.contains(status) ? status : OrderStatus.received;
    final color = orderStatusColor(context, current);
    return PopupMenuButton<String>(
      enabled: !busy,
      tooltip: tr('Update status'),
      position: PopupMenuPosition.under,
      onSelected: onChanged,
      itemBuilder: (ctx) => [
        for (final s in takeawayQueueStatuses)
          PopupMenuItem<String>(
            value: s,
            enabled: !isQueueStatusDisabled(current, s),
            child: Row(
              children: [
                Icon(
                  s == current ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                  size: 16,
                  color: isQueueStatusDisabled(current, s) ? ctx.pos.textSoft : orderStatusColor(ctx, s),
                ),
                const SizedBox(width: 8),
                Text(orderStatusLabel(s)),
              ],
            ),
          ),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(PosRadius.button),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                orderStatusLabel(current),
                style: PosType.caption.copyWith(color: color, fontWeight: FontWeight.w700),
              ),
            ),
            busy
                ? SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: color))
                : Icon(Icons.expand_more_rounded, size: 18, color: color),
          ],
        ),
      ),
    );
  }
}
