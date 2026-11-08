import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/l10n.dart';

/// What a pending in-app navigation is for — port of NavTargetKind in Intents.kt.
sealed class NavTargetKind {
  const NavTargetKind();
}

class NavKindPickup extends NavTargetKind {
  const NavKindPickup();
}

class NavKindReturn extends NavTargetKind {
  const NavKindReturn();
}

class NavKindCustomerStop extends NavTargetKind {
  final String orderId;
  const NavKindCustomerStop(this.orderId);
}

/// A pending in-app navigation request: destination coordinates + a display label.
class NavTarget {
  final double lat;
  final double lng;
  final String label;
  final NavTargetKind? kind;

  /// Street address and phone shown in the nav header (empty when unknown).
  final String address;
  final String phone;

  /// Customer stops: 1-based order number shown in the header.
  final int? stopNumber;

  /// Between legs: the next stop is shown ("Up next") but the rider hasn't set off yet.
  final bool upNext;

  const NavTarget({
    required this.lat,
    required this.lng,
    required this.label,
    this.kind,
    this.address = '',
    this.phone = '',
    this.stopNumber,
    this.upNext = false,
  });
}

/// Dialer / maps launchers — port of Intents.kt. Returns an error message on failure.
class Intents {
  Intents._();

  static Future<String?> dial(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.trim());
    try {
      if (await launchUrl(uri)) return null;
    } catch (_) {}
    return tr('No dialer app found');
  }

  /// Opens Google Maps with a multi-stop route: the first point is the start, the last the
  /// destination, the rest are waypoints (Google allows up to 9).
  static Future<String?> routeThrough(List<(double, double)> points) async {
    if (points.isEmpty) return tr('No maps app found');
    if (points.length == 1) return navigateTo(points.first.$1, points.first.$2);
    String p((double, double) pt) => '${pt.$1},${pt.$2}';
    final mid = points.sublist(1, points.length - 1).take(9).map(p).join('|');
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&origin=${p(points.first)}&destination=${p(points.last)}'
      '${mid.isEmpty ? '' : '&waypoints=${Uri.encodeComponent(mid)}'}&travelmode=driving',
    );
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return null;
    } catch (_) {}
    return tr('No maps app found');
  }

  /// Opens turn-by-turn navigation in Google Maps; falls back to the Google Maps web URL.
  static Future<String?> navigateTo(double lat, double lng, {String? label}) async {
    final candidates = <Uri>[
      if (defaultTargetPlatform == TargetPlatform.android) Uri.parse('google.navigation:q=$lat,$lng'),
      if (defaultTargetPlatform == TargetPlatform.iOS)
        Uri.parse('comgooglemaps://?daddr=$lat,$lng&directionsmode=driving'),
      Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng'),
    ];
    for (final uri in candidates) {
      try {
        if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return null;
      } catch (_) {}
    }
    return tr('No maps app found');
  }
}
