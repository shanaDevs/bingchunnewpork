import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/format.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_query.dart';
import '../../domain/logic/order_rules.dart';
import '../../domain/logic/orders_csv.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/cancel_countdown.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../components/takeaway_queue_panel.dart';
import '../labels.dart';
import '../routes.dart';
import '../state/delivery_grouping_controller.dart';
import '../state/order_alerts_controller.dart';
import '../state/orders_controller.dart';
import '../state/takeaway_queue_controller.dart';
import '../theme/pos_theme.dart';
import 'delivery_grouping.dart';

/// Orders — port of the web `/admin/orders` page for the cashier.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  int _seenSignal = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) {
        context.read<OrdersController>().loadMore();
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Pickup tokens search as you type (300 ms debounce); order numbers on submit.
  void _onSearchChanged(OrdersController ctrl, String text) {
    setState(() {});
    if (ctrl.query.tab != OrderTab.pickup || ctrl.query.archive != null) return;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => ctrl.setSearch(text));
  }

  void _clearSearch(OrdersController ctrl) {
    _search.clear();
    ctrl.setSearch('');
    setState(() {});
  }

  Future<void> _open(OrdersController ctrl, OrderSummary o) async {
    final changed = await AppRoutes.openOrder(context, o.orderNumber);
    if (changed) ctrl.refresh(silent: true);
  }

  /// Web "Export": the loaded orders as orders.csv, handed to the share sheet
  /// (save to Files / Drive, email…) since there is no browser download.
  Future<void> _export(OrdersController ctrl) async {
    final box = context.findRenderObject() as RenderBox?;
    try {
      final csv = ordersCsv(
        ctrl.orders,
        showStore: ctrl.showStore,
        formatDate: (t) {
          final d = toColombo(t);
          return '${d.month}/${d.day}/${d.year}';
        },
      );
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/orders.csv');
      await file.writeAsString(csv);
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'text/csv')],
          fileNameOverrides: const ['orders.csv'],
          sharePositionOrigin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (e) {
      if (mounted) showPosSnack(context, tr('Export failed: {e}', {'e': e}), kind: PosSnackKind.error);
    }
  }

  /// Queue polls while Orders is on screen; READY-order grouping only on the
  /// Delivery tab (web `visible` props). Hidden shell tabs have tickers off.
  void _syncVisibility(OrdersController ctrl) {
    final onScreen = TickerMode.of(context);
    final q = ctrl.query;
    final grouping = onScreen && !ctrl.pickupOnly && q.tab == OrderTab.delivery && q.archive == null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<TakeawayQueueController>().setVisible(onScreen);
      context.read<DeliveryGroupingController>().setVisible(grouping);
    });
  }

  bool _groupingVisible(OrdersController ctrl) =>
      !ctrl.pickupOnly && ctrl.query.tab == OrderTab.delivery && ctrl.query.archive == null;

  void _afterJobCreated(OrdersController ctrl) => ctrl.refresh(silent: true);

  String _subtitle(OrdersController ctrl) {
    final q = ctrl.query;
    final period = periodLabel(q.period);
    if (q.archive == ArchiveView.delivered) {
      return tr('{n} complete orders · {period}', {'n': ctrl.total, 'period': period});
    }
    if (q.archive == ArchiveView.cancelled) {
      return tr('{n} cancelled orders · {period}', {'n': ctrl.total, 'period': period});
    }
    final status = orderStatusLabel(q.status).toLowerCase();
    return q.tab == OrderTab.pickup
        ? tr('{n} {status} pickup orders · {period}', {'n': ctrl.total, 'status': status, 'period': period})
        : tr('{n} {status} delivery orders · {period}', {'n': ctrl.total, 'status': status, 'period': period});
  }

  String _emptyMessage(OrdersController ctrl) {
    final q = ctrl.query;
    if (q.search.isNotEmpty) {
      return q.tab == OrderTab.pickup && q.archive == null
          ? tr('No orders match token "{q}"', {'q': q.search})
          : tr('No orders match order number "{q}"', {'q': q.search});
    }
    if (q.archive == ArchiveView.cancelled) return tr('No cancelled orders found');
    if (q.archive == ArchiveView.delivered) return tr('No complete orders found');
    final status = orderStatusLabel(q.status).toLowerCase();
    return q.tab == OrderTab.pickup
        ? tr('No {status} pickup orders found', {'status': status})
        : tr('No {status} delivery orders found', {'status': status});
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<OrdersController>();
    final signal = context.select<OrderAlertsController, int>((a) => a.orderSignal);
    if (signal != _seenSignal) {
      _seenSignal = signal;
      WidgetsBinding.instance.addPostFrameCallback((_) => ctrl.onNewOrder());
    }
    final q = ctrl.query;
    final c = context.pos;
    _syncVisibility(ctrl);
    final grouping = _groupingVisible(ctrl);

    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: () async {
            await ctrl.refresh(silent: true);
            if (context.mounted) context.read<TakeawayQueueController>().refresh(silent: true);
          },
          child: CustomScrollView(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.lg, 0),
                sliver: SliverList.list(
                  children: [
                    PageHeader(
                      title: tr('Orders'),
                      subtitle: _subtitle(ctrl),
                      actions: [
                        PosIconButton(
                          icon: Icons.download_rounded,
                          tooltip: tr('Export'),
                          onPressed: () => _export(ctrl),
                        ),
                        PosIconButton(
                          icon: Icons.refresh_rounded,
                          tooltip: tr('Refresh'),
                          onPressed: () => ctrl.refresh(),
                        ),
                      ],
                    ),
                    const SizedBox(height: PosSpacing.md),
                    const TakeawayQueuePanel(),
                    const SizedBox(height: PosSpacing.md),
                    CapsuleTabs<OrderTab>(
                      selected: q.archive == null ? q.tab : null,
                      onSelect: (t) {
                        _search.clear();
                        ctrl.switchTab(t);
                      },
                      items: [
                        CapsuleTabItem(
                          value: OrderTab.pickup,
                          label: tr('Pickup Queue'),
                          icon: Icons.shopping_bag_outlined,
                          count: ctrl.tabCounts[OrderTab.pickup],
                        ),
                        if (!ctrl.pickupOnly)
                          CapsuleTabItem(
                            value: OrderTab.delivery,
                            label: tr('Delivery Jobs'),
                            icon: Icons.delivery_dining_outlined,
                            count: ctrl.tabCounts[OrderTab.delivery],
                          ),
                      ],
                    ),
                    const SizedBox(height: PosSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: _ArchiveLink(
                            icon: Icons.cancel_outlined,
                            label: tr('Cancelled orders'),
                            active: q.archive == ArchiveView.cancelled,
                            onTap: () {
                              _search.clear();
                              ctrl.showArchive(ArchiveView.cancelled);
                            },
                          ),
                        ),
                        const SizedBox(width: PosSpacing.sm),
                        Expanded(
                          child: _ArchiveLink(
                            icon: Icons.inventory_2_outlined,
                            label: tr('Complete orders'),
                            active: q.archive == ArchiveView.delivered,
                            onTap: () {
                              _search.clear();
                              ctrl.showArchive(ArchiveView.delivered);
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: PosSpacing.md),
                    if (q.archive == null) ...[
                      StatusTabs(
                        selected: q.status,
                        onSelect: ctrl.setStatus,
                        items: [
                          for (final s in OrderStatus.queue)
                            StatusTabItem(
                              value: s,
                              label: orderStatusLabel(s),
                              color: orderStatusColor(context, s),
                              count: ctrl.statusCounts[s] ?? 0,
                            ),
                        ],
                      ),
                      const SizedBox(height: PosSpacing.md),
                      _SearchBar(
                        controller: _search,
                        pickup: q.tab == OrderTab.pickup,
                        onChanged: (t) => _onSearchChanged(ctrl, t),
                        onSubmit: () => ctrl.setSearch(_search.text),
                        onClear: () => _clearSearch(ctrl),
                      ),
                      const SizedBox(height: PosSpacing.md),
                    ],
                    _FilterRow(ctrl: ctrl),
                    const SizedBox(height: PosSpacing.md),
                  ],
                ),
              ),
              if (ctrl.loading && ctrl.orders.isEmpty)
                SliverToBoxAdapter(child: LoadingView(message: tr('Loading orders...')))
              else if (!q.period.ready)
                SliverToBoxAdapter(child: EmptyView(message: tr('Select a date range to view order history.')))
              else if (ctrl.error != null && ctrl.orders.isEmpty)
                SliverToBoxAdapter(
                  child: ErrorView(message: ctrl.error!, onRetry: ctrl.refresh),
                )
              else if (ctrl.orders.isEmpty)
                SliverToBoxAdapter(
                  child: EmptyView(message: _emptyMessage(ctrl), icon: Icons.receipt_long_outlined),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: PosSpacing.lg),
                  // One column on phones, two or three on tablets.
                  sliver: SliverToBoxAdapter(
                    child: ResponsiveGrid(
                      children: [
                        for (final o in ctrl.orders)
                          OrderCard(order: o, query: q, showStore: ctrl.showStore, onTap: () => _open(ctrl, o)),
                      ],
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(PosSpacing.lg),
                  child: ctrl.loadingMore
                      ? const LoadingView()
                      : ctrl.orders.isNotEmpty && !ctrl.hasMore
                      ? Text(
                          tr('Showing {n} of {total} orders', {'n': ctrl.orders.length, 'total': ctrl.total}),
                          textAlign: TextAlign.center,
                          style: PosType.caption.copyWith(color: c.textMuted),
                        )
                      : const SizedBox.shrink(),
                ),
              ),
              if (grouping)
                SliverPadding(
                  // Room under the section for the floating Classify button (web mb-24).
                  padding: const EdgeInsets.fromLTRB(PosSpacing.lg, 0, PosSpacing.lg, 96),
                  sliver: SliverToBoxAdapter(
                    child: DeliveryGroupingSection(onJobCreated: () => _afterJobCreated(ctrl)),
                  ),
                ),
            ],
          ),
        ),
        if (grouping)
          Positioned(
            right: PosSpacing.lg,
            bottom: PosSpacing.lg,
            child: ClassifyOrdersFab(onJobCreated: () => _afterJobCreated(ctrl)),
          ),
      ],
    );
  }
}

