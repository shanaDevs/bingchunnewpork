import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/stock.dart';
import '../../domain/logic/stock_rules.dart';
import '../../l10n/l10n.dart';
import '../components/buttons.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../state/stock_controller.dart';
import '../theme/pos_theme.dart';

/// Branch admin stock actions — ports of the web StockTableTab row buttons,
/// ReceiveStockModal, StockAdjustModal, StockSettingsDrawer and ReactivateStockModal.

// ---------------------------------------------------------------- rules (web lib/stockApi.ts)

bool _hasBatches(StockItem i) => (i.totalBatchCount ?? i.batchCount) > 0;

/// Low / out-of-stock online, or at / above the weekly target → emergency batch (E-).
bool isEmergencyRestock(StockItem i) {
  if (isNewProduct(i) || !_hasBatches(i)) return false;
  if (i.onlineAvailableQty < i.lowStockThreshold) return true;
  return i.weeklyTargetQty > 0 && i.onHandQty >= i.weeklyTargetQty;
}

bool canUseResetReceive(StockItem i) {
  if (isNewProduct(i)) return true;
  if (isEmergencyRestock(i)) return false;
  if (i.weeklyTargetQty <= 0) return true;
  return i.onHandQty < i.weeklyTargetQty;
}

bool canReceiveStock(StockItem i) => canUseResetReceive(i) || isEmergencyRestock(i);
bool hasWeeklyTarget(StockItem i) => i.weeklyTargetQty > 0;
bool canBranchAdminReceive(StockItem i) => canReceiveStock(i) && hasWeeklyTarget(i);
String receiveBatchType(StockItem i) => isEmergencyRestock(i) ? 'EMERGENCY' : 'RESET';

/// Units a reset receive may add before hitting the weekly target; null = no cap.
int? maxResetReceive(StockItem i) {
  if (isNewProduct(i) || i.weeklyTargetQty <= 0) return null;
  return (i.weeklyTargetQty - i.onHandQty).clamp(0, 1 << 30);
}

/// Web canActivateWithQty: stock must be above the low-stock level to go live.
bool canActivateWithQty(int qty, StockItem i) => qty > i.lowStockThreshold;

// ---------------------------------------------------------------- actions bar

/// Buttons under an expanded stock row for branch admins.
class StockActionsBar extends StatelessWidget {
  const StockActionsBar({super.key, required this.item, required this.ctrl});
  final StockItem item;
  final StockController ctrl;

  Future<void> _open(BuildContext context, Widget sheet) async {
    final changed = await showPosSheet<bool>(context, builder: (_) => sheet);
    if (changed == true) await ctrl.afterChange(item.productId);
  }

  Future<void> _deactivate(BuildContext context) async {
    final ok = await confirmDialog(
      context,
      title: tr('Deactivate product?'),
      message: tr('{name} is removed from this branch menu and its remaining stock is frozen until you reactivate it.', {'name': item.name}),
      confirmLabel: tr('Deactivate'),
      danger: true,
      icon: Icons.power_settings_new_rounded,
    );
    if (!ok || !context.mounted || ctrl.storeId == null) return;
    try {
      await ctrl.repository.setAvailable(storeId: ctrl.storeId!, productId: item.productId, available: false);
      PosFeedback.success();
      if (context.mounted) showPosSnack(context, tr('{name} deactivated', {'name': item.name}), kind: PosSnackKind.success);
      await ctrl.afterChange(item.productId);
    } catch (e) {
      if (context.mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final inactive = isBranchInactive(item);
    final buttons = <Widget>[
      if (canBranchAdminReceive(item) && !inactive)
        PosButton(
          label: item.isAvailable ? tr('Receive') : tr('Receive to activate'),
          icon: Icons.move_to_inbox_rounded,
          expand: false,
          height: 38,
          onPressed: () => _open(context, _ReceiveSheet(item: item, ctrl: ctrl)),
        ),
      if (!inactive && !hasWeeklyTarget(item) && canReceiveStock(item))
        PosButton(
          label: tr('Set weekly target'),
          icon: Icons.flag_outlined,
          variant: PosButtonVariant.outline,
          expand: false,
          height: 38,
          onPressed: () => _open(context, _SettingsSheet(item: item, ctrl: ctrl)),
        ),
      if (!inactive && _hasBatches(item))
        PosButton(
          label: tr('Adjust'),
          icon: Icons.tune_rounded,
          variant: PosButtonVariant.outline,
          expand: false,
          height: 38,
          onPressed: () => _open(context, _AdjustSheet(item: item, ctrl: ctrl)),
        ),
      PosButton(
        label: tr('Settings'),
        icon: Icons.settings_outlined,
        variant: PosButtonVariant.outline,
        expand: false,
        height: 38,
        onPressed: () => _open(context, _SettingsSheet(item: item, ctrl: ctrl)),
      ),
      if (inactive)
        PosButton(
          label: tr('Reactivate'),
          icon: Icons.power_settings_new_rounded,
          variant: PosButtonVariant.success,
          expand: false,
          height: 38,
          onPressed: () async {
            if (!hasWeeklyTarget(item)) {
              showPosSnack(context, tr('Set a weekly target in Settings before reactivating.'), kind: PosSnackKind.info);
              return _open(context, _SettingsSheet(item: item, ctrl: ctrl));
            }
            return _open(context, _ReactivateSheet(item: item, ctrl: ctrl));
          },
        )
      else if (item.isAvailable)
        PosButton(
          label: tr('Deactivate'),
          icon: Icons.power_settings_new_rounded,
          variant: PosButtonVariant.danger,
          expand: false,
          height: 38,
          onPressed: () => _deactivate(context),
        ),
    ];
    return Padding(
      padding: const EdgeInsets.only(top: PosSpacing.sm),
      child: Wrap(spacing: 6, runSpacing: 6, children: buttons),
    );
  }
}

// ---------------------------------------------------------------- shared sheet shell

class _SheetShell extends StatelessWidget {
  const _SheetShell({required this.title, required this.subtitle, required this.children});
  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SheetHeader(title: title, subtitle: subtitle),
          Padding(
            padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 0, PosSpacing.xl, PosSpacing.xl),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
          ),
        ],
      ),
    ),
  );
}

