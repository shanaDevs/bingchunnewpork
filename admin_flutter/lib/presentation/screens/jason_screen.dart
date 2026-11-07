import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

/// JASON investments & expenses — port of the web `/admin/jason`. Entries can be
/// added; the app deliberately has no deactivate action.
class JasonScreen extends StatefulWidget {
  const JasonScreen({super.key});

  @override
  State<JasonScreen> createState() => _JasonScreenState();
}

class _JasonScreenState extends State<JasonScreen> {
  String? _type;
  late final Loadable<JasonLedger> _ledger;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _ledger = Loadable(() => repo.jason(type: _type));
  }

  @override
  void dispose() {
    _ledger.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final added = await showPosSheet<bool>(context, builder: (_) => const _JasonForm());
    if (added == true) _ledger.load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return ListenableBuilder(
      listenable: _ledger,
      builder: (context, _) {
        final l = _ledger.data;
        return AdminPageList(
          onRefresh: () => _ledger.load(silent: true),
          children: [
            PageHeader(
              title: tr('JASON'),
              subtitle: tr('Investments and expenses ledger'),
              actions: [
                PosButton(label: tr('Add entry'), icon: Icons.add_rounded, expand: false, height: 42, onPressed: _add),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            KpiGrid(
              children: [
                KpiTile(icon: Icons.trending_up_rounded, title: tr('Total Investments'), value: l == null ? '—' : formatMoney(l.totalInvestments), color: PosColors.ready, loading: l == null),
                KpiTile(icon: Icons.trending_down_rounded, title: tr('Total Expenses'), value: l == null ? '—' : formatMoney(l.totalExpenses), color: c.danger, loading: l == null),
                KpiTile(icon: Icons.balance_rounded, title: tr('Net'), value: l == null ? '—' : formatMoney(l.net), loading: l == null),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            PillTabs<String?>(
              items: [(null, tr('All'), null, null), ('INVESTMENT', tr('Investments'), null, null), ('EXPENSE', tr('Expenses'), null, null)],
              selected: _type,
              onSelect: (t) {
                setState(() => _type = t);
                _ledger.load();
              },
            ),
            const SizedBox(height: PosSpacing.md),
            if (l == null)
              _ledger.error != null
                  ? ErrorView(message: _ledger.error!, onRetry: _ledger.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else if (l.entries.isEmpty)
              EmptyView(
                message: tr('No entries yet'),
                icon: Icons.account_balance_outlined,
                action: PosButton(label: tr('Add entry'), icon: Icons.add_rounded, expand: false, onPressed: _add),
              )
            else
              PosCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final (i, e) in l.entries.indexed) ...[
                      if (i > 0) Divider(height: 1, color: c.border.withValues(alpha: 0.6)),
                      Opacity(
                        opacity: e.isActive ? 1 : 0.6,
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: (e.isInvestment ? PosColors.ready : c.danger).withValues(alpha: 0.12),
                            child: Icon(
                              e.isInvestment ? Icons.south_west_rounded : Icons.north_east_rounded,
                              color: e.isInvestment ? PosColors.ready : c.danger,
                              size: 18,
                            ),
                          ),
                          title: Text(e.description, style: PosType.body.copyWith(color: c.text, fontSize: 13.5)),
                          subtitle: Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                e.occurredAt == null ? '—' : formatShortDate(toColombo(e.occurredAt!)),
                                style: PosType.caption.copyWith(color: c.textMuted),
                              ),
                              PosBadge(
                                label: e.isInvestment ? tr('Investment') : tr('Expense'),
                                color: e.isInvestment ? c.successText : c.dangerText,
                              ),
                              if (!e.isActive) PosBadge(label: tr('Inactive'), color: c.textMuted),
                              if (e.storeWithdrawalId != null) PosBadge(label: tr('Payout linked'), color: c.brand),
                            ],
                          ),
                          trailing: Text(
                            formatMoney(e.amount),
                            style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _JasonForm extends StatefulWidget {
  const _JasonForm();

  @override
  State<_JasonForm> createState() => _JasonFormState();
}

class _JasonFormState extends State<_JasonForm> {
  String _type = 'EXPENSE';
  DateTime _date = DateTime.now();
  final _amount = TextEditingController();
  final _desc = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) {
      showPosSnack(context, tr('Enter a valid amount'), kind: PosSnackKind.error);
      return;
    }
    if (_desc.text.trim().isEmpty) {
      showPosSnack(context, tr('Enter a description'), kind: PosSnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AppContainer>().adminRepository.addJason(
        type: _type,
        amount: amount,
        description: _desc.text.trim(),
        occurredAt: formatYmd(_date),
      );
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, tr('Entry added'), kind: PosSnackKind.success);
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
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 0, PosSpacing.xl, PosSpacing.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SheetHeaderInline(),
            PillTabs<String>(
              items: [('EXPENSE', tr('Expense'), Icons.north_east_rounded, null), ('INVESTMENT', tr('Investment'), Icons.south_west_rounded, null)],
              selected: _type,
              onSelect: (t) => setState(() => _type = t),
            ),
            const SizedBox(height: PosSpacing.md),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              decoration: InputDecoration(labelText: tr('Amount (LKR)')),
            ),
            const SizedBox(height: PosSpacing.md),
            TextField(
              controller: _desc,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(labelText: tr('Description')),
            ),
            const SizedBox(height: PosSpacing.md),
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(PosRadius.button),
              child: InputDecorator(
                decoration: InputDecoration(labelText: tr('Date'), suffixIcon: Icon(Icons.calendar_today_rounded, color: c.textMuted, size: 18)),
                child: Text(formatShortDate(_date), style: PosType.body.copyWith(color: c.text)),
              ),
            ),
            const SizedBox(height: PosSpacing.lg),
            PosButton(label: tr('Save entry'), icon: Icons.check_rounded, loading: _busy, onPressed: _save),
          ],
        ),
      ),
    );
  }
}

/// Title for the add-entry sheet.
class SheetHeaderInline extends StatelessWidget {
  const SheetHeaderInline({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: PosSpacing.md),
    child: Text(tr('Add investment or expense'), style: PosType.heading.copyWith(color: context.pos.text)),
  );
}
