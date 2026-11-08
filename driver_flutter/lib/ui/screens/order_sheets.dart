import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/models/delivery_job.dart';
import '../../state/job_controllers.dart';
import '../components/bc_dialog.dart';
import '../components/buttons.dart';
import '../components/inputs.dart';
import '../components/run_kit.dart';
import '../components/sheet_kit.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Port of OrderSheets.kt — complaint, failure and delivery-code sheets.
/// Each sheet watches the [OrderActionController] for submitting/error state and
/// closes itself when its async submit returns true.

const _noteMax = 250;

/// Every failure report needs a short explanation.
const _failureDescMin = 10;
const _complaintDescMin = 5;
const _complaintDescMax = 1000;
const _otpLength = 6;

enum ComplaintCategory {
  customerIssue('Customer issue'),
  wrongAddress('Wrong address'),
  paymentIssue('Payment issue'),
  damagedItems('Damaged or missing items'),
  other('Other');

  const ComplaintCategory(this.label);
  final String label;
}

Future<void> _showSheet(BuildContext context, OrderActionController vm, WidgetBuilder builder) {
  return showBcSheet<void>(
    context,
    builder: (ctx) => ChangeNotifierProvider<OrderActionController>.value(
      value: vm,
      child: Builder(builder: builder),
    ),
  );
}

Widget _errorNote(BuildContext context, String text) {
  final c = context.bc;
  return Container(
    margin: const EdgeInsets.only(top: 10),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(color: c.errorStrong.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(BcRadius.md)),
    child: Row(
      children: [
        Icon(Icons.error_outline_rounded, color: c.errorStrong, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text, style: TextStyle(color: c.errorStrong, fontSize: 13)),
        ),
      ],
    ),
  );
}

/// Driver complaint form — category + description before POST /delivery/me/complaints.
Future<void> showComplaintSheet(
  BuildContext context,
  OrderActionController vm,
  Future<bool> Function(String category, String description) onSubmit,
) => _showSheet(context, vm, (_) => _ComplaintSheet(onSubmit: onSubmit));

class _ComplaintSheet extends StatefulWidget {
  const _ComplaintSheet({required this.onSubmit});
  final Future<bool> Function(String category, String description) onSubmit;

  @override
  State<_ComplaintSheet> createState() => _ComplaintSheetState();
}

class _ComplaintSheetState extends State<_ComplaintSheet> {
  ComplaintCategory _selected = ComplaintCategory.values.first;
  final _desc = TextEditingController();

  @override
  void dispose() {
    _desc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<OrderActionController>();
    final len = _desc.text.trim().length;
    final ready = len >= _complaintDescMin;
    final showError = _desc.text.trim().isNotEmpty && !ready;
    return BcSheetBody(
      header: BcSheetHeader(
        icon: Icons.feedback_outlined,
        iconBg: c.primarySoft,
        iconTint: c.primaryStrong,
        title: tr('Raise complaint'),
        subtitle: tr('Describe the issue. Your branch admin will review it.'),
      ),
      children: [
        BcSheetLabel(tr('Category')),
        for (final cat in ComplaintCategory.values)
          BcChoiceTile(
            label: tr(cat.label),
            selected: cat == _selected,
            tone: BcDialogTone.brand,
            onTap: () => setState(() => _selected = cat),
          ),
        BcSheetLabel(tr('What happened?')),
        BcTextField(
          controller: _desc,
          placeholder: tr('Describe the issue'),
          maxLines: 5,
          isError: showError,
          inputFormatters: [LengthLimitingTextInputFormatter(_complaintDescMax)],
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 6),
        Text(
          tr('{len}/{_complaintDescMax} (min {_complaintDescMin})', {
            'len': len,
            '_complaintDescMax': _complaintDescMax,
            '_complaintDescMin': _complaintDescMin,
          }),
          textAlign: TextAlign.end,
          style: TextStyle(color: showError ? c.errorSoft : c.mutedForeground, fontSize: 12),
        ),
        if (vm.complaintError != null) _errorNote(context, vm.complaintError!),
        const SizedBox(height: 18),
        RunPrimaryButton(
          label: tr('Submit complaint'),
          icon: Icons.send_rounded,
          loading: vm.filingComplaint,
          enabled: ready,
          onPressed: () async {
            final nav = Navigator.of(context);
            if (await widget.onSubmit(_selected.label, _desc.text.trim())) nav.pop();
          },
        ),
      ],
    );
  }
}

