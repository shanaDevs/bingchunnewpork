import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/exporter.dart';
import '../../core/format.dart';
import '../../domain/entities/menu.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_query.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../labels.dart';
import '../routes.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

/// Status filter on All Orders. `active` is the web default (everything still open).
enum _StatusFilter { active, received, preparing, ready, completed, cancelled }

/// All Orders — port of the web `/admin/all-orders` (super admin, view only):
/// pickup and delivery orders of every branch with branch, date, status and
/// cashier filters, and who processed each order.
class AllOrdersScreen extends StatefulWidget {
  const AllOrdersScreen({super.key});

  @override
  State<AllOrdersScreen> createState() => _AllOrdersScreenState();
}

class _AllOrdersScreenState extends State<AllOrdersScreen> {
  OrderTab _tab = OrderTab.pickup;
  _StatusFilter _status = _StatusFilter.active;
  PeriodFilter _period = const PeriodFilter.month();
  String? _storeId;
  String? _processedById;
  String _search = '';
  int _page = 1;
  List<StoreOption> _stores = const [];
  List<CashierOption> _cashiers = const [];
  final Map<OrderTab, int> _counts = {};
  late final Loadable<Paged<OrderSummary>> _orders;
  Timer? _timer;

  static const _pageSize = 20;

  @override
  void initState() {
    super.initState();
    final c = context.read<AppContainer>();
    _orders = Loadable(() => c.orderRepository.listRaw(_params(_page)));
    c.menuRepository.stores().then((s) => mounted ? setState(() => _stores = s) : null, onError: (_) {});
    c.orderRepository.cashiers().then((s) => mounted ? setState(() => _cashiers = s) : null, onError: (_) {});
    _loadCounts();
    // Web refetchInterval: 30_000.
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted || !TickerMode.of(context)) return;
      _orders.load(silent: true);
      _loadCounts();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _orders.dispose();
    super.dispose();
  }

  String _mode(OrderTab t) => t == OrderTab.pickup ? OrderMode.takeaway : OrderMode.delivery;
  String _activeExclude(OrderTab t) => t == OrderTab.delivery ? 'DELIVERED,OUT_FOR_DELIVERY' : 'DELIVERED';

  Map<String, String> _shared() {
    final r = _period.orderRange;
    return {
      'startDate': ?r.startDate,
      'endDate': ?r.endDate,
      'storeId': ?_storeId,
    };
  }

  /// Built like the web All Orders query (archive views ignore the mode tab).
  Map<String, String> _params(int page) {
    final p = <String, String>{'page': '$page', 'limit': '$_pageSize', 'sortDir': 'desc', ..._shared()};
    switch (_status) {
      case _StatusFilter.completed:
        p['status'] = OrderStatus.delivered;
      case _StatusFilter.cancelled:
        p['status'] = OrderStatus.cancelled;
      case _StatusFilter.active:
        p['orderMode'] = _mode(_tab);
        if (_search.isEmpty) p['excludeStatus'] = _activeExclude(_tab);
        if (_tab == OrderTab.delivery) p['hideUnassignedReady'] = 'true';
      case _StatusFilter.received || _StatusFilter.preparing || _StatusFilter.ready:
        p['orderMode'] = _mode(_tab);
        p['status'] = switch (_status) {
          _StatusFilter.received => OrderStatus.received,
          _StatusFilter.preparing => OrderStatus.preparing,
          _ => OrderStatus.ready,
        };
        if (_tab == OrderTab.delivery) p['hideUnassignedReady'] = 'true';
    }
    if (_search.isNotEmpty) p['search'] = _search;
    if (_processedById != null) p['processedById'] = _processedById!;
    return p;
  }

  Future<void> _loadCounts() async {
    final repo = context.read<AppContainer>().orderRepository;
    for (final t in OrderTab.values) {
      try {
        final n = await repo.count({
          'page': '1',
          'limit': '1',
          'excludeStatus': _activeExclude(t),
          'orderMode': _mode(t),
          if (t == OrderTab.delivery) 'hideUnassignedReady': 'true',
          ..._shared(),
        });
        if (mounted) setState(() => _counts[t] = n);
      } catch (_) {
        // Badge stays as it was.
      }
    }
  }

  void _reload({bool counts = false}) {
    _page = 1;
    _orders.load();
    if (counts) _loadCounts();
  }

  bool get _archive => _status == _StatusFilter.completed || _status == _StatusFilter.cancelled;

  String _statusLabel(_StatusFilter s) => switch (s) {
    _StatusFilter.active => tr('All active'),
    _StatusFilter.received => tr('Received'),
    _StatusFilter.preparing => tr('In progress'),
    _StatusFilter.ready => tr('Ready'),
    _StatusFilter.completed => tr('Completed'),
    _StatusFilter.cancelled => tr('Cancelled'),
  };

  Future<void> _pickStatus() async {
    final picked = await showOptionSheet<_StatusFilter>(
      context,
      title: tr('Order status'),
      selected: _status,
      options: [for (final s in _StatusFilter.values) (s, _statusLabel(s))],
    );
    if (picked == null) return;
    setState(() => _status = picked);
    _reload();
  }

  Future<void> _pickStore() async {
    final picked = await showOptionSheet<String>(
      context,
      title: tr('Branch'),
      selected: _storeId ?? '',
      options: [('', tr('All branches')), for (final s in _stores) (s.id, shortBranch(s.name))],
    );
    if (picked == null) return;
    setState(() => _storeId = picked.isEmpty ? null : picked);
    _reload(counts: true);
  }

  Future<void> _pickCashier() async {
    final picked = await showOptionSheet<String>(
      context,
      title: tr('Processed by'),
      selected: _processedById ?? '',
      options: [('', tr('All cashiers')), for (final s in _cashiers) (s.id, s.name)],
    );
    if (picked == null) return;
    setState(() => _processedById = picked.isEmpty ? null : picked);
    _reload();
  }

  Future<void> _export(List<OrderSummary> rows) async {
    try {
      await Exporter.shareCsv(
        context,
        filename: 'all-orders-${formatYmd(DateTime.now())}',
        headers: [tr('Order Number'), tr('Branch'), tr('Mode'), tr('Status'), tr('Total'), tr('Processed by'), tr('Date')],
        rows: [
          for (final o in rows)
            [
              o.orderNumber,
              shortBranch(o.storeName),
              modeLabel(o.orderMode),
              orderStatusLabel(o.status, mode: o.orderMode),
              o.total,
              o.processedByName ?? '',
              formatShortDateTime(o.createdAt),
            ],
        ],
      );
    } catch (e) {
      if (mounted) showPosSnack(context, tr('Export failed: {e}', {'e': e}), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final storeName = _storeId == null ? tr('All branches') : shortBranch(_stores.where((s) => s.id == _storeId).firstOrNull?.name);
    final cashierName = _processedById == null ? tr('All cashiers') : (_cashiers.where((s) => s.id == _processedById).firstOrNull?.name ?? '—');
    return ListenableBuilder(
      listenable: _orders,
      builder: (context, _) {
        final page = _orders.data;
        return AdminPageList(
          onRefresh: () async {
            await _orders.load(silent: true);
            await _loadCounts();
          },
          children: [
            PageHeader(
              title: tr('All Orders'),
              subtitle: tr('Pickup and delivery orders across every branch'),
              actions: [
                const ViewOnlyTag(),
                PosIconButton(
                  icon: Icons.download_rounded,
                  tooltip: tr('Export CSV'),
                  onPressed: page == null || page.items.isEmpty ? null : () => _export(page.items),
                ),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            if (!_archive)
              CapsuleTabs<OrderTab>(
                items: [
                  CapsuleTabItem(value: OrderTab.pickup, label: tr('Pickup'), icon: Icons.shopping_bag_outlined, count: _counts[OrderTab.pickup]),
                  CapsuleTabItem(value: OrderTab.delivery, label: tr('Delivery'), icon: Icons.delivery_dining_rounded, count: _counts[OrderTab.delivery]),
                ],
                selected: _tab,
                onSelect: (t) {
                  setState(() => _tab = t);
                  _reload();
                },
              ),
            const SizedBox(height: PosSpacing.md),
            SearchBox(
              hint: tr('Search order #, customer or phone'),
              onChanged: (v) {
                _search = v;
                _reload();
              },
            ),
            const SizedBox(height: PosSpacing.sm),
            Wrap(
              spacing: PosSpacing.sm,
              runSpacing: PosSpacing.sm,
              children: [
                PeriodFilterPill(
                  value: _period,
                  onChanged: (p) {
                    setState(() => _period = p);
                    _reload(counts: true);
                  },
                ),
                FilterPill(label: storeName, icon: Icons.storefront_outlined, active: _storeId != null, onTap: _pickStore),
                FilterPill(label: _statusLabel(_status), icon: Icons.flag_outlined, active: _status != _StatusFilter.active, onTap: _pickStatus),
                FilterPill(label: cashierName, icon: Icons.person_outline_rounded, active: _processedById != null, onTap: _pickCashier),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            if (_orders.loading && page != null) const LinearProgressIndicator(minHeight: 2),
            if (page == null)
              _orders.error != null
                  ? ErrorView(message: _orders.error!, onRetry: _orders.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else if (page.items.isEmpty)
              EmptyView(message: tr('No orders match these filters'), icon: Icons.receipt_long_outlined)
            else ...[
              ResponsiveGrid(
                minItemWidth: 380,
                children: [for (final o in page.items) _OrderRow(order: o)],
              ),
              Pager(
                page: _page,
                pages: page.pages,
                total: page.total,
                onPage: (p) {
                  _page = p;
                  _orders.load();
                },
              ),
            ],
          ],
        );
      },
    );
  }
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.order});
  final OrderSummary order;

  String get _customer => order.userName ?? order.guestName ?? tr('Guest');

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final o = order;
    return PosCard(
      onTap: () => AppRoutes.openOrder(context, o.orderNumber, readOnly: true),
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('#${o.orderNumber}', style: PosType.bodyStrong.copyWith(color: c.text)),
              const SizedBox(width: PosSpacing.sm),
              ModeBadge(mode: o.orderMode),
              const Spacer(),
              OrderStatusBadge(order: o),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(Icons.storefront_outlined, size: 14, color: c.textMuted),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  shortBranch(o.storeName),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.caption.copyWith(color: c.textMuted, fontWeight: FontWeight.w600),
                ),
              ),
              Text(formatShortDateTime(o.createdAt), style: PosType.caption.copyWith(color: c.textMuted)),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  _customer,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.body.copyWith(color: c.text, fontSize: 13),
                ),
              ),
              Text(formatMoney(o.total), style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular)),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              PaymentStateBadge(order: o),
              const SizedBox(width: 6),
              if (o.channel != null) ChannelBadge(channel: o.channel),
              const Spacer(),
              Icon(Icons.badge_outlined, size: 14, color: c.textSoft),
              const SizedBox(width: 4),
              Text(
                o.processedByName ?? '—',
                style: PosType.caption.copyWith(color: c.textSoft, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
