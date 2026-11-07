import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/delivery.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/order_location_dialog.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../state/delivery_grouping_controller.dart';
import '../theme/pos_theme.dart';
import 'route_preview_screen.dart';

/// "Classify READY delivery orders" under the Orders → Delivery tab — port of
/// the web AdminDeliveryClassificationTable: tick orders into one rider's run
/// (cups-per-rider limit), preview the road route, publish the job.
class DeliveryGroupingSection extends StatelessWidget {
  const DeliveryGroupingSection({super.key, required this.onJobCreated});

  /// Refreshes the order list once a run is published.
  final VoidCallback onJobCreated;

  Future<void> _create(BuildContext context, DeliveryGroupingController ctrl) async {
    if (ctrl.selectedCount == 0) {
      showPosSnack(context, tr('Select at least one READY delivery order'), kind: PosSnackKind.error);
      return;
    }
    if (!ctrl.canCreate) {
      showPosSnack(context, _limitMessage(ctrl), kind: PosSnackKind.error);
      return;
    }
    final title = ctrl.groupTitle;
    final ids = ctrl.selection.keys.toList();
    final created = await RoutePreviewScreen.open(
      context,
      title: title,
      load: ctrl.previewSelection,
      onCreate: () => ctrl.createJob(title, ids),
    );
    if (created) onJobCreated();
  }

  String _limitMessage(DeliveryGroupingController ctrl) => tr(
    'This group has {cups} cups — each rider can carry at most {max} cups. Remove orders to continue.',
    {'cups': ctrl.selectedCups, 'max': ctrl.maxCups},
  );

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<DeliveryGroupingController>();
    final c = context.pos;
    if (ctrl.storeId == null) return const SizedBox.shrink();

    return PosCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(PosSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.alt_route_rounded, color: c.brand, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(tr('Classify READY delivery orders'), style: PosType.section.copyWith(color: c.text)),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  tr('Select orders below to build a delivery group. Each rider can carry at most {max} cups.', {
                    'max': ctrl.maxCups,
                  }),
                  style: PosType.caption.copyWith(color: c.textMuted),
                ),
                if (ctrl.pickStore && ctrl.stores.isNotEmpty) ...[
                  const SizedBox(height: PosSpacing.sm),
                  _StorePicker(ctrl: ctrl),
                ],
              ],
            ),
          ),
          if (ctrl.selectedCount > 0)
            Container(
              color: c.brandSubtle,
              padding: const EdgeInsets.symmetric(horizontal: PosSpacing.lg, vertical: PosSpacing.md),
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: PosSpacing.md,
                runSpacing: PosSpacing.sm,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        trn(
                          ctrl.selectedCount,
                          '{n} order selected for this group',
                          '{n} orders selected for this group',
                        ),
                        style: PosType.bodyStrong.copyWith(color: c.text),
                      ),
                      Text(
                        tr('{cups} · max {max} per rider', {
                          'cups': trn(ctrl.selectedCups, '{n} cup', '{n} cups'),
                          'max': ctrl.maxCups,
                        }),
                        style: PosType.caption.copyWith(color: ctrl.overLimit ? c.dangerText : c.textMuted),
                      ),
                    ],
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      PosButton(
                        label: tr('Clear selection'),
                        variant: PosButtonVariant.outline,
                        expand: false,
                        height: 42,
                        onPressed: ctrl.clearSelection,
                      ),
                      const SizedBox(width: PosSpacing.sm),
                      PosButton(
                        label: tr('Create delivery job'),
                        icon: Icons.local_shipping_outlined,
                        expand: false,
                        height: 42,
                        onPressed: ctrl.canCreate ? () => _create(context, ctrl) : null,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          if (ctrl.loading && !ctrl.loaded)
            LoadingView(message: tr('Loading READY orders…'))
          else if (ctrl.error != null && ctrl.pending.isEmpty)
            ErrorView(message: ctrl.error!, onRetry: ctrl.refresh)
          else if (ctrl.pending.isEmpty)
            Padding(
              padding: const EdgeInsets.all(PosSpacing.xl),
              child: Text(
                tr('No READY delivery orders waiting for classification.'),
                textAlign: TextAlign.center,
                style: PosType.body.copyWith(color: c.textMuted),
              ),
            )
          else ...[
            InkWell(
              onTap: ctrl.toggleAllOnPage,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: PosSpacing.sm, vertical: 2),
                child: Row(
                  children: [
                    Checkbox(value: ctrl.allPageSelected, onChanged: (_) => ctrl.toggleAllOnPage()),
                    Text(
                      tr('Select all on this page'),
                      style: PosType.caption.copyWith(color: c.text, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(PosSpacing.md, 0, PosSpacing.md, PosSpacing.md),
              child: ResponsiveGrid(
                minItemWidth: 360,
                children: [
                  for (final o in ctrl.pageOrders)
                    _PendingOrderCard(
                      order: o,
                      cups: ctrl.cupsOf(o),
                      selected: ctrl.selection.containsKey(o.orderId),
                      blocked: ctrl.addBlocked(o),
                      onChanged: (checked) {
                        final blockedAt = ctrl.toggle(o, checked);
                        if (blockedAt != null) {
                          showPosSnack(
                            context,
                            tr('Max {max} cups per rider per group ({n} cups if added)', {
                              'max': ctrl.maxCups,
                              'n': blockedAt,
                            }),
                            kind: PosSnackKind.error,
                          );
                        }
                      },
                    ),
                ],
              ),
            ),
            _Pager(ctrl: ctrl),
          ],
        ],
      ),
    );
  }
}

