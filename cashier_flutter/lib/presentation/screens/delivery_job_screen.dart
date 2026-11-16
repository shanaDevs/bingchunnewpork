import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../domain/entities/delivery.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/delivery_map.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/product_widgets.dart';
import '../components/states.dart';
import '../labels.dart';
import '../state/delivery_controller.dart';
import '../theme/pos_theme.dart';

List<MapPin> _routePins(GeoPoint start, List<RouteStop> stops, {GeoPoint? rider}) => [
  MapPin(at: start, kind: MapPinKind.branch),
  for (final s in stops)
    MapPin(
      at: s.location,
      kind: s.status == 'DELIVERED' ? MapPinKind.delivered : MapPinKind.stop,
      label: '${s.sequence}',
    ),
  if (rider != null) MapPin(at: rider, kind: MapPinKind.rider),
];

/// Job details — port of the web AdminDeliveryJobDrawer (read-only).
class DeliveryJobScreen extends StatelessWidget {
  const DeliveryJobScreen({
    super.key,
    required this.jobId,
    required this.storeId,
    this.forceReplay = false,
  });
  final String jobId;
  final String storeId;
  final bool forceReplay;

  @override
  Widget build(BuildContext context) {
    final c = context.read<AppContainer>();
    return ChangeNotifierProvider(
      create: (_) => DeliveryJobController(
        c.deliveryRepository,
        c.socket,
        jobId,
        storeId,
        forceReplay: forceReplay,
      ),
      child: const _JobView(),
    );
  }
}

