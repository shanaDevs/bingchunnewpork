import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../providers/wishlist_provider.dart';
import '../utils/app_toast.dart';

/// Heart toggle for product cards — syncs with /wishlist API.
class WishlistHeartButton extends ConsumerWidget {
  final String productId;
  final double iconSize;
  final double padding;
  final bool compact;

  const WishlistHeartButton({
    super.key,
    required this.productId,
    this.iconSize = 14,
    this.padding = 4,
    this.compact = true,
  });

  Future<void> _handleTap(BuildContext context, WidgetRef ref) async {
    final auth = ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      showAppToast(context, 'Sign in to save favourites.', isError: false);
      context.go('/login');
      return;
    }

    final wasWishlisted = ref.read(wishlistProvider).contains(productId);
    try {
      final ok = await ref.read(wishlistProvider.notifier).toggle(productId);
      if (!ok || !context.mounted) return;
      showAppToast(
        context,
        wasWishlisted ? 'Removed from wishlist' : 'Saved to wishlist',
        isError: false,
      );
    } catch (_) {
      if (!context.mounted) return;
      showAppToast(context, 'Could not update wishlist. Try again.', isError: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wishlisted = ref.watch(wishlistProvider.select((s) => s.contains(productId)));

    return GestureDetector(
      onTap: () => _handleTap(context, ref),
      behavior: HitTestBehavior.opaque,
      child: Material(
        color: Colors.white.withValues(alpha: 0.96),
        shape: const CircleBorder(),
        elevation: compact ? 1 : 2,
        shadowColor: Colors.black.withValues(alpha: 0.12),
        child: Padding(
          padding: EdgeInsets.all(padding),
          child: Icon(
            wishlisted ? Icons.favorite_rounded : Icons.favorite_border_rounded,
            size: iconSize,
            color: wishlisted ? const Color(0xFFEF4444) : const Color(0xFF64748B),
          ),
        ),
      ),
    );
  }
}

/// Heart pinned to a product image corner.
class WishlistHeartOverlay extends StatelessWidget {
  final String productId;

  const WishlistHeartOverlay({
    super.key,
    required this.productId,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned(
      right: 6,
      top: 6,
      child: WishlistHeartButton(productId: productId, iconSize: 16, padding: 6),
    );
  }
}

/// Header heart that opens the wishlist screen.
class WishlistHeaderButton extends ConsumerWidget {
  const WishlistHeaderButton({
    super.key,
    this.compact = false,
    this.color = const Color(0xFF0F172A),
    this.inverted = false,
  });

  final bool compact;
  final Color color;
  final bool inverted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(wishlistProvider.select((s) => s.productIds.length));
    final iconColor = inverted ? Colors.white : color;
    final icon = Icon(
      count > 0 ? Icons.favorite_rounded : Icons.favorite_border_rounded,
      color: count > 0 ? const Color(0xFFEF4444) : iconColor,
      size: compact ? 22 : 24,
    );

    final stacked = Stack(
      clipBehavior: Clip.none,
      children: [
        icon,
        if (count > 0)
          Positioned(
            right: -7,
            top: -5,
            child: Container(
              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: const BoxDecoration(
                color: Color(0xFFEF4444),
                borderRadius: BorderRadius.all(Radius.circular(999)),
              ),
              alignment: Alignment.center,
              child: Text(
                count > 99 ? '99+' : '$count',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                ),
              ),
            ),
          ),
      ],
    );

    void open() => context.push('/wishlist');

    if (compact) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: open,
          borderRadius: BorderRadius.circular(20),
          child: SizedBox(
            width: 32,
            height: 32,
            child: Center(child: stacked),
          ),
        ),
      );
    }

    return IconButton(
      tooltip: 'Wishlist',
      onPressed: open,
      icon: stacked,
    );
  }
}
