import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../data/models/driver.dart';
import '../../l10n/l10n.dart';
import '../../state/jobs_controller.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';

/// Live `hh:mm:ss` since [since] (QuickDrop `ElapsedClock`). Ticks once a second.
class ElapsedClock extends StatefulWidget {
  const ElapsedClock({super.key, required this.since, this.style});

  final DateTime since;
  final TextStyle? style;

  @override
  State<ElapsedClock> createState() => _ElapsedClockState();
}

class _ElapsedClockState extends State<ElapsedClock> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final secs = DateTime.now().difference(widget.since).inSeconds.clamp(0, 1 << 31);
    String two(int v) => v.toString().padLeft(2, '0');
    final text = '${two(secs ~/ 3600)}:${two((secs % 3600) ~/ 60)}:${two(secs % 60)}';
    return Text(text, style: (widget.style ?? const TextStyle()).copyWith(fontFeatures: const [FontFeature.tabularFigures()]));
  }
}

/// Shift history (QuickDrop shifts/index.tsx): current shift card, then past shifts.
class ShiftsScreen extends StatefulWidget {
  const ShiftsScreen({super.key});

  @override
  State<ShiftsScreen> createState() => _ShiftsScreenState();
}

class _ShiftsScreenState extends State<ShiftsScreen> {
  late Future<List<DriverShiftEntry>> _future = context.read<JobsController>().getShiftHistory();

  @override
  void initState() {
    super.initState();
    final vm = context.read<JobsController>();
    if (!vm.historyLoaded) vm.loadHistory();
  }

  Future<void> _reload() async {
    final vm = context.read<JobsController>();
    final f = vm.getShiftHistory();
    setState(() => _future = f);
    vm.loadHistory(force: true);
    try {
      await f;
    } catch (_) {}
  }

  /// Jobs finished while the shift was open (derived from job history).
  int _jobCount(DriverShiftEntry s, List<JobHistoryItem> history) {
    final start = Format.toLocal(s.startedAt);
    if (start == null) return 0;
    final end = Format.toLocal(s.endedAt) ?? DateTime.now();
    var n = 0;
    for (final j in history) {
      final t = Format.toLocal(j.completedAt);
      if (t != null && !t.isBefore(start) && !t.isAfter(end)) n++;
    }
    return n;
  }

  String _jobsLabel(int n) => n == 1 ? tr('1 job') : tr('{count} jobs', {'count': n});

  String _time(String? iso) {
    final t = Format.toLocal(iso);
    return t == null ? '—' : DateFormat('h:mm a', L10n.dateLocale).format(t);
  }

  String _day(String iso) {
    final t = Format.toLocal(iso);
    if (t == null) return '—';
    final now = DateTime.now();
    if (t.year == now.year && t.month == now.month && t.day == now.day) return tr('Today');
    return DateFormat('EEE, MMM d', L10n.dateLocale).format(t);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final history = context.watch<JobsController>().history;
    return FutureBuilder<List<DriverShiftEntry>>(
      future: _future,
      builder: (context, snap) {
        final List<Widget> body;
        if (snap.connectionState != ConnectionState.done) {
          body = [
            Padding(
              padding: const EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator(color: c.primary)),
            ),
          ];
        } else if (snap.hasError) {
          final e = snap.error;
          body = [
            QdEmpty(
              icon: Icons.error_outline_rounded,
              title: tr('Could not load shift history'),
              message: e is StateError ? e.message : null,
            ),
            QdPillButton(label: tr('Retry'), style: QdPillStyle.soft, onPressed: _reload),
          ];
        } else {
          final all = snap.data ?? const <DriverShiftEntry>[];
          final active = all.where((s) => s.endedAt == null).toList();
          final past = all.where((s) => s.endedAt != null).toList();
          if (all.isEmpty) {
            body = [
              QdEmpty(
                icon: Icons.event_busy_outlined,
                title: tr('No shifts yet'),
                message: tr('Go online from Home to start a shift. Shifts are recorded automatically.'),
              ),
            ];
          } else {
            body = [
              if (active.isNotEmpty) ...[
                QdSectionTitle(tr('Current Shift'), topGap: 0),
                QdCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          QdBadge(tr('Ongoing'), tone: QdTone.success, dot: true),
                          if (Format.toLocal(active.first.startedAt) case final start?)
                            ElapsedClock(
                              since: start,
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: c.foreground),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            tr('Started {time}', {'time': _time(active.first.startedAt)}),
                            style: TextStyle(fontSize: 14, color: c.mutedForeground),
                          ),
                          Text(
                            _jobsLabel(_jobCount(active.first, history)),
                            style: TextStyle(fontSize: 14, color: c.mutedForeground),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
              if (past.isNotEmpty) ...[
                QdSectionTitle(tr('Past Shifts'), topGap: active.isEmpty ? 0 : 24),
                QdCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < past.length; i++) ...[
                        if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _day(past[i].startedAt),
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${_time(past[i].startedAt)} – ${_time(past[i].endedAt)}',
                                      style: TextStyle(fontSize: 14, color: c.mutedForeground),
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    Format.duration(past[i].durationMinutes),
                                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    _jobsLabel(_jobCount(past[i], history)),
                                    style: TextStyle(fontSize: 14, color: c.mutedForeground),
                                  ),
                                ],
                              ),
                              const SizedBox(width: 8),
                              Icon(Icons.chevron_right_rounded, size: 22, color: c.mutedForeground),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ];
          }
        }
        return QdPage(title: tr('Shift History'), onRefresh: _reload, children: body);
      },
    );
  }
}
