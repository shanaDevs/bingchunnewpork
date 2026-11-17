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
  static const _kBreakdownOrders = 'local_breakdown_orders';
  static const _kHandedOver = 'local_breakdown_handed_over';

  String? displayName;
  DateTime? lastBreakdownAt;
  String? lastBreakdownNote;

  /// Reason + description per ride (jobId → "Type: description"), saved when each report is sent.
  Map<String, String> breakdownNotes = {};

  /// Where each breakdown was reported (jobId -> position). The driver history API does not
  /// return the breakdown spot, so it is kept from the report.
  Map<String, ({double lat, double lng})> breakdownSpots = {};

  /// Customer name + area of each order on a broken-down ride (jobId → orderId → info),
  /// saved at report time — the handover API sends only order numbers.
  Map<String, Map<String, ({String name, String area})>> breakdownOrders = {};

  /// Orders this rider confirmed handing to the replacement rider (jobId → order ids).
  /// There is no backend call for a per-order handover, so the confirmation stays here.
  Map<String, Set<String>> handedOverOrders = {};

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
    try {
      final raw = p.getString(_kBreakdownOrders);
      if (raw != null) {
        breakdownOrders = {
          for (final job in (jsonDecode(raw) as Map).entries)
            if (job.value is Map)
              '${job.key}': {
                for (final o in (job.value as Map).entries)
                  if (o.value case {'name': final String name, 'area': final String area}) '${o.key}': (name: name, area: area),
              },
        };
      }
    } catch (_) {}
    try {
      final raw = p.getString(_kHandedOver);
      if (raw != null) {
        handedOverOrders = {
          for (final e in (jsonDecode(raw) as Map).entries)
            if (e.value is List) '${e.key}': {for (final id in e.value as List) '$id'},
        };
      }
    } catch (_) {}
    _loaded = true;
    notifyListeners();
  }

  /// Most rides whose order names are kept; older ones are dropped.
  static const _maxSavedRides = 30;

  /// Keeps each order's customer name and area for a ride (saved for every active ride the
  /// app loads, so they are on hand if it breaks down). Skips the write when nothing changed.
  Future<void> saveBreakdownOrders(String jobId, Map<String, ({String name, String area})> orders) async {
    if (orders.isEmpty) return;
    await load();
    final existing = breakdownOrders[jobId];
    if (existing != null && mapEquals(existing, orders)) return;
    final kept = {...breakdownOrders}..remove(jobId);
    while (kept.length >= _maxSavedRides) {
      kept.remove(kept.keys.first);
    }
    breakdownOrders = {...kept, jobId: orders};
    final p = await SharedPreferences.getInstance();
    await p.setString(
      _kBreakdownOrders,
      jsonEncode({
        for (final job in breakdownOrders.entries)
          job.key: {for (final o in job.value.entries) o.key: {'name': o.value.name, 'area': o.value.area}},
      }),
    );
    notifyListeners();
  }

  /// The rider confirmed [orderId] is now with the replacement rider.
  Future<void> confirmHandover(String jobId, String orderId) async {
    await load();
    handedOverOrders = {
      ...handedOverOrders,
      jobId: {...?handedOverOrders[jobId], orderId},
    };
    final p = await SharedPreferences.getInstance();
    await p.setString(_kHandedOver, jsonEncode({for (final e in handedOverOrders.entries) e.key: e.value.toList()}));
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
