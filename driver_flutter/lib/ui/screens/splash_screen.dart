import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/l10n.dart';
import '../theme/bc_theme.dart';

/// Brand display face, bundled in assets/fonts (Latin; other scripts fall back to the system font).
const _font = 'PlusJakartaSans';

/// Launch screen shown while the saved session is checked. Picks up exactly where the
/// native splash leaves off (blue gradient + rounded logo in the centre) and adds only a
/// soft glow, the name, and a slim loading bar — calm and modern, nothing busy.
class StartupSplash extends StatefulWidget {
  const StartupSplash({super.key});

  @override
  State<StartupSplash> createState() => _StartupSplashState();
}

class _StartupSplashState extends State<StartupSplash> with TickerProviderStateMixin {
  late final AnimationController _enter = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))
    ..forward();
  late final AnimationController _bar = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
    ..repeat();

  @override
  void dispose() {
    _enter.dispose();
    _bar.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final reduced = MediaQuery.of(context).disableAnimations;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final logoIn = CurvedAnimation(parent: _enter, curve: Curves.easeOutCubic);
    final textIn = CurvedAnimation(
      parent: _enter,
      curve: const Interval(0.3, 1, curve: Curves.easeOut),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
              stops: const [0, 0.55, 1],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: SizedBox.expand(
            child: Stack(
              children: [
                // Soft light behind the logo — the one decorative touch.
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        center: const Alignment(0, -0.12),
                        radius: 0.75,
                        colors: [Colors.white.withValues(alpha: 0.16), Colors.white.withValues(alpha: 0)],
                      ),
                    ),
                  ),
                ),
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      FadeTransition(
                        opacity: reduced ? const AlwaysStoppedAnimation(1) : logoIn,
                        child: ScaleTransition(
                          scale: reduced
                              ? const AlwaysStoppedAnimation(1)
                              : Tween(begin: 0.92, end: 1.0).animate(logoIn),
                          child: Container(
                            width: 128,
                            height: 128,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(34),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 1.5),
                              boxShadow: [
                                // Soft halo + drop shadow give depth without extra shapes.
                                BoxShadow(color: Colors.white.withValues(alpha: 0.18), blurRadius: 48, spreadRadius: 6),
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.25),
                                  blurRadius: 24,
                                  offset: const Offset(0, 12),
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(33),
                              child: Image.asset('assets/images/logo.png', fit: BoxFit.cover),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 28),
                      FadeTransition(
                        opacity: reduced ? const AlwaysStoppedAnimation(1) : textIn,
                        child: Column(
                          children: [
                            Text(
                              tr('Bing Chun Delivery'),
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontFamily: _font,
                                color: Colors.white,
                                fontSize: 29,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.6,
                                height: 1.1,
                              ),
                            ),
                            const SizedBox(height: 12),
                            // Small caps label flanked by hairlines — quiet, professional.
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(width: 18, height: 1, color: Colors.white.withValues(alpha: 0.45)),
                                const SizedBox(width: 10),
                                Text(
                                  tr('Delivery Staff').toUpperCase(),
                                  style: TextStyle(
                                    fontFamily: _font,
                                    color: Colors.white.withValues(alpha: 0.78),
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 2.8,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Container(width: 18, height: 1, color: Colors.white.withValues(alpha: 0.45)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                // Slim indeterminate bar + tagline near the bottom.
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: bottom + 40,
                  child: Column(
                    children: [
                      SizedBox(
                        width: 120,
                        height: 4,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: AnimatedBuilder(
                            animation: _bar,
                            builder: (_, _) =>
                                CustomPaint(painter: _SlimBarPainter(progress: reduced ? 0.35 : _bar.value)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        tr('Fresh cups, delivered on time'),
                        style: TextStyle(
                          fontFamily: _font,
                          color: Colors.white.withValues(alpha: 0.62),
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 0.1,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Track + a short white segment sliding across it.
class _SlimBarPainter extends CustomPainter {
  _SlimBarPainter({required this.progress});
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white.withValues(alpha: 0.18));
    final segment = size.width * 0.4;
    final x = -segment + (size.width + segment) * Curves.easeInOut.transform(progress);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(x, 0, segment, size.height), Radius.circular(size.height)),
      Paint()..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant _SlimBarPainter old) => old.progress != progress;
}
