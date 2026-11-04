import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/order.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/charts.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/pos_card.dart';
import '../components/product_widgets.dart';
import '../components/states.dart';
import '../labels.dart';
import '../routes.dart';
import '../state/dashboard_controller.dart';
import '../state/order_alerts_controller.dart';
import '../theme/pos_theme.dart';

/// Cashier dashboard — port of the web `/admin` page in cashier mode
/// (app/admin/page.tsx + BranchAdminDashboard.tsx): stat chips, wallet card,
/// Total Revenue & Operations, Peak Hours, Order Breakdown, Revenue Overview,
/// Top Selling Products and Recent Orders.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, required this.session, required this.onOpenOrders});

  final AdminSession session;
  final VoidCallback onOpenOrders;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _seenSignal = 0;

  /// Web `STORE_HOURS_LABEL` — peak hours only chart opening hours.
  static const _openHour = 9;
  static const _closeHour = 23;

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<DashboardController>();
    final signal = context.select<OrderAlertsController, int>((a) => a.orderSignal);
    if (signal != _seenSignal) {
      _seenSignal = signal;
      WidgetsBinding.instance.addPostFrameCallback((_) => ctrl.load(silent: true));
    }
    final s = ctrl.stats;
    final loading = s == null;
    final period = periodLabel(ctrl.period);
    final session = widget.session;
    final welcome = session.branchLabel == null
        ? tr('Welcome {role}', {'role': roleLabel(session.role)})
        : tr('Welcome {role}, {branch}', {'role': roleLabel(session.role), 'branch': session.branchLabel});

    final wallet = _WalletCard(balance: s?.onlineWalletBalance, loading: loading);
    final revenue = _RevenueCard(stats: s, period: period, pickupOnly: session.isPickupOnly);
    final peak = _PeakHoursCard(stats: s, period: period, openHour: _openHour, closeHour: _closeHour);
    final breakdown = _OrderBreakdownCard(period: period, pickupOnly: session.isPickupOnly);
    final overview = _RevenueOverviewCard(stats: s, period: period);
    final products = _TopProductsCard(products: s?.topProducts ?? const [], loading: loading);
    final recent = _RecentOrdersCard(
      orders: s?.recentOrders ?? const [],
      loading: loading,
      onViewAll: widget.onOpenOrders,
    );

    return RefreshIndicator(
      onRefresh: () => ctrl.load(silent: true),
      child: LayoutBuilder(
        builder: (context, box) {
          final wide = box.maxWidth >= Breakpoints.tablet;
          // Cards side by side share one height, like the web grid rows.
          Widget row(List<Widget> children, {List<int>? flex}) => wide
              ? EqualHeightRow(spacing: PosSpacing.lg, flex: flex, children: children)
              : Column(
                  children: [
                    for (var i = 0; i < children.length; i++) ...[
                      if (i > 0) const SizedBox(height: PosSpacing.md),
                      children[i],
                    ],
                  ],
                );

          return ListView(
            padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.lg, PosSpacing.xxl),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      welcome,
                      style: PosType.title.copyWith(color: context.pos.text, fontSize: wide ? 26 : 21),
                    ),
                  ),
                  const SizedBox(width: PosSpacing.sm),
                  PosButton(
                    label: tr('Refresh'),
                    icon: Icons.refresh_rounded,
                    variant: PosButtonVariant.outline,
                    expand: false,
                    height: 40,
                    loading: ctrl.loading && s != null,
                    onPressed: () => ctrl.load(silent: true),
                  ),
                ],
              ),
              const SizedBox(height: PosSpacing.md),
              PeriodSegments(value: ctrl.period, onChanged: ctrl.setPeriod),
              const SizedBox(height: PosSpacing.md),
              _StatChips(stats: s, onOpenOrders: widget.onOpenOrders),
              const SizedBox(height: PosSpacing.lg),
              if (ctrl.error != null && s == null)
                ErrorView(message: ctrl.error!, onRetry: ctrl.load)
              else ...[
                row([wallet, revenue], flex: const [2, 3]),
                const SizedBox(height: PosSpacing.lg),
                // Three charts share a row only on landscape tablets; portrait pairs two.
                if (box.maxWidth >= Breakpoints.wide)
                  row([peak, breakdown, overview])
                else if (wide) ...[
                  row([peak, overview]),
                  const SizedBox(height: PosSpacing.lg),
                  breakdown,
                ] else
                  row([peak, breakdown, overview]),
                const SizedBox(height: PosSpacing.lg),
                row([products, recent]),
              ],
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------- Stat chips

