import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/feedback.dart';
import '../../data/models/driver.dart';
import '../../data/network/api_exception.dart';
import '../../l10n/l10n.dart';
import '../components/bc_dialog.dart';
import '../components/inputs.dart';
import '../components/job_cards.dart';
import '../components/profile_kit.dart';
import '../theme/bc_theme.dart';

const _minReason = 10;
const _maxReason = 300;

/// QuickDrop "Request Branch Change": pick the branch to leave, the branch to join and a
/// reason. Branches change only after support approves the request.
class BranchRequestScreen extends StatefulWidget {
  const BranchRequestScreen({
    super.key,
    required this.assigned,
    required this.stores,
    required this.homeStoreId,
    required this.onSubmit,
  });

  /// The rider's current branches.
  final List<StoreRef> assigned;

  /// Every branch the rider could ask for (assigned ones are filtered out).
  final List<BranchOption> stores;
  final String? homeStoreId;

  /// Sends the request; throws on failure with a message to show.
  final Future<void> Function(String type, String toStoreId, String? reason, String? fromStoreId) onSubmit;

  /// Opens the screen; true once a request was sent.
  static Future<bool> open(
    BuildContext context, {
    required List<StoreRef> assigned,
    required List<BranchOption> stores,
    required String? homeStoreId,
    required Future<void> Function(String type, String toStoreId, String? reason, String? fromStoreId) onSubmit,
  }) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => BranchRequestScreen(
          assigned: assigned,
          stores: stores,
          homeStoreId: homeStoreId,
          onSubmit: onSubmit,
        ),
      ),
    );
    return ok ?? false;
  }

  @override
  State<BranchRequestScreen> createState() => _BranchRequestScreenState();
}

class _BranchRequestScreenState extends State<BranchRequestScreen> {
  final _reason = TextEditingController();
  String? _from;
  String? _to;
  bool _attempted = false;
  bool _submitting = false;
  String? _error;

  late final Set<String> _assignedIds = widget.assigned.map((b) => b.id).where((id) => id.isNotEmpty).toSet();

  /// Branches the rider isn't on yet; closed ones are listed but can't be chosen.
  late final List<BranchOption> _others = widget.stores.where((s) => !_assignedIds.contains(s.id)).toList();

  @override
  void initState() {
    super.initState();
    final assigned = widget.assigned.where((b) => b.id.isNotEmpty).toList();
    _from = assigned.any((b) => b.id == widget.homeStoreId) ? widget.homeStoreId : assigned.firstOrNull?.id;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  bool get _reasonValid => _reason.text.trim().length >= _minReason;
  bool get _chooseFrom => widget.assigned.where((b) => b.id.isNotEmpty).length > 1;

  String _name(String? id) {
    for (final b in widget.assigned) {
      if (b.id == id) return b.name;
    }
    for (final s in widget.stores) {
      if (s.id == id) return s.name;
    }
    return '';
  }

  Future<void> _send() async {
    setState(() {
      _attempted = true;
      _error = null;
    });
    if (_to == null || !_reasonValid || (_chooseFrom && _from == null)) {
      BcFeedback.error();
      return;
    }
    final confirmed = await showBcConfirm(
      context,
      title: tr('Request branch change?'),
      message: tr('{from} → {to}. Your branches change only after support approves the request.', {
        'from': _chooseFrom ? _name(_from) : tr('Your branches'),
        'to': _name(_to),
      }),
      confirmLabel: tr('Send request'),
      icon: Icons.swap_horiz_rounded,
    );
    if (!confirmed || !mounted) return;
    setState(() => _submitting = true);
    try {
      await widget.onSubmit('ADD_BRANCH', _to!, _reason.text.trim(), _chooseFrom ? _from : null);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      BcFeedback.error();
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e is ApiException ? e.message : '$e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final open = _others.where((b) => b.isActive).toList();
    final closed = _others.where((b) => !b.isActive).toList();
    String label(String name, String? city) => [name, if (nonBlank(city) != null) city!].join(' · ');

    return PopScope(
      canPop: !_submitting,
      child: QdPage(
        title: tr('Request Branch Change'),
        footer: PillButton(
          label: tr('Send request'),
          icon: Icons.send_outlined,
          height: 56,
          loading: _submitting,
          onTap: open.isEmpty ? null : _send,
        ),
        children: [
          if (_chooseFrom) ...[
            _Label(tr('Branch to leave')),
            _ChoiceGroup(
              items: [for (final b in widget.assigned.where((b) => b.id.isNotEmpty)) (b.id, label(b.name, b.city))],
              value: _from,
              onChanged: (v) => setState(() => _from = v),
            ),
            const SizedBox(height: 16),
          ],
          _Label(tr('Requested branch')),
          if (open.isEmpty)
            Text(tr('There are no other branches to join right now.'), style: TextStyle(fontSize: 14, color: c.mutedForeground))
          else ...[
            _ChoiceGroup(
              items: [for (final b in open) (b.id, label(b.name, b.city))],
              value: _to,
              invalid: _attempted && _to == null,
              onChanged: (v) => setState(() => _to = v),
            ),
            for (final b in closed)
              Padding(
                padding: const EdgeInsets.only(top: 8, left: 2),
                child: Text(
                  '${b.name} · ${tr('Temporarily closed')}',
                  style: TextStyle(fontSize: 13, color: c.mutedForeground),
                ),
              ),
          ],
          if (_attempted && _to == null && open.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 2),
              child: Text(tr('Choose a branch to join.'), style: TextStyle(fontSize: 13, color: c.errorStrong)),
            ),
          const SizedBox(height: 16),
          BcTextField(
            controller: _reason,
            label: tr('Reason'),
            placeholder: tr('Why would you like to change branch?'),
            maxLines: 4,
            isError: _attempted && !_reasonValid,
            supportingText: _attempted && !_reasonValid
                ? tr('Add a short reason (at least {n} characters).', {'n': _minReason})
                : null,
            inputFormatters: [LengthLimitingTextInputFormatter(_maxReason)],
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded, size: 20, color: c.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  tr('Your branches change only after support approves the request.'),
                  style: TextStyle(fontSize: 14, color: c.mutedForeground, height: 1.4),
                ),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(fontSize: 14, color: c.errorStrong)),
          ],
        ],
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 2, bottom: 8),
    child: Text(
      text,
      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: context.bc.foreground),
    ),
  );
}

/// Bordered radio list: store icon, label, radio dot; the chosen row is highlighted.
class _ChoiceGroup extends StatelessWidget {
  const _ChoiceGroup({required this.items, required this.value, required this.onChanged, this.invalid = false});
  final List<(String, String)> items;
  final String? value;
  final ValueChanged<String> onChanged;
  final bool invalid;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(BcRadius.lg),
        border: Border.all(color: invalid ? c.error : c.border, width: invalid ? 2 : 1),
      ),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
            InkWell(
              onTap: () {
                BcFeedback.tap();
                onChanged(items[i].$1);
              },
              child: Container(
                color: value == items[i].$1 ? c.primarySoft : null,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                child: Row(
                  children: [
                    Icon(Icons.storefront_outlined, size: 22, color: c.primary),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        items[i].$2,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: value == items[i].$1 ? FontWeight.w700 : FontWeight.w400,
                          color: c.foreground,
                        ),
                      ),
                    ),
                    BcRadioDot(selected: value == items[i].$1, fill: c.primary, onFill: c.primaryForeground),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
