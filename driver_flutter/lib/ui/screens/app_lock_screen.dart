import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_lock.dart';
import '../../core/feedback.dart';
import '../../state/auth_controller.dart';
import '../components/bc_dialog.dart';
import '../components/pin_pad.dart';
import '../components/scenery.dart';
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
    final error = await lock.authenticateBiometric(tr('Unlock Bing Chun Delivery'));
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
    final name = context.watch<AuthController>().driver?.name.trim().split(' ').first ?? '';
    final top = MediaQuery.paddingOf(context).top;
    final isFace = lock.method == AppLockMethod.face;

    final title = widget.confirmOnly
        ? tr('Confirm it is you')
        : name.isEmpty
        ? tr('Welcome back!')
        : tr('Welcome back, {name}!', {'name': name});
    final subtitle = switch (lock.method) {
      AppLockMethod.pin => tr('Enter your 4-digit app PIN'),
      AppLockMethod.face => tr('Use face unlock to open the app'),
      _ => tr('Use your fingerprint to open the app'),
    };

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: PopScope(
        canPop: widget.confirmOnly,
        child: Scaffold(
          body: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
                stops: const [0, 0.45, 1],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Positioned.fill(
                  child: CustomPaint(painter: HeroSwooshPainter(Colors.white.withValues(alpha: 0.08))),
                ),
                if (widget.confirmOnly)
                  Positioned(
                    top: top + 6,
                    left: 6,
                    child: IconButton(
                      tooltip: tr('Close'),
                      onPressed: () => Navigator.of(context).pop(false),
                      icon: const Icon(Icons.close_rounded, color: Colors.white),
                    ),
                  ),
                SafeArea(
                  child: LayoutBuilder(
                    builder: (context, box) => SingleChildScrollView(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(minHeight: box.maxHeight),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                          child: Column(
                            children: [
                              const SizedBox(height: 24),
                              _LogoMark(icon: lock.method == AppLockMethod.pin ? Icons.lock_rounded : null),
                              const SizedBox(height: 22),
                              Text(
                                title,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  height: 1.15,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                subtitle,
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 14.5, color: Colors.white.withValues(alpha: 0.85)),
                              ),
                              const SizedBox(height: 34),
                              if (lock.method == AppLockMethod.pin) ...[
                                PinDots(
                                  length: AppLock.pinLength,
                                  filled: _pin.length,
                                  errorTick: _errorTick,
                                  onDark: true,
                                ),
                                const SizedBox(height: 14),
                                _Message(error: _error),
                                const SizedBox(height: 22),
                                PinKeypad(
                                  onDark: true,
                                  enabled: !_checking,
                                  onDigit: _onDigit,
                                  onBackspace: _onBackspace,
                                ),
                              ] else ...[
                                _BiometricButton(isFace: isFace, busy: _prompting, onTap: _promptBiometric),
                                const SizedBox(height: 18),
                                _Message(
                                  error: _error,
                                  idle: isFace ? tr('Tap to use face unlock') : tr('Tap to use your fingerprint'),
                                ),
                              ],
                              const SizedBox(height: 26),
                              if (!widget.confirmOnly)
                                TextButton(
                                  onPressed: _useMobileNumber,
                                  child: Text(
                                    lock.method == AppLockMethod.pin
                                        ? tr('Forgot PIN? Sign in with mobile number')
                                        : tr('Use mobile number instead'),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                      decoration: TextDecoration.underline,
                                      decorationColor: Colors.white54,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
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
  const _Message({this.error, this.idle});

  final String? error;
  final String? idle;

  @override
  Widget build(BuildContext context) {
    final text = error ?? idle;
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
                    : BoxDecoration(
                        color: const Color(0xFFFF6B6B).withValues(alpha: 0.22),
                        borderRadius: BorderRadius.circular(99),
                      ),
                child: Text(
                  text,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: error == null ? FontWeight.w500 : FontWeight.w600,
                    color: Colors.white.withValues(alpha: error == null ? 0.8 : 1),
                  ),
                ),
              ),
      ),
    );
  }
}

/// White logo disc with a soft halo; [icon] adds a small lock badge.
class _LogoMark extends StatelessWidget {
  const _LogoMark({this.icon});
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return SizedBox(
      width: 104,
      height: 104,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 104,
            height: 104,
            decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.12)),
          ),
          Container(
            width: 80,
            height: 80,
            padding: const EdgeInsets.all(3),
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white,
              boxShadow: [BoxShadow(color: Color(0x40000000), blurRadius: 18, offset: Offset(0, 8))],
            ),
            child: ClipOval(child: Image.asset('assets/images/logo.png', fit: BoxFit.cover, semanticLabel: 'Bing Chun')),
          ),
          if (icon != null)
            Positioned(
              right: 6,
              bottom: 6,
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: c.brandLight,
                  border: Border.all(color: Colors.white, width: 2.5),
                ),
                child: Icon(icon, size: 15, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}

/// Large round fingerprint / face key with a breathing halo.
class _BiometricButton extends StatefulWidget {
  const _BiometricButton({required this.isFace, required this.busy, required this.onTap});

  final bool isFace;
  final bool busy;
  final VoidCallback onTap;

  @override
  State<_BiometricButton> createState() => _BiometricButtonState();
}

class _BiometricButtonState extends State<_BiometricButton> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Semantics(
      button: true,
      label: widget.isFace ? tr('Unlock with face') : tr('Unlock with fingerprint'),
      child: GestureDetector(
        onTap: widget.busy ? null : widget.onTap,
        child: AnimatedBuilder(
          animation: _pulse,
          builder: (context, child) => Container(
            width: 150,
            height: 150,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.06 + 0.08 * _pulse.value),
            ),
            child: child,
          ),
          child: Container(
            width: 104,
            height: 104,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 20, offset: const Offset(0, 8))],
            ),
            child: Icon(
              widget.isFace ? Icons.face_retouching_natural_rounded : Icons.fingerprint_rounded,
              size: 58,
              color: c.brand,
            ),
          ),
        ),
      ),
    );
  }
}
