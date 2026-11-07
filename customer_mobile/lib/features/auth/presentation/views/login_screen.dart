import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/auth_redirect.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/bc_text_field.dart';
import '../../../../shared/widgets/dev_otp_hint.dart';
import '../../../../shared/widgets/otp_field.dart';
import '../providers/auth_providers.dart';
import '../states/login_state.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.prefillPhone, this.returnTo});

  final String? prefillPhone;
  final String? returnTo;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  late final TextEditingController _phone;

  @override
  void initState() {
    super.initState();
    _phone = TextEditingController(text: widget.prefillPhone ?? '');
    if (widget.prefillPhone != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(loginNotifierProvider.notifier).prefills(widget.prefillPhone!);
      });
    }
  }

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  String _message(LoginState state, AppLocalizations l10n) {
    if (state.offline) return l10n.offlineBlock;
    final raw = state.errorMessage;
    if (raw == null) return '';
    if (raw.contains('Too many OTP requests')) return l10n.otpRateLimited;
    return raw;
  }

  void _leave() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(leaveAuthLocation(widget.returnTo));
  }

  void _goAfterAuth() {
    context.go(safeReturnTo(widget.returnTo) ?? '/home');
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = Theme.of(context).extension<BcColors>()!;
    final state = ref.watch(loginNotifierProvider);
    final vm = ref.read(loginNotifierProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.loginTitle),
        leading: IconButton(
          icon: const Icon(Icons.close),
          tooltip: l10n.continueBrowsing,
          onPressed: _leave,
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              state.step == LoginStep.phone
                  ? l10n.loginSubtitle
                  : l10n.otpSubtitle,
              style: TextStyle(color: colors.textMuted),
            ),
            const SizedBox(height: 24),
            if (state.step == LoginStep.phone) ...[
              BcTextField(
                controller: _phone,
                label: l10n.phoneLabel,
                hint: l10n.phoneHint,
                errorText: state.phoneError,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.done,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
                  LengthLimitingTextInputFormatter(12),
                ],
                onChanged: vm.setPhone,
                onSubmitted: (_) => vm.sendCode(),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: state.submitting
                    ? null
                    : () async {
                        vm.setPhone(_phone.text);
                        await vm.sendCode();
                      },
                child: state.submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.sendOtp),
              ),
            ] else ...[
              Text(
                state.phone,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 16),
              OtpField(
                enabled: !state.submitting,
                onCompleted: (code) async {
                  final ok = await vm.verify(code);
                  if (ok && context.mounted) _goAfterAuth();
                },
              ),
              if (state.debugOtp != null && state.debugOtp!.isNotEmpty) ...[
                const SizedBox(height: 16),
                DevOtpHint(code: state.debugOtp!),
              ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: state.submitting ? null : vm.resend,
                  child: Text(l10n.resendOtp),
                ),
              ),
            ],
            if (state.errorMessage != null || state.offline) ...[
              const SizedBox(height: 12),
              Text(
                _message(state, l10n),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            TextButton(
              onPressed: () => context.go(
                authLocation('/register', returnTo: widget.returnTo),
              ),
              child: Text(l10n.newHere),
            ),
            TextButton(
              onPressed: _leave,
              child: Text(l10n.continueBrowsing),
            ),
          ],
        ),
      ),
    );
  }
}
