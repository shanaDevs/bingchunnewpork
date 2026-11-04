import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/pos_theme.dart';

/// Lightweight painters for the dashboard charts (the web uses recharts):
/// a bar chart, a two-series area chart, a sparkline and a donut.

/// Rounds an axis maximum up to a friendly step (12 → 12, 61k → 80k).
/// Small ranges round up to a multiple of 4 so the 4 grid steps stay whole numbers.
double niceMax(double v) {
  if (v <= 0) return 4;
  if (v <= 40) return (v / 4).ceil() * 4.0;
  final mag = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
  for (final step in [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (v <= step * mag) return step * mag;
  }
  return 10 * mag;
}

String compactNumber(double v) {
  if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(v % 1000000 == 0 ? 0 : 1)}M';
  if (v >= 1000) return '${(v / 1000).toStringAsFixed(v % 1000 == 0 ? 0 : 1)}k';
  return v.toStringAsFixed(v == v.roundToDouble() ? 0 : 1);
}

class _Axis {
  _Axis(this.color, this.textStyle);
  final Color color;
  final TextStyle textStyle;

  TextPainter text(String s) => TextPainter(
    text: TextSpan(text: s, style: textStyle),
    textDirection: TextDirection.ltr,
  )..layout();

  /// Dashed horizontal grid + left labels; returns the plot rect.
  Rect grid(Canvas canvas, Size size, double max, {int ticks = 4, double bottom = 22}) {
    final labels = [for (var i = 0; i <= ticks; i++) compactNumber(max * i / ticks)];
    final left = labels.map((l) => text(l).width).reduce(math.max) + 8;
    final plot = Rect.fromLTRB(left, 8, size.width - 4, size.height - bottom);
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    for (var i = 0; i <= ticks; i++) {
      final y = plot.bottom - plot.height * i / ticks;
      for (var x = plot.left; x < plot.right; x += 6) {
        canvas.drawLine(Offset(x, y), Offset(math.min(x + 3, plot.right), y), paint);
      }
      final tp = text(labels[i]);
      tp.paint(canvas, Offset(left - 6 - tp.width, y - tp.height / 2));
    }
    return plot;
  }
}

/// Vertical bars, one per category; the tallest bar uses [color], others a lighter tint.
class BarChart extends StatelessWidget {
  const BarChart({super.key, required this.values, required this.labels, required this.color, this.labelEvery = 2});

  final List<double> values;
  final List<String> labels;
  final Color color;

  /// Show every Nth x label so they don't collide on phones.
  final int labelEvery;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return CustomPaint(
      size: Size.infinite,
      painter: _BarPainter(
        values,
        labels,
        color,
        labelEvery,
        _Axis(c.border.withValues(alpha: 0.5), PosType.caption.copyWith(color: c.textMuted, fontSize: 10.5)),
      ),
    );
  }
}

class _BarPainter extends CustomPainter {
  _BarPainter(this.values, this.labels, this.color, this.labelEvery, this.axis);
  final List<double> values;
  final List<String> labels;
  final Color color;
  final int labelEvery;
  final _Axis axis;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final top = values.reduce(math.max);
    final max = niceMax(top);
    final plot = axis.grid(canvas, size, max);
    final slot = plot.width / values.length;
    final barW = math.min(slot * 0.55, 18.0);
    for (var i = 0; i < values.length; i++) {
      final h = plot.height * values[i] / max;
      final x = plot.left + slot * i + (slot - barW) / 2;
      if (h > 0) {
        final paint = Paint()..color = values[i] == top ? color : color.withValues(alpha: 0.4);
        canvas.drawRRect(
          RRect.fromRectAndCorners(
            Rect.fromLTWH(x, plot.bottom - h, barW, h),
            topLeft: const Radius.circular(4),
            topRight: const Radius.circular(4),
          ),
          paint,
        );
      }
      if (i % labelEvery == 0 && i < labels.length) {
        final tp = axis.text(labels[i]);
        tp.paint(canvas, Offset(plot.left + slot * i + slot / 2 - tp.width / 2, plot.bottom + 6));
      }
    }
  }

  @override
  bool shouldRepaint(covariant _BarPainter old) => old.values != values || old.color != color;
}

class ChartSeries {
  const ChartSeries({required this.values, required this.color, required this.label});
  final List<double> values;
  final Color color;
  final String label;
}

/// Smooth area lines sharing one axis (web Revenue Overview: revenue vs outflow).
class AreaChart extends StatelessWidget {
  const AreaChart({super.key, required this.series, required this.labels});
  final List<ChartSeries> series;
  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return CustomPaint(
      size: Size.infinite,
      painter: _AreaPainter(
        series,
        labels,
        _Axis(c.border.withValues(alpha: 0.5), PosType.caption.copyWith(color: c.textMuted, fontSize: 10.5)),
        c.card,
      ),
    );
  }
}

