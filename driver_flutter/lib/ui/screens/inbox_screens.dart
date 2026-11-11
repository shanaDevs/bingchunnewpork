import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_container.dart';
import '../../core/endpoints.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/inbox.dart';
import '../../core/request_updates.dart';
import '../../data/models/delivery_job.dart';
import '../../l10n/l10n.dart';
import '../components/headers.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import 'branches_screen.dart';
import 'issue_status_screen.dart';
import 'new_complaint_screen.dart';
import '../theme/bc_theme.dart';

String _ago(DateTime t) {
  final d = DateTime.now().difference(t);
  if (d.inMinutes < 1) return tr('Just now');
  if (d.inMinutes < 60) return tr('{n} min ago', {'n': d.inMinutes});
  if (d.inHours < 24) return tr('{n} h ago', {'n': d.inHours});
  return Format.dateTime(t.toIso8601String());
}

/// QuickDrop "Notifications": alerts received on this phone, newest first, grouped by day.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _unreadOnly = false;

  @override
  void initState() {
    super.initState();
    NotificationInbox.instance.load();
  }

  /// Marks the notification read and opens what it is about (complaints / branch requests).
  void _open(InboxItem item) {
    NotificationInbox.instance.markRead(item);
    final Widget? page = switch (item.type) {
      kComplaintUpdateType => const ComplaintsScreen(),
      kBranchRequestUpdateType => const BranchesScreen(),
      _ => null,
    };
    if (page != null) Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
  }

  static DateTime _day(DateTime t) => DateTime(t.year, t.month, t.day);

  static String _dayLabel(DateTime day) {
    final today = _day(DateTime.now());
    if (day == today) return tr('Today');
    if (day == today.subtract(const Duration(days: 1))) return tr('Yesterday');
    return DateFormat('EEE, MMM d').format(day);
  }

  /// "1 h ago" today, "Yesterday 1:42 PM", "Thu, Nov 5 11:43 AM" before that.
  static String _when(DateTime t) {
    final today = _day(DateTime.now());
    final day = _day(t);
    final clock = DateFormat('h:mm a').format(t);
    if (day == today) return _ago(t);
    if (day == today.subtract(const Duration(days: 1))) return '${tr('Yesterday')} $clock';
    return '${DateFormat('EEE, MMM d').format(t)} $clock';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final inbox = NotificationInbox.instance;
    return Scaffold(
      backgroundColor: c.background,
      body: ListenableBuilder(
        listenable: inbox,
        builder: (context, _) {
          final visible = _unreadOnly ? inbox.items.where((e) => !e.read).toList() : inbox.items;
          // Newest first; one group per calendar day.
          final groups = <(DateTime, List<InboxItem>)>[];
          for (final n in visible) {
            final day = _day(n.at);
            if (groups.isNotEmpty && groups.last.$1 == day) {
              groups.last.$2.add(n);
            } else {
              groups.add((day, [n]));
            }
          }
          return Column(
            children: [
              QdAppBar(
                title: tr('Notifications'),
                onBack: () => Navigator.of(context).pop(),
                trailing: inbox.unread == 0
                    ? null
                    : Tooltip(
                        message: tr('Mark all as read'),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: () {
                            BcFeedback.tap();
                            inbox.markAllRead();
                          },
                          child: SizedBox(
                            width: 44,
                            height: 44,
                            child: Icon(Icons.done_all_rounded, color: c.foreground, size: 24),
                          ),
                        ),
                      ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(10, 12, 10, 32),
                  children: [
                    Row(
                      children: [
                        _FilterChip(label: tr('All'), selected: !_unreadOnly, onTap: () => setState(() => _unreadOnly = false)),
                        const SizedBox(width: 8),
                        _FilterChip(
                          label: tr('Unread ({n})', {'n': inbox.unread}),
                          selected: _unreadOnly,
                          onTap: () => setState(() => _unreadOnly = true),
                        ),
                      ],
                    ),
                    if (visible.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 48),
                        child: _unreadOnly
                            ? _Empty(
                                icon: Icons.mark_email_read_outlined,
                                title: tr('You are all caught up'),
                                message: tr('No unread notifications.'),
                              )
                            : _Empty(
                                icon: Icons.notifications_none_rounded,
                                title: tr('No notifications yet'),
                                message: tr('New job alerts and updates will show up here.'),
                              ),
                      )
                    else
                      for (final g in groups) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
                          child: Text(
                            _dayLabel(g.$1),
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.mutedForeground),
                          ),
                        ),
                        QdCard(
                          padding: EdgeInsets.zero,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(BcRadius.lg),
                            child: Column(
                              children: [
                                for (var i = 0; i < g.$2.length; i++) ...[
                                  if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                                  _NotificationRow(item: g.$2[i], when: _when(g.$2[i].at), onTap: () => _open(g.$2[i])),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Material(
      color: selected ? c.action : c.surface,
      shape: StadiumBorder(side: BorderSide(color: selected ? c.action : c.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          BcFeedback.tap();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: selected ? c.actionForeground : c.foreground,
            ),
          ),
        ),
      ),
    );
  }
}

/// Icon, tint and label for a push `type`.
({IconData icon, Color bg, Color fg, String label}) _typeStyle(BcColors c, String type) {
  final t = type.toUpperCase();
  if (t.contains('CANCEL')) {
    return (icon: Icons.cancel_outlined, bg: c.errorSoftBg, fg: c.errorStrong, label: tr('Cancelled'));
  }
  if (t.contains('COMPLAINT') || t.contains('SUPPORT') || t.contains('ISSUE') || t.contains('ADMIN')) {
    return (icon: Icons.headset_mic_outlined, bg: c.successSoft, fg: c.successStrong, label: tr('Support'));
  }
  if (t.contains('BREAKDOWN')) {
    return (icon: Icons.build_outlined, bg: c.warningSoft, fg: c.warningStrong, label: tr('Breakdown'));
  }
  if (t.contains('BRANCH')) {
    return (icon: Icons.swap_horiz_rounded, bg: c.primarySoft, fg: c.primaryStrong, label: tr('Branch'));
  }
  if (t.contains('JOB') || t.contains('ORDER') || t.contains('RIDE')) {
    return (icon: Icons.inventory_2_outlined, bg: c.primarySoft, fg: c.primaryStrong, label: tr('Job update'));
  }
  return (icon: Icons.campaign_outlined, bg: c.muted, fg: c.mutedForeground, label: tr('Announcement'));
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.item, required this.when, required this.onTap});
  final InboxItem item;
  final String when;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final style = _typeStyle(c, item.type);
    final unread = !item.read;
    return InkWell(
      onTap: onTap,
      child: Container(
        color: unread ? c.primarySoft.withValues(alpha: 0.4) : null,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: style.bg, shape: BoxShape.circle),
              child: Icon(style.icon, color: style.fg, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          item.title,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                            color: c.foreground,
                          ),
                        ),
                      ),
                      if (unread)
                        Container(
                          margin: const EdgeInsets.only(top: 6, left: 8),
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
                        ),
                    ],
                  ),
                  if (item.body.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(item.body, style: TextStyle(fontSize: 14, color: c.mutedForeground, height: 1.35)),
                  ],
                  const SizedBox(height: 4),
                  Text('${style.label} · $when', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.message});
  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(color: c.primarySoft, shape: BoxShape.circle),
              child: Icon(icon, size: 38, color: c.primaryStrong),
            ),
            const SizedBox(height: 12),
            Text(title, style: BcType.section.copyWith(color: c.foreground)),
            const SizedBox(height: 6),
            Text(message, textAlign: TextAlign.center, style: BcType.caption.copyWith(color: c.mutedForeground)),
          ],
        ),
      ),
    );
  }
}