class _StatChips extends StatelessWidget {
  const _StatChips({required this.stats, required this.onOpenOrders});
  final DashboardStats? stats;
  final VoidCallback onOpenOrders;

  @override
  Widget build(BuildContext context) {
    final s = stats;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        _Chip(icon: Icons.shopping_bag_outlined, label: tr('Orders'), value: s?.periodOrders, onTap: onOpenOrders),
        _Chip(icon: Icons.local_cafe_outlined, label: tr('Cups'), value: s?.periodCups),
        _Chip(icon: Icons.cancel_outlined, label: tr('Cancelled'), value: s?.cancelledOrders, onTap: onOpenOrders),
        for (final a in s?.needsAttention ?? const <AttentionItem>[])
          _Chip(
            icon: Icons.error_outline_rounded,
            label: tr(a.label),
            value: a.count,
            alert: true,
            onTap: onOpenOrders,
          ),
      ],
    );
  }
}

/// Web `StatChip`: outlined pill, amber when it's an attention item.
class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label, required this.value, this.alert = false, this.onTap});
  final IconData icon;
  final String label;
  final int? value;
  final bool alert;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final fg = alert ? c.warningText : c.text;
    return Material(
      color: alert ? c.accent.withValues(alpha: 0.12) : c.card,
      shape: StadiumBorder(
        side: BorderSide(color: alert ? c.accent.withValues(alpha: 0.45) : c.border.withValues(alpha: 0.8)),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap == null
            ? null
            : () {
                PosFeedback.tap();
                onTap!();
              },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: fg),
              const SizedBox(width: 6),
              Text(
                label,
                style: PosType.caption.copyWith(color: fg, fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: 6),
              value == null
                  ? const SkeletonBox(height: 10, width: 16)
                  : Text(
                      formatCount(value!),
                      style: PosType.caption.copyWith(
                        color: fg,
                        fontWeight: FontWeight.w800,
                        fontFeatures: PosType.tabular,
                      ),
                    ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- Wallet

/// Navy "Online Wallet Balance" card (web `.branch-dash-wallet`).
class _WalletCard extends StatelessWidget {
  const _WalletCard({required this.balance, required this.loading});
  final double? balance;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 170),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1E3A8A), Color(0xFF213E8F), Color(0xFF1A2F72)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(PosRadius.lg + 2),
        boxShadow: const [BoxShadow(color: Color(0x401E3A8A), blurRadius: 22, offset: Offset(0, 8))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        // Content sits mid-card when the row stretches it to the revenue card's height.
        alignment: Alignment.centerLeft,
        children: [
          Positioned(
            right: -10,
            top: 10,
            child: Icon(Icons.account_balance_wallet_outlined, size: 110, color: Colors.white.withValues(alpha: 0.08)),
          ),
          Positioned(
            left: -40,
            bottom: -70,
            child: Container(
              width: 260,
              height: 140,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.04), shape: BoxShape.circle),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(PosSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: const Color(0xFF307EF2),
                    borderRadius: BorderRadius.circular(PosRadius.button),
                  ),
                  child: const Icon(Icons.account_balance_wallet_rounded, color: Colors.white, size: 17),
                ),
                const SizedBox(height: PosSpacing.md),
                Text(tr('Online Wallet Balance'), style: PosType.bodyStrong.copyWith(color: Colors.white)),
                const SizedBox(height: 4),
                loading
                    ? Container(
                        height: 30,
                        width: 170,
                        margin: const EdgeInsets.symmetric(vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(PosRadius.sm),
                        ),
                      )
                    : FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          formatMoneyAmount(balance ?? 0),
                          style: PosType.metric.copyWith(color: Colors.white, fontSize: 28),
                        ),
                      ),
                const SizedBox(height: 2),
                Text(tr('Available balance'), style: PosType.caption.copyWith(color: Colors.white70)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- Revenue

class _RevenueCard extends StatelessWidget {
  const _RevenueCard({required this.stats, required this.period, required this.pickupOnly});
  final DashboardStats? stats;
  final String period;
  final bool pickupOnly;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final s = stats;
    final spark = (s?.monthlyOverview ?? const <MonthPoint>[]).map((m) => m.revenue).toList();
    final tiles = <Widget>[
      _ChannelTile(icon: Icons.shopping_bag_outlined, label: tr('Pickup Cash'), amount: s?.pickupCash),
      _ChannelTile(icon: Icons.credit_card_rounded, label: tr('Pickup Card'), amount: s?.pickupCard),
      _ChannelTile(icon: Icons.computer_rounded, label: tr('Pickup Online'), amount: s?.pickupOnline),
      if (!pickupOnly)
        _ChannelTile(icon: Icons.local_shipping_outlined, label: tr('Delivery Online'), amount: s?.deliveryOnline),
      _ChannelTile(icon: Icons.undo_rounded, label: tr('Refund Amount'), amount: s?.periodRefundAmount, refund: true),
    ];
    return PosCard(
      padding: const EdgeInsets.all(PosSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _IconBadge(icon: Icons.bar_chart_rounded, solid: true),
              const SizedBox(width: 8),
              Expanded(
                child: Text(tr('Total Revenue & Operations'), style: PosType.section.copyWith(color: c.text)),
              ),
              _PeriodTag(period),
            ],
          ),
          const SizedBox(height: PosSpacing.md),
          s == null
              ? const SkeletonBox(height: 28, width: 180)
              : Text(formatMoneyAmount(s.periodRevenue), style: PosType.metric.copyWith(color: c.text, fontSize: 26)),
          if (spark.any((v) => v > 0)) ...[
            const SizedBox(height: PosSpacing.sm),
            SizedBox(
              height: 70,
              child: Sparkline(values: spark, color: c.brand),
            ),
          ],
          const SizedBox(height: PosSpacing.md),
          LayoutBuilder(
            builder: (context, box) {
              final cols = box.maxWidth >= 520 ? 3 : 2;
              final w = (box.maxWidth - (cols - 1) * PosSpacing.sm) / cols;
              return Wrap(
                spacing: PosSpacing.sm,
                runSpacing: PosSpacing.sm,
                children: [for (final t in tiles) SizedBox(width: w, child: t)],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ChannelTile extends StatelessWidget {
  const _ChannelTile({required this.icon, required this.label, required this.amount, this.refund = false});
  final IconData icon;
  final String label;
  final double? amount;
  final bool refund;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final tone = refund ? c.dangerText : c.brand;
    return Container(
      padding: const EdgeInsets.all(PosSpacing.md),
      decoration: BoxDecoration(
        color: refund ? c.danger.withValues(alpha: 0.06) : c.card,
        borderRadius: BorderRadius.circular(PosRadius.card - 2),
        border: Border.all(color: refund ? c.danger.withValues(alpha: 0.2) : c.border.withValues(alpha: 0.7)),
      ),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: tone.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: Icon(icon, size: 15, color: tone),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.caption.copyWith(color: c.text, fontWeight: FontWeight.w600, fontSize: 11.5),
                ),
                amount == null
                    ? const SkeletonBox(height: 12, width: 60)
                    : FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          formatMoneyAmount(amount!),
                          style: PosType.bodyStrong.copyWith(
                            color: refund ? c.dangerText : c.text,
                            fontWeight: FontWeight.w800,
                            fontFeatures: PosType.tabular,
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

// ---------------------------------------------------------------- Charts

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.title, required this.subtitle, required this.child, this.icon, this.trailing});
  final String title;
  final String subtitle;
  final Widget child;
  final IconData? icon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return PosCard(
      padding: const EdgeInsets.all(PosSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (icon != null) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Icon(icon, size: 16, color: c.brand),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: PosType.section.copyWith(color: c.text)),
                    Text(subtitle, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
          const SizedBox(height: PosSpacing.md),
          SizedBox(height: 200, child: child),
        ],
      ),
    );
  }
}

class _PeakHoursCard extends StatelessWidget {
  const _PeakHoursCard({required this.stats, required this.period, required this.openHour, required this.closeHour});
  final DashboardStats? stats;
  final String period;
  final int openHour;
  final int closeHour;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final hours = (stats?.peakHours ?? const <HourPoint>[])
        .where((h) => h.hour >= openHour && h.hour <= closeHour)
        .toList();
    final busiest = hours.isEmpty ? null : hours.reduce((a, b) => b.orders > a.orders ? b : a);
    final Widget body;
    if (stats == null) {
      body = const Center(child: SkeletonBox(height: 150));
    } else if (busiest == null || busiest.orders == 0) {
      body = Center(
        child: Text(tr('No paid orders in this period'), style: PosType.body.copyWith(color: c.textMuted)),
      );
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              text: '${tr('Busiest hour:')} ',
              children: [
                TextSpan(
                  text: busiest.label,
                  style: TextStyle(color: c.text, fontWeight: FontWeight.w700),
                ),
                const TextSpan(text: ' · '),
                TextSpan(
                  text: trn(busiest.orders, '{n} order', '{n} orders'),
                  style: TextStyle(color: c.brand, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5),
          ),
          const SizedBox(height: PosSpacing.sm),
          Expanded(
            child: BarChart(
              values: [for (final h in hours) h.orders.toDouble()],
              labels: [for (final h in hours) h.label],
              color: c.brand,
              labelEvery: 3,
            ),
          ),
        ],
      );
    }
    return _ChartCard(
      icon: Icons.schedule_rounded,
      title: tr('Peak Hours'),
      subtitle: '$period · ${tr('9:00 AM – 11:00 PM')}',
      child: body,
    );
  }
}

/// Channel order counts come from `/admin/reports/branch-analytics`, which the
/// backend blocks for cashiers — the web shows "—" here too.
class _OrderBreakdownCard extends StatelessWidget {
  const _OrderBreakdownCard({required this.period, required this.pickupOnly});
  final String period;
  final bool pickupOnly;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final legend = [
      (tr('Pickup Cash'), PosColors.channelPickupCash),
      (tr('Pickup Card'), PosColors.channelPickupCard),
      (tr('Pickup Online'), PosColors.channelPickupOnline),
      if (!pickupOnly) (tr('Delivery Online'), PosColors.channelDeliveryOnline),
      (tr('Refund Completed'), const Color(0xFF64748B)),
    ];
    return _ChartCard(
      title: tr('Order Breakdown'),
      subtitle: '$period · ${tr('order channels')}',
      // Donut scales with the card so the legend always fits beside it.
      child: LayoutBuilder(
        builder: (context, box) => Row(
          children: [
            DonutChart(
              slices: const [],
              center: '—',
              caption: tr('Orders'),
              size: (box.maxWidth * 0.42).clamp(90, 130).toDouble(),
            ),
            const SizedBox(width: PosSpacing.md),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final (label, color) in legend)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '$label · —',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: PosType.caption.copyWith(color: c.textMuted, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RevenueOverviewCard extends StatelessWidget {
  const _RevenueOverviewCard({required this.stats, required this.period});
  final DashboardStats? stats;
  final String period;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final months = stats?.monthlyOverview ?? const <MonthPoint>[];
    return _ChartCard(
      title: tr('Revenue Overview'),
      subtitle: '$period · ${tr('paid orders · outflow')}',
      trailing: stats == null
          ? const SkeletonBox(height: 14, width: 80)
          : Text(formatMoney(stats!.periodRevenue), style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13)),
      child: stats == null
          ? const Center(child: SkeletonBox(height: 150))
          : Column(
              children: [
                Expanded(
                  child: AreaChart(
                    labels: [for (final m in months) m.shortMonth],
                    series: [
                      ChartSeries(values: [for (final m in months) m.outflow], color: c.danger, label: tr('Outflow')),
                      ChartSeries(values: [for (final m in months) m.revenue], color: c.brand, label: tr('Revenue')),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _LegendDot(color: c.danger, label: tr('Outflow')),
                    const SizedBox(width: PosSpacing.lg),
                    _LegendDot(color: c.brand, label: tr('Revenue')),
                  ],
                ),
              ],
            ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 9,
        height: 9,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
      ),
      const SizedBox(width: 5),
      Text(label, style: PosType.caption.copyWith(color: context.pos.text, fontSize: 11.5)),
    ],
  );
}

// ---------------------------------------------------------------- Tables

/// Horizontal padding on each side of a table cell, shared by headers and rows.
const _cellGap = 4.0;

/// One table cell with the shared gap.
Widget _cell(int flex, Widget child) => Expanded(
  flex: flex,
  child: Padding(
    padding: const EdgeInsets.symmetric(horizontal: _cellGap),
    child: child,
  ),
);

/// Card with a title bar and a shaded column-header row (web DashTable).
class _TableCard extends StatelessWidget {
  const _TableCard({
    required this.title,
    required this.columns,
    required this.rows,
    required this.loading,
    required this.emptyText,
    this.icon,
    this.action,
  });

  final String title;
  final IconData? icon;
  final Widget? action;

  /// (label, flex, right aligned)
  final List<(String, int, bool)> columns;
  final List<Widget> rows;
  final bool loading;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return PosCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Fixed height so paired tables line up whether or not there's an action.
          Container(
            height: 52,
            padding: const EdgeInsets.fromLTRB(PosSpacing.lg, 0, PosSpacing.sm, 0),
            child: Row(
              children: [
                if (icon != null) ...[Icon(icon, size: 16, color: c.brand), const SizedBox(width: 8)],
                Expanded(
                  child: Text(title, style: PosType.section.copyWith(color: c.text)),
                ),
                ?action,
              ],
            ),
          ),
          Container(
            color: c.surface,
            padding: const EdgeInsets.symmetric(horizontal: PosSpacing.lg, vertical: 9),
            child: Row(
              children: [
                for (final (label, flex, right) in columns)
                  Expanded(
                    flex: flex,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: _cellGap),
                      child: Text(
                        label.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: right ? TextAlign.right : TextAlign.left,
                        style: PosType.label.copyWith(color: c.textMuted, fontSize: 10),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (loading)
            for (var i = 0; i < 4; i++)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: PosSpacing.lg, vertical: 10),
                child: SkeletonBox(height: 18),
              )
          else if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: PosSpacing.xl, vertical: 48),
              child: Column(
                children: [
                  Icon(Icons.inbox_outlined, size: 30, color: c.textSoft),
                  const SizedBox(height: 8),
                  Text(
                    emptyText,
                    textAlign: TextAlign.center,
                    style: PosType.body.copyWith(color: c.textMuted),
                  ),
                ],
              ),
            )
          else
            for (final (i, r) in rows.indexed) ...[
              if (i > 0) Divider(height: 1, color: c.border.withValues(alpha: 0.5)),
              r,
            ],
          const SizedBox(height: PosSpacing.xs),
        ],
      ),
    );
  }
}

class _TopProductsCard extends StatelessWidget {
  const _TopProductsCard({required this.products, required this.loading});
  final List<TopProduct> products;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final num = PosType.body.copyWith(color: c.text, fontSize: 13, fontFeatures: PosType.tabular);
    return _TableCard(
      title: tr('Top Selling Products'),
      icon: Icons.emoji_events_outlined,
      loading: loading,
      emptyText: tr('No sales in this period'),
      columns: [(tr('Product'), 5, false), (tr('Orders'), 2, true), (tr('Revenue (LKR)'), 3, true)],
      rows: [
        for (final p in products.take(5))
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: PosSpacing.lg, vertical: 9),
            child: Row(
              children: [
                _cell(
                  5,
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(PosRadius.sm),
                          border: Border.all(color: c.border.withValues(alpha: 0.7)),
                        ),
                        child: ProductImage(url: p.imageUrl, size: 30, contain: true, radius: 6),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          p.productName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: PosType.body.copyWith(color: c.text, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
                _cell(2, Text(formatCount(p.quantity), textAlign: TextAlign.right, style: num)),
                _cell(3, Text(formatMoneyAmount(p.revenue), textAlign: TextAlign.right, style: num)),
              ],
            ),
          ),
      ],
    );
  }
}

