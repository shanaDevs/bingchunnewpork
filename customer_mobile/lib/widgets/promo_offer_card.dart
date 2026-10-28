import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/bc_theme.dart';
import 'product_radial_image.dart';

/// Reusable promo card — fixed layout; only [productImageUrl] changes per offer.
class PromoOfferCard extends StatelessWidget {
  final String discountText;
  final String title;
  final String subtitle;
  final String? productImageUrl;
  final VoidCallback? onOrderTap;

  const PromoOfferCard({
    super.key,
    required this.discountText,
    required this.title,
    required this.subtitle,
    this.productImageUrl,
    this.onOrderTap,
  });

  static const _bgNavy = Color(0xFF051937);
  static const _textPrimary = Colors.white;
  static const _textMuted = Color(0xFFA0A0B0);
  static const _cardHeight = 158.0;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: _cardHeight,
        child: Stack(
          clipBehavior: Clip.hardEdge,
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: _bgNavy),
            const Positioned.fill(child: _PromoBackgroundGlow()),
            const Positioned.fill(child: _BobaPearlField()),
            Positioned(
              right: 4,
              top: 6,
              bottom: 6,
              width: 118,
              child: ProductRadialImage(
                imageUrl: productImageUrl,
                expand: true,
                borderRadius: BorderRadius.circular(12),
                placeholderColor: Colors.white.withValues(alpha: 0.35),
              ),
            ),
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              right: 112,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      _bgNavy,
                      _bgNavy.withValues(alpha: 0.92),
                      _bgNavy.withValues(alpha: 0.0),
                    ],
                    stops: const [0.0, 0.72, 1.0],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 14, 112, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    discountText,
                    style: const TextStyle(
                      color: _textPrimary,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      height: 1.05,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: _textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: _textMuted,
                      fontSize: 11,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Material(
                    color: BcColors.brand,
                    borderRadius: BorderRadius.circular(22),
                    elevation: 0,
                    child: InkWell(
                      onTap: onOrderTap ?? () => context.go('/menu'),
                      borderRadius: BorderRadius.circular(22),
                      child: const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Text(
                          'Order Now',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PromoBackgroundGlow extends StatelessWidget {
  const _PromoBackgroundGlow();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(-0.35, -0.15),
          radius: 1.1,
          colors: [
            const Color(0xFF0C2E58).withValues(alpha: 0.88),
            PromoOfferCard._bgNavy,
          ],
        ),
      ),
    );
  }
}

/// Scattered tapioca pearls drawn in code (bottom of card).
class _BobaPearlField extends StatelessWidget {
  const _BobaPearlField();

  static const _pearls = <_PearlSpec>[
    _PearlSpec(0.52, 0.94, 7, 0.55),
    _PearlSpec(0.64, 0.88, 9, 0.7),
    _PearlSpec(0.76, 0.96, 6, 0.45),
    _PearlSpec(0.86, 0.90, 8, 0.6),
    _PearlSpec(0.94, 0.97, 5, 0.4),
    _PearlSpec(0.58, 0.82, 5, 0.35),
    _PearlSpec(0.70, 0.78, 7, 0.5),
    _PearlSpec(0.82, 0.84, 6, 0.42),
    _PearlSpec(0.48, 0.86, 4, 0.3),
    _PearlSpec(0.91, 0.78, 4, 0.28),
  ];

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final h = constraints.maxHeight;
        return Stack(
          children: [
            for (final p in _pearls)
              Positioned(
                left: w * p.x - p.size,
                top: h * p.y - p.size,
                child: _BobaPearl(size: p.size, opacity: p.opacity),
              ),
          ],
        );
      },
    );
  }
}

class _PearlSpec {
  final double x;
  final double y;
  final double size;
  final double opacity;

  const _PearlSpec(this.x, this.y, this.size, this.opacity);
}

class _BobaPearl extends StatelessWidget {
  final double size;
  final double opacity;

  const _BobaPearl({required this.size, required this.opacity});

  @override
  Widget build(BuildContext context) {
    final d = size * 2;
    return Opacity(
      opacity: opacity,
      child: Container(
        width: d,
        height: d,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            center: const Alignment(-0.25, -0.3),
            radius: 0.85,
            colors: [
              const Color(0xFF5C4033).withValues(alpha: 0.9),
              const Color(0xFF1A0F0A),
            ],
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 2,
              offset: const Offset(0, 1),
            ),
          ],
        ),
      ),
    );
  }
}