class _ArchiveLink extends StatelessWidget {
  const _ArchiveLink({required this.icon, required this.label, required this.active, required this.onTap});
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Material(
      color: active ? c.brandSubtle : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.button),
        side: BorderSide(color: active ? c.brand.withValues(alpha: 0.5) : c.border.withValues(alpha: 0.7)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PosRadius.button),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: active ? c.brand : c.textMuted),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.bodyStrong.copyWith(color: active ? c.brand : c.text, fontSize: 12.5),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SearchBar extends StatelessWidget {
  const _SearchBar({
    required this.controller,
    required this.pickup,
    required this.onChanged,
    required this.onSubmit,
    required this.onClear,
  });

  final TextEditingController controller;
  final bool pickup;
  final ValueChanged<String> onChanged;
  final VoidCallback onSubmit;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final field = TextField(
      controller: controller,
      keyboardType: pickup ? TextInputType.number : TextInputType.text,
      inputFormatters: pickup ? [FilteringTextInputFormatter.digitsOnly] : null,
      textInputAction: TextInputAction.search,
      onChanged: onChanged,
      onSubmitted: (_) => onSubmit(),
      decoration: InputDecoration(
        hintText: pickup ? tr('Search by token...') : tr('Search by order number...'),
        prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(
                onPressed: onClear,
                icon: Icon(Icons.close_rounded, size: 18, color: c.textMuted),
              ),
      ),
    );
    if (pickup) return field;
    return Row(
      children: [
        Expanded(child: field),
        const SizedBox(width: PosSpacing.sm),
        SizedBox(
          width: 110,
          child: PosButton(label: tr('Find'), onPressed: onSubmit, height: 46),
        ),
      ],
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({required this.ctrl});
  final OrdersController ctrl;

  @override
  Widget build(BuildContext context) {
    final q = ctrl.query;
    final cashierName = ctrl.cashiers.where((x) => x.id == q.processedById).map((x) => x.name).firstOrNull;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Row(
        children: [
          PeriodFilterPill(value: q.period, onChanged: ctrl.setPeriod),
          const SizedBox(width: PosSpacing.sm),
          FilterPill(
            icon: Icons.hub_outlined,
            label: q.channel == null ? tr('All channels') : channelLabel(q.channel),
            active: q.channel != null,
            onTap: () async {
              final picked = await showOptionSheet<String>(
                context,
                title: tr('Channel'),
                selected: q.channel ?? '',
                options: [('', tr('All channels')), for (final ch in orderChannels) (ch, channelLabel(ch))],
              );
              if (picked != null) ctrl.setChannel(picked.isEmpty ? null : picked);
            },
          ),
          const SizedBox(width: PosSpacing.sm),
          FilterPill(
            icon: Icons.swap_vert_rounded,
            label: q.sortDir == 'desc' ? tr('Newest first') : tr('Oldest first'),
            active: q.sortDir != OrderQuery.defaultSortDir(q.archive),
            onTap: () async {
              final picked = await showOptionSheet<String>(
                context,
                title: tr('Sort by ordered time'),
                selected: q.sortDir,
                options: [('desc', tr('Newest first')), ('asc', tr('Oldest first'))],
              );
              if (picked != null) ctrl.setSort(picked);
            },
          ),
          if (q.archive != null && ctrl.cashiers.isNotEmpty) ...[
            const SizedBox(width: PosSpacing.sm),
            FilterPill(
              icon: Icons.badge_outlined,
              label: cashierName ?? tr('All cashiers'),
              active: q.processedById != null,
              onTap: () async {
                final picked = await showOptionSheet<String>(
                  context,
                  title: tr('Processed by'),
                  selected: q.processedById ?? '',
                  options: [('', tr('All cashiers')), for (final x in ctrl.cashiers) (x.id, x.name)],
                );
                if (picked != null) ctrl.setProcessedBy(picked.isEmpty ? null : picked);
              },
            ),
          ],
          if (ctrl.hasActiveFilters) ...[
            const SizedBox(width: PosSpacing.sm),
            TextButton.icon(
              onPressed: ctrl.resetFilters,
              icon: const Icon(Icons.restart_alt_rounded, size: 18),
              label: Text(tr('Reset')),
            ),
          ],
        ],
      ),
    );
  }
}

