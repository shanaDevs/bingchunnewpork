import 'package:flutter/material.dart';

import '../../domain/entities/delivery.dart';
import '../../l10n/l10n.dart';
import '../components/buttons.dart';
import '../components/delivery_map.dart';
import '../components/layout.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../theme/pos_theme.dart';

/// Route check before a run is published — port of the web
/// AdminDeliveryRouteModal: fastest-route summary, stops A → 1…n → B (back to
/// the branch), road map, Cancel / Create job. Pops `true` once the job exists.
class RoutePreviewScreen extends StatefulWidget {
  const RoutePreviewScreen({super.key, required this.title, required this.load, required this.onCreate});

  final String title;
  final Future<DeliveryRoute> Function() load;
  final Future<void> Function() onCreate;

  /// Opens the preview; resolves true when the job was created.
  static Future<bool> open(
    BuildContext context, {
    required String title,
    required Future<DeliveryRoute> Function() load,
    required Future<void> Function() onCreate,
  }) async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => RoutePreviewScreen(title: title, load: load, onCreate: onCreate),
      ),
    );
    return created ?? false;
  }

  @override
  State<RoutePreviewScreen> createState() => _RoutePreviewScreenState();
}

class _RoutePreviewScreenState extends State<RoutePreviewScreen> {
  DeliveryRoute? _route;
  String? _error;
  bool _creating = false;

  /// 'store', 'store-return' or a stop's order number.
  String? _selected;
  int _focusNonce = 0;
  int _fitNonce = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _route = null;
    });
    try {
      final r = await widget.load();
      if (mounted) setState(() => _route = r);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _create() async {
    setState(() => _creating = true);
    try {
      await widget.onCreate();
      if (!mounted) return;
      showPosSnack(context, tr('Delivery job created'), kind: PosSnackKind.success);
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _creating = false);
      showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  void _toggle(String key) {
    setState(() {
      _selected = _selected == key ? null : key;
      _focusNonce++;
    });
  }

  GeoPoint? get _focus {
    final r = _route;
    if (r == null || _selected == null) return null;
    if (_selected == 'store' || _selected == 'store-return') return r.start;
    return r.stops.where((s) => s.orderNumber == _selected).firstOrNull?.location;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final route = _route;
    final wide = isTablet(context);

    final map = route == null
        ? Container(
            color: c.surface,
            alignment: Alignment.center,
            child: _error == null
                ? LoadingView(message: tr('Calculating road route…'))
                : Text(tr('Map will appear here'), style: PosType.body.copyWith(color: c.textMuted)),
          )
        : DeliveryMap(
            focus: _focus,
            focusNonce: _focusNonce,
            fitNonce: _fitNonce,
            pins: [
              MapPin(at: route.start, kind: MapPinKind.branch, selected: _selected == 'store'),
              for (final s in route.stops)
                MapPin(
                  at: s.location,
                  kind: MapPinKind.stop,
                  label: '${s.sequence}',
                  selected: _selected == s.orderNumber,
                  onTap: () => _toggle(s.orderNumber),
                ),
            ],
            lines: [if (route.path.length >= 2) MapLine(points: route.path, color: c.brand)],
          );

    final panel = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : route == null
              ? LoadingView(message: tr('Building route…'))
              : ListView(
                  padding: const EdgeInsets.all(PosSpacing.lg),
                  children: [
                    _Summary(
                      route: route,
                      onViewFull: () => setState(() {
                        _selected = null;
                        _fitNonce++;
                      }),
                    ),
                    const SizedBox(height: PosSpacing.lg),
                    Text(tr('Stops').toUpperCase(), style: PosType.label.copyWith(color: c.textMuted)),
                    const SizedBox(height: PosSpacing.sm),
                    _StopItem(
                      label: 'A',
                      title: route.startName,
                      address: route.startAddress,
                      selected: _selected == 'store',
                      onTap: () => _toggle('store'),
                    ),
                    for (final s in route.stops)
                      _StopItem(
                        label: '${s.sequence}',
                        title: s.customerName,
                        orderNumber: s.orderNumber,
                        address: _stopAddress(s),
                        meta: s.distanceFromPreviousKm != null && s.etaMinutesFromPrevious != null
                            ? tr('{km} km · ~{min} min from previous', {
                                'km': s.distanceFromPreviousKm!.toStringAsFixed(1),
                                'min': s.etaMinutesFromPrevious,
                              })
                            : s.itemCount != null
                            ? trn(s.itemCount!, '{n} cup', '{n} cups')
                            : null,
                        selected: _selected == s.orderNumber,
                        onTap: () => _toggle(s.orderNumber),
                      ),
                    _StopItem(
                      label: 'B',
                      title: route.startName,
                      address: [
                        tr('Return to Branch'),
                        if (route.startAddress?.isNotEmpty ?? false) route.startAddress!,
                      ].join(' · '),
                      selected: _selected == 'store-return',
                      last: true,
                      onTap: () => _toggle('store-return'),
                    ),
                  ],
                ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(
            PosSpacing.lg,
            PosSpacing.md,
            PosSpacing.lg,
            PosSpacing.md + (wide ? 0 : MediaQuery.paddingOf(context).bottom),
          ),
          decoration: BoxDecoration(
            color: c.card,
            border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.7))),
          ),
          child: Row(
            children: [
              Expanded(
                child: PosButton(
                  label: tr('Cancel'),
                  variant: PosButtonVariant.outline,
                  onPressed: _creating ? null : () => Navigator.of(context).pop(false),
                ),
              ),
              const SizedBox(width: PosSpacing.sm),
              Expanded(
                flex: 7,
                child: PosButton(
                  label: tr('Create job'),
                  icon: Icons.local_shipping_outlined,
                  loading: _creating,
                  onPressed: route == null || _creating ? null : _create,
                ),
              ),
            ],
          ),
        ),
      ],
    );

    return PopScope(
      canPop: !_creating,
      child: Scaffold(
        appBar: AppBar(
          titleSpacing: 0,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(tr('Route preview').toUpperCase(), style: PosType.label.copyWith(color: c.textMuted)),
              Text(
                widget.title.replaceAll('#', ''),
                overflow: TextOverflow.ellipsis,
                style: PosType.heading.copyWith(color: c.text),
              ),
            ],
          ),
        ),
        body: wide
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(width: 400, child: panel),
                  VerticalDivider(width: 1, color: c.border),
                  Expanded(
                    child: Padding(padding: const EdgeInsets.all(PosSpacing.md), child: map),
                  ),
                ],
              )
            : Column(
                children: [
                  SizedBox(
                    height: MediaQuery.sizeOf(context).height * 0.36,
                    child: Padding(padding: const EdgeInsets.all(PosSpacing.md), child: map),
                  ),
                  Expanded(child: panel),
                ],
              ),
      ),
    );
  }
}

