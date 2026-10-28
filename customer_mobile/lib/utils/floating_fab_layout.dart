import 'package:flutter/material.dart';

/// Shared edge insets + sizes for shell floating FABs (cart cup).
class FloatingFabLayout {
  static const double edge = 12;
  static const double themeSize = 52;
  static const double cupSize = 58;
  static const double gap = 10;

  static Rect bounds({
    required Size screen,
    required EdgeInsets padding,
    required double navBarHeight,
    required double fabSize,
  }) {
    return Rect.fromLTRB(
      edge,
      padding.top + 72,
      screen.width - fabSize - edge,
      screen.height - navBarHeight - fabSize - 16,
    );
  }

  /// Four screen corners for [fabSize] within [bounds].
  static List<Offset> corners(Rect bounds) {
    return [
      Offset(bounds.left, bounds.top), // top-left
      Offset(bounds.right, bounds.top), // top-right
      Offset(bounds.left, bounds.bottom), // bottom-left
      Offset(bounds.right, bounds.bottom), // bottom-right
    ];
  }

  /// Snap center of fab to nearest free corner. Prefer [avoid] if occupied.
  static Offset snapToCorner({
    required Offset current,
    required double fabSize,
    required Rect bounds,
    Offset? avoid,
    double avoidRadius = 64,
  }) {
    final center = Offset(current.dx + fabSize / 2, current.dy + fabSize / 2);
    final options = corners(bounds);

    options.sort((a, b) {
      final ca = Offset(a.dx + fabSize / 2, a.dy + fabSize / 2);
      final cb = Offset(b.dx + fabSize / 2, b.dy + fabSize / 2);
      return (ca - center).distance.compareTo((cb - center).distance);
    });

    for (final corner in options) {
      if (avoid == null) return corner;
      final dist = (corner - avoid).distance;
      if (dist >= avoidRadius) return corner;
    }
    return options.first;
  }

  static Offset clampToBounds(Offset pos, Rect bounds) {
    return Offset(
      pos.dx.clamp(bounds.left, bounds.right),
      pos.dy.clamp(bounds.top, bounds.bottom),
    );
  }
}