Widget _facts(BuildContext context, List<(String, String)> facts) {
  final c = context.pos;
  return PosInset(
    child: Wrap(
      spacing: PosSpacing.xl,
      runSpacing: PosSpacing.sm,
      children: [
        for (final (k, v) in facts)
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(k, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11)),
              Text(v, style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular)),
            ],
          ),
      ],
    ),
  );
}

// ---------------------------------------------------------------- receive

class _ReceiveSheet extends StatefulWidget {
  const _ReceiveSheet({required this.item, required this.ctrl});
  final StockItem item;
  final StockController ctrl;

  @override
  State<_ReceiveSheet> createState() => _ReceiveSheetState();
}

class _ReceiveSheetState extends State<_ReceiveSheet> {
  final _qty = TextEditingController();
  final _note = TextEditingController();
  DateTime _date = DateTime.now();
  String? _batchNumber;
  bool _busy = false;

  StockItem get i => widget.item;
  String get _type => receiveBatchType(i);
  bool get _activation => !i.isAvailable;

  @override
  void initState() {
    super.initState();
    _qty.addListener(() => setState(() {}));
    _preview();
  }

  @override
  void dispose() {
    _qty.dispose();
    _note.dispose();
    super.dispose();
  }

  DateTime get _receivedAt => DateTime(_date.year, _date.month, _date.day, 12);

  Future<void> _preview() async {
    final id = widget.ctrl.storeId;
    if (id == null) return;
    final n = await widget.ctrl.repository.batchPreview(storeId: id, batchType: _type, receivedAt: _receivedAt);
    if (mounted) setState(() => _batchNumber = n);
  }

