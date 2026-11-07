import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/app_container.dart';
import '../../domain/entities/admin_notification.dart';
import '../../domain/entities/admin_session.dart';

/// Live new-order alerts — socket first, `/admin/notifications` poll as the
/// fallback (web AdminNotificationProvider: 15 s poll, 30 min backfill on start).
class OrderAlertsController extends ChangeNotifier {
  OrderAlertsController(this._c, this._session) {
    _sub = _c.socket.notices.listen((n) => _accept(n, ring: true));
    _c.socket.connect(_session);
    _sync(const Duration(minutes: 30));
    _poll = Timer.periodic(const Duration(seconds: 15), (_) => _sync(const Duration(seconds: 30)));
  }

  final AppContainer _c;
  final AdminSession _session;
  late final StreamSubscription<AdminNotice> _sub;
  late final Timer _poll;

  static const _maxKept = 50;

  final List<AdminNotice> _notices = [];
  final Set<String> _seen = {};

  /// Bumped on every new order so the orders and dashboard screens reload.
  int orderSignal = 0;

  /// Most recent alert not yet shown as a banner.
  AdminNotice? pendingBanner;

  List<AdminNotice> get notices => List.unmodifiable(_notices);
  int get unreadCount => _notices.where((n) => !n.read).length;

  Future<void> _sync(Duration window) async {
    try {
      final cutoff = DateTime.now().subtract(window);
      final unread = await _c.notificationRepository.unread();
      for (final n in unread) {
        if (!n.isNewOrder) continue;
        // Older unread items fill the list quietly; only fresh ones ring.
        _accept(n, ring: n.receivedAt.isAfter(cutoff));
      }
    } catch (_) {
      // Optional fallback — the socket is the primary channel.
    }
  }

  void _accept(AdminNotice notice, {required bool ring}) {
    if (_session.storeId != null && notice.storeId != null && notice.storeId != _session.storeId) return;
    if (!_seen.add(notice.dedupeKey)) return;
    _notices.insert(0, notice);
    if (_notices.length > _maxKept) _notices.removeRange(_maxKept, _notices.length);
    if (ring) {
      orderSignal++;
      pendingBanner = notice;
      _c.chime.play();
    }
    notifyListeners();
  }

  void bannerShown() => pendingBanner = null;

  Future<void> markRead(AdminNotice notice) async {
    final i = _notices.indexOf(notice);
    if (i < 0 || notice.read) return;
    _notices[i] = notice.markRead();
    notifyListeners();
    final id = notice.id;
    if (id != null) {
      try {
        await _c.notificationRepository.markRead(id);
      } catch (_) {}
    }
  }

  Future<void> markAllRead() async {
    for (var i = 0; i < _notices.length; i++) {
      _notices[i] = _notices[i].markRead();
    }
    notifyListeners();
    try {
      await _c.notificationRepository.markAllRead();
    } catch (_) {}
  }

  @override
  void dispose() {
    _poll.cancel();
    _sub.cancel();
    _c.socket.disconnect();
    super.dispose();
  }
}
