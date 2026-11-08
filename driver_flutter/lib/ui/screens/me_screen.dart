import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/local_profile.dart';
import '../../l10n/l10n.dart';
import '../../state/auth_controller.dart';
import '../../state/jobs_controller.dart';
import '../components/bc_dialog.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../components/tab_scaffold.dart';
import '../theme/bc_theme.dart';
import 'branches_screen.dart';
import 'breakdown_screen.dart';
import 'edit_profile_screen.dart';
import 'inbox_screens.dart';
import 'settings_screen.dart';

/// Profile tab (QuickDrop profile.tsx): who the rider is, their assignment and the
/// entry points to edit profile, branches, settings, help, breakdown and issue reports.
class MeScreen extends StatefulWidget {
  const MeScreen({super.key});

  @override
  State<MeScreen> createState() => _MeScreenState();
}

class _MeScreenState extends State<MeScreen> {
  @override
  void initState() {
    super.initState();
    LocalProfile.instance.load();
    context.read<JobsController>().load();
  }

  void _push(Widget page) {
    BcFeedback.tap();
    // JobsController lives in the home shell, pushed pages need it passed along.
    final vm = context.read<JobsController>();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChangeNotifierProvider<JobsController>.value(value: vm, child: page),
      ),
    );
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

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    final auth = context.watch<AuthController>();
    final profile = vm.profile;
    final branches = riderBranches(vm, auth);
    final phone = nonBlank(profile?.phone);
    final vehicle = riderVehicleLine(profile);
    final riderId = nonBlank(profile?.id ?? auth.driver?.id);
    final rating = profile?.avgRating;
    final merit = profile?.meritPoints;

    return ListenableBuilder(
      listenable: LocalProfile.instance,
      builder: (context, _) {
        final name = riderDisplayName(LocalProfile.instance.displayName, profile, auth);
        return BcTabScaffold(
          title: tr('Profile'),
          onRefresh: vm.load,
          children: [
            QdCard(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  QdAvatar(name: name, photoUrl: profile?.profilePhotoUrl, size: 72),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: BcType.title.copyWith(color: c.foreground),
                        ),
                        if (rating != null) ...[
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              Icon(Icons.star_rounded, size: 16, color: c.warning),
                              const SizedBox(width: 4),
                              Text(
                                tr('{rating} rating', {'rating': rating.toStringAsFixed(1)}),
                                style: TextStyle(fontSize: 14, color: c.mutedForeground),
                              ),
                            ],
                          ),
                        ],
                        if (merit != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            tr('Merit {points}', {'points': merit}),
                            style: TextStyle(fontSize: 14, color: c.mutedForeground),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  QdSoftIconButton(
                    icon: Icons.edit_outlined,
                    tooltip: tr('Edit profile'),
                    onTap: () => _push(const EditProfileScreen()),
                  ),
                ],
              ),
            ),
            QdSectionTitle(tr('Account')),
            QdGroup(
              children: [
                if (riderId != null)
                  QdRow(
                    icon: Icons.tag_rounded,
                    title: tr('Rider ID'),
                    subtitle: riderId.length > 10 ? riderId.substring(0, 8).toUpperCase() : riderId.toUpperCase(),
                  ),
                if (phone != null)
                  QdRow(icon: Icons.phone_outlined, title: tr('Mobile number'), subtitle: Format.lkMobileDisplay(phone)),
                if (vehicle.isNotEmpty) QdRow(icon: Icons.two_wheeler_outlined, title: tr('Vehicle'), subtitle: vehicle),
              ],
            ),
            QdFootnote(tr('Managed by Bring It. Contact support to change these details.')),
            QdSectionTitle(
              tr('Assigned branches'),
              actionLabel: tr('Manage'),
              onAction: () => _push(const BranchesScreen()),
            ),
            QdGroup(
              children: [
                for (final b in branches)
                  QdRow(
                    icon: Icons.storefront_outlined,
                    title: Format.shortBranchName(b.name),
                    subtitle: nonBlank(b.city),
                  ),
                if (branches.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text('—', style: TextStyle(color: c.mutedForeground)),
                  ),
              ],
            ),
            const SizedBox(height: 24),
            QdGroup(
              children: [
                QdRow(
                  icon: Icons.person_outline_rounded,
                  title: tr('Edit profile'),
                  subtitle: tr('Name and profile photo'),
                  onTap: () => _push(const EditProfileScreen()),
                ),
                QdRow(
                  icon: Icons.storefront_outlined,
                  title: tr('Branch management'),
                  subtitle: tr('Your branches and change requests'),
                  onTap: () => _push(const BranchesScreen()),
                ),
                QdRow(
                  icon: Icons.settings_outlined,
                  title: tr('Settings'),
                  subtitle: tr('Job alerts and preferences'),
                  onTap: () => _push(const SettingsScreen()),
                ),
                QdRow(
                  icon: Icons.help_outline_rounded,
                  title: tr('Help & support'),
                  subtitle: tr('Contact the Bring It support team'),
                  onTap: () => _push(const SupportScreen()),
                ),
                QdRow(
                  icon: Icons.build_outlined,
                  title: tr('View breakdown status'),
                  onTap: () => _push(const BreakdownScreen()),
                ),
                QdRow(
                  icon: Icons.flag_outlined,
                  title: tr('Issue reports'),
                  onTap: () => _push(const ComplaintsScreen()),
                ),
              ],
            ),
            const SizedBox(height: 24),
            QdPillButton(
              label: tr('Log out'),
              icon: Icons.logout_rounded,
              style: QdPillStyle.dangerOutline,
              onPressed: () => _logout(vm, auth),
            ),
            const SizedBox(height: 8),
          ],
        );
      },
    );
  }
}
