import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/loyalty_float_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_exit.dart';
import '../utils/shell_layout.dart';
import '../widgets/draggable_floating_cup.dart';
import '../widgets/floating_spin_peek.dart';
import '../widgets/loyalty_points_float.dart';

class MainShellScreen extends ConsumerWidget {
  final Widget child;

  const MainShellScreen({super.key, required this.child});

  int _selectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith('/menu')) return 1;
    if (location.startsWith('/orders')) return 2;
    if (location.startsWith('/rewards')) return 3;
    if (location.startsWith('/profile')) return 4;
    return 0;
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/home');
      case 1:
        context.go('/menu');
      case 2:
        context.go('/orders');
      case 3:
        context.go('/rewards');
      case 4:
        context.go('/profile');
    }
  }

  Future<void> _onSystemBack(BuildContext context) async {
    final location = GoRouterState.of(context).matchedLocation;
    if (location != '/home') {
      context.go('/home');
      return;
    }
    await confirmAppExit(context);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = _selectedIndex(context);
    final bc = context.bc;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final floatState = ref.watch(loyaltyFloatProvider);
    final navRowHeight = shellNavRowHeightFor(context);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _onSystemBack(context);
      },
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Scaffold(
            extendBody: true,
            body: Stack(
              clipBehavior: Clip.none,
              children: [
                child,
                const DraggableFloatingCup(),
                if (selected != 0) const FloatingSpinPeek(),
              ],
            ),
            bottomNavigationBar: Container(
              decoration: BoxDecoration(
                color: isDark ? BcColors.navy : Colors.white,
                border: Border(
                  top: BorderSide(
                    color: bc.border.withValues(alpha: isDark ? 0.6 : 1),
                  ),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.06),
                    blurRadius: 16,
                    offset: const Offset(0, -4),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(2, 8, 2, 6),
                  child: SizedBox(
                    height: navRowHeight,
                    child: Row(
                      children: [
                        _NavItem(
                          icon: Icons.home_rounded,
                          label: 'Home',
                          selected: selected == 0,
                          onTap: () => _onTap(context, 0),
                        ),
                        _NavItem(
                          icon: Icons.local_cafe_outlined,
                          label: 'Menu',
                          selected: selected == 1,
                          onTap: () => _onTap(context, 1),
                        ),
                        _NavItem(
                          icon: Icons.receipt_long_outlined,
                          label: 'Orders',
                          selected: selected == 2,
                          onTap: () => _onTap(context, 2),
                        ),
                        _RewardsNavItem(
                          selected: selected == 3,
                          onTap: () => _onTap(context, 3),
                          pulseToken: floatState.rewardsPulseToken,
                          flashLabel:
                              floatState.flashPoints != null &&
                                  floatState.flashPoints! > 0
                              ? '${floatState.flashPoints} pts'
                              : null,
                        ),
                        _NavItem(
                          icon: Icons.person_outline_rounded,
                          label: 'Profile',
                          selected: selected == 4,
                          onTap: () => _onTap(context, 4),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          const Positioned.fill(child: LoyaltyPointsFloatOverlay()),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final activeColor = BcColors.brand;
    final inactiveColor = context.bc.mutedText;

    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    icon,
                    color: selected ? activeColor : inactiveColor,
                    size: 24,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: selected ? activeColor : inactiveColor,
                      fontSize: 10,
                      height: 1.0,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  SizedBox(
                    height: 7,
                    child: selected
                        ? Center(
                            child: Container(
                              width: 5,
                              height: 5,
                              decoration: const BoxDecoration(
                                color: BcColors.brand,
                                shape: BoxShape.circle,
                              ),
                            ),
                          )
                        : null,
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

class _RewardsNavItem extends StatefulWidget {
  final bool selected;
  final VoidCallback onTap;
  final int pulseToken;
  final String? flashLabel;

  const _RewardsNavItem({
    required this.selected,
    required this.onTap,
    required this.pulseToken,
    required this.flashLabel,
  });

  @override
  State<_RewardsNavItem> createState() => _RewardsNavItemState();
}

class _RewardsNavItemState extends State<_RewardsNavItem>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseCtrl;
  int _lastPulseToken = 0;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 650),
    );
  }

  @override
  void didUpdateWidget(covariant _RewardsNavItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.pulseToken != _lastPulseToken && widget.pulseToken > 0) {
      _lastPulseToken = widget.pulseToken;
      _pulseCtrl.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeColor = BcColors.brand;
    final inactiveColor = context.bc.mutedText;
    final selected = widget.selected;

    return Expanded(
      child: Material(
        color: Colors.transparent,
        clipBehavior: Clip.none,
        child: InkWell(
          onTap: widget.onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedBuilder(
                    animation: _pulseCtrl,
                    builder: (context, child) {
                      final t = Curves.easeOut.transform(_pulseCtrl.value);
                      final scale = 1.0 + 0.18 * (1 - (2 * t - 1).abs());
                      return Transform.scale(scale: scale, child: child);
                    },
                    child: SizedBox(
                      key: bottomNavRewardsKey,
                      width: 36,
                      height: 24,
                      child: Stack(
                        clipBehavior: Clip.none,
                        alignment: Alignment.center,
                        children: [
                          Icon(
                            Icons.card_giftcard_rounded,
                            color: selected ? activeColor : inactiveColor,
                            size: 24,
                          ),
                          if (widget.flashLabel != null)
                            Positioned(
                              right: -2,
                              top: -10,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 5,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFEA580C),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 1,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.15),
                                      blurRadius: 4,
                                      offset: const Offset(0, 1),
                                    ),
                                  ],
                                ),
                                child: Text(
                                  widget.flashLabel!,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    height: 1,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Rewards',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: selected ? activeColor : inactiveColor,
                      fontSize: 10,
                      height: 1.0,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  SizedBox(
                    height: 7,
                    child: selected
                        ? Center(
                            child: Container(
                              width: 5,
                              height: 5,
                              decoration: const BoxDecoration(
                                color: BcColors.brand,
                                shape: BoxShape.circle,
                              ),
                            ),
                          )
                        : null,
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
