import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/bc_theme.dart';
import 'language_switch.dart';
import 'scenery.dart';
import '../../l10n/l10n.dart';

/// Sign-in page frame shared by the phone, code and "not a rider" steps:
/// illustrated wave hero, then a card with a notched badge overlapping its top edge.
class BcAuthScaffold extends StatefulWidget {
  const BcAuthScaffold({
    super.key,
    required this.kicker,
    required this.subtitle,
    required this.badge,
    required this.card,
    this.onBack,
  });

  final String kicker;
  final String subtitle;
  final Widget badge;
  final Widget card;

  /// Shows a back arrow in the hero when set.
  final VoidCallback? onBack;

  @override
  State<BcAuthScaffold> createState() => _BcAuthScaffoldState();
}

class _BcAuthScaffoldState extends State<BcAuthScaffold> {
  bool _appeared = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _appeared = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final top = MediaQuery.paddingOf(context).top;
    final width = MediaQuery.sizeOf(context).width;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.background,
        body: Stack(
          fit: StackFit.expand,
          children: [
            // Soft wave decoration at the bottom of the page.
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 180,
              child: CustomPaint(painter: _BottomWavePainter(c.brand.withValues(alpha: c.isDark ? 0.10 : 0.06))),
            ),
            SingleChildScrollView(
              padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24),
              child: Column(
                children: [
                  // ---------------- Hero ----------------
                  SizedBox(
                    height: top + 360,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: ClipPath(
                            clipper: const HeroWaveClipper(depth: 70),
                            child: Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
                                  stops: const [0, 0.45, 1],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                              ),
                              child: Stack(
                                children: [
                                  Positioned.fill(
                                    child: CustomPaint(
                                      painter: HeroSwooshPainter(Colors.white.withValues(alpha: 0.08)),
                                    ),
                                  ),
                                  Positioned.fill(
                                    child: AnimatedOpacity(
                                      opacity: _appeared ? 1 : 0,
                                      duration: BcMotion.slow,
                                      child: HeroScenery(riderHeight: width * 0.44, riderRight: 0, riderBottom: 40),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        if (widget.onBack != null)
                          Positioned(
                            top: top + 6,
                            left: 6,
                            child: IconButton(
                              tooltip: tr('Back'),
                              onPressed: widget.onBack,
                              icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                            ),
                          ),
                        // Language can be picked before signing in.
                        Positioned(top: top + 12, right: 16, child: const BcLanguageSwitch(onDark: true)),
                        Positioned(
                          left: 24,
                          top: top + 64,
                          right: width * 0.40,
                          child: AnimatedSlide(
                            offset: _appeared ? Offset.zero : const Offset(0, 0.08),
                            duration: BcMotion.slow,
                            curve: Curves.easeOut,
                            child: AnimatedOpacity(
                              opacity: _appeared ? 1 : 0,
                              duration: BcMotion.slow,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    widget.kicker,
                                    style: TextStyle(fontSize: 15, color: Colors.white.withValues(alpha: 0.85)),
                                  ),
                                  const SizedBox(height: 8),
                                  RichText(
                                    text: TextSpan(
                                      style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, height: 1.1),
                                      children: [
                                        TextSpan(
                                          text: tr('Delivery '),
                                          style: TextStyle(color: Colors.white),
                                        ),
                                        TextSpan(
                                          text: tr('Staff'),
                                          style: TextStyle(color: c.brandLight.withValues(alpha: 0.95)),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    widget.subtitle,
                                    style: TextStyle(
                                      fontSize: 14,
                                      height: 1.4,
                                      color: Colors.white.withValues(alpha: 0.85),
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  Container(
                                    width: 46,
                                    height: 5,
                                    decoration: BoxDecoration(
                                      color: c.brandLight,
                                      borderRadius: BorderRadius.circular(99),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  // ---------------- Card ----------------
                  Transform.translate(
                    offset: const Offset(0, -40),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Stack(
                        clipBehavior: Clip.none,
                        alignment: Alignment.topCenter,
                        children: [
                          Container(
                            margin: const EdgeInsets.only(top: 48),
                            padding: const EdgeInsets.fromLTRB(20, 64, 20, 22),
                            decoration: BoxDecoration(
                              color: c.card,
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(color: c.border),
                              boxShadow: [
                                BoxShadow(
                                  color: c.isDark ? const Color(0x33000000) : const Color(0x1A0A2647),
                                  blurRadius: 30,
                                  offset: const Offset(0, 12),
                                ),
                              ],
                            ),
                            child: widget.card,
                          ),
                          AnimatedScale(
                            scale: _appeared ? 1 : 0.8,
                            duration: BcMotion.slow,
                            curve: Curves.easeOutBack,
                            child: widget.badge,
                          ),
                        ],
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

/// Notched circular badge that sits on the card's top edge — logo by default,
/// or a tinted icon for status steps.
class BcAuthBadge extends StatelessWidget {
  const BcAuthBadge({super.key, this.icon, this.tint});

  /// Null shows the brand logo.
  final IconData? icon;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final color = tint ?? c.brand;
    return SizedBox(
      width: 116,
      height: 104,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 104,
            height: 104,
            decoration: BoxDecoration(shape: BoxShape.circle, color: c.background),
          ),
          Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.12)),
          ),
          Container(
            width: 72,
            height: 72,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: icon == null ? Colors.white : color,
              boxShadow: [BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 14, offset: const Offset(0, 6))],
            ),
            child: icon == null
                ? ClipOval(child: Image.asset('assets/images/logo.png', fit: BoxFit.cover, semanticLabel: 'Bing Chun'))
                : Icon(icon, color: Colors.white, size: 34),
          ),
          Positioned(left: 4, bottom: 18, child: _Dot(color: color)),
          Positioned(right: 2, top: 30, child: _Dot(color: color)),
        ],
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 7,
    height: 7,
    decoration: BoxDecoration(shape: BoxShape.circle, color: color),
  );
}

/// Card title + muted helper line used at the top of every sign-in card.
class BcAuthCardHeader extends StatelessWidget {
  const BcAuthCardHeader({super.key, required this.title, required this.message});

  final String title;
  final Widget message;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: c.text),
        ),
        const SizedBox(height: 8),
        DefaultTextStyle.merge(
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13.5, height: 1.45, color: c.textMuted),
          child: message,
        ),
      ],
    );
  }
}

/// Brand-gradient call-to-action with a trailing arrow (or [icon]).
class BcAuthButton extends StatelessWidget {
  const BcAuthButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.enabled = true,
    this.icon = Icons.arrow_forward_rounded,
  });

  final String label;
  final bool loading;
  final bool enabled;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = enabled && !loading;
    return AnimatedOpacity(
      duration: BcMotion.fast,
      opacity: active || loading ? 1 : 0.55,
      child: Container(
        height: 56,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(BcRadius.button + 2),
          gradient: LinearGradient(colors: [c.brandLight, c.brand, c.brandDark]),
          boxShadow: active
              ? [BoxShadow(color: c.brand.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 8))]
              : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(BcRadius.button + 2),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: active ? onPressed : null,
            child: Center(
              child: loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            label,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Icon(icon, color: Colors.white, size: 20),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BottomWavePainter extends CustomPainter {
  _BottomWavePainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final p = Paint()..color = color;
    canvas.drawPath(
      Path()
        ..moveTo(0, h * 0.35)
        ..cubicTo(w * 0.3, h * 0.05, w * 0.55, h * 0.75, w, h * 0.4)
        ..lineTo(w, h)
        ..lineTo(0, h)
        ..close(),
      p,
    );
    canvas.drawPath(
      Path()
        ..moveTo(0, h * 0.65)
        ..cubicTo(w * 0.35, h * 0.40, w * 0.65, h * 0.95, w, h * 0.7)
        ..lineTo(w, h)
        ..lineTo(0, h)
        ..close(),
      p,
    );
  }

  @override
  bool shouldRepaint(covariant _BottomWavePainter old) => old.color != color;
}
