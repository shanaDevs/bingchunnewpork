import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../data/models/breakdown_handover.dart';
import '../../l10n/l10n.dart';
import '../components/job_cards.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';

/// Breakdown & Handover screen body (QuickDrop design):
///  * waiting for a rider — status card, Description, Updates;
///  * rider assigned — status card, Replacement Rider, Handover Location, Orders to Hand
///    Over (each with a Hand over button), Updates;
///  * done — status card and the Handover complete notice (the screen adds the
///    "Is your vehicle working again?" footer).

/// Where the breakdown stands.
enum BreakdownPhase {
  /// Nothing was left to hand over (no job to reassign) — treated as done.
  acknowledged,
  findingRider,
  riderAssigned,
  handoverComplete,
}

bool isBreakdownDone(BreakdownPhase p) => p == BreakdownPhase.acknowledged || p == BreakdownPhase.handoverComplete;

/// One timeline row. [at] is ISO time, or null when the server gives no time for it.
typedef BreakdownUpdate = ({String author, String? at, String message});

/// Customer name + area kept on the phone for an order (see LocalProfile.breakdownOrders).
typedef BreakdownOrderInfo = ({String name, String area});

/// Everything the screen shows, whichever source it came from.
class BreakdownDetails {
  const BreakdownDetails({
    required this.typeLabel,
    required this.reportedAt,
    required this.rideRef,
    required this.phase,
    required this.open,
    required this.description,
    required this.locationLabel,
    this.spot,
    this.riders = const [],
    this.orders = const [],
    this.orderInfo = const {},
    this.handedOverCount = 0,
    this.updates = const [],
    this.onHandOver,
  });

  final String typeLabel;
  final String reportedAt;

  /// Ride code of the broken-down job; null when there was no job to reassign.
  final String? rideRef;
  final BreakdownPhase phase;

  /// The breakdown is still open (rider not back on the road yet).
  final bool open;
  final String? description;
  final String locationLabel;
  final HandoverPoint? spot;
  final List<HandoverRider> riders;
  final List<HandoverOrder> orders;
  final Map<String, BreakdownOrderInfo> orderInfo;
  final int handedOverCount;

  /// Newest first.
  final List<BreakdownUpdate> updates;

  /// Rider tapped Hand over on an order (after confirming).
  final void Function(HandoverOrder order)? onHandOver;
}

// ---------------------------------------------------------------------------------------
// Status wording / tones — badges on the breakdown list and the Home banner
// ---------------------------------------------------------------------------------------

/// A breakdown that is no longer open is "Closed" whatever stage it stopped at (e.g. admin
/// cleared it before the handover finished).
String breakdownPhaseLabel(BreakdownPhase phase, {required bool open}) {
  if (!open) return tr('Closed');
  return switch (phase) {
    BreakdownPhase.acknowledged => tr('Acknowledged'),
    BreakdownPhase.findingRider => tr('Finding a rider'),
    BreakdownPhase.riderAssigned => tr('Rider assigned'),
    BreakdownPhase.handoverComplete => tr('Handover complete'),
  };
}

QdTone breakdownPhaseTone(BreakdownPhase phase, {required bool open}) {
  if (!open) return QdTone.neutral;
  return phase == BreakdownPhase.handoverComplete ? QdTone.success : QdTone.primary;
}

class BreakdownPhaseBadge extends StatelessWidget {
  const BreakdownPhaseBadge({super.key, required this.phase, required this.open});

  final BreakdownPhase phase;
  final bool open;

  @override
  Widget build(BuildContext context) =>
      QdBadge(breakdownPhaseLabel(phase, open: open), tone: breakdownPhaseTone(phase, open: open), dot: true);
}

/// Phase from the handover endpoint's stage.
BreakdownPhase handoverPhase(BreakdownHandover h) {
  if (h.isDone) return h.totalCount == 0 ? BreakdownPhase.acknowledged : BreakdownPhase.handoverComplete;
  if (h.isHandover) return BreakdownPhase.riderAssigned;
  return BreakdownPhase.findingRider;
}