class _StorePicker extends StatelessWidget {
  const _StorePicker({required this.ctrl});
  final DeliveryGroupingController ctrl;

  @override
  Widget build(BuildContext context) => FilterPill(
    icon: Icons.storefront_outlined,
    active: true,
    label: ctrl.stores.where((s) => s.id == ctrl.storeId).map((s) => s.name).firstOrNull ?? tr('Select branch'),
    onTap: () async {
      final picked = await showOptionSheet<String>(
        context,
        title: tr('Branch'),
        selected: ctrl.storeId,
        options: [for (final s in ctrl.stores) (s.id, s.name)],
      );
      if (picked != null) ctrl.selectStore(picked);
    },
  );
}

/// Paid / Failed / Unpaid (web PaymentStatusBadge in the classification table).
class _PayBadge extends StatelessWidget {
  const _PayBadge({required this.status});
  final String? status;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    if (status == null) return Text('—', style: PosType.caption.copyWith(color: c.textMuted));
    final (label, color) = status == 'PAID'
        ? (tr('Paid'), c.successText)
        : status == 'FAILED'
        ? (tr('Failed'), c.dangerText)
        : (tr('Unpaid'), c.warningText);
    return PosBadge(label: label, color: color);
  }
}

class _PendingOrderCard extends StatelessWidget {
  const _PendingOrderCard({
    required this.order,
    required this.cups,
    required this.selected,
    required this.blocked,
    required this.onChanged,
  });

