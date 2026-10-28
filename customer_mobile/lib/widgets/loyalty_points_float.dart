import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/loyalty_float_provider.dart';

/// Animated gift that flies from cup to Rewards nav (web `LoyaltyPointsFloat`).
/// Shows only the points delta — no secondary description.
class LoyaltyPointsFloatOverlay extends ConsumerWidget {
  const LoyaltyPointsFloatOverlay({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final particles = ref.watch(loyaltyFloatProvider.select((s) => s.particles));
    if (particles.isEmpty) return const SizedBox.shrink();

    return IgnorePointer(
      child: LayoutBuilder(
        builder: (context, _) {
          final stackBox = context.findRenderObject() as RenderBox?;
          return Stack(
            clipBehavior: Clip.none,
            children: [
              for (final p in particles)
                _FloatingGift(particle: p, stackBox: stackBox),
            ],
          );
        },
      ),
    );
  }
}

class _FloatingGift extends StatefulWidget {
  final LoyaltyFloatParticle particle;
  final RenderBox? stackBox;

  const _FloatingGift({required this.particle, required this.stackBox});

  @override
  State<_FloatingGift> createState() => _FloatingGiftState();
}

class _FloatingGiftState extends State<_FloatingGift>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _t;
  late final Animation<double> _opacity;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: LoyaltyFloatNotifier.floatDuration,
    );
    _t = CurvedAnimation(parent: _ctrl, curve: const Cubic(0.33, 0, 0.2, 1));
    _opacity = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0, end: 0.85), weight: 12),
      TweenSequenceItem(tween: Tween(begin: 0.85, end: 1), weight: 18),
      TweenSequenceItem(tween: ConstantTween(1), weight: 40),
      TweenSequenceItem(tween: Tween(begin: 1, end: 0.85), weight: 15),
      TweenSequenceItem(tween: Tween(begin: 0.85, end: 0), weight: 15),
    ]).animate(_t);
    _scale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.45, end: 0.95), weight: 15),
      TweenSequenceItem(tween: Tween(begin: 0.95, end: 1.05), weight: 15),
      TweenSequenceItem(tween: Tween(begin: 1.05, end: 1), weight: 25),
      TweenSequenceItem(tween: Tween(begin: 1, end: 0.98), weight: 25),
      TweenSequenceItem(tween: Tween(begin: 0.98, end: 0.8), weight: 20),
    ]).animate(_t);
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  String _pointsLabel() {
    final p = widget.particle;
    if (p.pointsDelta != 0) {
      return '${p.pointsDelta > 0 ? '+' : ''}${p.pointsDelta}';
    }
    if (p.pointsEarned > 0) return '${p.pointsEarned}';
    return p.isAdd ? '+0' : '−0';
  }

  Offset _toLocal(Offset global) {
    final box = widget.stackBox;
    if (box == null || !box.hasSize || !box.attached) return global;
    return box.globalToLocal(global);
  }

  @override
  Widget build(BuildContext context) {
    final isAdd = widget.particle.isAdd;
    final label = _pointsLabel();

    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final pos = _toLocal(Offset.lerp(widget.particle.from, widget.particle.to, _t.value)!);
        return Positioned(
          left: pos.dx - 28,
          top: pos.dy - 28,
          child: Opacity(
            opacity: _opacity.value.clamp(0.0, 1.0),
            child: Transform.scale(
              scale: _scale.value,
              child: Container(
                width: 56,
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: isAdd
                        ? const [Color(0xFFF59E0B), Color(0xFFEA580C)]
                        : const [Color(0xFF94A3B8), Color(0xFF64748B)],
                  ),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.85),
                    width: 3,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: (isAdd
                              ? const Color(0xFFEA580C)
                              : const Color(0xFF64748B))
                          .withValues(alpha: 0.4),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    height: 1,
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
