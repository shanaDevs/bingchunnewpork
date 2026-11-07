import 'package:flutter/foundation.dart';

/// One async value for a page section: loads on creation, keeps the last good
/// value while refreshing, and drops stale responses (like react-query's
/// `placeholderData: keepPreviousData`).
class Loadable<T> extends ChangeNotifier {
  Loadable(this._fetch, {bool auto = true}) {
    if (auto) load();
  }

  Future<T> Function() _fetch;
  T? data;
  String? error;
  bool loading = false;
  int _request = 0;
  bool _disposed = false;

  bool get hasData => data != null;

  /// First load still running (nothing to show yet).
  bool get initialLoading => loading && data == null && error == null;

  Future<void> load({bool silent = false}) async {
    final id = ++_request;
    loading = true;
    if (!silent) error = null;
    _notify();
    try {
      final result = await _fetch();
      if (id != _request) return;
      data = result;
      error = null;
    } catch (e) {
      if (id != _request) return;
      error = e.toString();
    }
    loading = false;
    _notify();
  }

  /// Swap the query (new filters) and reload.
  Future<void> reload(Future<T> Function() fetch) {
    _fetch = fetch;
    return load();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
