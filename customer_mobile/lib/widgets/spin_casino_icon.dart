import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';

/// Mini casino wheel — mirrors web `SpinCasinoIcon`.
class SpinCasinoIcon extends StatefulWidget {
  const SpinCasinoIcon({super.key, this.size = 22});

  final double size;

  @override
  State<SpinCasinoIcon> createState() => _SpinCasinoIconState();
}

class _SpinCasinoIconState extends State<SpinCasinoIcon>
    with TickerProviderStateMixin {
  late final AnimationController _wheel;
  late final AnimationController _blink;
  late final AnimationController _glow;

  static const _segments = [
    Color(0xFF307EF2),
    Color(0xFFFFD700),
    Color(0xFFE63946),
    Color(0xFF307EF2),
    Color(0xFFFFD700),
    Color(0xFFE63946),
    Color(0xFF307EF2),
    Color(0xFFFFD700),
  ];

  @override
  void initState() {
    super.initState();
    _wheel = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
    _blink = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _glow = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _wheel.dispose();
    _blink.dispose();
    _glow.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.size;
    return SizedBox(
      width: size,
      height: size,
      child: AnimatedBuilder(
        animation: Listenable.merge([_wheel, _blink, _glow]),
        builder: (context, _) {
          final glowT = _glow.value;
          return Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              Container(
                width: size,
                height: size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: BcColors.accent.withValues(alpha: 0.2 + 0.25 * glowT),
                  boxShadow: [
                    BoxShadow(
                      color: BcColors.accent.withValues(alpha: 0.25 * glowT),
                      blurRadius: 4 + 2 * glowT,
                    ),
                  ],
                ),
              ),
              Transform.rotate(
                angle: _wheel.value * 2 * math.pi,
                child: CustomPaint(
                  size: Size.square(size - 2),
                  painter: _CasinoWheelPainter(colors: _segments),
                ),
              ),
              Container(
                width: size * 0.38,
                height: size * 0.38,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: BcColors.navyCard,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.5),
                  ),
                ),
              ),
              for (var i = 0; i < 8; i++)
                _rimLight(
                  size: size,
                  index: i,
                  count: 8,
                  radiusFactor: 0.46,
                  lightSize: size * 0.14,
                  opacity: 0.35 + 0.65 * _blink.value,
                  delayPhase: i / 8,
                ),
              Positioned(
                top: -size * 0.08,
                child: CustomPaint(
                  size: Size(size * 0.28, size * 0.22),
                  painter: _MiniPointerPainter(color: BcColors.accent),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _rimLight({
    required double size,
    required int index,
    required int count,
    required double radiusFactor,
    required double lightSize,
    required double opacity,
    required double delayPhase,
  }) {
    final deg = index * (360 / count);
    final rad = (deg - 90) * math.pi / 180;
    final r = size * radiusFactor;
    final blink = ((opacity + delayPhase) % 1.0).clamp(0.35, 1.0);
    return Positioned(
      left: size / 2 + r * math.cos(rad) - lightSize / 2,
      top: size / 2 + r * math.sin(rad) - lightSize / 2,
      child: Container(
        width: lightSize,
        height: lightSize,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color:
              (Color.lerp(const Color(0xFFFFD700), Colors.white, blink) ??
                      const Color(0xFFFFD700))
                  .withValues(alpha: blink),
          border: Border.all(color: Colors.white.withValues(alpha: 0.7)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFFFD700).withValues(alpha: 0.6 * blink),
              blurRadius: 4,
            ),
          ],
        ),
      ),
    );
  }
}

class _CasinoWheelPainter extends CustomPainter {
  _CasinoWheelPainter({required this.colors});

  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final sweep = 2 * math.pi / colors.length;
    for (var i = 0; i < colors.length; i++) {
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2 + i * sweep,
        sweep,
        true,
        Paint()..color = colors[i],
      );
    }
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = const Color(0xFF1A5CD4)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(covariant _CasinoWheelPainter oldDelegate) => false;
}

class _MiniPointerPainter extends CustomPainter {
  _MiniPointerPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(size.width / 2, size.height)
      ..lineTo(0, 0)
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _MiniPointerPainter oldDelegate) =>
      oldDelegate.color != color;
}
