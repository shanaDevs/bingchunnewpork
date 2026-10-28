import 'package:flutter/material.dart';

/// How far the center "Order Now" FAB rises above the nav bar.
const double shellCenterFabProtrusion = 28.0;

/// Top + bottom padding around the nav row in [MainShellScreen].
const double shellNavOuterPaddingVertical = 14.0; // 8 + 6

/// Nav icon row height in [MainShellScreen].
const double shellNavRowHeight = 56.0;

/// Nav row height with room for accessibility text scaling.
double shellNavRowHeightFor(BuildContext context) {
  final scale = MediaQuery.textScalerOf(context).scale(1);
  return shellNavRowHeight + ((scale - 1).clamp(0, 1) * 16);
}

/// Inner height of [MainShellScreen] bottom nav (padding + row, excluding safe area).
const double shellNavBarContentHeight =
    shellNavOuterPaddingVertical + shellNavRowHeight;

/// Height of [MainShellScreen] bottom tab bar (extendBody overlays child).
double shellNavBarHeight(BuildContext context) {
  final bottom = MediaQuery.viewPaddingOf(context).bottom;
  return bottom + shellNavOuterPaddingVertical + shellNavRowHeightFor(context);
}

/// Total bottom chrome including raised center FAB.
double shellBottomChromeHeight(BuildContext context) {
  return shellNavBarHeight(context) + shellCenterFabProtrusion;
}

/// Extra space between cart billing and shell tab bar.
const double shellCartBillGapAboveNav = 24.0;

/// Pin cart billing above shell tab bar.
double shellCartBillBottomOffset(BuildContext context) {
  return shellNavBarHeight(context) + shellCartBillGapAboveNav;
}

double shellContentBottomInset(BuildContext context) {
  return shellNavBarHeight(context) + 16;
}

/// Mascot FAB diameter in [MainShellScreen].
const double shellMascotFabSize = 52.0;

/// Bottom inset for menu grid — clears tab bar and mascot FAB.
double shellMenuScrollBottomInset(BuildContext context) {
  const fabGapAboveNav = 16.0;
  const contentGap = 12.0;
  return shellNavBarHeight(context) +
      fabGapAboveNav +
      shellMascotFabSize +
      contentGap;
}

@Deprecated('Use shellNavBarHeight')
double shellTabBarHeight(BuildContext context) => shellNavBarHeight(context);
