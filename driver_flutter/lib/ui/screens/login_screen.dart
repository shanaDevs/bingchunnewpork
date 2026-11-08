import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:sms_autofill/sms_autofill.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../state/auth_controller.dart';
import '../components/auth_kit.dart';
import '../components/auth_scene.dart';
import '../components/bc_dialog.dart';
import '../theme/bc_theme.dart';
import 'otp_screen.dart';
import 'server_url_dialog.dart';
import '../../l10n/l10n.dart';

/// Mobile-number sign-in, step 1 — the rider's number gets a 6-digit code by SMS.
/// QuickDrop layout: blue fade with greeting + rider scene, +94 phone row, Continue, help footer.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _focus = FocusNode();
  int _logoTaps = 0;
  String? _lastError;
  String? _appSignature;

  @override
  void initState() {
    super.initState();
    // Android SMS Retriever hash, appended to the OTP SMS so the code fills itself in.
    if (defaultTargetPlatform == TargetPlatform.android) {
      SmsAutoFill().getAppSignature.then((s) => _appSignature = s).catchError((_) => '');
    }
  }

  @override
  void dispose() {
    _phone.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// Hidden debug tool: tap the wordmark 5 times to open the server-URL dialog.
  void _onBadgeTap() {
    if (!kDebugMode) return;
    _logoTaps++;
    if (_logoTaps >= 5) {
      _logoTaps = 0;
      showBcDialog<void>(context, builder: (_) => const ServerUrlDialog());
    }
  }

  Future<void> _sendCode(AuthController auth) async {
    final phone = Format.lkMobile(_phone.text);
    if (phone == null) return;
    BcFeedback.tap();
    FocusScope.of(context).unfocus();
    final sent = await auth.requestOtp(phone, appSignature: _appSignature);
    if (!sent || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => OtpScreen(appSignature: _appSignature)),
    );
    // Back from the code step — keep the number so it can be corrected.
    if (mounted) auth.clearError();
  }

  bool get _complete {
    final d = _phone.text.replaceAll(RegExp(r'\D'), '');
    return d.length >= (d.startsWith('0') ? 10 : 9);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    // The code step shows its own errors; only react to ones raised here.
    final isTop = ModalRoute.of(context)?.isCurrent ?? true;
    if (isTop && auth.error != null && auth.error != _lastError) BcFeedback.error();
    _lastError = auth.error;
    final ready = Format.lkMobile(_phone.text) != null;
    final c = context.bc;
    final error = (isTop ? auth.error : null) ??
        (_complete && !ready ? tr('Enter a valid mobile number, e.g. 077 123 4567.') : null);

    return BcAuthScaffold(
      onLogoTap: _onBadgeTap,
      hero: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
            child: BcAuthGreeting(
              lead: tr('Welcome back,'),
              title: tr('Rider!'),
              subtitle: tr('Sign in with your mobile number to continue.'),
            ),
          ),
          const BcRiderCityScene(),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _PhoneRow(
            controller: _phone,
            focus: _focus,
            isError: error != null,
            onChanged: () {
              auth.clearError();
              setState(() {});
            },
            onSubmit: ready && !auth.loading ? () => _sendCode(auth) : null,
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
              child: Text(error, style: BcType.caption.copyWith(fontSize: 14, color: c.errorStrong)),
            ),
          const SizedBox(height: 18),
          BcAuthButton(
            label: auth.loading ? tr('Sending code…') : tr('Continue'),
            loading: auth.loading,
            enabled: ready && !auth.loading,
            onPressed: () => _sendCode(auth),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.verified_user_outlined, size: 20, color: c.primary),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  tr("We'll send you a one-time verification code."),
                  textAlign: TextAlign.center,
                  style: BcType.caption.copyWith(fontSize: 14, color: c.mutedForeground),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Rounded phone row: flag, +94, hairline divider, digits-only field.
class _PhoneRow extends StatelessWidget {
  const _PhoneRow({
    required this.controller,
    required this.focus,
    required this.isError,
    required this.onChanged,
    required this.onSubmit,
  });

  final TextEditingController controller;
  final FocusNode focus;
  final bool isError;
  final VoidCallback onChanged;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return ListenableBuilder(
      listenable: focus,
      builder: (context, _) => AnimatedContainer(
        duration: BcMotion.fast,
        height: 60,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isError ? c.errorStrong : (focus.hasFocus ? c.primary : c.border),
            width: focus.hasFocus || isError ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Semantics(
              label: tr('Sri Lanka country code +94'),
              excludeSemantics: true,
              child: Row(
                children: [
                  const BcSriLankaFlag(width: 26),
                  const SizedBox(width: 8),
                  Text('+94', style: BcType.bodyStrong.copyWith(fontWeight: FontWeight.w700, color: c.foreground)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Container(width: 1, height: 28, color: c.border),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                controller: controller,
                focusNode: focus,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.telephoneNumberNational],
                cursorColor: c.primary,
                style: BcType.body.copyWith(fontSize: 16, color: c.foreground),
                inputFormatters: [_LkPhoneFormatter()],
                onChanged: (_) => onChanged(),
                onSubmitted: (_) => onSubmit?.call(),
                decoration: InputDecoration(
                  isCollapsed: true,
                  border: InputBorder.none,
                  hintText: tr('Enter your mobile number'),
                  hintStyle: BcType.body.copyWith(fontSize: 16, color: c.iconMuted),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Digits only, grouped like Format.lkMobileDisplay: `077 123 4567` (or `77 123 4567`).
class _LkPhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var d = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (d.startsWith('94') && d.length >= 11) d = d.substring(2); // pasted +94…
    final max = d.startsWith('0') ? 10 : 9;
    if (d.length > max) d = d.substring(0, max);
    final first = d.startsWith('0') ? 3 : 2;
    final b = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i == first || i == first + 3) b.write(' ');
      b.write(d[i]);
    }
    final out = b.toString();
    return TextEditingValue(text: out, selection: TextSelection.collapsed(offset: out.length));
  }
}
