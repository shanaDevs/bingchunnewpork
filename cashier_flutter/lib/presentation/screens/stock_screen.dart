import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../domain/entities/stock.dart';
import '../../domain/logic/stock_rules.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/product_widgets.dart';
import '../components/sheets.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../state/auth_controller.dart';
import '../state/stock_controller.dart';
import '../theme/pos_theme.dart';

/// Branch Stock page with its own controller (bar tab or pushed from More).
class StockPage extends StatelessWidget {
  const StockPage({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.read<AppContainer>();
    final session = context.read<AuthController>().session!;
    return ChangeNotifierProvider(
      create: (_) => StockController(c.stockRepository, c.menuRepository, session),
      child: const StockScreen(),
    );
  }
}

/// Branch Stock — port of the web `/admin/stock` for cashiers. Stock changes
/// (receive, adjust, reset, sync) are branch-admin only on the backend, so the
/// cashier view is read-only, exactly like the web.
class StockScreen extends StatelessWidget {
  const StockScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<StockController>();
    return RefreshIndicator(
      onRefresh: () async {
        switch (ctrl.tab) {
          case StockTab.table:
            await ctrl.loadTable(silent: true);
          case StockTab.batches:
            await ctrl.loadBatches();
          case StockTab.movement:
            await ctrl.loadLedger();
        }
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.lg, PosSpacing.xxl),
        children: [
          PageHeader(
            title: tr('Branch Stock'),
            subtitle: ctrl.storeName.isEmpty ? null : ctrl.storeName,
            actions: [
              if (ctrl.pickStore && ctrl.stores.isNotEmpty)
                PosIconButton(
                  icon: Icons.storefront_outlined,
                  tooltip: tr('Branch'),
                  onPressed: () async {
                    final picked = await showOptionSheet<String>(
                      context,
                      title: tr('Branch'),
                      selected: ctrl.storeId,
                      options: [for (final s in ctrl.stores) (s.id, s.name)],
                    );
                    if (picked != null) ctrl.selectStore(picked);
                  },
                ),
            ],
          ),
          const SizedBox(height: PosSpacing.md),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            child: Row(
              children: [
                for (final (t, label, icon) in [
                  (StockTab.table, tr('Stock Table'), Icons.table_chart_outlined),
                  (StockTab.batches, tr('Batches'), Icons.layers_outlined),
                  (StockTab.movement, tr('Stock Movement'), Icons.history_rounded),
                ]) ...[
                  _PillTab(label: label, icon: icon, selected: ctrl.tab == t, onTap: () => ctrl.setTab(t)),
                  const SizedBox(width: 6),
                ],
              ],
            ),
          ),
          const SizedBox(height: PosSpacing.lg),
          if (ctrl.storeId == null && !ctrl.tableLoading)
            InlineNotice(message: tr('No branch is linked to this account.'), tone: NoticeTone.warning)
          else
            switch (ctrl.tab) {
              StockTab.table => _StockTableView(ctrl: ctrl),
              StockTab.batches => _BatchesView(ctrl: ctrl),
              StockTab.movement => _MovementView(ctrl: ctrl),
            },
        ],
      ),
    );
  }
}

/// Rounded tab pill (web `rounded-full bg-brand` tabs).
class _PillTab extends StatelessWidget {
  const _PillTab({required this.label, required this.selected, required this.onTap, this.icon});
  final String label;
  final IconData? icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final fg = selected ? Colors.white : c.textMuted;
    return Material(
      color: selected ? c.brand : c.surface,
      shape: StadiumBorder(side: BorderSide(color: selected ? c.brand : c.border.withValues(alpha: 0.6))),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 15, color: fg), const SizedBox(width: 6)],
              Text(label, style: PosType.bodyStrong.copyWith(color: fg, fontSize: 12.5)),
            ],
          ),
        ),
      ),
    );
  }
}

// ======================================================================
// Stock table
// ======================================================================

const _green = Color(0xFF10B981);
const _amber = Color(0xFFF59E0B);
const _red = Color(0xFFEF4444);
const _slate = Color(0xFF94A3B8);
const _violet = Color(0xFF8B5CF6);
const _indigo = Color(0xFF818CF8);

