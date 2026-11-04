import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../domain/entities/menu.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_rules.dart';
import '../../l10n/l10n.dart';
import '../components/pos_app_bar.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/product_widgets.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../state/order_edit_controller.dart';
import '../theme/pos_theme.dart';

/// Edit order / Add items — port of the web AdminOrderEditModal. Pops the updated order.
class OrderEditScreen extends StatelessWidget {
  const OrderEditScreen({super.key, required this.order, required this.mode});
  final OrderDetail order;
  final OrderEditMode mode;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) {
        final c = ctx.read<AppContainer>();
        return OrderEditController(c.menuRepository, c.orderRepository, order, mode);
      },
      child: const _OrderEditView(),
    );
  }
}

class _OrderEditView extends StatelessWidget {
  const _OrderEditView();

  Future<void> _save(BuildContext context, OrderEditController ctrl) async {
    try {
      final updated = await ctrl.save();
      if (!context.mounted) return;
      showPosSnack(context, tr('Order updated'), kind: PosSnackKind.success);
      Navigator.of(context).pop(updated);
    } catch (e) {
      if (context.mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  Future<void> _pickProduct(BuildContext context, OrderEditController ctrl, Product p) async {
    if (p.availableToppings.isEmpty) {
      ctrl.addProduct(p, const [], 1);
      showPosSnack(context, tr('{name} added', {'name': p.name}), kind: PosSnackKind.success);
      return;
    }
    final result = await showPosSheet<(List<Topping>, int)>(context, builder: (_) => _ProductAddSheet(product: p));
    if (result != null) ctrl.addProduct(p, result.$1, result.$2);
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<OrderEditController>();
    final c = context.pos;
    final addOnly = ctrl.mode == OrderEditMode.addOnly;
    return Scaffold(
      appBar: PosAppBar(
        title: addOnly ? tr('Add items') : tr('Edit order'),
        eyebrow: '#${ctrl.order.orderNumber}',
      ),
      body: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: centeredPadding(context, top: PosSpacing.sm, bottom: 0),
            sliver: SliverList.list(
              children: [
                if (addOnly)
                  InlineNotice(
                    message: tr('Paid order — you can add items; the extra amount is collected at the counter.'),
                    tone: NoticeTone.info,
                  ),
                if (addOnly) const SizedBox(height: PosSpacing.md),
                SectionLabel(tr('Order items')),
                PosCard(
                  padding: EdgeInsets.zero,
                  child: ctrl.lines.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.all(PosSpacing.lg),
                          child: Text(
                            tr('No items — add a product below.'),
                            style: PosType.body.copyWith(color: c.textMuted),
                          ),
                        )
                      : Column(
                          children: [
                            for (final (i, line) in ctrl.lines.indexed) ...[
                              if (i > 0) Divider(height: 1, color: c.border.withValues(alpha: 0.6)),
                              _DraftRow(ctrl: ctrl, line: line),
                            ],
                          ],
                        ),
                ),
                const SizedBox(height: PosSpacing.lg),
                SectionLabel(tr('Add product')),
                TextField(
                  onChanged: ctrl.setSearch,
                  decoration: InputDecoration(
                    hintText: tr('Search products...'),
                    prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
                  ),
                ),
                const SizedBox(height: PosSpacing.sm),
                SizedBox(
                  height: 38,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      CategoryChip(
                        label: tr('All'),
                        selected: ctrl.selectedCategory == 'all',
                        onTap: () => ctrl.selectCategory('all'),
                      ),
                      for (final cat in ctrl.categories) ...[
                        const SizedBox(width: 6),
                        CategoryChip(
                          label: cat.name,
                          selected: ctrl.selectedCategory == cat.id,
                          onTap: () => ctrl.selectCategory(cat.id),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: PosSpacing.sm),
              ],
            ),
          ),
          if (ctrl.menuLoading)
            SliverToBoxAdapter(child: LoadingView(message: tr('Loading menu…')))
          else if (ctrl.menuError != null)
            SliverToBoxAdapter(child: InlineNotice(message: ctrl.menuError!))
          else
            SliverPadding(
              padding: centeredPadding(context, top: 0),
              sliver: SliverList.separated(
                itemCount: ctrl.visibleProducts.length,
                separatorBuilder: (_, _) => const SizedBox(height: 6),
                itemBuilder: (context, i) {
                  final p = ctrl.visibleProducts[i];
                  return PosCard(
                    padding: const EdgeInsets.all(PosSpacing.sm),
                    onTap: () => _pickProduct(context, ctrl, p),
                    child: Row(
                      children: [
                        ProductImage(url: p.imageUrl, size: 44, contain: true),
                        const SizedBox(width: PosSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(p.name, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5)),
                              Text(
                                tr('From {price}', {'price': formatMoney(p.basePrice)}),
                                style: PosType.caption.copyWith(color: c.textMuted),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            color: c.brand,
                            borderRadius: BorderRadius.circular(PosRadius.button),
                          ),
                          child: const Icon(Icons.add_rounded, color: Colors.white, size: 20),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: c.card,
          border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.7))),
        ),
        padding: centeredPadding(
          context,
          top: PosSpacing.md,
          bottom: PosSpacing.md + MediaQuery.paddingOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            MoneyRow(label: tr('Items subtotal'), amount: ctrl.subtotal, color: c.text),
            MoneyRow(label: tr('New total'), amount: ctrl.previewTotal, emphasis: true),
            if (ctrl.previewBalance > 0)
              MoneyRow(label: tr('Collect at counter'), amount: ctrl.previewBalance, color: c.warningText),
            const SizedBox(height: PosSpacing.sm),
            PosButton(
              label: tr('Save changes'),
              icon: Icons.save_outlined,
              loading: ctrl.saving,
              onPressed: ctrl.changed && ctrl.hasItems ? () => _save(context, ctrl) : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _DraftRow extends StatelessWidget {
  const _DraftRow({required this.ctrl, required this.line});
  final OrderEditController ctrl;
  final DraftLine line;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Padding(
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    text: line.name,
                    children: [
                      if (line.isNew)
                        TextSpan(
                          text: '  ${tr('New')}',
                          style: PosType.label.copyWith(color: c.successText, letterSpacing: 0),
                        ),
                    ],
                  ),
                  style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5),
                ),
              ),
              Text(
                formatMoney(line.unitPrice * line.quantity),
                style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13, fontFeatures: PosType.tabular),
              ),
            ],
          ),
          if (line.detail.isNotEmpty) Text('+ ${line.detail}', style: PosType.caption.copyWith(color: c.textMuted)),
          const SizedBox(height: 6),
          Row(
            children: [
              QtyStepper(
                quantity: line.quantity,
                min: ctrl.minQuantity(line),
                max: OrderEditController.maxQuantity,
                onChanged: (q) => ctrl.setQuantity(line, q),
              ),
              const Spacer(),
              if (ctrl.canRemove(line))
                TextButton.icon(
                  onPressed: () => ctrl.remove(line),
                  style: TextButton.styleFrom(foregroundColor: c.danger, visualDensity: VisualDensity.compact),
                  icon: const Icon(Icons.delete_outline_rounded, size: 18),
                  label: Text(tr('Delete')),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Toppings + quantity picker (web ProductAddPicker). Pops (toppings, quantity).
class _ProductAddSheet extends StatefulWidget {
  const _ProductAddSheet({required this.product});
  final Product product;

  @override
  State<_ProductAddSheet> createState() => _ProductAddSheetState();
}

class _ProductAddSheetState extends State<_ProductAddSheet> {
  final Set<String> _selected = {};
  int _qty = 1;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final p = widget.product;
    final toppings = p.availableToppings;
    final chosen = toppings.where((t) => _selected.contains(t.id)).toList();
    final unit = p.basePrice + chosen.fold<double>(0, (s, t) => s + t.extraPrice);
    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SheetHeader(title: p.name, subtitle: tr('From {price}', {'price': formatMoney(p.basePrice)})),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: PosSpacing.lg),
              children: [
                SectionLabel(tr('Toppings')),
                for (final t in toppings)
                  CheckboxListTile(
                    value: _selected.contains(t.id),
                    onChanged: (v) => setState(() => v == true ? _selected.add(t.id) : _selected.remove(t.id)),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                    title: Text(t.name, style: PosType.body.copyWith(color: c.text)),
                    secondary: Text(
                      '+ ${formatMoney(t.extraPrice)}',
                      style: PosType.caption.copyWith(color: c.textMuted),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(PosSpacing.lg),
            child: Row(
              children: [
                QtyStepper(
                  quantity: _qty,
                  min: 1,
                  max: OrderEditController.maxQuantity,
                  onChanged: (q) => setState(() => _qty = q),
                ),
                const SizedBox(width: PosSpacing.md),
                Expanded(
                  child: PosButton(
                    label: tr('Add · {price}', {'price': formatMoney(unit * _qty)}),
                    onPressed: () => Navigator.pop(context, (chosen, _qty)),
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
