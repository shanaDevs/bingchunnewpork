import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/format.dart';
import '../components/bc_dialog.dart';
import '../components/buttons.dart';
import '../components/inputs.dart';
import '../components/run_kit.dart';
import '../components/sheet_kit.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Port of JobSheets.kt — reject reasons, claim confirmation, vehicle failure, branch requests.

const _rejectNoteMax = 250;
const _rejectReasons = [
  'Too far from my area',
  'Vehicle problem',
  'Already carrying a full load',
  'Ending my shift',
  'Other',
];

/// Reason picker shown before a driver declines an assigned run. Returns the reason, or null.
Future<String?> showRejectJobDialog(BuildContext context) =>
    showBcDialog<String>(context, builder: (_) => const _RejectJobDialog());

class _RejectJobDialog extends StatefulWidget {
  const _RejectJobDialog();

  @override
  State<_RejectJobDialog> createState() => _RejectJobDialogState();
}

class _RejectJobDialogState extends State<_RejectJobDialog> {
  String _selected = _rejectReasons.first;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final needsNote = _selected == _rejectReasons.last;
    final ready = !needsNote || _note.text.trim().isNotEmpty;
    return BcDialog(
      icon: Icons.do_not_disturb_on_outlined,
      tone: BcDialogTone.danger,
      title: tr('Reject this job?'),
      message: tr('Tell dispatch why so they can hand it to another driver. Rejecting deducts 5 merit points.'),
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final r in _rejectReasons)
            BcChoiceTile(
              label: tr(r),
              selected: r == _selected,
              tone: BcDialogTone.danger,
              onTap: () => setState(() => _selected = r),
            ),
          if (needsNote) ...[
            const SizedBox(height: 4),
            BcTextField(
              controller: _note,
              label: tr('Reason'),
              maxLines: 4,
              isError: _note.text.trim().isEmpty,
              inputFormatters: [LengthLimitingTextInputFormatter(_rejectNoteMax)],
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 4),
            Text(
              '${_note.text.length}/$_rejectNoteMax',
              textAlign: TextAlign.end,
              style: BcType.tiny.copyWith(color: _note.text.trim().isEmpty ? c.errorSoft : c.mutedForeground),
            ),
          ],
        ],
      ),
      primaryLabel: tr('Reject'),
      primaryEnabled: ready,
      onPrimary: () => Navigator.of(context).pop(_note.text.trim().isEmpty ? _selected : _note.text.trim()),
      secondaryLabel: tr('Cancel'),
      onSecondary: () => Navigator.of(context).pop(),
    );
  }
}

/// Confirmation shown before a driver claims/accepts a job so a stray tap can't grab it.
/// [onConfirm] runs while the sheet shows a spinner; returning true closes the sheet.
Future<void> showClaimJobSheet(
  BuildContext context, {
  required String storeName,
  required Future<bool> Function() onConfirm,
  String? title,
  String? confirmLabel,
  String? subtitle,
  int? fee,
  int? stopCount,
  double? distanceKm,
  int? minutes,
  int? pickupRadiusM,
}) {
  return showBcSheet<void>(
    context,
    builder: (_) => _ClaimJobSheet(
      storeName: storeName,
      onConfirm: onConfirm,
      title: title ?? tr('Claim this job?'),
      confirmLabel: confirmLabel ?? tr('Claim job'),
      subtitle: subtitle,
      fee: fee,
      stopCount: stopCount,
      distanceKm: distanceKm,
      minutes: minutes,
      pickupRadiusM: pickupRadiusM,
    ),
  );
}

class _ClaimJobSheet extends StatefulWidget {
  const _ClaimJobSheet({
    required this.storeName,
    required this.onConfirm,
    required this.title,
    required this.confirmLabel,
    this.subtitle,
    this.fee,
    this.stopCount,
    this.distanceKm,
    this.minutes,
    this.pickupRadiusM,
  });

  final String storeName;
  final Future<bool> Function() onConfirm;
  final String title;
  final String confirmLabel;
  final String? subtitle;
  final int? fee;
  final int? stopCount;
  final double? distanceKm;
  final int? minutes;
  final int? pickupRadiusM;

  @override
  State<_ClaimJobSheet> createState() => _ClaimJobSheetState();
}

class _ClaimJobSheetState extends State<_ClaimJobSheet> {
  bool _submitting = false;