(String, Color) _statusInfo(StockStatus s) => switch (s) {
  StockStatus.branchInactive => (tr('Branch inactive'), _slate),
  StockStatus.comingSoon => (tr('Coming soon'), _indigo),
  StockStatus.outOfStock => (tr('Out of stock'), _red),
  StockStatus.lowStock => (tr('Low stock'), _amber),
  StockStatus.inStock => (tr('In stock'), _green),
};

class _StockTableView extends StatefulWidget {
  const _StockTableView({required this.ctrl});
  final StockController ctrl;

  @override
  State<_StockTableView> createState() => _StockTableViewState();
}

class _StockTableViewState extends State<_StockTableView> {
  late final _search = TextEditingController(text: widget.ctrl.search);

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = widget.ctrl;
    final c = context.pos;
    final kpi = ctrl.kpis;
    final rows = ctrl.tableRows;
    final categoryName = ctrl.categories.where((x) => x.slug == ctrl.categorySlug).map((x) => x.name).firstOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _KpiGrid(
          cards: [
            _Kpi(tr('Active'), kpi.active, tr('Products'), _green, Icons.shopping_bag_outlined),
            _Kpi(
              tr('Inactive'),
              kpi.inactive,
              tr('Products'),
              _slate,
              Icons.power_settings_new_rounded,
              onTap: () => ctrl.setLevel(StockLevel.inactive),
            ),
            _Kpi(tr('Low Stock'), kpi.lowStock, tr('Products'), _amber, Icons.warning_amber_rounded),
            _Kpi(tr('Out of Stock'), kpi.outOfStock, tr('Products'), _red, Icons.cancel_outlined),
            _Kpi(tr('All Products'), kpi.all, tr('Total'), _violet, Icons.grid_view_rounded),
          ],
        ),
        const SizedBox(height: PosSpacing.lg),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                onSubmitted: ctrl.setSearch,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: tr('Search products...'),
                  prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: Icon(Icons.close_rounded, size: 18, color: c.textMuted),
                          onPressed: () {
                            _search.clear();
                            ctrl.setSearch('');
                          },
                        ),
                ),
              ),
            ),
            const SizedBox(width: PosSpacing.sm),
            SizedBox(
              width: 110,
              child: PosButton(label: tr('Find'), height: 46, onPressed: () => ctrl.setSearch(_search.text)),
            ),
          ],
        ),
        const SizedBox(height: PosSpacing.sm),
        Align(
          alignment: Alignment.centerLeft,
          child: FilterPill(
            icon: Icons.category_outlined,
            label: categoryName ?? tr('All Categories'),
            active: ctrl.categorySlug != null,
            onTap: () async {
              final picked = await showOptionSheet<String>(
                context,
                title: tr('Category'),
                selected: ctrl.categorySlug ?? '',
                options: [('', tr('All Categories')), for (final x in ctrl.categories) (x.slug, x.name)],
              );
              if (picked != null) ctrl.setCategory(picked.isEmpty ? null : picked);
            },
          ),
        ),
        const SizedBox(height: PosSpacing.md),
        if (ctrl.search.isEmpty) ...[
          _LevelTabs(ctrl: ctrl, counts: kpi.levelCounts),
          const SizedBox(height: PosSpacing.md),
        ],
        if (ctrl.tableLoading && ctrl.items.isEmpty)
          LoadingView(message: tr('Loading stock…'))
        else if (ctrl.tableError != null && ctrl.items.isEmpty)
          ErrorView(message: ctrl.tableError!, onRetry: ctrl.loadTable)
        else if (rows.isEmpty)
          EmptyView(
            message: ctrl.search.isNotEmpty ? tr('No products match your search') : tr('No products in this list'),
            icon: Icons.inventory_2_outlined,
          )
        else
          ResponsiveGrid(
            minItemWidth: 360,
            children: [
              for (final item in rows)
                _StockRow(
                  item: item,
                  expanded: ctrl.expandedProductId == item.productId,
                  batches: ctrl.batchesFor(item.productId),
                  batchesLoading: ctrl.productBatchesLoading && ctrl.expandedProductId == item.productId,
                  onTap: () => ctrl.toggleExpanded(item),
                ),
            ],
          ),
      ],
    );
  }
}