class _JobView extends StatelessWidget {
  const _JobView();

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<DeliveryJobController>();
    final c = context.pos;
    final job = ctrl.job;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tr('Job details').toUpperCase(), style: PosType.label.copyWith(color: c.textMuted)),
            Text(job?.title ?? '…', style: PosType.heading.copyWith(color: c.text)),
          ],
        ),
      ),
      body: ctrl.loading && job == null
          ? LoadingView(message: tr('Loading job…'))
          : job == null
          ? ErrorView(message: ctrl.error ?? tr('Job not found'), onRetry: ctrl.load)
          : RefreshIndicator(
              onRefresh: () => ctrl.load(silent: true),
              child: ListView(
                padding: centeredPadding(context, top: PosSpacing.sm),
                children: [
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      PosBadge(label: deliveryStatusLabel(job.status), color: deliveryStatusColor(context, job.status)),
                      if (job.returningToBranch) PosBadge(label: tr('Returning to branch'), color: PosColors.preparing),
                      if (job.pickedUp) PosBadge(label: tr('Picked up'), color: c.successText),
                      if (job.vehicleFailure != null) PosBadge(label: tr('Vehicle failure'), color: c.dangerText),
                    ],
                  ),
                  const SizedBox(height: PosSpacing.md),
                  _PathLayerMap(
                    height: 260,
                    pins: [
                      ..._routePins(
                        job.pickupLocation ?? job.storeLocation,
                        ctrl.route?.stops ??
                            [
                              for (final s in job.stops)
                                if (s.location != null)
                                  RouteStop(
                                    orderNumber: s.orderNumber,
                                    customerName: s.customerName,
                                    location: s.location!,
                                    sequence: s.sequence,
                                    status: s.deliveryState == 'Delivered' ? 'DELIVERED' : s.status,
                                  ),
                            ],
                        rider: ctrl.isLive ? ctrl.rider : null,
                      ),
                      if (job.vehicleFailure != null) MapPin(at: job.vehicleFailure!, kind: MapPinKind.breakdown),
                    ],
                    plannedPath: ctrl.route?.path,
                    actualPath: ctrl.driven?.path,
                    actualLabel: ctrl.isLive ? tr('Live') : tr('Actual'),
                  ),
                  if (ctrl.route != null) ...[
                    const SizedBox(height: PosSpacing.sm),
                    Text(
                      tr('{km} km · about {min} min · {n} stops', {
                        'km': ctrl.route!.totalDistanceKm.toStringAsFixed(1),
                        'min': ctrl.route!.estimatedMinutes,
                        'n': ctrl.route!.stops.length,
                      }),
                      style: PosType.caption.copyWith(color: c.textMuted),
                    ),
                  ],
                  const SizedBox(height: PosSpacing.lg),
                  SectionLabel(tr('Summary')),
                  PosCard(
                    padding: const EdgeInsets.all(PosSpacing.md),
                    child: _SummaryGrid(job: job),
                  ),
                  const SizedBox(height: PosSpacing.lg),
                  SectionLabel(tr('Orders ({n})', {'n': job.stops.length})),
                  for (final s in job.stops) ...[_StopCard(stop: s), const SizedBox(height: PosSpacing.sm)],
                ],
              ),
            ),
    );
  }
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.job});
  final DeliveryJobDetail job;

  @override
  Widget build(BuildContext context) {
    final cells = <(String, String)>[
      (tr('Assigned rider'), job.driverName ?? tr('Unassigned')),
      (tr('Branch'), job.pickupLabel ?? job.storeName),
      (tr('Orders count'), tr('{done}/{total} delivered', {'done': job.deliveredCount, 'total': job.orderCount})),
      (tr('Total distance'), job.totalDistanceKm == null ? '—' : '${job.totalDistanceKm!.toStringAsFixed(1)} km'),
      (tr('Scheduled'), formatShortDateTime(job.scheduledAt)),
      (tr('Assigned'), job.assignedAt == null ? '—' : formatShortDateTime(job.assignedAt!)),
      (tr('Started'), job.startedAt == null ? '—' : formatShortDateTime(job.startedAt!)),
      (tr('Completed'), job.completedAt == null ? '—' : formatShortDateTime(job.completedAt!)),
    ];
    final c = context.pos;
    return LayoutBuilder(
      builder: (context, box) {
        final w = (box.maxWidth - PosSpacing.md) / 2;
        return Wrap(
          spacing: PosSpacing.md,
          runSpacing: PosSpacing.md,
          children: [
            for (final (label, value) in cells)
              SizedBox(
                width: w,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label.toUpperCase(), style: PosType.label.copyWith(color: c.textMuted, fontSize: 9.5)),
                    const SizedBox(height: 2),
                    Text(value, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13)),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _StopCard extends StatelessWidget {
  const _StopCard({required this.stop});
  final DeliveryStop stop;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final s = stop;
    final (stateLabel, stateColor) = switch (s.deliveryState) {
      'Delivered' => (tr('Delivered'), c.successText),
      'Failed' => (tr('Failed'), c.dangerText),
      _ => (tr('Pending'), c.warningText),
    };
    return PosCard(
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: stateColor, shape: BoxShape.circle),
                child: Text(
                  '${s.sequence}',
                  style: PosType.label.copyWith(color: Colors.white, fontSize: 12, letterSpacing: 0),
                ),
              ),
              const SizedBox(width: PosSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('#${s.orderNumber}', style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5)),
                    Text(s.customerName, style: PosType.caption.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              PosBadge(label: stateLabel, color: stateColor),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          if (s.addressLine.isNotEmpty)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.place_outlined, size: 15, color: c.textSoft),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    [s.addressLine, s.city].where((x) => x.isNotEmpty).join(', '),
                    style: PosType.caption.copyWith(color: c.text, fontSize: 12.5),
                  ),
                ),
                if (s.location != null)
                  InkWell(
                    onTap: () => launchUrl(
                      Uri.parse('https://www.google.com/maps?q=${s.location!.lat},${s.location!.lng}'),
                      mode: LaunchMode.externalApplication,
                    ),
                    child: Text(
                      tr('Open map'),
                      style: PosType.caption.copyWith(color: c.brand, fontWeight: FontWeight.w600),
                    ),
                  ),
              ],
            ),
          if (s.customerPhone.isNotEmpty) ...[
            const SizedBox(height: 4),
            InkWell(
              onTap: () => launchUrl(Uri.parse('tel:${s.customerPhone}')),
              child: Row(
                children: [
                  Icon(Icons.phone_outlined, size: 15, color: c.textSoft),
                  const SizedBox(width: 6),
                  Text(s.customerPhone, style: PosType.caption.copyWith(color: c.brand, fontSize: 12.5)),
                ],
              ),
            ),
          ],
          if (s.items.isNotEmpty) ...[
            Divider(height: PosSpacing.lg, color: c.border.withValues(alpha: 0.6)),
            for (final i in s.items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    ProductImage(url: i.imageUrl, size: 26, contain: true, radius: 6),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${i.quantity}× ${i.productName}',
                        style: PosType.caption.copyWith(color: c.text, fontSize: 12.5),
                      ),
                    ),
                    if (i.totalPrice != null)
                      Text(formatMoney(i.totalPrice!), style: PosType.caption.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
          ],
          if (s.total != null || s.paymentMethod != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                if (s.paymentMethod != null) PaymentMethodBadge(method: s.paymentMethod!),
                const Spacer(),
                if (s.total != null)
                  Text(formatMoney(s.total!), style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13)),
              ],
            ),
          ],
          if (s.terminalEventAt != null) ...[
            const SizedBox(height: 4),
            Text(
              '$stateLabel · ${formatShortDateTime(s.terminalEventAt!)}',
              style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5),
            ),
          ],
          if (s.failureOutcome != null || s.failureNote != null || s.cancelReason != null) ...[
            const SizedBox(height: 6),
            InlineNotice(
              message: [s.failureOutcome, s.failureNote, s.cancelReason].whereType<String>().join(' · '),
              tone: NoticeTone.danger,
            ),
          ],
        ],
      ),
    );
  }
}

