import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../components/layout.dart';
import '../theme/pos_theme.dart';

/// Launch screen on the indigo cashier-panel gradient while the session is checked.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: PosColors.sidebarGradient),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const BrandMark(size: 84),
              const SizedBox(height: PosSpacing.xl),
              Text(tr('BingChun Cashier'), style: PosType.title.copyWith(color: Colors.white)),
              const SizedBox(height: 4),
              Text(tr('Cashier Panel'), style: PosType.body.copyWith(color: Colors.white70)),
              const SizedBox(height: 32),
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2.6, color: Colors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
