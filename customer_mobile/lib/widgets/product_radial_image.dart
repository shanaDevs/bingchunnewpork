import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';

/// Product photo with the blue radial glow used on menu cards.
class ProductRadialImage extends StatelessWidget {
  final String? imageUrl;
  final String? assetPath;
  final double? width;
  final double? height;
  final BorderRadius borderRadius;
  final BoxFit fit;
  final String? heroTag;
  final bool expand;
  final EdgeInsetsGeometry padding;
  final IconData placeholderIcon;
  final double? placeholderSize;
  final Color? placeholderColor;
  final bool active;

  const ProductRadialImage({
    super.key,
    this.imageUrl,
    this.assetPath,
    this.width,
    this.height,
    this.borderRadius = const BorderRadius.all(Radius.circular(12)),
    this.fit = BoxFit.contain,
    this.heroTag,
    this.expand = false,
    this.padding = const EdgeInsets.all(8),
    this.placeholderIcon = Icons.local_cafe_outlined,
    this.placeholderSize,
    this.placeholderColor,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final resolvedPlaceholderSize =
        placeholderSize ?? _defaultPlaceholderSize();

    Widget image = _buildImage(resolvedPlaceholderSize);
    if (heroTag != null) {
      image = Hero(tag: heroTag!, child: image);
    }

    final glowAlpha = active
        ? (isDark ? 0.92 : 0.62)
        : (isDark ? 0.75 : 0.45);

    final content = Stack(
      fit: expand ? StackFit.expand : StackFit.loose,
      children: [
        Positioned.fill(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            decoration: BoxDecoration(
              color: isDark ? BcColors.navyCard : const Color(0xFFF8FAFC),
              gradient: RadialGradient(
                center: const Alignment(0, -0.08),
                radius: active ? 0.92 : 0.78,
                colors: [
                  BcColors.brand.withValues(alpha: glowAlpha),
                  BcColors.brand.withValues(alpha: active ? 0.28 : 0.16),
                  BcColors.brand.withValues(alpha: 0.0),
                ],
                stops: const [0.12, 0.42, 0.78],
              ),
            ),
          ),
        ),
        const Positioned.fill(child: IgnorePointer(child: _GlassSheen())),
        const Positioned.fill(
          child: IgnorePointer(
            child: Align(
              alignment: Alignment(0, 0.68),
              child: _GlassPedestal(),
            ),
          ),
        ),
        Positioned.fill(
          child: Padding(
            padding: padding,
            child: expand
                ? Center(child: SizedBox.expand(child: image))
                : Center(child: image),
          ),
        ),
      ],
    );

    return ClipRRect(
      borderRadius: borderRadius,
      child: width != null || height != null
          ? SizedBox(width: width, height: height, child: content)
          : content,
    );
  }

  double _defaultPlaceholderSize() {
    final base = height ?? width ?? 72;
    return base * 0.42;
  }

  Widget _buildImage(double iconSize) {
    if (assetPath != null && assetPath!.isNotEmpty) {
      return Image.asset(
        assetPath!,
        fit: fit,
        errorBuilder: (_, __, ___) => _placeholder(iconSize),
      );
    }

    final url = imageUrl;
    if (url != null && url.isNotEmpty) {
      return Image.network(
        url,
        fit: fit,
        alignment: Alignment.center,
        errorBuilder: (_, __, ___) => _placeholder(iconSize),
      );
    }

    return _placeholder(iconSize);
  }

  Widget _placeholder(double iconSize) {
    return Center(
      child: Icon(
        placeholderIcon,
        size: iconSize,
        color: placeholderColor ??
            BcColors.brand.withValues(alpha: 0.35),
      ),
    );
  }
}

class _GlassSheen extends StatelessWidget {
  const _GlassSheen();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: 0.52),
            Colors.white.withValues(alpha: 0.08),
            Colors.white.withValues(alpha: 0.0),
          ],
          stops: const [0.0, 0.34, 0.7],
        ),
      ),
    );
  }
}

class _GlassPedestal extends StatelessWidget {
  const _GlassPedestal();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 78,
      height: 26,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(40),
        gradient: RadialGradient(
          colors: [
            Colors.white.withValues(alpha: 0.72),
            BcColors.brand.withValues(alpha: 0.12),
            BcColors.brand.withValues(alpha: 0.0),
          ],
        ),
      ),
    );
  }
}

/// Stitch peek that slides in on press / hover — matches web `.product-card__mascot`.
class ProductHoverMascot extends StatelessWidget {
  final bool visible;
  final double size;

  const ProductHoverMascot({
    super.key,
    required this.visible,
    this.size = 44,
  });

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedSlide(
        offset: visible ? Offset.zero : const Offset(0.25, 0.4),
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        child: AnimatedOpacity(
          opacity: visible ? 1 : 0,
          duration: const Duration(milliseconds: 220),
          child: Image.asset(
            'assets/brand/mascot-hover.png',
            width: size,
            height: size,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}

/// Glass shine sweep across a product image.
class ProductGlassShine extends StatelessWidget {
  final Animation<double> animation;

  const ProductGlassShine({super.key, required this.animation});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          final t = animation.value;
          if (t == 0 || t == 1) return const SizedBox.shrink();
          return Align(
            alignment: Alignment(-1.2 + 2.5 * t, 0),
            child: FractionallySizedBox(
              widthFactor: 0.45,
              heightFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      Colors.white.withValues(alpha: 0),
                      Colors.white.withValues(alpha: 0.55),
                      Colors.white.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
