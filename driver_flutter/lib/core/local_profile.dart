import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-local profile overrides. The backend has no endpoint for changing the display
/// name, so edits are kept on this phone only and shown on the Profile tab. Also keeps the
/// last vehicle-breakdown report (time + note) and when the rider confirmed they were back
/// on the road (there is no breakdown status API).
class LocalProfile extends ChangeNotifier {
  LocalProfile._();
  static final LocalProfile instance = LocalProfile._();

  static const _kName = 'local_display_name';
  static const _kBreakdownAt = 'local_last_breakdown_at';
  static const _kBreakdownNote = 'local_last_breakdown_note';
  static const _kBreakdownNotes = 'local_breakdown_notes';
  static const _kBreakdownClearedAt = 'local_breakdown_cleared_at';

  String? displayName;
  DateTime? lastBreakdownAt;
  String? lastBreakdownNote;

  /// Reason + description per ride (jobId → "Type: description"), saved when each report is sent.
  Map<String, String> breakdownNotes = {};

  /// When the rider last tapped "Back on the road".
  DateTime? breakdownClearedAt;
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
    final cleared = p.getString(_kBreakdownClearedAt);
    breakdownClearedAt = cleared == null ? null : DateTime.tryParse(cleared);
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

  /// A breakdown is open when the newest report (this phone's, or the server history's
  /// [serverReportedAt]) is later than the last "Back on the road" confirmation.
  bool isBreakdownActive([DateTime? serverReportedAt]) {
    final reported = [lastBreakdownAt, serverReportedAt].whereType<DateTime>().fold<DateTime?>(
      null,
      (a, b) => a == null || b.isAfter(a) ? b : a,
    );
    if (reported == null) return false;
    final cleared = breakdownClearedAt;
    return cleared == null || reported.isAfter(cleared);
  }

  /// Rider confirms they are back on the road — hides the home-screen breakdown notice.
  Future<void> clearBreakdown() async {
    await load();
    breakdownClearedAt = DateTime.now();
    final p = await SharedPreferences.getInstance();
    await p.setString(_kBreakdownClearedAt, breakdownClearedAt!.toIso8601String());
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
