import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/exporter.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/menu.dart';
import '../../domain/entities/order.dart';
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

/// Refunds — port of the web `/admin/refunds`. Branch admins process refunds
/// (approve / reject); super admins see every branch's refunds, view only.
class RefundsScreen extends StatefulWidget {
  const RefundsScreen({super.key, required this.session, required this.canProcess});
  final AdminSession session;

  /// Branch admin with ORDERS update permission (web requireBranchAdminOnly + ORDERS update).
  final bool canProcess;

  @override
  State<RefundsScreen> createState() => _RefundsScreenState();
}

class _RefundsScreenState extends State<RefundsScreen> {
  String _tab = RefundStatus.received;
  String _search = '';
  String? _storeId;
  PeriodFilter? _range;
  int _page = 1;
  List<StoreOption> _stores = const [];
  final Map<String, int> _counts = {};
  late final Loadable<Paged<RefundRow>> _rows;
  late final Loadable<RefundSummary> _summary;
  int _cancelWindow = 10;
  Timer? _timer;

  bool get _super => widget.session.isSuperAdmin;

  static const _tabs = [RefundStatus.received, RefundStatus.complete, RefundStatus.rejected, 'ALL'];

  @override
  void initState() {
    super.initState();
    final c = context.read<AppContainer>();
    _rows = Loadable(() => c.adminRepository.refunds({..._filters(), 'page': '$_page', 'limit': '20', if (_tab != 'ALL') 'status': _tab}));
    _summary = Loadable(() => c.adminRepository.refundSummary(_filters()));
    _loadCounts();
    if (_super) {
      c.menuRepository.stores().then((s) => mounted ? setState(() => _stores = s) : null, onError: (_) {});
    }
    c.adminRepository.appSettings().then(
      (s) => mounted ? setState(() => _cancelWindow = s.cancelWindowMinutes) : null,
      onError: (_) {},
    );
    // Web refetchInterval: 30_000.
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted || !TickerMode.of(context)) return;
      _rows.load(silent: true);
      _summary.load(silent: true);
      _loadCounts();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _rows.dispose();
    _summary.dispose();
    super.dispose();
  }

  Map<String, String> _filters() {
    final r = _range?.orderRange;
    return {
      if (_search.isNotEmpty) 'search': _search,
      if (_super && _storeId != null) 'storeId': _storeId!,
      'startDate': ?r?.startDate,
      'endDate': ?r?.endDate,
    };
  }

  Future<void> _loadCounts() async {
    final repo = context.read<AppContainer>().adminRepository;
    for (final t in _tabs) {
      try {
        final n = await repo.refundCount({..._filters(), if (t != 'ALL') 'status': t});
        if (mounted) setState(() => _counts[t] = n);
      } catch (_) {}
    }
  }

  void _reloadAll() {
    _page = 1;
    _rows.load();
    _summary.load();
    _loadCounts();
  }

  String _tabLabel(String t) => switch (t) {
    RefundStatus.received => tr('Received'),
    RefundStatus.complete => tr('Complete'),
    RefundStatus.rejected => tr('Rejected'),
    _ => tr('All'),
  };

  Future<void> _pickRange() async {
    final choice = await showOptionSheet<String>(
      context,
      title: tr('Requested date'),
      selected: _range == null ? 'all' : _range!.preset.name,
      options: [
        ('all', tr('All dates')),
        ('today', tr('Today')),
        ('month', tr('This Month')),
        ('year', tr('This Year')),
        ('custom', tr('Custom Range')),
      ],
    );
    if (choice == null || !mounted) return;
    PeriodFilter? next;
    switch (choice) {
      case 'all':
        next = null;
      case 'today':
        next = const PeriodFilter(PeriodPreset.today);
      case 'month':
        next = const PeriodFilter(PeriodPreset.month);
      case 'year':
        next = const PeriodFilter(PeriodPreset.year);
      default:
        next = await pickCustomRange(context, _range ?? const PeriodFilter.month());
        if (next == null) return;
    }
    setState(() => _range = next);
    _reloadAll();
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
    _reloadAll();
  }

  Future<void> _open(RefundRow r) async {
    final changed = await showPosSheet<bool>(
      context,
      expand: true,
      builder: (_) => RefundDetailSheet(refundId: r.id, canProcess: widget.canProcess, cancelWindowMinutes: _cancelWindow),
    );
    if (changed == true) _reloadAll();
  }

  Future<void> _export() async {
    final rows = _rows.data?.items ?? const [];
    try {
      await Exporter.shareCsv(
        context,
        filename: 'refunds-${formatYmd(DateTime.now())}',
        headers: [
          tr('Requested date'),
          tr('Request type'),
          tr('Order'),
          tr('Customer'),
          tr('Total order amount'),
          if (_super) tr('Branch'),
          tr('Cancel at'),
          tr('Reason'),
          tr('Refund amount'),
          tr('Status'),
        ],
        rows: [
          for (final r in rows)
            [
              formatShortDateTime(r.createdAt),
              refundTypeLabel(r, _cancelWindow),
              r.orderNumber,
              r.customerName ?? tr('Guest'),
              r.orderTotal,
              if (_super) shortBranch(r.storeName),
              r.cancelledAtStatus == null ? '' : orderStatusLabel(r.cancelledAtStatus!, mode: r.orderMode),
              refundReasonLabel(r),
              r.displayAmount,
              refundStatusLabel(r.status),
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
    return ListenableBuilder(
      listenable: Listenable.merge([_rows, _summary]),
      builder: (context, _) {
        final page = _rows.data;
        final sum = _summary.data;
        return AdminPageList(
          onRefresh: () async => _reloadAll(),
          children: [
            PageHeader(
              title: tr('Refunds'),
              subtitle: _super
                  ? tr('Refund requests from every branch (branch and customer cancellations)')
                  : tr('Review and process refund requests for cancelled orders'),
              actions: [
                if (!widget.canProcess) const ViewOnlyTag(),
                PosIconButton(
                  icon: Icons.download_rounded,
                  tooltip: tr('Export CSV'),
                  onPressed: page == null || page.items.isEmpty ? null : _export,
                ),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            KpiGrid(
              children: [
                KpiTile(icon: Icons.receipt_outlined, title: tr('Refund requests'), value: sum == null ? '—' : formatCount(sum.count), loading: sum == null),
                KpiTile(icon: Icons.person_outline_rounded, title: tr('Customer receives'), value: sum == null ? '—' : formatMoney(sum.customer), color: PosColors.ready, loading: sum == null),
                KpiTile(icon: Icons.storefront_outlined, title: tr('Branch receives'), value: sum == null ? '—' : formatMoney(sum.branch), color: PosColors.received, loading: sum == null),
                KpiTile(icon: Icons.local_shipping_outlined, title: tr('Delivery receives'), value: sum == null ? '—' : formatMoney(sum.delivery), color: context.pos.accent, loading: sum == null),
                KpiTile(icon: Icons.percent_rounded, title: tr('Platform receives'), value: sum == null ? '—' : formatMoney(sum.platform), color: const Color(0xFF8B5CF6), loading: sum == null),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            PillTabs<String>(
              items: [for (final t in _tabs) (t, _tabLabel(t), null, _counts[t])],
              selected: _tab,
              onSelect: (t) {
                setState(() => _tab = t);
                _page = 1;
                _rows.load();
              },
            ),
            const SizedBox(height: PosSpacing.md),
            SearchBox(
              hint: tr('Search order #, customer or phone'),
              onChanged: (v) {
                _search = v;
                _reloadAll();
              },
            ),
            const SizedBox(height: PosSpacing.sm),
            Wrap(
              spacing: PosSpacing.sm,
              runSpacing: PosSpacing.sm,
              children: [
                FilterPill(
                  label: _range == null ? tr('All dates') : periodLabel(_range!),
                  icon: Icons.calendar_today_rounded,
                  active: _range != null,
                  onTap: _pickRange,
                ),
                if (_super) FilterPill(label: storeName, icon: Icons.storefront_outlined, active: _storeId != null, onTap: _pickStore),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            if (_rows.loading && page != null) const LinearProgressIndicator(minHeight: 2),
            if (page == null)
              _rows.error != null
                  ? ErrorView(message: _rows.error!, onRetry: _rows.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else if (page.items.isEmpty)
              EmptyView(message: tr('No refund requests here'), icon: Icons.undo_rounded)
            else ...[
              ResponsiveGrid(
                minItemWidth: 380,
                children: [
                  for (final r in page.items)
                    _RefundCard(refund: r, showBranch: _super, cancelWindow: _cancelWindow, onTap: () => _open(r)),
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
          ],
        );
      },
    );
  }
}

String refundStatusLabel(String s) => switch (s) {
  RefundStatus.received => tr('Received'),
  RefundStatus.complete => tr('Complete'),
  RefundStatus.rejected => tr('Rejected'),
  _ => s,
};

Color refundStatusColor(BuildContext context, String s) => switch (s) {
  RefundStatus.complete => context.pos.successText,
  RefundStatus.rejected => context.pos.dangerText,
  _ => PosColors.received,
};

/// Web refundTypeLabel: cashier cancel / within window / after window.
String refundTypeLabel(RefundRow r, int windowMinutes) {
  if (r.isCashierCancel) return tr('Cashier cancel');
  final mins = windowMinutes == 1 ? tr('1 min') : tr('{n} min', {'n': windowMinutes});
  return r.cancelledWithinWindow ? tr('Within {m}', {'m': mins}) : tr('After {m}', {'m': mins});
}

Color refundTypeColor(BuildContext context, RefundRow r) {
  if (r.isCashierCancel) return const Color(0xFF8B5CF6);
  return r.cancelledWithinWindow ? context.pos.successText : context.pos.warningText;
}

/// "CHANGED_MIND" → "Changed mind"; OTHER shows the customer's text.
String refundReasonLabel(RefundRow r) {
  final code = r.cancellationReason;
  if (code == 'OTHER' && (r.customReasonText?.trim().isNotEmpty ?? false)) return '${tr('Other')}: ${r.customReasonText!.trim()}';
  if (code.isEmpty) return '—';
  final words = code.toLowerCase().replaceAll('_', ' ');
  return tr(words[0].toUpperCase() + words.substring(1));
}

class _RefundCard extends StatelessWidget {
  const _RefundCard({required this.refund, required this.showBranch, required this.cancelWindow, required this.onTap});
  final RefundRow refund;
  final bool showBranch;
  final int cancelWindow;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final r = refund;
    return PosCard(
      onTap: onTap,
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('#${r.orderNumber}', style: PosType.bodyStrong.copyWith(color: c.text)),
              const SizedBox(width: 6),
              PosBadge(label: refundTypeLabel(r, cancelWindow), color: refundTypeColor(context, r)),
              const Spacer(),
              PosBadge(label: refundStatusLabel(r.status), color: refundStatusColor(context, r.status)),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            [r.customerName ?? tr('Guest'), if (showBranch) shortBranch(r.storeName)].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: PosType.body.copyWith(color: c.text, fontSize: 13),
          ),
          const SizedBox(height: 2),
          Text(refundReasonLabel(r), maxLines: 2, overflow: TextOverflow.ellipsis, style: PosType.caption.copyWith(color: c.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(formatShortDateTime(r.createdAt), style: PosType.caption.copyWith(color: c.textSoft)),
              ),
              Text(tr('Order {v}', {'v': formatMoney(r.orderTotal)}), style: PosType.caption.copyWith(color: c.textMuted)),
              const SizedBox(width: PosSpacing.sm),
              Text(
                formatMoney(r.displayAmount),
                style: PosType.bodyStrong.copyWith(color: c.brand, fontFeatures: PosType.tabular),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Refund detail with the approve / reject form (web RefundProcessModal).
class RefundDetailSheet extends StatefulWidget {
  const RefundDetailSheet({super.key, required this.refundId, required this.canProcess, required this.cancelWindowMinutes});
  final String refundId;
  final bool canProcess;
  final int cancelWindowMinutes;

  @override
  State<RefundDetailSheet> createState() => _RefundDetailSheetState();
}

class _RefundDetailSheetState extends State<RefundDetailSheet> {
  late final Loadable<RefundRow> _refund;
  final _notes = TextEditingController();
  bool _busy = false;
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _refund = Loadable(() => repo.refund(widget.refundId));
  }

  @override
  void dispose() {
    _refund.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _decide(RefundRow r, {required bool approve}) async {
    final notes = _notes.text.trim();
    if (!approve && notes.isEmpty) {
      showPosSnack(context, tr('Enter a rejection reason'), kind: PosSnackKind.error);
      return;
    }
    final ok = await confirmDialog(
      context,
      title: approve ? tr('Complete refund?') : tr('Reject refund?'),
      message: approve
          ? tr('Approve refund of {v} for this order.', {'v': formatMoney(r.calculatedAmount)})
          : tr('The customer will not receive a refund for this request.'),
      confirmLabel: approve ? tr('Complete refund') : tr('Reject refund'),
      danger: !approve,
      icon: approve ? Icons.check_circle_outline_rounded : Icons.block_rounded,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final updated = await context.read<AppContainer>().adminRepository.updateRefund(
        r.id,
        status: approve ? RefundStatus.complete : RefundStatus.rejected,
        adminNotes: notes.isEmpty ? null : notes,
      );
      _refund.data = updated;
      _changed = true;
      _notes.clear();
      PosFeedback.success();
      if (mounted) showPosSnack(context, approve ? tr('Refund completed') : tr('Refund rejected'), kind: PosSnackKind.success);
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: ListenableBuilder(
        listenable: _refund,
        builder: (context, _) {
          final r = _refund.data;
          if (r == null) {
            return _refund.error != null
                ? ErrorView(message: _refund.error!, onRetry: _refund.load)
                : const LoadingView();
          }
          final processable = widget.canProcess && r.status == RefundStatus.received;
          final pct = r.isFullRefund ? 100.0 : r.fixedPercentage;
          return Column(
            children: [
              SheetHeader(
                title: tr('Refund · #{n}', {'n': r.orderNumber}),
                subtitle: formatReceiptDate(r.createdAt),
                trailing: PosBadge(label: refundStatusLabel(r.status), color: refundStatusColor(context, r.status)),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 0, PosSpacing.xl, PosSpacing.xl),
                  children: [
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        PosBadge(label: refundTypeLabel(r, widget.cancelWindowMinutes), color: refundTypeColor(context, r)),
                        ModeBadge(mode: r.orderMode),
                        PaymentMethodBadge(method: r.paymentMethod),
                        if (r.storeName != null) PosBadge(label: shortBranch(r.storeName), color: c.textMuted),
                      ],
                    ),
                    const SizedBox(height: PosSpacing.lg),
                    PosInset(
                      child: Column(
                        children: [
                          InfoCell(icon: Icons.person_outline_rounded, label: tr('Customer'), child: Text(r.customerName ?? tr('Guest'))),
                          if (r.customerPhone != null) ...[
                            const SizedBox(height: PosSpacing.sm),
                            InfoCell(icon: Icons.phone_outlined, label: tr('Phone'), child: Text(r.customerPhone!)),
                          ],
                          const SizedBox(height: PosSpacing.sm),
                          InfoCell(icon: Icons.help_outline_rounded, label: tr('Reason'), child: Text(refundReasonLabel(r))),
                          if (r.cancelledAtStatus != null) ...[
                            const SizedBox(height: PosSpacing.sm),
                            InfoCell(
                              icon: Icons.flag_outlined,
                              label: tr('Cancelled at'),
                              child: Text(orderStatusLabel(r.cancelledAtStatus!, mode: r.orderMode)),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: PosSpacing.lg),
                    SectionLabel(tr('Amounts')),
                    PosInset(
                      child: Column(
                        children: [
                          MoneyRow(label: tr('Sales total'), amount: r.salesTotal),
                          if (r.deliveryFee > 0) MoneyRow(label: tr('Delivery fee'), amount: r.deliveryFee),
                          if (r.convenienceFee > 0) MoneyRow(label: tr('Convenience fee'), amount: r.convenienceFee),
                          MoneyRow(label: tr('Order total'), amount: r.orderTotal),
                          if ((r.additionalGatewayFee ?? 0) > 0)
                            MoneyRow(label: tr('Gateway fee (branch)'), amount: r.additionalGatewayFee!, negative: true),
                          Divider(color: c.border.withValues(alpha: 0.6)),
                          MoneyRow(
                            label: tr('Refund amount'),
                            hint: pct == null ? null : '${pct.toStringAsFixed(pct == pct.roundToDouble() ? 0 : 1)}%',
                            amount: r.status == RefundStatus.rejected ? 0 : (r.refundAmount ?? r.calculatedAmount),
                            emphasis: true,
                          ),
                        ],
                      ),
                    ),
                    if (r.adminNotes != null) ...[
                      const SizedBox(height: PosSpacing.lg),
                      SectionLabel(tr('Admin notes')),
                      PosInset(child: Text(r.adminNotes!, style: PosType.body.copyWith(color: c.text))),
                    ],
                    const SizedBox(height: PosSpacing.lg),
                    PosButton(
                      label: tr('View order'),
                      icon: Icons.receipt_long_outlined,
                      variant: PosButtonVariant.outline,
                      onPressed: () => AppRoutes.openOrder(context, r.orderKey, readOnly: true),
                    ),
                    if (processable) ...[
                      const SizedBox(height: PosSpacing.lg),
                      SectionLabel(tr('Process refund')),
                      TextField(
                        controller: _notes,
                        minLines: 2,
                        maxLines: 4,
                        maxLength: 2000,
                        decoration: InputDecoration(hintText: tr('Notes (required to reject)')),
                      ),
                      const SizedBox(height: PosSpacing.sm),
                      Row(
                        children: [
                          Expanded(
                            child: PosButton(
                              label: tr('Reject'),
                              icon: Icons.block_rounded,
                              variant: PosButtonVariant.danger,
                              loading: _busy,
                              onPressed: () => _decide(r, approve: false),
                            ),
                          ),
                          const SizedBox(width: PosSpacing.sm),
                          Expanded(
                            child: PosButton(
                              label: tr('Approve'),
                              icon: Icons.check_rounded,
                              variant: PosButtonVariant.success,
                              loading: _busy,
                              onPressed: () => _decide(r, approve: true),
                            ),
                          ),
                        ],
                      ),
                    ] else if (!widget.canProcess && r.status == RefundStatus.received) ...[
                      const SizedBox(height: PosSpacing.lg),
                      InlineNotice(message: tr('The branch processes this refund. You can view it only.'), tone: NoticeTone.info),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
