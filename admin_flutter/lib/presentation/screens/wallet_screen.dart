import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/pos_app_bar.dart';
import '../components/badges.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

/// Wallet — port of the web `/admin/wallet`.
/// * Super admin: the System Wallet tab only (no Payouts Due / Platform Payments):
///   earnings, payments, refunds and every branch wallet, opening a branch ledger.
/// * Branch admin: the branch wallet, view only (balances, payout history, ledger).
class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key, required this.session});
  final AdminSession session;

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  PeriodFilter? _period;
  String _search = '';
  String _status = 'all';
  late final Loadable<WalletOverview> _overview;

  bool get _super => widget.session.isSuperAdmin;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _overview = Loadable(() {
      final r = _period?.orderRange;
      return repo.walletOverview(from: r?.startDate, to: r?.endDate);
    });
  }

  @override
  void dispose() {
    _overview.dispose();
    super.dispose();
  }

  Future<void> _pickPeriod() async {
    final choice = await showOptionSheet<String>(
      context,
      title: tr('Period'),
      selected: _period == null ? 'all' : _period!.preset.name,
      options: [('all', tr('All time')), ('month', tr('This Month')), ('year', tr('This Year')), ('custom', tr('Custom Range'))],
    );
    if (choice == null || !mounted) return;
    PeriodFilter? next;
    switch (choice) {
      case 'all':
        next = null;
      case 'month':
        next = const PeriodFilter(PeriodPreset.month);
      case 'year':
        next = const PeriodFilter(PeriodPreset.year);
      default:
        next = await pickCustomRange(context, _period ?? const PeriodFilter.month());
        if (next == null) return;
    }
    setState(() => _period = next);
    _overview.load();
  }

  String get _periodText => _period == null ? tr('All time') : periodLabel(_period!);

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _overview,
      builder: (context, _) {
        final o = _overview.data;
        return AdminPageList(
          onRefresh: () => _overview.load(silent: true),
          children: [
            PageHeader(
              title: _super ? tr('System Wallet') : tr('Branch Wallet'),
              subtitle: _super
                  ? tr('Online earnings, payouts and refunds across every branch')
                  : tr('{branch} wallet balance and payout history', {'branch': widget.session.branchLabel ?? ''}),
              actions: [if (!_super) const ViewOnlyTag()],
            ),
            const SizedBox(height: PosSpacing.md),
            Align(
              alignment: Alignment.centerLeft,
              child: FilterPill(label: _periodText, icon: Icons.date_range_rounded, active: _period != null, onTap: _pickPeriod),
            ),
            const SizedBox(height: PosSpacing.md),
            if (o == null)
              _overview.error != null
                  ? ErrorView(message: _overview.error!, onRetry: _overview.load)
                  : Padding(
                      padding: const EdgeInsets.all(PosSpacing.xxl),
                      child: LoadingView(message: tr('Calculating wallet totals… this can take a minute.')),
                    )
            else ...[
              if (_overview.loading) const LinearProgressIndicator(minHeight: 2),
              _summaryCards(o),
              const SizedBox(height: PosSpacing.lg),
              if (_super) ..._branchWallets(o) else ..._branchView(o),
            ],
          ],
        );
      },
    );
  }

  Widget _summaryCards(WalletOverview o) {
    final d = o.dashboard ?? const WalletDashboard();
    final c = context.pos;
    final earnings = KpiTile(
      icon: Icons.savings_outlined,
      title: _period == null ? tr('All-Time Earnings') : tr('Period Earnings'),
      value: moneyFromCents(d.earningsTotalCents),
      caption: tr('Pickup online {a} · Delivery {b}', {
        'a': moneyFromCents(d.pickupOnlineInCents),
        'b': moneyFromCents(d.deliveryOnlineInCents),
      }),
      color: PosColors.ready,
    );
    final payments = SectionCard(
      title: _period == null ? tr('All-Time Payments') : tr('Period Payments'),
      subtitle: formatMoney(d.totalPaymentsLkr),
      child: Column(
        children: [
          LegendLine(color: adminPalette[0], label: tr('Branch Payments'), value: moneyFromCents(d.toBranchCents)),
          if (_super) LegendLine(color: adminPalette[1], label: tr('Platform Payments'), value: moneyFromCents(d.toPlatformCents)),
          if (!widget.session.isPickupOnly) LegendLine(color: adminPalette[2], label: tr('Delivery Payments'), value: formatMoney(d.toDeliveryLkr)),
        ],
      ),
    );
    final s = o.summary;
    return Column(
      children: [
        KpiGrid(
          children: [
            earnings,
            KpiTile(icon: Icons.bolt_rounded, title: tr('Live Earnings'), value: moneyFromCents(d.liveEarningsCents), caption: tr('Not yet in a payout period')),
            KpiTile(icon: Icons.undo_rounded, title: tr('Refunds'), value: formatMoney(d.refundsLkr), color: c.danger),
            if (s != null)
              KpiTile(
                icon: Icons.account_balance_wallet_outlined,
                title: tr('Available Balance'),
                value: moneyFromCents(s.availableBalanceCents),
                caption: tr('Pending payouts {v}', {'v': moneyFromCents(s.pendingWithdrawalCents)}),
                color: PosColors.received,
              ),
          ],
        ),
        const SizedBox(height: PosSpacing.sm),
        payments,
      ],
    );
  }

  List<Widget> _branchWallets(WalletOverview o) {
    final c = context.pos;
    final q = _search.toLowerCase();
    final rows = o.wallets.where((w) {
      if (_status == 'active' && !w.isActive) return false;
      if (_status == 'inactive' && w.isActive) return false;
      return q.isEmpty || w.storeName.toLowerCase().contains(q) || w.city.toLowerCase().contains(q);
    }).toList();
    return [
      SectionLabel(tr('Branch Wallets'), trailing: Text(formatCount(o.wallets.length), style: PosType.caption.copyWith(color: c.textMuted))),
      SearchBox(hint: tr('Search branch or city'), onChanged: (v) => setState(() => _search = v)),
      const SizedBox(height: PosSpacing.sm),
      PillTabs<String>(
        items: [('all', tr('All'), null, null), ('active', tr('Active'), null, null), ('inactive', tr('Inactive'), null, null)],
        selected: _status,
        onSelect: (v) => setState(() => _status = v),
      ),
      const SizedBox(height: PosSpacing.md),
      if (rows.isEmpty)
        EmptyView(message: tr('No wallets found'), icon: Icons.account_balance_wallet_outlined)
      else
        ResponsiveGrid(
          minItemWidth: 260,
          children: [
            for (final w in rows)
              PosCard(
                padding: const EdgeInsets.all(PosSpacing.md),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => BranchLedgerScreen(storeId: w.storeId, storeName: w.storeName)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(color: c.brandSubtle, shape: BoxShape.circle),
                          child: Icon(Icons.storefront_rounded, size: 14, color: c.brand),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(shortBranch(w.storeName), maxLines: 1, overflow: TextOverflow.ellipsis, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13)),
                              Text(trn(w.transactionCount, '{n} transaction', '{n} transactions'), style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
                            ],
                          ),
                        ),
                        PosBadge(label: w.isActive ? tr('Active') : tr('Inactive'), color: w.isActive ? c.successText : c.textMuted),
                      ],
                    ),
                    const SizedBox(height: PosSpacing.sm),
                    Text(
                      moneyFromCents(w.balanceCents),
                      style: PosType.amount.copyWith(
                        fontSize: 16,
                        color: w.balanceCents < 0 ? c.danger : (w.balanceCents > 0 ? c.brand : c.textMuted),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(tr('View details'), style: PosType.caption.copyWith(color: c.brand, fontWeight: FontWeight.w600)),
                        Icon(Icons.chevron_right_rounded, size: 14, color: c.brand),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
    ];
  }

  List<Widget> _branchView(WalletOverview o) {
    final s = o.summary;
    final storeId = widget.session.storeId;
    return [
      if (s != null) ...[
        KpiGrid(
          children: [
            KpiTile(icon: Icons.account_balance_outlined, title: tr('Current Balance'), value: moneyFromCents(s.currentBalanceCents)),
            KpiTile(icon: Icons.trending_up_rounded, title: tr('Total Earnings'), value: moneyFromCents(s.totalEarningsCents), color: PosColors.ready),
            KpiTile(icon: Icons.payments_outlined, title: tr('Total Paid Out'), value: moneyFromCents(s.totalWithdrawnCents), color: PosColors.received),
          ],
        ),
        const SizedBox(height: PosSpacing.lg),
      ],
      _WithdrawalHistory(period: _period),
      const SizedBox(height: PosSpacing.lg),
      if (storeId != null) _LedgerSection(storeId: storeId, period: _period),
    ];
  }
}

