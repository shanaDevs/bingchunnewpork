import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_lock.dart';
import '../../core/feedback.dart';
import '../../state/auth_controller.dart';
import '../components/bc_dialog.dart';
import '../components/pin_pad.dart';
import '../components/profile_kit.dart';
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

    final title = widget.confirmOnly
        ? tr('Confirm it is you')
        : (name.isEmpty ? tr('Welcome back!') : tr('Welcome back, {name}!', {'name': name}));
    final bioHint = isFace
        ? tr('Use face unlock to open the app')
        : combined
        ? tr('Use your fingerprint or face to open the app')
        : tr('Use your fingerprint to open the app');
    final subtitle = isPin
        ? (widget.confirmOnly ? tr('Enter your 4-digit app PIN') : tr('Enter your PIN'))
        : bioHint;
    final bioLabel = isFace
        ? tr('Unlock with face')
        : combined
        ? tr('Unlock with biometrics')
        : tr('Unlock with fingerprint');
    final bioIcon = isFace ? Icons.face_retouching_natural_rounded : Icons.fingerprint_rounded;

    final header = Column(
      children: [
        _LockedAvatar(name: fullName, size: isPin ? 72 : 96),
        SizedBox(height: isPin ? 16 : 22),
        Text(
          title,
          textAlign: TextAlign.center,
          style: BcType.title.copyWith(color: c.foreground, fontSize: 26),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 15, color: c.mutedForeground, height: 1.4),
        ),
      ],
    );

    final body = isPin
        ? Column(
            children: [
              header,
              const SizedBox(height: 28),
              PinDots(length: AppLock.pinLength, filled: _pin.length, errorTick: _errorTick, boxed: true, error: _error != null),
              const SizedBox(height: 12),
              _Message(error: _error),
              const SizedBox(height: 14),
              PinKeypad(enabled: !_checking, onDigit: _onDigit, onBackspace: _onBackspace),
            ],
          )
        : Column(
            children: [
              header,
              const SizedBox(height: 40),
              _BiometricOrb(icon: bioIcon, label: bioLabel, busy: _prompting, error: _error != null, onTap: _promptBiometric),
              const SizedBox(height: 10),
              AnimatedSwitcher(
                duration: BcMotion.fast,
                child: Text(
                  _prompting ? tr('Verifying…') : (_error != null ? tr('Tap to try again') : bioLabel),
                  key: ValueKey('${_prompting}_${_error != null}'),
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                ),
              ),
              const SizedBox(height: 12),
              _Message(error: _error),
            ],
          );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: c.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: PopScope(
        canPop: widget.confirmOnly,
        child: Scaffold(
          backgroundColor: c.background,
          body: Stack(
            children: [
              // Soft brand glow at the top so the screen doesn't read as an empty void.
              Positioned(
                top: -180,
                left: -100,
                right: -100,
                child: IgnorePointer(
                  child: Container(
                    height: 460,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [c.primary.withValues(alpha: c.isDark ? 0.22 : 0.12), c.primary.withValues(alpha: 0)],
                      ),
                    ),
                  ),
                ),
              ),
              SafeArea(
                child: Column(
                  children: [
                    SizedBox(
                      height: 56,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Row(
                          children: [
                            if (widget.confirmOnly)
                              IconButton(
                                tooltip: tr('Close'),
                                onPressed: () => Navigator.of(context).pop(false),
                                icon: Icon(Icons.close_rounded, color: c.foreground),
                              )
                            else ...[
                              const SizedBox(width: 12),
                              const QdLogoMark(size: 28, shadow: false),
                              const SizedBox(width: 8),
                              Text(
                                kAppName,
                                style: TextStyle(
                                  fontFamily: BcFonts.sans,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: c.foreground,
                                ),
                              ),
                              const Spacer(),
                              _LockedChip(label: tr('Locked')),
                              const SizedBox(width: 12),
                            ],
                          ],
                        ),
                      ),
                    ),
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, box) => SingleChildScrollView(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: ConstrainedBox(
                            constraints: BoxConstraints(minHeight: box.maxHeight),
                            child: Center(child: body),
                          ),
                        ),
                      ),
                    ),
                    if (!widget.confirmOnly)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(24, 4, 24, 12),
                        child: TextButton.icon(
                          onPressed: _useMobileNumber,
                          icon: Icon(Icons.phone_iphone_rounded, size: 18, color: c.mutedForeground),
                          label: Text(
                            tr('Sign in with phone number'),
                            style: TextStyle(color: c.mutedForeground, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Rider's initials avatar inside a brand ring, with a small lock badge.
class _LockedAvatar extends StatelessWidget {
  const _LockedAvatar({required this.name, required this.size});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final badge = (size * 0.34).clamp(24.0, 34.0);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: c.primary.withValues(alpha: 0.35), width: 2),
          ),
          child: QdAvatar(name: name, size: size),
        ),
        Positioned(
          right: 0,
          bottom: 0,
          child: Container(
            width: badge,
            height: badge,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: c.primary,
              border: Border.all(color: c.background, width: 3),
            ),
            child: Icon(Icons.lock_rounded, size: badge * 0.5, color: c.primaryForeground),
          ),
        ),
      ],
    );
  }
}

