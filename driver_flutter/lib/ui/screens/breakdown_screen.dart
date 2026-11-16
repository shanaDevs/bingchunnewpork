import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/local_profile.dart';
import '../../data/models/delivery_job.dart';
import '../../l10n/l10n.dart';
import '../../state/jobs_controller.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';
import 'report_breakdown_screen.dart';

/// Breakdown status: every breakdown this rider has reported, newest first. Tap one to open
/// its Breakdown & Handover screen.
///
/// There is no dedicated status API. The list is derived from `GET delivery/jobs/history`
/// (rides ending as VEHICLE_FAILURE: time, ride code, branch, orders). The reason and
/// description come from the server (`orders[].failureNote`), with the copy kept on this
/// phone as a fallback; handover progress follows the handed-over orders' current status.
class BreakdownScreen extends StatefulWidget {
  const BreakdownScreen({super.key});

  @override
  State<BreakdownScreen> createState() => _BreakdownScreenState();
}

bool _isBreakdown(JobHistoryItem r) => r.isVehicleFailure;

DateTime? _reportedAt(JobHistoryItem? r) => r == null ? null : DateTime.tryParse(r.completedAt ?? r.scheduledAt);

/// All breakdown rides from the server history, newest first.
List<JobHistoryItem> breakdownRides(JobsController vm) {
  final rides = vm.history.where(_isBreakdown).toList();
  rides.sort((a, b) {
    final ta = _reportedAt(a);
    final tb = _reportedAt(b);
    if (ta == null || tb == null) return 0;
    return tb.compareTo(ta);
  });
  return rides;
}

/// Most recent breakdown ride from the server history (null when there is none).
JobHistoryItem? latestBreakdownRide(JobsController vm) {
  final rides = breakdownRides(vm);
  return rides.isEmpty ? null : rides.first;
}

/// The "Type: description" for a report: the note stored on the server, else the copy saved
/// on this phone per ride, or (for the last report sent before per-ride storage existed)
/// matched by time.
String? _noteFor(JobHistoryItem r) {
  final server = r.vehicleFailureNote;
  if (server != null) return server;
  final lp = LocalProfile.instance;
  final saved = lp.breakdownNotes[r.id];
  if (saved != null) return saved;
  final at = _reportedAt(r);
  final localAt = lp.lastBreakdownAt;
  if (at != null && localAt != null && localAt.difference(at).abs().inMinutes <= 10) return lp.lastBreakdownNote;
  return null;
}

/// Where a breakdown is in the handover, matching the tracker steps
/// (Reported -> Finding rider -> Handover -> Done). [_stageDone] marks every step complete.
const _stageFinding = 1;
const _stageHandover = 2;
const _stageDone = 4;

/// What happened to the stops left on a broken-down ride.
///
/// [total]: stops handed over. [settled]/[delivered]: how many of those are now
/// delivered/cancelled (by the replacement rider). [tracked] is false when the server sent no
/// per-stop rows (`orders[]` in history — older backends): then only [total] is known, from
/// the ride's counts, and progress can't be shown.
typedef _Handover = ({int total, int settled, int delivered, bool tracked});

_Handover _handoverFor(JobHistoryItem r) {
  if (r.orders.isEmpty) {
    final left = r.orderCount - r.deliveredCount;
    return (total: left < 0 ? 0 : left, settled: 0, delivered: 0, tracked: false);
  }
  var handed = r.handedOverOrders;
  // Rows without a VEHICLE_FAILURE attempt (e.g. seeded rides): every stop not finished
  // before the breakdown is still waiting for another rider.
  if (handed.isEmpty) handed = r.orders.where((o) => !o.isSettled).toList();
  return (
    total: handed.length,
    settled: handed.where((o) => o.isSettled).length,
    delivered: handed.where((o) => o.isDelivered).length,
    tracked: true,
  );
}

/// Tracker step from [_handoverFor]: nothing settled yet -> support is finding a rider; some
/// delivered/cancelled -> handover under way; all settled, or nothing was left -> done.
/// Without per-stop data it stays on "Finding rider" — never shown as done on a guess.
int _stageFor(JobHistoryItem r) {
  final h = _handoverFor(r);
  if (h.total == 0) return _stageDone;
  if (!h.tracked) return _stageFinding;
  if (h.settled == h.total) return _stageDone;
  return h.settled > 0 ? _stageHandover : _stageFinding;
}

/// Splits a note (`type: description`) into its reason and description.
({String? type, String? description}) _splitNote(String? note) {
  if (note == null) return (type: null, description: null);
  final i = note.indexOf(': ');
  return i > 0 ? (type: note.substring(0, i), description: note.substring(i + 2)) : (type: null, description: note);
}

