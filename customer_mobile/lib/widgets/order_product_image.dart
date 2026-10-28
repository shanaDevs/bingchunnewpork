import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';
import 'product_radial_image.dart';

/// Thumbnail for order list / receipt — radial glow matches menu product cards.
class OrderProductImage extends StatelessWidget {
  final String? imageUrl;
  final bool useDemoShoe;
  final double size;

  const OrderProductImage({
    super.key,
    this.imageUrl,
    this.useDemoShoe = false,
    this.size = 72,
  });

  static const demoShoeAsset = 'assets/orders/demo-shoe.png';

  @override
  Widget build(BuildContext context) {
    return ProductRadialImage(
      imageUrl: useDemoShoe ? null : imageUrl,
      assetPath: useDemoShoe ? demoShoeAsset : null,
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.08),
      placeholderColor: BcColors.brandLight.withValues(alpha: 0.55),
    );
  }
}
