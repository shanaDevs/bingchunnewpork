import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/cart_provider.dart';
import '../theme/bc_theme.dart';
import 'cup_icon.dart';

/// Floating "View Your Cup" bar — matches web FloatingCart.
class FloatingCupBar extends ConsumerWidget {
  const FloatingCupBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final count = cart.items.fold<int>(0, (sum, i) => sum + i.quantity);
    if (count == 0) return const SizedBox.shrink();

    return Positioned(
      left: 16,
      right: 16,
      bottom: 16,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => context.push('/cart'),
          borderRadius: BorderRadius.circular(999),
          child: Ink(
            decoration: BoxDecoration(
              gradient: BcTheme.brandGradient,
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: BcColors.brand.withValues(alpha: 0.4),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Row(
              children: [
                CupIcon.fromCount(itemCount: count, size: CupIconSize.md, inverted: true),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'View Your Cup',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ),
                Text(
                  'LKR ${cart.subtotal}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