// ---------------------------------------------------------------------------------------
// Timeline wording
// ---------------------------------------------------------------------------------------

/// Timeline for the handover endpoint plus the support steps on the way. Newest first.
/// [reportedAt] stands in when the server sent no report event.
List<BreakdownUpdate> handoverUpdates(BreakdownHandover h, {required String reportedAt}) {
  final you = tr('You');
  final support = tr('Support');
  final hasJob = h.totalCount > 0;
  final oldestFirst = <BreakdownUpdate>[];
  final events = h.events.reversed.toList();
  if (!events.any((e) => e.type == 'REPORTED')) {
    oldestFirst
      ..add((author: you, at: reportedAt, message: tr('Breakdown reported to support.')))
      ..addAll(_supportSteps(hasJob: hasJob, at: reportedAt));
  }
  for (final e in events) {
    switch (e.type) {
      case 'REPORTED':
        oldestFirst
          ..add((author: you, at: e.at, message: tr('Breakdown reported to support.')))
          ..addAll(_supportSteps(hasJob: hasJob, at: e.at));
      case 'RIDER_ASSIGNED':
        oldestFirst.add((author: support, at: e.at, message: tr('A replacement rider is on the way to you.')));
      case 'ORDERS_COLLECTED':
        oldestFirst.add((author: support, at: e.at, message: tr('All remaining orders were handed over.')));
      default:
        if (e.label != null && e.label!.trim().isNotEmpty) {
          oldestFirst.add((author: support, at: e.at, message: e.label!));
        }
    }
  }
  return oldestFirst.reversed.toList();
}

List<BreakdownUpdate> _supportSteps({required bool hasJob, required String? at}) {
  final support = tr('Support');
  return hasJob
      ? [
          (author: support, at: at, message: tr('Support has your report and is arranging a replacement rider.')),
          (author: support, at: at, message: tr('Looking for an available rider nearby.')),
        ]
      : [
          (author: support, at: at, message: tr('Support has your report and will call you shortly.')),
          (author: support, at: at, message: tr('All orders were already completed. No handover is needed.')),
        ];
}

/// Timeline when only ride history is known: the report time is the only timestamp.
List<BreakdownUpdate> historyUpdates({required String reportedAt, required BreakdownPhase phase}) {
  final hasJob = phase != BreakdownPhase.acknowledged;
  final oldestFirst = <BreakdownUpdate>[
    (author: tr('You'), at: reportedAt, message: tr('Breakdown reported to support.')),
    ..._supportSteps(hasJob: hasJob, at: reportedAt),
    if (phase == BreakdownPhase.riderAssigned || phase == BreakdownPhase.handoverComplete)
      (author: tr('Support'), at: null, message: tr('A replacement rider is on the way to you.')),
  ];
  return oldestFirst.reversed.toList();
}

// ---------------------------------------------------------------------------------------
// Screen body
// ---------------------------------------------------------------------------------------

/// Sections below the app bar for the current phase.
List<Widget> buildBreakdownSections(BuildContext context, BreakdownDetails d) {
  final assigned = d.phase == BreakdownPhase.riderAssigned && d.riders.isNotEmpty;
  final done = isBreakdownDone(d.phase);
  return [
    _StatusCard(details: d),
    if (done) ...[
      const SizedBox(height: 16),
      _DoneNotice(details: d),
    ] else if (assigned) ...[
      _Section(
        title: tr('Replacement Rider'),
        child: Column(
          children: [
            for (final (i, r) in d.riders.indexed) ...[
              if (i > 0) const SizedBox(height: 10),
              _RiderCard(rider: r),
            ],
          ],
        ),
      ),
      if (d.spot != null) _Section(title: tr('Handover Location'), child: _LocationCard(details: d)),
      if (d.orders.isNotEmpty) ...[const SizedBox(height: 20), _OrdersCard(details: d)],
      _Section(title: tr('Updates'), child: _UpdatesCard(updates: d.updates)),
    ] else ...[
      _Section(title: tr('Description'), child: _DescriptionCard(details: d)),
      _Section(title: tr('Updates'), child: _UpdatesCard(updates: d.updates)),
    ],
  ];
}

