import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/exporter.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/buttons.dart';
import '../components/charts.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/product_widgets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

// ======================================================================
// Super admin — Brand Sales Command Center (web /admin/brand-sales)
// ======================================================================

enum _BrandTab { overview, top, standard }

class BrandSalesScreen extends StatefulWidget {
  const BrandSalesScreen({super.key});

  @override
  State<BrandSalesScreen> createState() => _BrandSalesScreenState();
}

class _BrandSalesScreenState extends State<BrandSalesScreen> {
  PeriodFilter _period = const PeriodFilter.month();
  _BrandTab _tab = _BrandTab.overview;
  late final Loadable<BrandAnalytics> _overview;
  final Map<_BrandTab, Loadable<BrandAnalytics>> _tiers = {};
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _overview = Loadable(() => repo.brandAnalytics(_period));
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted && TickerMode.of(context)) _active.load(silent: true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _overview.dispose();
    for (final t in _tiers.values) {
      t.dispose();
    }
    super.dispose();
  }

  Loadable<BrandAnalytics> get _active {
    if (_tab == _BrandTab.overview) return _overview;
    return _tiers.putIfAbsent(_tab, () {
      final repo = context.read<AppContainer>().adminRepository;
      final tier = _tab == _BrandTab.top ? 'top' : 'standard';
      return Loadable(() => repo.brandAnalytics(_period, tier: tier));
    });
  }

  void _setPeriod(PeriodFilter p) {
    if (!p.ready) return;
    setState(() => _period = p);
    _overview.load();
    for (final t in _tiers.values) {
      t.load();
    }
  }

  /// "Download branch sales performance report" — CSV or PDF of the branch table.
  Future<void> _download({required bool pdf}) async {
    final data = _active.data;
    if (data == null) return;
    final rows = data.branchPerformance;
    final headers = [tr('Branch'), tr('Tier'), tr('Orders'), tr('Gross Sales (LKR)'), tr('Growth %'), tr('Delivery %'), tr('Net Take-home (LKR)')];
    final name = 'branch-sales-performance-${formatYmd(DateTime.now())}';
    try {
      if (pdf) {
        await Exporter.sharePdf(
          context,
          filename: name,
          title: tr('Branch Sales Performance Report'),
          subtitle: '${_tabLabel(_tab)} · ${periodLabel(_period)}',
          headers: headers,
          rows: [
            for (final r in rows)
              [
                shortBranch(r.branchName),
                _tierLabel(r),
                formatCount(r.totalOrders),
                formatMoneyAmount(r.grossSales),
                r.growthPercent == null ? '—' : '${r.growthPercent!.toStringAsFixed(1)}%',
                r.deliveryPercent == null ? '—' : '${r.deliveryPercent!.toStringAsFixed(1)}%',
                r.netTakeHome == null ? '—' : formatMoneyAmount(r.netTakeHome!),
              ],
          ],
          summary: [
            (tr('Gross Sales'), formatMoney(data.grossSales)),
            (tr('Total Orders'), formatCount(data.totalOrders)),
            (tr('Branches'), formatCount(rows.length)),
          ],
          numericColumns: const {2, 3, 4, 5, 6},
        );
      } else {
        await Exporter.shareCsv(
          context,
          filename: name,
          headers: headers,
          rows: [
            for (final r in rows)
              [r.branchName, _tierLabel(r), r.totalOrders, r.grossSales, r.growthPercent ?? 0, r.deliveryPercent ?? '', r.netTakeHome ?? ''],
          ],
        );
      }
    } catch (e) {
      if (mounted) showPosSnack(context, tr('Export failed: {e}', {'e': e}), kind: PosSnackKind.error);
    }
  }

  String _tierLabel(BranchPerformance r) =>
      (r.deliveryEnabled == true || r.tier == 'top') ? tr('Delivery & Pickup') : tr('Pickup Only');

  String _tabLabel(_BrandTab t) => switch (t) {
    _BrandTab.overview => tr('All Branches Overview'),
    _BrandTab.top => tr('Delivery & Pickup'),
    _BrandTab.standard => tr('Pickup Only'),
  };

  @override
  Widget build(BuildContext context) {
    final active = _active;
    return ListenableBuilder(
      listenable: Listenable.merge([_overview, active]),
      builder: (context, _) {
        final stores = _overview.data?.stores ?? const [];
        final counts = {
          _BrandTab.top: stores.where((s) => s.isTopTier).length,
          _BrandTab.standard: stores.where((s) => !s.isTopTier).length,
        };
        final d = active.data;
        final label = periodLabel(_period);
        return AdminPageList(
          onRefresh: () => active.load(silent: true),
          children: [
            PageHeader(
              title: tr('Sales Command Center'),
              subtitle: tr('Cross-branch performance · delivery tiers · {p}', {'p': label}),
            ),
            const SizedBox(height: PosSpacing.md),
            PeriodSegments(value: _period, onChanged: _setPeriod),
            const SizedBox(height: PosSpacing.md),
            PillTabs<_BrandTab>(
              items: [
                for (final t in _BrandTab.values) (t, _tabLabel(t), null, t == _BrandTab.overview || stores.isEmpty ? null : counts[t]),
              ],
              selected: _tab,
              onSelect: (t) => setState(() => _tab = t),
            ),
            const SizedBox(height: PosSpacing.md),
            if (d == null)
              active.error != null
                  ? ErrorView(message: active.error!, onRetry: active.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else ...[
              if (active.loading) const LinearProgressIndicator(minHeight: 2),
              _kpis(d),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 420,
                children: [_salesOverview(d, label), _revenueAndStatus(d, label)],
              ),
              const SizedBox(height: PosSpacing.md),
              _branchTable(d, label),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 340,
                children: [
                  _channels(d.channels, label, pickupOnly: _tab == _BrandTab.standard),
                  _products(tr('Top Selling Products'), d.topProducts, label),
                  _products(tr('Least Selling Products'), d.leastProducts, label),
                ],
              ),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 340,
                children: [_hourly(d.hourly, label), _customers(d.topCustomers, label), _audience(d, label)],
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _kpis(BrandAnalytics d) {
    double? chg(String k) => d.comparison[k]?.changePercent;
    final aov = d.totalOrders == 0 ? 0.0 : d.grossSales / d.totalOrders;
    return KpiGrid(
      children: [
        KpiTile(icon: Icons.trending_up_rounded, title: tr('Total Gross Sales'), value: formatMoney(d.grossSales), change: chg('grossSales')),
        KpiTile(icon: Icons.shopping_bag_outlined, title: tr('Total Orders'), value: formatCount(d.totalOrders), change: chg('totalOrders'), color: PosColors.received),
        KpiTile(icon: Icons.local_cafe_outlined, title: tr('Total Cups Sold'), value: formatCount(d.totalCups), change: chg('totalCups'), color: context.pos.accent),
        KpiTile(
          icon: Icons.account_balance_wallet_outlined,
          title: tr('Average Order Value'),
          value: formatMoney(d.comparison['averageOrderValue']?.current ?? aov),
          change: chg('averageOrderValue'),
          color: PosColors.ready,
        ),
        if (_tab != _BrandTab.standard)
          KpiTile(icon: Icons.delivery_dining_rounded, title: tr('Delivery Revenue'), value: formatMoney(d.deliveryRevenue), caption: tr('{n} delivery orders', {'n': formatCount(d.deliveryOrders)})),
        KpiTile(icon: Icons.storefront_outlined, title: tr('Pickup Orders'), value: formatCount(d.pickupOrders)),
        KpiTile(icon: Icons.receipt_outlined, title: tr('Convenience Revenue'), value: formatMoney(d.convenienceRevenue)),
        if (d.netRevenue != null) KpiTile(icon: Icons.savings_outlined, title: tr('Net Revenue'), value: formatMoney(d.netRevenue!), color: PosColors.ready),
      ],
    );
  }

  Widget _salesOverview(BrandAnalytics d, String label) {
    final c = context.pos;
    final pts = d.salesOverview;
    return SectionCard(
      title: tr('Sales Overview'),
      subtitle: label,
      child: SizedBox(
        height: 220,
        child: pts.isEmpty
            ? Center(child: Text(tr('No data for this period'), style: PosType.caption.copyWith(color: c.textMuted)))
            : BarChart(
                values: [for (final p in pts) p.value],
                labels: [for (final p in pts) p.label.length > 6 ? p.label.substring(0, 6) : p.label],
                color: c.brand,
                labelEvery: (pts.length / 7).ceil().clamp(1, 12),
              ),
      ),
    );
  }

  Widget _revenueAndStatus(BrandAnalytics d, String label) {
    final c = context.pos;
    final status = [
      (tr('Completed'), d.statusCompleted.toDouble(), PosColors.ready),
      (tr('Preparing'), d.statusPreparing.toDouble(), PosColors.preparing),
      (tr('Pending'), d.statusPending.toDouble(), PosColors.received),
      (tr('Cancelled'), d.statusCancelled.toDouble(), c.danger),
    ];
    final statusTotal = status.fold<double>(0, (a, s) => a + s.$2);
    final revTotal = d.revenueDelivery + d.revenuePickup;
    return SectionCard(
      title: tr('Revenue & Order Status'),
      subtitle: label,
      child: Column(
        children: [
          LegendLine(color: PosColors.channelDeliveryOnline, label: tr('Delivery revenue'), value: formatMoney(d.revenueDelivery), share: revTotal <= 0 ? 0 : d.revenueDelivery / revTotal * 100),
          LegendLine(color: PosColors.channelPickupCash, label: tr('Pickup revenue'), value: formatMoney(d.revenuePickup), share: revTotal <= 0 ? 0 : d.revenuePickup / revTotal * 100),
          Divider(height: PosSpacing.xl, color: c.border.withValues(alpha: 0.6)),
          Row(
            children: [
              DonutChart(
                size: 120,
                slices: [for (final (_, v, col) in status) DonutSlice(value: v, color: col)],
                center: formatCount(statusTotal),
                caption: tr('Orders'),
              ),
              const SizedBox(width: PosSpacing.lg),
              Expanded(
                child: Column(
                  children: [
                    for (final (n, v, col) in status) LegendLine(color: col, label: n, value: formatCount(v), share: statusTotal <= 0 ? 0 : v / statusTotal * 100),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _branchTable(BrandAnalytics d, String label) {
    final rows = [...d.branchPerformance]..sort((a, z) => z.grossSales.compareTo(a.grossSales));
    return SectionCard(
      title: tr('Branch Sales Performance'),
      subtitle: label,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          PosIconButton(icon: Icons.table_view_outlined, tooltip: tr('Download CSV'), onPressed: rows.isEmpty ? null : () => _download(pdf: false)),
          const SizedBox(width: 6),
          PosIconButton(icon: Icons.picture_as_pdf_outlined, tooltip: tr('Download PDF'), onPressed: rows.isEmpty ? null : () => _download(pdf: true)),
        ],
      ),
      child: SimpleTable(
        minWidth: 720,
        columns: [
          TableCol('#'),
          TableCol(tr('Branch'), flex: 3),
          TableCol(tr('Tier'), flex: 2),
          TableCol(tr('Orders'), numeric: true),
          TableCol(tr('Gross Sales'), flex: 2, numeric: true),
          TableCol(tr('Growth'), numeric: true),
          TableCol(tr('Delivery %'), numeric: true),
        ],
        rows: [
          for (final (i, r) in rows.indexed)
            [
              '${i + 1}',
              shortBranch(r.branchName),
              _tierLabel(r),
              formatCount(r.totalOrders),
              formatMoneyAmount(r.grossSales),
              r.growthPercent == null ? '—' : '${r.growthPercent! >= 0 ? '+' : ''}${r.growthPercent!.toStringAsFixed(1)}%',
              r.deliveryPercent == null ? '—' : '${r.deliveryPercent!.toStringAsFixed(0)}%',
            ],
        ],
        empty: tr('No branch sales in this period'),
      ),
    );
  }

  Widget _products(String title, List<ProductSale> items, String label) => productListCard(context, title, items, label);

  Widget _hourly(List<NamedValue> hours, String label) => hourlyCard(context, hours, label);

  Widget _customers(List<TopCustomer> items, String label) => customersCard(context, items, label);

  Widget _channels(ChannelBreakdown ch, String label, {required bool pickupOnly}) =>
      channelsCard(context, ch, label, pickupOnly: pickupOnly);

  Widget _audience(BrandAnalytics d, String label) {
    final orders = d.webOrders + d.mobileOrders;
    final cust = d.firstTimeBuyers + d.loyalCustomers;
    return SectionCard(
      title: tr('Order Platform & Customers'),
      subtitle: label,
      child: Column(
        children: [
          LegendLine(color: adminPalette[0], label: tr('Website'), value: formatCount(d.webOrders), share: orders == 0 ? 0 : d.webOrders / orders * 100),
          LegendLine(color: adminPalette[2], label: tr('Mobile app'), value: formatCount(d.mobileOrders), share: orders == 0 ? 0 : d.mobileOrders / orders * 100),
          Divider(height: PosSpacing.xl, color: context.pos.border.withValues(alpha: 0.6)),
          LegendLine(color: adminPalette[3], label: tr('First-time buyers'), value: formatCount(d.firstTimeBuyers), share: cust == 0 ? 0 : d.firstTimeBuyers / cust * 100),
          LegendLine(color: adminPalette[1], label: tr('Loyal customers'), value: formatCount(d.loyalCustomers), share: cust == 0 ? 0 : d.loyalCustomers / cust * 100),
        ],
      ),
    );
  }
}

// ======================================================================
// Branch admin — Sales (web /admin/sales)
// ======================================================================

class BranchSalesScreen extends StatefulWidget {
  const BranchSalesScreen({super.key, required this.session});
  final AdminSession session;

  @override
  State<BranchSalesScreen> createState() => _BranchSalesScreenState();
}

class _BranchSalesScreenState extends State<BranchSalesScreen> {
  PeriodFilter _period = const PeriodFilter.month();
  late final Loadable<BranchAnalytics> _data;
  late final Loadable<int> _cups;
  Timer? _timer;

  bool get _pickupOnly => widget.session.isPickupOnly;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _data = Loadable(() => repo.branchAnalytics(_period));
    _cups = Loadable(() => repo.periodCups(_period));
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted && TickerMode.of(context)) _refresh();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _data.dispose();
    _cups.dispose();
    super.dispose();
  }

  Future<void> _refresh() => Future.wait([_data.load(silent: true), _cups.load(silent: true)]);

  void _setPeriod(PeriodFilter p) {
    if (!p.ready) return;
    setState(() => _period = p);
    _data.load();
    _cups.load();
  }

  /// Web exportSummary (`branch-sales-<period>.csv`).
  Future<void> _export(BranchAnalytics d) async {
    try {
      await Exporter.shareCsv(
        context,
        filename: 'branch-sales-${_period.preset.name}',
        headers: [tr('Metric'), tr('Value'), ''],
        rows: [
          [tr('Gross Sales'), d.grossSales, ''],
          [tr('Total Orders'), d.totalOrders, ''],
          if (!_pickupOnly) [tr('Delivery Revenue'), d.deliveryRevenue, ''],
          [tr('Convenience Revenue'), d.convenienceRevenue, ''],
          [tr('Avg Order Value (incl. delivery & convenience)'), d.avgOrderValue, ''],
          [tr('Commission Fee'), d.commissionFee, ''],
          [tr('Gateway Fee'), d.gatewayFee, ''],
          [tr('After Fees (est.)'), d.grossAfterFees, ''],
          [tr('DartCodes Commission'), d.periodCommission, ''],
          ['', '', ''],
          [tr('Top Product'), tr('Quantity'), tr('Revenue')],
          for (final p in d.topProducts) [p.name, p.quantity, p.revenue],
        ],
      );
    } catch (e) {
      if (mounted) showPosSnack(context, tr('Export failed: {e}', {'e': e}), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return ListenableBuilder(
      listenable: Listenable.merge([_data, _cups]),
      builder: (context, _) {
        final d = _data.data;
        final label = periodLabel(_period);
        return AdminPageList(
          onRefresh: _refresh,
          children: [
            PageHeader(
              title: tr('Sales'),
              subtitle: tr('{branch} · {p}', {'branch': widget.session.branchLabel ?? tr('Your branch'), 'p': label}),
              actions: [
                PosIconButton(icon: Icons.download_rounded, tooltip: tr('Export CSV'), onPressed: d == null ? null : () => _export(d)),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            PeriodSegments(value: _period, onChanged: _setPeriod),
            const SizedBox(height: PosSpacing.md),
            if (d == null)
              _data.error != null
                  ? ErrorView(message: _data.error!, onRetry: _data.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else ...[
              if (_data.loading) const LinearProgressIndicator(minHeight: 2),
              KpiGrid(
                children: [
                  KpiTile(icon: Icons.trending_up_rounded, title: tr('Total Gross Sales'), value: formatMoney(d.grossSales)),
                  KpiTile(icon: Icons.shopping_bag_outlined, title: tr('Total Orders'), value: formatCount(d.totalOrders), color: PosColors.received),
                  KpiTile(
                    icon: Icons.local_cafe_outlined,
                    title: tr('Total Cups Sold'),
                    value: _cups.data == null ? '—' : formatCount(_cups.data!),
                    loading: _cups.initialLoading,
                    color: c.accent,
                  ),
                  KpiTile(icon: Icons.account_balance_wallet_outlined, title: tr('Average Order Value'), value: formatMoney(d.avgOrderValue), color: PosColors.ready),
                ],
              ),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 420,
                children: [_overview(d, label), _fees(d, label)],
              ),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 340,
                children: [
                  _discounts(d, label),
                  if (!_pickupOnly) _orderMode(d, label),
                  channelsCard(context, d.channels, label, pickupOnly: _pickupOnly),
                ],
              ),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 340,
                children: [
                  hourlyCard(context, d.hourly, label),
                  customersCard(context, d.topCustomers, label),
                  productListCard(context, tr('Top Selling Products'), d.topProducts, label),
                ],
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _overview(BranchAnalytics d, String label) {
    final c = context.pos;
    final rows = d.orderSummary;
    return SectionCard(
      title: tr('Sales Overview'),
      subtitle: label,
      child: SizedBox(
        height: 220,
        child: rows.isEmpty
            ? Center(child: Text(tr('No data for this period'), style: PosType.caption.copyWith(color: c.textMuted)))
            : BarChart(
                values: [for (final r in rows) r.delivery + r.pickup],
                labels: [for (final r in rows) r.label.length > 6 ? r.label.substring(0, 6) : r.label],
                color: c.brand,
                labelEvery: (rows.length / 7).ceil().clamp(1, 12),
              ),
      ),
    );
  }

  Widget _fees(BranchAnalytics d, String label) {
    final c = context.pos;
    return SectionCard(
      title: tr('Revenue Breakdown'),
      subtitle: label,
      child: Column(
        children: [
          MoneyRow(label: tr('Gross sales'), amount: d.grossSales),
          if (!_pickupOnly) MoneyRow(label: tr('Delivery revenue'), amount: d.deliveryRevenue),
          MoneyRow(label: tr('Convenience revenue'), amount: d.convenienceRevenue),
          MoneyRow(label: tr('Commission fee'), amount: d.commissionFee, negative: true),
          MoneyRow(label: tr('Gateway fee'), amount: d.gatewayFee, negative: true),
          Divider(color: c.border.withValues(alpha: 0.6)),
          MoneyRow(label: tr('After fees (est.)'), amount: d.grossAfterFees, emphasis: true),
          const SizedBox(height: PosSpacing.sm),
          PosInsetLine(
            label: tr('DartCodes commission · slab {r}%', {'r': d.effectiveSlabRate.toStringAsFixed(1)}),
            value: formatMoney(d.periodCommission),
          ),
          PosInsetLine(label: tr('Commission owed'), value: formatMoney(d.totalOwed)),
        ],
      ),
    );
  }

  Widget _discounts(BranchAnalytics d, String label) {
    final c = context.pos;
    final pts = d.discountsByMonth;
    return SectionCard(
      title: tr('Sales vs Discount'),
      subtitle: label,
      child: SizedBox(
        height: 180,
        child: pts.isEmpty
            ? Center(child: Text(tr('No discounts in this period'), style: PosType.caption.copyWith(color: c.textMuted)))
            : BarChart(
                values: [for (final p in pts) p.value],
                labels: [for (final p in pts) p.label.split(' ').first],
                color: c.accent,
                labelEvery: (pts.length / 6).ceil().clamp(1, 12),
              ),
      ),
    );
  }

  Widget _orderMode(BranchAnalytics d, String label) {
    final del = d.orderMode.fold<double>(0, (a, r) => a + r.delivery);
    final pick = d.orderMode.fold<double>(0, (a, r) => a + r.pickup);
    final total = del + pick;
    return SectionCard(
      title: tr('Order Mode'),
      subtitle: label,
      child: Row(
        children: [
          DonutChart(
            size: 120,
            slices: [DonutSlice(value: del, color: PosColors.channelDeliveryOnline), DonutSlice(value: pick, color: PosColors.channelPickupCash)],
            center: formatCount(total),
            caption: tr('Orders'),
          ),
          const SizedBox(width: PosSpacing.lg),
          Expanded(
            child: Column(
              children: [
                LegendLine(color: PosColors.channelDeliveryOnline, label: tr('Delivery'), value: formatCount(del), share: total == 0 ? 0 : del / total * 100),
                LegendLine(color: PosColors.channelPickupCash, label: tr('Pickup'), value: formatCount(pick), share: total == 0 ? 0 : pick / total * 100),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ======================================================================
// Shared sales cards
// ======================================================================

/// Label ··· value line inside a raised panel.
class PosInsetLine extends StatelessWidget {
  const PosInsetLine({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(PosRadius.sm)),
      child: Row(
        children: [
          Expanded(child: Text(label, style: PosType.caption.copyWith(color: c.textMuted))),
          Text(value, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5)),
        ],
      ),
    );
  }
}

Widget channelsCard(BuildContext context, ChannelBreakdown ch, String label, {required bool pickupOnly}) {
  final rows = [
    (tr('Pickup · Cash'), ch.pickupCashTotal, ch.pickupCashCount, PosColors.channelPickupCash),
    (tr('Pickup · Card'), ch.pickupCardTotal, ch.pickupCardCount, PosColors.channelPickupCard),
    (tr('Pickup · Online'), ch.pickupOnlineTotal, ch.pickupOnlineCount, PosColors.channelPickupOnline),
    if (!pickupOnly) (tr('Delivery · Online'), ch.deliveryOnlineTotal, ch.deliveryOnlineCount, PosColors.channelDeliveryOnline),
  ];
  final total = rows.fold<double>(0, (a, r) => a + r.$2);
  return SectionCard(
    title: tr('Payment Channels'),
    subtitle: label,
    child: Column(
      children: [
        for (final (name, amount, count, color) in rows)
          LegendLine(color: color, label: '$name · ${trn(count, '{n} order', '{n} orders')}', value: formatMoney(amount), share: total <= 0 ? 0 : amount / total * 100),
      ],
    ),
  );
}

Widget productListCard(BuildContext context, String title, List<ProductSale> items, String label) {
  final c = context.pos;
  return SectionCard(
    title: title,
    subtitle: label,
    child: items.isEmpty
        ? Padding(
            padding: const EdgeInsets.symmetric(vertical: PosSpacing.lg),
            child: Center(child: Text(tr('No sales in this period'), style: PosType.caption.copyWith(color: c.textMuted))),
          )
        : Column(
            children: [
              for (final p in items.take(5))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      ProductImage(url: p.imageUrl, size: 36, contain: true, radius: 8),
                      const SizedBox(width: PosSpacing.sm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13)),
                            Text(trn(p.quantity, '{n} sold', '{n} sold'), style: PosType.caption.copyWith(color: c.textMuted)),
                          ],
                        ),
                      ),
                      Text(formatMoney(p.revenue), style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5)),
                    ],
                  ),
                ),
            ],
          ),
  );
}

Widget customersCard(BuildContext context, List<TopCustomer> items, String label) => SectionCard(
  title: tr('Top Customers'),
  subtitle: tr('Top 5 by total spend · {p}', {'p': label}),
  child: RankBars(
    rows: [
      for (final cu in items.take(5))
        (
          cu.name,
          cu.totalSpend,
          formatMoney(cu.totalSpend),
          [trn(cu.orders, '{n} order', '{n} orders'), if (cu.homeBranch != null) shortBranch(cu.homeBranch)].join(' · '),
        ),
    ],
    empty: tr('No customers in this period'),
  ),
);

Widget hourlyCard(BuildContext context, List<NamedValue> hours, String label) {
  final c = context.pos;
  final shown = hours;
  return SectionCard(
    title: tr('Hourly Activity'),
    subtitle: tr('Orders by hour · {p}', {'p': label}),
    child: SizedBox(
      height: 180,
      child: shown.isEmpty
          ? Center(child: Text(tr('No data for this period'), style: PosType.caption.copyWith(color: c.textMuted)))
          : BarChart(
              values: [for (final h in shown) h.value],
              labels: [for (final h in shown) h.label],
              color: c.brand,
              labelEvery: (shown.length / 6).ceil().clamp(1, 24),
            ),
    ),
  );
}
