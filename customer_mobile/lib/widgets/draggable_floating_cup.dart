import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/cart_provider.dart';
import '../providers/loyalty_float_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/floating_fab_layout.dart';
import '../utils/shell_layout.dart';
import 'cup_icon.dart';

/// Cart cup position (top-left of button). Null = default top-right.
final cupPositionProvider = StateProvider<Offset?>((ref) => null);

/// Draggable floating cup cart — snaps to screen corners on release.
class DraggableFloatingCup extends ConsumerWidget {
  const DraggableFloatingCup({super.key});

  static const double _size = FloatingFabLayout.cupSize;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;
    final isHome = location == '/home';
    if (location.startsWith('/cart') || location.startsWith('/checkout')) {
      return const SizedBox.shrink();
    }

    final cart = ref.watch(cartProvider);
    final count = cart.items.fold<int>(0, (sum, i) => sum + i.quantity);

    final screen = MediaQuery.sizeOf(context);
    final padding = MediaQuery.paddingOf(context);
    final navH = shellNavBarHeight(context);
    final bounds = FloatingFabLayout.bounds(
      screen: screen,
      padding: padding,
      navBarHeight: navH,
      fabSize: _size,
    );
    final effectiveBounds = isHome
        ? Rect.fromLTRB(bounds.left, bounds.bottom, bounds.right, bounds.bottom)
        : bounds;

    final stored = ref.watch(cupPositionProvider);
    final defaultPos = Offset(
      effectiveBounds.right,
      isHome ? effectiveBounds.bottom : effectiveBounds.top,
    );
    final pos = FloatingFabLayout.clampToBounds(
      stored ?? defaultPos,
      effectiveBounds,
    );

    return Positioned(
      left: pos.dx,
      top: pos.dy,
      child: Semantics(
        button: true,
        label: count == 0
            ? 'Open empty cart'
            : 'Open cart with $count ${count == 1 ? 'item' : 'items'}',
        child: GestureDetector(
          onPanUpdate: (details) {
            final current = ref.read(cupPositionProvider) ?? defaultPos;
            final next = FloatingFabLayout.clampToBounds(
              Offset(
                current.dx + details.delta.dx,
                current.dy + details.delta.dy,
              ),
              effectiveBounds,
            );
            ref.read(cupPositionProvider.notifier).state = next;
          },
          onPanEnd: (_) {
            final current = ref.read(cupPositionProvider) ?? pos;
            final snapped = FloatingFabLayout.snapToCorner(
              current: current,
              fabSize: _size,
              bounds: effectiveBounds,
            );
            ref.read(cupPositionProvider.notifier).state = snapped;
          },
          onTap: () => context.go('/cart'),
          child: Material(
            key: floatingCupFabKey,
            color: Colors.transparent,
            elevation: 8,
            shadowColor: BcColors.brand.withValues(alpha: 0.45),
            shape: const CircleBorder(),
            child: Container(
              width: _size,
              height: _size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: BcTheme.brandGradient,
                boxShadow: [
                  BoxShadow(
                    color: BcColors.brand.withValues(alpha: 0.4),
                    blurRadius: 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.center,
                children: [
                  CupIcon(
                    fillLevel: cupFillFromCount(count),
                    size: CupIconSize.md,
                    inverted: true,
                  ),
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 20),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFF3B5C),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.white, width: 1.5),
                      ),
                      child: Text(
                        count > 99 ? '99+' : '$count',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
