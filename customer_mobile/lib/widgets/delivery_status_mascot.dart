import 'package:flutter/material.dart';
import '../config/mascot_images.dart';
import '../theme/bc_theme.dart';

/// Animated mascot that reflects delivery order status.
class DeliveryStatusMascot extends StatefulWidget {
  final String status;
  final double size;

  const DeliveryStatusMascot({
    super.key,
    required this.status,
    this.size = 120,
  });

  static String mascotAssetForStatus(String status) {
    switch (status) {
      case 'RECEIVED':
        return MascotImages.welcome;
      case 'PREPARING':
        return MascotImages.thinking;
      case 'READY':
        return MascotImages.orderConfirmed;
      case 'OUT_FOR_DELIVERY':
        return MascotImages.delivery;
      case 'DELIVERED':
        return MascotImages.orderConfirmed;
      default:
        return MascotImages.loading;
    }
  }

  @override
  State<DeliveryStatusMascot> createState() => _DeliveryStatusMascotState();
}

class _DeliveryStatusMascotState extends State<DeliveryStatusMascot>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _bounce;
  late Animation<double> _wiggle;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);

    _bounce = Tween<double>(begin: 0.0, end: -10.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    _wiggle = Tween<double>(begin: -0.04, end: 0.04).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final assetPath = DeliveryStatusMascot.mascotAssetForStatus(widget.status);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, _bounce.value),
          child: Transform.rotate(
            angle: _wiggle.value,
            child: child,
          ),
        );
      },
      child: Image.asset(
        assetPath,
        width: widget.size,
        height: widget.size,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => Icon(
          Icons.delivery_dining,
          size: widget.size * 0.6,
          color: BcColors.brandLight,
        ),
      ),
    );
  }
}
