import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/exporter.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/pos_card.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

/// Promotion analytics — the web `/admin/promos` Analyze tab (PromotionDiscountReport)
/// only; creating or editing promotions is not part of this app.
class PromotionsScreen extends StatefulWidget {
  const PromotionsScreen({super.key});

  @override
  State<PromotionsScreen> createState() => _PromotionsScreenState();
}

class _PromotionsScreenState extends State<PromotionsScreen> {
  PeriodFilter _period = const PeriodFilter.month();
  bool _byBranch = true;
  final Set<String> _expanded = {};
  late final Loadable<PromoReport> _report;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _report = Loadable(() {
      final r = _period.orderRange;
      return repo.promoReport(from: r.startDate!, to: r.endDate!);
    });
  }

  @override
  void dispose() {
    _report.dispose();
    super.dispose();
  }

  String _owner(String o) => switch (o.toUpperCase()) {
    'BRANCH' => tr('Branch'),
    'SHARED' => tr('Shared'),
    _ => tr('Platform'),
  };

  String _pct(double v) => '${v.toStringAsFixed(2)}%';

  Future<void> _export(PromoReport r) async {
    try {
      await Exporter.shareCsv(
        context,
        filename: 'promotion-discounts-${r.from}-${r.to}',
        headers: [tr('Type'), tr('Name'), tr('Code'), tr('Owner'), tr('Orders'), tr('Sales (LKR)'), tr('Discount (LKR)'), tr('Discount %'), tr('Branch share (LKR)'), tr('Platform share (LKR)'), tr('Promo uses')],
        rows: [
          for (final b in r.byBranch) ...[
            [tr('Branch'), shortBranch(b.storeName), '', '', b.orderCount, b.money.orderSales, b.money.totalDiscount, b.money.discountPct, b.money.branchShare, b.money.platformShare, b.money.usageCount],
            for (final p in b.promos)
              [tr('Promotion'), p.label, p.code, _owner(p.ownership), '', p.money.orderSales, p.money.totalDiscount, p.money.discountPct, p.money.branchShare, p.money.platformShare, p.money.usageCount],
          ],
        ],
      );
    } catch (e) {
      if (mounted) showPosSnack(context, tr('Export failed: {e}', {'e': e}), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _report,
      builder: (context, _) {
        final r = _report.data;
        return AdminPageList(
          onRefresh: () => _report.load(silent: true),
          children: [
            PageHeader(
              title: tr('Promotion Analytics'),
              subtitle: tr('Discounts given through promotions, by branch and by promotion'),
              actions: [
                const ViewOnlyTag(),
                PosIconButton(icon: Icons.download_rounded, tooltip: tr('Export CSV'), onPressed: r == null ? null : () => _export(r)),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            PeriodSegments(
              value: _period,
              onChanged: (p) {
                if (!p.ready) return;
                setState(() => _period = p);
                _report.load();
              },
            ),
            const SizedBox(height: PosSpacing.md),
            if (r == null)
              _report.error != null
                  ? ErrorView(message: _report.error!, onRetry: _report.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else ...[
              if (_report.loading) const LinearProgressIndicator(minHeight: 2),
              KpiGrid(
                children: [
                  KpiTile(icon: Icons.receipt_long_outlined, title: tr('Orders in scope'), value: formatCount(r.orderCount)),
                  KpiTile(icon: Icons.trending_up_rounded, title: tr('Gross sales'), value: formatMoney(r.grossSales), color: PosColors.ready),
                  KpiTile(icon: Icons.sell_outlined, title: tr('Promo-attributed sales'), value: formatMoney(r.totals.orderSales), color: PosColors.received),
                  KpiTile(
                    icon: Icons.percent_rounded,
                    title: tr('Discount applied'),
                    value: formatMoney(r.totals.totalDiscount),
                    caption: tr('{p} of sales', {'p': _pct(r.totals.discountPct)}),
                    color: context.pos.accent,
                  ),
                  KpiTile(icon: Icons.storefront_outlined, title: tr('Branch-funded'), value: formatMoney(r.totals.branchShare)),
                  KpiTile(icon: Icons.domain_rounded, title: tr('Platform-funded'), value: formatMoney(r.totals.platformShare)),
                  KpiTile(icon: Icons.confirmation_number_outlined, title: tr('Promo redemptions'), value: formatCount(r.totals.usageCount)),
                  KpiTile(icon: Icons.store_mall_directory_outlined, title: tr('Branches'), value: formatCount(r.byBranch.length)),
                ],
              ),
              const SizedBox(height: PosSpacing.md),
              PillTabs<bool>(
                items: [(true, tr('By branch'), Icons.storefront_outlined, null), (false, tr('By promotion'), Icons.local_offer_outlined, null)],
                selected: _byBranch,
                onSelect: (v) => setState(() => _byBranch = v),
              ),
              const SizedBox(height: PosSpacing.md),
              if ((_byBranch ? r.byBranch.length : r.byPromo.length) == 0)
                EmptyView(message: tr('No promotions were used in this period'), icon: Icons.local_offer_outlined)
              else if (_byBranch)
                for (final b in r.byBranch)
                  _ExpandableLine(
                    key: ValueKey('b-${b.storeId}'),
                    title: shortBranch(b.storeName),
                    subtitle: tr('{o} orders · sales {s}', {'o': formatCount(b.orderCount), 's': formatMoney(b.money.orderSales)}),
                    money: b.money,
                    expanded: _expanded.contains('b-${b.storeId}'),
                    onToggle: () => setState(() => _toggle('b-${b.storeId}')),
                    children: [
                      for (final p in b.promos) _child(p.label, '${p.code} · ${_owner(p.ownership)}', p.money),
                    ],
                  )
              else
                for (final p in r.byPromo)
                  _ExpandableLine(
                    key: ValueKey('p-${p.code}'),
                    title: p.label,
                    subtitle: '${p.code} · ${_owner(p.ownership)}',
                    badge: _owner(p.ownership),
                    money: p.money,
                    expanded: _expanded.contains('p-${p.code}'),
                    onToggle: () => setState(() => _toggle('p-${p.code}')),
                    children: [
                      for (final b in p.children) _child(shortBranch(b.storeName), trn(b.money.usageCount, '{n} use', '{n} uses'), b.money),
                    ],
                  ),
            ],
          ],
        );
      },
    );
  }

  void _toggle(String key) => _expanded.contains(key) ? _expanded.remove(key) : _expanded.add(key);

  Widget _child(String title, String subtitle, PromoMoney m) {
    final c = context.pos;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5)),
                Text(subtitle, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatMoney(m.totalDiscount), style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5)),
              Text(_pct(m.discountPct), style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }
}

class _ExpandableLine extends StatelessWidget {
  const _ExpandableLine({
    super.key,
    required this.title,
    required this.subtitle,
    required this.money,
    required this.expanded,
    required this.onToggle,
    required this.children,
    this.badge,
  });

  final String title;
  final String subtitle;
  final String? badge;
  final PromoMoney money;
  final bool expanded;
  final VoidCallback onToggle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return PosCard(
      margin: const EdgeInsets.only(bottom: PosSpacing.sm),
      padding: const EdgeInsets.all(PosSpacing.md),
      onTap: children.isEmpty ? null : onToggle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(child: Text(title, style: PosType.bodyStrong.copyWith(color: c.text))),
                        if (badge != null) ...[const SizedBox(width: 6), PosBadge(label: badge!, color: c.brand)],
                      ],
                    ),
                    Text(subtitle, style: PosType.caption.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              if (children.isNotEmpty) Icon(expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: c.textMuted),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          Wrap(
            spacing: PosSpacing.lg,
            runSpacing: 4,
            children: [
              _fact(context, tr('Discount'), formatMoney(money.totalDiscount)),
              _fact(context, tr('Discount %'), '${money.discountPct.toStringAsFixed(2)}%'),
              _fact(context, tr('Branch share'), formatMoney(money.branchShare)),
              _fact(context, tr('Platform share'), formatMoney(money.platformShare)),
              _fact(context, tr('Uses'), formatCount(money.usageCount)),
            ],
          ),
          if (expanded) ...[
            Divider(height: PosSpacing.xl, color: c.border.withValues(alpha: 0.6)),
            ...children,
          ],
        ],
      ),
    );
  }

  Widget _fact(BuildContext context, String label, String value) {
    final c = context.pos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 10.5)),
        Text(value, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5, fontFeatures: PosType.tabular)),
      ],
    );
  }
}
