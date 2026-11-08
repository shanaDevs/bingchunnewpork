import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_lock.dart';
import '../../core/feedback.dart';
import '../../state/auth_controller.dart';
import '../components/bc_dialog.dart';
import '../components/job_cards.dart';
import '../components/pin_pad.dart';
import '../components/qd_brand.dart';
import '../components/snack.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Verifies the rider with their app lock (PIN, fingerprint or face).
///
/// * Gate mode (default): shown after the splash on every cold start while a lock is set.
///   Success unlocks the app; "use mobile number" signs out to the OTP login.
/// * [confirmOnly]: pushed before the lock setting is changed; pops `true` on success.
class AppLockScreen extends StatefulWidget {
  const AppLockScreen({super.key, this.confirmOnly = false});

  final bool confirmOnly;

  /// Asks the rider to prove it's them with the current lock. True when there is no lock.
  static Future<bool> confirmCurrent(BuildContext context) async {
    final lock = context.read<AppLock>();
    switch (lock.method) {
      case AppLockMethod.none:
        return true;
      case AppLockMethod.pin:
        final ok = await Navigator.of(context).push<bool>(
          MaterialPageRoute(fullscreenDialog: true, builder: (_) => const AppLockScreen(confirmOnly: true)),
        );
        return ok ?? false;
      case AppLockMethod.fingerprint:
      case AppLockMethod.face:
        final error = await lock.authenticateBiometric(tr('Confirm it is you to change the app lock'));
        if (error != null) {
          BcFeedback.error();
          if (context.mounted) showBcSnack(context, error, kind: BcSnackKind.error);
        }
        return error == null;
    }
  }

  @override
  State<AppLockScreen> createState() => _AppLockScreenState();
}

class _AppLockScreenState extends State<AppLockScreen> {
  String _pin = '';
  String? _error;
  int _errorTick = 0;
  bool _checking = false;
  bool _prompting = false;