/// QuickDrop "Complaints": the rider's complaints (`GET /delivery/me/complaints`).
class ComplaintsScreen extends StatefulWidget {
  const ComplaintsScreen({super.key});

  @override
  State<ComplaintsScreen> createState() => _ComplaintsScreenState();
}

class _ComplaintsScreenState extends State<ComplaintsScreen> {
  late Future<List<DriverComplaint>> _future = _load();

  Future<List<DriverComplaint>> _load() => context.read<AppContainer>().jobsRepository.listComplaints();

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Scaffold(
      backgroundColor: c.background,
      body: Column(
        children: [
          QdAppBar(
            title: tr('Complaints'),
            onBack: () => Navigator.of(context).pop(),
          ),
          Expanded(
            child: FutureBuilder<List<DriverComplaint>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return BcErrorState(
                    message: tr('Could not load your complaints.'),
                    onRetry: () => setState(() => _future = _load()),
                  );
                }
                final list = snap.data ?? const [];
                if (list.isEmpty) {
                  return _Empty(
                    icon: Icons.fact_check_outlined,
                    title: tr('No complaints'),
                    message: tr('Report a problem from an order and it will be tracked here.'),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async {
                    setState(() => _future = _load());
                    await _future;
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(10, 12, 10, 32),
                    itemCount: list.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => _ComplaintCard(list[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ComplaintCard extends StatelessWidget {
  const _ComplaintCard(this.item);
  final DriverComplaint item;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final stage = IssueStage.of(item.status);
    return QdCard(
      padding: const EdgeInsets.all(12),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => IssueStatusScreen(complaint: item)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(item.category, style: BcType.bodyStrong.copyWith(color: c.foreground))),
                    const SizedBox(width: 8),
                    QdBadge(stage.label, tone: stage.tone, dot: true),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  item.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, color: c.mutedForeground),
                ),
                const SizedBox(height: 8),
                Text(Format.dateTime(item.createdAt), style: TextStyle(fontSize: 12, color: c.subtleForeground)),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Icon(Icons.chevron_right_rounded, color: c.iconMuted),
        ],
      ),
    );
  }
}


const _faqs = <(String, String)>[
  ('When do I get paid?', 'Earnings are paid weekly every Tuesday to the bank account registered with your branch. You are paid for every delivered order; cancelled or handed-over orders are not paid.'),
  ('How is my acceptance rate calculated?', 'It is the share of job offers you accepted out of all offers you received, including declined and missed ones. See it on the Activity tab.'),
  ("What if the customer isn't available?", 'Open the order and choose Report a problem, then Customer unavailable. The order is put on hold and you can keep delivering your other orders while support contacts the customer.'),
  ("The customer doesn't have a delivery code", 'Report the order with Incorrect or missing code. Support will send the customer a new code by SMS.'),
  ('How do I handle cash on delivery?', 'Collect the exact amount shown before handing over the order, and hand the cash to your branch at the end of your shift.'),
  ('My vehicle broke down during a job', 'Report a vehicle breakdown from the active job or Profile. Support will assign a replacement rider and guide you through handing over your orders.'),
  ('How do I change my branch?', 'Go to Profile, then Branch management, and choose Request branch change. Your branches change only after support approves the request.'),
  ('I forgot my app lock PIN', 'On the lock screen, choose Sign in with phone number. After signing in with the code sent by SMS, you can set a new PIN in Settings.'),
];

/// QuickDrop "Help & Support": contact, complaints and FAQ.
class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  int _open = 0;
  int? _expanded;

  @override
  void initState() {
    super.initState();
    _loadCount();
  }

  Future<void> _loadCount() async {
    try {
      final list = await context.read<AppContainer>().jobsRepository.listComplaints();
      final n = list.where((e) => !IssueStage.of(e.status).closed).length;
      if (mounted) setState(() => _open = n);
    } catch (_) {}
  }

  Future<void> _launch(Uri uri) async {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Could not open this on your phone.'))));
    }
  }

  Future<void> _push(Widget page) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
    _loadCount();
  }

