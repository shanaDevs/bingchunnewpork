import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../l10n/l10n.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';
import 'buttons.dart';
import 'layout.dart';
import 'pos_card.dart';
import 'states.dart';

/// Shared building blocks for the admin pages (web DashboardKpiCard,
/// BrandCompactSection, ranking cards, admin tables and pagination).

/// Chart / data palette, in the web brand-sales order.
const adminPalette = [
  Color(0xFF307EF2),
  Color(0xFF1E3A8A),
  Color(0xFF36ADA3),
  Color(0xFFF59E0B),
  Color(0xFF93C5FD),
  Color(0xFFEF4444),
  Color(0xFF8B5CF6),
  Color(0xFF2F578A),
];

/// Metric tile: icon chip, uppercase title, big value and an optional caption.
class KpiTile extends StatelessWidget {
  const KpiTile({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    this.caption,
    this.color,
    this.loading = false,
    this.change,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final String? caption;
  final Color? color;
  final bool loading;

  /// Percent change vs the previous period (green up, red down).
  final double? change;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final tone = color ?? c.brand;
    return PosCard(
      onTap: onTap,
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: tone.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, size: 17, color: tone),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.label.copyWith(color: c.textMuted, fontSize: 10.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          if (loading)
            const SkeletonBox(height: 24, width: 110)
          else
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value, style: PosType.metric.copyWith(color: c.text, fontSize: 21)),
            ),
          if (change != null && !loading) ...[
            const SizedBox(height: 2),
            Row(
              children: [
                Icon(
                  change! >= 0 ? Icons.trending_up_rounded : Icons.trending_down_rounded,
                  size: 14,
                  color: change! >= 0 ? c.successText : c.dangerText,
                ),
                const SizedBox(width: 3),
                Text(
                  '${change! >= 0 ? '+' : ''}${change!.toStringAsFixed(1)}%',
                  style: PosType.caption.copyWith(
                    color: change! >= 0 ? c.successText : c.dangerText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ],
          if (caption != null && !loading) ...[
            const SizedBox(height: 2),
            Text(
              caption!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}

/// Grid of KPI tiles: 2 columns on phones, up to 4 on tablets.
class KpiGrid extends StatelessWidget {
  const KpiGrid({super.key, required this.children, this.minTile = 170});
  final List<Widget> children;
  final double minTile;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final cols = ((box.maxWidth + PosSpacing.sm) / (minTile + PosSpacing.sm)).floor().clamp(2, 4);
      return Column(
        children: [
          for (var start = 0; start < children.length; start += cols) ...[
            if (start > 0) const SizedBox(height: PosSpacing.sm),
            EqualHeightRow(
              spacing: PosSpacing.sm,
              children: [
                for (var i = start; i < start + cols; i++) i < children.length ? children[i] : const SizedBox(),
              ],
            ),
          ],
        ],
      );
    },
  );
}

/// Titled card for a chart or list (web BrandCompactSection / `.card` with header).
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.trailing,
    this.padding = const EdgeInsets.all(PosSpacing.lg),
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return PosCard(
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: PosType.section.copyWith(color: c.text)),
                    if (subtitle != null)
                      Text(subtitle!, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
          const SizedBox(height: PosSpacing.md),
          child,
        ],
      ),
    );
  }
}

/// Lays sections out in rows of [columns] on wide screens, stacked on phones.
class AdaptiveRows extends StatelessWidget {
  const AdaptiveRows({super.key, required this.children, this.minItemWidth = 360});
  final List<Widget> children;
  final double minItemWidth;

  @override
  Widget build(BuildContext context) => ResponsiveGrid(minItemWidth: minItemWidth, spacing: PosSpacing.md, children: children);
}

/// Ranked list with proportional bars (web SuperAdminRankingCard / top branches).
class RankBars extends StatelessWidget {
  const RankBars({super.key, required this.rows, this.empty, this.color, this.showRank = true});

