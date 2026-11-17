import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/events.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/local_profile.dart';
import '../../data/models/breakdown_handover.dart';
import '../../data/models/delivery_job.dart';
import '../../data/network/api_exception.dart';
import '../../l10n/l10n.dart';
import '../../state/jobs_controller.dart';
import '../components/bc_dialog.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';
import 'breakdown_handover_view.dart';
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

/// Phase from [_handoverFor]: nothing settled yet -> support is finding a rider; some
/// delivered/cancelled -> a replacement has it; all settled -> handover complete; nothing left
/// -> no handover needed. Without per-stop data it stays on "Finding a rider" — never shown
/// as done on a guess.
BreakdownPhase _phaseFor(JobHistoryItem r) {
  final h = _handoverFor(r);
  if (h.total == 0) return BreakdownPhase.acknowledged;
  if (!h.tracked) return BreakdownPhase.findingRider;
  if (h.settled == h.total) return BreakdownPhase.handoverComplete;
  return h.settled > 0 ? BreakdownPhase.riderAssigned : BreakdownPhase.findingRider;
}

/// Orders of [h] with the hand-overs this rider confirmed on the phone applied.
List<HandoverOrder> _withLocalHandovers(BreakdownHandover h, String jobId) {
  final local = LocalProfile.instance.handedOverOrders[jobId] ?? const <String>{};
  return [
    for (final o in h.orders)
      local.contains(o.orderId) && !o.handedOver
          ? HandoverOrder(
              orderId: o.orderId,
              orderNumber: o.orderNumber,
              status: o.status,
              area: o.area,
              itemCount: o.itemCount,
              handedOver: true,
              deliveredAt: o.deliveredAt,
            )
          : o,
  ];
}

int _handedCount(List<HandoverOrder> orders) =>
    orders.where((o) => o.handedOver || o.isDelivered || o.isCancelled).length;

/// The server's stage, moved to Done once every order is handed over (server or phone).
BreakdownPhase _effectivePhase(BreakdownHandover h, List<HandoverOrder> orders) {
  final phase = handoverPhase(h);
  if (phase == BreakdownPhase.riderAssigned && orders.isNotEmpty && _handedCount(orders) == orders.length) {
    return BreakdownPhase.handoverComplete;
  }
  return phase;
}

/// Latest handover status per ride, shared by the list, the Home banner and the detail
/// screen so their status chips agree. Ride history alone can't tell the handover stage.
class _HandoverStore extends ChangeNotifier {
  _HandoverStore() {
    // Admin assigned a rider / the breakdown was cleared: refetch on next use.
    BreakdownBus.events.listen(_fetchedAt.remove);
  }

  static const _maxAge = Duration(seconds: 30);

  final Map<String, BreakdownHandover> _byJob = {};
  final Map<String, DateTime> _fetchedAt = {};
  final Set<String> _loading = {};

  BreakdownHandover? operator [](String jobId) => _byJob[jobId];

  void put(String jobId, BreakdownHandover h) {
    _byJob[jobId] = h;
    _fetchedAt[jobId] = DateTime.now();
    notifyListeners();
  }

  /// Loads [jobId]'s handover unless it is loading or was fetched in the last [_maxAge].
  void ensure(AppContainer c, String jobId) {
    final at = _fetchedAt[jobId];
    if (jobId.isEmpty || (at != null && DateTime.now().difference(at) < _maxAge) || !_loading.add(jobId)) return;
    c.jobsRepository
        .getJobHandover(jobId)
        .then((h) => put(jobId, h))
        .catchError((_) {}) // older backend: stay on the history-based phase
        .whenComplete(() => _loading.remove(jobId));
  }
}

final _handoverStore = _HandoverStore();

/// Phase shown for a ride: from its handover status when loaded, else from history.
BreakdownPhase _rowPhase(JobHistoryItem r) {
  final h = _handoverStore[r.id];
  return h == null ? _phaseFor(r) : _effectivePhase(h, _withLocalHandovers(h, r.id));
}