/// Monotone-ish smoothing: cubic segments with horizontal control points.
Path _smooth(List<Offset> pts) {
  final path = Path()..moveTo(pts.first.dx, pts.first.dy);
  for (var i = 1; i < pts.length; i++) {
    final p0 = pts[i - 1];
    final p1 = pts[i];
    final mx = (p0.dx + p1.dx) / 2;
    path.cubicTo(mx, p0.dy, mx, p1.dy, p1.dx, p1.dy);
  }
  return path;
}

class _AreaPainter extends CustomPainter {
  _AreaPainter(this.series, this.labels, this.axis, this.dotStroke);
  final List<ChartSeries> series;
  final List<String> labels;
  final _Axis axis;
  final Color dotStroke;

  @override
  void paint(Canvas canvas, Size size) {
    final n = labels.length;
    if (n == 0) return;
    final top = series.expand((s) => s.values).fold<double>(0, math.max);
    final max = niceMax(top);
    final plot = axis.grid(canvas, size, max);
    double xAt(int i) => n == 1 ? plot.center.dx : plot.left + 8 + (plot.width - 16) * i / (n - 1);
    for (var i = 0; i < n; i++) {
      final tp = axis.text(labels[i]);
      tp.paint(canvas, Offset(xAt(i) - tp.width / 2, plot.bottom + 6));
    }
    for (final s in series) {
      if (s.values.length != n) continue;
      final pts = [for (var i = 0; i < n; i++) Offset(xAt(i), plot.bottom - plot.height * s.values[i] / max)];
      final line = n == 1 ? (Path()..addOval(Rect.fromCircle(center: pts.first, radius: 1))) : _smooth(pts);
      final area = Path.from(line)
        ..lineTo(pts.last.dx, plot.bottom)
        ..lineTo(pts.first.dx, plot.bottom)
        ..close();
      canvas.drawPath(
        area,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [s.color.withValues(alpha: 0.24), s.color.withValues(alpha: 0.02)],
          ).createShader(plot),
      );
      canvas.drawPath(
        line,
        Paint()
          ..color = s.color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round,
      );
      for (final p in pts) {
        canvas.drawCircle(p, 2.6, Paint()..color = s.color);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _AreaPainter old) => old.series != series || old.labels != labels;
}

/// Axis-free filled trend line (web revenue card spark).
class Sparkline extends StatelessWidget {
  const Sparkline({super.key, required this.values, required this.color});
  final List<double> values;
  final Color color;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.infinite, painter: _SparkPainter(values, color, context.pos.card));
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.values, this.color, this.dotFill);
  final List<double> values;
  final Color color;
  final Color dotFill;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final max = values.reduce(math.max);
    if (max <= 0) return;
    final rect = Rect.fromLTRB(6, 8, size.width - 6, size.height - 4);
    final pts = [
      for (var i = 0; i < values.length; i++)
        Offset(rect.left + rect.width * i / (values.length - 1), rect.bottom - rect.height * values[i] / max),
    ];
    final line = _smooth(pts);
    canvas.drawPath(
      Path.from(line)
        ..lineTo(rect.right, rect.bottom)
        ..lineTo(rect.left, rect.bottom)
        ..close(),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color.withValues(alpha: 0.28), color.withValues(alpha: 0.02)],
        ).createShader(rect),
    );
    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4,
    );
    for (final p in pts) {
      canvas
        ..drawCircle(p, 3.6, Paint()..color = dotFill)
        ..drawCircle(p, 2.6, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) => old.values != values;
}

class DonutSlice {
  const DonutSlice({required this.value, required this.color});
  final double value;
  final Color color;
}

/// Ring chart with a centre label (web Order Breakdown).
class DonutChart extends StatelessWidget {
  const DonutChart({super.key, required this.slices, required this.center, required this.caption, this.size = 140});
  final List<DonutSlice> slices;
  final String center;
  final String caption;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _DonutPainter(slices, c.surface),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(center, style: PosType.amount.copyWith(color: c.text)),
              Text(caption, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
            ],
          ),
        ),
      ),
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.slices, this.track);
  final List<DonutSlice> slices;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 18.0;
    final rect = Rect.fromCircle(center: size.center(Offset.zero), radius: size.shortestSide / 2 - stroke / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    final total = slices.fold<double>(0, (s, x) => s + x.value);
    if (total <= 0) {
      canvas.drawArc(rect, 0, math.pi * 2, false, paint..color = track);
      return;
    }
    final gap = slices.where((s) => s.value > 0).length > 1 ? 0.05 : 0.0;
    var start = -math.pi / 2;
    for (final s in slices) {
      if (s.value <= 0) continue;
      final sweep = math.pi * 2 * s.value / total;
      canvas.drawArc(rect, start + gap / 2, sweep - gap, false, paint..color = s.color);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) => old.slices != slices;
}
