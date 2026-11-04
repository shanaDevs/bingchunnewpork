import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/alert_service.dart';
import '../../core/format.dart';
import '../../core/ride_alert.dart';
import '../components/run_kit.dart';
import '../components/scenery.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

const _dropRed = Color(0xFFE11D48);

/// Full-screen incoming ride card — port of IncomingRideScreen.kt.
/// Auto-dismisses after the 30s ring window.
class IncomingRideScreen extends StatefulWidget {
  const IncomingRideScreen({
    super.key,
    required this.alert,
    required this.accepting,
    required this.error,
    required this.onAccept,
    required this.onDismiss,
    this.locked = false,
  });

  final RideAlert alert;

  /// Phone is locked (the card is showing over the lock screen): hide customer details.
  final bool locked;
  final bool accepting;
  final String? error;
  final VoidCallback onAccept;
  final VoidCallback onDismiss;

  @override
  State<IncomingRideScreen> createState() => _IncomingRideScreenState();
}

class _IncomingRideScreenState extends State<IncomingRideScreen> with TickerProviderStateMixin {
  static final _total = AlertService.ringDuration;
  late DateTime _start;
  Timer? _ticker;
  int _remaining = _total.inSeconds;
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
    ..repeat();
  late final AnimationController _bounce = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
    ..repeat(reverse: true);
  // Fresh offset per alert: without this, PageStorage restores the previous alert's scroll.
  final _scroll = ScrollController(keepScrollOffset: false);
  late final AnimationController _enter = AnimationController(vsync: this, duration: const Duration(milliseconds: 420))
    ..forward();

  @override
  void initState() {
    super.initState();
    _restart();
  }

  @override
  void didUpdateWidget(IncomingRideScreen old) {
    super.didUpdateWidget(old);
    if (old.alert.jobId != widget.alert.jobId || (old.accepting && !widget.accepting)) _restart();
    if (old.alert.jobId != widget.alert.jobId && _scroll.hasClients) _scroll.jumpTo(0);
    if (widget.accepting) _ticker?.cancel();
  }