class _BreakdownScreenState extends State<BreakdownScreen> {
  @override
  void initState() {
    super.initState();
    LocalProfile.instance.load();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<JobsController>().loadHistory(force: true);
    });
  }

  Future<void> _report(JobsController vm) async {
    BcFeedback.tap();
    final ok = await ReportBreakdownScreen.open(context, onSubmit: vm.reportVehicleFailure);
    ok ? BcFeedback.success() : BcFeedback.error();
  }

  void _open(JobHistoryItem r, bool open) {
    BcFeedback.tap();
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => BreakdownDetailScreen(report: r, open: open)));
  }

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<JobsController>();
    final rides = breakdownRides(vm);
    return ListenableBuilder(
      listenable: LocalProfile.instance,
      builder: (context, _) => QdPage(
        title: tr('Breakdown status'),
        footer: QdPillButton(
          label: tr('Report vehicle breakdown'),
          icon: Icons.build_outlined,
          onPressed: vm.isOnline ? () => _report(vm) : null,
        ),
        fill: rides.isEmpty && !(vm.historyLoading && !vm.historyLoaded)
            ? BcEmptyState(
                icon: Icons.two_wheeler_rounded,
                badgeIcon: Icons.check_rounded,
                tone: BcEmptyTone.success,
                title: tr('No breakdown reported'),
                message: tr(
                  'If your vehicle breaks down, report it so support can send another rider and knows where to find you.',
                ),
                footer: vm.isOnline ? null : QdFootnote(tr('Go on duty to report a vehicle failure.')),
              )
            : null,
        children: [
          if (rides.isEmpty && vm.historyLoading && !vm.historyLoaded)
            const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
          else
            for (final r in rides)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _BreakdownRow(
                  report: r,
                  open: isBreakdownReportOpen(vm, r),
                  onTap: () => _open(r, isBreakdownReportOpen(vm, r)),
                ),
              ),
          if (!vm.isOnline && rides.isNotEmpty) QdFootnote(tr('Go on duty to report a vehicle failure.')),
        ],
      ),
    );
  }
}

/// One reported breakdown in the list: reason, ride, orders, time and state.
class _BreakdownRow extends StatelessWidget {
  const _BreakdownRow({required this.report, required this.open, required this.onTap});

  final JobHistoryItem report;
  final bool open;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final title = _splitNote(_noteFor(report)).type ?? tr('Vehicle breakdown');
    final code = report.rideCode;
    final ride = code != null && code.isNotEmpty ? code : report.title;
    final active = open;
    return QdCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          QdIconTile(Icons.build_outlined, bg: c.warningSoft, tint: c.warningStrong),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground)),
                const SizedBox(height: 2),
                Text(
                  '$ride · ${report.orderCount} ${tr('orders')}',
                  style: TextStyle(fontSize: 13, color: c.mutedForeground),
                ),
                const SizedBox(height: 2),
                Text(
                  Format.jobDateTime(report.completedAt ?? report.scheduledAt),
                  style: TextStyle(fontSize: 13, color: c.mutedForeground),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _StageBadge(stage: _stageFor(report), open: active),
              const SizedBox(height: 8),
              Icon(Icons.chevron_right_rounded, color: c.mutedForeground),
            ],
          ),
        ],
      ),
    );
  }
}

/// Breakdown & Handover (QuickDrop breakdown/index.tsx) for one report. The tracker follows
/// the handed-over orders (see [_stageFor]); the spot is the position saved with the report.
class BreakdownDetailScreen extends StatelessWidget {
  const BreakdownDetailScreen({super.key, required this.report, required this.open});

  final JobHistoryItem report;

