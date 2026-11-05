import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../../core/format.dart';
import '../theme/pos_theme.dart';

/// Screen title row (web page header: bold title, muted subtitle, actions right).
class PageHeader extends StatelessWidget {
  const PageHeader({super.key, required this.title, this.subtitle, this.actions = const []});

  final String title;
  final String? subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: PosType.title.copyWith(color: c.text),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  style: PosType.caption.copyWith(color: c.textMuted, fontSize: 12.5),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
        for (final a in actions) ...[const SizedBox(width: PosSpacing.sm), a],
      ],
    );
  }
}

/// Uppercase muted section caption (web `text-xs font-bold uppercase tracking-wider text-muted`).
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Padding(
      padding: const EdgeInsets.only(bottom: PosSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(text.toUpperCase(), style: PosType.label.copyWith(color: c.textMuted)),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Icon + caption + value cell (web order drawer InfoCell).
class InfoCell extends StatelessWidget {
  const InfoCell({super.key, required this.icon, required this.label, required this.child});

  final IconData icon;
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(icon, size: 15, color: c.textMuted),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5)),
              DefaultTextStyle.merge(
                style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13),
                child: child,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Label ··· amount row for totals.
class MoneyRow extends StatelessWidget {
  const MoneyRow({
    super.key,
    required this.label,
    required this.amount,
    this.negative = false,
    this.emphasis = false,
    this.color,
    this.hint,
  });

  final String label;
  final double amount;
  final bool negative;
  final bool emphasis;
  final Color? color;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final tone = color ?? (emphasis ? c.text : c.textMuted);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text.rich(
              TextSpan(
                text: label,
                children: [
                  if (hint != null)
                    TextSpan(
                      text: '  $hint',
                      style: PosType.caption.copyWith(fontSize: 10, color: c.textSoft),
                    ),
                ],
              ),
              style: (emphasis ? PosType.bodyStrong : PosType.body).copyWith(color: tone, fontSize: 13),
            ),
          ),
          Text(
            '${negative ? '-' : ''}${formatMoney(amount)}',
            style: (emphasis ? PosType.amount : PosType.body).copyWith(
              color: emphasis ? (color ?? c.brand) : tone,
              fontSize: emphasis ? 18 : 13,
              fontFeatures: PosType.tabular,
            ),
          ),
        ],
      ),
    );
  }
}

/// Bing Chun brand mark on the indigo sidebar gradient.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 56});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(size * 0.3),
        boxShadow: [
          BoxShadow(color: const Color(0xFF1A1953).withValues(alpha: 0.25), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
    );
  }
}

/// Grid column count for a card grid at this width (web `grid-cols-2 sm:3 xl:4`).
int gridColumns(double width, {double minTile = 160}) => (width / minTile).floor().clamp(2, 6);

/// Tablet breakpoints (logical px). Portrait tablets are ~800 wide, landscape ~1280.
abstract final class Breakpoints {
  static const tablet = 720.0;
  static const wide = 1100.0;
}

bool isTablet(BuildContext context) => MediaQuery.sizeOf(context).width >= Breakpoints.tablet;

/// Side padding that keeps reading-width content centred on tablets.
EdgeInsets centeredPadding(
  BuildContext context, {
  double maxWidth = 820,
  double top = PosSpacing.md,
  double bottom = PosSpacing.xxl,
}) {
  final w = MediaQuery.sizeOf(context).width;
  final side = w > maxWidth + 2 * PosSpacing.lg ? (w - maxWidth) / 2 : PosSpacing.lg;
  return EdgeInsets.fromLTRB(side, top, side, bottom);
}

/// Cards in as many columns as fit [minItemWidth] — one column on phones,
/// two or three on tablets. Rows align to the top like the web card grids.
class ResponsiveGrid extends StatelessWidget {
  const ResponsiveGrid({super.key, required this.children, this.minItemWidth = 380, this.spacing = PosSpacing.sm});

  final List<Widget> children;
  final double minItemWidth;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final cols = ((box.maxWidth + spacing) / (minItemWidth + spacing)).floor().clamp(1, 4);
        if (cols == 1) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (i, child) in children.indexed) ...[if (i > 0) SizedBox(height: spacing), child],
            ],
          );
        }
        // Cards in one row share the tallest card's height; a short last row keeps the column width.
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var start = 0; start < children.length; start += cols) ...[
              if (start > 0) SizedBox(height: spacing),
              EqualHeightRow(
                spacing: spacing,
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
}

/// A row whose children all take the height of the tallest one, like a CSS
/// grid row. Unlike `IntrinsicHeight`, children may use `LayoutBuilder`.
class EqualHeightRow extends MultiChildRenderObjectWidget {
  const EqualHeightRow({super.key, required super.children, this.spacing = 0, this.flex});

  final double spacing;

  /// Width share per child (defaults to 1 each).
  final List<int>? flex;

  @override
  RenderObject createRenderObject(BuildContext context) => _RenderEqualHeightRow(spacing, flex);

  @override
  void updateRenderObject(BuildContext context, RenderObject renderObject) {
    (renderObject as _RenderEqualHeightRow)
      ..spacing = spacing
      ..flex = flex;
  }
}

class _EqualHeightParentData extends ContainerBoxParentData<RenderBox> {}

class _RenderEqualHeightRow extends RenderBox
    with
        ContainerRenderObjectMixin<RenderBox, _EqualHeightParentData>,
        RenderBoxContainerDefaultsMixin<RenderBox, _EqualHeightParentData> {
  _RenderEqualHeightRow(this._spacing, this._flex);

  double _spacing;
  set spacing(double v) {
    if (v == _spacing) return;
    _spacing = v;
    markNeedsLayout();
  }

  List<int>? _flex;
  set flex(List<int>? v) {
    if (listEquals(v, _flex)) return;
    _flex = v;
    markNeedsLayout();
  }

  @override
  void setupParentData(RenderBox child) {
    if (child.parentData is! _EqualHeightParentData) child.parentData = _EqualHeightParentData();
  }

  List<double> _widths(double maxWidth) {
    final n = childCount;
    final shares = [for (var i = 0; i < n; i++) (_flex != null && i < _flex!.length) ? _flex![i] : 1];
    final total = shares.fold<int>(0, (a, b) => a + b);
    final free = (maxWidth - _spacing * (n - 1)).clamp(0.0, double.infinity);
    return [for (final s in shares) free * s / total];
  }

  @override
  void performLayout() {
    if (childCount == 0) {
      size = constraints.smallest;
      return;
    }
    final widths = _widths(constraints.maxWidth);
    var height = 0.0;
    var child = firstChild;
    var i = 0;
    while (child != null) {
      child.layout(BoxConstraints.tightFor(width: widths[i]), parentUsesSize: true);
      height = math.max(height, child.size.height);
      child = childAfter(child);
      i++;
    }
    child = firstChild;
    i = 0;
    var x = 0.0;
    var rowHeight = height;
    while (child != null) {
      // A minimum (not tight) height: a tightly sized child becomes a relayout
      // boundary and would stop telling the row when its content grows.
      child.layout(BoxConstraints(minWidth: widths[i], maxWidth: widths[i], minHeight: height), parentUsesSize: true);
      rowHeight = math.max(rowHeight, child.size.height);
      (child.parentData! as _EqualHeightParentData).offset = Offset(x, 0);
      x += widths[i] + _spacing;
      child = childAfter(child);
      i++;
    }
    size = constraints.constrain(Size(constraints.maxWidth, rowHeight));
  }

  @override
  void paint(PaintingContext context, Offset offset) => defaultPaint(context, offset);

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      defaultHitTestChildren(result, position: position);
}