class _Kpi {
  const _Kpi(this.label, this.count, this.suffix, this.color, this.icon, {this.onTap});
  final String label;
  final int count;
  final String suffix;
  final Color color;
  final IconData icon;
  final VoidCallback? onTap;
}

/// Two-up KPI cards on phones, five-up on tablets (web `grid-cols-2 lg:grid-cols-5`).
class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.cards});
  final List<_Kpi> cards;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return LayoutBuilder(
      builder: (context, box) {
        final cols = box.maxWidth >= Breakpoints.tablet ? cards.length : 2;
        final w = (box.maxWidth - (cols - 1) * PosSpacing.sm) / cols;
        return Wrap(
          spacing: PosSpacing.sm,
          runSpacing: PosSpacing.sm,
          children: [
            for (final k in cards)
              SizedBox(
                width: w,
                child: PosCard(
                  onTap: k.onTap,
                  padding: const EdgeInsets.all(PosSpacing.md),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: k.color.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(PosRadius.button),
                        ),
                        child: Icon(k.icon, size: 18, color: k.color),
                      ),
                      const SizedBox(width: PosSpacing.sm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              k.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5),
                            ),
                            Text.rich(
                              TextSpan(
                                text: formatCount(k.count),
                                style: PosType.amount.copyWith(color: c.text, fontSize: 18),
                                children: [
                                  TextSpan(
                                    text: ' ${k.suffix}',
                                    style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11),
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
              ),
          ],
        );
      },
    );
  }
}

class _LevelTabs extends StatelessWidget {
  const _LevelTabs({required this.ctrl, required this.counts});
  final StockController ctrl;
  final Map<StockLevel, int> counts;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final tabs = [
      (StockLevel.newProducts, tr('New Products'), _indigo),
      (StockLevel.inStock, tr('In Stock'), _green),
      (StockLevel.lowStock, tr('Low Stock'), _amber),
      (StockLevel.outOfStock, tr('Out of Stock'), _red),
      (StockLevel.inactive, tr('Inactive'), _slate),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Row(
        children: [
          for (final (level, label, color) in tabs) ...[
            Material(
              color: ctrl.level == level ? color : c.card,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(PosRadius.button),
                side: BorderSide(color: ctrl.level == level ? color : c.border.withValues(alpha: 0.7)),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(PosRadius.button),
                onTap: () => ctrl.setLevel(level),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(
                    children: [
                      Text(
                        label,
                        style: PosType.bodyStrong.copyWith(
                          fontSize: 12.5,
                          color: ctrl.level == level ? Colors.white : c.text,
                        ),
                      ),
                      const SizedBox(width: 6),
                      CountBubble(
                        count: counts[level] ?? 0,
                        color: color,
                        active: ctrl.level == level,
                        alert: level == StockLevel.lowStock || level == StockLevel.outOfStock
                            ? (counts[level] ?? 0) > 0
                            : false,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 6),
          ],
        ],
      ),
    );
  }
}

class _StockRow extends StatelessWidget {
  const _StockRow({
    required this.item,
    required this.expanded,
    required this.batches,
    required this.batchesLoading,
    required this.onTap,
  });

  final StockItem item;
  final bool expanded;
  final List<StockBatch>? batches;
  final bool batchesLoading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final inactive = isBranchInactive(item);
    final (statusText, statusColor) = _statusInfo(stockStatus(item));
    final onHand = inactive ? item.frozenQty : item.onHandQty;
    final batchCount = inactive ? item.frozenBatchCount : item.batchCount;
    return PosCard(
      onTap: onTap,
      padding: const EdgeInsets.all(PosSpacing.md),
      borderColor: expanded ? c.brand.withValues(alpha: 0.5) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(PosRadius.sm),
                  border: Border.all(color: c.border.withValues(alpha: 0.7)),
                ),
                child: ProductImage(url: item.imageUrl, size: 44, contain: true, radius: 6),
              ),
              const SizedBox(width: PosSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5)),
                    Text(
                      '${item.categoryName} · ${formatMoney(item.basePrice)}',
                      style: PosType.caption.copyWith(color: c.textMuted),
                    ),
                    if (inactive) ...[const SizedBox(height: 4), PosBadge(label: tr('Branch Inactive'), color: _slate)],
                  ],
                ),
              ),
              Icon(expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: c.textMuted),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          Row(
            children: [
              Expanded(
                child: _Metric(
                  label: tr('On Hand'),
                  footer: Text(
                    statusText,
                    style: PosType.caption.copyWith(color: statusColor, fontWeight: FontWeight.w600),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        formatCount(onHand),
                        style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular),
                      ),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          '(${trn(batchCount, '{n} batch', '{n} batches')})',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: _Metric(
                  label: tr('Weekly Target'),
                  child: item.weeklyTargetQty == 0
                      ? Text(
                          tr('Not set'),
                          style: PosType.caption.copyWith(color: c.warningText, fontWeight: FontWeight.w600),
                        )
                      : Text.rich(
                          TextSpan(
                            text: formatCount(item.weeklyTargetQty),
                            style: PosType.bodyStrong.copyWith(color: c.text),
                            children: [
                              TextSpan(
                                text: '  ${tr('({n} recv.)', {'n': item.weeklyReceivedQty})}',
                                style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11),
                              ),
                            ],
                          ),
                        ),
                ),
              ),
            ],
          ),
          if (expanded) ...[
            Divider(height: PosSpacing.xl, color: c.border.withValues(alpha: 0.6)),
            if (batchesLoading)
              const Padding(padding: EdgeInsets.all(PosSpacing.md), child: LoadingView())
            else if ((batches ?? const []).isEmpty)
              Text(tr('No batches for this product'), style: PosType.caption.copyWith(color: c.textMuted))
            else
              for (final b in batches!) _BatchLine(batch: b),
          ],
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.child, this.footer});
  final String label;
  final Widget child;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: PosType.label.copyWith(color: c.textMuted, fontSize: 9.5)),
        const SizedBox(height: 2),
        child,
        ?footer,
      ],
    );
  }
}

