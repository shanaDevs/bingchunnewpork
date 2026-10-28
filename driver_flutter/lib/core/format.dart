import 'dart:math' as math;

import 'package:intl/intl.dart';

import '../l10n/l10n.dart';

/// Small formatting helpers — port of Format.kt.
class Format {
  Format._();

  static DateFormat get _timeFmt => DateFormat('MMM d, h:mm a', L10n.dateLocale);
  static DateFormat get _jobTimeFmt => DateFormat('MMM d • h:mm a', L10n.dateLocale);
  static final _grouping = NumberFormat('#,##0', 'en');

  static String money(int amount) => tr('Rs. {p1}', {'p1': _grouping.format(amount)});

  /// API timestamps are UTC (`…Z`). Always show the phone's local zone.
  static DateTime? toLocal(String? iso) {
    final raw = iso?.trim() ?? '';
    if (raw.isEmpty) return null;
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return null;
    // A bare local timestamp from the API is UTC, like the Kotlin fallback.
    final utc = parsed.isUtc || _hasOffset(raw)
        ? parsed.toUtc()
        : DateTime.utc(
            parsed.year,
            parsed.month,
            parsed.day,
            parsed.hour,
            parsed.minute,
            parsed.second,
            parsed.millisecond,
          );
    return utc.toLocal();
  }

  static bool _hasOffset(String raw) => raw.endsWith('Z') || RegExp(r'[+-]\d{2}:?\d{2}$').hasMatch(raw);

  static DateTime _today() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  static String historyGroup(String? iso) {
    final local = toLocal(iso);
    if (local == null) return tr('Earlier');
    final date = DateTime(local.year, local.month, local.day);
    final today = _today();
    if (date == today) return tr('Today');
    if (date == today.subtract(const Duration(days: 1))) return tr('Yesterday');
    return tr('Earlier');
  }

  /// True when [iso] falls on the device's current local calendar day.
  static bool isToday(String? iso) {
    final local = toLocal(iso);
    if (local == null) return false;
    return DateTime(local.year, local.month, local.day) == _today();
  }

  static String dateTime(String? iso) {
    if (iso == null || iso.trim().isEmpty) return '—';
    final local = toLocal(iso);
    return local == null ? iso : _timeFmt.format(local);
  }

  static String jobDateTime(String? iso) {
    if (iso == null || iso.trim().isEmpty) return '—';
    final local = toLocal(iso);
    return local == null ? dateTime(iso) : _jobTimeFmt.format(local);
  }

  static String deliverySummary(int orderCount, [int totalCups = 0]) {
    final orders = trn(orderCount, '{n} order', '{n} orders');
    final cups = totalCups > 0 ? ' (${trn(totalCups, '{n} cup', '{n} cups')})' : '';
    return tr('Delivery • {orders}{cups}', {'orders': orders, 'cups': cups});
  }

  /// Human-readable Ride ID (e.g. RIDE-1024). Falls back to # + first 8 of the job UUID.
  static String displayRideId(String? rideCode, String jobId) {
    if (rideCode != null && rideCode.trim().isNotEmpty) return rideCode;
    final short = jobId.length > 8 ? jobId.substring(0, 8) : jobId;
    return '#${short.toUpperCase()}';
  }

  static String rideIdLabel(String? rideCode, String jobId) =>
      tr('Ride ID · {p1}', {'p1': displayRideId(rideCode, jobId)});