  /// Whether this is the rider's current, still-open breakdown (see [isBreakdownOpen]).
  final bool open;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return ListenableBuilder(
      listenable: LocalProfile.instance,
      builder: (context, _) {
        final parts = _splitNote(_noteFor(report));
        final code = report.rideCode;
        final rideText = code != null && code.isNotEmpty ? code : report.title;
        final when = Format.jobDateTime(report.completedAt ?? report.scheduledAt);
        final stage = _stageFor(report);
        final handover = _handoverFor(report);
        final handedCount = handover.total;
        final settled = handover.settled;
        final spot = LocalProfile.instance.breakdownSpots[report.id];
        return QdPage(
          title: tr('Breakdown & Handover'),
          children: [
            _StatusCard(
              title: parts.type ?? tr('Vehicle breakdown'),
              subtitle: '${tr('Reported')} $when · $rideText',
              stage: stage,
              message: open
                  ? tr("You won't receive new jobs until you're back on the road.")
                  : tr("You're back on the road."),
            ),
            QdSectionTitle(tr('Description')),
            QdCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    parts.description ?? tr('Breakdown reported to support.'),
                    style: TextStyle(fontSize: 15, color: c.foreground, height: 1.4),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.place_outlined, size: 16, color: c.mutedForeground),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          spot != null
                              ? '${spot.lat.toStringAsFixed(5)}, ${spot.lng.toStringAsFixed(5)} · ${report.storeName}'
                              : '${tr('Near')} ${report.storeName}',
                          style: TextStyle(fontSize: 13, color: c.mutedForeground),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (spot != null) ...[
              QdSectionTitle(tr('Breakdown location')),
              QdCard(
                padding: const EdgeInsets.all(10),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(BcRadius.md),
                  child: SizedBox(
                    height: 160,
                    child: GoogleMap(
                      initialCameraPosition: CameraPosition(target: LatLng(spot.lat, spot.lng), zoom: 15),
                      markers: {Marker(markerId: const MarkerId('breakdown'), position: LatLng(spot.lat, spot.lng))},
                      liteModeEnabled: true,
                      zoomControlsEnabled: false,
                      myLocationButtonEnabled: false,
                      mapToolbarEnabled: false,
                      compassEnabled: false,
                    ),
                  ),
                ),
              ),
            ],
            QdSectionTitle(tr('Orders')),
            QdCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _CountRow(label: tr('Orders on this ride'), value: '${report.orderCount}'),
                  _CountRow(label: tr('Delivered before the breakdown'), value: '${report.deliveredCount}'),
                  _CountRow(label: tr('Handed over to another rider'), value: '$handedCount'),
                  if (handedCount > 0 && handover.tracked)
                    _CountRow(label: tr('Delivered by the new rider'), value: '${handover.delivered} / $handedCount'),
                ],
              ),
            ),
            QdSectionTitle(tr('Updates')),
            QdCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _TimelineEntry(author: tr('You'), at: when, message: tr('Breakdown reported to support.')),
                  const SizedBox(height: 14),
                  if (handedCount == 0)
                    _TimelineEntry(
                      author: tr('Support'),
                      message: tr('No orders were left to hand over. The ride was closed.'),
                    )
                  else ...[
                    _TimelineEntry(
                      author: tr('Support'),
                      message: tr('{n} orders released for another rider to deliver.', {'n': handedCount}),
                    ),
                    if (settled > 0) ...[
                      const SizedBox(height: 14),
                      _TimelineEntry(
                        author: tr('Support'),
                        message: stage == _stageDone
                            ? tr('Handover complete. All released orders are settled.')
                            : tr('{done} of {total} released orders settled.', {'done': settled, 'total': handedCount}),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// The server has no "breakdown closed" signal, so a breakdown counts as over once the rider
/// is running a delivery again (a run IN_PROGRESS / RETURNING).
bool _riderBackOnRoad(JobsController vm) => vm.jobs.any((j) => j.status == 'IN_PROGRESS' || j.status == 'RETURNING');

/// True when [r] is the rider's newest breakdown and they are not yet back on a run.
bool isBreakdownReportOpen(JobsController vm, JobHistoryItem r) =>
    latestBreakdownRide(vm)?.id == r.id && !_riderBackOnRoad(vm);

/// True while the rider's latest reported breakdown is still open.
bool isBreakdownOpen(JobsController vm) {
  final latest = latestBreakdownRide(vm);
  return latest != null && isBreakdownReportOpen(vm, latest);
}

/// Opens the Breakdown status list from Home (banner and active-job card).
void openBreakdownStatus(BuildContext context) {
  BcFeedback.tap();
  // JobsController lives in the home shell; pushed pages need it passed along.
  final vm = context.read<JobsController>();
  Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => ChangeNotifierProvider<JobsController>.value(value: vm, child: const BreakdownScreen()),
    ),
  );
}

/// Home-screen notice while a breakdown is open (QuickDrop BreakdownBanner).
class BreakdownBanner extends StatefulWidget {
  const BreakdownBanner({super.key});

  @override
  State<BreakdownBanner> createState() => _BreakdownBannerState();
}

class _BreakdownBannerState extends State<BreakdownBanner> {
  @override
  void initState() {
    super.initState();
    LocalProfile.instance.load();
    // Cached after the first load, so this is cheap on later visits to Home.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<JobsController>().loadHistory();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    return Builder(
      builder: (context) {
        if (!isBreakdownOpen(vm)) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: c.warningSoft,
              borderRadius: BorderRadius.circular(BcRadius.xl),
              border: Border.all(color: c.warning),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.build_outlined, color: c.warningStrong, size: 24),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            crossAxisAlignment: WrapCrossAlignment.center,
                            spacing: 8,
                            children: [
                              Text(
                                tr('Vehicle breakdown'),
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                              ),
                              QdBadge(tr('Reported'), tone: QdTone.warning, dot: true),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            tr("You won't receive new jobs until you're back on the road."),
                            style: TextStyle(fontSize: 14, color: c.foreground, height: 1.35),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.foreground,
                      side: BorderSide(color: c.warning),
                      shape: const StadiumBorder(),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    onPressed: () => openBreakdownStatus(context),
                    child: Text(tr('View breakdown status'), style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

const _steps = ['Reported', 'Finding rider', 'Handover', 'Done'];

/// Gradient header card: type, report time + ride, 4-step tracker and a notice.
class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.title, required this.subtitle, required this.message, required this.stage});

  final String title;
  final String subtitle;
  final String message;

  /// Current tracker step (see [_stageFor]).
  final int stage;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BcRadius.xxl),
        gradient: LinearGradient(colors: c.brandGradient, begin: Alignment.topRight, end: Alignment.bottomLeft),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), shape: BoxShape.circle),
                child: Icon(Icons.build_outlined, color: c.onBrand, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: c.onBrand)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: TextStyle(fontSize: 13, color: c.onBrandMuted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _Stepper(current: stage, c: c),
          const SizedBox(height: 14),
          Divider(height: 1, color: Colors.white.withValues(alpha: 0.2)),
          const SizedBox(height: 12),
          Text(message, style: TextStyle(fontSize: 14, color: c.onBrand, height: 1.35)),
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.current, required this.c});

  final int current;
  final BcColors c;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < _steps.length; i++)
          Expanded(
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: i == 0
                          ? const SizedBox()
                          : Container(height: 2, color: Colors.white.withValues(alpha: i <= current ? 0.9 : 0.3)),
                    ),
                    _Dot(index: i, state: i < current ? 2 : (i == current ? 1 : 0), c: c),
                    Expanded(
                      child: i == _steps.length - 1
                          ? const SizedBox()
                          : Container(height: 2, color: Colors.white.withValues(alpha: i < current ? 0.9 : 0.3)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  tr(_steps[i]),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: i == current ? FontWeight.w700 : FontWeight.w500,
                    color: i <= current ? c.onBrand : c.onBrandMuted,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// state: 0 upcoming, 1 current, 2 done.
class _Dot extends StatelessWidget {
  const _Dot({required this.index, required this.state, required this.c});

  final int index;
  final int state;
  final BcColors c;

  @override
  Widget build(BuildContext context) {
    final current = state == 1;
    final done = state == 2;
    return Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: current ? c.accent : (done ? Colors.white : Colors.transparent),
        border: current ? null : Border.all(color: Colors.white.withValues(alpha: done ? 1 : 0.5), width: 1.5),
      ),
      child: done
          ? Icon(Icons.check_rounded, size: 16, color: c.primaryStrong)
          : Text(
              '${index + 1}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: current ? c.accentForeground : c.onBrand,
              ),
            ),
    );
  }
}