  final PendingDeliveryOrder order;
  final int cups;
  final bool selected;
  final bool blocked;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final address = [order.addressLine, order.district, order.city].where((s) => s.trim().isNotEmpty).join(', ');
    final canMap = hasMapLocation(order.location, address);
    return Material(
      color: selected ? c.brandSubtle : c.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.card - 2),
        side: BorderSide(color: selected ? c.brand.withValues(alpha: 0.5) : c.border.withValues(alpha: 0.7)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PosRadius.card - 2),
        onTap: blocked
            ? () => onChanged(true)
            : () {
                PosFeedback.tap();
                onChanged(!selected);
              },
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, PosSpacing.sm, PosSpacing.sm, PosSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Opacity(
                opacity: blocked ? 0.4 : 1,
                child: Checkbox(value: selected, onChanged: (v) => onChanged(v ?? false)),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              order.orderNumber,
                              overflow: TextOverflow.ellipsis,
                              style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular),
                            ),
                          ),
                          _PayBadge(status: order.paymentStatus),
                        ],
                      ),
                      Text(
                        order.createdAt == null ? '—' : formatShortDateTime(order.createdAt!),
                        style: PosType.caption.copyWith(color: c.textMuted, fontFeatures: PosType.tabular),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        order.customerName,
                        style: PosType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                      ),
                      if (order.customerPhone.isNotEmpty)
                        Text(order.customerPhone, style: PosType.caption.copyWith(color: c.textMuted)),
                      const SizedBox(height: 6),
                      Text(
                        order.items.map((i) => '${i.productName} ×${i.quantity}').join(', '),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: PosType.caption.copyWith(color: c.text, fontSize: 12.5),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          PosBadge(label: trn(cups, '{n} cup', '{n} cups'), color: c.brand),
                          const Spacer(),
                          if (canMap)
                            TextButton.icon(
                              onPressed: () => showOrderLocation(
                                context,
                                orderNumber: order.orderNumber,
                                address: address,
                                at: order.location,
                              ),
                              style: TextButton.styleFrom(
                                minimumSize: const Size(0, 32),
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                              icon: const Icon(Icons.map_outlined, size: 17),
                              label: Text(tr('Map')),
                            )
                          else
                            Text('—', style: PosType.caption.copyWith(color: c.textMuted)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Pager extends StatelessWidget {
  const _Pager({required this.ctrl});
  final DeliveryGroupingController ctrl;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final total = ctrl.pending.length;
    final start = (ctrl.page - 1) * DeliveryGroupingController.pageSize + 1;
    final end = (ctrl.page * DeliveryGroupingController.pageSize).clamp(0, total);
    return Container(
      padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.sm, PosSpacing.sm, PosSpacing.sm),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.6))),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              tr('Showing {from}–{to} of {total} orders', {'from': start, 'to': end, 'total': total}),
              style: PosType.caption.copyWith(color: c.textMuted),
            ),
          ),
          IconButton(
            tooltip: tr('Previous page'),
            onPressed: ctrl.page > 1 ? () => ctrl.setPage(ctrl.page - 1) : null,
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          Text('${ctrl.page} / ${ctrl.totalPages}', style: PosType.caption.copyWith(color: c.text)),
          IconButton(
            tooltip: tr('Next page'),
            onPressed: ctrl.page < ctrl.totalPages ? () => ctrl.setPage(ctrl.page + 1) : null,
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }
}