  /// (label, value, formatted value, caption).
  final List<(String, double, String, String?)> rows;
  final String? empty;
  final Color? color;
  final bool showRank;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    if (rows.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: PosSpacing.lg),
        child: Center(child: Text(empty ?? tr('No data for this period'), style: PosType.caption.copyWith(color: c.textMuted))),
      );
    }
    final top = rows.map((r) => r.$2).fold<double>(0, math.max);
    return Column(
      children: [
        for (final (i, (label, value, formatted, caption)) in rows.indexed) ...[
          if (i > 0) const SizedBox(height: 10),
          Row(
            children: [
              if (showRank) ...[
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: i < 3 ? (color ?? c.brand) : c.surface,
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Text(
                    '${i + 1}',
                    style: PosType.label.copyWith(color: i < 3 ? Colors.white : c.textMuted, letterSpacing: 0),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          formatted,
                          style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5, fontFeatures: PosType.tabular),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(PosRadius.pill),
                      child: LinearProgressIndicator(
                        value: top <= 0 ? 0 : value / top,
                        minHeight: 6,
                        backgroundColor: c.surface,
                        color: color ?? c.brand,
                      ),
                    ),
                    if (caption != null) ...[
                      const SizedBox(height: 2),
                      Text(caption, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 10.5)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Coloured dot + label + value line for chart legends.
class LegendLine extends StatelessWidget {
  const LegendLine({super.key, required this.color, required this.label, required this.value, this.share});
  final Color color;
  final String label;
  final String value;
  final double? share;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 12))),
          if (share != null) ...[
            Text('${share!.toStringAsFixed(1)}%', style: PosType.caption.copyWith(color: c.textSoft, fontSize: 11)),
            const SizedBox(width: 8),
          ],
          Text(value, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5, fontFeatures: PosType.tabular)),
        ],
      ),
    );
  }
}

/// Horizontal pill tabs (web tab buttons: brand fill when active).
class PillTabs<T> extends StatelessWidget {
  const PillTabs({super.key, required this.items, required this.selected, required this.onSelect});

  /// (value, label, icon, count).
  final List<(T, String, IconData?, int?)> items;
  final T selected;
  final ValueChanged<T> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Row(
        children: [
          for (final (value, label, icon, count) in items) ...[
            Material(
              color: value == selected ? c.brand : c.card,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(PosRadius.pill),
                side: BorderSide(color: value == selected ? c.brand : c.border),
              ),
              child: InkWell(
                customBorder: const StadiumBorder(),
                onTap: () {
                  PosFeedback.tap();
                  onSelect(value);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: 16, color: value == selected ? Colors.white : c.textMuted),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        label,
                        style: PosType.bodyStrong.copyWith(
                          fontSize: 12.5,
                          color: value == selected ? Colors.white : c.text,
                        ),
                      ),
                      if (count != null) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: value == selected ? Colors.white.withValues(alpha: 0.25) : c.brandSubtle,
                            borderRadius: BorderRadius.circular(PosRadius.pill),
                          ),
                          child: Text(
                            formatCount(count),
                            style: PosType.label.copyWith(
                              letterSpacing: 0,
                              color: value == selected ? Colors.white : c.brand,
                            ),
                          ),
                        ),
                      ],
                    ],
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

/// Column of a [SimpleTable].
class TableCol {
  const TableCol(this.label, {this.flex = 1, this.numeric = false});
  final String label;
  final int flex;
  final bool numeric;
}

/// Scrollable admin table (web `.admin-table`): header row, zebra-free hairline rows.
/// Wide tables scroll sideways on phones.
class SimpleTable extends StatelessWidget {
  const SimpleTable({super.key, required this.columns, required this.rows, this.minWidth, this.onRowTap, this.empty});