/// Delivery-failure reason picker.
Future<void> showFailureSheet(
  BuildContext context,
  OrderActionController vm,
  Future<bool> Function(DeliveryOutcome outcome, String note) onSubmit, {
  String? orderNumber,
}) => _showSheet(context, vm, (_) => _FailureSheet(onSubmit: onSubmit, orderNumber: orderNumber));

class _FailureSheet extends StatefulWidget {
  const _FailureSheet({required this.onSubmit, this.orderNumber});
  final Future<bool> Function(DeliveryOutcome outcome, String note) onSubmit;

  /// Shown in the confirmation ("ORD-… will be put on hold…").
  final String? orderNumber;

  @override
  State<_FailureSheet> createState() => _FailureSheetState();
}

/// QuickDrop failure reasons: label, icon and the outcome the API understands.
const _failureReasons = <(String, IconData, DeliveryOutcome)>[
  ("Customer isn't there", Icons.person_off_outlined, DeliveryOutcome.customerUnreachable),
  ("Couldn't contact the customer", Icons.phone_disabled_outlined, DeliveryOutcome.customerUnreachable),
  ('Incorrect or missing code', Icons.vpn_key_outlined, DeliveryOutcome.other),
  ('Wrong address', Icons.location_off_outlined, DeliveryOutcome.wrongAddress),
  ('Damaged or missing items', Icons.inventory_2_outlined, DeliveryOutcome.other),
  ('Customer refused delivery', Icons.block_rounded, DeliveryOutcome.refused),
  ('Other', Icons.help_outline_rounded, DeliveryOutcome.other),
];