Color _batchStatusColor(BuildContext context, StockBatch b) {
  final c = context.pos;
  if (b.status == 'WRITTEN_OFF') return c.dangerText;
  if (b.status == 'DEPLETED') return _slate;
  if (isLowRemaining(b)) return c.warningText;
  return c.successText;
}

String _batchStatusLabel(StockBatch b) {
  if (b.status == 'WRITTEN_OFF') return tr('Written off');
  if (b.status == 'DEPLETED') return tr('Depleted');
  if (isLowRemaining(b)) return tr('Low remaining');
  return tr('Active');
}

Widget _batchTypeBadge(String? type) => type == 'EMERGENCY'
    ? PosBadge(label: tr('Emergency'), color: _amber)
    : PosBadge(label: tr('Reset'), color: _violet);

/// Compact batch row used in the expanded product and the ledger.
class _BatchLine extends StatelessWidget {
  const _BatchLine({required this.batch, this.showProduct = false});
  final StockBatch batch;
  final bool showProduct;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final b = batch;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        b.batchNumber,
                        overflow: TextOverflow.ellipsis,
                        style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5, fontFamily: 'monospace'),
                      ),
                    ),
                    const SizedBox(width: 6),
                    _batchTypeBadge(b.batchType),
                  ],
                ),
                Text(
                  [
                    if (showProduct && b.productName != null) b.productName!,
                    formatShortDateTime(b.receivedAt),
                    if (b.unitCost != null) formatMoney(b.unitCost!),
                  ].join(' · '),
                  style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${formatCount(b.remainingQty)} / ${formatCount(b.receivedQty)}',
                style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5, fontFeatures: PosType.tabular),
              ),
              PosBadge(label: _batchStatusLabel(b), color: _batchStatusColor(context, b)),
            ],
          ),
        ],
      ),
    );
  }
}

// ======================================================================
// Batches
// ======================================================================

class _BatchesView extends StatefulWidget {
  const _BatchesView({required this.ctrl});
  final StockController ctrl;

  @override
  State<_BatchesView> createState() => _BatchesViewState();
}