/// Web formatStopAddress: address, district, city without repeats.
String _stopAddress(RouteStop s) {
  final seen = <String>{};
  return [
    s.addressLine,
    s.district,
    s.city,
  ].whereType<String>().map((p) => p.trim()).where((p) => p.isNotEmpty && seen.add(p.toLowerCase())).join(', ');
}

class _Summary extends StatelessWidget {
  const _Summary({required this.route, required this.onViewFull});
  final DeliveryRoute route;
  final VoidCallback onViewFull;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      padding: const EdgeInsets.all(PosSpacing.md),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(PosRadius.card),
        border: Border.all(color: c.border.withValues(alpha: 0.8)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(tr('Fastest route').toUpperCase(), style: PosType.label.copyWith(color: c.textMuted)),
              ),
              TextButton.icon(
                onPressed: onViewFull,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                icon: const Icon(Icons.open_in_full_rounded, size: 14),
                label: Text(tr('View full route'), style: PosType.caption.copyWith(fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Icon(Icons.schedule_rounded, color: c.brand, size: 20),
              const SizedBox(width: 4),
              Text(
                '~${route.estimatedMinutes}',
                style: PosType.metric.copyWith(color: c.brand, fontSize: 24, height: 1),
              ),
              const SizedBox(width: 3),
              Text(tr('min'), style: PosType.bodyStrong.copyWith(color: c.brand)),
              const SizedBox(width: PosSpacing.md),
              Flexible(
                child: Text(
                  '${route.totalDistanceKm.toStringAsFixed(1)} km · ${trn(route.stops.length, '{n} stop', '{n} stops')}',
                  style: PosType.caption.copyWith(color: c.textMuted),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StopItem extends StatelessWidget {
  const _StopItem({
    required this.label,
    required this.title,
    required this.onTap,
    this.orderNumber,
    this.address,
    this.meta,
    this.selected = false,
    this.last = false,
  });

  final String label;
  final String title;
  final String? orderNumber;
  final String? address;
  final String? meta;
  final bool selected;
  final bool last;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final origin = label == 'A' || label == 'B';
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected || origin ? c.brand : c.card,
                  border: selected || origin ? null : Border.all(color: c.brand.withValues(alpha: 0.4)),
                ),
                child: Text(
                  label,
                  style: PosType.caption.copyWith(
                    color: selected || origin ? Colors.white : c.brand,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (!last)
                Expanded(
                  child: Container(width: 1, margin: const EdgeInsets.only(top: 4), color: c.border),
                ),
            ],
          ),
          const SizedBox(width: PosSpacing.md),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: PosSpacing.sm),
              child: Material(
                color: selected ? c.brandSubtle : Colors.transparent,
                borderRadius: BorderRadius.circular(PosRadius.button),
                child: InkWell(
                  borderRadius: BorderRadius.circular(PosRadius.button),
                  onTap: onTap,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5),
                        ),
                        if (orderNumber != null)
                          Text(
                            orderNumber!,
                            style: PosType.caption.copyWith(color: c.brand, fontFeatures: PosType.tabular),
                          ),
                        if (address != null && address!.isNotEmpty)
                          Text(
                            address!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: PosType.caption.copyWith(color: c.textMuted),
                          ),
                        if (meta != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 3),
                            child: Text(meta!, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
