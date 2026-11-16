import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-local profile overrides. The backend has no endpoint for changing the display
/// name, so edits are kept on this phone only and shown on the Profile tab. Also keeps the
/// last vehicle-breakdown report (time + note), and the reason/description and location per
/// ride (the server returns the note in history, but not for every case, nor the location).
class LocalProfile extends ChangeNotifier {
  LocalProfile._();
  static final LocalProfile instance = LocalProfile._();

  static const _kName = 'local_display_name';
  static const _kBreakdownAt = 'local_last_breakdown_at';
  static const _kBreakdownNote = 'local_last_breakdown_note';
  static const _kBreakdownNotes = 'local_breakdown_notes';
  static const _kBreakdownSpots = 'local_breakdown_spots';

  String? displayName;
  DateTime? lastBreakdownAt;
  String? lastBreakdownNote;

  /// Reason + description per ride (jobId → "Type: description"), saved when each report is sent.
  Map<String, String> breakdownNotes = {};

  /// Where each breakdown was reported (jobId -> position). The driver history API does not
  /// return the breakdown spot, so it is kept from the report.
  Map<String, ({double lat, double lng})> breakdownSpots = {};

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
    try {
      final raw = p.getString(_kBreakdownSpots);
      if (raw != null) {
        breakdownSpots = {
          for (final e in (jsonDecode(raw) as Map).entries)
            if (e.value case {'lat': final num lat, 'lng': final num lng})
              '${e.key}': (lat: lat.toDouble(), lng: lng.toDouble()),
        };
      }
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
  Future<void> recordBreakdown({String? note, String? jobId, double? lat, double? lng}) async {
    await load();
    lastBreakdownAt = DateTime.now();
    lastBreakdownNote = note;
    if (jobId != null && note != null) breakdownNotes = {...breakdownNotes, jobId: note};
    if (jobId != null && lat != null && lng != null) breakdownSpots = {...breakdownSpots, jobId: (lat: lat, lng: lng)};
    final p = await SharedPreferences.getInstance();
    await p.setString(_kBreakdownNotes, jsonEncode(breakdownNotes));
    await p.setString(
      _kBreakdownSpots,
      jsonEncode({for (final e in breakdownSpots.entries) e.key: {'lat': e.value.lat, 'lng': e.value.lng}}),
    );
    await p.setString(_kBreakdownAt, lastBreakdownAt!.toIso8601String());
    note == null ? await p.remove(_kBreakdownNote) : await p.setString(_kBreakdownNote, note);
    notifyListeners();
  }
}
