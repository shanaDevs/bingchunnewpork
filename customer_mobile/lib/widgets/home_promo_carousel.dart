import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';
import 'design/bc_app_design.dart';

/// Home hero — full-bleed promo carousel with login-style curved white bottom.
class HomePromoCarousel extends StatefulWidget {
  final VoidCallback? onTap;

  const HomePromoCarousel({super.key, this.onTap});

  static const banners = [
    'assets/promos/home-banner-strawberry.jpg',
    'assets/promos/home-banner-brownsugar.jpg',
  ];

  /// Match banner art (~1024×501) so left copy is not cropped.
  static const aspectRatio = 1024 / 501;

  @override
  State<HomePromoCarousel> createState() => _HomePromoCarouselState();
}

class _HomePromoCarouselState extends State<HomePromoCarousel> {
  late final PageController _controller;
  Timer? _autoPlay;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
    _restartAutoPlay();
  }

  void _restartAutoPlay() {
    _autoPlay?.cancel();
    if (HomePromoCarousel.banners.length <= 1) return;
    _autoPlay = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_index + 1) % HomePromoCarousel.banners.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 480),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _autoPlay?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final banners = HomePromoCarousel.banners;

    return ClipPath(
      clipper: const BcWaveBottomClipper(),
      child: AspectRatio(
        aspectRatio: HomePromoCarousel.aspectRatio,
        child: ColoredBox(
          // Avoid black flash / letterbox while images settle.
          color: const Color(0xFFE8F4FF),
          child: Stack(
            fit: StackFit.expand,
            children: [
              PageView.builder(
                controller: _controller,
                itemCount: banners.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (context, i) {
                  return GestureDetector(
                    onTap: widget.onTap,
                    child: Image.asset(
                      banners[i],
                      fit: BoxFit.cover,
                      // Keep brand title / tagline on the left fully visible.
                      alignment: const Alignment(-0.85, 0),
                      width: double.infinity,
                      height: double.infinity,
                      gaplessPlayback: true,
                      errorBuilder: (_, __, ___) => const ColoredBox(
                        color: Color(0xFFE8F1FF),
                        child: Center(
                          child: Icon(
                            Icons.local_cafe_rounded,
                            color: BcColors.brand,
                            size: 40,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
              const Positioned(
                right: 8,
                bottom: 36,
                child: _WavingMascot(size: 76),
              ),
              if (banners.length > 1)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 40,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(banners.length, (i) {
                      final active = i == _index;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 220),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: active ? 16 : 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: active
                              ? Colors.white
                              : Colors.white.withValues(alpha: 0.45),
                          borderRadius: BorderRadius.circular(999),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.2),
                              blurRadius: 4,
                            ),
                          ],
                        ),
                      );
                    }),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WavingMascot extends StatefulWidget {
  final double size;
  const _WavingMascot({this.size = 64});

  @override
  State<_WavingMascot> createState() => _WavingMascotState();
}

class _WavingMascotState extends State<_WavingMascot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, child) {
        final t = _ctrl.value;
        final bob = math.sin(t * math.pi * 2) * -8;
        final tilt = math.sin(t * math.pi * 2) * 0.08;
        return Transform.translate(
          offset: Offset(0, bob),
          child: Transform.rotate(angle: tilt, child: child),
        );
      },
      child: Image.asset(
        'assets/brand/mascot-hover.png',
        width: widget.size,
        height: widget.size,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => Image.asset(
          'assets/mascots/welcome.png',
          width: widget.size,
          height: widget.size,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
        ),
      ),
    );
  }
}
