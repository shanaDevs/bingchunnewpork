import 'package:flutter/foundation.dart';

import '../core/app_container.dart';
import '../data/models/driver.dart';
import '../data/network/api_exception.dart';
import '../l10n/l10n.dart';

/// Periods offered by the Stats tab; the values match the server's `period` query param.
enum StatsPeriod {
  today('today', 'Today'),
  week('7d', 'This Week'),
  month('30d', 'This Month'),
  all('all', 'All Time');

  const StatsPeriod(this.key, this.label);
  final String key;
  final String label;
}

/// Port of StatsViewModel.kt.
class StatsController extends ChangeNotifier {
  StatsController(this._c);

  final AppContainer _c;
  bool _disposed = false;

  bool loading = false;
  bool refreshing = false;
  String? error;
  StatsPeriod period = StatsPeriod.month;
  RiderStats? stats;
  bool ratingsLoading = false;
  double? ratingsAverage;
  int ratingsCount = 0;
  List<RiderRatingItem> ratings = const [];

  /// Cached per period so switching back and forth doesn't re-hit the network.
  final Map<StatsPeriod, RiderStats> _cache = {};

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load({StatsPeriod? period, bool force = false}) async {
    final p = period ?? this.period;
    final cached = _cache[p];
    if (cached != null && !force) {
      this.period = p;
      stats = cached;
      loading = false;
      error = null;
      _emit();
      loadRatings();
      return;
    }
    this.period = p;
    loading = cached == null;
    refreshing = force;
    error = null;
    _emit();
    loadRatings(force: force);
    try {
      final s = await _c.jobsRepository.getMyStats(p.key);
      _cache[p] = s;
      // A slow response for a period the rider has since left must not overwrite.
      if (this.period != p) return;
      stats = s;
      loading = false;
      refreshing = false;
      _emit();
    } catch (e) {
      if (this.period != p) return;
      loading = false;
      refreshing = false;
      error = errorMessage(e, tr('Could not load your stats'));
      _emit();
    }
  }

  Future<void> loadRatings({bool force = false}) async {
    if (!force && (ratings.isNotEmpty || ratingsLoading)) return;
    ratingsLoading = true;
    _emit();
    try {
      final payload = await _c.jobsRepository.getMyRatings();
      ratingsAverage = payload.average;
      ratingsCount = payload.count;
      ratings = payload.ratings;
    } catch (_) {}
    ratingsLoading = false;
    _emit();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
