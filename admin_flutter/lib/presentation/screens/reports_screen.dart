import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/exporter.dart';
import '../../core/format.dart';
import '../../data/json.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/menu.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/pos_app_bar.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../reports/report_defs.dart';
import '../state/auth_controller.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

/// Reports hub — port of the web `/admin/reports` (super admin) and
/// `/admin/branch-reports` (branch admin): Sales, Payments and Orders sections,
/// each report exported as CSV or PDF.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  ReportGroup _group = ReportGroup.sales;

  @override
  Widget build(BuildContext context) {
    final session = context.read<AuthController>().session!;
    final reports = reportsFor(superAdmin: session.isSuperAdmin).where((r) => r.groupFor(session.isSuperAdmin) == _group);
    final c = context.pos;
    return ListView(
      padding: centeredPadding(context, maxWidth: 1400),
      children: [
        PageHeader(
          title: tr('Reports'),
          subtitle: session.isSuperAdmin
              ? tr('Super admin report hub — export any report as CSV or PDF.')
              : tr('Branch reports for {branch} — export as CSV or PDF.', {'branch': session.branchLabel ?? ''}),
        ),
        const SizedBox(height: PosSpacing.md),
        PillTabs<ReportGroup>(
          items: [
            (ReportGroup.sales, tr('Sales'), Icons.auto_awesome_outlined, null),
            (ReportGroup.payments, tr('Payments'), Icons.account_balance_wallet_outlined, null),
            (ReportGroup.orders, tr('Orders'), Icons.inventory_2_outlined, null),
          ],
          selected: _group,
          onSelect: (g) => setState(() => _group = g),
        ),
        const SizedBox(height: PosSpacing.sm),
        Text(reportGroupHint(_group), style: PosType.caption.copyWith(color: c.textMuted)),
        const SizedBox(height: PosSpacing.md),
        ResponsiveGrid(
          minItemWidth: 340,
          children: [
            for (final r in reports)
              PosCard(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => ReportViewScreen(report: r, session: session)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(12)),
                      child: Icon(_icon(r.id), color: c.brand),
                    ),
                    const SizedBox(width: PosSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r.title, style: PosType.bodyStrong.copyWith(color: c.text)),
                          const SizedBox(height: 2),
                          Text(r.description, style: PosType.caption.copyWith(color: c.textMuted)),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: c.textMuted),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }

  IconData _icon(String id) => switch (id) {
    'branch-performance' => Icons.storefront_outlined,
    'product-performance' => Icons.local_cafe_outlined,
    'high-value-customers' => Icons.workspace_premium_outlined,
    'customer-loyalty' => Icons.favorite_border_rounded,
    'global-overview' => Icons.public_rounded,
    'wallet-ledger' => Icons.account_balance_wallet_outlined,
    'branch-settlement' => Icons.payments_outlined,
    'order-lifecycle' => Icons.timeline_rounded,
    'order-fulfillment' => Icons.speed_rounded,
    'order-cancellations' => Icons.cancel_outlined,
    'low-stock' => Icons.inventory_outlined,
    _ => Icons.description_outlined,
  };
}

/// One report: period + branch filters, summary chips, the table and exports.
class ReportViewScreen extends StatefulWidget {
  const ReportViewScreen({super.key, required this.report, required this.session});
  final ReportDef report;
  final AdminSession session;

  @override
  State<ReportViewScreen> createState() => _ReportViewScreenState();
}

class _ReportViewScreenState extends State<ReportViewScreen> {
  PeriodFilter _period = const PeriodFilter.month();
  String? _storeId;
  List<StoreOption> _stores = const [];
  late final Loadable<Object?> _data = Loadable(_fetch);

  ReportDef get _r => widget.report;
  bool get _super => widget.session.isSuperAdmin;

  @override
  void initState() {
    super.initState();
    if (_super) {
      context.read<AppContainer>().menuRepository.stores().then((s) {
        if (mounted) setState(() => _stores = s);
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    _data.dispose();
    super.dispose();
  }

  Future<Object?> _fetch() {
    final repo = context.read<AppContainer>().adminRepository;
    // Branch admins are scoped by the server; Low Stock needs the branch id explicitly.
    final store = _super ? _storeId : (_r.needsStore ? widget.session.storeId : null);
    return repo.report(_r.path, _r.params(_period, storeId: store));
  }

  String get _scopeLabel {
    if (!_super) return widget.session.branchLabel ?? tr('This branch');
    if (_storeId == null) return tr('All branches');
    return shortBranch(_stores.where((s) => s.id == _storeId).firstOrNull?.name);
  }

  String get _periodText => _r.range == ReportRange.none ? tr('Current stock') : periodLabel(_period);

  Future<void> _pickStore() async {
    final picked = await showOptionSheet<String>(
      context,
      title: tr('Branch'),
      selected: _storeId ?? '',
      options: [('', tr('All branches')), for (final s in _stores) (s.id, shortBranch(s.name))],
    );
    if (picked == null) return;
    setState(() => _storeId = picked.isEmpty ? null : picked);
    _data.load();
  }

  Future<void> _export({required bool pdf}) async {
    final data = _data.data;
    if (data == null) return;
    final rows = _r.rows(data);
    final cols = _r.columns;
    final stamp = formatYmd(DateTime.now());
    try {
      if (pdf) {
        await Exporter.sharePdf(
          context,
          filename: '${_r.id}-$stamp',
          title: _r.title,
          subtitle: '$_scopeLabel · $_periodText',
          headers: [for (final c in cols) c.label],
          rows: [
            for (final (i, row) in rows.indexed) [for (final c in cols) c.cell(row, i)],
          ],
          summary: _r.summary?.call(data, rows) ?? const [],
          numericColumns: {for (final (i, c) in cols.indexed) if (c.numeric) i},
        );
      } else {
        await Exporter.shareCsv(
          context,
          filename: '${_r.id}-$stamp',
          headers: [for (final c in cols) c.label],
          rows: [
            for (final (i, row) in rows.indexed) [for (final c in cols) (c.csv ?? c.cell)(row, i)],
          ],
        );
      }
    } catch (e) {
      if (mounted) showPosSnack(context, tr('Export failed: {e}', {'e': e}), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Scaffold(
      appBar: PosAppBar(title: _r.title, eyebrow: tr('Report')),
      body: ListenableBuilder(
        listenable: _data,
        builder: (context, _) {
          final data = _data.data;
          final rows = data == null ? const <Json>[] : _r.rows(data);
          return RefreshIndicator(
            onRefresh: () => _data.load(silent: true),
            child: ListView(
              padding: centeredPadding(context, maxWidth: 1400),
              children: [
                Text(_r.description, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 12.5)),
                const SizedBox(height: PosSpacing.md),
                Wrap(
                  spacing: PosSpacing.sm,
                  runSpacing: PosSpacing.sm,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (_r.range != ReportRange.none)
                      PeriodFilterPill(
                        value: _period,
                        onChanged: (p) {
                          setState(() => _period = p);
                          _data.load();
                        },
                      ),
                    if (_super)
                      FilterPill(
                        label: _scopeLabel,
                        icon: Icons.storefront_outlined,
                        active: _storeId != null,
                        onTap: _pickStore,
                      ),
                    PosButton(
                      label: tr('CSV'),
                      icon: Icons.table_view_outlined,
                      variant: PosButtonVariant.outline,
                      expand: false,
                      height: 38,
                      onPressed: data == null ? null : () => _export(pdf: false),
                    ),
                    PosButton(
                      label: tr('PDF'),
                      icon: Icons.picture_as_pdf_outlined,
                      expand: false,
                      height: 38,
                      onPressed: data == null ? null : () => _export(pdf: true),
                    ),
                  ],
                ),
                const SizedBox(height: PosSpacing.md),
                if (data != null && _r.summary != null) ...[
                  Wrap(
                    spacing: PosSpacing.sm,
                    runSpacing: PosSpacing.sm,
                    children: [
                      for (final (label, value) in _r.summary!(data, rows))
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: c.brandSubtle,
                            borderRadius: BorderRadius.circular(PosRadius.button),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(label, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
                              Text(value, style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular)),
                            ],
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: PosSpacing.md),
                ],
                PosCard(
                  padding: const EdgeInsets.all(PosSpacing.sm),
                  child: data == null
                      ? (_data.error != null
                            ? ErrorView(message: _data.error!, onRetry: _data.load)
                            : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView()))
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_data.loading) const LinearProgressIndicator(minHeight: 2),
                            Padding(
                              padding: const EdgeInsets.all(PosSpacing.sm),
                              child: Text(
                                tr('Live report · {n} rows · {scope} · {period}', {
                                  'n': formatCount(rows.length),
                                  'scope': _scopeLabel,
                                  'period': _periodText,
                                }),
                                style: PosType.caption.copyWith(color: c.textMuted),
                              ),
                            ),
                            SimpleTable(
                              columns: [for (final col in _r.columns) TableCol(col.label, flex: col.flex, numeric: col.numeric)],
                              rows: [
                                for (final (i, row) in rows.indexed) [for (final col in _r.columns) col.cell(row, i)],
                              ],
                            ),
                          ],
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