String withdrawalStatusLabel(String s) => switch (s) {
  'APPROVED' => tr('Paid'),
  'PENDING' => tr('Pending Approval'),
  'REJECTED' => tr('Rejected'),
  'CANCELLED' => tr('Cancelled'),
  _ => s,
};

class _WithdrawalHistory extends StatefulWidget {
  const _WithdrawalHistory({required this.period});
  final PeriodFilter? period;

  @override
  State<_WithdrawalHistory> createState() => _WithdrawalHistoryState();
}

class _WithdrawalHistoryState extends State<_WithdrawalHistory> {
  int _page = 1;
  late final Loadable<Paged<Withdrawal>> _rows;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _rows = Loadable(() {
      final r = widget.period?.orderRange;
      return repo.withdrawals(page: _page, from: r?.startDate, to: r?.endDate);
    });
  }

  @override
  void didUpdateWidget(covariant _WithdrawalHistory old) {
    super.didUpdateWidget(old);
    if (old.period != widget.period) {
      _page = 1;
      _rows.load();
    }
  }

  @override
  void dispose() {
    _rows.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return SectionCard(
      title: tr('Payout History'),
      subtitle: tr('15-day settlement payouts to this branch'),
      child: LoadableBuilder(
        value: _rows,
        builder: (context, page) => Column(
          children: [
            if (page.items.isEmpty)
              Padding(
                padding: const EdgeInsets.all(PosSpacing.lg),
                child: Text(tr('No payouts yet'), style: PosType.caption.copyWith(color: c.textMuted)),
              )
            else
              SimpleTable(
                minWidth: 560,
                columns: [TableCol(tr('Requested'), flex: 2), TableCol(tr('Period'), flex: 3), TableCol(tr('Amount'), flex: 2, numeric: true), TableCol(tr('Status'), flex: 2)],
                rows: [
                  for (final w in page.items)
                    [
                      formatShortDate(toColombo(w.createdAt)),
                      w.periodFrom == null || w.periodTo == null
                          ? '—'
                          : '${formatShortDate(toColombo(w.periodFrom!))} – ${formatShortDate(toColombo(w.periodTo!))}',
                      moneyFromCents(w.amountCents),
                      withdrawalStatusLabel(w.status),
                    ],
                ],
              ),
            Pager(
              page: _page,
              pages: page.pages,
              total: page.total,
              onPage: (p) {
                _page = p;
                _rows.load();
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Wallet transactions of one branch (web BranchWalletDetail ledger), view only.
class _LedgerSection extends StatefulWidget {
  const _LedgerSection({required this.storeId, this.period});
  final String storeId;
  final PeriodFilter? period;

  @override
  State<_LedgerSection> createState() => _LedgerSectionState();
}

class _LedgerSectionState extends State<_LedgerSection> {
  int _page = 1;
  String? _direction;
  late final Loadable<WalletTxnPage> _rows;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _rows = Loadable(() {
      final r = widget.period?.orderRange;
      return repo.walletTransactions(widget.storeId, page: _page, from: r?.startDate, to: r?.endDate, direction: _direction);
    });
  }

  @override
  void didUpdateWidget(covariant _LedgerSection old) {
    super.didUpdateWidget(old);
    if (old.period != widget.period) {
      _page = 1;
      _rows.load();
    }
  }

  @override
  void dispose() {
    _rows.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return SectionCard(
      title: tr('Transactions'),
      subtitle: tr('Wallet ledger'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Full-width segmented filter in the indigo capsule style used on Orders.
          CapsuleTabs<String?>(
            items: [
              CapsuleTabItem(value: null, label: tr('All'), icon: Icons.swap_vert_rounded),
              CapsuleTabItem(value: 'IN', label: tr('In'), icon: Icons.south_west_rounded),
              CapsuleTabItem(value: 'OUT', label: tr('Out'), icon: Icons.north_east_rounded),
            ],
            selected: _direction,
            onSelect: (v) {
              setState(() => _direction = v);
              _page = 1;
              _rows.load();
            },
          ),
          const SizedBox(height: PosSpacing.md),
          LoadableBuilder(
            value: _rows,
            builder: (context, page) {
              final s = page.summary;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (s != null) ...[
                    // Equal tiles: 2 per row on phones, 4 on wide screens.
                    KpiGrid(
                      minTile: 150,
                      children: [
                        _SummaryTile(label: tr('Total in'), value: moneyFromCents(s.totalIn), icon: Icons.south_west_rounded, color: c.successText),
                        _SummaryTile(label: tr('Delivery in'), value: moneyFromCents(s.deliveryIn), icon: Icons.delivery_dining_rounded, color: c.brand),
                        _SummaryTile(label: tr('Pickup online in'), value: moneyFromCents(s.pickupOnlineIn), icon: Icons.shopping_bag_outlined, color: PosColors.channelPickupCash),
                        _SummaryTile(label: tr('Total out'), value: moneyFromCents(s.totalOut), icon: Icons.north_east_rounded, color: c.dangerText),
                      ],
                    ),
                    const SizedBox(height: PosSpacing.md),
                  ],
                  if (page.items.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: PosSpacing.xl),
                      child: Column(
                        children: [
                          Icon(Icons.receipt_long_outlined, size: 28, color: c.textSoft),
                          const SizedBox(height: 6),
                          Text(tr('No transactions'), style: PosType.caption.copyWith(color: c.textMuted)),
                        ],
                      ),
                    )
                  else
                    for (final (i, t) in page.items.indexed) _TxnRow(txn: t, divider: i > 0),
                  Pager(
                    page: _page,
                    pages: page.pages,
                    onPage: (p) {
                      _page = p;
                      _rows.load();
                    },
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Wallet total: tinted icon chip, muted label, amount in the tile colour.
class _SummaryTile extends StatelessWidget {
  const _SummaryTile({required this.label, required this.value, required this.icon, required this.color});
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      padding: const EdgeInsets.all(PosSpacing.md),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(PosRadius.button + 2),
        border: Border.all(color: c.border.withValues(alpha: 0.6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                child: Icon(icon, size: 15, color: color),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5, height: 1.2),
                ),
              ),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: PosType.amount.copyWith(color: color, fontSize: 16)),
          ),
        ],
      ),
    );
  }
}

/// One ledger line: direction chip, description, meta line, signed amount.
class _TxnRow extends StatelessWidget {
  const _TxnRow({required this.txn, required this.divider});
  final WalletTxn txn;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final t = txn;
    final color = t.isIn ? c.successText : c.dangerText;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        border: divider ? Border(top: BorderSide(color: c.border.withValues(alpha: 0.5))) : null,
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: Icon(t.isIn ? Icons.south_west_rounded : Icons.north_east_rounded, size: 18, color: color),
          ),
          const SizedBox(width: PosSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.description ?? t.type.replaceAll('_', ' '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  [formatShortDateTime(t.createdAt), t.type.replaceAll('_', ' '), ?t.reference].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(width: PosSpacing.sm),
          Text(
            '${t.isIn ? '+' : '−'}${moneyFromCents(t.amountCents)}',
            style: PosType.bodyStrong.copyWith(color: color, fontSize: 13, fontFeatures: PosType.tabular),
          ),
        ],
      ),
    );
  }
}

/// One branch's wallet ledger, opened from a System Wallet card.
class BranchLedgerScreen extends StatefulWidget {
  const BranchLedgerScreen({super.key, required this.storeId, required this.storeName});
  final String storeId;
  final String storeName;

  @override
  State<BranchLedgerScreen> createState() => _BranchLedgerScreenState();
}

class _BranchLedgerScreenState extends State<BranchLedgerScreen> {
  PeriodFilter _period = const PeriodFilter.month();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: PosAppBar(title: shortBranch(widget.storeName), eyebrow: tr('Branch wallet')),
    body: ListView(
      padding: centeredPadding(context, maxWidth: 1400),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: PeriodFilterPill(value: _period, onChanged: (p) => setState(() => _period = p)),
        ),
        const SizedBox(height: PosSpacing.md),
        _LedgerSection(storeId: widget.storeId, period: _period),
      ],
    ),
  );
}
