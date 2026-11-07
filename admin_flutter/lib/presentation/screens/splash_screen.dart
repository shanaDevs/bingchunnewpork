import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/l10n.dart';
import '../components/layout.dart';
import '../theme/pos_theme.dart';

/// Launch screen on the indigo cashier-panel gradient while the session is checked.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  )..forward();

  late final Animation<double> _fade = CurvedAnimation(parent: _intro, curve: Curves.easeOut);
  late final Animation<double> _scale = Tween(begin: 0.9, end: 1.0)
      .animate(CurvedAnimation(parent: _intro, curve: Curves.easeOutBack));

  @override
  void dispose() {
    _intro.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      // Light status/nav bar icons on the dark gradient.
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: const Color(0xFF141243),
      ),
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(gradient: PosColors.sidebarGradient),
          child: Stack(
            children: [
              // Soft glow behind the logo for depth.
              Center(
                child: Container(
                  width: 320,
                  height: 320,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFF3B82F6).withValues(alpha: 0.22),
                        const Color(0xFF3B82F6).withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
              Center(
                child: FadeTransition(
                  opacity: _fade,
                  child: ScaleTransition(
                    scale: _scale,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const BrandMark(size: 96),
                        const SizedBox(height: PosSpacing.xxl),
                        Text(
                          tr('BingChun Admin'),
                          style: PosType.title.copyWith(color: Colors.white, fontSize: 26, letterSpacing: 0.2),
                        ),
                        const SizedBox(height: PosSpacing.sm),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: PosSpacing.md, vertical: PosSpacing.xs),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                          ),
                          child: Text(
                            tr('Admin Panel').toUpperCase(),
                            style: PosType.label.copyWith(color: Colors.white70, letterSpacing: 1.4),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              // Slim loader near the bottom instead of a spinner under the title.
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 56),
                    child: FadeTransition(
                      opacity: _fade,
                      child: Center(
                        child: SizedBox(
                          width: 120,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(999),
                            child: LinearProgressIndicator(
                              minHeight: 3,
                              color: Colors.white,
                              backgroundColor: Colors.white.withValues(alpha: 0.12),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