/// Footer once the handover is done: "Is your vehicle working again?" with the two choices.
class BreakdownDoneFooter extends StatelessWidget {
  const BreakdownDoneFooter({
    super.key,
    required this.onBackOnRoad,
    required this.onStayOffline,
    this.busy = false,
  });

  final VoidCallback? onBackOnRoad;
  final VoidCallback? onStayOffline;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          tr('Is your vehicle working again?'),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: c.mutedForeground),
        ),
        const SizedBox(height: 10),
        PillButton(
          label: tr("I'm back on the road"),
          icon: Icons.check_rounded,
          kind: PillKind.primary,
          loading: busy,
          onTap: busy ? null : onBackOnRoad,
        ),
        const SizedBox(height: 10),
        PillButton(
          label: tr('Still not fixed, go offline'),
          icon: Icons.power_settings_new_rounded,
          kind: PillKind.outline,
          onTap: busy ? null : onStayOffline,
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [QdSectionTitle(title), child],
  );
}

// ---------------------------------------------------------------------------------------
// Status card — brand gradient, 4-step tracker
// ---------------------------------------------------------------------------------------

const _steps = ['Reported', 'Finding rider', 'Handover', 'Done'];

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.details});

  final BreakdownDetails details;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final d = details;
    final current = switch (d.phase) {
      BreakdownPhase.findingRider => 1,
      BreakdownPhase.riderAssigned => 2,
      BreakdownPhase.acknowledged || BreakdownPhase.handoverComplete => _steps.length,
    };
    final subtitle = [
      tr('Reported {time}', {'time': Format.jobDateTime(d.reportedAt)}),
      if (d.rideRef != null) d.rideRef!,
    ].join(' · ');
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
                    Text(
                      d.typeLabel,
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: c.onBrand),
                    ),
                    const SizedBox(height: 2),
                    Text(subtitle, style: TextStyle(fontSize: 13, color: c.onBrandMuted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _Stepper(current: current),
          const SizedBox(height: 14),
          Divider(height: 1, color: Colors.white.withValues(alpha: 0.2)),
          const SizedBox(height: 12),
          Text(
            d.open
                ? tr("You won't receive new jobs until you're back on the road.")
                : tr("You're back on the road."),
            style: TextStyle(fontSize: 14, color: c.onBrand, height: 1.35),
          ),
        ],
      ),
    );
  }
}

/// Done steps white with a check, the current one yellow, upcoming outlined.
/// [current] == steps length means all done.
class _Stepper extends StatelessWidget {
  const _Stepper({required this.current});

  final int current;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
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
                    _Dot(index: i, state: i < current ? 2 : (i == current ? 1 : 0)),
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
  const _Dot({required this.index, required this.state});

  final int index;
  final int state;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
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
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: current ? c.accentForeground : c.onBrand),
            ),
    );
  }
}

/// Green "Handover complete" notice (or "no handover needed" when nothing was left).
class _DoneNotice extends StatelessWidget {
  const _DoneNotice({required this.details});