  @override
  void initState() {
    super.initState();
    // Biometric locks open the system prompt straight away.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && context.read<AppLock>().isBiometric) _promptBiometric();
    });
  }

  Future<void> _promptBiometric() async {
    if (_prompting) return;
    final lock = context.read<AppLock>();
    setState(() {
      _prompting = true;
      _error = null;
    });
    final error = await lock.authenticateBiometric(tr('Unlock Bring It Rider'));
    if (!mounted) return;
    setState(() {
      _prompting = false;
      _error = error;
    });
    if (error == null) {
      _succeed(lock);
    } else {
      BcFeedback.error();
    }
  }

  void _onDigit(String d) {
    if (_checking || _pin.length >= AppLock.pinLength) return;
    setState(() {
      _pin += d;
      _error = null;
    });
    if (_pin.length == AppLock.pinLength) _checkPin();
  }

  void _onBackspace() {
    if (_checking || _pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _checkPin() async {
    final lock = context.read<AppLock>();
    final auth = context.read<AuthController>();
    setState(() => _checking = true);
    final ok = await lock.checkPin(_pin);
    if (!mounted) return;
    if (ok) return _succeed(lock);

    BcFeedback.error();
    if (lock.pinAttemptsLeft <= 0) {
      // Too many misses — fall back to proving phone ownership with OTP.
      await auth.logout(message: tr('Too many wrong PINs. Sign in again with your mobile number.'));
      return;
    }
    setState(() {
      _checking = false;
      _pin = '';
      _errorTick++;
      _error = trn(lock.pinAttemptsLeft, 'Wrong PIN. {n} attempt left.', 'Wrong PIN. {n} attempts left.');
    });
  }

  void _succeed(AppLock lock) {
    BcFeedback.success();
    if (widget.confirmOnly) {
      Navigator.of(context).pop(true);
    } else {
      lock.markUnlocked();
    }
  }

  Future<void> _useMobileNumber() async {
    final auth = context.read<AuthController>();
    final ok = await showBcConfirm(
      context,
      icon: Icons.phone_iphone_rounded,
      title: tr('Sign in with mobile number?'),
      message: tr('You will be signed out and the app lock will be turned off. Sign in again with an SMS code.'),
      confirmLabel: tr('Continue'),
    );
    if (ok) await auth.logout();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final lock = context.watch<AppLock>();
    final driver = context.watch<AuthController>().driver;
    final fullName = driver?.name.trim() ?? '';
    final name = fullName.split(' ').first;
    final isFace = lock.method == AppLockMethod.face;
    final combined = AppLock.combinedBiometric;
    final isPin = lock.method == AppLockMethod.pin;

    final title = widget.confirmOnly ? tr('Confirm it is you') : tr('Bring It is locked');
    final bioHint = isFace
        ? tr('Use face unlock to open the app')
        : combined
        ? tr('Use your fingerprint or face to open the app')
        : tr('Use your fingerprint to open the app');
    final subtitle = widget.confirmOnly
        ? (isPin ? tr('Enter your 4-digit app PIN') : bioHint)
        : (name.isEmpty ? tr('Unlock to continue.') : tr('Unlock to continue, {name}.', {'name': name}));
    final bioLabel = isFace
        ? tr('Unlock with face')
        : combined
        ? tr('Unlock with biometrics')
        : tr('Unlock with fingerprint');

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: c.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: PopScope(
        canPop: widget.confirmOnly,
        child: Scaffold(
          backgroundColor: c.background,
          body: SafeArea(
            child: Column(
              children: [
                SizedBox(
                  height: 56,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: widget.confirmOnly
                        ? Padding(
                            padding: const EdgeInsets.only(left: 12),
                            child: IconButton(
                              tooltip: tr('Close'),
                              onPressed: () => Navigator.of(context).pop(false),
                              icon: Icon(Icons.close_rounded, color: c.foreground),
                            ),
                          )
                        : null,
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      children: [
                        const QdLogoMark(size: 56),
                        const SizedBox(height: 16),
                        Text(
                          title,
                          textAlign: TextAlign.center,
                          style: BcType.title.copyWith(color: c.foreground, fontSize: 26),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          subtitle,
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 15, color: c.mutedForeground, height: 1.4),
                        ),
                        if (isPin) ...[
                          const SizedBox(height: 28),
                          if (!widget.confirmOnly) ...[
                            Text(
                              tr('Enter your PIN'),
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                            ),
                            const SizedBox(height: 14),
                          ],
                          PinDots(length: AppLock.pinLength, filled: _pin.length, errorTick: _errorTick, boxed: true, error: _error != null),
                          const SizedBox(height: 12),
                          _Message(error: _error),
                          const SizedBox(height: 14),
                          PinKeypad(enabled: !_checking, onDigit: _onDigit, onBackspace: _onBackspace),
                        ] else ...[
                          const SizedBox(height: 16),
                          _Message(error: _error),
                        ],
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (!isPin)
                        PillButton(
                          label: bioLabel,
                          icon: isFace ? Icons.face_retouching_natural_rounded : Icons.fingerprint_rounded,
                          height: 56,
                          loading: _prompting,
                          onTap: _promptBiometric,
                        ),
                      if (!widget.confirmOnly)
                        TextButton(
                          onPressed: _useMobileNumber,
                          child: Text(
                            tr('Sign in with phone number'),
                            style: TextStyle(color: c.mutedForeground, fontWeight: FontWeight.w600),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final text = error;
    return AnimatedSwitcher(
      duration: BcMotion.fast,
      child: SizedBox(
        key: ValueKey(text),
        height: 36,
        child: text == null
            ? null
            : Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: error == null
                    ? null
                    : BoxDecoration(color: c.errorSoftBg, borderRadius: BorderRadius.circular(99)),
                child: Text(
                  text,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: error == null ? FontWeight.w500 : FontWeight.w700,
                    color: error == null ? c.mutedForeground : c.errorStrong,
                  ),
                ),
              ),
      ),
    );
  }
}
