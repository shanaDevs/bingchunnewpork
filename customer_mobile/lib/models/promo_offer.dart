import '../models/product.dart';

/// Static promo copy — card chrome stays the same; swap [productImageUrl] per offer.
class PromoOffer {
  final String discountText;
  final String title;
  final String subtitle;
  /// Used to pick a product image from the menu when no [product] is passed.
  final String productNameContains;

  const PromoOffer({
    required this.discountText,
    required this.title,
    required this.subtitle,
    required this.productNameContains,
  });

  /// Default featured offer on the home dashboard.
  static const brownSugarSeries = PromoOffer(
    discountText: '20% OFF',
    title: 'On Brown Sugar Series',
    subtitle: 'Limited time offer',
    productNameContains: 'Brown Sugar',
  );

  /// Resolve menu product for the hero image.
  static Product? resolveProduct(List<Product> products, PromoOffer offer) {
    if (products.isEmpty) return null;
    final needle = offer.productNameContains.toLowerCase();
    for (final p in products) {
      if (p.name.toLowerCase().contains(needle)) return p;
    }
    return products.first;
  }
}
