import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
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
import '../components/states.dart';
import '../labels.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

/// Super admin dashboard — port of the web `/admin` in super mode
/// (SuperAdminDashboard.tsx): overview cards, Total Revenue, Payment Breakdown,
/// Outflows, Top Refund Branches, Top Delivery Riders, Sales vs JASON,
/// Discounts by Party, Order Summary & Payment Channels, top products and branches.
class SuperDashboardScreen extends StatefulWidget {
  const SuperDashboardScreen({super.key, required this.session, this.onOpenReports});
  final AdminSession session;
  final VoidCallback? onOpenReports;

  @override
  State<SuperDashboardScreen> createState() => _SuperDashboardScreenState();
}

class _SuperDashboardScreenState extends State<SuperDashboardScreen> {
  PeriodFilter _period = const PeriodFilter.month();
  late final Loadable<SuperDashboard> _stats;
  late final Loadable<BrandAnalytics> _brand;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _stats = Loadable(() => repo.superDashboard(_period));
    _brand = Loadable(() => repo.brandAnalytics(_period));
    // Web refetchInterval: 60_000.
    _timer = Timer.periodic(const Duration(seconds: 60), (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _stats.dispose();
    _brand.dispose();
    super.dispose();
  }

  Future<void> _refresh() => Future.wait([_stats.load(silent: true), _brand.load(silent: true)]);

  void _setPeriod(PeriodFilter p) {
    if (!p.ready) return;
    setState(() => _period = p);
    _stats.load();
    _brand.load();
  }

  String get _greeting {
    final h = DateTime.now().hour;
    final part = h < 12 ? tr('Good morning') : (h < 17 ? tr('Good afternoon') : tr('Good evening'));
    return '$part, ${roleLabel(widget.session.role)}!';
  }

  String get _subtitle => switch (_period.preset) {
    PeriodPreset.today => tr("Here's what's happening across all branches today."),
    PeriodPreset.year => tr("Here's what's happening across all branches this year."),
    PeriodPreset.custom => tr("Here's what's happening across all branches for the selected range."),
    PeriodPreset.month => tr("Here's what's happening across all branches this month."),
  };

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final label = periodLabel(_period);
    return ListenableBuilder(
      listenable: Listenable.merge([_stats, _brand]),
      builder: (context, _) {
        final s = _stats.data;
        final b = _brand.data;
        final loading = s == null;
        return AdminPageList(
          onRefresh: _refresh,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_greeting, style: PosType.title.copyWith(color: c.text)),
                      Text(_subtitle, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 12.5)),
                    ],
                  ),
                ),
                PosButton(
                  label: tr('Refresh'),
                  icon: Icons.refresh_rounded,
                  variant: PosButtonVariant.outline,
                  expand: false,
                  height: 40,
                  loading: _stats.loading && s != null,
                  onPressed: _refresh,
                ),
                if (widget.onOpenReports != null) ...[
                  const SizedBox(width: PosSpacing.sm),
                  if (isTablet(context))
                    PosButton(
                      label: tr('Full Report'),
                      icon: Icons.bar_chart_rounded,
                      expand: false,
                      height: 40,
                      onPressed: widget.onOpenReports,
                    ),
                ],
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            PeriodSegments(value: _period, onChanged: _setPeriod),
            const SizedBox(height: PosSpacing.lg),
            if (_stats.error != null && s == null)
              ErrorView(message: _stats.error!, onRetry: _stats.load)
            else ...[
              _overview(s, label, loading),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 420,
                children: [_revenueChart(s, label), _paymentBreakdown(s, label)],
              ),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 320,
                children: [_outflows(s, label), _refundBranches(s, label), _topRiders(s, label)],
              ),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 320,
                children: [_salesVsJason(s, label), _discountsByParty(s, label), _orderSummary(b, label)],
              ),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                minItemWidth: 320,
                children: [_topProducts(s, label), _topBranches(b, label, pickupOnly: false), _topBranches(b, label, pickupOnly: true)],
              ),
            ],
          ],
        );
      },
    );
  }

  // ---------------------------------------------------------------- sections

  Widget _overview(SuperDashboard? s, String label, bool loading) {
    final pc = PosColors.ready;
    return KpiGrid(
      children: [
        KpiTile(
          icon: Icons.account_balance_wallet_outlined,
          title: tr('Online Wallet Balance'),
          value: s == null ? '—' : formatMoney(s.onlineWalletBalance),
          caption: s == null ? null : tr('Total payable {v}', {'v': formatMoney(s.totalPayable)}),
          loading: loading,
        ),
        KpiTile(
          icon: Icons.trending_up_rounded,
          title: tr('Revenue Summary'),
          value: s == null ? '—' : formatMoney(s.periodRevenue),
          caption: s == null ? null : tr('Refunds {v}', {'v': formatMoney(s.periodRefundAmount)}),
          color: pc,
          loading: loading,
        ),
        KpiTile(
          icon: Icons.receipt_long_outlined,
          title: tr('Total Orders'),
          value: s == null ? '—' : formatCount(s.periodOrders),
          caption: s == null
              ? null
              : tr('{d} delivery · {p} pickup', {'d': formatCount(s.deliveryOrders), 'p': formatCount(s.takeawayOrders)}),
          color: PosColors.received,
          loading: loading,
        ),
        KpiTile(
          icon: Icons.cancel_outlined,
          title: tr('Cancelled Orders'),
          value: s == null ? '—' : formatCount(s.cancelledOrders),
          caption: label,
          color: context.pos.danger,
          loading: loading,
        ),
      ],
    );
  }

  Widget _revenueChart(SuperDashboard? s, String label) {
    final c = context.pos;
    final months = s?.monthly ?? const [];
    return SectionCard(
      title: tr('Total Revenue'),
      subtitle: '$label · ${tr('revenue')} · ${tr('outflow')}',
      trailing: months.isEmpty ? null : Text(formatMoney(months.last.revenue), style: PosType.bodyStrong.copyWith(color: c.text)),
      child: SizedBox(
        height: 220,
        child: s == null
            ? const LoadingView()
            : months.isEmpty
            ? Center(child: Text(tr('No data for this period'), style: PosType.caption.copyWith(color: c.textMuted)))
            : Column(
                children: [
                  Expanded(
                    child: AreaChart(
                      labels: [for (final m in months) m.month.split(' ').first],
                      series: [
                        ChartSeries(values: [for (final m in months) m.revenue], color: c.brand, label: tr('Revenue')),
                        ChartSeries(values: [for (final m in months) m.outflow], color: c.accent, label: tr('Outflow')),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _dot(c.brand, tr('Revenue')),
                      const SizedBox(width: PosSpacing.lg),
                      _dot(c.accent, tr('Outflow')),
                    ],
                  ),
                ],
              ),
      ),
    );
  }

  Widget _dot(Color color, String text) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(width: 9, height: 9, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 5),
      Text(text, style: PosType.caption.copyWith(color: context.pos.textMuted)),
    ],
  );

  Widget _paymentBreakdown(SuperDashboard? s, String label) {
    final slices = [
      (tr('Pickup · Cash'), s?.pickupCash ?? 0, PosColors.channelPickupCash),
      (tr('Pickup · Card'), s?.pickupCard ?? 0, PosColors.channelPickupCard),
      (tr('Pickup · Online'), s?.pickupOnline ?? 0, PosColors.channelPickupOnline),
      (tr('Delivery · Online'), s?.deliveryOnline ?? 0, PosColors.channelDeliveryOnline),
    ];
    final total = slices.fold<double>(0, (a, x) => a + x.$2);
    return SectionCard(
      title: tr('Payment Breakdown'),
      subtitle: label,
      child: s == null ? const SizedBox(height: 200, child: LoadingView()) : _donutWithLegend(slices, total, tr('Revenue')),
    );
  }

  Widget _donutWithLegend(List<(String, double, Color)> slices, double total, String caption, {bool money = true}) {
    final legend = Column(
      children: [
        for (final (name, v, color) in slices)
          LegendLine(
            color: color,
            label: name,
            value: money ? formatMoney(v) : formatCount(v),
            share: total <= 0 ? 0 : v / total * 100,
          ),
      ],
    );
    return LayoutBuilder(
      builder: (context, box) {
        final donut = DonutChart(
          size: 140,
          slices: [for (final (_, v, color) in slices) DonutSlice(value: v, color: color)],
          center: money ? compactNumber(total) : formatCount(total),
          caption: caption,
        );
        if (box.maxWidth < 380) {
          return Column(children: [donut, const SizedBox(height: PosSpacing.md), legend]);
        }
        return Row(
          children: [
            donut,
            const SizedBox(width: PosSpacing.lg),
            Expanded(child: legend),
          ],
        );
      },
    );
  }

  Widget _outflows(SuperDashboard? s, String label) => SectionCard(
    title: tr('Outflows'),
    subtitle: '${tr('By payout method')} · $label',
    child: s == null
        ? const SizedBox(height: 160, child: LoadingView())
        : RankBars(
            showRank: false,
            color: context.pos.accent,
            rows: [for (final o in s.outflowByMethod) (o.label, o.value, formatMoney(o.value), null)],
            empty: tr('No outflows in this period'),
          ),
  );

  Widget _refundBranches(SuperDashboard? s, String label) => SectionCard(
    title: tr('Top Refund Branches'),
    subtitle: label,
    child: s == null
        ? const SizedBox(height: 160, child: LoadingView())
        : RankBars(
            color: const Color(0xFF112E81),
            rows: [
              for (final r in s.topRefundBranches.take(5))
                (
                  shortBranch(r.label),
                  r.value,
                  formatMoney(r.value),
                  r.count == null ? null : trn(r.count!, '{n} refund', '{n} refunds'),
                ),
            ],
            empty: tr('No refunds in this period'),
          ),
  );

  Widget _topRiders(SuperDashboard? s, String label) {
    final c = context.pos;
    return SectionCard(
      title: tr('Top 5 Delivery Riders'),
      subtitle: label,
      child: s == null
          ? const SizedBox(height: 160, child: LoadingView())
          : s.topRiders.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: PosSpacing.lg),
              child: Center(child: Text(tr('No deliveries in this period'), style: PosType.caption.copyWith(color: c.textMuted))),
            )
          : Column(
              children: [
                for (final (i, r) in s.topRiders.take(5).indexed)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      radius: 18,
                      backgroundColor: i < 3 ? c.brand : c.surface,
                      backgroundImage: r.photoUrl == null ? null : NetworkImage(r.photoUrl!),
                      child: r.photoUrl != null
                          ? null
                          : Text('${i + 1}', style: PosType.bodyStrong.copyWith(color: i < 3 ? Colors.white : c.textMuted)),
                    ),
                    title: Text(r.name, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13)),
                    subtitle: Text(
                      tr('{j} jobs · {km} km', {'j': r.jobs, 'km': r.distanceKm.toStringAsFixed(1)}),
                      style: PosType.caption.copyWith(color: c.textMuted),
                    ),
                    trailing: Text(
                      trn(r.orders, '{n} order', '{n} orders'),
                      style: PosType.bodyStrong.copyWith(color: c.brand, fontSize: 12.5),
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _salesVsJason(SuperDashboard? s, String label) {
    final c = context.pos;
    final sales = s?.periodRevenue ?? 0;
    final jason = s?.jasonInvestedAmount ?? 0;
    return SectionCard(
      title: tr('Sales vs JASON Investments'),
      subtitle: label,
      child: s == null
          ? const SizedBox(height: 160, child: LoadingView())
          : Column(
              children: [
                SizedBox(
                  height: 150,
                  child: BarChart(values: [sales, jason], labels: [tr('Sales'), tr('JASON')], color: c.brand, labelEvery: 1),
                ),
                const SizedBox(height: PosSpacing.sm),
                LegendLine(color: c.brand, label: tr('Sales'), value: formatMoney(sales)),
                LegendLine(color: c.brand.withValues(alpha: 0.4), label: tr('JASON invested'), value: formatMoney(jason)),
              ],
            ),
    );
  }

  Widget _discountsByParty(SuperDashboard? s, String label) {
    final d = s?.discountsByParty;
    const colors = [Color(0xFF121358), Color(0xFF36ADA3), Color(0xFF2F578A)];
    return SectionCard(
      title: tr('Discounts by Party'),
      subtitle: label,
      child: s == null
          ? const SizedBox(height: 160, child: LoadingView())
          : d == null || d.total <= 0
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: PosSpacing.lg),
              child: Center(
                child: Text(tr('No discounts in this period'), style: PosType.caption.copyWith(color: context.pos.textMuted)),
              ),
            )
          : _donutWithLegend(
              [for (final (i, sl) in d.slices.indexed) (tr(sl.label), sl.value, colors[i % colors.length])],
              d.total,
              tr('Discounts'),
            ),
    );
  }

  Widget _orderSummary(BrandAnalytics? b, String label) {
    final c = context.pos;
    final rows = [...?b?.orderSummaryByBranch]..sort((a, z) => z.total.compareTo(a.total));
    return SectionCard(
      title: tr('Order Summary & Payment Channels'),
      subtitle: label,
      child: b == null
          ? const SizedBox(height: 160, child: LoadingView())
          : rows.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: PosSpacing.lg),
              child: Center(child: Text(tr('No orders in this period'), style: PosType.caption.copyWith(color: c.textMuted))),
            )
          : Column(
              children: [
                for (final r in rows.take(6)) ...[
                  _StackedChannelBar(row: r),
                  const SizedBox(height: 10),
                ],
                Wrap(
                  spacing: PosSpacing.md,
                  runSpacing: 4,
                  children: [
                    _dot(PosColors.channelDeliveryOnline, tr('Delivery')),
                    _dot(PosColors.channelPickupCash, tr('Cash')),
                    _dot(PosColors.channelPickupCard, tr('Card')),
                    _dot(PosColors.channelPickupOnline, tr('Online')),
                  ],
                ),
              ],
            ),
    );
  }

  Widget _topProducts(SuperDashboard? s, String label) {
    final c = context.pos;
    return SectionCard(
      title: tr('Top Selling Products'),
      subtitle: label,
      child: s == null
          ? const SizedBox(height: 160, child: LoadingView())
          : s.topProducts.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: PosSpacing.lg),
              child: Center(child: Text(tr('No sales in this period'), style: PosType.caption.copyWith(color: c.textMuted))),
            )
          : Column(
              children: [
                for (final p in s.topProducts.take(5))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      children: [
                        ProductImage(url: p.imageUrl, size: 38, contain: true, radius: 8),
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

  Widget _topBranches(BrandAnalytics? b, String label, {required bool pickupOnly}) {
    final rows = [...?b?.orderSummaryByBranch]
      ..sort((a, z) => (pickupOnly ? z.pickup : z.total).compareTo(pickupOnly ? a.pickup : a.total));
    final shown = rows.where((r) => (pickupOnly ? r.pickup : r.total) > 0).take(5);
    return SectionCard(
      title: pickupOnly ? tr('Top Branches (Pickup Only)') : tr('Top Branches (Delivery & Pickup)'),
      subtitle: label,
      child: b == null
          ? const SizedBox(height: 160, child: LoadingView())
          : RankBars(
              rows: [
                for (final r in shown)
                  (
                    shortBranch(r.label),
                    pickupOnly ? r.pickup : r.total,
                    formatMoneyAmount(pickupOnly ? r.pickup : r.total),
                    r.orderCount == null || pickupOnly ? null : trn(r.orderCount!, '{n} order', '{n} orders'),
                  ),
              ],
              empty: pickupOnly ? tr('No pickup sales in this period') : tr('No branch sales in this period'),
            ),
    );
  }
}

/// One branch: name, total and a bar split by channel.
class _StackedChannelBar extends StatelessWidget {
  const _StackedChannelBar({required this.row});
  final BranchChannelRow row;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final parts = [
      (row.delivery, PosColors.channelDeliveryOnline),
      (row.pickupCash, PosColors.channelPickupCash),
      (row.pickupCard, PosColors.channelPickupCard),
      (row.pickupOnline, PosColors.channelPickupOnline),
    ];
    final total = parts.fold<double>(0, (a, p) => a + p.$1);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                shortBranch(row.label),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5),
              ),
            ),
            Text(formatMoneyAmount(total), style: PosType.caption.copyWith(color: c.text, fontWeight: FontWeight.w600)),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(PosRadius.pill),
          child: SizedBox(
            height: 8,
            child: total <= 0
                ? ColoredBox(color: c.surface)
                : Row(
                    children: [
                      for (final (v, color) in parts)
                        if (v > 0) Expanded(flex: (v / total * 1000).round().clamp(1, 1000), child: ColoredBox(color: color)),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}
