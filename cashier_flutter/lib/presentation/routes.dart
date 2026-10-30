import 'package:flutter/material.dart';

import 'screens/order_detail_screen.dart';

/// Shared navigation helpers.
abstract final class AppRoutes {
  static final navigatorKey = GlobalKey<NavigatorState>();

  /// Opens the order detail. Resolves true when the order changed (status, items, pickup).
  static Future<bool> openOrder(BuildContext context, String orderKey) async {
    final changed = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => OrderDetailScreen(orderKey: orderKey)));
    return changed ?? false;
  }
}