class _LockedChip extends StatelessWidget {
  const _LockedChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: c.muted, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.lock_outline_rounded, size: 14, color: c.mutedForeground),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.mutedForeground)),
        ],
      ),
    );
  }
}

/// Large round biometric button. Pulses while the system prompt is open; turns red after a failure.
class _BiometricOrb extends StatefulWidget {
  const _BiometricOrb({
    required this.icon,
    required this.label,
    required this.busy,
    required this.error,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool busy;
  final bool error;
  final VoidCallback onTap;

  @override
  State<_BiometricOrb> createState() => _BiometricOrbState();
}

class _BiometricOrbState extends State<_BiometricOrb> with SingleTickerProviderStateMixin {
  static const _size = 112.0;
  static const _spread = 56.0;

  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void initState() {
    super.initState();
    if (widget.busy) _pulse.repeat();
  }

  @override
  void didUpdateWidget(_BiometricOrb old) {
    super.didUpdateWidget(old);
    if (widget.busy && !_pulse.isAnimating) {
      _pulse.repeat();
    } else if (!widget.busy && _pulse.isAnimating) {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Widget _ring(Color tone, double offset) {
    final t = (_pulse.value + offset) % 1.0;
    return Container(
      width: _size + _spread * t,
      height: _size + _spread * t,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: tone.withValues(alpha: 0.45 * (1 - t)), width: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final tone = widget.error ? c.error : c.primary;
    return Semantics(
      button: true,
      label: widget.label,
      child: GestureDetector(
        onTap: widget.busy ? null : widget.onTap,
        child: SizedBox(
          width: _size + _spread,
          height: _size + _spread,
          child: AnimatedBuilder(
            animation: _pulse,
            builder: (context, child) => Stack(
              alignment: Alignment.center,
              children: [
                if (widget.busy) ...[_ring(tone, 0), _ring(tone, 0.5)],
                child!,
              ],
            ),
            child: AnimatedContainer(
              duration: BcMotion.standard,
              width: _size,
              height: _size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: tone.withValues(alpha: c.isDark ? 0.16 : 0.10),
                border: Border.all(color: tone.withValues(alpha: 0.55), width: 1.5),
                boxShadow: [BoxShadow(color: tone.withValues(alpha: 0.25), blurRadius: 32, spreadRadius: -4)],
              ),
              child: Icon(widget.icon, size: 52, color: tone),
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
                decoration: BoxDecoration(color: c.errorSoftBg, borderRadius: BorderRadius.circular(99)),
                child: Text(
                  text,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.errorStrong),
                ),
              ),
      ),
    );
  }
}
