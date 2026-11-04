import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../domain/entities/admin_session.dart';
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

/// Cashiers — port of the web `/admin/cashiers` (branch admin): register,
/// edit, reset password and activate / deactivate, with this month's activity.
class CashiersScreen extends StatefulWidget {
  const CashiersScreen({
    super.key,
    required this.session,
    required this.canCreate,
    required this.canUpdate,
    required this.canDelete,
  });

  final AdminSession session;
  final bool canCreate;
  final bool canUpdate;

  /// Web: activating / deactivating needs CASHIERS delete.
  final bool canDelete;

  @override
  State<CashiersScreen> createState() => _CashiersScreenState();
}

class _CashiersScreenState extends State<CashiersScreen> {
  late final Loadable<List<CashierAccount>> _rows;
  late final Loadable<Map<String, CashierActivity>> _activity;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    final now = DateTime.now();
    _rows = Loadable(repo.cashierAccounts);
    _activity = Loadable(() => repo.cashierActivity(from: formatYmd(DateTime(now.year, now.month)), to: formatYmd(now)));
  }

  @override
  void dispose() {
    _rows.dispose();
    _activity.dispose();
    super.dispose();
  }

  Future<void> _refresh() => Future.wait([_rows.load(silent: true), _activity.load(silent: true)]);

  Future<void> _create() async {
    final ok = await showPosSheet<bool>(context, builder: (_) => const _CashierForm());
    if (ok == true) _refresh();
  }

  Future<void> _edit(CashierAccount a) async {
    final ok = await showPosSheet<bool>(context, builder: (_) => _CashierForm(account: a));
    if (ok == true) _refresh();
  }

  Future<void> _resetPassword(CashierAccount a) async {
    final ok = await showPosSheet<bool>(context, builder: (_) => _PasswordForm(account: a));
    if (ok == true) _refresh();
  }

  Future<void> _toggle(CashierAccount a) async {
    final off = a.isActive;
    final ok = await confirmDialog(
      context,
      title: off ? tr('Deactivate cashier?') : tr('Activate cashier?'),
      message: off
          ? tr('{name} will no longer be able to sign in.', {'name': a.name})
          : tr('{name} will be able to sign in again.', {'name': a.name}),
      confirmLabel: off ? tr('Deactivate') : tr('Activate'),
      danger: off,
      icon: off ? Icons.person_off_outlined : Icons.person_outline_rounded,
    );
    if (!ok || !mounted) return;
    try {
      await context.read<AppContainer>().adminRepository.updateCashier(a.id, {'isActive': !a.isActive});
      PosFeedback.success();
      if (mounted) showPosSnack(context, tr('Status updated'), kind: PosSnackKind.success);
      _refresh();
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return ListenableBuilder(
      listenable: Listenable.merge([_rows, _activity]),
      builder: (context, _) {
        final rows = _rows.data;
        final act = _activity.data ?? const {};
        return AdminPageList(
          maxWidth: 1100,
          onRefresh: _refresh,
          children: [
            PageHeader(
              title: tr('Cashiers'),
              subtitle: tr('Cashier accounts for {branch}', {'branch': widget.session.branchLabel ?? tr('your branch')}),
              actions: [
                if (widget.canCreate)
                  PosButton(label: tr('Register'), icon: Icons.person_add_alt_rounded, expand: false, height: 42, onPressed: _create),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            if (rows == null)
              _rows.error != null
                  ? ErrorView(message: _rows.error!, onRetry: _rows.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else if (rows.isEmpty)
              EmptyView(message: tr('No cashiers registered yet'), icon: Icons.badge_outlined)
            else
              ResponsiveGrid(
                minItemWidth: 360,
                children: [
                  for (final a in rows)
                    PosCard(
                      padding: const EdgeInsets.all(PosSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              CircleAvatar(
                                backgroundColor: c.brandSubtle,
                                child: Text(
                                  a.name.isEmpty ? '?' : a.name.characters.first.toUpperCase(),
                                  style: PosType.bodyStrong.copyWith(color: c.brand),
                                ),
                              ),
                              const SizedBox(width: PosSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(a.name, style: PosType.bodyStrong.copyWith(color: c.text)),
                                    Text(a.email, style: PosType.caption.copyWith(color: c.textMuted)),
                                  ],
                                ),
                              ),
                              PosBadge(label: a.isActive ? tr('Active') : tr('Inactive'), color: a.isActive ? c.successText : c.dangerText),
                            ],
                          ),
                          const SizedBox(height: PosSpacing.sm),
                          PosInset(
                            padding: const EdgeInsets.symmetric(horizontal: PosSpacing.md, vertical: PosSpacing.sm),
                            child: Row(
                              children: [
                                _stat(tr('Orders'), formatCount(act[a.id]?.ordersProcessed ?? 0)),
                                _stat(tr('Cash collected'), formatMoney(act[a.id]?.cashCollected ?? 0)),
                                _stat(tr('Cancels'), formatCount(act[a.id]?.cancels ?? 0)),
                              ],
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            tr('Last sign-in: {t}', {'t': a.lastLoginAt == null ? '—' : formatShortDateTime(a.lastLoginAt!)}),
                            style: PosType.caption.copyWith(color: c.textSoft, fontSize: 11),
                          ),
                          if (widget.canUpdate || widget.canDelete) ...[
                            const SizedBox(height: PosSpacing.sm),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                if (widget.canUpdate)
                                  PosButton(label: tr('Edit'), icon: Icons.edit_outlined, variant: PosButtonVariant.outline, expand: false, height: 36, onPressed: () => _edit(a)),
                                if (widget.canUpdate)
                                  PosButton(label: tr('Reset password'), icon: Icons.key_outlined, variant: PosButtonVariant.outline, expand: false, height: 36, onPressed: () => _resetPassword(a)),
                                if (widget.canDelete)
                                  PosButton(
                                    label: a.isActive ? tr('Deactivate') : tr('Activate'),
                                    icon: a.isActive ? Icons.person_off_outlined : Icons.person_outline_rounded,
                                    variant: a.isActive ? PosButtonVariant.danger : PosButtonVariant.success,
                                    expand: false,
                                    height: 36,
                                    onPressed: () => _toggle(a),
                                  ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            const SizedBox(height: PosSpacing.sm),
            Text(tr('Activity is for this month.'), style: PosType.caption.copyWith(color: c.textMuted)),
          ],
        );
      },
    );
  }

  Widget _stat(String label, String value) {
    final c = context.pos;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 10.5)),
          Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5)),
        ],
      ),
    );
  }
}

