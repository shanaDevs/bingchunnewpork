import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../providers/auth_provider.dart';
import '../theme/bc_theme.dart';

class _NotifItem {
  final String id;
  final String title;
  final String message;
  final String? orderId;
  final bool read;
  final DateTime? createdAt;

  const _NotifItem({
    required this.id,
    required this.title,
    required this.message,
    this.orderId,
    required this.read,
    this.createdAt,
  });

  factory _NotifItem.fromJson(Map<String, dynamic> json) {
    return _NotifItem(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? 'Update',
      message: json['message'] as String? ?? '',
      orderId: json['orderId'] as String?,
      read: json['read'] as bool? ?? false,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'] as String) : null,
    );
  }

  _NotifItem copyWith({bool? read}) {
    return _NotifItem(
      id: id,
      title: title,
      message: message,
      orderId: orderId,
      read: read ?? this.read,
      createdAt: createdAt,
    );
  }
}

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  List<_NotifItem> _items = [];
  int _unread = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.get<Map<String, dynamic>>(
        '/notifications?limit=40',
        parser: (json) => json,
      );
      final list = (data['notifications'] as List? ?? [])
          .whereType<Map>()
          .map((e) => _NotifItem.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      if (!mounted) return;
      setState(() {
        _items = list;
        _unread = (data['unreadCount'] as num?)?.toInt() ?? list.where((n) => !n.read).length;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not load notifications';
      });
    }
  }

  Future<void> _markAllRead() async {
    try {
      await ref.read(apiClientProvider).post<void>('/notifications/read-all', {});
      if (!mounted) return;
      setState(() {
        _items = _items.map((n) => n.copyWith(read: true)).toList();
        _unread = 0;
      });
    } catch (_) {}
  }

  Future<void> _open(_NotifItem item) async {
    if (!item.read) {
      try {
        await ref.read(apiClientProvider).patch<void>('/notifications/${item.id}/read');
      } catch (_) {}
      if (mounted) {
        setState(() {
          _items = _items.map((n) => n.id == item.id ? n.copyWith(read: true) : n).toList();
          _unread = _items.where((n) => !n.read).length;
        });
      }
    }
    if (item.orderId != null && item.orderId!.isNotEmpty) {
      if (!mounted) return;
      context.push('/track/${item.orderId}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          Container(
            padding: EdgeInsets.fromLTRB(8, top + 8, 12, 12),
            color: Colors.white,
            child: Row(
              children: [
                IconButton(
                  onPressed: () => context.pop(),
                  icon: const Icon(Icons.arrow_back_rounded, color: Color(0xFF0F172A)),
                ),
                Expanded(
                  child: Text(
                    'Notifications',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFF0F172A),
                    ),
                  ),
                ),
                if (_unread > 0)
                  TextButton(
                    onPressed: _markAllRead,
                    child: Text(
                      'Mark all read',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: BcColors.brand,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!, style: GoogleFonts.poppins(color: const Color(0xFF64748B))),
                            TextButton(onPressed: _load, child: const Text('Retry')),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        color: BcColors.brand,
                        onRefresh: _load,
                        child: _items.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                children: [
                                  const SizedBox(height: 80),
                                  Icon(Icons.notifications_none_rounded, size: 48, color: Colors.grey.shade400),
                                  const SizedBox(height: 12),
                                  Center(
                                    child: Text(
                                      'No notifications yet',
                                      style: GoogleFonts.poppins(
                                        fontWeight: FontWeight.w600,
                                        color: const Color(0xFF64748B),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Center(
                                    child: Text(
                                      'Order updates will show up here',
                                      style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF94A3B8)),
                                    ),
                                  ),
                                ],
                              )
                            : ListView.separated(
                                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                                itemCount: _items.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 8),
                                itemBuilder: (context, i) {
                                  final n = _items[i];
                                  final time = n.createdAt != null
                                      ? DateFormat('d MMM · h:mm a').format(n.createdAt!.toLocal())
                                      : '';
                                  return Material(
                                    color: n.read ? Colors.white : const Color(0xFFEEF5FF),
                                    borderRadius: BorderRadius.circular(14),
                                    child: InkWell(
                                      onTap: () => _open(n),
                                      borderRadius: BorderRadius.circular(14),
                                      child: Container(
                                        padding: const EdgeInsets.all(14),
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(14),
                                          border: Border.all(
                                            color: n.read ? const Color(0xFFE2EBF6) : BcColors.brand.withValues(alpha: 0.25),
                                          ),
                                        ),
                                        child: Row(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Container(
                                              width: 36,
                                              height: 36,
                                              decoration: BoxDecoration(
                                                color: BcColors.brand.withValues(alpha: 0.12),
                                                shape: BoxShape.circle,
                                              ),
                                              child: const Icon(Icons.local_cafe_rounded, color: BcColors.brand, size: 18),
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    n.title,
                                                    style: GoogleFonts.poppins(
                                                      fontWeight: FontWeight.w700,
                                                      fontSize: 13,
                                                      color: const Color(0xFF0F172A),
                                                    ),
                                                  ),
                                                  const SizedBox(height: 2),
                                                  Text(
                                                    n.message,
                                                    style: GoogleFonts.poppins(
                                                      fontSize: 12,
                                                      color: const Color(0xFF475569),
                                                      height: 1.35,
                                                    ),
                                                  ),
                                                  if (time.isNotEmpty) ...[
                                                    const SizedBox(height: 6),
                                                    Text(
                                                      time,
                                                      style: GoogleFonts.poppins(
                                                        fontSize: 10,
                                                        color: const Color(0xFF94A3B8),
                                                      ),
                                                    ),
                                                  ],
                                                ],
                                              ),
                                            ),
                                            if (!n.read)
                                              Container(
                                                width: 8,
                                                height: 8,
                                                margin: const EdgeInsets.only(top: 4, left: 6),
                                                decoration: const BoxDecoration(
                                                  color: BcColors.brand,
                                                  shape: BoxShape.circle,
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
          ),
        ],
      ),
    );
  }
}
