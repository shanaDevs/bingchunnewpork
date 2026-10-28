import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/mascot_images.dart';
import '../providers/splash_provider.dart';

/// Web-parity first-launch loading screen (`Frontend` LoadingScreen).
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with TickerProviderStateMixin {
  static const _minVisible = Duration(milliseconds: 1200);

  late final AnimationController _enterCtrl;
  late final AnimationController _bounceCtrl;
  late final AnimationController _dotsCtrl;
  late final AnimationController _bubblesCtrl;

  @override
  void initState() {
    super.initState();
    _enterCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    )..forward();
    _bounceCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    );
    _dotsCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat();
    _bubblesCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..repeat();

    Future<void>.delayed(const Duration(milliseconds: 500), () {
      if (mounted) _bounceCtrl.repeat(reverse: true);
    });

    Future<void>.delayed(_minVisible, () {
      if (!mounted) return;
      ref.read(splashMinElapsedProvider.notifier).state = true;
    });
  }

  @override
  void dispose() {
    _enterCtrl.dispose();
    _bounceCtrl.dispose();
    _dotsCtrl.dispose();
    _bubblesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final enter = CurvedAnimation(parent: _enterCtrl, curve: Curves.easeOutBack);
    final size = MediaQuery.sizeOf(context);

    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment(-0.8, -1),
            end: Alignment(0.6, 1),
            colors: [
              Color(0xFF071840),
              Color(0xFF123D8F),
              Color(0xFF307EF2),
              Color(0xFF0C2D6E),
            ],
            stops: [0.0, 0.38, 0.62, 1.0],
          ),
        ),
        child: Stack(
          children: [
            // Blue glow
            Positioned(
              left: size.width / 2 - 250,
              top: size.height / 2 - 250,
              child: IgnorePointer(
                child: Container(
                  width: 500,
                  height: 500,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFF5C9AF5).withValues(alpha: 0.30),
                        const Color(0xFF5C9AF5).withValues(alpha: 0.0),
                      ],
                    ),
                  ),
                ),
              ),
            ),

            // Floating bubbles
            ..._bubbles.map((b) {
              return AnimatedBuilder(
                animation: _bubblesCtrl,
                builder: (context, _) {
                  final phase = (_bubblesCtrl.value + b.delay) % 1.0;
                  final y = math.sin(phase * math.pi * 2) * -18;
                  final scale = 1 + math.sin(phase * math.pi * 2) * 0.08;
                  return Positioned(
                    left: size.width * b.x,
                    top: size.height * b.y,
                    child: Transform.translate(
                      offset: Offset(0, y),
                      child: Transform.scale(
                        scale: scale,
                        child: Container(
                          width: b.size,
                          height: b.size,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              center: const Alignment(-0.3, -0.3),
                              colors: [
                                Colors.white.withValues(alpha: 0.5),
                                const Color(0xFF307EF2).withValues(alpha: 0.15),
                              ],
                            ),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.2),
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              );
            }),

            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FadeTransition(
                    opacity: _enterCtrl,
                    child: ScaleTransition(
                      scale: Tween<double>(begin: 0.6, end: 1).animate(enter),
                      child: AnimatedBuilder(
                        animation: _bounceCtrl,
                        builder: (context, child) {
                          final bob = _bounceCtrl.isAnimating
                              ? (1 - _bounceCtrl.value) * -14
                              : 0.0;
                          return Transform.translate(
                            offset: Offset(0, bob),
                            child: child,
                          );
                        },
                        child: Image.asset(
                          MascotImages.loading,
                          width: 180,
                          height: 180,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => Image.asset(
                            'assets/brand/mascot-hover.png',
                            width: 160,
                            height: 160,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => Image.asset(
                              MascotImages.welcome,
                              width: 140,
                              height: 140,
                              fit: BoxFit.contain,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  FadeTransition(
                    opacity: CurvedAnimation(
                      parent: _enterCtrl,
                      curve: const Interval(0.35, 1, curve: Curves.easeOut),
                    ),
                    child: Column(
                      children: [
                        Text(
                          'Bing Chun',
                          style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.4,
                            shadows: [
                              Shadow(
                                color: Colors.black.withValues(alpha: 0.25),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Premium Bubble Tea & Ice Cream',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 40),
                  FadeTransition(
                    opacity: CurvedAnimation(
                      parent: _enterCtrl,
                      curve: const Interval(0.5, 1, curve: Curves.easeOut),
                    ),
                    child: Column(
                      children: [
                        AnimatedBuilder(
                          animation: _dotsCtrl,
                          builder: (context, _) {
                            return Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: List.generate(3, (i) {
                                final t = (_dotsCtrl.value + i * 0.2) % 1.0;
                                final pulse = math.sin(t * math.pi);
                                final scale = 1 + pulse * 0.4;
                                final opacity = 0.3 + pulse * 0.7;
                                return Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 4),
                                  child: Transform.scale(
                                    scale: scale,
                                    child: Opacity(
                                      opacity: opacity.clamp(0.0, 1.0),
                                      child: Container(
                                        width: 8,
                                        height: 8,
                                        decoration: const BoxDecoration(
                                          color: Colors.white,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                    ),
                                  ),
                                );
                              }),
                            );
                          },
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Preparing your treats...',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.white.withValues(alpha: 0.6),
                          ),
                        ),
                      ],
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

class _BubbleSpec {
  const _BubbleSpec(this.x, this.y, this.size, this.delay);
  final double x;
  final double y;
  final double size;
  final double delay;
}

const _bubbles = [
  _BubbleSpec(0.15, 0.25, 14, 0.0),
  _BubbleSpec(0.80, 0.18, 10, 0.12),
  _BubbleSpec(0.55, 0.70, 18, 0.20),
  _BubbleSpec(0.25, 0.65, 12, 0.08),
  _BubbleSpec(0.88, 0.55, 16, 0.16),
];
