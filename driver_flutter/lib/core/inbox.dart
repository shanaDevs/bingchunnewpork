import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One received notification kept on the phone.
class InboxItem {
  InboxItem({required this.id, required this.title, required this.body, required this.type, required this.at, this.read = false});

  final String id;
  final String title;
  final String body;

  /// Push `type` (NEW_JOB, ORDER_CANCELLED ...) or empty.
  final String type;
  final DateTime at;
  bool read;

  Map<String, Object?> toJson() => {
    'id': id,
    'title': title,
    'body': body,
    'type': type,
    'at': at.millisecondsSinceEpoch,
    'read': read,
  };

  static InboxItem? fromJson(Object? j) {
    if (j is! Map) return null;
    return InboxItem(
      id: '${j['id']}',
      title: '${j['title'] ?? ''}',
      body: '${j['body'] ?? ''}',
      type: '${j['type'] ?? ''}',
      at: DateTime.fromMillisecondsSinceEpoch((j['at'] as num?)?.toInt() ?? 0),
      read: j['read'] == true,
    );
  }
}

/// Local notification inbox (QuickDrop "Notifications"). The backend has no driver
/// notification history, so pushes received while the app runs are kept here.
class NotificationInbox extends ChangeNotifier {
  NotificationInbox._();
  static final NotificationInbox instance = NotificationInbox._();

  static const _key = 'bc_inbox_v1';
  static const _max = 100;

  final List<InboxItem> items = [];
  bool _loaded = false;

  int get unread => items.where((e) => !e.read).length;

  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw == null) return;
      final list = (jsonDecode(raw) as List).map(InboxItem.fromJson).whereType<InboxItem>();
      items
        ..clear()
        ..addAll(list);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> add({required String title, required String body, String type = ''}) async {
    await load();
    if (title.isEmpty && body.isEmpty) return;
    items.insert(
      0,
      InboxItem(id: '${DateTime.now().microsecondsSinceEpoch}', title: title, body: body, type: type, at: DateTime.now()),
    );
    if (items.length > _max) items.removeRange(_max, items.length);
    notifyListeners();
    await _save();
  }

  Future<void> markAllRead() async {
    for (final e in items) {
      e.read = true;
    }
    notifyListeners();
    await _save();
  }

  Future<void> markRead(InboxItem item) async {
    if (item.read) return;
    item.read = true;
    notifyListeners();
    await _save();
  }

  Future<void> clear() async {
    items.clear();
    notifyListeners();
    await _save();
  }

  Future<void> _save() async {
    try {
      (await SharedPreferences.getInstance()).setString(_key, jsonEncode(items.map((e) => e.toJson()).toList()));
    } catch (_) {}
  }
}