class _FailureSheetState extends State<_FailureSheet> {
  int? _selected;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<OrderActionController>();
    final descValid = _note.text.trim().length >= _failureDescMin;
    final ready = _selected != null && descValid;
    // Flag the empty/short description as soon as a reason is chosen.
    final descError = _selected != null && !descValid;
    return BcSheetBody(
      header: BcSheetHeader(title: tr('Report Delivery Failure')),
      children: [
        BcSheetLabel(tr('Why couldn\'t you deliver?')),
        Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: BorderRadius.circular(BcRadius.lg),
            border: Border.all(color: c.border),
          ),
          child: Column(
            children: [
              for (var i = 0; i < _failureReasons.length; i++) ...[
                if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                InkWell(
                  onTap: () => setState(() => _selected = i),
                  child: Container(
                    color: _selected == i ? c.primarySoft : null,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    child: Row(
                      children: [
                        Icon(_failureReasons[i].$2, size: 22, color: c.error),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            tr(_failureReasons[i].$1),
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: _selected == i ? FontWeight.w700 : FontWeight.w400,
                              color: c.foreground,
                            ),
                          ),
                        ),
                        BcRadioDot(selected: _selected == i, fill: c.primary, onFill: c.primaryForeground),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        BcTextField(
          controller: _note,
          label: tr('Description'),
          maxLines: 4,
          isError: descError,
          supportingText: descError ? tr('Add a short description (at least {n} characters).', {'n': _failureDescMin}) : null,
          inputFormatters: [LengthLimitingTextInputFormatter(_noteMax)],
          onChanged: (_) => setState(() {}),
        ),
        if (vm.failureError != null) _errorNote(context, vm.failureError!),
        const SizedBox(height: 18),
        RunPrimaryButton(
          label: tr('Send report'),
          icon: Icons.send_outlined,
          loading: vm.acting,
          enabled: ready,
          onPressed: () async {
            final nav = Navigator.of(context);
            final ref = widget.orderNumber == null ? tr('This order') : 'ORD-${widget.orderNumber}';
            final confirmed = await showBcConfirm(
              context,
              title: tr('Send This Report?'),
              message: tr(
                '{order} will be put on hold until support responds. You can keep delivering your other orders.',
                {'order': ref},
              ),
              confirmLabel: tr('Send report'),
              icon: null,
            );
            if (!confirmed || !mounted) return;
            final reason = _failureReasons[_selected!];
            final desc = _note.text.trim();
            final label = tr(reason.$1);
            final note = desc.isEmpty ? label : '$label: $desc';
            if (await widget.onSubmit(reason.$3, note.length > _noteMax ? note.substring(0, _noteMax) : note)) {
              nav.pop();
            }
          },
        ),
      ],
    );
  }
}

/// 6-digit delivery code modal — opened from Mark delivered, closed after a successful confirm.
Future<void> showDeliveryVerifySheet(
  BuildContext context,
  OrderActionController vm, {
  required String customerName,
  required VoidCallback onResend,
  required Future<bool> Function(String code) onConfirm,
}) =>
    _showSheet(context, vm, (_) => _VerifySheet(customerName: customerName, onResend: onResend, onConfirm: onConfirm));

class _VerifySheet extends StatefulWidget {
  const _VerifySheet({required this.customerName, required this.onResend, required this.onConfirm});
  final String customerName;
  final VoidCallback onResend;
  final Future<bool> Function(String code) onConfirm;

  @override
  State<_VerifySheet> createState() => _VerifySheetState();
}

class _VerifySheetState extends State<_VerifySheet> {
  String _otp = '';

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<OrderActionController>();
    final complete = _otp.length == _otpLength;
    final error = vm.error;
    return PopScope(
      canPop: !vm.acting,
      child: BcSheetBody(
        header: BcSheetHeader(
          icon: Icons.verified_user_rounded,
          iconBg: c.successSoft,
          iconTint: c.successStrong,
          title: tr('Delivery verification'),
          subtitle: tr('Ask {customerName} for their 6-digit delivery code.', {'customerName': widget.customerName}),
          onClose: vm.acting ? () {} : null,
        ),
        children: [
          BcSheetCard(
            padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                BcPinBoxes(
                  value: _otp,
                  onChanged: (v) => setState(() => _otp = v),
                  length: _otpLength,
                  isError: error != null,
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      error != null
                          ? Icons.error_outline_rounded
                          : complete
                          ? Icons.check_circle_rounded
                          : Icons.dialpad_rounded,
                      size: 16,
                      color: error != null ? c.errorSoft : (complete ? c.success : c.mutedForeground),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        error ??
                            tr('{length} of {_otpLength} digits entered.', {
                              'length': _otp.length,
                              '_otpLength': _otpLength,
                            }),
                        textAlign: TextAlign.center,
                        style: TextStyle(color: error != null ? c.errorSoft : c.mutedForeground, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          BcOutlineButton(
            label: vm.sendingCode ? tr('Sending…') : tr('Send code to customer'),
            icon: Icons.sms_outlined,
            loading: vm.sendingCode,
            expand: true,
            onPressed: widget.onResend,
          ),
          if (vm.codeSent && error == null) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.mark_email_read_outlined, size: 16, color: c.success),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    tr('A new code was sent to {customerName}.', {'customerName': widget.customerName}),
                    style: TextStyle(color: c.success, fontSize: 13),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          RunPrimaryButton(
            label: tr('Mark delivered'),
            icon: Icons.verified_rounded,
            loading: vm.acting,
            enabled: complete,
            onPressed: () async {
              final nav = Navigator.of(context);
              if (await widget.onConfirm(_otp)) nav.pop();
            },
          ),
        ],
      ),
    );
  }
}