class _BatchesViewState extends State<_BatchesView> {
  late final _search = TextEditingController(text: widget.ctrl.batchSearch);

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = widget.ctrl;
    final c = context.pos;
    final all = ctrl.batches ?? const <StockBatch>[];
    final active = all.where((b) => b.status == 'ACTIVE').toList();
    final rows = ctrl.visibleBatches;
    final productName = ctrl.items.where((i) => i.productId == ctrl.batchProductId).map((i) => i.name).firstOrNull;

    String statusLabel(BatchStatusFilter s) => switch (s) {
      BatchStatusFilter.all => tr('All statuses'),
      BatchStatusFilter.active => tr('Active'),
      BatchStatusFilter.depleted => tr('Depleted'),
      BatchStatusFilter.writtenOff => tr('Written off'),
    };
    String typeLabel(BatchTypeFilter t) => switch (t) {
      BatchTypeFilter.all => tr('All types'),
      BatchTypeFilter.reset => tr('Reset'),
      BatchTypeFilter.emergency => tr('Emergency'),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _KpiGrid(
          cards: [
            _Kpi(tr('Active batches'), active.length, '', c.brand, Icons.layers_outlined),
            _Kpi(
              tr('Units remaining'),
              active.fold(0, (s, b) => s + b.remainingQty),
              '',
              _green,
              Icons.inventory_2_outlined,
            ),
            _Kpi(tr('Low remaining'), active.where(isLowRemaining).length, '', _amber, Icons.warning_amber_rounded),
            _Kpi(
              tr('Written off'),
              all.where((b) => b.status == 'WRITTEN_OFF').length,
              '',
              _red,
              Icons.delete_outline_rounded,
            ),
          ],
        ),
        const SizedBox(height: PosSpacing.lg),
        TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          onChanged: (v) => ctrl.setBatchFilters(search: v),
          decoration: InputDecoration(
            hintText: tr('Search product or batch number...'),
            prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
          ),
        ),
        const SizedBox(height: PosSpacing.sm),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: Row(
            children: [
              FilterPill(
                icon: Icons.flag_outlined,
                label: statusLabel(ctrl.batchStatus),
                active: ctrl.batchStatus != BatchStatusFilter.active,
                onTap: () async {
                  final v = await showOptionSheet<BatchStatusFilter>(
                    context,
                    title: tr('Status'),
                    selected: ctrl.batchStatus,
                    options: [for (final s in BatchStatusFilter.values) (s, statusLabel(s))],
                  );
                  if (v != null) ctrl.setBatchFilters(status: v);
                },
              ),
              const SizedBox(width: PosSpacing.sm),
              FilterPill(
                icon: Icons.label_outline_rounded,
                label: typeLabel(ctrl.batchType),
                active: ctrl.batchType != BatchTypeFilter.all,
                onTap: () async {
                  final v = await showOptionSheet<BatchTypeFilter>(
                    context,
                    title: tr('Type'),
                    selected: ctrl.batchType,
                    options: [for (final t in BatchTypeFilter.values) (t, typeLabel(t))],
                  );
                  if (v != null) ctrl.setBatchFilters(type: v);
                },
              ),
              const SizedBox(width: PosSpacing.sm),
              FilterPill(
                icon: Icons.local_cafe_outlined,
                label: productName ?? tr('All products'),
                active: ctrl.batchProductId != null,
                onTap: () async {
                  final v = await showOptionSheet<String>(
                    context,
                    title: tr('Product'),
                    selected: ctrl.batchProductId ?? '',
                    options: [('', tr('All products')), for (final i in ctrl.items) (i.productId, i.name)],
                  );
                  if (v != null) {
                    v.isEmpty ? ctrl.setBatchFilters(clearProduct: true) : ctrl.setBatchFilters(productId: v);
                  }
                },
              ),
              const SizedBox(width: PosSpacing.sm),
              FilterPill(
                icon: Icons.swap_vert_rounded,
                label: ctrl.batchOldestFirst ? tr('Oldest first') : tr('Newest first'),
                onTap: () => ctrl.setBatchFilters(oldestFirst: !ctrl.batchOldestFirst),
              ),
              const SizedBox(width: PosSpacing.sm),
              TextButton(
                onPressed: () {
                  _search.clear();
                  ctrl.resetBatchFilters();
                },
                child: Text(tr('Reset')),
              ),
            ],
          ),
        ),
        const SizedBox(height: PosSpacing.md),
        if (ctrl.batchesLoading && ctrl.batches == null)
          LoadingView(message: tr('Loading batches…'))
        else if (ctrl.batchesError != null && ctrl.batches == null)
          ErrorView(message: ctrl.batchesError!, onRetry: ctrl.loadBatches)
        else if (rows.isEmpty)
          EmptyView(message: tr('No batches match these filters'), icon: Icons.layers_outlined)
        else ...[
          Text(
            tr('Showing {n} of {total} batches', {'n': rows.length, 'total': all.length}),
            style: PosType.caption.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: PosSpacing.sm),
          ResponsiveGrid(minItemWidth: 360, children: [for (final b in rows) _BatchCard(batch: b)]),
        ],
      ],
    );
  }
}

