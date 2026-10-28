import 'package:flutter/material.dart';
import '../theme/bc_theme.dart';

class CheckoutPointsRedeem extends StatelessWidget {
  final int availablePoints;
  final int maxPoints;
  final int usePoints;
  final int discountLkr;
  final bool enabled;
  final bool signedIn;
  final int earnPreview;
  final String? blockedReason;
  final ValueChanged<bool> onEnabledChange;
  final ValueChanged<int> onPointsChange;

  const CheckoutPointsRedeem({
    super.key,
    required this.availablePoints,
    required this.maxPoints,
    required this.usePoints,
    required this.discountLkr,
    required this.enabled,
    required this.signedIn,
    this.earnPreview = 0,
    this.blockedReason,
    required this.onEnabledChange,
    required this.onPointsChange,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;

    if (!signedIn) {
      return _card(
        context,
        child: Row(
          children: [
            _iconBadge(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Redeem points',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    earnPreview > 0
                        ? 'Verify your phone to redeem loyalty points. This order can earn about $earnPreview pts.'
                        : 'Verify your phone to redeem loyalty points on this order.',
                    style: TextStyle(color: bc.mutedText, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    if (blockedReason != null && blockedReason!.isNotEmpty) {
      return _card(
        context,
        child: Row(
          children: [
            _iconBadge(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Redeem points',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    blockedReason!,
                    style: TextStyle(color: bc.mutedText, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    if (availablePoints <= 0 || maxPoints <= 0) {
      return _card(
        context,
        child: Row(
          children: [
            _iconBadge(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Redeem points',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    availablePoints > 0
                        ? '$availablePoints pts available. Add a bit more to this order to redeem.'
                        : earnPreview > 0
                            ? 'You have 0 pts now. This order can earn about $earnPreview pts.'
                            : 'You have 0 pts. Earn points on this order and redeem next time.',
                    style: TextStyle(color: bc.mutedText, fontSize: 12),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: bc.mutedText),
          ],
        ),
      );
    }

    return _card(
      context,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _iconBadge(),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Redeem points',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    Text(
                      '${availablePoints.toString()} pts available',
                      style: TextStyle(color: bc.mutedText, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                value: enabled,
                activeThumbColor: Colors.white,
                activeTrackColor: BcColors.brand,
                onChanged: onEnabledChange,
              ),
            ],
          ),
          if (enabled) ...[
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Use points', style: TextStyle(color: bc.mutedText, fontSize: 12)),
                Row(
                  children: [
                    SizedBox(
                      width: 72,
                      child: TextFormField(
                        initialValue: '$usePoints',
                        key: ValueKey(usePoints),
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontSize: 13),
                        decoration: const InputDecoration(
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        ),
                        onChanged: (value) {
                          final parsed = int.tryParse(value) ?? 0;
                          onPointsChange(parsed);
                        },
                      ),
                    ),
                    TextButton(
                      onPressed: () => onPointsChange(maxPoints),
                      child: const Text('Max'),
                    ),
                  ],
                ),
              ],
            ),
            Slider(
              value: usePoints.toDouble().clamp(0, maxPoints.toDouble()),
              min: 0,
              max: maxPoints.toDouble(),
              divisions: maxPoints > 0 ? maxPoints : 1,
              activeColor: BcColors.brand,
              onChanged: (value) => onPointsChange(value.round()),
            ),
            Text(
              '− LKR $discountLkr off this order',
              style: const TextStyle(
                color: BcColors.brand,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _card(BuildContext context, {required Widget child}) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: BcColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BcColors.brand.withValues(alpha: 0.35)),
      ),
      child: child,
    );
  }

  Widget _iconBadge() {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: BcColors.brand,
        borderRadius: BorderRadius.circular(10),
      ),
      child: const Icon(Icons.star_rounded, color: Colors.white, size: 18),
    );
  }
}
