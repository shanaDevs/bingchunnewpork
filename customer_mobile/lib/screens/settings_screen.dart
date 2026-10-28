import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _storage = const FlutterSecureStorage();
  static const _biometricKey = 'bc_settings_biometric';
  static const _locationKey = 'bc_settings_location';

  bool _biometric = false;
  bool _location = true;

  bool _notifyPush = true;
  bool _notifySms = true;
  bool _notifyEmail = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final user = ref.read(authProvider).user;
    if (user != null) {
      _notifyPush = user.notifyPush;
      _notifySms = user.notifySms;
      _notifyEmail = user.notifyEmail;
    }

    try {
      final bio = await _storage.read(key: _biometricKey);
      final loc = await _storage.read(key: _locationKey);
      setState(() {
        _biometric = bio == 'true';
        if (loc != null) _location = loc == 'true';
      });
    } catch (_) {}
  }

  Future<void> _toggleBiometric(bool val) async {
    setState(() => _biometric = val);
    await _storage.write(key: _biometricKey, value: val ? 'true' : 'false');
    if (mounted) {
      showAppToast(context, val ? 'Biometric authentication enabled' : 'Biometric authentication disabled');
    }
  }

  Future<void> _toggleLocation(bool val) async {
    setState(() => _location = val);
    await _storage.write(key: _locationKey, value: val ? 'true' : 'false');
    if (mounted) {
      showAppToast(context, val ? 'Location access enabled' : 'Location access disabled');
    }
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      backgroundColor: bc.pageBg,
      appBar: AppBar(
        title: const Text('Settings'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSectionHeader('Appearance', onSurface),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: bc.cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: bc.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Theme',
                  style: TextStyle(color: onSurface, fontWeight: FontWeight.w700, fontSize: 15),
                ),
                const SizedBox(height: 4),
                Text(
                  'Choose light or dark appearance.',
                  style: TextStyle(color: bc.mutedText, fontSize: 12),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _ThemeChoiceChip(
                        label: 'Light',
                        icon: Icons.light_mode_rounded,
                        selected: themeMode == ThemeMode.light,
                        onTap: () => ref.read(themeModeProvider.notifier).setMode(ThemeMode.light),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _ThemeChoiceChip(
                        label: 'Dark',
                        icon: Icons.dark_mode_rounded,
                        selected: themeMode == ThemeMode.dark,
                        onTap: () => ref.read(themeModeProvider.notifier).setMode(ThemeMode.dark),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _buildSectionHeader('Security & System', onSurface),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: bc.cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: bc.border),
            ),
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('Biometric Login'),
                  subtitle: Text('Access the app using Face ID / Fingerprint.', style: TextStyle(color: bc.mutedText, fontSize: 11)),
                  value: _biometric,
                  activeColor: BcColors.brand,
                  onChanged: _toggleBiometric,
                ),
                Divider(color: bc.border, height: 1),
                SwitchListTile(
                  title: const Text('Location Access'),
                  subtitle: Text('Enable real-time tracking for boba deliveries.', style: TextStyle(color: bc.mutedText, fontSize: 11)),
                  value: _location,
                  activeColor: BcColors.brand,
                  onChanged: _toggleLocation,
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _buildSectionHeader('Notification Preferences', onSurface),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: bc.cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: bc.border),
            ),
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('Push Notifications'),
                  subtitle: Text('Alerts on boba orders, delivery, and promos.', style: TextStyle(color: bc.mutedText, fontSize: 11)),
                  value: _notifyPush,
                  activeColor: BcColors.brand,
                  onChanged: (v) {
                    setState(() => _notifyPush = v);
                    showAppToast(context, 'Notification settings updated');
                  },
                ),
                Divider(color: bc.border, height: 1),
                SwitchListTile(
                  title: const Text('SMS Vouchers'),
                  subtitle: Text('Receive weekly discount codes via SMS.', style: TextStyle(color: bc.mutedText, fontSize: 11)),
                  value: _notifySms,
                  activeColor: BcColors.brand,
                  onChanged: (v) {
                    setState(() => _notifySms = v);
                    showAppToast(context, 'SMS preferences updated');
                  },
                ),
                Divider(color: bc.border, height: 1),
                SwitchListTile(
                  title: const Text('Email Receipts'),
                  subtitle: Text('Get digital invoice directly in your mailbox.', style: TextStyle(color: bc.mutedText, fontSize: 11)),
                  value: _notifyEmail,
                  activeColor: BcColors.brand,
                  onChanged: (v) {
                    setState(() => _notifyEmail = v);
                    showAppToast(context, 'Email preferences updated');
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, Color color) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.bold,
          color: color,
        ),
      ),
    );
  }
}

class _ThemeChoiceChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _ThemeChoiceChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? BcColors.brand : context.bc.secondaryBg,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: selected ? Colors.white : context.bc.mutedText),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : Theme.of(context).colorScheme.onSurface,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
