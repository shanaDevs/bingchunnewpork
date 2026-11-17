import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../l10n/l10n.dart';
import '../components/inputs.dart';
import '../components/profile_kit.dart';
import '../theme/bc_theme.dart';

class _OrderChoice {
  const _OrderChoice(this.orderId, this.number, this.customer, this.at);
  final String orderId;
  final String number;
  final String customer;
  final String at;
}

/// English labels are what the backend stores; the UI text is translated via [tr].
const _categories = <(String, IconData)>[
  ('Payment', Icons.account_balance_wallet_outlined),
  ('Branch staff', Icons.storefront_outlined),
  ('App problem', Icons.smartphone_rounded),
  ('Customer behaviour', Icons.person_off_outlined),
  ('Safety', Icons.shield_outlined),
  ('Other', Icons.help_outline_rounded),
];

/// QuickDrop "Report a Complaint": pick the order, a category and describe the problem.
class NewComplaintScreen extends StatefulWidget {
  const NewComplaintScreen({super.key});

  @override
  State<NewComplaintScreen> createState() => _NewComplaintScreenState();
}

class _NewComplaintScreenState extends State<NewComplaintScreen> {
  static const _minChars = 10;
  static const _maxChars = 500;
  static const _maxOrders = 15;

  final _text = TextEditingController();
  late final Future<List<_OrderChoice>> _orders = _loadOrders();
  String? _orderId;
  String? _category;
  bool _attempted = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<List<_OrderChoice>> _loadOrders() async {
    final repo = context.read<AppContainer>().jobsRepository;
    final out = <_OrderChoice>[];
    final seen = <String>{};
    void add(DeliveryJobDetail job) {
      for (final o in job.orders) {
        if (out.length >= _maxOrders || o.orderId.isEmpty || !seen.add(o.orderId)) continue;
        out.add(_OrderChoice(o.orderId, o.orderNumber, o.customerName, Format.dateTime(job.completedAt ?? job.scheduledAt)));
      }
    }

    try {
      final active = await repo.getActiveJob();
      if (active != null) add(active);
    } catch (_) {}
    try {
      final history = await repo.listJobHistory();
      final jobs = await Future.wait(
        history.take(5).map((h) => repo.getJob(h.id).then<DeliveryJobDetail?>((j) => j).catchError((_) => null)),
      );
      for (final j in jobs) {
        if (j != null) add(j);
      }
    } catch (_) {}
    return out;
  }

  bool get _descOk => _text.text.trim().length >= _minChars;

  Future<void> _submit() async {
    setState(() => _attempted = true);
    if (_orderId == null || _category == null || !_descOk) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await context.read<AppContainer>().jobsRepository.createComplaint(_orderId!, _category!, _text.text.trim());
      if (!mounted) return;
      BcFeedback.tap();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('Complaint submitted. We will notify you when support replies.'))),
      );
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = tr("Couldn't submit your complaint. Check your connection and try again.");
      });
    }
  }

  Widget _label(String text) =>
      Text(text, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: context.bc.foreground));

  Widget _err(String text) => Padding(
    padding: const EdgeInsets.only(top: 6, left: 2),
    child: Text(text, style: TextStyle(fontSize: 13, color: context.bc.errorStrong)),
  );

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdPage(
      title: tr('Report a Complaint'),
      footer: QdPillButton(label: tr('Submit'), loading: _submitting, onPressed: _submit),
      children: [
        _label(tr('Which order is this about?')),
        const SizedBox(height: 8),
        FutureBuilder<List<_OrderChoice>>(
          future: _orders,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(padding: EdgeInsets.symmetric(vertical: 28), child: Center(child: CircularProgressIndicator()));
            }
            final list = snap.data ?? const <_OrderChoice>[];
            if (list.isEmpty) {
              return BcEmptyState(
                compact: true,
                icon: Icons.receipt_long_outlined,
                title: tr('No recent orders'),
                message: tr('No recent orders to report on. Report from the order screen during a delivery.'),
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _ChoiceCard(
                  invalid: _attempted && _orderId == null,
                  value: _orderId,
                  onChanged: (v) => setState(() => _orderId = v),
                  choices: [
                    for (final o in list)
                      _Choice(o.orderId, [o.number, o.customer, o.at].where((s) => s.trim().isNotEmpty).join(' · '), Icons.receipt_long_outlined),
                  ],
                ),
                if (_attempted && _orderId == null) _err(tr('Choose an order.')),
              ],
            );
          },
        ),
        const SizedBox(height: 22),
        _label(tr('Category')),
        const SizedBox(height: 8),
        _ChoiceCard(
          invalid: _attempted && _category == null,
          value: _category,
          onChanged: (v) => setState(() => _category = v),
          choices: [for (final k in _categories) _Choice(k.$1, tr(k.$1), k.$2)],
        ),
        if (_attempted && _category == null) _err(tr('Choose a category.')),
        const SizedBox(height: 22),
        BcTextField(
          controller: _text,
          label: tr('Describe the problem'),
          placeholder: tr('What happened? Include dates, branches or job numbers if relevant.'),
          maxLines: 6,
          isError: _attempted && !_descOk,
          onChanged: (_) => setState(() {}),
          supportingText: _attempted && !_descOk
              ? tr('Use between 10 and 500 characters.')
              : tr('{n}/{max}', {'n': _text.text.trim().length, 'max': _maxChars}),
          inputFormatters: [_MaxLen(_maxChars)],
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: c.errorSoftBg, borderRadius: BorderRadius.circular(BcRadius.card)),
            child: Row(
              children: [
                Icon(Icons.error_outline_rounded, color: c.errorStrong, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text(_error!, style: TextStyle(fontSize: 14, color: c.errorStrong))),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _MaxLen extends TextInputFormatter {
  _MaxLen(this.max);
  final int max;

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.text.length > max ? oldValue : newValue;
}

class _Choice {
  const _Choice(this.value, this.label, this.icon);
  final String value;
  final String label;
  final IconData icon;
}

/// Bordered card of radio rows (QuickDrop `ChoiceList`).
class _ChoiceCard extends StatelessWidget {
  const _ChoiceCard({required this.choices, required this.value, required this.onChanged, this.invalid = false});
  final List<_Choice> choices;
  final String? value;
  final ValueChanged<String> onChanged;
  final bool invalid;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(BcRadius.lg),
        border: Border.all(color: invalid ? c.error : c.border),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(BcRadius.lg),
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            children: [
              for (var i = 0; i < choices.length; i++) ...[
                if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                InkWell(
                  onTap: () {
                    BcFeedback.tap();
                    onChanged(choices[i].value);
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    child: Row(
                      children: [
                        Icon(choices[i].icon, size: 22, color: c.mutedForeground),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            choices[i].label,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: choices[i].value == value ? FontWeight.w700 : FontWeight.w500,
                              color: c.foreground,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: choices[i].value == value ? c.primary : c.iconMuted, width: 2),
                          ),
                          alignment: Alignment.center,
                          child: choices[i].value == value
                              ? Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: c.primary))
                              : null,
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
