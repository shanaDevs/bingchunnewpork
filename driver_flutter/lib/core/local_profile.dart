import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-local profile overrides. The backend has no endpoint for changing the display
/// name, so edits are kept on this phone only and shown on the Profile tab. Also keeps the
/// time of the last vehicle-breakdown report (there is no status API).
class LocalProfile extends ChangeNotifier {
  LocalProfile._();
  static final LocalProfile instance = LocalProfile._();

  static const _kName = 'local_display_name';
  static const _kBreakdownAt = 'local_last_breakdown_at';

  String? displayName;
  DateTime? lastBreakdownAt;
  bool _loaded = false;

  Future<void> load() async {
    if (_loaded) return;
    final p = await SharedPreferences.getInstance();
    displayName = p.getString(_kName);
    final at = p.getString(_kBreakdownAt);
    lastBreakdownAt = at == null ? null : DateTime.tryParse(at);
    _loaded = true;
    notifyListeners();
  }

  Future<void> setDisplayName(String? name) async {
    final v = (name == null || name.trim().isEmpty) ? null : name.trim();
    displayName = v;
    final p = await SharedPreferences.getInstance();
    v == null ? await p.remove(_kName) : await p.setString(_kName, v);
    notifyListeners();
  }

  Future<void> recordBreakdown() async {
    lastBreakdownAt = DateTime.now();
    final p = await SharedPreferences.getInstance();
    await p.setString(_kBreakdownAt, lastBreakdownAt!.toIso8601String());
    notifyListeners();
  }
}
