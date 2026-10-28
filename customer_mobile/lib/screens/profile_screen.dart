import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/shell_layout.dart';
import '../widgets/dashboard_sections.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  static final _pointsFormatter = NumberFormat('#,###');

  Future<void> _signOut() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign Out', style: TextStyle(color: BcColors.error)),
          ),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;

    await ref.read(authProvider.notifier).logout();
    if (!mounted) return;
    // Router also redirects on unauthenticated; go() forces a clean login entry.
    context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final user = auth.user;
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bottomOffset = shellCartBillBottomOffset(context);

    if (user == null) {
      if (auth.status == AuthStatus.unauthenticated) {
        return const SizedBox.shrink();
      }
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: BcColors.brand)),
      );
    }

    final tier = loyaltyTierLabel(user.loyaltyPoints);
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      backgroundColor: bc.pageBg,
      extendBody: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Profile',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: onSurface,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.settings_outlined, color: onSurface, size: 26),
            onPressed: () => context.push('/profile/settings'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 12),
            // Avatar Circular Container
            Center(
              child: Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: bc.secondaryBg,
                  border: Border.all(color: BcColors.brand, width: 3),
                  boxShadow: [
                    BoxShadow(
                      color: BcColors.brand.withOpacity(isDark ? 0.35 : 0.15),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: ClipOval(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Image.asset(
                      'assets/brand/mascot-hover.png',
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => Image.asset(
                        'assets/brand/logo.png',
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) =>
                            const Icon(Icons.person_rounded, color: BcColors.brand, size: 48),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            // User Name
            Text(
              user.name,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: onSurface,
              ),
            ),
            const SizedBox(height: 6),
            // Loyalty Tier Badge with Crown Icons
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.emoji_events_rounded, color: Color(0xFFF59E0B), size: 16),
                const SizedBox(width: 6),
                Text(
                  tier,
                  style: const TextStyle(
                    color: Color(0xFFF59E0B),
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.emoji_events_rounded, color: Color(0xFFF59E0B), size: 16),
              ],
            ),
            const SizedBox(height: 24),
            // Your Points Card
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              decoration: BoxDecoration(
                color: bc.cardBg,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: bc.border),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Your Points',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white.withOpacity(0.9) : BcColors.lightText,
                    ),
                  ),
                  Row(
                    children: [
                      Text(
                        _pointsFormatter.format(user.loyaltyPoints),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFFF59E0B),
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Icon(Icons.star_rounded, color: Color(0xFFF59E0B), size: 22),
                    ],
                  )
                ],
              ),
            ),
            const SizedBox(height: 20),
            // Consolidated Options Card List
            Material(
              color: bc.cardBg,
              borderRadius: BorderRadius.circular(20),
              clipBehavior: Clip.antiAlias,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: bc.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    _buildMenuRow(
                    context: context,
                    icon: Icons.person_outline_rounded,
                    title: 'My Profile',
                    route: '/profile/details',
                    bc: bc,
                    onSurface: onSurface,
                  ),
                  _buildDivider(bc),
                  _buildMenuRow(
                    context: context,
                    icon: Icons.location_on_outlined,
                    title: 'Address Book',
                    route: '/profile/addresses',
                    bc: bc,
                    onSurface: onSurface,
                  ),
                  _buildDivider(bc),
                  _buildMenuRow(
                    context: context,
                    icon: Icons.credit_card_outlined,
                    title: 'Payment Methods',
                    route: '/profile/payments',
                    bc: bc,
                    onSurface: onSurface,
                  ),
                  _buildDivider(bc),
                  _buildMenuRow(
                    context: context,
                    icon: Icons.card_giftcard_rounded,
                    title: 'Refer & Earn',
                    route: '/profile/referral',
                    bc: bc,
                    onSurface: onSurface,
                  ),
                  _buildDivider(bc),
                  _buildMenuRow(
                    context: context,
                    icon: Icons.help_outline_rounded,
                    title: 'Help & Support',
                    route: '/profile/support',
                    bc: bc,
                    onSurface: onSurface,
                  ),
                  _buildDivider(bc),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.palette_outlined, color: bc.mutedText, size: 22),
                            const SizedBox(width: 16),
                            Text(
                              'Theme',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: onSurface,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: _ProfileThemeChip(
                                label: 'Light',
                                icon: Icons.light_mode_rounded,
                                selected: themeMode == ThemeMode.light,
                                onTap: () => ref.read(themeModeProvider.notifier).setMode(ThemeMode.light),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: _ProfileThemeChip(
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
                  _buildDivider(bc),
                  _buildMenuRow(
                    context: context,
                    icon: Icons.settings_outlined,
                    title: 'Settings',
                    route: '/profile/settings',
                    bc: bc,
                    onSurface: onSurface,
                  ),
                ],
              ),
            ),
          ),
            const SizedBox(height: 24),
            // Sign Out Button
            OutlinedButton.icon(
              onPressed: _signOut,
              icon: const Icon(Icons.logout_rounded, size: 20),
              label: const Text('Sign Out', style: TextStyle(fontWeight: FontWeight.bold)),
              style: OutlinedButton.styleFrom(
                foregroundColor: BcColors.error,
                side: const BorderSide(color: BcColors.error, width: 1.5),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
            ),
            SizedBox(height: 100 + bottomOffset),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuRow({
    required BuildContext context,
    required IconData icon,
    required String title,
    required String route,
    required BcAdaptive bc,
    required Color onSurface,
  }) {
    return ListTile(
      onTap: () => context.push(route),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      leading: Icon(icon, color: bc.mutedText, size: 22),
      title: Text(
        title,
        style: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: onSurface,
        ),
      ),
      trailing: Icon(Icons.arrow_forward_ios_rounded, color: bc.mutedText.withOpacity(0.6), size: 16),
    );
  }

  Widget _buildDivider(BcAdaptive bc) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Divider(color: bc.border, height: 1),
    );
  }
}

class _ProfileThemeChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _ProfileThemeChip({
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
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: selected ? Colors.white : context.bc.mutedText),
              const SizedBox(width: 6),
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
