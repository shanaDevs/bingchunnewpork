import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';

/// Brand map pointer — circular logo head + pointed tip (store / outlet).
class BcLogoMapPin extends StatelessWidget {
  final bool selected;
  final double size;
  final VoidCallback? onTap;
  final Widget? label;

  const BcLogoMapPin({
    super.key,
    this.selected = true,
    this.size = 44,
    this.onTap,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    final head = selected ? size : size * 0.78;
    final tipH = selected ? 14.0 : 11.0;

    final pin = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          label!,
          const SizedBox(height: 4),
        ],
        SizedBox(
          width: head,
          height: head + tipH - 2,
          child: Stack(
            alignment: Alignment.topCenter,
            clipBehavior: Clip.none,
            children: [
              Positioned(
                bottom: 0,
                child: CustomPaint(
                  size: Size(head * 0.55, tipH + 4),
                  painter: _BcMapPinTipPainter(color: BcColors.brand),
                ),
              ),
              Container(
                width: head,
                height: head,
                decoration: BoxDecoration(
                  color: BcColors.brand,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: selected ? 3 : 2.5),
                  boxShadow: [
                    BoxShadow(
                      color: BcColors.brand.withValues(alpha: 0.4),
                      blurRadius: selected ? 10 : 6,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: Padding(
                  padding: EdgeInsets.all(selected ? 5 : 4),
                  child: ClipOval(
                    child: Image.asset(
                      'assets/brand/mascot-hover.png',
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.local_cafe_rounded, color: Colors.white, size: 16),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );

    if (onTap == null) return pin;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: pin,
    );
  }
}

/// Customer location marker — human avatar map pin.
class BcCustomerCupPin extends StatelessWidget {
  final double size;
  final Widget? label;

  const BcCustomerCupPin({
    super.key,
    this.size = 48,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          label!,
          const SizedBox(height: 4),
        ],
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
            border: Border.all(color: BcColors.brand, width: 3),
            boxShadow: [
              BoxShadow(
                color: BcColors.brand.withValues(alpha: 0.45),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: ClipOval(
            child: Image.asset(
              'assets/brand/customer-avatar.png',
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                color: const Color(0xFFE8F1FF),
                alignment: Alignment.center,
                child: Icon(Icons.person_rounded, color: BcColors.brand, size: size * 0.55),
              ),
            ),
          ),
        ),
        CustomPaint(
          size: const Size(16, 10),
          painter: _BcMapPinTipPainter(color: BcColors.brand),
        ),
      ],
    );
  }
}

class _BcMapPinTipPainter extends CustomPainter {
  final Color color;

  _BcMapPinTipPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final path = ui.Path()
      ..moveTo(size.width * 0.5, size.height)
      ..lineTo(0, 0)
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _BcMapPinTipPainter oldDelegate) => oldDelegate.color != color;
}

/// Live driver marker — scooter glyph that rotates with GPS heading.
class BcScooterMapPin extends StatelessWidget {
  final double size;
  final double? headingDegrees;

  const BcScooterMapPin({
    super.key,
    this.size = 52,
    this.headingDegrees,
  });

  @override
  Widget build(BuildContext context) {
    final heading = headingDegrees;
    // two_wheeler faces right (90°); GPS heading is clockwise from north.
    final turns = heading == null ? 0.0 : ((heading - 90) * 3.1415926535 / 180);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: BcColors.brand,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: [
          BoxShadow(
            color: BcColors.brand.withValues(alpha: 0.45),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Transform.rotate(
        angle: turns,
        child: Icon(
          Icons.two_wheeler_rounded,
          color: Colors.white,
          size: size * 0.52,
        ),
      ),
    );
  }
}
