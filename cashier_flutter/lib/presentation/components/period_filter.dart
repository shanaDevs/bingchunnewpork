import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';
import 'date_range_dialog.dart';
import 'sheets.dart';
import 'tabs.dart';

String periodLabel(PeriodFilter p) {
  switch (p.preset) {
    case PeriodPreset.today:
      return tr('Today');
    case PeriodPreset.month:
      return tr('This Month');
    case PeriodPreset.year:
      return tr('This Year');
    case PeriodPreset.custom:
      if (p.from == null || p.to == null) return tr('Custom Range');
      return '${formatShortDate(p.from!)} – ${formatShortDate(p.to!)}';
  }
}

/// Date range picker for the custom period; null when dismissed.
Future<PeriodFilter?> pickCustomRange(BuildContext context, PeriodFilter current) async {
  final now = DateTime.now();
  final range = await showDateRangeDialog(
    context,
    firstDate: DateTime(now.year - 3),
    lastDate: now,
    initial: current.from != null && current.to != null
        ? DateTimeRange(start: current.from!, end: current.to!)
        : DateTimeRange(start: now.subtract(const Duration(days: 6)), end: now),
  );
  return range == null ? null : PeriodFilter(PeriodPreset.custom, from: range.start, to: range.end);
}

/// Today / This Month / This Year / Custom Range as the web's pill buttons
/// (dark inactive, brand active). Scrolls sideways on narrow phones.
class PeriodSegments extends StatelessWidget {
  const PeriodSegments({super.key, required this.value, required this.onChanged});

  final PeriodFilter value;
  final ValueChanged<PeriodFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final items = [
      (PeriodPreset.today, tr('Today')),
      (PeriodPreset.month, tr('This Month')),
      (PeriodPreset.year, tr('This Year')),
      (PeriodPreset.custom, tr('Custom Range')),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Row(
        children: [
          for (final (preset, label) in items) ...[
            Material(
              color: value.preset == preset ? c.brand : (c.isDark ? c.surface : const Color(0xFF2B3240)),
              shape: const StadiumBorder(),
              child: InkWell(
                customBorder: const StadiumBorder(),
                onTap: () async {
                  PosFeedback.tap();
                  if (preset != PeriodPreset.custom) {
                    onChanged(PeriodFilter(preset));
                    return;
                  }
                  final custom = await pickCustomRange(context, value);
                  if (custom != null) onChanged(custom);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  child: Text(
                    preset == PeriodPreset.custom && value.preset == PeriodPreset.custom ? periodLabel(value) : label,
                    style: PosType.bodyStrong.copyWith(color: Colors.white, fontSize: 12.5),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 6),
          ],
        ],
      ),
    );
  }
}

/// Today / This month / This year / Custom range (date range picker).
class PeriodFilterPill extends StatelessWidget {
  const PeriodFilterPill({super.key, required this.value, required this.onChanged});

  final PeriodFilter value;
  final ValueChanged<PeriodFilter> onChanged;

  Future<void> _pick(BuildContext context) async {
    final preset = await showOptionSheet<PeriodPreset>(
      context,
      title: tr('Period'),
      selected: value.preset,
      options: [
        (PeriodPreset.today, tr('Today')),
        (PeriodPreset.month, tr('This Month')),
        (PeriodPreset.year, tr('This Year')),
        (PeriodPreset.custom, tr('Custom Range')),
      ],
    );
    if (preset == null || !context.mounted) return;
    if (preset != PeriodPreset.custom) {
      onChanged(PeriodFilter(preset));
      return;
    }
    final custom = await pickCustomRange(context, value);
    if (custom != null) onChanged(custom);
  }

  @override
  Widget build(BuildContext context) => FilterPill(
    label: periodLabel(value),
    icon: Icons.calendar_today_rounded,
    active: value.preset != PeriodPreset.today,
    onTap: () => _pick(context),
  );
}
