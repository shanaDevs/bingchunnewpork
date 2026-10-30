import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/runtime_config.dart';
import '../../domain/entities/admin_session.dart';
import '../../l10n/l10n.dart';
import '../components/buttons.dart';
import '../components/language_switch.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../labels.dart';
import '../state/auth_controller.dart';
import '../theme/pos_theme.dart';
import 'login_screen.dart';

/// Profile + settings + sign out.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key, required this.session, this.pages = const []});
  final AdminSession session;

  /// Pages that didn't fit the bottom bar: (label, icon, open).
  final List<(String, IconData, VoidCallback)> pages;

  Future<void> _pickTheme(BuildContext context, RuntimeConfig rc) async {
    final picked = await showOptionSheet<String>(
      context,
      title: tr('Theme'),
      selected: rc.themeMode,
      options: [('LIGHT', tr('Light')), ('DARK', tr('Dark')), ('SYSTEM', tr('System'))],
    );
    if (picked != null) rc.themeMode = picked;
  }

  Future<void> _logout(BuildContext context) async {
    final ok = await confirmDialog(
      context,
      title: tr('Sign out?'),
      message: tr('You will need your staff email and password to sign in again.'),
      confirmLabel: tr('Sign Out'),
      danger: true,
      icon: Icons.logout_rounded,
    );
    if (ok && context.mounted) await context.read<AuthController>().logout();
  }

  @override
  Widget build(BuildContext context) {
    final rc = context.watch<RuntimeConfig>();
    final c = context.pos;
    final themeName = switch (rc.themeMode) {
      'DARK' => tr('Dark'),
      'SYSTEM' => tr('System'),
      _ => tr('Light'),
    };
    return ListView(
      // Full width with the same gutters as the other tabs.
      padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.lg, PosSpacing.xxl),
      children: [
        PageHeader(title: tr('More'), subtitle: tr('Profile and settings')),
        const SizedBox(height: PosSpacing.lg),
        Container(
          padding: const EdgeInsets.all(PosSpacing.xl),
          decoration: BoxDecoration(
            gradient: PosColors.sidebarGradient,
            borderRadius: BorderRadius.circular(PosRadius.lg + 2),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: Colors.white,
                child: Text(
                  session.name.isEmpty ? '?' : session.name.characters.first.toUpperCase(),
                  style: PosType.title.copyWith(color: PosColors.sidebarActiveText),
                ),
              ),
              const SizedBox(width: PosSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(session.name, style: PosType.heading.copyWith(color: Colors.white)),
                    Text(roleLabel(session.role), style: PosType.body.copyWith(color: Colors.white70)),
                    Text(session.email, style: PosType.caption.copyWith(color: Colors.white60)),
                    if (session.branchLabel != null) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(PosRadius.pill),
                        ),
                        child: Text(session.branchLabel!, style: PosType.label.copyWith(color: Colors.white)),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        if (pages.isNotEmpty) ...[
          const SizedBox(height: PosSpacing.lg),
          SectionLabel(tr('Pages')),
          PosCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final (i, (label, icon, open)) in pages.indexed) ...[
                  if (i > 0) _divider(c),
                  ListTile(
                    leading: Icon(icon, color: c.brand),
                    title: Text(label, style: PosType.bodyStrong.copyWith(color: c.text)),
                    trailing: Icon(Icons.chevron_right_rounded, color: c.textMuted),
                    onTap: open,
                  ),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: PosSpacing.lg),
        SectionLabel(tr('Preferences')),
        PosCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _SettingTile(
                icon: Icons.palette_outlined,
                title: tr('Theme'),
                value: themeName,
                onTap: () => _pickTheme(context, rc),
              ),
              _divider(c),
              ListTile(
                leading: Icon(Icons.translate_rounded, color: c.brand),
                title: Text(tr('Language'), style: PosType.body.copyWith(color: c.text)),
                trailing: const PosLanguageSwitch(),
              ),
              _divider(c),
              SwitchListTile(
                secondary: Icon(Icons.volume_up_outlined, color: c.brand),
                title: Text(tr('New order sound'), style: PosType.body.copyWith(color: c.text)),
                subtitle: Text(
                  tr('Chime when a new order arrives'),
                  style: PosType.caption.copyWith(color: c.textMuted),
                ),
                value: rc.soundEnabled,
                onChanged: (v) => rc.soundEnabled = v,
              ),
              _divider(c),
              SwitchListTile(
                secondary: Icon(Icons.vibration_rounded, color: c.brand),
                title: Text(tr('Haptic feedback'), style: PosType.body.copyWith(color: c.text)),
                value: rc.hapticsEnabled,
                onChanged: (v) => rc.hapticsEnabled = v,
              ),
            ],
          ),
        ),
        if (rc.overridesAllowed) ...[
          const SizedBox(height: PosSpacing.lg),
          SectionLabel(tr('Developer')),
          PosCard(
            padding: EdgeInsets.zero,
            child: _SettingTile(
              icon: Icons.dns_outlined,
              title: tr('API server'),
              value: rc.apiBaseUrl,
              onTap: () => showServerUrlDialog(context, context.read<AppContainer>()),
            ),
          ),
        ],
        const SizedBox(height: PosSpacing.xl),
        PosButton(
          label: tr('Sign Out'),
          icon: Icons.logout_rounded,
          variant: PosButtonVariant.outline,
          onPressed: () => _logout(context),
        ),
      ],
    );
  }

  Widget _divider(PosColors c) => Divider(height: 1, indent: 56, color: c.border.withValues(alpha: 0.6));
}

class _SettingTile extends StatelessWidget {
  const _SettingTile({required this.icon, required this.title, required this.value, required this.onTap});
  final IconData icon;
  final String title;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return ListTile(
      leading: Icon(icon, color: c.brand),
      title: Text(title, style: PosType.body.copyWith(color: c.text)),
      subtitle: Text(
        value,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: PosType.caption.copyWith(color: c.textMuted),
      ),
      trailing: Icon(Icons.chevron_right_rounded, color: c.textMuted),
      onTap: onTap,
    );
  }
}
