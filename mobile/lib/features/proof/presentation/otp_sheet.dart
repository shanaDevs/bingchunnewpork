import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../models/delivery_job.dart';
import '../../../theme/bc_theme.dart';

/// Opens the 6-digit delivery verification modal.
///
/// [onConfirm] is called with the entered code. Return the updated order to
/// close the modal, or `null` to keep it open (wrong code / API error).
/// [errorMessage] is shown under the pin boxes when confirm fails.
Future<JobOrder?> showDeliveryVerifyModal(
  BuildContext context, {
  required Future<JobOrder?> Function(String otp) onConfirm,
  Future<bool> Function()? onResend,
  String? Function()? errorMessage,
}) {
  return showModalBottomSheet<JobOrder>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0x990B1F3A),
    builder: (context) => Theme(
      data: BcTheme.stopLight,
      child: DeliveryVerifyModal(
        onConfirm: onConfirm,
        onResend: onResend,
        errorMessage: errorMessage,
      ),
    ),
  );
}

class DeliveryVerifyModal extends StatefulWidget {
  const DeliveryVerifyModal({
    super.key,
    required this.onConfirm,
    this.onResend,
    this.errorMessage,
  });

  final Future<JobOrder?> Function(String otp) onConfirm;
  final Future<bool> Function()? onResend;
  final String? Function()? errorMessage;

  @override
  State<DeliveryVerifyModal> createState() => _DeliveryVerifyModalState();
}

class _DeliveryVerifyModalState extends State<DeliveryVerifyModal>
    with SingleTickerProviderStateMixin {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  late final AnimationController _shake;
  bool _submitting = false;
  bool _resending = false;
  String? _localError;

  @override
  void initState() {
    super.initState();
    _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
    _controller.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    _shake.dispose();
    super.dispose();
  }

  String get _code => _controller.text.replaceAll(RegExp(r'\D'), '');

  Future<void> _submit() async {
    if (_code.length != 6 || _submitting) return;
    setState(() {
      _submitting = true;
      _localError = null;
    });
    final order = await widget.onConfirm(_code);
    if (!mounted) return;
    if (order != null) {
      Navigator.of(context).pop(order);
      return;
    }
    _shake.forward(from: 0);
    setState(() {
      _submitting = false;
      _localError = widget.errorMessage?.call() ?? 'That code did not match. Try again.';
    });
  }

  Future<void> _resend() async {
    final onResend = widget.onResend;
    if (onResend == null || _resending) return;
    setState(() => _resending = true);
    final ok = await onResend();
    if (!mounted) return;
    setState(() => _resending = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: ok ? BcColors.stopInk : BcColors.error,
        content: Text(ok ? 'Code sent to the customer' : 'Could not send the code'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final digits = _code.length;
    final canConfirm = digits == 6 && !_submitting;
    final error = _localError;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Align(
        alignment: Alignment.bottomCenter,
        child: Container(
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          decoration: BoxDecoration(
            color: BcColors.stopCard,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: BcColors.stopBorder),
            boxShadow: const [
              BoxShadow(color: Color(0x1A0B1F3A), blurRadius: 28, offset: Offset(0, 12)),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: BcColors.stopBorder,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: BcColors.stopBrandWash,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.verified_user_rounded, color: BcColors.brand, size: 22),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Delivery verification',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: BcColors.stopInk,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Ask the customer for their 6-digit delivery code.',
                          style: TextStyle(fontSize: 12.5, color: BcColors.stopMuted, height: 1.35),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _submitting ? null : () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, color: BcColors.stopMuted),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              AnimatedBuilder(
                animation: _shake,
                builder: (context, child) {
                  final t = _shake.value;
                  final dx = t == 0 || t == 1 ? 0.0 : (t < 0.25 || (t > 0.5 && t < 0.75) ? -8.0 : 8.0);
                  return Transform.translate(offset: Offset(dx, 0), child: child);
                },
                child: SizedBox(
                  height: 52,
                  child: Stack(
                    children: [
                    Row(
                      children: List.generate(6, (i) {
                        final filled = i < digits;
                        final active = i == digits && digits < 6;
                        final isError = error != null;
                        return Expanded(
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            margin: EdgeInsets.only(right: i == 5 ? 0 : 8),
                            height: 52,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: filled ? BcColors.stopBrandWash : BcColors.stopCanvas,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: isError
                                    ? BcColors.error
                                    : active
                                        ? BcColors.brand
                                        : BcColors.stopBorder,
                                width: active || isError ? 1.6 : 1,
                              ),
                            ),
                            child: Text(
                              filled ? _code[i] : '',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: BcColors.stopInk,
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                    Positioned.fill(
                      child: TextField(
                        controller: _controller,
                        focusNode: _focus,
                        autofocus: true,
                        keyboardType: TextInputType.number,
                        textInputAction: TextInputAction.done,
                        enableInteractiveSelection: true,
                        style: const TextStyle(color: Colors.transparent, fontSize: 1),
                        cursorColor: Colors.transparent,
                        showCursor: false,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(6),
                        ],
                        decoration: const InputDecoration(
                          counterText: '',
                          border: InputBorder.none,
                          filled: false,
                        ),
                        onSubmitted: (_) => _submit(),
                      ),
                    ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                error ?? '$digits of 6 digits entered.',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: error != null ? FontWeight.w600 : FontWeight.w400,
                  color: error != null ? BcColors.error : BcColors.stopMuted,
                ),
              ),
              const SizedBox(height: 14),
              if (widget.onResend != null)
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: _resending || _submitting ? null : _resend,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: BcColors.stopInk,
                      side: const BorderSide(color: BcColors.stopBorder),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _resending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: BcColors.brand),
                          )
                        : const Text('Send code to customer', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: canConfirm ? _submit : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BcColors.brand,
                    disabledBackgroundColor: BcColors.brandLight.withValues(alpha: 0.45),
                    foregroundColor: Colors.white,
                    disabledForegroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Text('Mark delivered', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