  /// Sri Lankan mobile in the `07XXXXXXXX` form the API expects, or null when it isn't one.
  /// Accepts `0771234567`, `771234567`, `+94771234567` and spaced variants.
  static String? lkMobile(String raw) {
    var d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.startsWith('94') && d.length == 11) d = d.substring(2);
    if (d.startsWith('0') && d.length == 10) d = d.substring(1);
    return RegExp(r'^7\d{8}$').hasMatch(d) ? '0$d' : null;
  }

  /// `0771234567` → `+94 77 123 4567`.
  static String lkMobileDisplay(String phone) {
    final d = phone.replaceAll(RegExp(r'\D'), '');
    final local = d.startsWith('0') ? d.substring(1) : d;
    if (local.length != 9) return phone;
    return '+94 ${local.substring(0, 2)} ${local.substring(2, 5)} ${local.substring(5)}';
  }

  static String km(double value) => '${value.toStringAsFixed(1)} km';
  static String minutes(int value) => tr('{n} min', {'n': value});

  static int metresAway(double distanceM) => math.max(0, distanceM.round());

  static String pickupUnlockHint(double? distanceM, int radiusM, bool within) {
    if (distanceM == null) return tr('Getting GPS…');
    final away = metresAway(distanceM);
    if (within) return tr('At the branch · pickup unlocked');
    final closer = math.max(0, away - radiusM);
    return tr('{away} m from branch · {closer} m closer to unlock (within {radiusM}m)', {
      'away': away,
      'closer': closer,
      'radiusM': radiusM,
    });
  }

  /// For jobs with a pickup override (e.g. vehicle failure) — no geofence to unlock.
  static String pickupOverrideHint(double? distanceM, String label) {
    final away = distanceM == null ? tr('Getting GPS…') : tr('{p1}m away', {'p1': metresAway(distanceM)});
    return tr('Pickup at {label} · {away} · no check-in required', {'label': label, 'away': away});
  }

  /// Shift/duty duration as e.g. "2h 15m" or "45m".
  static String duration(int totalMinutes) {
    final safe = math.max(0, totalMinutes);
    final hours = safe ~/ 60;
    final minutes = safe % 60;
    return hours > 0
        ? tr('{hours}h {minutes}m', {'hours': hours, 'minutes': minutes})
        : tr('{minutes}m', {'minutes': minutes});
  }

  /// Driver-friendly address: drop noisy province/road-name duplicates and
  /// trailing repeated city/district tokens.
  static String shortAddress(String? addressLine, [String? city, String? district]) {
    const noiseExact = {'western province', 'sri lanka', 'lk', 'colombo-ratnapura-wellawaya-batticaloa road'};
    final parts = <String>[
      if (addressLine != null) ...addressLine.split(RegExp(r'[,·|]')).map((e) => e.trim()),
      if (city != null && city.trim().isNotEmpty) city.trim(),
      if (district != null && district.trim().isNotEmpty) district.trim(),
    ].where((e) => e.isNotEmpty);

    final cleaned = <String>[];
    for (final part in parts) {
      final key = part.toLowerCase();
      if (noiseExact.contains(key)) continue;
      if (key.contains('wellawaya-batticaloa')) continue;
      if (cleaned.any((c) => c.toLowerCase() == key)) continue;
      cleaned.add(part);
    }
    // Keep at most street + area + city
    final trimmed = cleaned.length > 3 ? [...cleaned.take(2), cleaned.last] : cleaned;
    final joined = trimmed.join(', ');
    return joined.trim().isEmpty ? tr('Address unavailable') : joined;
  }

  static String shortBranchName(String name) {
    var s = name;
    if (s.startsWith('Bing Chun - ')) s = s.substring('Bing Chun - '.length);
    if (s.startsWith('Bing Chun — ')) s = s.substring('Bing Chun — '.length);
    return s.trim();
  }
}

/// Great-circle distance in metres.
double haversineMetres(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0;
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final a =
      math.pow(math.sin(dLat / 2), 2) + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

/// Initial bearing from origin to destination in degrees (0 = north).
double bearingDeg(double lat1, double lng1, double lat2, double lng2) {
  double rad(double d) => d * math.pi / 180;
  final phi1 = rad(lat1);
  final phi2 = rad(lat2);
  final dLng = rad(lng2 - lng1);
  final y = math.sin(dLng) * math.cos(phi2);
  final x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dLng);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}
