import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-local profile overrides. The backend has no endpoint for changing the display
/// name, so edits are kept on this phone only and shown on the Profile tab. Also keeps the
/// last vehicle-breakdown report (time + note) and the reason/description per ride, since
/// the server does not return them to drivers.
class LocalProfile extends ChangeNotifier {
  LocalProfile._();
  static final LocalProfile instance = LocalProfile._();

  static const _kName = 'local_display_name';
  static const _kBreakdownAt = 'local_last_breakdown_at';
  static const _kBreakdownNote = 'local_last_breakdown_note';
  static const _kBreakdownNotes = 'local_breakdown_notes';

  String? displayName;
  DateTime? lastBreakdownAt;
  String? lastBreakdownNote;

  /// Reason + description per ride (jobId → "Type: description"), saved when each report is sent.
  Map<String, String> breakdownNotes = {};

  bool _loaded = false;

  Future<void> load() async {
    if (_loaded) return;
    final p = await SharedPreferences.getInstance();
    displayName = p.getString(_kName);
    final at = p.getString(_kBreakdownAt);
    lastBreakdownAt = at == null ? null : DateTime.tryParse(at);
    lastBreakdownNote = p.getString(_kBreakdownNote);
    try {
      final raw = p.getString(_kBreakdownNotes);
      if (raw != null) breakdownNotes = (jsonDecode(raw) as Map).map((k, v) => MapEntry('$k', '$v'));
    } catch (_) {}
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

  /// Remembers the last breakdown report (time + the "Type: description" note) on this phone.
  Future<void> recordBreakdown({String? note, String? jobId}) async {
    await load();
    lastBreakdownAt = DateTime.now();
    lastBreakdownNote = note;
    if (jobId != null && note != null) breakdownNotes = {...breakdownNotes, jobId: note};
    final p = await SharedPreferences.getInstance();
    await p.setString(_kBreakdownNotes, jsonEncode(breakdownNotes));
    await p.setString(_kBreakdownAt, lastBreakdownAt!.toIso8601String());
    note == null ? await p.remove(_kBreakdownNote) : await p.setString(_kBreakdownNote, note);
    notifyListeners();
  }
}
