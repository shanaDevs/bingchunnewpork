import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum OfferOutcome { accepted, declined, missed }

class OfferOutcomeCounts {
  const OfferOutcomeCounts({this.accepted = 0, this.declined = 0, this.missed = 0});
  final int accepted;
  final int declined;
  final int missed;
  int get total => accepted + declined + missed;
}

class _Entry {
  _Entry(this.id, this.outcome, this.at);
  final String id;
  final OfferOutcome outcome;
  final DateTime at;
}

/// Offer outcomes (accepted / declined / missed) recorded on this phone. The backend has no
/// offer statistics, so each offer's first terminal outcome is kept locally, once per job id.
class OfferOutcomes extends ChangeNotifier {
  OfferOutcomes._();
  static final OfferOutcomes instance = OfferOutcomes._();

  static const _key = 'bc_offer_outcomes_v1';
  static const _max = 1000;

  final List<_Entry> _items = [];
  bool _loaded = false;

  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw == null) return;
      final list = jsonDecode(raw);
      if (list is! List) return;
      final loaded = <_Entry>[];
      for (final j in list) {
        if (j is! Map) continue;
        final o = OfferOutcome.values.where((v) => v.name == j['o']).firstOrNull;
        final id = '${j['id'] ?? ''}';
        final at = (j['at'] as num?)?.toInt();
        if (o == null || id.isEmpty || at == null) continue;
        loaded.add(_Entry(id, o, DateTime.fromMillisecondsSinceEpoch(at)));
      }
      // Anything recorded before the load finished stays; first outcome per id wins.
      final known = _items.map((e) => e.id).toSet();
      _items.addAll(loaded.where((e) => !known.contains(e.id)));
      _trim();
      notifyListeners();
    } catch (_) {}
  }

  /// Records [jobId]'s outcome unless it already has one. Returns true when stored.
  bool record(String jobId, OfferOutcome outcome, {DateTime? at}) {
    if (jobId.isEmpty) return false;
    if (_items.any((e) => e.id == jobId)) return false;
    _items.add(_Entry(jobId, outcome, at ?? DateTime.now()));
    _trim();
    notifyListeners();
    _save();
    return true;
  }

  void _trim() {
    if (_items.length <= _max) return;
    _items.sort((a, b) => a.at.compareTo(b.at));
    _items.removeRange(0, _items.length - _max);
  }

  OfferOutcomeCounts counts({required DateTime from, DateTime? to}) {
    var a = 0, d = 0, m = 0;
    for (final e in _items) {
      if (e.at.isBefore(from)) continue;
      if (to != null && e.at.isAfter(to)) continue;
      switch (e.outcome) {
        case OfferOutcome.accepted:
          a++;
        case OfferOutcome.declined:
          d++;
        case OfferOutcome.missed:
          m++;
      }
    }
    return OfferOutcomeCounts(accepted: a, declined: d, missed: m);
  }

  Future<void> _save() async {
    try {
      final data = jsonEncode([
        for (final e in _items) {'id': e.id, 'o': e.outcome.name, 'at': e.at.millisecondsSinceEpoch},
      ]);
      await (await SharedPreferences.getInstance()).setString(_key, data);
    } catch (_) {}
  }

  @visibleForTesting
  Future<void> resetForTest() async {
    _items.clear();
    _loaded = false;
  }
}