class _PathLayerMap extends StatefulWidget {
  const _PathLayerMap({
    required this.pins,
    this.plannedPath,
    this.actualPath,
    this.actualLabel,
    this.height,
    this.expand = false,
    this.initialShowPlanned = true,
    this.initialShowActual = true,
  });

  final List<MapPin> pins;
  final List<GeoPoint>? plannedPath;
  final List<GeoPoint>? actualPath;
  final String? actualLabel;
  final double? height;
  final bool expand;
  final bool initialShowPlanned;
  final bool initialShowActual;

  @override
  State<_PathLayerMap> createState() => _PathLayerMapState();
}

class _PathLayerMapState extends State<_PathLayerMap> {
  late bool showPlanned =
      widget.initialShowPlanned || (widget.actualPath?.length ?? 0) < 2;
  late bool showActual = widget.initialShowActual;
  late bool _appliedActualOnly =
      widget.initialShowPlanned == false && (widget.actualPath?.length ?? 0) >= 2;

  bool get _hasPlanned => (widget.plannedPath?.length ?? 0) >= 2;
  bool get _hasActual => (widget.actualPath?.length ?? 0) >= 2;

  @override
  void didUpdateWidget(covariant _PathLayerMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_appliedActualOnly && widget.initialShowPlanned == false && _hasActual) {
      showPlanned = false;
      showActual = true;
      _appliedActualOnly = true;
    } else if (!_hasActual && _hasPlanned && !showPlanned) {
      showPlanned = true;
    }
  }

  void _togglePlanned() {
    if (!_hasPlanned) return;
    if (showPlanned && !(_hasActual && showActual)) return;
    setState(() => showPlanned = !showPlanned);
  }

  void _toggleActual() {
    if (!_hasActual) return;
    if (showActual && !(_hasPlanned && showPlanned)) return;
    setState(() => showActual = !showActual);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final plannedVisible = showPlanned && _hasPlanned;
    final actualVisible = showActual && _hasActual;
    final map = DeliveryMap(
      pins: widget.pins,
      lines: [
        if (plannedVisible) MapLine(points: widget.plannedPath!, color: c.brand),
        if (actualVisible) MapLine(points: widget.actualPath!, color: PosColors.preparing),
      ],
    );

    final chips = (_hasPlanned || _hasActual)
        ? Padding(
            padding: const EdgeInsets.only(bottom: PosSpacing.sm),
            child: Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                if (_hasPlanned)
                  FilterChip(
                    label: Text(tr('Planned')),
                    selected: plannedVisible,
                    onSelected: (_) => _togglePlanned(),
                    visualDensity: VisualDensity.compact,
                    selectedColor: c.brand.withValues(alpha: 0.18),
                    checkmarkColor: c.brand,
                  ),
                if (_hasActual)
                  FilterChip(
                    label: Text(widget.actualLabel ?? tr('Actual')),
                    selected: actualVisible,
                    onSelected: (_) => _toggleActual(),
                    visualDensity: VisualDensity.compact,
                    selectedColor: PosColors.preparing.withValues(alpha: 0.22),
                    checkmarkColor: PosColors.preparing,
                  ),
              ],
            ),
          )
        : const SizedBox.shrink();

    if (widget.expand) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          chips,
          Expanded(child: map),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        chips,
        SizedBox(height: widget.height ?? 260, child: map),
      ],
    );
  }
}

/// Planned route (road path + ordered stops) or the GPS trail actually driven.
class DeliveryRouteScreen extends StatelessWidget {
  const DeliveryRouteScreen({
    super.key,
    required this.jobId,
    required this.storeId,
    required this.actual,
    required this.title,
  });

  final String jobId;
  final String storeId;
  final bool actual;
  final String title;

  @override
  Widget build(BuildContext context) {
    final c = context.read<AppContainer>();
    return ChangeNotifierProvider(
      create: (_) => RouteViewController(c.deliveryRepository, jobId, storeId, actual: actual),
      child: _RouteView(title: title),
    );
  }
}

