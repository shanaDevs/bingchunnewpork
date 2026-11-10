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
  final Future<void> Function(
    String type,
    String toStoreId,
    String? reason,
    String? fromStoreId,
  )
  onSubmit;

  /// Opens the screen; true once a request was sent.
  static Future<bool> open(
    BuildContext context, {
    required List<StoreRef> assigned,
    required List<BranchOption> stores,
    required String? homeStoreId,
    required Future<void> Function(
      String type,
      String toStoreId,
      String? reason,
      String? fromStoreId,
    )
    onSubmit,
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

enum _Mode { add, change, remove }

class _BranchRequestScreenState extends State<BranchRequestScreen> {
  _Mode _mode = _Mode.change;
  String? _removeId;
  final _reason = TextEditingController();
  final _search = TextEditingController();
  String _query = '';
  String? _from;
  String? _to;
  bool _attempted = false;
  bool _submitting = false;
  String? _error;

  late final Set<String> _assignedIds = widget.assigned
      .map((b) => b.id)
      .where((id) => id.isNotEmpty)
      .toSet();

  /// Branches the rider isn't on yet; closed ones are listed but can't be chosen.
  late final List<BranchOption> _others = widget.stores
      .where((s) => !_assignedIds.contains(s.id))
      .toList();

  @override
  void initState() {
    super.initState();
    final assigned = widget.assigned.where((b) => b.id.isNotEmpty).toList();
    _from = assigned.any((b) => b.id == widget.homeStoreId)
        ? widget.homeStoreId
        : assigned.firstOrNull?.id;
  }

  @override
  void dispose() {
    _reason.dispose();
    _search.dispose();
    super.dispose();
  }

  bool get _reasonValid => _reason.text.trim().length >= _minReason;
  bool get _chooseFrom =>
      widget.assigned.where((b) => b.id.isNotEmpty).length > 1;

  /// Assigned branches that can be removed (the home branch can't be).
  List<StoreRef> get _removable => widget.assigned
      .where((b) => b.id.isNotEmpty && b.id != widget.homeStoreId)
      .toList();

  void _setMode(_Mode m) {
    if (m == _mode) return;
    BcFeedback.tap();
    setState(() {
      _mode = m;
      _attempted = false;
      _error = null;
    });
  }

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
    final isRemove = _mode == _Mode.remove;
    final isChange = _mode == _Mode.change;
    final target = isRemove ? _removeId : _to;
    if (target == null ||
        !_reasonValid ||
        (isChange && _chooseFrom && _from == null)) {
      BcFeedback.error();
      return;
    }
    final confirmed = await showBcConfirm(
      context,
      title: isRemove
          ? tr('Request branch removal?')
          : isChange
          ? tr('Request branch change?')
          : tr('Request new branch?'),
      message: isRemove
          ? tr(
              'Remove {branch}. Your branches change only after support approves the request.',
              {'branch': _name(_removeId)},
            )
          : tr(
              '{from} → {to}. Your branches change only after support approves the request.',
              {
                'from': isChange && _chooseFrom
                    ? _name(_from)
                    : tr('Your branches'),
                'to': _name(_to),
              },
            ),
      confirmLabel: tr('Send request'),
      icon: isRemove ? Icons.remove_circle_outline : Icons.swap_horiz_rounded,
    );
    if (!confirmed || !mounted) return;
    setState(() => _submitting = true);
    try {
      await widget.onSubmit(
        isRemove ? 'REMOVE_BRANCH' : 'ADD_BRANCH',
        target,
        _reason.text.trim(),
        isChange && _chooseFrom ? _from : null,
      );
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
    final q = _query.trim().toLowerCase();
    bool matches(BranchOption b) =>
        q.isEmpty ||
        b.name.toLowerCase().contains(q) ||
        (nonBlank(b.city) ?? '').toLowerCase().contains(q);
    final allOpen = _others.where((b) => b.isActive).toList();
    final open = allOpen.where(matches).toList();
    final closed = _others.where((b) => !b.isActive).where(matches).toList();
    String label(String name, String? city) =>
        [name, if (nonBlank(city) != null) city!].join(' · ');

    return PopScope(
      canPop: !_submitting,
      child: QdPage(
        title: tr('Request Branch Change'),
        footer: PillButton(
          label: tr('Send request'),
          icon: Icons.send_outlined,
          height: 56,
          loading: _submitting,
          onTap: (_mode == _Mode.remove ? _removable.isEmpty : allOpen.isEmpty)
              ? null
              : _send,
        ),
        children: [
          _ModeSwitch(
            mode: _mode,
            onChanged: _setMode,
            labels: {
              _Mode.add: tr('Add'),
              _Mode.change: tr('Change'),
              _Mode.remove: tr('Remove'),
            },
          ),
          const SizedBox(height: 20),
          if (_mode == _Mode.remove) ...[
            _Label(tr('Branch to remove'), required: true),
            if (_removable.isEmpty)
              Text(
                tr(
                  'Your home branch cannot be removed. Request a branch change first.',
                ),
                style: TextStyle(fontSize: 14, color: c.mutedForeground),
              )
            else ...[
              _ChoiceGroup(
                items: [
                  for (final b in _removable) (b.id, label(b.name, b.city)),
                ],
                value: _removeId,
                invalid: _attempted && _removeId == null,
                onChanged: (v) => setState(() => _removeId = v),
              ),
              if (_attempted && _removeId == null)
                Padding(
                  padding: const EdgeInsets.only(top: 6, left: 2),
                  child: Text(
                    tr('Choose a branch to remove.'),
                    style: TextStyle(fontSize: 13, color: c.errorStrong),
                  ),
                ),
            ],
          ],
          if (_mode == _Mode.change && _chooseFrom) ...[
            _Label(tr('Branch to leave')),
            _ChoiceGroup(
              items: [
                for (final b in widget.assigned.where((b) => b.id.isNotEmpty))
                  (b.id, label(b.name, b.city)),
              ],
              value: _from,
              onChanged: (v) => setState(() => _from = v),
            ),
            const SizedBox(height: 16),
          ],
          if (_mode != _Mode.remove) ...[
            _Label(tr('Requested branch'), required: true),
            if (allOpen.isEmpty)
              Text(
                tr('There are no other branches to join right now.'),
                style: TextStyle(fontSize: 14, color: c.mutedForeground),
              )
            else ...[
              _BranchSearchField(
                controller: _search,
                onChanged: (v) => setState(() => _query = v),
              ),
              const SizedBox(height: 10),
              if (open.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 8,
                    horizontal: 2,
                  ),
                  child: Text(
                    tr('No branches match that search.'),
                    style: TextStyle(fontSize: 14, color: c.mutedForeground),
                  ),
                )
              else
                _ChoiceGroup(
                  items: [for (final b in open) (b.id, label(b.name, b.city))],
                  value: _to,
                  invalid: _attempted && _to == null,
                  maxHeight: 280,
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
            if (_attempted && _to == null && allOpen.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6, left: 2),
                child: Text(
                  tr('Choose a branch to join.'),
                  style: TextStyle(fontSize: 13, color: c.errorStrong),
                ),
              ),
          ],
          const SizedBox(height: 16),
          _Label(tr('Reason'), required: true),
          BcTextField(
            controller: _reason,
            placeholder: tr('Why would you like to change branch?'),
            maxLines: 4,
            isError: _attempted && !_reasonValid,
            supportingText: _attempted && !_reasonValid
                ? tr('Add a short reason (at least {n} characters).', {
                    'n': _minReason,
                  })
                : tr('Required · at least {n} characters', {'n': _minReason}),
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
                  tr(
                    'Your branches change only after support approves the request.',
                  ),
                  style: TextStyle(
                    fontSize: 14,
                    color: c.mutedForeground,
                    height: 1.4,
                  ),
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
  const _Label(this.text, {this.required = false});
  final String text;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 8),
      child: Text.rich(
        TextSpan(
          text: text,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: c.foreground,
          ),
          children: [
            if (required)
              TextSpan(
                text: ' *',
                style: TextStyle(color: c.errorStrong),
              ),
          ],
        ),
      ),
    );
  }
}

/// Pill-shaped slider: Add / Change / Remove, with the selected segment filled.
class _ModeSwitch extends StatelessWidget {
  const _ModeSwitch({
    required this.mode,
    required this.onChanged,
    required this.labels,
  });
  final _Mode mode;
  final ValueChanged<_Mode> onChanged;
  final Map<_Mode, String> labels;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    const modes = _Mode.values;
    return Container(
      height: 56,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: c.border),
      ),
      child: Stack(
        children: [
          AnimatedAlign(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            alignment: Alignment(-1 + mode.index * 2 / (modes.length - 1), 0),
            child: FractionallySizedBox(
              widthFactor: 1 / modes.length,
              heightFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: c.primary,
                  borderRadius: BorderRadius.circular(24),
                ),
              ),
            ),
          ),
          Row(
            children: [
              for (final m in modes)
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: m == mode,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(24),
                      onTap: () => onChanged(m),
                      child: Center(
                        child: Text(
                          labels[m]!,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: m == mode
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: m == mode
                                ? c.primaryForeground
                                : c.mutedForeground,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Search box above the branch list; filters by branch name or city.
class _BranchSearchField extends StatelessWidget {
  const _BranchSearchField({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    OutlineInputBorder border(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: color, width: width),
        );
    return SizedBox(
      height: 52,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        autocorrect: false,
        cursorColor: c.primary,
        style: TextStyle(fontSize: 15, color: c.foreground),
        decoration: InputDecoration(
          hintText: tr('Search branches'),
          hintStyle: TextStyle(fontSize: 15, color: c.mutedForeground),
          filled: true,
          fillColor: c.surface,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12),
          prefixIcon: Icon(
            Icons.search_rounded,
            size: 20,
            color: c.mutedForeground,
          ),
          suffixIcon: controller.text.isEmpty
              ? null
              : IconButton(
                  tooltip: tr('Clear search'),
                  icon: Icon(
                    Icons.close_rounded,
                    size: 20,
                    color: c.mutedForeground,
                  ),
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                ),
          border: border(c.border),
          enabledBorder: border(c.border),
          focusedBorder: border(c.primary, 2),
        ),
      ),
    );
  }
}

/// Bordered radio list: store icon, label, radio dot; the chosen row is highlighted.
class _ChoiceGroup extends StatelessWidget {
  const _ChoiceGroup({
    required this.items,
    required this.value,
    required this.onChanged,
    this.invalid = false,
    this.maxHeight,
  });

  /// When set, the list scrolls inside this height so the fields below stay in view.
  final double? maxHeight;
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
        border: Border.all(
          color: invalid ? c.error : c.border,
          width: invalid ? 2 : 1,
        ),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight ?? double.infinity),
        child: SingleChildScrollView(
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 14,
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.storefront_outlined,
                          size: 22,
                          color: c.primary,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            items[i].$2,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: value == items[i].$1
                                  ? FontWeight.w700
                                  : FontWeight.w400,
                              color: c.foreground,
                            ),
                          ),
                        ),
                        BcRadioDot(
                          selected: value == items[i].$1,
                          fill: c.primary,
                          onFill: c.primaryForeground,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