class _CashierForm extends StatefulWidget {
  const _CashierForm({this.account});
  final CashierAccount? account;

  @override
  State<_CashierForm> createState() => _CashierFormState();
}

class _CashierFormState extends State<_CashierForm> {
  late final _name = TextEditingController(text: widget.account?.name ?? '');
  late final _email = TextEditingController(text: widget.account?.email ?? '');
  final _password = TextEditingController();
  bool _busy = false;
  bool _show = false;

  bool get _editing => widget.account != null;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final email = _email.text.trim();
    if (name.isEmpty || !email.contains('@')) {
      showPosSnack(context, tr('Enter a name and a valid email'), kind: PosSnackKind.error);
      return;
    }
    if (!_editing && _password.text.length < 8) {
      showPosSnack(context, tr('Password must be at least 8 characters'), kind: PosSnackKind.error);
      return;
    }
    setState(() => _busy = true);
    final repo = context.read<AppContainer>().adminRepository;
    try {
      if (_editing) {
        await repo.updateCashier(widget.account!.id, {'name': name, 'email': email});
      } else {
        await repo.createCashier(name: name, email: email, password: _password.text);
      }
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, _editing ? tr('Cashier updated') : tr('Cashier registered'), kind: PosSnackKind.success);
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
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetHeader(title: _editing ? tr('Edit cashier') : tr('Register cashier')),
            Padding(
              padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 0, PosSpacing.xl, PosSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: tr('Full name'))),
                  const SizedBox(height: PosSpacing.md),
                  TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: tr('Email'))),
                  if (!_editing) ...[
                    const SizedBox(height: PosSpacing.md),
                    TextField(
                      controller: _password,
                      obscureText: !_show,
                      decoration: InputDecoration(
                        labelText: tr('Password'),
                        suffixIcon: IconButton(
                          icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                          onPressed: () => setState(() => _show = !_show),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: PosSpacing.lg),
                  PosButton(label: _editing ? tr('Save changes') : tr('Register cashier'), icon: Icons.check_rounded, loading: _busy, onPressed: _save),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PasswordForm extends StatefulWidget {
  const _PasswordForm({required this.account});
  final CashierAccount account;

  @override
  State<_PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends State<_PasswordForm> {
  final _password = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_password.text.length < 8) {
      showPosSnack(context, tr('Password must be at least 8 characters'), kind: PosSnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AppContainer>().adminRepository.updateCashier(widget.account.id, {'password': _password.text});
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, tr('Password updated'), kind: PosSnackKind.success);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showPosSnack(context, e.toString(), kind: PosSnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SheetHeader(title: tr('Reset password'), subtitle: widget.account.name),
          Padding(
            padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 0, PosSpacing.xl, PosSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(controller: _password, obscureText: true, decoration: InputDecoration(labelText: tr('New password'))),
                const SizedBox(height: PosSpacing.lg),
                PosButton(label: tr('Update password'), icon: Icons.key_rounded, loading: _busy, onPressed: _save),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
