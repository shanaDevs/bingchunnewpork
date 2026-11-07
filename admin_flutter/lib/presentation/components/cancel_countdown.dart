import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_rules.dart';
import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';

/// "Customer can cancel · 4:32" while the customer cancel window is open
/// (web AdminOrderCancelCountdownBadge). Hides itself once the window closes.
class CancelCountdownBadge extends StatefulWidget {
  const CancelCountdownBadge({super.key, required this.order, this.large = false});
  final OrderSummary order;
  final bool large;

  @override
  State<CancelCountdownBadge> createState() => _CancelCountdownBadgeState();
}

class _CancelCountdownBadgeState extends State<CancelCountdownBadge> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (!isCustomerCancelWindowActive(widget.order, DateTime.now())) _timer?.cancel();
      setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    if (!isCustomerCancelWindowActive(widget.order, now)) return const SizedBox.shrink();
    final c = context.pos;
    final left = formatCountdown(secondsUntil(widget.order.cancelWindowEndsAt, now));
    if (!widget.large) {
      return Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: c.accent.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(PosRadius.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.timer_outlined, size: 11, color: c.warningText),
            const SizedBox(width: 3),
            Text(
              left,
              style: PosType.label.copyWith(color: c.warningText, letterSpacing: 0, fontFeatures: PosType.tabular),
            ),
          ],
        ),
      );
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(PosSpacing.md),
      decoration: BoxDecoration(
        color: c.accent.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(PosRadius.card - 2),
        border: Border.all(color: c.accent.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.timer_outlined, color: c.warningText),
          const SizedBox(width: PosSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('Customer can still cancel'),
                  style: PosType.bodyStrong.copyWith(color: c.warningText, fontSize: 13),
                ),
                Text(
                  tr('Accept and Reject unlock when the timer ends.'),
                  style: PosType.caption.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ),
          Text(left, style: PosType.amount.copyWith(color: c.warningText)),
        ],
      ),
    );
  }
}
