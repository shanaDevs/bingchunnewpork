import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/models/delivery_job.dart';
import '../../state/job_controllers.dart';
import '../components/bc_dialog.dart';
import '../components/buttons.dart';
import '../components/inputs.dart';
import '../components/sheet_kit.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Port of OrderSheets.kt — complaint, failure and delivery-code sheets.
/// Each sheet watches the [OrderActionController] for submitting/error state and
/// closes itself when its async submit returns true.

const _noteMax = 250;
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

const _green = [Color(0xFF34D399), Color(0xFF10B981), Color(0xFF059669)];
const _red = [Color(0xFFF87171), Color(0xFFDC2626), Color(0xFFB91C1C)];

Widget _errorNote(BuildContext context, String text) {
  final c = context.bc;
  return Container(
    margin: const EdgeInsets.only(top: 10),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(color: c.danger.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
    child: Row(
      children: [
        Icon(Icons.error_outline_rounded, color: c.danger, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text, style: TextStyle(color: c.danger, fontSize: 12.5)),
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
        iconBg: c.brandSubtle,
        iconTint: c.brand,
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
          style: TextStyle(color: showError ? c.errorSoft : c.textMuted, fontSize: 12),
        ),
        if (vm.complaintError != null) _errorNote(context, vm.complaintError!),
        const SizedBox(height: 18),
        BcGradientButton(
          label: tr('Submit complaint'),
          icon: Icons.send_rounded,
          colors: [c.brandLight, c.brand, c.brandDark],
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
  Future<bool> Function(DeliveryOutcome outcome, String note) onSubmit,
) => _showSheet(context, vm, (_) => _FailureSheet(onSubmit: onSubmit));

class _FailureSheet extends StatefulWidget {
  const _FailureSheet({required this.onSubmit});
  final Future<bool> Function(DeliveryOutcome outcome, String note) onSubmit;

  @override
  State<_FailureSheet> createState() => _FailureSheetState();
}

class _FailureSheetState extends State<_FailureSheet> {
  DeliveryOutcome _selected = DeliveryOutcome.values.first;
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
    final needsNote = _selected == DeliveryOutcome.other;
    final ready = !needsNote || _note.text.trim().isNotEmpty;
    final dark = c.isDark;
    return BcSheetBody(
      header: BcSheetHeader(
        icon: Icons.report_gmailerrorred_rounded,
        iconBg: dark ? const Color(0xFF3B1E22) : const Color(0xFFFEE2E2),
        iconTint: c.danger,
        title: tr('Report delivery failure'),
        subtitle: needsNote
            ? tr('Driver error — remaining stops stay on this ride.')
            : tr('Customer not available — later stops can be reassigned.'),
      ),
      children: [
        BcSheetLabel(tr('What went wrong?')),
        for (final o in DeliveryOutcome.values)
          BcChoiceTile(
            label: tr(o.label),
            selected: o == _selected,
            tone: BcDialogTone.danger,
            onTap: () => setState(() => _selected = o),
          ),
        if (needsNote) ...[
          BcSheetLabel(tr('What happened?')),
          BcTextField(
            controller: _note,
            placeholder: tr('Describe the issue'),
            maxLines: 4,
            isError: _note.text.trim().isEmpty,
            inputFormatters: [LengthLimitingTextInputFormatter(_noteMax)],
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 6),
          Text(
            '${_note.text.length}/$_noteMax',
            textAlign: TextAlign.end,
            style: TextStyle(color: _note.text.trim().isEmpty ? c.errorSoft : c.textMuted, fontSize: 12),
          ),
        ],
        if (vm.failureError != null) _errorNote(context, vm.failureError!),
        const SizedBox(height: 18),
        BcGradientButton(
          label: tr('Submit failure'),
          icon: Icons.error_outline_rounded,
          colors: _red,
          loading: vm.acting,
          enabled: ready,
          onPressed: () async {
            final nav = Navigator.of(context);
            final note = _note.text.trim().isEmpty ? _selected.label : _note.text.trim();
            if (await widget.onSubmit(_selected, note)) nav.pop();
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
    final dark = c.isDark;
    return PopScope(
      canPop: !vm.acting,
      child: BcSheetBody(
        header: BcSheetHeader(
          icon: Icons.verified_user_rounded,
          iconBg: dark ? const Color(0xFF064E3B) : const Color(0xFFDCFCE7),
          iconTint: c.success,
          title: tr('Delivery verification'),
          subtitle: tr('Ask {customerName} for their 6-digit delivery code.', {'customerName': widget.customerName}),
          onClose: vm.acting ? () {} : null,
        ),
        children: [
          BcSheetCard(
            padding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
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
                      color: error != null ? c.errorSoft : (complete ? c.success : c.textMuted),
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
                        style: TextStyle(color: error != null ? c.errorSoft : c.textMuted, fontSize: 12.5),
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
                    style: TextStyle(color: c.success, fontSize: 12.5),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          BcGradientButton(
            label: tr('Mark delivered'),
            icon: Icons.verified_rounded,
            colors: _green,
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
