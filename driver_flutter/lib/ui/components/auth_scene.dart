import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';

/// Sign-in scene (port of rider-city-scene.tsx): faint skyline with a TV tower, clouds and
/// trees in translucent blues, a hill melting into the page colour, and the rider on top.
class BcRiderCityScene extends StatelessWidget {
  const BcRiderCityScene({super.key, this.height = 290});

  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    // The rider artwork is 423 x 450.
    final riderH = height * 0.92;
    final riderW = riderH * 423 / 450;
    return ExcludeSemantics(
      child: SizedBox(
        height: height,
        child: LayoutBuilder(
          builder: (context, box) {
            final left = box.maxWidth / 2 - riderW * 0.46 - 14;
            return Stack(
              children: [
                Positioned.fill(
                  child: CustomPaint(painter: _ScenePainter(isDark: c.isDark, page: c.background)),
                ),
                Positioned(
                  left: left,
                  bottom: 6,
                  width: riderW,
                  height: riderH,
                  child: Stack(
                    children: [
                      Positioned.fill(child: CustomPaint(painter: _ShadowPainter())),
                      Image.asset('assets/images/rider_mascot.png', width: riderW, height: riderH, fit: BoxFit.contain),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ScenePainter extends CustomPainter {
  _ScenePainter({required this.isDark, required this.page});

  final bool isDark;
  final Color page;

  // [x share of width, width, height] left to right.
  static const _buildings = [
    [0.0, 34.0, 70.0],
    [0.07, 26.0, 104.0],
    [0.13, 38.0, 82.0],
    [0.22, 24.0, 120.0],
    [0.3, 32.0, 66.0],
    [0.62, 30.0, 92.0],
    [0.69, 22.0, 70.0],
    [0.75, 34.0, 108.0],
    [0.92, 30.0, 80.0],
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final ground = h - 46;
    final cloud = isDark ? const Color(0xFFA9BFDE).withValues(alpha: 0.22) : Colors.white.withValues(alpha: 0.75);
    final building = (isDark ? const Color(0xFF2F6FD0) : const Color(0xFF8EC2FF)).withValues(alpha: 0.6);
    final tower = (isDark ? const Color(0xFF2B63BB) : const Color(0xFF6FAEF5)).withValues(alpha: 0.65);
    final tree = (isDark ? const Color(0xFF1F4F9A) : const Color(0xFF7DB7EE)).withValues(alpha: 0.7);

    final p = Paint()..isAntiAlias = true;

    // Clouds.
    p.color = cloud;
    for (final e in [
      Rect.fromCenter(center: Offset(w * 0.84, 26), width: 60, height: 24),
      Rect.fromCenter(center: Offset(w * 0.8, 20), width: 36, height: 28),
      Rect.fromCenter(center: Offset(w * 0.18, 62), width: 48, height: 18),
      Rect.fromCenter(center: Offset(w * 0.22, 56), width: 28, height: 20),
    ]) {
      canvas.drawOval(e, p);
    }

    // Skyline.
    p.color = building;
    for (final b in _buildings) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(w * b[0], ground - b[2], b[1], b[2] + 20), const Radius.circular(3)),
        p,
      );
    }

    // TV tower: mast, sphere and spire.
    final tx = w * 0.86;
    p.color = tower;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(tx - 3.5, ground - 150, 7, 170), const Radius.circular(3)),
      p,
    );
    canvas.drawOval(Rect.fromCenter(center: Offset(tx, ground - 120), width: 24, height: 30), p);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(tx - 1.5, ground - 186, 3, 38), const Radius.circular(1.5)),
      p,
    );

    // Trees.
    p.color = tree;
    canvas.drawCircle(Offset(w * 0.06, ground - 6), 22, p);
    canvas.drawCircle(Offset(w * 0.15, ground), 18, p);
    canvas.drawCircle(Offset(w * 0.9, ground - 4), 24, p);
    canvas.drawCircle(Offset(w * 0.98, ground + 2), 18, p);

    // Hill blending into the page.
    p.color = page;
    final hill = Path()
      ..moveTo(0, ground + 4)
      ..cubicTo(w * 0.35, ground + 34, w * 0.65, ground - 6, w, ground - 40)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(hill, p);
  }

  @override
  bool shouldRepaint(_ScenePainter old) => old.isDark != isDark || old.page != page;
}

/// Soft ground shadow plus a contact patch under each wheel.
class _ShadowPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    void blob(double cx, double cy, double rx, double ry, Color color, double blur) {
      canvas.drawOval(
        Rect.fromCenter(center: Offset(cx, cy), width: rx * 2, height: ry * 2),
        Paint()
          ..color = color
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, blur),
      );
    }

    blob(w * 0.55, h * 0.965, w * 0.46, h * 0.05, const Color(0xFF0A1E50).withValues(alpha: 0.3), 10);
    blob(w * 0.32, h * 0.93, w * 0.11, h * 0.022, const Color(0xFF061433).withValues(alpha: 0.5), 4);
    blob(w * 0.83, h * 0.985, w * 0.11, h * 0.024, const Color(0xFF061433).withValues(alpha: 0.5), 4);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

/// Simplified Sri Lankan flag (fixed flag colours), drawn so it also shows on Windows.
class BcSriLankaFlag extends StatelessWidget {
  const BcSriLankaFlag({super.key, this.width = 26});

  final double width;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size(width, width * 0.62), painter: _FlagPainter());
}

class _FlagPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 40, size.height / 25);
    final p = Paint()..isAntiAlias = true;
    const gold = Color(0xFFFFBE29);
    p.color = gold;
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, 40, 25), const Radius.circular(3)), p);
    p.color = const Color(0xFF00534E);
    canvas.drawRect(const Rect.fromLTWH(2, 2, 6, 21), p);
    p.color = const Color(0xFFEB7400);
    canvas.drawRect(const Rect.fromLTWH(8, 2, 6, 21), p);
    p.color = const Color(0xFF8D153A);
    canvas.drawRect(const Rect.fromLTWH(15.5, 2, 22.5, 21), p);
    p.color = gold;
    final lion = Path()
      ..moveTo(21, 16.5)
      ..cubicTo(21, 12, 23.5, 9, 26.5, 9)
      ..cubicTo(29.5, 9, 32, 11.5, 32, 14)
      ..cubicTo(32, 16, 30.5, 17.5, 28.5, 17.5)
      ..lineTo(22, 17.5)
      ..close();
    canvas.drawPath(lion, p);
    for (final o in const [Offset(18, 5), Offset(35.5, 5), Offset(18, 20), Offset(35.5, 20)]) {
      canvas.drawCircle(o, 1.2, p);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
