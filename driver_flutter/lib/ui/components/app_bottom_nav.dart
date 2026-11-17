import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../app_routes.dart';
import 'qd_kit.dart';

/// QuickDrop bottom navigation: Home / Jobs / Activity / Profile.
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({super.key, required this.current, required this.onSelect});
  final int current;
  final ValueChanged<int> onSelect;

  /// The bar for screens pushed above the home shell (maps, details): Home is shown as
  /// current, and tapping any tab returns to the shell on that tab.
  const AppBottomNav.overShell({super.key}) : current = 0, onSelect = _goToTab;

  static void _goToTab(int tab) {
    BcFeedback.tap();
    AppRoutes.goToTab(tab);
  }

  static const _items = [
    ('Home', Icons.home_outlined, Icons.home_rounded),
    ('Jobs', Icons.assignment_outlined, Icons.assignment_rounded),
    ('Activity', Icons.show_chart_rounded, Icons.show_chart_rounded),
    ('Profile', Icons.person_outline_rounded, Icons.person_rounded),
  ];

  @override
  Widget build(BuildContext context) => QdTabBar(current: current, onSelect: onSelect, items: _items);
}