class _TimelineEntry extends StatelessWidget {
  const _TimelineEntry({required this.author, this.at, required this.message});

  final String author;

  /// When it happened; null for steps the server gives no time for.
  final String? at;
  final String message;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 10,
          height: 10,
          margin: const EdgeInsets.only(top: 4, right: 12),
          decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(at == null ? author : '$author · $at', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              const SizedBox(height: 2),
              Text(message, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.foreground)),
            ],
          ),
        ),
      ],
    );
  }
}

/// Badge on a breakdown row: where the handover stands.
class _StageBadge extends StatelessWidget {
  const _StageBadge({required this.stage, required this.open});

  final int stage;

  /// The rider's latest breakdown and they are not back on a run yet.
  final bool open;

  @override
  Widget build(BuildContext context) {
    if (stage == _stageDone) return QdBadge(open ? tr('Handed over') : tr('Closed'), tone: QdTone.neutral);
    if (stage == _stageHandover) return QdBadge(tr('Handover'), tone: QdTone.warning, dot: true);
    return QdBadge(tr('Finding rider'), tone: QdTone.warning, dot: true);
  }
}

/// Label / value line in the Orders card.
class _CountRow extends StatelessWidget {
  const _CountRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: c.mutedForeground))),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.foreground)),
        ],
      ),
    );
  }
}
