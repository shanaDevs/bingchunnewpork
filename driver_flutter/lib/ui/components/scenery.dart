import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Decorative hero artwork shared by Login and Stats: a faint city skyline, soft
/// clouds, a dashed delivery route between two map pins, and the rider mascot.
/// Pure decoration — wrapped in [IgnorePointer] and excluded from semantics.
class HeroScenery extends StatelessWidget {
  const HeroScenery({
    super.key,
    this.riderHeight = 150,
    this.riderRight = 4,
    this.riderBottom = 24,
    this.showRider = true,
  });

  final double riderHeight;
  final double riderRight;
  final double riderBottom;
  final bool showRider;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: ExcludeSemantics(
        child: Stack(
          children: [
            Positioned.fill(child: CustomPaint(painter: _SkylinePainter())),
            if (showRider)
              Positioned(
                right: riderRight,
                bottom: riderBottom,
                child: Image.asset('assets/images/rider_mascot.png', height: riderHeight, fit: BoxFit.contain),
              ),
          ],
        ),
      ),
    );
  }
}

class _SkylinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // City skyline on the right half, very faint.
    final city = Paint()..color = Colors.white.withValues(alpha: 0.07);
    final rnd = math.Random(7);
    var x = w * 0.48;
    while (x < w) {
      final bw = 14.0 + rnd.nextInt(18);
      final bh = h * (0.18 + rnd.nextDouble() * 0.42);
      canvas.drawRect(Rect.fromLTWH(x, h - bh - h * 0.12, bw, bh + h * 0.12), city);
      if (rnd.nextBool()) {
        canvas.drawRect(Rect.fromLTWH(x + bw * 0.4, h - bh - h * 0.12 - 10, 3, 10), city);
      }
      x += bw + 3;
    }

    // Clouds.
    final cloud = Paint()..color = Colors.white.withValues(alpha: 0.12);
    void puff(double cx, double cy, double s) {
      canvas.drawCircle(Offset(cx, cy), 10 * s, cloud);
      canvas.drawCircle(Offset(cx + 12 * s, cy - 6 * s), 13 * s, cloud);
      canvas.drawCircle(Offset(cx + 26 * s, cy), 10 * s, cloud);
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(cx - 8 * s, cy - 2 * s, 42 * s, 12 * s), Radius.circular(6 * s)),
        cloud,
      );
    }

    puff(w * 0.50, h * 0.22, 1.0);
    puff(w * 0.80, h * 0.14, 0.9);
    puff(w * 0.92, h * 0.48, 0.7);

    // Dashed route from a top pin down past the rider to a second pin.
    final route = Path()
      ..moveTo(w * 0.62, h * 0.16)
      ..cubicTo(w * 0.60, h * 0.42, w * 0.86, h * 0.40, w * 0.90, h * 0.62);
    final dash = Paint()
      ..color = Colors.white.withValues(alpha: 0.55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round;
    for (final m in route.computeMetrics()) {
      var d = 0.0;
      while (d < m.length) {
        canvas.drawPath(m.extractPath(d, math.min(d + 5, m.length)), dash);
        d += 10;
      }
    }
    _pin(canvas, Offset(w * 0.62, h * 0.16), Colors.white, 11);
    _pin(canvas, Offset(w * 0.90, h * 0.62), const Color(0xFFFF6B6B), 9);
  }

  void _pin(Canvas canvas, Offset tip, Color color, double r) {
    final cy = tip.dy - r * 1.9;
    final head = Path()..addOval(Rect.fromCircle(center: Offset(tip.dx, cy), radius: r));
    final tail = Path()
      ..moveTo(tip.dx - r * 0.7, cy + r * 0.55)
      ..lineTo(tip.dx + r * 0.7, cy + r * 0.55)
      ..lineTo(tip.dx, tip.dy)
      ..close();
    canvas.drawPath(Path.combine(PathOperation.union, head, tail), Paint()..color = color);
    canvas.drawCircle(Offset(tip.dx, cy), r * 0.42, Paint()..color = const Color(0xFF1A5CD4));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Layered wavy bottom edge for hero panels (two lighter swooshes over the page colour).
class HeroWaveClipper extends CustomClipper<Path> {
  const HeroWaveClipper({this.depth = 34});
  final double depth;

  @override
  Path getClip(Size size) {
    final w = size.width;
    final h = size.height;
    return Path()
      ..lineTo(0, h - depth * 0.55)
      ..cubicTo(w * 0.25, h - depth * 1.25, w * 0.55, h + depth * 0.15, w, h - depth)
      ..lineTo(w, 0)
      ..close();
  }

  @override
  bool shouldReclip(covariant HeroWaveClipper oldClipper) => oldClipper.depth != depth;
}

/// Soft lighter swoosh painted just above the wave edge (gives the layered look).
class HeroSwooshPainter extends CustomPainter {
  HeroSwooshPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    canvas.drawPath(
      Path()
        ..moveTo(0, h - 30)
        ..cubicTo(w * 0.22, h - 64, w * 0.52, h - 10, w, h - 56)
        ..lineTo(w, h)
        ..lineTo(0, h)
        ..close(),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(covariant HeroSwooshPainter old) => old.color != color;
}
