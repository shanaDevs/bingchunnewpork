import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:sms_autofill/sms_autofill.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../state/auth_controller.dart';
import '../components/auth_kit.dart';
import '../components/bc_dialog.dart';
import '../components/inputs.dart';
import '../theme/bc_theme.dart';
import 'otp_screen.dart';
import 'server_url_dialog.dart';
import '../../l10n/l10n.dart';

/// Mobile-number sign-in, step 1 — the rider's number gets a 6-digit code by SMS.
/// Port of LoginScreen.kt's layout (illustrated hero + notched card).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
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
    super.dispose();
  }

  /// Hidden debug tool: tap the logo 5 times to open the server-URL dialog.
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

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    // The code step shows its own errors; only react to ones raised here.
    final isTop = ModalRoute.of(context)?.isCurrent ?? true;
    if (isTop && auth.error != null && auth.error != _lastError) BcFeedback.error();
    _lastError = auth.error;
    final ready = Format.lkMobile(_phone.text) != null;
    final c = context.bc;

    return BcAuthScaffold(
      kicker: tr('Welcome Back!'),
      subtitle: tr('Sign in with your registered mobile number to open your delivery dashboard.'),
      badge: GestureDetector(onTap: _onBadgeTap, child: const BcAuthBadge()),
      card: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BcAuthCardHeader(
            title: tr('Enter Mobile Number'),
            message: Text(tr("We'll text a 6-digit code to the\nnumber registered with your rider account.")),
          ),
          const SizedBox(height: 22),
          BcTextField(
            controller: _phone,
            label: tr('Mobile number'),
            placeholder: '07X XXX XXXX',
            isError: isTop && auth.error != null,
            supportingText: (isTop ? auth.error : null) ?? tr('Sri Lankan mobile, e.g. 077 123 4567'),
            keyboardType: TextInputType.phone,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
              LengthLimitingTextInputFormatter(15),
            ],
            onChanged: (_) {
              auth.clearError();
              setState(() {});
            },
            trailing: Icon(Icons.phone_iphone_rounded, color: c.textMuted),
          ),
          const SizedBox(height: 20),
          BcAuthButton(
            label: auth.loading ? tr('Sending code…') : tr('Send code'),
            loading: auth.loading,
            enabled: ready && !auth.loading,
            onPressed: () => _sendCode(auth),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock_outline_rounded, size: 14, color: c.textMuted),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  tr('Only registered Bing Chun riders can sign in.'),
                  style: BcType.tiny.copyWith(color: c.textMuted),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