/// One order in the list — the mobile form of a web orders-table row.
class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, required this.query, required this.showStore, required this.onTap});

  final OrderSummary order;
  final OrderQuery query;
  final bool showStore;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final o = order;
    final pickupQueue = query.tab == OrderTab.pickup && query.archive == null;
    final liveQueue = query.archive == null;
    final cancelledView = query.archive == ArchiveView.cancelled;
    final timeOnly = liveQueue && query.period.preset == PeriodPreset.today;
    final pickupAt = pickupQueue ? pickupTimeLabel(o, formatTime) : null;
    final phone = customerPhone(o);

    return PosCard(
      onTap: onTap,
      padding: const EdgeInsets.all(PosSpacing.md),
      color: o.isCancelled ? c.danger.withValues(alpha: c.isDark ? 0.08 : 0.04) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (pickupQueue) ...[PickupTokenBadge(token: o.queuePosition), const SizedBox(width: PosSpacing.md)],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            pickupQueue ? customerDisplayName(o) : '#${o.orderNumber}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 14.5),
                          ),
                        ),
                        if (query.archive != null) ...[const SizedBox(width: 6), ModeBadge(mode: o.orderMode)],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [if (pickupQueue) '#${o.orderNumber}' else customerDisplayName(o), ?phone].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: PosType.caption.copyWith(color: c.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: PosSpacing.sm),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    formatMoney(o.total),
                    style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular),
                  ),
                  const SizedBox(height: 4),
                  PaymentStateBadge(order: o),
                ],
              ),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          _ItemsCompact(items: o.items),
          const SizedBox(height: PosSpacing.sm),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _Meta(
                icon: Icons.schedule_rounded,
                text: timeOnly ? formatTime(o.createdAt) : formatShortDateTime(o.createdAt),
              ),
              if (pickupAt != null)
                _Meta(icon: Icons.storefront_outlined, text: tr('Pickup {time}', {'time': pickupAt})),
              if (showStore && o.storeName != null)
                _Meta(icon: Icons.store_mall_directory_outlined, text: o.storeName!),
              if (o.processedByName != null) _Meta(icon: Icons.badge_outlined, text: o.processedByName!),
              if (liveQueue && o.status == OrderStatus.received) CancelCountdownBadge(order: o),
            ],
          ),
          if (cancelledView) ...[
            const SizedBox(height: PosSpacing.sm),
            PosInset(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tr('Cancelled by {who}', {'who': cancelledByLabel(o)}),
                    style: PosType.caption.copyWith(color: c.dangerText, fontWeight: FontWeight.w600),
                  ),
                  Text(cancelReasonLabel(o), style: PosType.caption.copyWith(color: c.textMuted)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ItemsCompact extends StatelessWidget {
  const _ItemsCompact({required this.items});
  final List<OrderLine> items;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    if (items.isEmpty) return const SizedBox.shrink();
    final shown = items.take(2).toList();
    final more = items.length - shown.length;
    return Text(
      [
        for (final i in shown) '${i.quantity}× ${i.productName}',
        if (more > 0) tr('+{n} more', {'n': more}),
      ].join('  ·  '),
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: PosType.caption.copyWith(color: c.text, fontSize: 12.5),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: c.textSoft),
        const SizedBox(width: 3),
        Text(text, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5)),
      ],
    );
  }
}
