import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../config/api_config.dart';
import '../models/spin.dart';
import '../theme/bc_theme.dart';

Color parseSpinColor(String hex, [Color fallback = BcColors.brand]) {
  var value = hex.trim();
  if (value.startsWith('#')) value = value.substring(1);
  if (value.length == 3) {
    value = value.split('').map((c) => '$c$c').join();
  }
  if (value.length == 6) value = 'FF$value';
  final parsed = int.tryParse(value, radix: 16);
  if (parsed == null) return fallback;
  return Color(parsed);
}

IconData spinOfferIcon(String offerType) {
  switch (offerType.toUpperCase()) {
    case 'PERCENTAGE':
      return Icons.percent;
    case 'FIXED':
      return Icons.payments_outlined;
    case 'FREE_DELIVERY':
      return Icons.local_shipping_outlined;
    case 'GIFT':
      return Icons.card_giftcard_rounded;
    default:
      return Icons.celebration_outlined;
  }
}

/// Full spin wheel — web `SpinWheelModal` visual parity (upright labels, gifts, rim lights).
class SpinWheel extends StatelessWidget {
  const SpinWheel({
    super.key,
    required this.offers,
    required this.rotation,
    this.size = 280,
  });

  final List<SpinOffer> offers;
  final double rotation;
  final double size;

  @override
  Widget build(BuildContext context) {
    final count = math.max(offers.length, 1);
    final step = 360 / count;
    final radians = rotation * math.pi / 180;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          // Soft brand glow
          Container(
            width: size * 0.95,
            height: size * 0.95,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: BcColors.brand.withValues(alpha: 0.28),
                  blurRadius: 28,
                  spreadRadius: 2,
                ),
              ],
            ),
          ),

          // Win pointer (fixed)
          Positioned(
            top: -18,
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: BcColors.accent,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: Colors.white, width: 1),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.35),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: const Text(
                    'WIN',
                    style: TextStyle(
                      color: BcColors.navyCard,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.4,
                    ),
                  ),
                ),
                CustomPaint(
                  size: const Size(36, 28),
                  painter: _PointerPainter(color: BcColors.accent),
                ),
              ],
            ),
          ),

          // Rotating disk
          Transform.rotate(
            angle: radians,
            child: CustomPaint(
              size: Size.square(size),
              painter: _SpinDiskPainter(offers: offers),
            ),
          ),

          // Labels orbit with the wheel but stay screen-upright (web counter-rotate).
          Transform.rotate(
            angle: radians,
            child: Stack(
              alignment: Alignment.center,
              children: [
                for (var i = 0; i < offers.length; i++)
                  Transform.rotate(
                    angle: ((i * step + step / 2) - 90) * math.pi / 180,
                    child: Align(
                      alignment: const Alignment(0, -0.72),
                      child: Transform.rotate(
                        angle:
                            -radians -
                            ((i * step + step / 2) - 90) * math.pi / 180,
                        child: SizedBox(
                          width: 72,
                          height: 72,
                          child: offers[i].isGift
                              ? _GiftLabel(offer: offers[i])
                              : _TextLabel(offer: offers[i]),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Center hub with logo (counter-rotated)
          Transform.rotate(
            angle: radians,
            child: Transform.rotate(
              angle: -radians,
              child: Container(
                width: size * 0.22,
                height: size * 0.22,
                decoration: BoxDecoration(
                  color: BcColors.navyCard,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.4),
                    width: 3,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.35),
                      blurRadius: 10,
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Image.asset(
                    'assets/brand/logo.png',
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) =>
                        const Icon(Icons.local_cafe, color: BcColors.brand),
                  ),
                ),
              ),
            ),
          ),

          // Rim lights (fixed, blinking via animated widget)
          _RimLights(size: size),
        ],
      ),
    );
  }
}

class _TextLabel extends StatelessWidget {
  const _TextLabel({required this.offer});

  final SpinOffer offer;