class _BatchCard extends StatelessWidget {
  const _BatchCard({required this.batch});
  final StockBatch batch;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final b = batch;
    final ratio = b.receivedQty <= 0 ? 0.0 : (b.remainingQty / b.receivedQty).clamp(0.0, 1.0);
    final color = _batchStatusColor(context, b);
    return PosCard(
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ProductImage(url: b.productImageUrl, size: 36, contain: true),
              const SizedBox(width: PosSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.productName ?? '—', style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5)),
                    Text(
                      b.batchNumber,
                      style: PosType.caption.copyWith(color: c.textMuted, fontFamily: 'monospace', fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _batchTypeBadge(b.batchType),
                  const SizedBox(height: 4),
                  PosBadge(label: _batchStatusLabel(b), color: color),
                ],
              ),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          Row(
            children: [
              Expanded(
                child: _Metric(
                  label: tr('Received date'),
                  child: Text(formatShortDateTime(b.receivedAt), style: PosType.caption.copyWith(color: c.text)),
                ),
              ),
              Expanded(
                child: _Metric(
                  label: tr('Received qty'),
                  child: Text(formatCount(b.receivedQty), style: PosType.bodyStrong.copyWith(color: c.text)),
                ),
              ),
              Expanded(
                child: _Metric(
                  label: tr('Unit cost'),
                  child: Text(
                    b.unitCost == null ? '—' : formatMoney(b.unitCost!),
                    style: PosType.caption.copyWith(color: c.text),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          Row(
            children: [
              Text(tr('Remaining'), style: PosType.caption.copyWith(color: c.textMuted)),
              const Spacer(),
              Text(
                '${formatCount(b.remainingQty)} / ${formatCount(b.receivedQty)}',
                style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5, fontFeatures: PosType.tabular),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(PosRadius.pill),
            child: LinearProgressIndicator(value: ratio, minHeight: 6, color: color, backgroundColor: c.surface),
          ),
        ],
      ),
    );
  }
}

// ======================================================================
// Stock movement
// ======================================================================

class _MovementView extends StatelessWidget {
  const _MovementView({required this.ctrl});
  final StockController ctrl;

  Future<void> _pickRange(BuildContext context) async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(DateTime.now().year - 3),
      lastDate: DateTime.now(),
      initialDateRange: DateTimeRange(start: ctrl.from, end: ctrl.to),
    );
    if (range != null) ctrl.setRange(range.start, range.end);
  }

