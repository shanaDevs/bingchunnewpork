import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:sms_autofill/sms_autofill.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../state/auth_controller.dart';
import '../components/auth_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';
import 'rider_not_found_screen.dart';
import '../../l10n/l10n.dart';

const _codeLength = 6;
const _resendAfter = 60;

/// Mobile-number sign-in, step 2 — enter (or auto-fill) the texted code.
/// A good code signs the rider in; a number with no rider account opens [RiderNotFoundScreen].
class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, this.appSignature});

  final String? appSignature;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> with CodeAutoFill {
  final _code = TextEditingController();
  final _focus = FocusNode();
  Timer? _resendTimer;
  int _resendSeconds = _resendAfter;
  bool _resending = false;

  /// Codes from an earlier SMS that must not be auto-filled after a resend.
  final Set<String> _staleCodes = {};

  @override
  void initState() {
    super.initState();
    _startResendTimer();
    _listenForSms();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    cancel();
    unregisterListener();
    _code.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _listenForSms() async {
    try {
      await cancel();
      await unregisterListener();
    } catch (_) {}
    listenForCode(smsCodeRegexPattern: r'(\d{6})');
  }

  /// SMS Retriever delivered a message — pull the code out and verify it.
  @override
  void codeUpdated() {
    final match = RegExp(r'\d{6}').firstMatch(code ?? '');
    if (match == null || !mounted) return;
    final six = match.group(0)!;
    if (_staleCodes.contains(six) || six == _code.text) return;
    _code.text = six;
    _verify();
  }

  void _startResendTimer() {
    _resendTimer?.cancel();
    setState(() => _resendSeconds = _resendAfter);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendSeconds -= 1);
      if (_resendSeconds <= 0) t.cancel();
    });
  }

  Future<void> _resend(AuthController auth) async {
    final phone = auth.otpPhone;
    if (phone == null || _resending) return;
    BcFeedback.tap();
    if (_code.text.length == _codeLength) _staleCodes.add(_code.text);
    final previous = code;
    if (previous != null) _staleCodes.add(previous);
    setState(() => _resending = true);
    final sent = await auth.requestOtp(phone, appSignature: widget.appSignature);
    if (!mounted) return;
    setState(() => _resending = false);
    if (!sent) return BcFeedback.error();
    _code.clear();
    _startResendTimer();
    _listenForSms();
    _focus.requestFocus();
  }

  Future<void> _verify() async {
    final auth = context.read<AuthController>();
    if (_code.text.length != _codeLength || auth.loading) return;
    FocusScope.of(context).unfocus();
    final result = await auth.verifyOtp(_code.text);
    if (!mounted) return;
    switch (result) {
      case OtpVerifyResult.signedIn:
        // The auth gate swaps to the dashboard and clears this route.
        BcFeedback.success();
      case OtpVerifyResult.notRider:
        BcFeedback.error();
        Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(builder: (_) => RiderNotFoundScreen(phone: auth.otpPhone ?? '')),
        );
      case OtpVerifyResult.invalidCode:
        BcFeedback.error();
        _staleCodes.add(_code.text);
        _code.clear();
        _focus.requestFocus();
      case OtpVerifyResult.failed:
        BcFeedback.error();
    }
  }

  String _clock(int s) => '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final auth = context.watch<AuthController>();
    final phone = Format.lkMobileDisplay(auth.otpPhone ?? '');
    final busy = auth.loading && !_resending;

    return BcAuthScaffold(
      onBack: () => Navigator.of(context).maybePop(),
      hero: Padding(
        padding: const EdgeInsets.fromLTRB(16, 28, 16, 36),
        child: BcAuthGreeting(
          center: true,
          title: tr('Enter the code'),
          titleSize: 34,
          subtitle: tr('We’ve sent a 6-digit code to'),
          extra: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              phone,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: c.heroTitle,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CodeBoxes(
            controller: _code,
            focusNode: _focus,
            isError: auth.error != null,
            enabled: !busy,
            onChanged: (v) {
              auth.clearError();
              if (v.length == _codeLength) _verify();
            },
          ),
          const SizedBox(height: 12),
          AnimatedSwitcher(
            duration: BcMotion.fast,
            child: Text(
              auth.error ?? tr('The code is valid for 10 minutes.'),
              key: ValueKey(auth.error),
              textAlign: TextAlign.center,
              style: BcType.caption.copyWith(
                fontSize: 14,
                color: auth.error != null ? c.errorStrong : c.mutedForeground,
              ),
            ),
          ),
          const SizedBox(height: 24),
          ListenableBuilder(
            listenable: _code,
            builder: (context, _) => BcAuthButton(
              label: busy ? tr('Verifying…') : tr('Verify'),
              icon: null,
              loading: busy,
              enabled: _code.text.length == _codeLength && !busy,
              onPressed: _verify,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 6,
            children: [
              Text(tr('Didn’t receive the code?'), style: BcType.caption.copyWith(fontSize: 14, color: c.mutedForeground)),
              if (_resendSeconds > 0)
                Text(
                  tr('Resend in {time}', {'time': _clock(_resendSeconds)}),
                  style: BcType.caption.copyWith(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: c.primaryStrong,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                )
              else if (_resending)
                SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: c.primaryStrong))
              else
                InkWell(
                  onTap: busy ? null : () => _resend(auth),
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      tr('Resend code'),
                      style: BcType.caption.copyWith(fontSize: 14, fontWeight: FontWeight.w700, color: c.primaryStrong),
                    ),
                  ),
                ),
            ],
          ),
          TextButton(
            onPressed: () => Navigator.of(context).maybePop(),
            child: Text(tr('Change mobile number'), style: BcType.caption.copyWith(fontSize: 14, color: c.mutedForeground)),
          ),
        ],
      ),
    );
  }
}

/// Six digit boxes over one invisible field, so paste, keyboard autofill
/// (`oneTimeCode`) and backspace all behave like a normal text input.
class _CodeBoxes extends StatelessWidget {
  const _CodeBoxes({
    required this.controller,
    required this.focusNode,
    required this.isError,
    required this.enabled,
    required this.onChanged,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isError;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return GestureDetector(
      onTap: enabled ? focusNode.requestFocus : null,
      child: SizedBox(
        height: 60,
        child: Stack(
          children: [
            ListenableBuilder(
              listenable: Listenable.merge([controller, focusNode]),
              builder: (context, _) {
                final text = controller.text;
                return Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < _codeLength; i++) ...[
                      if (i > 0) const SizedBox(width: 8),
                      Flexible(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 52),
                          child: _box(
                            c,
                            digit: i < text.length ? text[i] : null,
                            active: focusNode.hasFocus && i == text.length.clamp(0, _codeLength - 1),
                          ),
                        ),
                      ),
                    ],
                  ],
                );
              },
            ),
            // The real input — invisible but focusable and fully functional.
            Positioned.fill(
              child: Opacity(
                opacity: 0,
                child: TextField(
                  controller: controller,
                  focusNode: focusNode,
                  enabled: enabled,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  showCursor: false,
                  enableInteractiveSelection: false,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(_codeLength),
                  ],
                  onChanged: onChanged,
                  decoration: const InputDecoration(border: InputBorder.none, counterText: ''),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _box(BcColors c, {required String? digit, required bool active}) {
    final borderColor = isError
        ? c.errorStrong
        : active
        ? c.primary
        : digit != null
        ? c.primary.withValues(alpha: 0.45)
        : c.border;
    return AnimatedContainer(
      duration: BcMotion.fast,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor, width: active ? 2 : 1.2),
              ),
      child: Text(
        digit ?? '',
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: c.foreground),
      ),
    );
  }
}
