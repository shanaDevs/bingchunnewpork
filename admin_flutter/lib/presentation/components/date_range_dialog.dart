import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/feedback.dart';
import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';
import 'buttons.dart';

/// Compact calendar popup for a date range (instead of the full-screen
/// Material picker): tap a start day, then an end day, then Apply.
Future<DateTimeRange?> showDateRangeDialog(
  BuildContext context, {
  required DateTime firstDate,
  required DateTime lastDate,
  DateTimeRange? initial,
}) {
  return showDialog<DateTimeRange>(
    context: context,
    builder: (_) => _DateRangeDialog(firstDate: _day(firstDate), lastDate: _day(lastDate), initial: initial),
  );
}

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

class _DateRangeDialog extends StatefulWidget {
  const _DateRangeDialog({required this.firstDate, required this.lastDate, this.initial});
  final DateTime firstDate;
  final DateTime lastDate;
  final DateTimeRange? initial;

  @override
  State<_DateRangeDialog> createState() => _DateRangeDialogState();
}

class _DateRangeDialogState extends State<_DateRangeDialog> {
  DateTime? _start;
  DateTime? _end;
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    _start = widget.initial == null ? null : _day(widget.initial!.start);
    _end = widget.initial == null ? null : _day(widget.initial!.end);
    final anchor = _end ?? widget.lastDate;
    _month = DateTime(anchor.year, anchor.month);
  }

  /// Previous month still has a selectable day / next month starts in range.
  bool get _canPrev => !DateTime(_month.year, _month.month, 0).isBefore(widget.firstDate);
  bool get _canNext => !DateTime(_month.year, _month.month + 1).isAfter(widget.lastDate);

  void _shift(int months) => setState(() => _month = DateTime(_month.year, _month.month + months));

  void _tap(DateTime d) {
    PosFeedback.tap();
    setState(() {
      if (_start == null || _end != null) {
        _start = d;
        _end = null;
      } else if (d.isBefore(_start!)) {
        _start = d;
      } else {
        _end = d;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final ml = MaterialLocalizations.of(context);
    final locale = L10n.dateLocale;
    final dayFmt = DateFormat('d MMM yyyy', locale);
    final firstWeekday = ml.firstDayOfWeekIndex; // 0 = Sunday
    final leading = (DateTime(_month.year, _month.month).weekday % 7 - firstWeekday) % 7;
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final cells = leading + daysInMonth;
    final rows = (cells / 7).ceil();
    final weekdays = [for (var i = 0; i < 7; i++) ml.narrowWeekdays[(firstWeekday + i) % 7]];

    final summary = _start == null
        ? tr('Select a start date')
        : _end == null
        ? '${dayFmt.format(_start!)} – …'
        : '${dayFmt.format(_start!)} – ${dayFmt.format(_end!)}';

    return Dialog(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(PosSpacing.lg),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.lg, PosSpacing.lg, PosSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(tr('Custom Range'), style: PosType.heading.copyWith(color: c.text, fontSize: 19)),
              const SizedBox(height: 2),
              Text(
                summary,
                style: PosType.caption.copyWith(color: c.brand, fontWeight: FontWeight.w600, fontSize: 13.5),
              ),
              const SizedBox(height: PosSpacing.md),
              Row(
                children: [
                  IconButton(
                    onPressed: _canPrev ? () => _shift(-1) : null,
                    icon: const Icon(Icons.chevron_left_rounded),
                    tooltip: tr('Previous month'),
                  ),
                  Expanded(
                    child: Text(
                      DateFormat('MMMM yyyy', locale).format(_month),
                      textAlign: TextAlign.center,
                      style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 16),
                    ),
                  ),
                  IconButton(
                    onPressed: _canNext ? () => _shift(1) : null,
                    icon: const Icon(Icons.chevron_right_rounded),
                    tooltip: tr('Next month'),
                  ),
                ],
              ),
              Row(
                children: [
                  for (final w in weekdays)
                    Expanded(
                      child: Text(
                        w,
                        textAlign: TextAlign.center,
                        style: PosType.label.copyWith(color: c.textMuted, fontSize: 12.5),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              for (var r = 0; r < rows; r++)
                Row(
                  children: [
                    for (var col = 0; col < 7; col++)
                      Expanded(
                        child: () {
                          final n = r * 7 + col - leading + 1;
                          if (n < 1 || n > daysInMonth) return const SizedBox(height: 50);
                          return _DayCell(
                            day: DateTime(_month.year, _month.month, n),
                            start: _start,
                            end: _end,
                            enabled:
                                !DateTime(_month.year, _month.month, n).isBefore(widget.firstDate) &&
                                !DateTime(_month.year, _month.month, n).isAfter(widget.lastDate),
                            onTap: _tap,
                          );
                        }(),
                      ),
                  ],
                ),
              const SizedBox(height: PosSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: PosButton(
                      label: tr('Cancel'),
                      variant: PosButtonVariant.outline,
                      height: 48,
                      onPressed: () => Navigator.pop(context),
                    ),
                  ),
                  const SizedBox(width: PosSpacing.sm),
                  Expanded(
                    child: PosButton(
                      label: tr('Apply'),
                      height: 48,
                      onPressed: _start == null
                          ? null
                          : () => Navigator.pop(context, DateTimeRange(start: _start!, end: _end ?? _start!)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.start,
    required this.end,
    required this.enabled,
    required this.onTap,
  });
  final DateTime day;
  final DateTime? start;
  final DateTime? end;
  final bool enabled;
  final ValueChanged<DateTime> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final isStart = start != null && day == start;
    final isEnd = end != null && day == end;
    final inRange = start != null && end != null && day.isAfter(start!) && day.isBefore(end!);
    final selected = isStart || isEnd;
    final today = DateUtils.isSameDay(day, DateTime.now());

    // Range band behind the days, rounded at its ends.
    final band = (inRange || (start != null && end != null && end != start && selected))
        ? BoxDecoration(
            color: c.brandSubtle,
            borderRadius: BorderRadius.horizontal(
              left: isStart ? const Radius.circular(25) : Radius.zero,
              right: isEnd ? const Radius.circular(25) : Radius.zero,
            ),
          )
        : null;

    return Container(
      height: 50,
      margin: const EdgeInsets.symmetric(vertical: 1),
      decoration: band,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? () => onTap(day) : null,
        child: Center(
          child: Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: selected ? c.brand : null,
              border: today && !selected ? Border.all(color: c.brand) : null,
            ),
            child: Text(
              '${day.day}',
              style: PosType.body.copyWith(
                fontSize: 15.5,
                fontFeatures: PosType.tabular,
                fontWeight: selected || today ? FontWeight.w700 : FontWeight.w400,
                color: !enabled
                    ? c.textSoft.withValues(alpha: 0.5)
                    : selected
                    ? Colors.white
                    : inRange
                    ? c.brand
                    : c.text,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