  @override
  Widget build(BuildContext context) {
    final lines = offer.segmentLines;
    final secondLine = lines.$2;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (offer.offerType.toUpperCase() != 'PERCENTAGE')
          Icon(
            spinOfferIcon(offer.offerType),
            size: 16,
            color: Colors.white,
            shadows: const [Shadow(blurRadius: 4, color: Colors.black87)],
          ),
        Text(
          lines.$1,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            height: 1.05,
            shadows: [Shadow(blurRadius: 3, color: Colors.black87)],
          ),
        ),
        if (secondLine != null)
          Text(
            secondLine,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.95),
              fontSize: 9,
              fontWeight: FontWeight.w700,
              height: 1.05,
              shadows: const [Shadow(blurRadius: 3, color: Colors.black87)],
            ),
          ),
      ],
    );
  }
}

class _GiftLabel extends StatelessWidget {
  const _GiftLabel({required this.offer});

  final SpinOffer offer;

  @override
  Widget build(BuildContext context) {
    final url = ApiConfig.resolveAssetUrl(offer.giftProduct?.imageUrl);
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
            border: Border.all(color: Colors.white, width: 2.5),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 8,
              ),
            ],
          ),
          child: url == null
              ? const Icon(
                  Icons.card_giftcard_rounded,
                  color: BcColors.brand,
                  size: 20,
                )
              : ClipOval(
                  child: Image.network(
                    url,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const Icon(
                      Icons.card_giftcard_rounded,
                      color: BcColors.brand,
                      size: 20,
                    ),
                  ),
                ),
        ),
        const SizedBox(height: 2),
        const Text(
          'Free',
          style: TextStyle(
            color: Colors.white,
            fontSize: 9,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.4,
            shadows: [Shadow(blurRadius: 3, color: Colors.black87)],
          ),
        ),
      ],
    );
  }
}

class _RimLights extends StatefulWidget {
  const _RimLights({required this.size});

  final double size;

  @override
  State<_RimLights> createState() => _RimLightsState();
}

class _RimLightsState extends State<_RimLights>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  static const _colors = [
    Color(0xFFFFD700),
    Color(0xFFFF4757),
    Color(0xFF307EF2),
    Color(0xFFFFFFFF),
  ];

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.size;
    final r = size * 0.485;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        return Stack(
          children: [
            for (var i = 0; i < 12; i++)
              Builder(
                builder: (_) {
                  final deg = i * 30.0;
                  final rad = (deg - 90) * math.pi / 180;
                  final phase = ((i % 4) * 0.2 + _ctrl.value) % 1.0;
                  final opacity = 0.35 + 0.65 * phase;
                  return Positioned(
                    left: size / 2 + r * math.cos(rad) - 4,
                    top: size / 2 + r * math.sin(rad) - 4,
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _colors[i % _colors.length].withValues(
                          alpha: opacity,
                        ),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.8),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: _colors[i % _colors.length].withValues(
                              alpha: 0.55 * opacity,
                            ),
                            blurRadius: 5,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
          ],
        );
      },
    );
  }
}

class _SpinDiskPainter extends CustomPainter {
  _SpinDiskPainter({required this.offers});

  final List<SpinOffer> offers;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 6;
    final count = math.max(offers.length, 1);
    final sweep = 2 * math.pi / count;

    for (var i = 0; i < count; i++) {
      final color = i < offers.length
          ? parseSpinColor(offers[i].color)
          : BcColors.brand;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2 + i * sweep,
        sweep,
        true,
        Paint()..color = color,
      );
    }

    final divider = Paint()
      ..color = Colors.white.withValues(alpha: 0.5)
      ..strokeWidth = 2;
    for (var i = 0; i < count; i++) {
      final angle = -math.pi / 2 + i * sweep;
      canvas.drawLine(
        center,
        Offset(
          center.dx + math.cos(angle) * radius,
          center.dy + math.sin(angle) * radius,
        ),
        divider,
      );
    }

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = const Color(0xFF1A5CD4)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6,
    );
    canvas.drawCircle(
      center,
      radius + 3,
      Paint()
        ..color = const Color(0xFF307EF2).withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4,
    );
  }

  @override
  bool shouldRepaint(covariant _SpinDiskPainter oldDelegate) =>
      oldDelegate.offers != offers;
}

class _PointerPainter extends CustomPainter {
  _PointerPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(size.width / 2, size.height)
      ..lineTo(2, 2)
      ..lineTo(size.width - 2, 2)
      ..close();
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.black.withValues(alpha: 0.35)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant _PointerPainter oldDelegate) =>
      oldDelegate.color != color;
}
