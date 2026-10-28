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
import '../states/register_state.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({
    super.key,
    this.referralCode,
    this.returnTo,
  });

  final String? referralCode;
  final String? returnTo;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _phone = TextEditingController();
  final _name = TextEditingController();

  @override
  void initState() {
    super.initState();
    final refCode = widget.referralCode;
    if (refCode != null && refCode.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(registerNotifierProvider.notifier).setReferral(refCode);
      });
    }
  }

  @override
  void dispose() {
    _phone.dispose();
    _name.dispose();
    super.dispose();
  }

  void _leave() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(leaveAuthLocation(widget.returnTo));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = Theme.of(context).extension<BcColors>()!;
    final state = ref.watch(registerNotifierProvider);
    final vm = ref.read(registerNotifierProvider.notifier);

    ref.listen(registerNotifierProvider, (prev, next) {
      if (next.existingPhone &&
          prev?.existingPhone != true &&
          context.mounted) {
        context.go(
          authLocation('/login', returnTo: widget.returnTo),
          extra: next.phone,
        );
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.registerTitle),
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
              l10n.registerSubtitle,
              style: TextStyle(color: colors.textMuted),
            ),
            const SizedBox(height: 24),
            if (state.step == RegisterStep.phone) ...[
              BcTextField(
                controller: _phone,
                label: l10n.phoneLabel,
                hint: l10n.phoneHint,
                errorText: state.phoneError,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
                  LengthLimitingTextInputFormatter(12),
                ],
                onChanged: vm.setPhone,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: state.submitting
                    ? null
                    : () {
                        vm.setPhone(_phone.text);
                        vm.checkPhone();
                      },
                child: state.submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.continueAction),
              ),
            ] else if (state.step == RegisterStep.details) ...[
              BcTextField(
                controller: _name,
                label: l10n.nameLabel,
                hint: l10n.nameHint,
                errorText: state.nameError,
                textInputAction: TextInputAction.done,
                onChanged: vm.setName,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: state.submitting
                    ? null
                    : () {
                        vm.setName(_name.text);
                        vm.sendCode();
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
              Text(state.phone, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 16),
              OtpField(
                enabled: !state.submitting,
                onCompleted: (code) async {
                  final ok = await vm.verify(code);
                  if (ok && context.mounted) {
                    context.go(safeReturnTo(widget.returnTo) ?? '/home');
                  }
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
            if (state.offline || state.errorMessage != null) ...[
              const SizedBox(height: 12),
              Text(
                state.offline
                    ? l10n.offlineBlock
                    : (state.errorMessage ?? l10n.genericError),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            TextButton(
              onPressed: () => context.go(
                authLocation('/login', returnTo: widget.returnTo),
              ),
              child: Text(l10n.alreadyHaveAccount),
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
