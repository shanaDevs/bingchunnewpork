import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/charts.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/states.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';
import 'sales_screens.dart';

/// Branch admin dashboard extras (web BranchAdminDashboard outside cashier mode):
/// refunds completed, outflows by method, refunds by month, discounts by month
/// and top customers, from `/admin/reports/branch-analytics`.
class BranchInsights extends StatefulWidget {
  const BranchInsights({super.key, required this.period});
  final PeriodFilter period;

  @override
  State<BranchInsights> createState() => _BranchInsightsState();
}

class _BranchInsightsState extends State<BranchInsights> {
  late final Loadable<BranchAnalytics> _data;
  late final Loadable<int> _refunds;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _data = Loadable(() => repo.branchAnalytics(widget.period));
    _refunds = Loadable(() {
      final r = widget.period.orderRange;
      return repo.refundCount({'status': 'COMPLETE', 'startDate': ?r.startDate, 'endDate': ?r.endDate});
    });
  }

  @override
  void didUpdateWidget(covariant BranchInsights old) {
    super.didUpdateWidget(old);
    if (old.period != widget.period) {
      _data.load();
      _refunds.load();
    }
  }

  @override
  void dispose() {
    _data.dispose();
    _refunds.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final label = periodLabel(widget.period);
    return ListenableBuilder(
      listenable: Listenable.merge([_data, _refunds]),
      builder: (context, _) {
        final d = _data.data;
        if (d == null) {
          return _data.error != null ? ErrorView(message: _data.error!, onRetry: _data.load) : const SizedBox(height: 120, child: LoadingView());
        }
        final refundTotal = d.refundByMonth.fold<double>(0, (a, r) => a + r.value);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionLabel(tr('Branch insights')),
            KpiGrid(
              children: [
                KpiTile(
                  icon: Icons.undo_rounded,
                  title: tr('Refund Completed'),
                  value: formatMoney(refundTotal),
                  caption: _refunds.data == null ? null : trn(_refunds.data!, 'From {n} refund', 'From {n} refunds'),
                  color: c.danger,
                ),
                KpiTile(icon: Icons.percent_rounded, title: tr('Commission fee'), value: formatMoney(d.commissionFee), color: c.accent),
                KpiTile(icon: Icons.credit_card_rounded, title: tr('Gateway fee'), value: formatMoney(d.gatewayFee)),
                KpiTile(icon: Icons.savings_outlined, title: tr('After fees (est.)'), value: formatMoney(d.grossAfterFees), color: PosColors.ready),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            AdaptiveRows(
              minItemWidth: 320,
              children: [
                SectionCard(
                  title: tr('Outflows'),
                  subtitle: '${tr('By payout method')} · $label',
                  child: RankBars(
                    showRank: false,
                    color: c.accent,
                    rows: [for (final o in d.outflowByMethod) (o.label, o.value, formatMoney(o.value), null)],
                    empty: tr('No outflows in this period'),
                  ),
                ),
                SectionCard(
                  title: tr('Refunds by Month'),
                  subtitle: label,
                  child: SizedBox(
                    height: 170,
                    child: d.refundByMonth.isEmpty
                        ? Center(child: Text(tr('No refunds in this period'), style: PosType.caption.copyWith(color: c.textMuted)))
                        : BarChart(
                            values: [for (final r in d.refundByMonth) r.value],
                            labels: [for (final r in d.refundByMonth) r.label.split(' ').first],
                            color: const Color(0xFF112E81),
                            labelEvery: (d.refundByMonth.length / 6).ceil().clamp(1, 12),
                          ),
                  ),
                ),
                SectionCard(
                  title: tr('Discounts by Month'),
                  subtitle: label,
                  child: SizedBox(
                    height: 170,
                    child: d.discountsByMonth.isEmpty
                        ? Center(child: Text(tr('No discounts in this period'), style: PosType.caption.copyWith(color: c.textMuted)))
                        : BarChart(
                            values: [for (final r in d.discountsByMonth) r.value],
                            labels: [for (final r in d.discountsByMonth) r.label.split(' ').first],
                            color: c.accent,
                            labelEvery: (d.discountsByMonth.length / 6).ceil().clamp(1, 12),
                          ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            customersCard(context, d.topCustomers, label),
          ],
        );
      },
    );
  }
}