  Future<void> _confirm() async {
    setState(() => _submitting = true);
    final done = await widget.onConfirm();
    if (!mounted) return;
    if (done) {
      Navigator.of(context).pop();
    } else {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final fee = widget.fee;
    final stops = widget.stopCount;
    final km = widget.distanceKm;
    final min = widget.minutes;
    final headline = [widget.storeName, widget.subtitle ?? ''].where((s) => s.trim().isNotEmpty).join(' · ');

    return PopScope(
      canPop: !_submitting,
      child: BcSheetBody(
        header: BcSheetHeader(
          leading: Container(
            width: 60,
            height: 60,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: c.card,
              border: Border.all(color: c.primaryStrong.withValues(alpha: 0.35), width: 2),
              boxShadow: [BoxShadow(color: c.primaryStrong.withValues(alpha: 0.2), blurRadius: 10, offset: const Offset(0, 3))],
            ),
            // Logo fills the circle edge to edge (zoomed slightly so no square corners show).
            child: ClipOval(
              child: Transform.scale(
                scale: 1.12,
                child: Image.asset('assets/images/logo.png', fit: BoxFit.cover),
              ),
            ),
          ),
          title: widget.title,
          subtitle: headline.isEmpty ? tr('Confirm you want to take this delivery run.') : headline,
          onClose: _submitting ? () {} : null,
        ),
        children: [
          if (fee != null && fee > 0) ...[
            Container(
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(BcRadius.card),
                color: c.success,
              ),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: c.successForeground.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(BcRadius.md),
                    ),
                    child: Icon(Icons.account_balance_wallet_rounded, color: c.successForeground, size: 23),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr('Delivery Fee'),
                          style: TextStyle(color: c.successForeground.withValues(alpha: 0.9), fontSize: 13),
                        ),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(
                            Format.money(fee),
                            style: TextStyle(color: c.successForeground, fontSize: 24, fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          RunFactRow(
            tiles: [
              if (stops != null && stops > 0)
                RunFactTile(
                  icon: Icons.location_on_rounded,
                  tint: c.primaryStrong,
                  value: '$stops',
                  label: stops == 1 ? tr('Stop') : tr('Stops'),
                ),
              if (km != null && km > 0)
                RunFactTile(icon: Icons.route_rounded, tint: c.success, value: Format.km(km), label: tr('Distance')),
              if (min != null && min > 0)
                RunFactTile(
                  icon: Icons.schedule_rounded,
                  tint: c.warning,
                  value: Format.minutes(min),
                  label: tr('ETA'),
                ),
            ],
          ),
          if (widget.pickupRadiusM != null && widget.pickupRadiusM! > 0) ...[
            const SizedBox(height: 12),
            RunNote(
              icon: Icons.verified_user_outlined,
              text: tr('Confirm pickup unlocks within {pickupRadiusM}m of the branch.', {
                'pickupRadiusM': widget.pickupRadiusM,
              }),
            ),
          ],
          const SizedBox(height: 18),
          RunPrimaryButton(
            label: widget.confirmLabel,
            icon: Icons.check_circle_rounded,
            loading: _submitting,
            enabled: !_submitting,
            onPressed: _confirm,
          ),
          const SizedBox(height: 4),
          BcTextButton(label: tr('Cancel'), onPressed: _submitting ? null : () => Navigator.of(context).pop()),
        ],
      ),
    );
  }
}

const _vehicleFailureNoteMax = 250;

/// Confirmation for a driver reporting their vehicle has broken down mid-ride.
/// [onSubmit] throws on failure; the message is shown inside the sheet.
Future<bool> showVehicleFailureDialog(BuildContext context, Future<void> Function(String? note) onSubmit) async {
  final result = await showBcSheet<bool>(
    context,
    dismissible: false,
    builder: (_) => _VehicleFailureSheet(onSubmit: onSubmit),
  );
  return result ?? false;
}

class _VehicleFailureSheet extends StatefulWidget {
  const _VehicleFailureSheet({required this.onSubmit});
  final Future<void> Function(String? note) onSubmit;

  @override
  State<_VehicleFailureSheet> createState() => _VehicleFailureSheetState();
}

class _VehicleFailureSheetState extends State<_VehicleFailureSheet> {
  final _note = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final note = _note.text.trim();
      await widget.onSubmit(note.isEmpty ? null : note);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e is StateError ? e.message : e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final red = c.errorStrong;
    return PopScope(
      canPop: !_submitting,
      child: BcSheetBody(
        header: BcSheetHeader(
          icon: Icons.build_outlined,
          iconBg: c.errorSoftBg,
          iconTint: red,
          title: tr('Report vehicle failure?'),
          subtitle: tr('Admin will send another rider to you'),
          onClose: _submitting ? () {} : () => Navigator.of(context).pop(false),
        ),
        children: [
          BcSheetCard(
            color: c.errorSoftBg,
            borderColor: c.error.withValues(alpha: 0.25),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, color: red, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    tr(
                      'This removes the ride from My active job. Admin will send another rider to your current location. You will not continue this run or return to the branch on it.',
                    ),
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.45,
                      color: c.errorStrong,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          BcTextField(
            controller: _note,
            label: tr('What happened? (optional)'),
            maxLines: 4,
            inputFormatters: [LengthLimitingTextInputFormatter(_vehicleFailureNoteMax)],
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: BcType.caption.copyWith(color: c.errorSoft, fontSize: 12)),
          ],
          const SizedBox(height: 18),
          RunPrimaryButton(
            label: _submitting ? tr('Reporting…') : tr('Report failure'),
            icon: Icons.error_outline_rounded,
            loading: _submitting,
            colors: [c.error],
            onPressed: _submit,
          ),
          const SizedBox(height: 8),
          BcOutlineButton(
            label: tr('Cancel'),
            expand: true,
            enabled: !_submitting,
            onPressed: () => Navigator.of(context).pop(false),
          ),
        ],
      ),
    );
  }
}
