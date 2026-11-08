import 'dart:async';
import 'dart:ui' show FontFeature, ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/alert_service.dart';
import '../../core/format.dart';
import '../../core/ride_alert.dart';
import '../components/run_kit.dart';
import '../components/scenery.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Incoming delivery request: a centred card pop-up over the dimmed, blurred app
/// (QuickDrop job-offer alert). Auto-dismisses after the ring window.
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
  // Fresh offset per alert: without this, PageStorage restores the previous alert's scroll.
  final _scroll = ScrollController(keepScrollOffset: false);
  late final AnimationController _enter = AnimationController(vsync: this, duration: const Duration(milliseconds: 320))
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
    _enter.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final a = widget.alert;
    final reduced = MediaQuery.of(context).disableAnimations;
    final fade = CurvedAnimation(parent: _enter, curve: Curves.easeOutCubic);
    final pad = MediaQuery.paddingOf(context);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Material(
        type: MaterialType.transparency,
        child: Stack(
          children: [
            // The app behind: blurred, then dimmed. Taps on it do nothing.
            Positioned.fill(
              child: FadeTransition(
                opacity: fade,
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
                  child: ColoredBox(color: c.scrim.withValues(alpha: 0.5)),
                ),
              ),
            ),
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.fromLTRB(18, pad.top + 20, 18, pad.bottom + 20),
                child: Center(
                  child: FadeTransition(
                    opacity: fade,
                    child: ScaleTransition(
                      scale: Tween(begin: 0.94, end: 1.0).animate(fade),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 400),
                        child: AnimatedBuilder(
                          animation: _pulse,
                          builder: (_, child) {
                            final glow = reduced ? 0.0 : (1 - (_pulse.value - 0.5).abs() * 2);
                            return Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(28),
                                boxShadow: [
                                  BoxShadow(
                                    color: c.scrim.withValues(alpha: c.isDark ? 0.6 : 0.3),
                                    blurRadius: 48,
                                    offset: const Offset(0, 20),
                                  ),
                                  BoxShadow(
                                    color: c.online.withValues(alpha: 0.12 + 0.18 * glow),
                                    blurRadius: 24 + 16 * glow,
                                  ),
                                ],
                              ),
                              child: child,
                            );
                          },
                          child: _Card(
                            alert: a,
                            locked: widget.locked,
                            remaining: _remaining,
                            accepting: widget.accepting,
                            error: widget.error,
                            onAccept: widget.onAccept,
                            onDismiss: widget.onDismiss,
                            scroll: _scroll,
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
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.alert,
    required this.locked,
    required this.remaining,
    required this.accepting,
    required this.error,
    required this.onAccept,
    required this.onDismiss,
    required this.scroll,
  });

  final RideAlert alert;
  final bool locked;
  final int remaining;
  final bool accepting;
  final String? error;
  final VoidCallback onAccept;
  final VoidCallback onDismiss;
  final ScrollController scroll;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final a = alert;
    final km = a.estimatedDistanceKm;
    final min = a.estimatedMinutes;
    final stats = <(String, String)>[
      if (km != null) (Format.km(km), tr('Distance')),
      if (min != null) (Format.minutes(min), tr('Estimated time')),
      if (a.orderCount > 0) ('${a.orderCount}', tr('Orders')),
    ];
    final extra = a.extraStopCount > 0 ? trn(a.extraStopCount, '+{n} more stop', '+{n} more stops') : '';
    // Over the lock screen anyone holding the phone can see this card, so the
    // customer's details only appear once the phone is unlocked.
    final dropArea = locked
        ? tr('Customer details hidden')
        : (a.dropoffAddress.trim().isNotEmpty ? a.dropoffAddress : a.dropoffName).trim();
    final dropLine = [dropArea, extra].where((s) => s.isNotEmpty).join(' · ');
    final showDrop = locked ? (a.dropoffName.trim().isNotEmpty || a.dropoffAddress.trim().isNotEmpty) : dropLine.isNotEmpty;
    final branch = a.storeName.trim().isEmpty ? tr('Pickup') : a.storeName;
    return Container(
      decoration: BoxDecoration(
        color: c.elevated,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Title band: the brand gradient, white text.
          Container(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: c.brandDeepGradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    tr('NEW DELIVERY REQUEST'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.0,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  Format.rideIdLabel(a.rideCode, a.jobId),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Where it starts.
                  Row(
                    children: [
                      _IconTile(icon: Icons.storefront_rounded, size: 56),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              branch,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: c.foreground, fontSize: 22, fontWeight: FontWeight.w800, height: 1.15),
                            ),
                            if (a.storeCity.trim().isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                a.storeCity,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: c.mutedForeground, fontSize: 14),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (a.deliveryFee > 0) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                      decoration: BoxDecoration(
                        color: c.successSoft,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: c.success.withValues(alpha: 0.35), width: 1.5),
                      ),
                      child: Column(
                        children: [
                          Text(
                            tr("YOU'LL EARN"),
                            style: TextStyle(
                              color: c.mutedForeground,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.0,
                            ),
                          ),
                          const SizedBox(height: 2),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              Format.money(a.deliveryFee),
                              maxLines: 1,
                              style: TextStyle(color: c.success, fontSize: 40, fontWeight: FontWeight.w800, height: 1.1),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (stats.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(color: c.highlight, borderRadius: BorderRadius.circular(16)),
                      child: IntrinsicHeight(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            for (var i = 0; i < stats.length; i++) ...[
                              if (i > 0) VerticalDivider(width: 1, thickness: 1, color: c.primary.withValues(alpha: 0.2)),
                              Expanded(child: _Stat(value: stats[i].$1, label: stats[i].$2)),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                  if (showDrop) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        _IconTile(icon: locked ? Icons.lock_outline_rounded : Icons.location_on_rounded, size: 44),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                tr('DROP-OFFS'),
                                style: TextStyle(
                                  color: c.mutedForeground,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 1.0,
                                ),
                              ),
                              Text(
                                dropLine,
                                style: TextStyle(color: c.foreground, fontSize: 15, fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SlideToAccept(remaining: remaining, accepting: accepting, onAccept: onAccept),
                if (error != null) ...[
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.error_outline_rounded, size: 16, color: c.errorStrong),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(error!, style: TextStyle(color: c.errorStrong, fontSize: 13, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 4),
                Center(
                  child: TextButton.icon(
                    onPressed: accepting ? null : onDismiss,
                    style: TextButton.styleFrom(foregroundColor: c.error, minimumSize: const Size(0, 44)),
                    icon: const Icon(Icons.close_rounded, size: 18),
                    label: Text(tr('Decline'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
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

/// A brand-blue icon on a soft blue rounded tile.
class _IconTile extends StatelessWidget {
  const _IconTile({required this.icon, required this.size});
  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(16)),
      child: Icon(icon, color: c.primaryStrong, size: size >= 56 ? 28 : 22),
    );
  }
}

/// One third of the stats panel: a big value over its small label.
class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              maxLines: 1,
              style: TextStyle(color: c.highlightForeground, fontSize: 18, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label.toUpperCase(),
            textAlign: TextAlign.center,
            style: TextStyle(color: c.mutedForeground, fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// QuickDrop slide-to-accept: online-yellow track, draggable knob, time left as a pill on the right.
class _SlideToAccept extends StatefulWidget {
  const _SlideToAccept({required this.remaining, required this.accepting, required this.onAccept});

  final int remaining;
  final bool accepting;
  final VoidCallback onAccept;

  @override
  State<_SlideToAccept> createState() => _SlideToAcceptState();
}

class _SlideToAcceptState extends State<_SlideToAccept> {
  static const _height = 64.0;
  static const _knob = 56.0;
  double _drag = 0;
  bool _dragging = false;

  void _finish(double maxDrag) {
    final done = _drag >= maxDrag * 0.85;
    setState(() {
      _dragging = false;
      _drag = done ? maxDrag : 0;
    });
    if (done) {
      HapticFeedback.mediumImpact();
      widget.onAccept();
    }
  }

  @override
  void didUpdateWidget(_SlideToAccept old) {
    super.didUpdateWidget(old);
    if (old.accepting && !widget.accepting) _drag = 0;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final fg = c.onlineForeground;
    return Semantics(
      button: true,
      label: tr('Slide to accept'),
      hint: tr('Auto dismisses in {remaining} seconds', {'remaining': widget.remaining}),
      onTap: widget.accepting ? null : widget.onAccept,
      child: LayoutBuilder(
        builder: (context, box) {
          final maxDrag = (box.maxWidth - _knob - 8).clamp(1.0, 1000.0);
          final pos = widget.accepting ? maxDrag : _drag.clamp(0.0, maxDrag);
          return Container(
            height: _height,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(BcRadius.full), color: c.online),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              alignment: Alignment.centerLeft,
              children: [
                Center(
                  child: Padding(
                    padding: const EdgeInsets.only(left: _knob + 4, right: 76),
                    child: Text(
                      tr('Slide to accept'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: fg, fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                Positioned(
                  right: 10,
                  child: Container(
                    height: 36,
                    constraints: const BoxConstraints(minWidth: 48),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: c.errorSoftBg,
                      borderRadius: BorderRadius.circular(99),
                      border: Border.all(color: c.error.withValues(alpha: 0.45)),
                    ),
                    child: Text(
                      '${widget.remaining}s',
                      style: TextStyle(
                        color: c.errorStrong,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ),
                AnimatedPositioned(
                  duration: _dragging ? Duration.zero : BcMotion.standard,
                  curve: Curves.easeOut,
                  left: 4 + pos,
                  child: GestureDetector(
                    onHorizontalDragStart: widget.accepting ? null : (_) => setState(() => _dragging = true),
                    onHorizontalDragUpdate: widget.accepting
                        ? null
                        : (d) => setState(() => _drag = (_drag + d.delta.dx).clamp(0.0, maxDrag)),
                    onHorizontalDragEnd: widget.accepting ? null : (_) => _finish(maxDrag),
                    child: Container(
                      width: _knob,
                      height: _knob,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: c.onlineKnob),
                      child: widget.accepting
                          ? Padding(
                              padding: const EdgeInsets.all(16),
                              child: CircularProgressIndicator(strokeWidth: 2.6, color: fg),
                            )
                          : Icon(Icons.keyboard_double_arrow_right_rounded, color: fg, size: 28),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
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
              decoration: BoxDecoration(
                borderRadius: radius,
                color: c.errorStrong,
                boxShadow: bcShadow(c),
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
                            child: Icon(Icons.cancel_rounded, color: c.error, size: 44),
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
                          tint: c.errorStrong,
                          bg: c.errorSoftBg,
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
