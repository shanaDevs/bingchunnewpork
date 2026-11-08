import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../../core/alert_service.dart';
import '../../core/app_lock.dart';
import '../../core/feedback.dart';
import '../../core/runtime_config.dart';
import '../../l10n/l10n.dart';
import '../../state/auth_controller.dart';
import '../../state/jobs_controller.dart';
import '../components/bc_dialog.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../components/sheet_kit.dart';
import '../theme/bc_theme.dart';
import 'app_lock_sheet.dart';
import 'me_sheets.dart';
import 'server_url_dialog.dart';

/// Settings (QuickDrop settings.tsx): appearance, language, job alerts, security, duty, about.
/// Everything applies immediately and persists on the device.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> with WidgetsBindingObserver {
  PermissionStatus? _notif;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshPermission();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshPermission();
  }

  Future<void> _refreshPermission() async {
    try {
      final s = await Permission.notification.status;
      if (mounted) setState(() => _notif = s);
    } catch (_) {
      // Unsupported platform: leave the row as "Unavailable".
    }
  }

  Future<void> _requestPermission() async {
    final s = _notif;
    if (s == null) return;
    if (s.isGranted) {
      await openAppSettings();
      return;
    }
    final next = await Permission.notification.request();
    if (!next.isGranted && next.isPermanentlyDenied) await openAppSettings();
    _refreshPermission();
  }

  Future<void> _logout(JobsController vm, AuthController auth) async {
    BcFeedback.tap();
    if (await vm.hasHeldJob()) {
      if (!mounted) return;
      BcFeedback.error();
      await showBcConfirm(
        context,
        icon: Icons.delivery_dining_rounded,
        tone: BcDialogTone.brand,
        title: tr('Finish your ride first'),
        message: tr('You have a claimed ride that is not finished. Complete or reject it before signing out.'),
        confirmLabel: tr('OK'),
      );
      return;
    }
    if (!mounted) return;
    final ok = await showBcConfirm(
      context,
      icon: Icons.logout_rounded,
      tone: BcDialogTone.danger,
      title: tr('Log out?'),
      message: vm.isOnline ? tr("If you're online, your current shift will end.") : null,
      confirmLabel: tr('Log out'),
    );
    if (ok) auth.logout();
  }

  /// QuickDrop SelectRow: row with the current value; tap opens a ChoiceList sheet.
  void _pick<T>({
    required String title,
    required List<(T, String)> options,
    required T value,
    required ValueChanged<T> onChanged,
  }) {
    showBcSheet<void>(
      context,
      builder: (sheetCtx) {
        final c = sheetCtx.bc;
        return BcSheetBody(
          header: Row(
            children: [
              Expanded(child: Text(title, style: BcType.subtitle.copyWith(color: c.foreground))),
              Material(
                color: c.muted,
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => Navigator.of(sheetCtx).pop(),
                  child: SizedBox(width: 36, height: 36, child: Icon(Icons.close_rounded, color: c.mutedForeground, size: 20)),
                ),
              ),
            ],
          ),
          children: [
            _ChoiceList<T>(
              options: options,
              value: value,
              onChanged: (v) {
                BcFeedback.tap();
                onChanged(v);
                Navigator.of(sheetCtx).pop();
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final rc = context.watch<RuntimeConfig>();
    final vm = context.watch<JobsController>();
    final auth = context.watch<AuthController>();
    final lock = context.watch<AppLock>();

    final (permLabel, permTone) = switch (_notif) {
      null => (tr('Unavailable'), QdTone.neutral),
      final s when s.isGranted || s.isProvisional || s.isLimited => (tr('Allowed'), QdTone.success),
      final s when s.isDenied && !s.isPermanentlyDenied => (tr('Not set'), QdTone.warning),
      _ => (tr('Not allowed'), QdTone.error),
    };

    final theme = switch (rc.themeMode.toUpperCase()) {
      'DARK' => 'DARK',
      'SYSTEM' => 'SYSTEM',
      _ => 'LIGHT',
    };
    final themeOptions = [('SYSTEM', tr('System')), ('LIGHT', tr('Light')), ('DARK', tr('Dark'))];
    final langOptions = [for (final l in AppLanguage.values) (l, l.nativeName)];

    return QdPage(
      title: tr('Settings'),
      children: [
        QdSectionTitle(tr('Appearance'), topGap: 0),
        _Group(
          children: [
            _Row(
              icon: Icons.wb_sunny_outlined,
              title: tr('Theme'),
              value: themeOptions.firstWhere((o) => o.$1 == theme).$2,
              onTap: () => _pick<String>(
                title: tr('Theme'),
                options: themeOptions,
                value: theme,
                onChanged: (v) => rc.themeMode = v,
              ),
            ),
          ],
        ),
        QdFootnote(tr('System follows your phone’s setting.')),
        QdSectionTitle(tr('Language')),
        _Group(
          children: [
            _Row(
              icon: Icons.translate_rounded,
              title: tr('App language'),
              value: rc.language.nativeName,
              onTap: () => _pick<AppLanguage>(
                title: tr('App language'),
                options: langOptions,
                value: rc.language,
                onChanged: (v) {
                  rc.language = v;
                  L10n.rebuildAll();
                },
              ),
            ),
          ],
        ),
        QdSectionTitle(tr('Notifications & Job Alerts')),
        _Group(
          children: [
            _Row(
              icon: Icons.notifications_active_outlined,
              title: tr('Alert sound'),
              subtitle: tr('Play a ringtone for new jobs'),
              trailing: BcSwitch(value: rc.soundEnabled, onChanged: (v) => rc.soundEnabled = v),
            ),
            _Row(
              icon: Icons.music_note_outlined,
              title: tr('Alert tone'),
              value: tr(rc.alertTone.label),
              onTap: () {
                _pick<JobAlertTone>(
                  title: tr('Alert tone'),
                  options: [for (final t in JobAlertTone.values) (t, tr(t.label))],
                  value: rc.alertTone,
                  onChanged: (v) {
                    rc.alertTone = v;
                    previewJobAlertTone(v);
                  },
                );
              },
            ),
            _Row(
              icon: Icons.repeat_rounded,
              title: tr('Ring until I respond'),
              subtitle: rc.alertRepeat ? tr('Ring until you accept or decline') : tr('Off: ring once'),
              trailing: BcSwitch(value: rc.alertRepeat, onChanged: (v) => rc.alertRepeat = v),
            ),
            _Row(
              icon: Icons.vibration_rounded,
              title: tr('Vibrate with alerts'),
              subtitle: tr('Vibrate with each ring'),
              trailing: BcSwitch(value: rc.alertVibration, onChanged: (v) => rc.alertVibration = v),
            ),
            _Row(
              icon: Icons.bolt_outlined,
              title: tr('Haptic feedback'),
              subtitle: tr('Light vibration on taps and toggles'),
              trailing: BcSwitch(value: rc.hapticsEnabled, onChanged: (v) => rc.hapticsEnabled = v),
            ),
            _Row(
              icon: Icons.smartphone_rounded,
              title: tr('Notification permission'),
              subtitle: tr('Needed for alerts while Bring It is in the background.'),
              trailing: QdBadge(permLabel, tone: permTone, dot: true),
              onTap: _notif == null ? null : _requestPermission,
            ),
            _Row(
              icon: Icons.send_rounded,
              title: tr('Send a test alert'),
              subtitle: tr('Preview the full-screen job alert. Nothing is recorded.'),
              onTap: () => context.read<AlertService>().startTestAlert(),
            ),
            _Row(
              icon: Icons.tune_rounded,
              title: tr('Job alert reliability'),
              subtitle: tr('Background running, full-screen alerts and more'),
              onTap: () => showJobAlertsSheet(context),
            ),
          ],
        ),
        QdFootnote(tr('New job alerts always open full screen, even when sound is off.')),
        QdSectionTitle(tr('Security')),
        _Group(
          children: [
            _Row(
              icon: Icons.shield_outlined,
              title: tr('App lock'),
              subtitle: tr('Unlock with biometrics or your PIN'),
              trailing: IgnorePointer(child: BcSwitch(value: lock.enabled, onChanged: (_) {})),
              onTap: () => showAppLockSheet(context),
            ),
          ],
        ),
        QdSectionTitle(tr('App Preferences')),
        _Group(
          children: [
            _Row(
              icon: Icons.wb_sunny_outlined,
              title: tr('Keep screen on during deliveries'),
              subtitle: tr('While a job is active'),
              trailing: BcSwitch(value: rc.keepScreenOn, onChanged: (v) => rc.keepScreenOn = v),
            ),
            _Row(
              icon: Icons.dns_outlined,
              title: tr('Server address'),
              subtitle: tr('Point the app at a different server'),
              onTap: () => showBcDialog<void>(context, builder: (_) => const ServerUrlDialog()),
            ),
            _Row(icon: Icons.info_outline_rounded, title: tr('App version'), value: '1.0.0'),
          ],
        ),
        QdSectionTitle(tr('Account')),
        QdPillButton(
          label: tr('Log out'),
          icon: Icons.logout_rounded,
          style: QdPillStyle.dangerOutline,
          onPressed: () => _logout(vm, auth),
        ),
      ],
    );
  }
}

/// Card of rows split by hairlines (QuickDrop SettingsSection card).
class _Group extends StatelessWidget {
  const _Group({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdCard(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(BcRadius.lg),
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) Divider(height: 1, thickness: 1, indent: 66, color: c.border),
                children[i],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// QuickDrop ListItem: 40px soft icon tile, bold 15 title, muted 14 subtitle, trailing.
class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, this.subtitle, this.value, this.trailing, this.onTap});

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? value;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final chevron = onTap != null ? Icon(Icons.chevron_right_rounded, color: c.iconMuted, size: 20) : null;
    final right =
        trailing ??
        (value != null
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.35),
                    child: Text(
                      value!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.right,
                      style: TextStyle(fontSize: 14, color: c.mutedForeground),
                    ),
                  ),
                  ?chevron,
                ],
              )
            : chevron);
    return InkWell(
      onTap: onTap == null
          ? null
          : () {
              BcFeedback.tap();
              onTap!();
            },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            QdIconTile(icon, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: TextStyle(fontSize: 14, color: c.mutedForeground, height: 1.35)),
                  ],
                ],
              ),
            ),
            if (right != null) ...[const SizedBox(width: 10), right],
          ],
        ),
      ),
    );
  }
}

/// QuickDrop ChoiceList: bordered card, hairline-split rows, radio on the right.
class _ChoiceList<T> extends StatelessWidget {
  const _ChoiceList({required this.options, required this.value, required this.onChanged});
  final List<(T, String)> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(BcRadius.lg),
        border: Border.all(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          children: [
            for (var i = 0; i < options.length; i++) ...[
              if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
              Semantics(
                button: true,
                selected: options[i].$1 == value,
                child: InkWell(
                  onTap: () => onChanged(options[i].$1),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 56),
                    color: options[i].$1 == value ? c.primarySoft : null,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            options[i].$2,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: options[i].$1 == value ? FontWeight.w700 : FontWeight.w500,
                              color: c.foreground,
                            ),
                          ),
                        ),
                        BcRadioDot(selected: options[i].$1 == value),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