  @override
  Widget build(BuildContext context) {
    final productWise = ctrl.movementTab == MovementTab.productWise;
    final product = ctrl.ledgerProduct;
    final rangeLabel = '${formatShortDate(ctrl.from)} – ${formatShortDate(ctrl.to)}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            _PillTab(
              label: tr('Product-wise Ledger'),
              icon: Icons.inventory_2_outlined,
              selected: productWise,
              onTap: () => ctrl.setMovementTab(MovementTab.productWise),
            ),
            const SizedBox(width: 6),
            _PillTab(
              label: tr('All Products'),
              icon: Icons.history_rounded,
              selected: !productWise,
              onTap: () => ctrl.setMovementTab(MovementTab.allProducts),
            ),
          ],
        ),
        const SizedBox(height: PosSpacing.md),
        Wrap(
          spacing: PosSpacing.sm,
          runSpacing: PosSpacing.sm,
          children: [
            FilterPill(
              icon: Icons.date_range_rounded,
              label: rangeLabel,
              active: true,
              onTap: () => _pickRange(context),
            ),
            if (productWise)
              FilterPill(
                icon: Icons.local_cafe_outlined,
                label: product?.name ?? tr('Select product'),
                active: product != null,
                onTap: () async {
                  final v = await showOptionSheet<String>(
                    context,
                    title: tr('Product'),
                    selected: ctrl.ledgerProductId,
                    options: [for (final i in ctrl.items) (i.productId, i.name)],
                  );
                  if (v != null) ctrl.setLedgerProduct(v);
                },
              ),
          ],
        ),
        if (productWise && product != null) ...[
          const SizedBox(height: PosSpacing.md),
          Row(
            children: [
              Expanded(
                child: _PriceCard(
                  label: tr('Unit cost'),
                  value: ctrl.ledgerLoading ? null : (ctrl.pricing?.unitCost ?? product.cost),
                  hint: ctrl.pricing != null && ctrl.pricing!.batchesInRange > 0
                      ? tr('{n} units received · {range}', {'n': ctrl.pricing!.receivedQtyInRange, 'range': rangeLabel})
                      : tr('Catalog cost'),
                ),
              ),
              const SizedBox(width: PosSpacing.sm),
              Expanded(
                child: _PriceCard(
                  label: tr('Selling price'),
                  value: ctrl.ledgerLoading ? null : (ctrl.pricing?.sellingPrice ?? product.basePrice),
                  hint: tr('Per unit'),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: PosSpacing.md),
        if (productWise && product == null)
          EmptyView(message: tr('Select a product to view its stock ledger.'), icon: Icons.inventory_2_outlined)
        else if (ctrl.ledgerLoading && ctrl.ledger == null)
          LoadingView(message: tr('Loading ledger…'))
        else if (ctrl.ledgerError != null)
          ErrorView(message: ctrl.ledgerError!, onRetry: ctrl.loadLedger)
        else if (ctrl.ledger == null)
          EmptyView(message: tr('No ledger data'), icon: Icons.history_rounded)
        else
          _LedgerTable(ledger: ctrl.ledger!, showProduct: !productWise),
      ],
    );
  }
}

class _PriceCard extends StatelessWidget {
  const _PriceCard({required this.label, required this.value, required this.hint});
  final String label;
  final double? value;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return PosCard(
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: PosType.caption.copyWith(color: c.textMuted)),
          value == null
              ? const SkeletonBox(height: 18, width: 80)
              : Text(formatMoney(value!), style: PosType.amount.copyWith(color: c.text, fontSize: 17)),
          Text(hint, maxLines: 2, style: PosType.caption.copyWith(color: c.textSoft, fontSize: 10.5)),
        ],
      ),
    );
  }
}

/// Day-by-day ledger as a sideways-scrolling table (web LedgerTable). Days with
/// batches expand to list them.
class _LedgerTable extends StatefulWidget {
  const _LedgerTable({required this.ledger, required this.showProduct});
  final StockLedger ledger;
  final bool showProduct;

  @override
  State<_LedgerTable> createState() => _LedgerTableState();
}

class _LedgerTableState extends State<_LedgerTable> {
  final Set<String> _expanded = {};
  bool _onlyMovement = false;

  static const _widths = [170.0, 80.0, 90.0, 70.0, 70.0, 90.0, 90.0, 80.0, 90.0, 90.0, 150.0];