class _RouteView extends StatelessWidget {
  const _RouteView({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<RouteViewController>();
    final c = context.pos;
    final planned = ctrl.planned;
    final driven = ctrl.driven;

    Widget body;
    if (ctrl.loading) {
      body = LoadingView(message: tr('Loading route…'));
    } else if (ctrl.error != null) {
      body = ErrorView(message: ctrl.error!, onRetry: ctrl.load);
    } else if (planned != null || driven != null) {
      final hasGps = (driven?.path.length ?? 0) >= 2;
      final pins = planned != null
          ? _routePins(planned.start, planned.stops)
          : [
              MapPin(at: driven!.start, kind: MapPinKind.branch),
              for (final (i, s) in driven.stops.indexed)
                MapPin(at: s.location, kind: MapPinKind.delivered, label: '${i + 1}'),
            ];
      final facts = driven != null && (ctrl.actual || hasGps)
          ? [
              (
                tr('Planned'),
                driven.estimatedDistanceKm == null && planned == null
                    ? '—'
                    : '${(driven.estimatedDistanceKm ?? planned?.totalDistanceKm)?.toStringAsFixed(1) ?? '—'} km',
              ),
              (
                tr('Driven'),
                driven.actualDistanceKm == null ? '—' : '${driven.actualDistanceKm!.toStringAsFixed(1)} km',
              ),
              (tr('Time'), driven.actualMinutes == null ? '—' : tr('{n} min', {'n': driven.actualMinutes})),
            ]
          : [
              (tr('Distance'), '${planned!.totalDistanceKm.toStringAsFixed(1)} km'),
              (tr('Estimated time'), tr('{n} min', {'n': planned.estimatedMinutes})),
              (tr('Stops'), '${planned.stops.length}'),
            ];
      body = Column(
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(PosSpacing.md),
              child: ctrl.actual && !hasGps && planned == null
                  ? EmptyView(message: tr('No GPS trail was recorded for this run.'), icon: Icons.location_off_outlined)
                  : _PathLayerMap(
                      expand: true,
                      pins: pins,
                      plannedPath: planned?.path,
                      actualPath: driven?.path,
                      initialShowPlanned: !ctrl.actual,
                      initialShowActual: true,
                    ),
            ),
          ),
          _RouteSummary(
            facts: facts,
            stops: [
              if (planned != null)
                for (final s in planned.stops)
                  (
                    '${s.sequence}',
                    '#${s.orderNumber} · ${s.customerName}',
                    [
                      if (s.distanceFromPreviousKm != null) '${s.distanceFromPreviousKm!.toStringAsFixed(1)} km',
                      if (s.etaMinutesFromPrevious != null) tr('{n} min', {'n': s.etaMinutesFromPrevious}),
                    ].join(' · '),
                  ),
            ],
          ),
        ],
      );
    } else {
      body = const SizedBox.shrink();
    }

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              (ctrl.actual ? tr('Actual route') : tr('Planned route')).toUpperCase(),
              style: PosType.label.copyWith(color: c.textMuted),
            ),
            Text(title, style: PosType.heading.copyWith(color: c.text)),
          ],
        ),
      ),
      body: body,
    );
  }
}

class _RouteSummary extends StatelessWidget {
  const _RouteSummary({required this.facts, required this.stops});
  final List<(String, String)> facts;

  /// (sequence, title, detail)
  final List<(String, String, String)> stops;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.38),
      decoration: BoxDecoration(
        color: c.card,
        border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.7))),
      ),
      child: ListView(
        shrinkWrap: true,
        padding: EdgeInsets.fromLTRB(
          PosSpacing.lg,
          PosSpacing.md,
          PosSpacing.lg,
          PosSpacing.md + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          Row(
            children: [
              for (final (label, value) in facts)
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label.toUpperCase(), style: PosType.label.copyWith(color: c.textMuted, fontSize: 9.5)),
                      Text(value, style: PosType.bodyStrong.copyWith(color: c.text)),
                    ],
                  ),
                ),
            ],
          ),
          for (final (seq, title, detail) in stops)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              leading: CircleAvatar(
                radius: 13,
                backgroundColor: c.brand,
                child: Text(seq, style: PosType.label.copyWith(color: Colors.white, letterSpacing: 0)),
              ),
              title: Text(title, style: PosType.body.copyWith(color: c.text, fontSize: 13)),
              subtitle: detail.isEmpty ? null : Text(detail, style: PosType.caption.copyWith(color: c.textMuted)),
            ),
        ],
      ),
    );
  }
}