class _RecentOrdersCard extends StatelessWidget {
  const _RecentOrdersCard({required this.orders, required this.loading, required this.onViewAll});
  final List<OrderSummary> orders;
  final bool loading;
  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final num = PosType.body.copyWith(color: c.text, fontSize: 13, fontFeatures: PosType.tabular);
    return _TableCard(
      title: tr('Recent Orders'),
      loading: loading,
      emptyText: tr('No orders yet'),
      action: TextButton(
        onPressed: onViewAll,
        // Compact so this header matches the Top Selling Products header beside it.
        style: TextButton.styleFrom(
          minimumSize: const Size(0, 24),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        child: Text(tr('View All')),
      ),
      columns: [(tr('Type'), 3, false), (tr('Amount (LKR)'), 4, true), (tr('Status'), 5, false), (tr('Time'), 3, true)],
      rows: [
        for (final o in orders.take(5))
          InkWell(
            onTap: () => AppRoutes.openOrder(context, o.orderNumber),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: PosSpacing.lg, vertical: 11),
              child: Row(
                children: [
                  _cell(
                    3,
                    Text(
                      o.isDelivery ? tr('Delivery') : tr('Pickup'),
                      style: PosType.body.copyWith(color: c.text, fontSize: 13),
                    ),
                  ),
                  _cell(4, Text(formatMoneyAmount(o.total), textAlign: TextAlign.right, style: num)),
                  _cell(
                    5,
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: OrderStatusBadge(order: o),
                      ),
                    ),
                  ),
                  _cell(
                    3,
                    Text(
                      formatTime(o.createdAt),
                      maxLines: 1,
                      softWrap: false,
                      overflow: TextOverflow.fade,
                      textAlign: TextAlign.right,
                      style: PosType.caption.copyWith(color: c.textMuted, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------- Bits

class _IconBadge extends StatelessWidget {
  const _IconBadge({required this.icon, this.solid = false});
  final IconData icon;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: solid ? c.brand : c.brandSubtle,
        borderRadius: BorderRadius.circular(PosRadius.sm),
      ),
      child: Icon(icon, size: 15, color: solid ? Colors.white : c.brand),
    );
  }
}

class _PeriodTag extends StatelessWidget {
  const _PeriodTag(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(PosRadius.pill),
        border: Border.all(color: c.border.withValues(alpha: 0.8)),
      ),
      child: Text(text, style: PosType.caption.copyWith(color: c.text, fontSize: 11)),
    );
  }
}
