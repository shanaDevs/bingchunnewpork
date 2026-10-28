import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/spin.dart';

/// Local spin keys — mirrors Frontend `spinStorage.ts`.
class SpinStorage {
  SpinStorage._();

  static const _guestKey = 'bc_spin_guest_key';
  static const _claimKey = 'bc_spin_claim';
  static const _shownKey = 'bc_spin_popup_shown';
  static const _usedKey = 'bc_spin_used_until';
  static const popupCooldown = Duration(hours: 24);

  static Future<String> getGuestKey() async {
    final prefs = await SharedPreferences.getInstance();
    var key = prefs.getString(_guestKey);
    if (key == null || key.isEmpty) {
      final rng = Random.secure();
      final hex = List.generate(
        16,
        (_) => rng.nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
      key = 'g_$hex';
      await prefs.setString(_guestKey, key);
    }
    return key;
  }

  static Future<bool> shouldShowPopup() async {
    if (await getClaim() != null) return false;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_shownKey);
    if (raw == null || raw.isEmpty) return true;
    try {
      if (raw.startsWith('{')) {
        final parsed = jsonDecode(raw) as Map<String, dynamic>;
        final until = (parsed['until'] as num?)?.toInt();
        if (until != null) {
          return DateTime.now().millisecondsSinceEpoch >= until;
        }
        return true;
      }
      final ts = int.tryParse(raw);
      if (ts == null) return true;
      return DateTime.now().millisecondsSinceEpoch - ts >=
          popupCooldown.inMilliseconds;
    } catch (_) {
      return true;
    }
  }

  static Future<void> markPopupShown([int? untilMs]) async {
    final prefs = await SharedPreferences.getInstance();
    final now = DateTime.now().millisecondsSinceEpoch;
    final until = (untilMs != null && untilMs > now)
        ? untilMs
        : now + popupCooldown.inMilliseconds;
    await prefs.setString(_shownKey, jsonEncode({'until': until}));
  }

  static Future<bool> isConsumedLocally() async {
    final prefs = await SharedPreferences.getInstance();
    final until = int.tryParse(prefs.getString(_usedKey) ?? '');
    return until != null && until > DateTime.now().millisecondsSinceEpoch;
  }

  static Future<void> markConsumed([int? untilMs]) async {
    await markPopupShown(untilMs);
    final prefs = await SharedPreferences.getInstance();
    final now = DateTime.now().millisecondsSinceEpoch;
    final until = (untilMs != null && untilMs > now)
        ? untilMs
        : now + popupCooldown.inMilliseconds;
    await prefs.setString(_usedKey, '$until');
  }

  /// Releases a stale local lock when the API confirms the customer can spin.
  static Future<void> clearConsumed() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_usedKey);
  }

  static Future<void> saveClaim(SpinClaim claim) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_claimKey, jsonEncode(claim.toJson()));
  }

  static Future<SpinClaim?> getClaim() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_claimKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      final claim = SpinClaim.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw) as Map),
      );
      if (!claim.isUsable) {
        await clearClaim();
        return null;
      }
      return claim;
    } catch (_) {
      return null;
    }
  }

  static Future<void> clearClaim() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_claimKey);
  }

  static String formatCooldownMessage(
    DateTime? nextSpinAt, [
    String? fallback,
  ]) {
    final fb = fallback?.trim();
    if (fb != null && fb.isNotEmpty) return fb;
    if (nextSpinAt != null) {
      final local = nextSpinAt.toLocal();
      final y = local.year.toString().padLeft(4, '0');
      final m = local.month.toString().padLeft(2, '0');
      final d = local.day.toString().padLeft(2, '0');
      final hh = local.hour.toString().padLeft(2, '0');
      final mm = local.minute.toString().padLeft(2, '0');
      return 'You can spin again after $y-$m-$d $hh:$mm';
    }
    return 'You have already used your spins. Come back later!';
  }
}