  void _restart() {
    _ticker?.cancel();
    _start = DateTime.now();
    _remaining = _total.inSeconds;
    _ticker = Timer.periodic(const Duration(milliseconds: 200), (_) {
      final left = ((_total - DateTime.now().difference(_start)).inMilliseconds / 1000).floor().clamp(0, 999);
      if (left != _remaining && mounted) setState(() => _remaining = left);
      if (left <= 0) {
        _ticker?.cancel();
        widget.onDismiss();
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _pulse.dispose();
    _bounce.dispose();
    _enter.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final a = widget.alert;
    final reduced = MediaQuery.of(context).disableAnimations;
    final fraction = _total.inSeconds == 0 ? 0.0 : _remaining / _total.inSeconds;
    final slide = CurvedAnimation(parent: _enter, curve: Curves.easeOutCubic);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Material(
        color: c.background,
        child: Column(
          children: [
            _Header(
              alert: a,
              remaining: _remaining,
              fraction: fraction,
              pulse: _pulse,
              bounce: _bounce,
              reduced: reduced,
            ),
            Expanded(
              child: FadeTransition(
                opacity: slide,
                child: SlideTransition(
                  position: Tween(begin: const Offset(0, 0.06), end: Offset.zero).animate(slide),
                  child: ListView(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                    children: [
                      if (a.deliveryFee > 0) ...[_EarningsCard(fee: a.deliveryFee), const SizedBox(height: 12)],
                      _FactsRow(alert: a),
                      const SizedBox(height: 12),
                      _RouteCard(alert: a, locked: widget.locked),
                      if (widget.error != null) ...[
                        const SizedBox(height: 12),
                        RunNote(icon: Icons.error_outline_rounded, text: widget.error!, color: c.danger),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            _Footer(
              remaining: _remaining,
              fraction: fraction,
              accepting: widget.accepting,
              onAccept: widget.onAccept,
              onDismiss: widget.onDismiss,
            ),
          ],
        ),
      ),
    );
  }
}

/// Gradient hero: pulsing rider badge, title, ride id and a countdown ring.
class _Header extends StatelessWidget {
  const _Header({
    required this.alert,
    required this.remaining,
    required this.fraction,
    required this.pulse,
    required this.bounce,
    required this.reduced,
  });

  final RideAlert alert;
  final int remaining;
  final double fraction;
  final Animation<double> pulse;
  final Animation<double> bounce;
  final bool reduced;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    const radius = BorderRadius.vertical(bottom: Radius.circular(32));
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: LinearGradient(
          colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
          stops: const [0, 0.5, 1],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [BoxShadow(color: c.brand.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8))],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          children: [
            Positioned.fill(child: CustomPaint(painter: HeroSwooshPainter(Colors.white.withValues(alpha: 0.07)))),
            const Positioned.fill(child: HeroScenery(showRider: false)),
            Padding(
              padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 8, 20, 20),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.fromLTRB(8, 5, 12, 5),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AnimatedBuilder(
                              animation: pulse,
                              builder: (_, _) => Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Color.lerp(const Color(0xFF4ADE80), Colors.white, reduced ? 0 : pulse.value),
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              tr('Incoming ride'),
                              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      _CountdownRing(remaining: remaining, fraction: fraction),
                    ],
                  ),
                  const SizedBox(height: 6),
                  SizedBox(
                    width: 120,
                    height: 120,
                    child: AnimatedBuilder(
                      animation: Listenable.merge([pulse, bounce]),
                      builder: (_, _) {
                        final bounceY = reduced ? 0.0 : -5 * Curves.easeOut.transform(bounce.value);
                        return Stack(
                          alignment: Alignment.center,
                          children: [
                            for (final phase in [0.0, 0.5])
                              Builder(
                                builder: (_) {
                                  final t = reduced ? 0.4 : (pulse.value + phase) % 1.0;
                                  return Opacity(
                                    opacity: (1 - t) * 0.55,
                                    child: Container(
                                      width: 78 + 42 * t,
                                      height: 78 + 42 * t,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        border: Border.all(color: Colors.white, width: 2),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            Transform.translate(
                              offset: Offset(0, bounceY),
                              child: Container(
                                width: 78,
                                height: 78,
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Colors.white,
                                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 16)],
                                ),
                                child: ClipOval(child: Image.asset('assets/images/logo.png', fit: BoxFit.cover)),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    tr('New Delivery'),
                    style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    tr('A fresh cup run is waiting for you!'),
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 14),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.confirmation_number_outlined, color: Colors.white, size: 15),
                        const SizedBox(width: 6),
                        Text(
                          Format.rideIdLabel(alert.rideCode, alert.jobId),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.3,
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

/// Small circular countdown (seconds left) for the header.
class _CountdownRing extends StatelessWidget {
  const _CountdownRing({required this.remaining, required this.fraction});
  final int remaining;
  final double fraction;

  @override
  Widget build(BuildContext context) {
    final urgent = remaining <= 10;
    return Semantics(
      label: tr('Auto dismisses in {remaining} seconds', {'remaining': remaining}),
      child: SizedBox(
        width: 46,
        height: 46,
        child: Stack(
          alignment: Alignment.center,
          children: [
            SizedBox.expand(
              child: TweenAnimationBuilder<double>(
                tween: Tween(end: fraction),
                duration: const Duration(milliseconds: 250),
                builder: (_, v, _) => CircularProgressIndicator(
                  value: v,
                  strokeWidth: 3.5,
                  color: urgent ? const Color(0xFFFBBF24) : Colors.white,
                  backgroundColor: Colors.white.withValues(alpha: 0.2),
                ),
              ),
            ),
            Text(
              '${remaining}s',
              style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    );
  }
}

class _EarningsCard extends StatelessWidget {
  const _EarningsCard({required this.fee});
  final int fee;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BcRadius.card),
        gradient: LinearGradient(
          // Theme blue like the header.
          colors: [c.brandDark, c.brand],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [BoxShadow(color: c.brand.withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -24,
            top: -30,
            child: Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.1)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.account_balance_wallet_rounded, color: Colors.white, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tr('Delivery Fee'),
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          Format.money(fee),
                          style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800),
                        ),
                      ),
                      Text(
                        tr('Including all bonuses'),
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.bolt_rounded, color: c.brandDark, size: 15),
                      const SizedBox(width: 3),
                      Text(
                        tr('Good earnings!'),
                        style: TextStyle(color: c.brandDark, fontSize: 11, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Distance / time / orders / cups as four compact tiles (only the known ones).
class _FactsRow extends StatelessWidget {
  const _FactsRow({required this.alert});
  final RideAlert alert;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final km = alert.estimatedDistanceKm;
    final min = alert.estimatedMinutes;
    final tiles = <Widget>[
      if (km != null)
        RunFactTile(icon: Icons.route_rounded, tint: c.brand, value: Format.km(km), label: tr('Distance')),
      if (min != null)
        RunFactTile(icon: Icons.schedule_rounded, tint: c.brand, value: Format.minutes(min), label: tr('ETA')),
      if (alert.orderCount > 0)
        RunFactTile(
          icon: Icons.shopping_bag_rounded,
          tint: c.brand,
          value: '${alert.orderCount}',
          label: tr('Orders'),
        ),
      if (alert.totalCups > 0)
        RunFactTile(icon: Icons.local_cafe_rounded, tint: c.brand, value: '${alert.totalCups}', label: tr('Cups')),
    ];
    if (tiles.isEmpty) return const SizedBox.shrink();
    return Row(
      children: [
        for (var i = 0; i < tiles.length; i++) ...[if (i > 0) const SizedBox(width: 8), Expanded(child: tiles[i])],
      ],
    );
  }
}

/// Mini route sketch + pickup → drop-off timeline (rows open Maps).
class _RouteCard extends StatelessWidget {
  const _RouteCard({required this.alert, required this.locked});
  final RideAlert alert;
  final bool locked;

  static Future<void> _openMaps(String query) async {
    final candidates = [
      Uri.parse('geo:0,0?q=${Uri.encodeComponent(query)}'),
      Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(query)}'),
    ];
    for (final uri in candidates) {
      try {
        if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final a = alert;
    final pickupQuery = [a.storeName, a.storeCity].where((s) => s.trim().isNotEmpty).join(', ');
    final dropQuery = [a.dropoffName, a.dropoffAddress].where((s) => s.trim().isNotEmpty).join(', ');
    final showDrop = a.dropoffName.trim().isNotEmpty || a.dropoffAddress.trim().isNotEmpty;
    final extra = a.extraStopCount > 0 ? trn(a.extraStopCount, '+{n} more stop', '+{n} more stops') : '';
    final dropSub = [a.dropoffAddress, extra].where((s) => s.isNotEmpty).join(' · ');
    final km = a.estimatedDistanceKm;
    return RunCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(height: 116, child: _SchematicRoute(distanceLabel: km == null ? null : Format.km(km))),
          ),
          if (pickupQuery.isNotEmpty || showDrop) ...[
            const SizedBox(height: 6),
            if (pickupQuery.isNotEmpty)
              _StopRow(
                color: c.brand,
                icon: Icons.storefront_rounded,
                label: tr('Pickup Location'),
                title: a.storeName.trim().isEmpty ? tr('Pickup') : a.storeName,
                subtitle: a.storeCity,
                connectBelow: showDrop,
                onTap: locked ? null : () => _openMaps(pickupQuery),
              ),
            // Over the lock screen anyone holding the phone can see this card, so the
            // customer's name and address only appear once the phone is unlocked.
            if (showDrop && locked)
              _StopRow(
                color: _dropRed,
                icon: Icons.lock_outline_rounded,
                label: tr('Drop-off Location'),
                title: tr('Customer details hidden'),
                subtitle: [tr('Unlock to see the drop-off'), extra].where((s) => s.isNotEmpty).join(' · '),
                connectAbove: pickupQuery.isNotEmpty,
                onTap: null,
              )
            else if (showDrop)
              _StopRow(
                color: _dropRed,
                icon: Icons.location_on_rounded,
                label: tr('Drop-off Location'),
                title: a.dropoffName.trim().isEmpty ? tr('Customer') : a.dropoffName,
                subtitle: dropSub,
                connectAbove: pickupQuery.isNotEmpty,
                onTap: () {
                  if (dropQuery.isNotEmpty) _openMaps(dropQuery);
                },
              ),
          ],
        ],
      ),
    );
  }
}

class _SchematicRoute extends StatelessWidget {
  const _SchematicRoute({required this.distanceLabel});
  final String? distanceLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      color: c.isDark ? const Color(0xFF162032) : const Color(0xFFEEF4FB),
      child: Stack(
        children: [
          Positioned.fill(child: CustomPaint(painter: _SchematicPainter(c.brand, c.isDark))),
          if (distanceLabel != null)
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: c.card,
                  borderRadius: BorderRadius.circular(99),
                  boxShadow: const [BoxShadow(color: Color(0x220A2647), blurRadius: 8, offset: Offset(0, 2))],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.route_rounded, size: 13, color: c.brand),
                    const SizedBox(width: 4),
                    Text(
                      distanceLabel!,
                      style: TextStyle(color: c.text, fontSize: 11.5, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SchematicPainter extends CustomPainter {
  _SchematicPainter(this.brand, this.dark);
  final Color brand;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    // Faint street grid.
    final grid = Paint()
      ..color = (dark ? Colors.white : const Color(0xFF94A3B8)).withValues(alpha: dark ? 0.05 : 0.18)
      ..strokeWidth = 1;
    for (var x = 0.0; x < w; x += 28) {
      canvas.drawLine(Offset(x, 0), Offset(x, h), grid);
    }
    for (var y = 0.0; y < h; y += 28) {
      canvas.drawLine(Offset(0, y), Offset(w, y), grid);
    }
    final pickup = Offset(w * 0.14, h * 0.74);
    final drop = Offset(w * 0.86, h * 0.28);
    final path = Path()
      ..moveTo(pickup.dx, pickup.dy)
      ..cubicTo(w * 0.38, h * 0.95, w * 0.55, h * 0.05, drop.dx, drop.dy);
    canvas.drawPath(
      path,
      Paint()
        ..color = brand.withValues(alpha: 0.2)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 12
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = brand
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5
        ..strokeCap = StrokeCap.round,
    );
    void pin(Offset p, Color col) {
      canvas.drawCircle(p, 13, Paint()..color = col.withValues(alpha: 0.2));
      canvas.drawCircle(p, 8.5, Paint()..color = col);
      canvas.drawCircle(p, 3.5, Paint()..color = Colors.white);
    }

    pin(pickup, brand);
    pin(drop, _dropRed);
    // Rider dot a little way along the route.
    final m = path.computeMetrics().first;
    final t = m.getTangentForOffset(m.length * 0.22);
    if (t != null) {
      canvas.drawCircle(t.position, 6, Paint()..color = Colors.white);
      canvas.drawCircle(t.position, 4, Paint()..color = const Color(0xFF16A34A));
    }
  }

  @override
  bool shouldRepaint(covariant _SchematicPainter old) => old.brand != brand || old.dark != dark;
}

class _StopRow extends StatelessWidget {
  const _StopRow({
    required this.color,
    required this.icon,
    required this.label,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.connectAbove = false,
    this.connectBelow = false,
  });

  final Color color;
  final IconData icon;
  final String label;
  final String title;
  final String subtitle;

  /// Opens the stop in Maps; null while locked (nothing to open, and no customer details).
  final VoidCallback? onTap;
  final bool connectAbove;
  final bool connectBelow;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 36,
              child: Column(
                children: [
                  Container(width: 2, height: 10, color: connectAbove ? c.border : Colors.transparent),
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.12)),
                    child: Icon(icon, color: color, size: 17),
                  ),
                  Expanded(child: Container(width: 2, color: connectBelow ? c.border : Colors.transparent)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(fontSize: 11, color: c.textMuted, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: c.text),
                    ),
                    if (subtitle.trim().isNotEmpty)
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: c.textMuted, height: 1.35),
                      ),
                  ],
                ),
              ),
            ),
            if (onTap != null) Center(child: Icon(Icons.chevron_right_rounded, color: c.textMuted)),
          ],
        ),
      ),
    );
  }
}

/// Accept (full width, timer fills behind the label) with a quiet Dismiss underneath —
/// stacked so neither button can be squeezed or overflow on narrow phones.
class _Footer extends StatelessWidget {
  const _Footer({
    required this.remaining,
    required this.fraction,
    required this.accepting,
    required this.onAccept,
    required this.onDismiss,
  });

  final int remaining;
  final double fraction;
  final bool accepting;
  final VoidCallback onAccept;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final radius = BorderRadius.circular(BcRadius.button + 4);
    return Container(
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: c.isDark ? const Color(0x55000000) : const Color(0x1F0A2647),
            blurRadius: 24,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      padding: EdgeInsets.fromLTRB(16, 16, 16, 8 + MediaQuery.paddingOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 58,
            decoration: BoxDecoration(
              borderRadius: radius,
              gradient: LinearGradient(colors: [c.brand, c.brandDark]),
              boxShadow: [
                BoxShadow(color: c.brand.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6)),
              ],
            ),
            child: Material(
              type: MaterialType.transparency,
              borderRadius: radius,
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: accepting ? null : onAccept,
                child: Stack(
                  children: [
                    // Time left drains from right to left behind the label.
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: AnimatedFractionallySizedBox(
                          duration: const Duration(milliseconds: 250),
                          widthFactor: accepting ? 1 : fraction.clamp(0.0, 1.0),
                          heightFactor: 1,
                          child: ColoredBox(color: Colors.white.withValues(alpha: 0.16)),
                        ),
                      ),
                    ),
                    Center(
                      child: accepting
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2.6, color: Colors.white),
                            )
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.check_circle_rounded, color: Colors.white, size: 22),
                                const SizedBox(width: 10),
                                Text(
                                  tr('Accept Ride'),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.22),
                                    borderRadius: BorderRadius.circular(99),
                                  ),
                                  child: Text(
                                    '${remaining}s',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w800,
                                    ),
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
          const SizedBox(height: 4),
          TextButton.icon(
            onPressed: accepting ? null : onDismiss,
            style: TextButton.styleFrom(foregroundColor: c.textMuted, minimumSize: const Size.fromHeight(44)),
            icon: const Icon(Icons.close_rounded, size: 18),
            label: Text(
              tr('Dismiss · auto in {remaining}s', {'remaining': remaining}),
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-screen takeover when a stop on the active ride is cancelled — port of OrderCancelledOverlay.kt.
class OrderCancelledView extends StatelessWidget {
  const OrderCancelledView({super.key, required this.label, required this.onAcknowledge});
  final String label;
  final VoidCallback onAcknowledge;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    const radius = BorderRadius.vertical(bottom: Radius.circular(32));
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Material(
        color: c.background,
        child: Column(
          children: [
            Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                borderRadius: radius,
                gradient: LinearGradient(
                  colors: [Color(0xFFBE123C), Color(0xFFE11D48), Color(0xFFF43F5E)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [BoxShadow(color: Color(0x40E11D48), blurRadius: 20, offset: Offset(0, 8))],
              ),
              child: ClipRRect(
                borderRadius: radius,
                child: CustomPaint(
                  painter: HeroSwooshPainter(Colors.white.withValues(alpha: 0.08)),
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(24, MediaQuery.paddingOf(context).top + 32, 24, 32),
                    child: Column(
                      children: [
                        Container(
                          width: 96,
                          height: 96,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white.withValues(alpha: 0.14),
                          ),
                          alignment: Alignment.center,
                          child: Container(
                            width: 72,
                            height: 72,
                            decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                            child: const Icon(Icons.cancel_rounded, color: _dropRed, size: 44),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          tr('ORDER CANCELLED'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          label,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
                children: [
                  RunCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        RunCardHeader(
                          icon: Icons.do_not_disturb_on_rounded,
                          tint: _dropRed,
                          bg: _dropRed.withValues(alpha: 0.12),
                          title: tr('Skip this stop'),
                          subtitle: tr('Skip this stop. Do not deliver it — it has been marked Cancelled on your run.'),
                        ),
                        const SizedBox(height: 14),
                        RunNote(icon: Icons.route_rounded, text: tr('Continue with any remaining stops on this ride.')),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 16 + MediaQuery.paddingOf(context).bottom),
              child: RunPrimaryButton(
                label: tr('Got it — skip this stop'),
                icon: Icons.check_rounded,
                onPressed: onAcknowledge,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