  final BreakdownDetails details;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final d = details;
    final rider = d.riders.isEmpty ? null : d.riders.first;
    final noHandover = d.phase == BreakdownPhase.acknowledged || rider == null;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: c.successSoft, borderRadius: BorderRadius.circular(BcRadius.lg)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_circle_outline_rounded, size: 22, color: c.successStrong),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('Handover complete'),
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                ),
                const SizedBox(height: 4),
                Text(
                  noHandover
                      ? tr('All orders were already completed. No handover is needed.')
                      : tr('{reference} is now with {rider}. Thank you for staying safe.', {
                          'reference': d.rideRef ?? '',
                          'rider': rider.name,
                        }),
                  style: TextStyle(fontSize: 14, height: 1.4, color: c.foreground),
                ),
                const SizedBox(height: 4),
                Text(
                  tr('The job has moved to your history.'),
                  style: TextStyle(fontSize: 13, color: c.mutedForeground),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------
// Replacement rider
// ---------------------------------------------------------------------------------------

class _RiderCard extends StatelessWidget {
  const _RiderCard({required this.rider});

  final HandoverRider rider;

  Future<void> _call(BuildContext context, String phone) async {
    final messenger = ScaffoldMessenger.of(context);
    final err = await Intents.dial(phone);
    if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final r = rider;
    final (String status, Color statusColor) = r.collected
        ? (
            r.collectedAt != null
                ? tr('Collected your orders · {time}', {'time': Format.jobDateTime(r.collectedAt)})
                : tr('Collected your orders'),
            c.successStrong,
          )
        : !r.accepted
        ? (tr('Assigned · waiting for the rider to accept'), c.warningStrong)
        : (r.etaMinutes != null && r.distanceKm != null)
        ? (
            tr('Arriving in about {min} min · {km}', {'min': r.etaMinutes!, 'km': Format.km(r.distanceKm!)}),
            c.primary,
          )
        : (tr('On the way to you'), c.primary);
    final phone = r.phone;
    return QdCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _Avatar(rider: r, live: r.location != null),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      r.name,
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground),
                    ),
                    if (r.vehicleLabel != null) ...[
                      const SizedBox(height: 2),
                      Text(r.vehicleLabel!, style: TextStyle(fontSize: 13, color: c.mutedForeground)),
                    ],
                    if (r.rating != null) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Icon(Icons.star_rounded, size: 16, color: c.warning),
                          const SizedBox(width: 4),
                          Text(
                            tr('{r} rating', {'r': r.rating!.toStringAsFixed(1)}),
                            style: TextStyle(fontSize: 13, color: c.mutedForeground),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(status, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: statusColor)),
          if (phone != null && phone.trim().isNotEmpty) ...[
            const SizedBox(height: 12),
            PillButton(
              label: tr('Contact rider'),
              icon: Icons.call_outlined,
              kind: PillKind.call,
              height: 48,
              onTap: () => _call(context, phone),
            ),
          ],
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.rider, required this.live});

  final HandoverRider rider;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final fallback = Center(
      child: Text(
        rider.initials,
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.primary),
      ),
    );
    final url = rider.photoUrl?.trim();
    return SizedBox(
      width: 52,
      height: 52,
      child: Stack(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(shape: BoxShape.circle, color: c.primarySoft),
            clipBehavior: Clip.antiAlias,
            child: (url == null || url.isEmpty)
                ? fallback
                : CachedNetworkImage(
                    imageUrl: url,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => fallback,
                    errorWidget: (_, _, _) => fallback,
                  ),
          ),
          if (live)
            Positioned(
              right: 1,
              bottom: 1,
              child: Container(
                width: 13,
                height: 13,
                decoration: BoxDecoration(
                  color: c.online,
                  shape: BoxShape.circle,
                  border: Border.all(color: c.surface, width: 2),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------
// Handover location
// ---------------------------------------------------------------------------------------

class _LocationCard extends StatelessWidget {
  const _LocationCard({required this.details});

  final BreakdownDetails details;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final d = details;
    final p = d.spot!;
    return QdCard(
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(BcRadius.md),
            child: SizedBox(
              height: 160,
              child: Stack(
                children: [
                  Positioned.fill(child: HandoverMap(spot: p, riders: d.riders, interactive: false)),
                  Positioned(
                    right: 8,
                    bottom: 8,
                    child: _MapChip(
                      icon: Icons.open_in_full_rounded,
                      label: tr('Full map'),
                      onTap: () {
                        BcFeedback.tap();
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(builder: (_) => _FullMapScreen(spot: p, riders: d.riders)),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          InkWell(
            borderRadius: BorderRadius.circular(BcRadius.md),
            onTap: () => Intents.navigateTo(p.lat, p.lng),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Row(
                children: [
                  Icon(Icons.location_on_outlined, size: 20, color: c.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      d.locationLabel,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MapChip extends StatelessWidget {
  const _MapChip({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Material(
      color: c.surface,
      shape: const StadiumBorder(),
      elevation: 2,
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: c.primary),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.primary)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Breakdown spot (you) plus every replacement rider still on the way, joined by a dashed
/// line, framed to fit. Re-frames when a rider's live position moves.
class HandoverMap extends StatefulWidget {
  const HandoverMap({super.key, required this.spot, required this.riders, required this.interactive});

  final HandoverPoint spot;
  final List<HandoverRider> riders;
  final bool interactive;

  @override
  State<HandoverMap> createState() => _HandoverMapState();
}

class _HandoverMapState extends State<HandoverMap> {
  GoogleMapController? _map;

  LatLng get _spot => LatLng(widget.spot.lat, widget.spot.lng);

  List<(HandoverRider, LatLng)> get _riders => [
    for (final r in widget.riders)
      if (r.location != null) (r, LatLng(r.location!.lat, r.location!.lng)),
  ];

  @override
  void didUpdateWidget(HandoverMap old) {
    super.didUpdateWidget(old);
    final before = old.riders.map((r) => '${r.location?.lat},${r.location?.lng}').join();
    final after = widget.riders.map((r) => '${r.location?.lat},${r.location?.lng}').join();
    if (before != after) _frame();
  }

  @override
  void dispose() {
    _map?.dispose();
    super.dispose();
  }

  Future<void> _frame() async {
    final map = _map;
    if (map == null) return;
    final points = [_spot, ..._riders.map((e) => e.$2)];
    try {
      if (points.length == 1) {
        await map.moveCamera(CameraUpdate.newLatLngZoom(_spot, 15));
        return;
      }
      final lats = points.map((p) => p.latitude);
      final lngs = points.map((p) => p.longitude);
      final bounds = LatLngBounds(
        southwest: LatLng(lats.reduce(math.min), lngs.reduce(math.min)),
        northeast: LatLng(lats.reduce(math.max), lngs.reduce(math.max)),
      );
      await map.moveCamera(CameraUpdate.newLatLngBounds(bounds, 48));
    } catch (_) {
      // Map not laid out yet — the initial camera already centres on the spot.
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final riders = _riders;
    return GoogleMap(
      initialCameraPosition: CameraPosition(target: _spot, zoom: 15),
      onMapCreated: (m) {
        _map = m;
        Future<void>.delayed(const Duration(milliseconds: 250), _frame);
      },
      markers: {
        Marker(
          markerId: const MarkerId('breakdown'),
          position: _spot,
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
          infoWindow: InfoWindow(title: tr('You (breakdown spot)')),
        ),
        for (final (r, p) in riders)
          Marker(
            markerId: MarkerId('rider-${r.driverId}'),
            position: p,
            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
            infoWindow: InfoWindow(title: r.name, snippet: r.vehicleLabel),
          ),
      },
      polylines: {
        for (final (r, p) in riders)
          Polyline(
            polylineId: PolylineId('line-${r.driverId}'),
            points: [p, _spot],
            color: c.primary,
            width: 4,
            patterns: [PatternItem.dash(18), PatternItem.gap(10)],
          ),
      },
      zoomControlsEnabled: widget.interactive,
      zoomGesturesEnabled: widget.interactive,
      scrollGesturesEnabled: widget.interactive,
      rotateGesturesEnabled: widget.interactive,
      tiltGesturesEnabled: false,
      myLocationButtonEnabled: false,
      mapToolbarEnabled: false,
      compassEnabled: widget.interactive,
    );
  }
}

class _FullMapScreen extends StatelessWidget {
  const _FullMapScreen({required this.spot, required this.riders});

  final HandoverPoint spot;
  final List<HandoverRider> riders;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Scaffold(
      backgroundColor: c.background,
      body: Column(
        children: [
          QdAppBar(title: tr('Handover Location')),
          Expanded(child: HandoverMap(spot: spot, riders: riders, interactive: true)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------
// Orders to hand over
// ---------------------------------------------------------------------------------------

class _OrdersCard extends StatelessWidget {
  const _OrdersCard({required this.details});

  final BreakdownDetails details;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final d = details;
    final total = d.orders.length;
    return QdCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        tr('Orders to Hand Over'),
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground),
                      ),
                    ),
                    Text(
                      tr('{done} of {total} handed over', {'done': d.handedOverCount, 'total': total}),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.successStrong),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _SegmentedProgress(completed: d.handedOverCount, total: total),
              ],
            ),
          ),
          for (final (i, o) in d.orders.indexed)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
              decoration: BoxDecoration(
                border: i > 0 ? Border(top: BorderSide(color: c.border)) : null,
              ),
              child: _OrderRow(order: o, info: d.orderInfo[o.orderId], onHandOver: d.onHandOver),
            ),
        ],
      ),
    );
  }
}

class _SegmentedProgress extends StatelessWidget {
  const _SegmentedProgress({required this.completed, required this.total});

  final int completed;
  final int total;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Row(
      children: [
        for (var i = 0; i < total; i++) ...[
          if (i > 0) const SizedBox(width: 4),
          Expanded(
            child: Container(
              height: 5,
              decoration: BoxDecoration(
                color: i < completed ? c.success : c.muted,
                borderRadius: BorderRadius.circular(BcRadius.full),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.order, required this.info, required this.onHandOver});

  final HandoverOrder order;
  final BreakdownOrderInfo? info;
  final void Function(HandoverOrder order)? onHandOver;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final o = order;
    // Customer name on top, "ORD-58715 · Borella" below; without a saved name the order id
    // takes the top line.
    final name = info?.name.isNotEmpty == true ? info!.name : o.orderNumber;
    final area = info?.area.isNotEmpty == true ? info!.area : o.area;
    final subtitle = [
      if (info?.name.isNotEmpty == true) o.orderNumber,
      if (area != null && area.isNotEmpty) area,
      if (info == null && o.itemCount > 0) tr('{n} items', {'n': o.itemCount}),
    ].join(' · ');
    final Widget trailing = o.isDelivered
        ? QdBadge(tr('Delivered'), tone: QdTone.success, dot: true)
        : o.isCancelled
        ? QdBadge(tr('Cancelled'), tone: QdTone.neutral, dot: true)
        : o.handedOver
        ? QdBadge(tr('Handed over'), tone: QdTone.success, dot: true)
        : _HandOverButton(onTap: onHandOver == null ? null : () => onHandOver!(o));
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
              ),
              if (subtitle.isNotEmpty)
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: c.mutedForeground),
                ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        trailing,
      ],
    );
  }
}

/// Small soft pill: "⇆ Hand over".
class _HandOverButton extends StatelessWidget {
  const _HandOverButton({required this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Material(
      color: c.primarySoft,
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.swap_horiz_rounded, size: 18, color: c.primary),
              const SizedBox(width: 6),
              Text(tr('Hand over'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.primary)),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------------------

class _DescriptionCard extends StatelessWidget {
  const _DescriptionCard({required this.details});

  final BreakdownDetails details;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final d = details;
    return QdCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            d.description ?? tr('Breakdown reported to support.'),
            style: TextStyle(fontSize: 15, height: 1.4, color: c.foreground),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.location_on_outlined, size: 16, color: c.mutedForeground),
              const SizedBox(width: 8),
              Expanded(
                child: Text(d.locationLabel, style: TextStyle(fontSize: 13, color: c.mutedForeground)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------------------

class _UpdatesCard extends StatelessWidget {
  const _UpdatesCard({required this.updates});

  final List<BreakdownUpdate> updates;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          for (final (i, u) in updates.indexed)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Column(
                    children: [
                      const SizedBox(height: 5),
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: i == 0 ? c.primary : c.mutedForeground,
                        ),
                      ),
                      if (i < updates.length - 1) Expanded(child: Container(width: 1.5, color: c.border)),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(bottom: i < updates.length - 1 ? 16 : 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            u.at == null ? u.author : '${u.author} · ${Format.jobDateTime(u.at)}',
                            style: TextStyle(fontSize: 12, color: c.mutedForeground),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            u.message,
                            style: TextStyle(
                              fontSize: 14,
                              height: 1.35,
                              fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w500,
                              color: c.foreground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
