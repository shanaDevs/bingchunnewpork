import 'package:flutter/material.dart';

/// Line-art delivery scooter with rear carrier box — port of ScooterIllustration.kt.
class ScooterIllustration extends StatelessWidget {
  const ScooterIllustration({
    super.key,
    this.width = 96,
    this.height = 56,
    this.primary = const Color(0xFF34D399),
    this.accent = const Color(0xFFA7F3D0),
    this.stroke = const Color(0xFF10B981),
  });

  final double width;
  final double height;
  final Color primary;
  final Color accent;
  final Color stroke;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size(width, height), painter: _ScooterPainter(primary, accent, stroke));
}

class _ScooterPainter extends CustomPainter {
  _ScooterPainter(this.primary, this.accent, this.stroke);
  final Color primary;
  final Color accent;
  final Color stroke;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final strokePaint = Paint()
      ..color = stroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()..style = PaintingStyle.fill;

    // Soft motion wave behind the scooter
    canvas.drawPath(
      Path()
        ..moveTo(w * 0.15, h * 0.72)
        ..quadraticBezierTo(w * 0.45, h * 0.52, w * 0.75, h * 0.65)
        ..quadraticBezierTo(w * 0.95, h * 0.70, w, h * 0.78),
      Paint()
        ..color = accent.withValues(alpha: 0.5)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );

    final r = h * 0.18;
    for (final center in [Offset(w * 0.28, h * 0.78), Offset(w * 0.78, h * 0.78)]) {
      canvas.drawCircle(center, r, fill..color = accent.withValues(alpha: 0.6));
      canvas.drawCircle(center, r, strokePaint);
      canvas.drawCircle(center, r * 0.35, fill..color = stroke);
    }

    // Body frame / footboard
    canvas.drawPath(
      Path()
        ..moveTo(w * 0.28, h * 0.78)
        ..lineTo(w * 0.32, h * 0.58)
        ..lineTo(w * 0.46, h * 0.58)
        ..lineTo(w * 0.50, h * 0.72)
        ..lineTo(w * 0.64, h * 0.72)
        ..lineTo(w * 0.70, h * 0.36)
        ..lineTo(w * 0.66, h * 0.30),
      strokePaint,
    );
    // Front fork
    canvas.drawLine(Offset(w * 0.70, h * 0.44), Offset(w * 0.78, h * 0.78), strokePaint);

    // Front apron / shield
    final shield = Path()
      ..moveTo(w * 0.66, h * 0.34)
      ..quadraticBezierTo(w * 0.77, h * 0.48, w * 0.73, h * 0.68)
      ..lineTo(w * 0.64, h * 0.70);
    canvas.drawPath(shield, fill..color = primary.withValues(alpha: 0.75));
    canvas.drawPath(shield, strokePaint);

    // Seat
    canvas.drawPath(
      Path()
        ..moveTo(w * 0.34, h * 0.54)
        ..quadraticBezierTo(w * 0.44, h * 0.50, w * 0.50, h * 0.54)
        ..lineTo(w * 0.48, h * 0.58)
        ..lineTo(w * 0.35, h * 0.58)
        ..close(),
      fill..color = stroke,
    );

    // Rear delivery carrier box
    final box = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.16, h * 0.28, w * 0.26, h * 0.30),
      const Radius.circular(4),
    );
    canvas.drawRRect(box, fill..color = accent.withValues(alpha: 0.9));
    canvas.drawRRect(box, strokePaint);
    final lidY = h * 0.28 + h * 0.30 * 0.28;
    canvas.drawLine(
      Offset(w * 0.16, lidY),
      Offset(w * 0.42, lidY),
      Paint()
        ..color = stroke
        ..strokeWidth = 1.2,
    );

    // Headlight
    canvas.drawCircle(Offset(w * 0.75, h * 0.38), 2.5, fill..color = const Color(0xFFFDE047));
  }

  @override
  bool shouldRepaint(covariant _ScooterPainter old) =>
      old.primary != primary || old.accent != accent || old.stroke != stroke;
}
