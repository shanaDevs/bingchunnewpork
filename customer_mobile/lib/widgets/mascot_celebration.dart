import 'package:flutter/material.dart';

class MascotCelebration extends StatefulWidget {
  final double size;
  const MascotCelebration({super.key, this.size = 180});

  @override
  State<MascotCelebration> createState() => _MascotCelebrationState();
}

class _MascotCelebrationState extends State<MascotCelebration> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _rotationAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));
    
    // Spring-like bounce
    _scaleAnimation = TweenSequence([
      TweenSequenceItem(tween: Tween<double>(begin: 0.0, end: 1.2).chain(CurveTween(curve: Curves.easeOutCubic)), weight: 30),
      TweenSequenceItem(tween: Tween<double>(begin: 1.2, end: 0.9).chain(CurveTween(curve: Curves.easeInOut)), weight: 20),
      TweenSequenceItem(tween: Tween<double>(begin: 0.9, end: 1.05).chain(CurveTween(curve: Curves.easeInOut)), weight: 20),
      TweenSequenceItem(tween: Tween<double>(begin: 1.05, end: 1.0).chain(CurveTween(curve: Curves.easeInOut)), weight: 30),
    ]).animate(_controller);

    // Slight wiggle
    _rotationAnimation = TweenSequence([
      TweenSequenceItem(tween: Tween<double>(begin: -0.2, end: 0.1).chain(CurveTween(curve: Curves.easeInOut)), weight: 40),
      TweenSequenceItem(tween: Tween<double>(begin: 0.1, end: -0.05).chain(CurveTween(curve: Curves.easeInOut)), weight: 30),
      TweenSequenceItem(tween: Tween<double>(begin: -0.05, end: 0.0).chain(CurveTween(curve: Curves.easeInOut)), weight: 30),
    ]).animate(_controller);

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
        return Transform.scale(
          scale: _scaleAnimation.value,
          child: Transform.rotate(
            angle: _rotationAnimation.value,
            child: Image.asset(
              'assets/brand/logo.png', // The mascot image
              width: widget.size,
              height: widget.size,
              fit: BoxFit.contain,
            ),
          ),
        );
      },
    );
  }
}