  Widget _section(String title) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
    child: Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: context.bc.foreground)),
  );

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdPage(
      title: tr('Help & Support'),
      children: [
        _section(tr('Contact Support')),
        QdGroup(
          children: [
            QdRow(
              icon: Icons.call_outlined,
              title: tr('Call rider support'),
              subtitle: SupportContact.intl,
              onTap: () => _launch(Uri.parse('tel:${SupportContact.phone}')),
            ),
            QdRow(
              icon: Icons.chat_bubble_outline_rounded,
              title: tr('Chat on WhatsApp'),
              onTap: () => _launch(Uri.parse(SupportContact.whatsapp)),
            ),
            QdRow(
              icon: Icons.mail_outline_rounded,
              title: tr('Email support'),
              subtitle: SupportContact.email,
              onTap: () => _launch(Uri.parse('mailto:${SupportContact.email}')),
            ),
          ],
        ),
        QdFootnote(tr('Rider support is available daily, 7:00 AM – 11:00 PM.')),
        const SizedBox(height: 24),
        _section(tr('Complaints')),
        QdGroup(
          children: [
            QdRow(
              icon: Icons.report_gmailerrorred_rounded,
              title: tr('Report a complaint'),
              subtitle: tr('Payments, branch staff, app problems or safety'),
              onTap: () => _push(const NewComplaintScreen()),
            ),
            QdRow(
              icon: Icons.checklist_rounded,
              title: tr('My complaints'),
              subtitle: tr('Track your complaints and replies'),
              trailing: _open > 0
                  ? Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        QdBadge('$_open', tone: QdTone.warning),
                        const SizedBox(width: 6),
                        Icon(Icons.chevron_right_rounded, color: c.iconMuted, size: 24),
                      ],
                    )
                  : null,
              onTap: () => _push(const ComplaintsScreen()),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 14, 4, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded, size: 20, color: c.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  tr('Problems with a specific order? Report them from the order screen during the delivery.'),
                  style: TextStyle(fontSize: 15, color: c.mutedForeground, height: 1.4),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        _section(tr('Frequently Asked Questions')),
        QdCard(
          padding: EdgeInsets.zero,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(BcRadius.lg),
            child: Material(
              type: MaterialType.transparency,
              child: Column(
                children: [
                  for (var i = 0; i < _faqs.length; i++) ...[
                    if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                    InkWell(
                      onTap: () {
                        BcFeedback.tap();
                        setState(() => _expanded = _expanded == i ? null : i);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    tr(_faqs[i].$1),
                                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Icon(_expanded == i ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: c.iconMuted, size: 24),
                              ],
                            ),
                            if (_expanded == i) ...[
                              const SizedBox(height: 8),
                              Text(tr(_faqs[i].$2), style: TextStyle(fontSize: 15, color: c.mutedForeground, height: 1.45)),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
