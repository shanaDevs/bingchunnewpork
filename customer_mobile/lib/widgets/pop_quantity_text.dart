import 'package:flutter/material.dart';
import '../theme/bc_theme.dart';

class PopQuantityText extends StatefulWidget {
  final int quantity;
  final double fontSize;
  final Color color;

  const PopQuantityText({
    super.key,
    required this.quantity,
    this.fontSize = 14.0,
    this.color = BcColors.text,
  });

  @override
  State<PopQuantityText> createState() => _PopQuantityTextState();
}

class _PopQuantityTextState extends State<PopQuantityText> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 200),
    );
    
    // Popup spring bounce animation
    _scaleAnimation = TweenSequence<double>([
      TweenSequenceItem(tween: Tween<double>(begin: 1.0, end: 1.35).chain(CurveTween(curve: Curves.easeOut)), weight: 40),
      TweenSequenceItem(tween: Tween<double>(begin: 1.35, end: 0.95).chain(CurveTween(curve: Curves.easeIn)), weight: 30),
      TweenSequenceItem(tween: Tween<double>(begin: 0.95, end: 1.0).chain(CurveTween(curve: Curves.easeOut)), weight: 30),
    ]).animate(_controller);
  }

  @override
  void didUpdateWidget(covariant PopQuantityText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.quantity != widget.quantity) {
      _controller.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scaleAnimation,
      child: Text(
        '${widget.quantity}',
        style: TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: widget.fontSize,
          color: widget.color,
          fontFamily: 'Poppins',
        ),
      ),
    );
  }
}
