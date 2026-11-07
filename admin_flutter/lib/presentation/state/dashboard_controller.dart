import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../domain/entities/dashboard.dart';
import '../../domain/logic/period.dart';
import '../../domain/repositories/repositories.dart';

/// Cashier dashboard. Refreshes every minute like the web (`refetchInterval: 60_000`).
class DashboardController extends ChangeNotifier {
  DashboardController(this._repo) {
    load();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) => load(silent: true));
  }

  final DashboardRepository _repo;
  late final Timer _timer;

  PeriodFilter period = const PeriodFilter.month();
  DashboardStats? stats;
  bool loading = false;
  String? error;
  int _request = 0;

  Future<void> load({bool silent = false}) async {
    if (!period.ready) return;
    final id = ++_request;
    if (!silent) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      final result = await _repo.stats(period);
      if (id != _request) return;
      stats = result;
      error = null;
    } catch (e) {
      if (id != _request) return;
      if (!silent || stats == null) error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  void setPeriod(PeriodFilter p) {
    period = p;
    load();
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }
}
