import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_lock.dart';
import '../../core/feedback.dart';
import '../components/sheet_kit.dart';
import '../components/snack.dart';
import '../theme/bc_theme.dart';
import 'app_lock_screen.dart';
import 'pin_setup_screen.dart';
import '../../l10n/l10n.dart';

/// Me → Preferences → App lock. Off / 4-digit PIN / fingerprint / face.
Future<void> showAppLockSheet(BuildContext context) =>
    showBcSheet<void>(context, builder: (_) => const _AppLockSheet());

/// Short label for the current method, shown on the Me row.
String appLockLabel(AppLockMethod m) => switch (m) {
  AppLockMethod.none => tr('Off'),
  AppLockMethod.pin => tr('App PIN'),
  AppLockMethod.fingerprint => AppLock.combinedBiometric ? tr('Biometric') : tr('Fingerprint'),
  AppLockMethod.face => tr('Face unlock'),
};

class _AppLockSheet extends StatefulWidget {
  const _AppLockSheet();

  @override
  State<_AppLockSheet> createState() => _AppLockSheetState();
}

class _AppLockSheetState extends State<_AppLockSheet> with WidgetsBindingObserver {
  BiometricSupport? _support;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshSupport();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// The rider may add or remove a fingerprint/face in phone settings while this sheet is open.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshSupport();
  }

  Future<BiometricSupport> _refreshSupport() async {
    final s = await context.read<AppLock>().biometricSupport();
    if (mounted) setState(() => _support = s);
    return s;
  }

  Future<void> _select(AppLockMethod target) async {
    final lock = context.read<AppLock>();
    if (_busy || target == lock.method) return;
    BcFeedback.tap();
    setState(() => _busy = true);
    try {
      // Changing or removing a lock needs the current one first.
      if (!await AppLockScreen.confirmCurrent(context) || !mounted) return;
      switch (target) {
        case AppLockMethod.none:
          await lock.disable();
          if (mounted) showBcSnack(context, tr('App lock turned off'), kind: BcSnackKind.info);
        case AppLockMethod.pin:
          await _createPin();
        case AppLockMethod.fingerprint:
        case AppLockMethod.face:
          final face = target == AppLockMethod.face;
          final combined = AppLock.combinedBiometric;
          // Re-check right before enabling — never turn on a method the phone doesn't have set up.
          final support = await _refreshSupport();
          if (!mounted) return;
          if (!(face ? support.face : support.fingerprint)) {
            BcFeedback.error();
            showBcSnack(
              context,
              tr('Set up a fingerprint or face unlock in your phone settings first.'),
              kind: BcSnackKind.error,
            );
            return;
          }
          final error = await lock.authenticateBiometric(
            face
                ? tr('Verify your face to turn on face unlock')
                : combined
                ? tr('Verify it is you to turn on biometric unlock')
                : tr('Verify your fingerprint to turn on fingerprint unlock'),
          );
          if (!mounted) return;
          if (error != null) {
            BcFeedback.error();
            showBcSnack(context, error, kind: BcSnackKind.error);
            return;
          }
          await lock.enableBiometric(target);
          BcFeedback.success();
          if (mounted) {
            showBcSnack(
              context,
              face
                  ? tr('Face unlock turned on')
                  : combined
                  ? tr('Biometric unlock turned on')
                  : tr('Fingerprint unlock turned on'),
              kind: BcSnackKind.success,
            );
          }
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createPin() async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const PinSetupScreen()));
    if (saved == true && mounted) showBcSnack(context, tr('App PIN turned on'), kind: BcSnackKind.success);
  }

  Future<void> _changePin() async {
    if (_busy) return;
    BcFeedback.tap();
    setState(() => _busy = true);
    try {
      if (await AppLockScreen.confirmCurrent(context) && mounted) await _createPin();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final dark = c.isDark;
    final lock = context.watch<AppLock>();
    final support = _support;
    final notOnPhone = tr('Not set up on this phone');
    final combined = AppLock.combinedBiometric;

    return BcSheetBody(
      header: BcSheetHeader(
        icon: Icons.shield_outlined,
        iconBg: dark ? const Color(0xFF052E2B) : const Color(0xFFCCFBF1),
        iconTint: dark ? const Color(0xFF2DD4BF) : const Color(0xFF0D9488),
        title: tr('App lock'),
        subtitle: tr('Ask for verification each time the app opens'),
        onClose: () => Navigator.of(context).pop(),
      ),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(BcRadius.md)),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded, size: 18, color: c.brand),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  tr(
                    'Optional. You stay signed in with your mobile number; the lock only stops others opening the app on this phone.',
                  ),
                  style: BcType.caption.copyWith(color: c.text),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        BcSheetCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _OptionRow(
                icon: Icons.lock_open_rounded,
                tint: c.textMuted,
                title: tr('Off'),
                subtitle: tr('Open the app without verification'),
                selected: lock.method == AppLockMethod.none,
                enabled: !_busy,
                onTap: () => _select(AppLockMethod.none),
              ),
              Divider(height: 1, color: c.border),
              _OptionRow(
                icon: Icons.pin_outlined,
                tint: c.brand,
                title: tr('App PIN'),
                subtitle: tr('A 4-digit PIN you choose'),
                selected: lock.method == AppLockMethod.pin,
                enabled: !_busy,
                onTap: () => _select(AppLockMethod.pin),
              ),
              Divider(height: 1, color: c.border),
              _OptionRow(
                icon: Icons.fingerprint_rounded,
                tint: dark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED),
                title: combined ? tr('Biometric') : tr('Fingerprint'),
                subtitle: support == null || support.fingerprint
                    ? (combined
                          ? tr('Fingerprint or face unlock set up on this phone')
                          : tr('Unlock with your fingerprint'))
                    : notOnPhone,
                selected: lock.method == AppLockMethod.fingerprint,
                enabled: !_busy && (support?.fingerprint ?? false),
                onTap: () => _select(AppLockMethod.fingerprint),
              ),
              // Android: face is covered by the single Biometric option above.
              if (!combined) ...[
                Divider(height: 1, color: c.border),
                _OptionRow(
                  icon: Icons.face_retouching_natural_rounded,
                  tint: dark ? const Color(0xFF38BDF8) : const Color(0xFF0284C7),
                  title: tr('Face ID'),
                  subtitle: support == null || support.face ? tr('Unlock by looking at your phone') : notOnPhone,
                  selected: lock.method == AppLockMethod.face,
                  enabled: !_busy && (support?.face ?? false),
                  onTap: () => _select(AppLockMethod.face),
                ),
              ],
            ],
          ),
        ),
        if (lock.method == AppLockMethod.pin) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy ? null : _changePin,
            icon: const Icon(Icons.edit_outlined, size: 18),
            label: Text(tr('Change PIN'), style: BcType.button),
            style: OutlinedButton.styleFrom(
              foregroundColor: c.brand,
              minimumSize: const Size.fromHeight(48),
              side: BorderSide(color: c.brand.withValues(alpha: 0.5)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BcRadius.button)),
            ),
          ),
        ],
      ],
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.icon,
    required this.tint,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final IconData icon;
  final Color tint;
  final String title;
  final String subtitle;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Opacity(
          opacity: enabled || selected ? 1 : 0.5,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: tint.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: tint, size: 21),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: BcType.bodyStrong.copyWith(color: c.text)),
                      const SizedBox(height: 1),
                      Text(subtitle, style: BcType.caption.copyWith(color: c.textMuted)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                AnimatedContainer(
                  duration: BcMotion.fast,
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: selected ? c.brand : Colors.transparent,
                    border: Border.all(color: selected ? c.brand : c.inputBorder, width: 2),
                  ),
                  child: selected ? const Icon(Icons.check_rounded, size: 14, color: Colors.white) : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