/// "Near Welikada · 6.90000, 79.88000" — whatever is known about where it happened.
String _locationLabel({double? lat, double? lng, String? storeName}) {
  final parts = [
    if (storeName != null && storeName.trim().isNotEmpty)
      tr('Near {place}', {'place': Format.shortBranchName(storeName)}),
    if (lat != null && lng != null) '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}',
  ];
  return parts.isEmpty ? tr('Your location is shared with support.') : parts.join(' · ');
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
    // JobsController lives in the home shell; pushed pages need it passed along.
    final vm = context.read<JobsController>();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChangeNotifierProvider<JobsController>.value(
          value: vm,
          child: BreakdownDetailScreen(report: r, open: open),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<JobsController>();
    final rides = breakdownRides(vm);
    // Open breakdowns: fetch the live handover stage so the chip isn't stuck on history.
    final container = context.read<AppContainer>();
    for (final r in rides) {
      if (isBreakdownReportOpen(vm, r)) _handoverStore.ensure(container, r.id);
    }
    return ListenableBuilder(
      listenable: Listenable.merge([LocalProfile.instance, _handoverStore]),
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
              BreakdownPhaseBadge(phase: _rowPhase(report), open: active),
              const SizedBox(height: 8),
              Icon(Icons.chevron_right_rounded, color: c.mutedForeground),
            ],
          ),
        ],
      ),
    );
  }
}

/// Breakdown & Handover (QuickDrop breakdown/index.tsx) for one report.
///
/// Loads `GET delivery/jobs/:id/handover` — replacement rider, their live location, orders
/// to hand over and updates — and refreshes it every [_pollEvery] until the handover is
/// done. Until the backend serves that endpoint (docs/driver-breakdown-handover-api.md) it
/// falls back to what ride history tells: the tracker follows the handed-over orders (see
/// [_stageFor]) and the spot is the position saved with the report.
class BreakdownDetailScreen extends StatefulWidget {
  const BreakdownDetailScreen({super.key, required this.report, required this.open});

  final JobHistoryItem report;

  /// Whether this was the rider's open breakdown when opened; the live value comes from
  /// [JobsController] (see [isBreakdownReportOpen]).
  final bool open;

  @override
  State<BreakdownDetailScreen> createState() => _BreakdownDetailScreenState();
}

const _pollEvery = Duration(seconds: 15);

class _BreakdownDetailScreenState extends State<BreakdownDetailScreen> {
  BreakdownHandover? _handover;

  /// The handover endpoint failed before anything loaded — show the history-based view.
  bool _fallback = false;
  Timer? _poll;
  StreamSubscription<String>? _breakdownSub;
  bool _backingOnRoad = false;

  JobHistoryItem get report => widget.report;

  /// Still open per the server (`GET /me` vehicleBreakdown), else the history guess.
  bool get open {
    final vm = context.watch<JobsController>();
    return isBreakdownReportOpen(vm, report);
  }

