import 'package:flutter/material.dart';
import 'cup_icon.dart';

class PouringCup extends StatefulWidget {
  final double size;
  const PouringCup({super.key, this.size = 120});

  @override
  State<PouringCup> createState() => _PouringCupState();
}

class _PouringCupState extends State<PouringCup> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fillAnimation;
  late Animation<double> _splashRadiusAnimation;
  late Animation<double> _splashOpacityAnimation;

  @override
  void initState() {
    super.initState();
    // 1500ms duration matching the audio
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500));
    _fillAnimation = CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.6, curve: Curves.easeInOut));
    _splashRadiusAnimation = Tween<double>(begin: 4, end: 20).animate(
        CurvedAnimation(parent: _controller, curve: const Interval(0.2, 0.8, curve: Curves.easeOut)));
    _splashOpacityAnimation = TweenSequence([
      TweenSequenceItem(tween: Tween<double>(begin: 0, end: 0.8), weight: 50),
      TweenSequenceItem(tween: Tween<double>(begin: 0.8, end: 0), weight: 50),
    ]).animate(CurvedAnimation(parent: _controller, curve: const Interval(0.2, 0.8)));

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return CustomPaint(
          size: Size(widget.size, widget.size * (78 / 64)),
          painter: BubbleTeaCupPainter(
            fillLevel: _fillAnimation.value,
            showLabel: true,
            splashRadius: _splashRadiusAnimation.value,
            splashOpacity: _splashOpacityAnimation.value,
          ),
        );
      },
    );
  }
}