  Future<void> _save() async {
    final qty = int.tryParse(_qty.text.trim()) ?? 0;
    final cap = _type == 'RESET' ? maxResetReceive(i) : null;
    if (qty <= 0) {
      showPosSnack(context, tr('Enter a quantity above 0'), kind: PosSnackKind.error);
      return;
    }
    if (cap != null && qty > cap) {
      showPosSnack(context, tr('A reset batch can add at most {n} units (weekly target).', {'n': cap}), kind: PosSnackKind.error);
      return;
    }
    if (_activation && !canActivateWithQty(i.onHandQty + qty, i)) {
      showPosSnack(
        context,
        tr('Stock must be above {n} to mark this product active', {'n': i.lowStockThreshold}),
        kind: PosSnackKind.error,
      );
      return;
    }
    setState(() => _busy = true);
    final storeId = widget.ctrl.storeId!;
    try {
      final onHand = await widget.ctrl.repository.receiveBatch(
        storeId: storeId,
        productId: i.productId,
        qty: qty,
        receivedAt: _receivedAt,
        batchType: _type,
        note: _note.text,
      );
      if (_activation && canActivateWithQty(onHand, i)) {
        await widget.ctrl.repository.setAvailable(storeId: storeId, productId: i.productId, available: true);
      }
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, tr('{n} units received · on hand {h}', {'n': qty, 'h': onHand}), kind: PosSnackKind.success);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showPosSnack(context, e.toString(), kind: PosSnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final qty = int.tryParse(_qty.text.trim()) ?? 0;
    final cap = _type == 'RESET' ? maxResetReceive(i) : null;
    return _SheetShell(
      title: _activation ? tr('Receive stock to activate') : tr('Receive stock'),
      subtitle: i.name,
      children: [
        _facts(context, [
          (tr('On hand'), formatCount(i.onHandQty)),
          (tr('Weekly target'), formatCount(i.weeklyTargetQty)),
          (tr('Batch type'), _type == 'EMERGENCY' ? tr('Emergency (E-)') : tr('Reset (R-)')),
          (tr('Batch number'), _batchNumber ?? '…'),
        ]),
        if (_type == 'EMERGENCY') ...[
          const SizedBox(height: PosSpacing.sm),
          InlineNotice(message: tr('Online stock is low or at target, so this is an emergency restock batch.'), tone: NoticeTone.warning),
        ],
        const SizedBox(height: PosSpacing.md),
        TextField(
          controller: _qty,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(
            labelText: tr('Quantity received'),
            helperText: cap == null ? null : tr('Up to {n} units', {'n': cap}),
          ),
        ),
        const SizedBox(height: PosSpacing.md),
        InkWell(
          borderRadius: BorderRadius.circular(PosRadius.button),
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: _date,
              firstDate: DateTime.now().subtract(const Duration(days: 30)),
              lastDate: DateTime.now(),
            );
            if (d != null) {
              setState(() => _date = d);
              _preview();
            }
          },
          child: InputDecorator(
            decoration: InputDecoration(labelText: tr('Received date'), suffixIcon: Icon(Icons.calendar_today_rounded, size: 18, color: c.textMuted)),
            child: Text(formatShortDate(_date), style: PosType.body.copyWith(color: c.text)),
          ),
        ),
        const SizedBox(height: PosSpacing.md),
        TextField(controller: _note, decoration: InputDecoration(labelText: tr('Note (optional)'))),
        const SizedBox(height: PosSpacing.md),
        Text(
          tr('On hand after: {n}', {'n': formatCount(i.onHandQty + qty)}),
          style: PosType.caption.copyWith(color: c.textMuted, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: PosSpacing.md),
        PosButton(label: tr('Receive stock'), icon: Icons.move_to_inbox_rounded, loading: _busy, onPressed: _save),
      ],
    );
  }
}

// ---------------------------------------------------------------- adjust

class _AdjustSheet extends StatefulWidget {
  const _AdjustSheet({required this.item, required this.ctrl});
  final StockItem item;
  final StockController ctrl;

  @override
  State<_AdjustSheet> createState() => _AdjustSheetState();
}

class _AdjustSheetState extends State<_AdjustSheet> {
  bool _add = true;
  final _qty = TextEditingController();
  final _note = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _qty.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _qty.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final n = int.tryParse(_qty.text.trim()) ?? 0;
    final i = widget.item;
    if (n <= 0) {
      showPosSnack(context, tr('Enter a quantity above 0'), kind: PosSnackKind.error);
      return;
    }
    if (!_add && n > i.onHandQty) {
      showPosSnack(context, tr('You can remove at most {n} units', {'n': i.onHandQty}), kind: PosSnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      final onHand = await widget.ctrl.repository.adjust(
        storeId: widget.ctrl.storeId!,
        productId: i.productId,
        delta: _add ? n : -n,
        note: _note.text,
      );
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, tr('Stock adjusted · on hand {h}', {'h': onHand}), kind: PosSnackKind.success);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showPosSnack(context, e.toString(), kind: PosSnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final i = widget.item;
    final n = int.tryParse(_qty.text.trim()) ?? 0;
    return _SheetShell(
      title: tr('Adjust stock'),
      subtitle: i.name,
      children: [
        _facts(context, [(tr('On hand'), formatCount(i.onHandQty)), (tr('After'), formatCount(i.onHandQty + (_add ? n : -n)))]),
        const SizedBox(height: PosSpacing.md),
        SegmentedButton<bool>(
          segments: [
            ButtonSegment(value: true, label: Text(tr('Add')), icon: const Icon(Icons.add_rounded)),
            ButtonSegment(value: false, label: Text(tr('Remove')), icon: const Icon(Icons.remove_rounded)),
          ],
          selected: {_add},
          onSelectionChanged: (v) => setState(() => _add = v.first),
        ),
        const SizedBox(height: PosSpacing.md),
        TextField(
          controller: _qty,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(labelText: tr('Quantity')),
        ),
        const SizedBox(height: PosSpacing.md),
        TextField(controller: _note, decoration: InputDecoration(labelText: tr('Note (optional)'))),
        const SizedBox(height: PosSpacing.lg),
        PosButton(label: tr('Save adjustment'), icon: Icons.check_rounded, loading: _busy, onPressed: _save),
      ],
    );
  }
}

// ---------------------------------------------------------------- settings

class _SettingsSheet extends StatefulWidget {
  const _SettingsSheet({required this.item, required this.ctrl});
  final StockItem item;
  final StockController ctrl;