  @override
  void initState() {
    super.initState();
    _load();
    // Admin assigned a replacement / the breakdown was cleared: refresh straight away
    // instead of waiting for the next poll.
    _breakdownSub = BreakdownBus.events.listen((jobId) {
      if (jobId == report.id) _load();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _breakdownSub?.cancel();
    super.dispose();
  }

  /// "I'm back on the road": clears the open breakdown so the rider can go on duty again.
  Future<void> _backOnRoad() async {
    BcFeedback.tap();
    final ok = await showBcConfirm(
      context,
      title: tr('Back on the road?'),
      message: tr("You'll be able to receive new jobs again."),
      // Short: it shares a row with Cancel; the title already asks "Back on the road?".
      confirmLabel: tr("Yes, I'm back"),
      cancelLabel: tr('Cancel'),
      icon: Icons.check_rounded,
    );
    if (!ok || !mounted) return;
    final vm = context.read<JobsController>();
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    setState(() => _backingOnRoad = true);
    try {
      await vm.backOnRoad(report.id);
      BcFeedback.success();
      messenger.showSnackBar(SnackBar(content: Text(tr("You're back on the road. Go online to receive jobs."))));
      nav.popUntil((route) => route.isFirst);
    } catch (e) {
      BcFeedback.error();
      if (mounted) setState(() => _backingOnRoad = false);
      messenger.showSnackBar(SnackBar(content: Text(errorMessage(e, tr('Could not update. Try again.')))));
    }
  }

  /// "Still not fixed, go offline": the breakdown stays open; make sure the rider is off
  /// duty and take them Home.
  Future<void> _stayOffline() async {
    BcFeedback.tap();
    final vm = context.read<JobsController>();
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    if (vm.isOnline) await vm.setOnline(false);
    messenger.showSnackBar(
      SnackBar(content: Text(tr("You're offline. Tap \"I'm back on the road\" when your vehicle works again."))),
    );
    nav.popUntil((route) => route.isFirst);
  }

  /// Rider confirms an order is now with the replacement rider. Kept on this phone (no
  /// backend call for it); once every order is handed over the screen moves to Done.
  Future<void> _handOver(HandoverOrder order, String riderName) async {
    BcFeedback.tap();
    final ok = await showBcConfirm(
      context,
      title: tr('Hand over {order}?', {'order': order.orderNumber}),
      message: tr('Confirm that {rider} has received this order from you.', {'rider': riderName}),
      confirmLabel: tr('Hand over'),
      cancelLabel: tr('Cancel'),
      icon: Icons.swap_horiz_rounded,
    );
    if (!ok || !mounted) return;
    await LocalProfile.instance.confirmHandover(report.id, order.orderId);
    BcFeedback.success();
  }

  /// Footer once the handover is done and the breakdown is still open.
  Widget? _footer({required bool open, required bool done}) => open && done
      ? BreakdownDoneFooter(
          busy: _backingOnRoad,
          onBackOnRoad: _backOnRoad,
          onStayOffline: _stayOffline,
        )
      : null;

  /// Report time: the server's, else the open breakdown's, else the ride's close time.
  String _reportedAt(String? fromServer) {
    if (fromServer != null && fromServer.isNotEmpty) return fromServer;
    final open = context.read<JobsController>().profile?.vehicleBreakdown;
    if (open != null && open.jobId == report.id && open.reportedAt.isNotEmpty) return open.reportedAt;
    return report.completedAt ?? report.scheduledAt;
  }

  Future<void> _load() async {
    try {
      final h = await context.read<AppContainer>().jobsRepository.getJobHandover(report.id);
      _handoverStore.put(report.id, h); // keep the list / banner chips in step
      if (!mounted) return;
      setState(() {
        _handover = h;
        _fallback = false;
      });
      if (h.isDone) {
        _poll?.cancel();
        _poll = null;
      } else {
        _poll ??= Timer.periodic(_pollEvery, (_) => _load());
      }
    } catch (_) {
      // Keep the last good status on a failed refresh; fall back only if nothing loaded
      // (e.g. the backend does not serve the endpoint yet — no polling then).
      if (mounted && _handover == null) setState(() => _fallback = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = _handover;
    if (h != null) return _handoverPage(context, h);
    if (!_fallback) {
      return QdPage(
        title: tr('Breakdown & Handover'),
        children: const [Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator()))],
      );
    }
    return _historyPage(context);
  }

  String get _rideRef {
    final code = _handover?.rideCode ?? report.rideCode;
    return code != null && code.isNotEmpty ? code : report.title;
  }

  /// Server-driven: replacement rider, live location, orders to hand over, updates. Orders
  /// the rider confirmed handing over (on this phone) count as handed over too; with all of
  /// them handed over the screen switches to Done.
  Widget _handoverPage(BuildContext context, BreakdownHandover h) {
    final isOpen = open;
    return ListenableBuilder(
      listenable: LocalProfile.instance,
      builder: (context, _) {
        final orders = _withLocalHandovers(h, report.id);
        final handedCount = _handedCount(orders);
        final phase = _effectivePhase(h, orders);
        final riderName = h.replacements.isEmpty ? tr('the replacement rider') : h.replacements.first.name;
        final parts = _splitNote(h.note ?? _noteFor(report));
        final reportedAt = _reportedAt(h.reportedAt);
        final details = BreakdownDetails(
          typeLabel: parts.type ?? tr('Vehicle breakdown'),
          reportedAt: reportedAt,
          rideRef: _rideRef,
          phase: phase,
          open: isOpen,
          description: parts.description,
          locationLabel: _locationLabel(
            lat: h.breakdownPoint?.lat,
            lng: h.breakdownPoint?.lng,
            storeName: h.storeName ?? report.storeName,
          ),
          spot: h.breakdownPoint,
          riders: h.replacements,
          orders: orders,
          orderInfo: LocalProfile.instance.breakdownOrders[report.id] ?? const {},
          handedOverCount: handedCount,
          updates: handoverUpdates(h, reportedAt: reportedAt),
          onHandOver: (o) => _handOver(o, riderName),
        );
        return QdPage(
          title: tr('Breakdown & Handover'),
          onRefresh: _load,
          footer: _footer(open: isOpen, done: isBreakdownDone(phase)),
          children: buildBreakdownSections(context, details),
        );
      },
    );
  }

  /// Fallback built from ride history only (no handover endpoint): no rider details, so the
  /// rider / location / orders sections stay hidden.
  Widget _historyPage(BuildContext context) {
    final isOpen = open;
    return ListenableBuilder(
      listenable: LocalProfile.instance,
      builder: (context, _) {
        final parts = _splitNote(_noteFor(report));
        final reportedAt = _reportedAt(null);
        final phase = _phaseFor(report);
        final spot = LocalProfile.instance.breakdownSpots[report.id];
        final details = BreakdownDetails(
          typeLabel: parts.type ?? tr('Vehicle breakdown'),
          reportedAt: reportedAt,
          rideRef: _rideRef,
          phase: phase,
          open: isOpen,
          description: parts.description,
          locationLabel: _locationLabel(lat: spot?.lat, lng: spot?.lng, storeName: report.storeName),
          spot: spot == null ? null : HandoverPoint(lat: spot.lat, lng: spot.lng),
          updates: historyUpdates(reportedAt: reportedAt, phase: phase),
        );
        return QdPage(
          title: tr('Breakdown & Handover'),
          onRefresh: _load,
          footer: _footer(open: isOpen, done: isBreakdownDone(phase)),
          children: buildBreakdownSections(context, details),
        );
      },
    );
  }
}

/// The server has no "breakdown closed" signal, so a breakdown counts as over once the rider
/// is running a delivery again (a run IN_PROGRESS / RETURNING).
bool _riderBackOnRoad(JobsController vm) => vm.jobs.any((j) => j.status == 'IN_PROGRESS' || j.status == 'RETURNING');

/// True when [r]'s breakdown is still open: the server says so (`GET /me` vehicleBreakdown)
/// or, on backends without that field, it is the newest one and the rider is not back on a run.
bool isBreakdownReportOpen(JobsController vm, JobHistoryItem r) {
  final p = vm.profile;
  if (p != null && p.vehicleBreakdownKnown) return p.vehicleBreakdown?.jobId == r.id;
  return latestBreakdownRide(vm)?.id == r.id && !_riderBackOnRoad(vm);
}

/// True while the rider has an open breakdown.
bool isBreakdownOpen(JobsController vm) {
  final p = vm.profile;
  if (p != null && p.vehicleBreakdownKnown) return p.hasOpenBreakdown;
  final latest = latestBreakdownRide(vm);
  return latest != null && isBreakdownReportOpen(vm, latest);
}

/// Phase of the open breakdown for the Home banner (its ride may not be in history yet).
BreakdownPhase _openBreakdownPhase(JobsController vm) {
  final jobId = vm.profile?.vehicleBreakdown?.jobId;
  final ride = jobId == null ? latestBreakdownRide(vm) : vm.history.where((r) => r.id == jobId).firstOrNull;
  if (ride != null) return _rowPhase(ride);
  final h = jobId == null ? null : _handoverStore[jobId];
  return h == null ? BreakdownPhase.findingRider : _effectivePhase(h, _withLocalHandovers(h, jobId!));
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
    final openJobId = vm.profile?.vehicleBreakdown?.jobId ?? latestBreakdownRide(vm)?.id;
    if (openJobId != null && isBreakdownOpen(vm)) _handoverStore.ensure(context.read<AppContainer>(), openJobId);
    return ListenableBuilder(
      listenable: _handoverStore,
      builder: (context, _) {
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
                              BreakdownPhaseBadge(phase: _openBreakdownPhase(vm), open: true),
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