/// Floating "Classify orders" pill with the READY count (web AdminClassificationFab).
class ClassifyOrdersFab extends StatelessWidget {
  const ClassifyOrdersFab({super.key, required this.onJobCreated});
  final VoidCallback onJobCreated;

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<DeliveryGroupingController>();
    final c = context.pos;
    final ready = ctrl.pending.length;
    return Material(
      color: c.card,
      elevation: 6,
      shadowColor: Colors.black38,
      shape: StadiumBorder(side: BorderSide(color: c.brand.withValues(alpha: 0.3))),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () async {
          PosFeedback.tap();
          final created = await Navigator.of(context).push<bool>(
            MaterialPageRoute(
              builder: (_) => ChangeNotifierProvider.value(value: ctrl, child: const ClassifyRunsScreen()),
            ),
          );
          if (created ?? false) onJobCreated();
        },
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 14, 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(color: c.brand, shape: BoxShape.circle),
                    child: const Icon(Icons.alt_route_rounded, color: Colors.white, size: 18),
                  ),
                  if (ready > 0)
                    Positioned(
                      right: -1,
                      top: -1,
                      child: Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: const Color(0xFFFBBF24),
                          shape: BoxShape.circle,
                          border: Border.all(color: c.card, width: 2),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 10),
              Text(tr('Classify orders'), style: PosType.bodyStrong.copyWith(color: c.text)),
              if (ready > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(PosRadius.pill)),
                  child: Text(
                    '$ready',
                    style: PosType.caption.copyWith(
                      color: c.brand,
                      fontWeight: FontWeight.w800,
                      fontFeatures: PosType.tabular,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Suggested runs — web AdminDeliveryClassificationPanel in the FAB modal:
/// classifies on open, one expandable card per run, Create delivery job each.
/// Pops `true` when at least one run was published.
class ClassifyRunsScreen extends StatefulWidget {
  const ClassifyRunsScreen({super.key});

  @override
  State<ClassifyRunsScreen> createState() => _ClassifyRunsScreenState();
}

class _ClassifyRunsScreenState extends State<ClassifyRunsScreen> {
  String? _expanded;
  bool _created = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _classify(silent: true));
  }

  Future<void> _classify({required bool silent}) async {
    final ctrl = context.read<DeliveryGroupingController>();
    setState(() => _error = null);
    try {
      final r = await ctrl.classify();
      if (!mounted || r == null) return;
      setState(() => _expanded = r.clusters.firstOrNull?.id);
      if (silent) return;
      showPosSnack(
        context,
        r.clusters.isEmpty
            ? tr('No READY delivery orders to classify')
            : trn(r.clusters.length, '{n} delivery run ready', '{n} delivery runs ready'),
        kind: r.clusters.isEmpty ? PosSnackKind.info : PosSnackKind.success,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
      if (!silent) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  Future<void> _create(DeliveryGroupingController ctrl, DeliveryCluster run) async {
    final created = await RoutePreviewScreen.open(
      context,
      title: run.label,
      load: () => ctrl.routeFor(run),
      onCreate: () => ctrl.createFromCluster(run),
    );
    if (created) {
      _created = true;
      if (_expanded == run.id) setState(() => _expanded = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<DeliveryGroupingController>();
    final c = context.pos;
    final result = ctrl.suggestions;
    final runs = result?.clusters ?? const <DeliveryCluster>[];
    final grandCups = runs.fold<int>(0, (n, r) => n + r.totalCups);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_created);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('Delivery classification'), style: PosType.heading.copyWith(color: c.text)),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: PosSpacing.md),
              child: PosButton(
                label: result == null ? tr('Classify orders') : tr('Refresh'),
                icon: Icons.alt_route_rounded,
                expand: false,
                height: 40,
                loading: ctrl.classifying,
                onPressed: ctrl.storeId == null ? null : () => _classify(silent: false),
              ),
            ),
          ],
        ),
        body: ListView(
          padding: centeredPadding(context, maxWidth: 900),
          children: [
            if (ctrl.pickStore && ctrl.stores.isNotEmpty) ...[
              Align(
                alignment: Alignment.centerLeft,
                child: FilterPill(
                  icon: Icons.storefront_outlined,
                  active: true,
                  label:
                      ctrl.stores.where((s) => s.id == ctrl.storeId).map((s) => s.name).firstOrNull ??
                      tr('Select branch'),
                  onTap: () async {
                    final picked = await showOptionSheet<String>(
                      context,
                      title: tr('Branch'),
                      selected: ctrl.storeId,
                      options: [for (final s in ctrl.stores) (s.id, s.name)],
                    );
                    if (picked == null || !context.mounted) return;
                    ctrl.selectStore(picked);
                    ctrl.suggestions = null;
                    _classify(silent: true);
                  },
                ),
              ),
              const SizedBox(height: PosSpacing.md),
            ],
            if (runs.isNotEmpty && !ctrl.classifying) ...[
              Row(
                children: [PosBadge(label: trn(grandCups, '{n} cup total', '{n} cups total'), color: c.brand)],
              ),
              const SizedBox(height: PosSpacing.sm),
              Text(
                result!.mode == 'manual'
                    ? tr('Under 10 cups ({n} total) — single list, customize the route manually.', {
                        'n': result.totalCups,
                      })
                    : tr('{n} cups — split into directional runs, max {max} cups per rider.', {
                        'n': result.totalCups,
                        'max': result.maxCupsPerRider,
                      }),
                style: PosType.caption.copyWith(color: c.textMuted),
              ),
              const SizedBox(height: PosSpacing.md),
            ],
            if (ctrl.classifying)
              LoadingView(message: tr('Building delivery runs…'))
            else if (_error != null && result == null)
              ErrorView(message: _error!, onRetry: () => _classify(silent: false))
            else if (result != null && runs.isEmpty)
              EmptyView(
                message: tr('No READY delivery orders waiting for classification.'),
                icon: Icons.alt_route_rounded,
              )
            else
              for (final run in runs) ...[
                _RunCard(
                  run: run,
                  open: _expanded == run.id,
                  onToggle: () => setState(() => _expanded = _expanded == run.id ? null : run.id),
                  onCreate: () => _create(ctrl, run),
                ),
                const SizedBox(height: PosSpacing.sm),
              ],
            if (runs.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: PosSpacing.md),
                child: Text(
                  tr('Published jobs appear on the Delivery jobs page.'),
                  style: PosType.caption.copyWith(color: c.textMuted),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RunCard extends StatelessWidget {
  const _RunCard({required this.run, required this.open, required this.onToggle, required this.onCreate});
  final DeliveryCluster run;
  final bool open;
  final VoidCallback onToggle;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final route = run.route;
    final summary = route == null
        ? trn(run.stops.length, '{n} stop', '{n} stops')
        : '${trn(route.stops.length, '{n} stop', '{n} stops')} · ${route.totalDistanceKm.toStringAsFixed(1)} km · ~${tr('{n} min', {'n': route.estimatedMinutes})}';
    return PosCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(PosRadius.card),
            child: Padding(
              padding: const EdgeInsets.all(PosSpacing.md),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(run.label, style: PosType.bodyStrong.copyWith(color: c.text)),
                        Text(summary, style: PosType.caption.copyWith(color: c.textMuted)),
                      ],
                    ),
                  ),
                  PosBadge(label: trn(run.totalCups, '{n} cup', '{n} cups'), color: c.brand),
                  const SizedBox(width: 4),
                  Icon(open ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: c.textMuted),
                ],
              ),
            ),
          ),
          if (open) ...[
            Divider(height: 1, color: c.border.withValues(alpha: 0.7)),
            for (final s in run.stops)
              Padding(
                padding: const EdgeInsets.fromLTRB(PosSpacing.md, PosSpacing.sm, PosSpacing.sm, PosSpacing.sm),
                child: Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: c.brand, shape: BoxShape.circle),
                      child: Text(
                        '${s.sequence}',
                        style: PosType.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(width: PosSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            s.orderNumber,
                            style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular),
                          ),
                          Text(s.customerName, style: PosType.caption.copyWith(color: c.textMuted)),
                        ],
                      ),
                    ),
                    Text(
                      trn(s.itemCount, '{n} cup', '{n} cups'),
                      style: PosType.caption.copyWith(color: c.brand, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(width: PosSpacing.sm),
                    _PayBadge(status: s.paymentStatus),
                    () {
                      final address = [
                        s.addressLine,
                        s.district,
                        s.city,
                      ].whereType<String>().where((p) => p.trim().isNotEmpty).join(', ');
                      return hasMapLocation(s.location, address)
                          ? IconButton(
                              tooltip: tr('View location on map'),
                              onPressed: () => showOrderLocation(
                                context,
                                orderNumber: s.orderNumber,
                                address: address,
                                at: s.location,
                              ),
                              icon: Icon(Icons.map_outlined, color: c.brand, size: 20),
                            )
                          : const SizedBox(width: 48);
                    }(),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(PosSpacing.md),
              child: PosButton(
                label: tr('Create delivery job'),
                icon: Icons.local_shipping_outlined,
                onPressed: onCreate,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
