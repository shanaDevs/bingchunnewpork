import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/logic/counter_payment.dart';
import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';

/// Cash / Card toggle + cash received + live change — port of the web CounterPaymentForm.
class CounterPaymentForm extends StatelessWidget {
  const CounterPaymentForm({
    super.key,
    required this.amountDue,
    required this.method,
    required this.cashController,
    required this.onMethodChanged,
    this.compact = false,
  });

  final double amountDue;
  final CounterPaymentMethod method;
  final TextEditingController cashController;
  final ValueChanged<CounterPaymentMethod> onMethodChanged;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!compact) ...[
          Text(tr('Payment method'), style: PosType.caption.copyWith(color: c.textMuted)),
          const SizedBox(height: PosSpacing.sm),
        ],
        Row(
          children: [
            Expanded(
              child: _MethodButton(
                label: tr('Cash'),
                icon: Icons.payments_outlined,
                selected: method == CounterPaymentMethod.cash,
                onTap: () => onMethodChanged(CounterPaymentMethod.cash),
              ),
            ),
            const SizedBox(width: PosSpacing.sm),
            Expanded(
              child: _MethodButton(
                label: tr('Card'),
                icon: Icons.credit_card_rounded,
                selected: method == CounterPaymentMethod.card,
                onTap: () => onMethodChanged(CounterPaymentMethod.card),
              ),
            ),
          ],
        ),
        if (method == CounterPaymentMethod.cash) ...[
          SizedBox(height: compact ? PosSpacing.sm : PosSpacing.md),
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: cashController,
            builder: (context, value, _) {
              final change = cashChange(value.text, amountDue);
              final shortfall = change != null && change < 0;
              final tone = change == null ? c.textMuted : (shortfall ? c.dangerText : c.successText);
              return Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('Cash received'), style: PosType.caption.copyWith(color: c.textMuted)),
                        const SizedBox(height: 6),
                        SizedBox(
                          height: 46,
                          child: TextField(
                            controller: cashController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                            style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular),
                            decoration: const InputDecoration(hintText: '0'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: PosSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          shortfall ? tr('Short by') : tr('Change'),
                          style: PosType.caption.copyWith(color: c.textMuted),
                        ),
                        const SizedBox(height: 6),
                        AnimatedContainer(
                          duration: PosMotion.fast,
                          height: 46,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          alignment: Alignment.centerRight,
                          decoration: BoxDecoration(
                            color: change == null ? c.surface : tone.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(PosRadius.button),
                            border: Border.all(color: change == null ? c.border : tone.withValues(alpha: 0.3)),
                          ),
                          child: FittedBox(
                            child: Text(
                              change == null ? '—' : formatMoney(change.abs()),
                              style: PosType.amount.copyWith(color: tone, fontSize: compact ? 16 : 18),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ],
    );
  }
}

class _MethodButton extends StatelessWidget {
  const _MethodButton({required this.label, required this.icon, required this.selected, required this.onTap});

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Material(
      color: selected ? c.brand : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.sm),
        side: BorderSide(color: selected ? c.brand : c.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PosRadius.sm),
        onTap: () {
          PosFeedback.tap();
          onTap();
        },
        child: SizedBox(
          height: 44,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 17, color: selected ? Colors.white : c.textMuted),
              const SizedBox(width: 8),
              Text(label, style: PosType.bodyStrong.copyWith(color: selected ? Colors.white : c.textMuted)),
            ],
          ),
        ),
      ),
    );
  }
}
