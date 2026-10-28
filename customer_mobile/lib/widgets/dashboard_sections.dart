import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models/order.dart';
import '../models/product.dart';
import '../models/promo_offer.dart';
import '../theme/bc_theme.dart';
import 'order_qr_code.dart';
import 'pickup_qr_modal.dart';
import 'product_add_sheet.dart';
import 'promo_offer_card.dart';
import 'product_radial_image.dart';
import 'wishlist_heart_button.dart';

final _pointsFormatter = NumberFormat('#,###');

String loyaltyTierLabel(int points) {
  if (points >= 2500) return 'Gold Member';
  if (points >= 1000) return 'Silver Member';
  return 'Member';
}

IconData loyaltyTierIcon(String tier) {
  switch (tier) {
    case 'Gold Member':
      return Icons.workspace_premium_rounded;
    case 'Silver Member':
      return Icons.military_tech_rounded;
    default:
      return Icons.badge_outlined;
  }
}

Color loyaltyTierColor(String tier, BcAdaptive bc) {
  switch (tier) {
    case 'Gold Member':
      return const Color(0xFFEAB308);
    case 'Silver Member':
      return const Color(0xFF94A3B8);
    default:
      return bc.mutedText;
  }
}

/// Points + QR two-column row on the home dashboard.
class DashboardStatsRow extends StatelessWidget {
  final int loyaltyPoints;
  final Order? activePickupOrder;

  const DashboardStatsRow({
    super.key,
    required this.loyaltyPoints,
    this.activePickupOrder,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final tier = loyaltyTierLabel(loyaltyPoints);
    final tierColor = loyaltyTierColor(tier, bc);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          flex: 3,
          child: GestureDetector(
            onTap: () => context.go('/profile'),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: bc.cardBg,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: bc.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.redeem_rounded,
                        size: 12,
                        color: BcColors.brandLight,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'YOUR POINTS',
                        style: TextStyle(
                          color: BcColors.brandLight,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.1,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.star_rounded,
                        size: 20,
                        color: BcColors.accent,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: RichText(
                          text: TextSpan(
                            style: TextStyle(
                              color: onSurface,
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              height: 1.1,
                            ),
                            children: [
                              TextSpan(
                                text: '${_pointsFormatter.format(loyaltyPoints)} ',
                                style: const TextStyle(color: BcColors.brandLight),
                              ),
                              const TextSpan(
                                text: 'Points',
                                style: TextStyle(fontSize: 18),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  Row(
                    children: [
                      Icon(
                        loyaltyTierIcon(tier),
                        size: 14,
                        color: tierColor,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        tier,
                        style: TextStyle(
                          color: tierColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          flex: 2,
          child: _DashboardQrTile(order: activePickupOrder),
        ),
      ],
    );
  }
}

class _DashboardQrTile extends StatelessWidget {
  final Order? order;

  const _DashboardQrTile({this.order});

  @override
  Widget build(BuildContext context) {
    final hasPickupQr = order != null &&
        order!.orderMode == 'TAKEAWAY' &&
        order!.qrCode != null &&
        order!.isActive;

    return GestureDetector(
      onTap: hasPickupQr
          ? () => PickupQrModal.show(context, order!)
          : () => context.go('/orders'),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Center(
          child: hasPickupQr
              ? OrderQrCode(
                  qrCodeBase64: order!.qrCode,
                  orderNumber: order!.orderNumber,
                  size: 88,
                )
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.qr_code_2_rounded,
                      size: 64,
                      color: Colors.grey.shade800,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Scan at store',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Home promo — fixed card chrome; product photo swaps per [offer] / [featuredProduct].
class DashboardPromoBanner extends StatelessWidget {
  final Product? featuredProduct;
  final PromoOffer offer;

  const DashboardPromoBanner({
    super.key,
    this.featuredProduct,
    this.offer = PromoOffer.brownSugarSeries,
  });

  @override
  Widget build(BuildContext context) {
    final product = featuredProduct;
    return PromoOfferCard(
      discountText: offer.discountText,
      title: offer.title,
      subtitle: offer.subtitle,
      productImageUrl: product?.imageUrl,
      onOrderTap: product != null
          ? () => context.push('/product/${product.id}')
          : null,
    );
  }
}

/// Popular picks section header + product grid.
class DashboardPopularPicks extends StatelessWidget {
  final List<Product> products;
  final bool isLoading;

  const DashboardPopularPicks({
    super.key,
    required this.products,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Popular Picks',
              style: TextStyle(
                color: onSurface,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            GestureDetector(
              onTap: () => context.go('/menu'),
              child: const Text(
                'View All',
                style: TextStyle(
                  color: BcColors.brand,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (isLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(
              child: CircularProgressIndicator(color: BcColors.brand, strokeWidth: 2),
            ),
          )
        else if (products.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'No popular items right now. Browse the menu!',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.bc.mutedText, fontSize: 13),
            ),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.78,
            ),
            itemCount: products.length > 4 ? 4 : products.length,
            itemBuilder: (context, index) {
              return DashboardPopularProductCard(product: products[index]);
            },
          ),
      ],
    );
  }
}

class DashboardPopularProductCard extends StatelessWidget {
  final Product product;

  const DashboardPopularProductCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Container(
      decoration: BoxDecoration(
        color: bc.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: bc.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  ProductRadialImage(
                    imageUrl: product.imageUrl,
                    expand: true,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  if ((product.tag ?? '').trim().isNotEmpty)
                    Positioned(
                      left: 0,
                      top: 0,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: BcColors.brand,
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(12),
                            bottomRight: Radius.circular(10),
                          ),
                        ),
                        child: Text(
                          product.tag!.trim().toUpperCase(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                    ),
                  Positioned(
                    right: 4,
                    top: 4,
                    child: WishlistHeartButton(productId: product.id),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: onSurface,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'LKR ${product.basePrice}',
                        style: const TextStyle(
                          color: BcColors.brandLight,
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                Material(
                  color: BcColors.brand,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: product.isAvailable
                        ? () => showProductAddSheet(context, product)
                        : null,
                    child: const SizedBox(
                      width: 32,
                      height: 32,
                      child: Icon(Icons.add, color: Colors.white, size: 20),
                    ),
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

/// Compact active-order strip shown above stats when an order is in progress.
class DashboardActiveOrderStrip extends StatelessWidget {
  final Order order;
  final VoidCallback onTap;

  const DashboardActiveOrderStrip({
    super.key,
    required this.order,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final isPickup = order.orderMode == 'TAKEAWAY';

    return Material(
      color: bc.cardBg,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: BcColors.brand.withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: BcColors.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  isPickup ? Icons.storefront_outlined : Icons.delivery_dining_outlined,
                  color: BcColors.brand,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isPickup ? 'Pickup in progress' : 'Delivery on the way',
                      style: TextStyle(
                        color: onSurface,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '#${order.orderNumber} · ${order.statusDisplay}',
                      style: TextStyle(color: bc.mutedText, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: bc.mutedText),
            ],
          ),
        ),
      ),
    );
  }
}