  final List<TableCol> columns;
  final List<List<String>> rows;
  final double? minWidth;
  final ValueChanged<int>? onRowTap;
  final String? empty;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    if (rows.isEmpty) {
      return EmptyView(message: empty ?? tr('No rows match these filters'), icon: Icons.table_rows_outlined);
    }
    final width = minWidth ?? columns.fold<double>(0, (s, col) => s + col.flex * 110);
    Widget cell(String text, TableCol col, {bool header = false}) => Expanded(
      flex: col.flex,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Text(
          header ? text.toUpperCase() : text,
          textAlign: col.numeric ? TextAlign.right : TextAlign.left,
          maxLines: header ? 2 : 3,
          overflow: TextOverflow.ellipsis,
          style: header
              ? PosType.label.copyWith(color: c.textMuted, fontSize: 10, letterSpacing: 0.4)
              : PosType.caption.copyWith(
                  color: c.text,
                  fontSize: 12.5,
                  fontFeatures: col.numeric ? PosType.tabular : null,
                ),
        ),
      ),
    );
    return LayoutBuilder(
      builder: (context, box) {
        final w = math.max(box.maxWidth, width);
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SizedBox(
            width: w,
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(PosRadius.sm)),
                  child: Row(children: [for (final col in columns) cell(col.label, col, header: true)]),
                ),
                for (final (i, r) in rows.indexed)
                  InkWell(
                    onTap: onRowTap == null ? null : () => onRowTap!(i),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                      decoration: BoxDecoration(
                        border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.5))),
                      ),
                      child: Row(
                        children: [
                          for (var j = 0; j < columns.length; j++) cell(j < r.length ? r[j] : '', columns[j]),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Previous / "Page x of y" / next (web AdminTablePagination).
class Pager extends StatelessWidget {
  const Pager({super.key, required this.page, required this.pages, required this.onPage, this.total});
  final int page;
  final int pages;
  final int? total;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    if (pages <= 1) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: PosSpacing.md),
      child: Row(
        children: [
          PosIconButton(icon: Icons.chevron_left_rounded, onPressed: page > 1 ? () => onPage(page - 1) : null),
          Expanded(
            child: Text(
              total == null
                  ? tr('Page {p} of {n}', {'p': page, 'n': pages})
                  : tr('Page {p} of {n} · {t} total', {'p': page, 'n': pages, 't': formatCount(total!)}),
              textAlign: TextAlign.center,
              style: PosType.caption.copyWith(color: c.textMuted),
            ),
          ),
          PosIconButton(icon: Icons.chevron_right_rounded, onPressed: page < pages ? () => onPage(page + 1) : null),
        ],
      ),
    );
  }
}

/// Search box with a clear button (web admin search inputs).
class SearchBox extends StatefulWidget {
  const SearchBox({super.key, required this.hint, required this.onChanged, this.initial = ''});
  final String hint;
  final String initial;

  /// Debounced by 300 ms like the web.
  final ValueChanged<String> onChanged;

  @override
  State<SearchBox> createState() => _SearchBoxState();
}

class _SearchBoxState extends State<SearchBox> {
  late final _ctrl = TextEditingController(text: widget.initial);
  int _tick = 0;

  void _changed(String v) {
    final t = ++_tick;
    setState(() {});
    Future<void>.delayed(const Duration(milliseconds: 300), () {
      if (t == _tick && mounted) widget.onChanged(v.trim());
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return TextField(
      controller: _ctrl,
      onChanged: _changed,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: widget.hint,
        prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
        suffixIcon: _ctrl.text.isEmpty
            ? null
            : IconButton(
                icon: Icon(Icons.close_rounded, color: c.textMuted, size: 18),
                onPressed: () {
                  _ctrl.clear();
                  _changed('');
                },
              ),
      ),
    );
  }
}

/// Renders a [Loadable]: skeleton on first load, error with retry, else [builder].
class LoadableBuilder<T> extends StatelessWidget {
  const LoadableBuilder({super.key, required this.value, required this.builder, this.loading});
  final Loadable<T> value;
  final Widget Function(BuildContext context, T data) builder;
  final Widget? loading;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: value,
    builder: (context, _) {
      final data = value.data;
      if (data != null) return builder(context, data);
      if (value.error != null) return ErrorView(message: value.error!, onRetry: value.load);
      return loading ?? const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView());
    },
  );
}

/// Small "View only" tag shown on super admin read-only pages.
class ViewOnlyTag extends StatelessWidget {
  const ViewOnlyTag({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(PosRadius.pill),
        border: Border.all(color: c.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.visibility_outlined, size: 14, color: c.textMuted),
          const SizedBox(width: 5),
          Text(tr('View only'), style: PosType.caption.copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// Standard admin page scaffold body: pull to refresh + centred padded list.
class AdminPageList extends StatelessWidget {
  const AdminPageList({super.key, required this.children, required this.onRefresh, this.maxWidth = 1400});
  final List<Widget> children;
  final Future<void> Function() onRefresh;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: onRefresh,
    child: ListView(
      padding: centeredPadding(context, maxWidth: maxWidth),
      physics: const AlwaysScrollableScrollPhysics(),
      children: children,
    ),
  );
}

/// LKR amount from cents.
String moneyFromCents(num cents) => formatMoney(cents / 100);

/// "Bing Chun - Nugegoda" → "Nugegoda".
String shortBranch(String? name) => (name ?? '—').replaceFirst(RegExp(r'^Bing Chun\s*[-–]\s*', caseSensitive: false), '');
