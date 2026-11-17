import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/l10n.dart';
import '../components/qd_brand.dart';

const _heading = 'Inter';
const _sans = 'PlusJakartaSans';

/// The rider artwork is 423 x 450.
const _riderAspect = 423 / 450;
const _loaderWidth = 148.0;
const _loaderThumb = 56.0;

/// Brand splash (QuickDrop SplashOverlay): wordmark with yellow speed lines and the tagline
/// up top, the 3D rider scooting along a route to a location pin in the middle, and a slim
/// loading bar at the bottom, over a blue-to-cyan gradient with a faint street grid.
class StartupSplash extends StatefulWidget {
  const StartupSplash({super.key});

  @override
  State<StartupSplash> createState() => _StartupSplashState();
}

class _StartupSplashState extends State<StartupSplash> with TickerProviderStateMixin {
  static const _enterMs = 1400;

  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: _enterMs),
  )..forward();
  late final AnimationController _loader = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
    ..repeat();

  @override
  void dispose() {
    _enter.dispose();
    _loader.dispose();
    super.dispose();
  }

  /// 0 → 1 after [delay] over [duration] (ms), easing out like the reference.
  Animation<double> _entrance(int delay, int duration) => CurvedAnimation(
    parent: _enter,
    curve: Interval(delay / _enterMs, math.min(1, (delay + duration) / _enterMs), curve: Curves.easeOutCubic),
  );

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.of(context).disableAnimations;
    final mq = MediaQuery.of(context);
    const done = AlwaysStoppedAnimation<double>(1);
    final logo = reduced ? done : _entrance(100, 650);
    final tagline = reduced ? done : _entrance(320, 600);
    final rider = reduced ? done : _entrance(380, 850);
    final loaderIn = reduced ? done : _entrance(700, 400);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: const Color(0xFF2563EB),
        body: LayoutBuilder(
          builder: (context, box) {
            final width = box.maxWidth;
            final height = box.maxHeight;
            final column = math.min(width, 520.0);
            final left = (width - column) / 2;
            final logoSize = (column * 0.12).clamp(36.0, 54.0);
            final riderHeight = math.min(math.min((column * 0.78) / _riderAspect, height * 0.36), 400.0);
            final riderWidth = riderHeight * _riderAspect;
            final riderCenterY = height * 0.6;
            final logoTop = mq.padding.top + height * 0.16;
            final start = Offset(left + column * 0.08, riderCenterY - riderHeight * 0.06);
            final pin = Offset(left + column * 0.84, height * 0.45);

            return Stack(
              children: [
                Positioned.fill(
                  child: CustomPaint(
                    painter: _SplashBackdropPainter(
                      start: start,
                      pin: pin,
                      gridTop: height * 0.4,
                      gridBottom: height * 0.7,
                    ),
                  ),
                ),
                // Wordmark with yellow speed lines, then the tagline.
                Positioned(
                  top: logoTop,
                  left: left,
                  width: column,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      children: [
                        _Rise(
                          animation: logo,
                          distance: 18,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              _SpeedLines(size: logoSize),
                              Flexible(
                                child: Text(
                                  kAppName,
                                  maxLines: 1,
                                  overflow: TextOverflow.visible,
                                  style: TextStyle(
                                    fontFamily: _heading,
                                    fontSize: logoSize,
                                    height: 1.2,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -1,
                                    color: Colors.white,
                                    shadows: const [
                                      Shadow(color: Color(0x40082878), offset: Offset(0, 4), blurRadius: 14),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        _Rise(
                          animation: tagline,
                          distance: 12,
                          child: Text(
                            tr('Fast. Reliable. On the Move.'),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontFamily: _sans,
                              fontSize: (column * 0.047).clamp(15.0, 20.0),
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.3,
                              color: Colors.white.withValues(alpha: 0.92),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                // The rider, rolling in from the left with motion streaks behind.
                Positioned(
                  top: riderCenterY - riderHeight / 2,
                  left: (width - riderWidth) / 2,
                  width: riderWidth,
                  height: riderHeight,
                  child: AnimatedBuilder(
                    animation: rider,
                    builder: (context, child) => Opacity(
                      opacity: rider.value,
                      child: Transform.translate(offset: Offset((1 - rider.value) * -70, 0), child: child),
                    ),
                    child: Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.center,
                      children: [
                        for (final s in const [(0.52, 0.30, 0.55), (0.60, 0.42, 0.40), (0.68, 0.24, 0.50), (0.76, 0.36, 0.30)])
                          Positioned(
                            top: riderHeight * s.$1,
                            right: riderHeight * 0.82,
                            width: riderHeight * s.$2,
                            height: 3,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: s.$3),
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                          ),
                        Positioned(
                          bottom: riderHeight * 0.04,
                          child: Container(
                            width: riderWidth * 0.72,
                            height: 10,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(999),
                              color: const Color(0x2905215A),
                              boxShadow: const [BoxShadow(color: Color(0x2405215A), blurRadius: 18, spreadRadius: 8)],
                            ),
                          ),
                        ),
                        Image.asset(
                          'assets/images/rider_mascot.png',
                          width: riderWidth,
                          height: riderHeight,
                          fit: BoxFit.contain,
                          filterQuality: FilterQuality.medium,
                        ),
                      ],
                    ),
                  ),
                ),
                // Slim loading bar: a white thumb gliding along a translucent track.
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: mq.padding.bottom + (height * 0.06).clamp(28.0, 56.0),
                  child: FadeTransition(
                    opacity: loaderIn,
                    child: Center(
                      child: SizedBox(
                        width: _loaderWidth,
                        height: 5,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(5),
                          child: AnimatedBuilder(
                            animation: _loader,
                            builder: (_, _) => CustomPaint(
                              painter: _LoaderPainter(reduced ? 0.4 : Curves.easeInOutQuad.transform(_loader.value)),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Fades in while sliding up by [distance].
class _Rise extends StatelessWidget {
  const _Rise({required this.animation, required this.distance, required this.child});
  final Animation<double> animation;
  final double distance;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: animation,
    builder: (context, child) => Opacity(
      opacity: animation.value,
      child: Transform.translate(offset: Offset(0, (1 - animation.value) * distance), child: child),
    ),
    child: child,
  );
}

/// Three yellow bars before the wordmark: "fast".
class _SpeedLines extends StatelessWidget {
  const _SpeedLines({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    Widget bar(double w) => Container(
      width: size * w,
      height: math.max(4, size * 0.11),
      decoration: BoxDecoration(color: const Color(0xFFFFD60A), borderRadius: BorderRadius.circular(size)),
    );
    return Padding(
      padding: EdgeInsets.only(right: size * 0.14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [bar(0.5), SizedBox(height: size * 0.09), bar(0.38), SizedBox(height: size * 0.09), bar(0.26)],
      ),
    );
  }
}

/// Track + a short white thumb sliding left to right across it.
class _LoaderPainter extends CustomPainter {
  _LoaderPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white.withValues(alpha: 0.28));
    final x = -_loaderThumb + t * (size.width + _loaderThumb);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(x, 0, _loaderThumb, size.height), Radius.circular(size.height)),
      Paint()..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant _LoaderPainter old) => old.t != t;
}

/// Everything behind the splash content: gradient, soft light shapes, a faint street grid,
/// the delivery route from a start dot to a location pin, and gentle waves at the bottom.
class _SplashBackdropPainter extends CustomPainter {
  _SplashBackdropPainter({required this.start, required this.pin, required this.gridTop, required this.gridBottom});

  final Offset start;
  final Offset pin;
  final double gridTop;
  final double gridBottom;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final rect = Offset.zero & size;

    canvas.drawRect(
      rect,
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0xFF2563EB), Color(0xFF1E88F0), Color(0xFF16B8F3)],
          begin: Alignment(-1, -0.7),
          end: Alignment(1, 0.9),
        ).createShader(rect),
    );

    // Soft light shapes for depth.
    canvas.drawCircle(Offset(-w * 0.1, h * 0.06), w * 0.55, Paint()..color = Colors.white.withValues(alpha: 0.05));
    canvas.drawCircle(
      Offset(w * 1.05, h * 0.18),
      w * 0.42,
      Paint()..color = const Color(0xFF7DD3FC).withValues(alpha: 0.12),
    );

    // Street grid: two families of long, slightly tilted lines.
    final grid = Paint()
      ..color = Colors.white.withValues(alpha: 0.1)
      ..strokeWidth = 1.5;
    for (var i = 0; i < 6; i++) {
      final y = gridTop + ((gridBottom - gridTop) / 5) * i;
      canvas.drawLine(Offset(-20, y + 30), Offset(w + 20, y - 30), grid);
    }
    for (var i = 0; i < 7; i++) {
      final x = (w / 6) * i;
      canvas.drawLine(Offset(x - 40, gridBottom + 20), Offset(x + 60, gridTop - 20), grid);
    }

    // The route: a soft glow under a crisp line, built from the two end points only.
    final dx = pin.dx - start.dx;
    final rise = start.dy - pin.dy;
    final mid = Offset(start.dx + dx * 0.62, start.dy - rise * 0.45);
    final c2 = Offset(start.dx + dx * 0.42, mid.dy + rise * 0.05);
    final route = Path()
      ..moveTo(start.dx, start.dy)
      ..cubicTo(start.dx + dx * 0.18, start.dy - rise * 0.75, c2.dx, c2.dy, mid.dx, mid.dy)
      // Smooth continuation: the first control point mirrors the previous one about [mid].
      ..cubicTo(2 * mid.dx - c2.dx, 2 * mid.dy - c2.dy, pin.dx - dx * 0.06, pin.dy + rise * 0.3, pin.dx, pin.dy + 4);
    canvas.drawPath(
      route,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = 10
        ..color = Colors.white.withValues(alpha: 0.15),
    );
    canvas.drawPath(
      route,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = 3.5
        ..shader = LinearGradient(
          colors: [const Color(0xFFBFE9FF).withValues(alpha: 0.55), const Color(0xFFE6F7FF).withValues(alpha: 0.95)],
        ).createShader(Rect.fromPoints(start, pin)),
    );
    canvas.drawCircle(start, 9, Paint()..color = Colors.white.withValues(alpha: 0.25));
    canvas.drawCircle(start, 5, Paint()..color = Colors.white);

    // Destination pin with a halo where it touches the route.
    final s = math.min(52.0, w * 0.12);
    canvas.drawCircle(Offset(pin.dx, pin.dy + 4), 9, Paint()..color = Colors.white.withValues(alpha: 0.3));
    final x = pin.dx;
    final y = pin.dy;
    final drop = Path()
      ..moveTo(x, y)
      ..cubicTo(x - s * 0.15, y - s * 0.35, x - s * 0.5, y - s * 0.55, x - s * 0.5, y - s * 0.95)
      ..arcToPoint(Offset(x + s * 0.5, y - s * 0.95), radius: Radius.circular(s * 0.5), largeArc: true, clockwise: true)
      ..cubicTo(x + s * 0.5, y - s * 0.55, x + s * 0.15, y - s * 0.35, x, y)
      ..close();
    canvas.drawPath(drop, Paint()..color = Colors.white);
    canvas.drawCircle(Offset(x, y - s * 0.95), s * 0.2, Paint()..color = const Color(0xFF2563EB));

    // Gentle waves along the bottom.
    final wave1 = Path()
      ..moveTo(0, h * 0.8)
      ..cubicTo(w * 0.3, h * 0.74, w * 0.65, h * 0.84, w, h * 0.76)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(
      wave1,
      Paint()
        ..shader = LinearGradient(
          colors: [Colors.white.withValues(alpha: 0.02), Colors.white.withValues(alpha: 0.12)],
        ).createShader(rect),
    );
    final wave2 = Path()
      ..moveTo(0, h * 0.88)
      ..cubicTo(w * 0.35, h * 0.82, w * 0.7, h * 0.92, w, h * 0.84)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(wave2, Paint()..color = Colors.white.withValues(alpha: 0.06));
  }

  @override
  bool shouldRepaint(covariant _SplashBackdropPainter old) =>
      old.start != start || old.pin != pin || old.gridTop != gridTop || old.gridBottom != gridBottom;
}