  @override
  State<_SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<_SettingsSheet> {
  late final _target = TextEditingController(
    text: widget.item.weeklyTargetQty == 0
        ? '$defaultWeeklyTargetQty'
        : '${widget.item.weeklyTargetQty}',
  );
  late final _low = TextEditingController(text: '${widget.item.lowStockThreshold}');
  late final _oos = TextEditingController(text: '${widget.item.onlineOutOfStockThreshold}');
  bool _busy = false;

  @override
  void dispose() {
    _target.dispose();
    _low.dispose();
    _oos.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final target = int.tryParse(_target.text.trim());
    if (target == null || target <= 0) {
      showPosSnack(context, tr('Enter a weekly target above 0'), kind: PosSnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.ctrl.repository.saveSettings(
        storeId: widget.ctrl.storeId!,
        productId: widget.item.productId,
        weeklyTargetQty: target,
        lowStockThreshold: int.tryParse(_low.text.trim()),
        onlineOutOfStockThreshold: int.tryParse(_oos.text.trim()),
      );
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, tr('Stock settings saved'), kind: PosSnackKind.success);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showPosSnack(context, e.toString(), kind: PosSnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    TextField field(TextEditingController ctl, String label, String help) => TextField(
      controller: ctl,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(labelText: label, helperText: help, helperMaxLines: 2),
    );
    return _SheetShell(
      title: tr('Stock settings'),
      subtitle: widget.item.name,
      children: [
        field(_target, tr('Weekly target quantity'), tr('Units the branch aims to hold each week. Required before receiving stock.')),
        const SizedBox(height: PosSpacing.md),
        field(_low, tr('Low-stock level'), tr('Below this, the product is flagged low stock.')),
        const SizedBox(height: PosSpacing.md),
        field(_oos, tr('Online out-of-stock buffer'), tr('Units kept back from online orders for the counter.')),
        const SizedBox(height: PosSpacing.lg),
        PosButton(label: tr('Save settings'), icon: Icons.check_rounded, loading: _busy, onPressed: _save),
        const SizedBox(height: PosSpacing.sm),
        Text(tr('Changes apply to this branch only.'), textAlign: TextAlign.center, style: PosType.caption.copyWith(color: c.textMuted)),
      ],
    );
  }
}

// ---------------------------------------------------------------- reactivate

class _ReactivateSheet extends StatefulWidget {
  const _ReactivateSheet({required this.item, required this.ctrl});
  final StockItem item;
  final StockController ctrl;

  @override
  State<_ReactivateSheet> createState() => _ReactivateSheetState();
}

class _ReactivateSheetState extends State<_ReactivateSheet> {
  late final _qty = TextEditingController(
    text: widget.item.frozenQty > 0 ? '${widget.item.frozenQty}' : '${widget.item.lowStockThreshold + 1}',
  );
  bool _busy = false;

  StockItem get i => widget.item;

  /// Frozen batches come back as they were; otherwise new stock is received first.
  bool get _restoreFrozen => i.frozenQty > 0;

  @override
  void dispose() {
    _qty.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final storeId = widget.ctrl.storeId!;
    final qty = int.tryParse(_qty.text.trim()) ?? 0;
    setState(() => _busy = true);
    try {
      if (!_restoreFrozen && qty > 0) {
        final now = DateTime.now();
        await widget.ctrl.repository.receiveBatch(
          storeId: storeId,
          productId: i.productId,
          qty: qty,
          receivedAt: DateTime(now.year, now.month, now.day, 12),
          batchType: 'RESET',
        );
      }
      await widget.ctrl.repository.setAvailable(storeId: storeId, productId: i.productId, available: true);
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, tr('{name} activated', {'name': i.name}), kind: PosSnackKind.success);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showPosSnack(context, e.toString(), kind: PosSnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) => _SheetShell(
    title: tr('Reactivate product'),
    subtitle: i.name,
    children: [
      if (_restoreFrozen)
        InlineNotice(
          message: tr('{n} frozen units in {b} batches come back on sale.', {'n': i.frozenQty, 'b': i.frozenBatchCount}),
          tone: NoticeTone.info,
        )
      else ...[
        InlineNotice(message: tr('No stock is frozen for this product. Receive new stock to put it back on sale.'), tone: NoticeTone.info),
        const SizedBox(height: PosSpacing.md),
        TextField(
          controller: _qty,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(labelText: tr('Quantity to receive')),
        ),
      ],
      const SizedBox(height: PosSpacing.lg),
      PosButton(label: tr('Reactivate'), icon: Icons.power_settings_new_rounded, variant: PosButtonVariant.success, loading: _busy, onPressed: _save),
    ],
  );
}