  String _qty(num? v) => v == null ? '—' : formatCount(v);
  String _lkr(num? v) => v == null ? '—' : formatCount(v);
  String _date(String ymd) {
    final d = DateTime.tryParse(ymd);
    return d == null ? ymd : formatShortDate(d);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final l = widget.ledger;
    final headers = [
      tr('Date'),
      tr('Open Stock'),
      tr('Stock Value'),
      tr('Stock In'),
      tr('Stock Out'),
      tr('LKR In'),
      tr('LKR Out'),
      tr('Stock Margin'),
      tr('LKR Margin'),
      tr('Discount (LKR)'),
      tr('Batch Number'),
    ];
    final total = _widths.fold<double>(0, (s, w) => s + w);
    final rows = _onlyMovement ? l.rows.where((r) => r.hasMovement).toList() : l.rows;

    Widget line(List<String> cells, {TextStyle? style, Color? bg, VoidCallback? onTap, Widget? lead}) {
      final s = style ?? PosType.caption.copyWith(color: c.text, fontSize: 12, fontFeatures: PosType.tabular);
      return InkWell(
        onTap: onTap,
        child: Container(
          color: bg,
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              for (var i = 0; i < cells.length; i++)
                SizedBox(
                  width: _widths[i],
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: i == 0 && lead != null
                        ? Row(
                            children: [
                              lead,
                              const SizedBox(width: 2),
                              Expanded(child: Text(cells[i], style: s)),
                            ],
                          )
                        : Text(cells[i], style: s, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ),
                ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                tr('Swipe sideways to see every column.'),
                style: PosType.caption.copyWith(color: c.textSoft, fontSize: 11),
              ),
            ),
            Text(tr('Only days with movement'), style: PosType.caption.copyWith(color: c.textMuted)),
            Switch(value: _onlyMovement, onChanged: (v) => setState(() => _onlyMovement = v)),
          ],
        ),
        PosCard(
          padding: EdgeInsets.zero,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: total,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  line(
                    headers,
                    bg: c.surface,
                    style: PosType.label.copyWith(color: c.textMuted, fontSize: 10, letterSpacing: 0.3),
                  ),
                  line(
                    [
                      '${tr('Opening Balance')} (${_date(l.opening.date)})',
                      _qty(l.opening.stock),
                      _lkr(l.opening.value),
                      '—',
                      '—',
                      '—',
                      '—',
                      '—',
                      _lkr(l.opening.lkrMargin),
                      '—',
                      '—',
                    ],
                    bg: c.surface.withValues(alpha: 0.5),
                    style: PosType.caption.copyWith(color: c.text, fontWeight: FontWeight.w600, fontSize: 12),
                  ),
                  for (final r in rows) ...[
                    Divider(height: 1, color: c.border.withValues(alpha: 0.5)),
                    line(
                      [
                        _date(r.date),
                        _qty(r.openStock),
                        _lkr(r.stockValue),
                        _qty(r.stockIn),
                        _qty(r.stockOut),
                        _lkr(r.lkrIn),
                        _lkr(r.lkrOut),
                        _qty(r.stockMargin),
                        _lkr(r.lkrMargin),
                        _lkr(r.discountTotal),
                        r.batchNumbers ?? '—',
                      ],
                      lead: r.batches.isEmpty
                          ? null
                          : Icon(
                              _expanded.contains(r.date) ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                              size: 16,
                              color: c.brand,
                            ),
                      onTap: r.batches.isEmpty
                          ? null
                          : () => setState(
                              () => _expanded.contains(r.date) ? _expanded.remove(r.date) : _expanded.add(r.date),
                            ),
                    ),
                    if (_expanded.contains(r.date))
                      Container(
                        width: total,
                        color: c.brandSubtle.withValues(alpha: 0.3),
                        padding: const EdgeInsets.symmetric(horizontal: PosSpacing.md, vertical: 4),
                        child: Column(
                          children: [for (final b in r.batches) _BatchLine(batch: b, showProduct: widget.showProduct)],
                        ),
                      ),
                  ],
                  Divider(height: 1, color: c.border.withValues(alpha: 0.5)),
                  line(
                    [
                      '${tr('Brought Forward')} (${_date(l.broughtForward.date)})',
                      _qty(l.broughtForward.stock),
                      _lkr(l.broughtForward.value),
                      '',
                      '',
                      '',
                      '',
                      _qty(l.broughtForward.stock),
                      _lkr(l.broughtForward.lkrMargin),
                      '—',
                      '—',
                    ],
                    bg: c.surface.withValues(alpha: 0.5),
                    style: PosType.caption.copyWith(color: c.text, fontWeight: FontWeight.w700, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
