import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/app_container.dart';
import '../../core/app_lock.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../core/runtime_config.dart';
import '../../core/system_settings.dart';
import '../../data/models/driver.dart';
import '../../state/auth_controller.dart';
import '../../state/jobs_controller.dart';
import '../../state/stats_controller.dart';
import '../components/bc_dialog.dart';
import '../components/driver_ops.dart';
import '../components/illustrations.dart';
import '../components/sheet_kit.dart';
import '../components/tab_scaffold.dart';
import '../theme/bc_theme.dart';
import 'app_lock_sheet.dart';
import 'job_sheets.dart';
import 'me_sheets.dart';
import 'server_url_dialog.dart';
import '../../l10n/l10n.dart';

/// Driver profile & settings — port of MeScreen.kt.
class MeScreen extends StatelessWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => StatsController(ctx.read<AppContainer>())..loadRatings(),
      child: const _MeBody(),
    );
  }
}

class _MeBody extends StatefulWidget {
  const _MeBody();

  @override
  State<_MeBody> createState() => _MeBodyState();
}

class _MeBodyState extends State<_MeBody> with WidgetsBindingObserver {
  // Notifier so the open profile details sheet updates when a request is reviewed.
  final _myBranchRequests = ValueNotifier<List<DriverBranchRequest>>(const []);
  // Admin review sends no socket/push event, so poll while a request is pending.
  static const _pendingPollInterval = Duration(seconds: 20);
  Timer? _pendingPoll;
  // Guards against repeated taps while the branch list loads or the sheet is open.
  bool _branchRequestBusy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    context.read<JobsController>().load();
    _loadBranchRequests();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pendingPoll?.cancel();
    _myBranchRequests.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadBranchRequests();
    } else if (state == AppLifecycleState.paused) {
      _pendingPoll?.cancel();
    }
  }

  static bool _isPending(DriverBranchRequest r) => r.status.toUpperCase() == 'PENDING';

  Future<void> _loadBranchRequests() async {
    final vm = context.read<JobsController>();
    try {
      final list = await vm.listMyBranchRequests();
      if (!mounted) return;
      final wasPending = _myBranchRequests.value.where(_isPending).map((r) => r.id).toSet();
      final reviewed = list.any((r) => wasPending.contains(r.id) && !_isPending(r));
      _myBranchRequests.value = list;
      // An approval changes the rider's branches/home, so refresh the profile too.
      if (reviewed) vm.load();
      _pendingPoll?.cancel();
      if (list.any(_isPending)) _pendingPoll = Timer(_pendingPollInterval, _loadBranchRequests);
    } catch (_) {
      // Profile still works if request history fails to load.
    }
  }

  List<StoreRef> _branches(JobsController vm, AuthController auth) {
    final fromProfile = vm.profile?.accessibleStores ?? const <StoreRef>[];
    if (fromProfile.isNotEmpty) return fromProfile;
    final d = auth.driver;
    return [
      if (vm.profile?.store != null) vm.profile!.store!,
      if (d?.storeName != null) StoreRef(id: d?.storeId ?? '', name: d!.storeName!, city: d.storeCity),
    ];
  }

  Future<void> _requestBranchChange(JobsController vm, AuthController auth) async {
    if (_branchRequestBusy) return;
    _branchRequestBusy = true;
    try {
      BcFeedback.tap();
      final messenger = ScaffoldMessenger.of(context);
      final branches = _branches(vm, auth);
      List<BranchOption> stores;
      try {
        final fromApi = await vm.listStoresForBranchRequest();
        final known = branches.map((b) => BranchOption(id: b.id, name: b.name, city: b.city));
        final seen = <String>{};
        stores = [...fromApi, ...known].where((s) => s.id.trim().isNotEmpty && seen.add(s.id)).toList();
      } catch (e) {
        BcFeedback.error();
        messenger.showSnackBar(SnackBar(content: Text('$e'.isEmpty ? tr('Could not load branches') : '$e')));
        return;
      }
      if (!mounted) return;
      final submitted = await showBranchRequestSheet(
        context,
        stores: stores,
        accessibleStoreIds: branches.map((b) => b.id).where((id) => id.trim().isNotEmpty).toSet(),
        homeStoreId: vm.profile?.storeId ?? auth.driver?.storeId,
        onSubmit: (type, toStoreId, reason) => vm.createBranchRequest(type, toStoreId, reason),
      );
      if (submitted) {
        BcFeedback.success();
        _loadBranchRequests();
      }
    } finally {
      _branchRequestBusy = false;
    }
  }

  Future<void> _toggleDuty(JobsController vm, bool online) async {
    BcFeedback.tap();
    if (online) {
      await vm.setOnline(true);
      // Android 14+: prompt once to allow full-screen ride alerts.
      final prefs = await SharedPreferences.getInstance();
      if (RuntimeConfig.instance.fullScreenAlertsEnabled &&
          !await SystemSettings.canUseFullScreenIntent() &&
          !(prefs.getBool('fsi_prompt_shown') ?? false)) {
        await prefs.setBool('fsi_prompt_shown', true);
        if (mounted) showJobAlertsSheet(context);
      }
      return;
    }
    final confirm = await showBcConfirm(
      context,
      icon: Icons.power_settings_new_rounded,
      tone: BcDialogTone.warning,
      title: tr('Stop receiving jobs?'),
      message: tr(
        'You will go off duty and stop getting new delivery rides. You can go back on duty from this screen at any time.',
      ),
      confirmLabel: tr('Go off duty'),
      cancelLabel: tr('Stay on duty'),
    );
    if (confirm) vm.setOnline(false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    final auth = context.watch<AuthController>();
    final rc = context.watch<RuntimeConfig>();
    final stats = context.watch<StatsController>();
    final lock = context.watch<AppLock>();
    final profile = vm.profile;

    final driverName = profile?.name ?? auth.driver?.name ?? tr('Driver');
    final storeName = _nonBlank(profile?.store?.name ?? auth.driver?.storeName);
    final storeCity = _nonBlank(profile?.store?.city ?? auth.driver?.storeCity);
    final initial = driverName.trim().isEmpty ? 'D' : driverName.trim()[0].toUpperCase();
    final meritStatus = _nonBlank(profile?.meritStatus)?.toUpperCase();

    final dark = c.isDark;
    Widget caption(String t) => Text(t, style: TextStyle(fontSize: 12.5, color: c.textMuted));
    return BcTabScaffold(
      title: tr('Driver Profile'),
      titleBar: true,
      heroArt: true,
      subtitle: tr('Manage your account, preferences and workplace settings.'),
      actions: [
        BcHeaderIconButton(
          icon: Icons.settings_outlined,
          tooltip: tr('Settings'),
          onTap: () {
            BcFeedback.tap();
            showBcDialog<void>(context, builder: (_) => const ServerUrlDialog());
          },
        ),
      ],
      onRefresh: () => Future.wait([vm.load(), _loadBranchRequests()]),
      children: [
        _DriverProfileCard(
          driverName: driverName,
          initial: initial,
          photoUrl: profile?.profilePhotoUrl,
          isOnline: vm.isOnline,
          meritPoints: profile?.meritPoints,
          meritStatus: meritStatus,
          storeName: storeName,
          storeCity: storeCity,
          avgRating: profile?.avgRating,
          ratingCount: profile?.ratingCount,
          onTap: () {
            BcFeedback.tap();
            _showProfileDetails(context, vm, auth, stats, initial, meritStatus);
          },
        ),
        const SizedBox(height: 12),
        _DutyStatusCard(isOnline: vm.isOnline, loading: vm.dutyLoading, onToggle: (v) => _toggleDuty(vm, v)),
        const SizedBox(height: 12),
        BcGroupCard(
          children: [
            BcListRow(
              icon: Icons.swap_horiz_rounded,
              iconBg: c.brandSubtle,
              iconTint: c.brand,
              title: tr('Request branch change'),
              subtitle: tr('Switch to another branch or area'),
              onTap: () => _requestBranchChange(vm, auth),
            ),
          ],
        ),
        BcSectionHeader(title: tr('Work'), trailing: caption(tr('Manage your activities'))),
        BcGroupCard(
          children: [
            BcListRow(
              icon: Icons.schedule_outlined,
              iconBg: dark ? const Color(0xFF1E293B) : const Color(0xFFE0EDFD),
              iconTint: dark ? const Color(0xFF60A5FA) : const Color(0xFF2563EB),
              title: tr('Shift history'),
              subtitle: tr('See when you went on and off duty'),
              onTap: () {
                BcFeedback.tap();
                showShiftHistory(context, vm.getShiftHistory);
              },
            ),
            BcListRow(
              icon: Icons.notifications_outlined,
              iconBg: dark ? const Color(0xFF3B1E22) : const Color(0xFFFDE8E8),
              iconTint: dark ? const Color(0xFFF87171) : const Color(0xFFDC2626),
              title: tr('Job alerts'),
              subtitle: tr('Notification settings for new jobs'),
              onTap: () {
                BcFeedback.tap();
                showJobAlertsSheet(context);
              },
            ),
          ],
        ),
        BcSectionHeader(title: tr('Preferences'), trailing: caption(tr('Customize your experience'))),
        BcGroupCard(
          children: [
            _SegmentRow<bool>(
              icon: Icons.light_mode_outlined,
              iconBg: dark ? const Color(0xFF2E2415) : const Color(0xFFFEF3C7),
              iconTint: dark ? const Color(0xFFFBBF24) : const Color(0xFFD97706),
              title: tr('App theme'),
              subtitle: tr('Choose your preferred appearance'),
              options: [(false, tr('Light'), Icons.light_mode_outlined), (true, tr('Dark'), Icons.dark_mode_outlined)],
              selected: rc.themeMode.toUpperCase() == 'DARK',
              onSelect: (d) {
                BcFeedback.tap();
                rc.themeMode = d ? 'DARK' : 'LIGHT';
              },
            ),
            _SegmentRow<AppLanguage>(
              icon: Icons.translate_rounded,
              iconBg: dark ? const Color(0xFF0C2D3A) : const Color(0xFFE0F2FE),
              iconTint: dark ? const Color(0xFF38BDF8) : const Color(0xFF0284C7),
              title: tr('Language'),
              subtitle: tr('Choose your app language'),
              options: [for (final l in AppLanguage.values) (l, l.nativeName, null)],
              selected: rc.language,
              onSelect: (l) {
                BcFeedback.tap();
                rc.language = l;
              },
            ),
            BcListRow(
              icon: Icons.shield_outlined,
              iconBg: dark ? const Color(0xFF052E2B) : const Color(0xFFCCFBF1),
              iconTint: dark ? const Color(0xFF2DD4BF) : const Color(0xFF0D9488),
              title: tr('App lock'),
              subtitle: lock.enabled
                  ? tr('On · {method}', {'method': appLockLabel(lock.method)})
                  : AppLock.combinedBiometric
                  ? tr('PIN or biometric')
                  : tr('PIN, fingerprint or Face ID'),
              trailing: Icon(Icons.chevron_right_rounded, color: c.textMuted),
              onTap: () {
                BcFeedback.tap();
                showAppLockSheet(context);
              },
            ),
            BcListRow(
              icon: Icons.volume_up_outlined,
              iconBg: dark ? const Color(0xFF2E1065).withValues(alpha: 0.45) : const Color(0xFFEDE9FE),
              iconTint: dark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED),
              title: tr('Sounds'),
              subtitle: tr('Job alerts and completion tones'),
              trailing: BcSwitch(
                value: rc.soundEnabled,
                onChanged: (v) {
                  BcFeedback.tap();
                  rc.soundEnabled = v;
                },
              ),
            ),
            BcListRow(
              icon: Icons.vibration,
              iconBg: dark ? const Color(0xFF064E3B).withValues(alpha: 0.45) : const Color(0xFFDCFCE7),
              iconTint: dark ? const Color(0xFF34D399) : const Color(0xFF16A34A),
              title: tr('Haptics'),
              subtitle: tr('For claim, start, verify, and errors'),
              trailing: BcSwitch(
                value: rc.hapticsEnabled,
                onChanged: (v) {
                  BcFeedback.tap();
                  rc.hapticsEnabled = v;
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _VehicleBreakdownCard(
          isOnline: vm.isOnline,
          onReport: () async {
            BcFeedback.tap();
            final ok = await showVehicleFailureDialog(context, vm.reportVehicleFailure);
            ok ? BcFeedback.success() : BcFeedback.error();
          },
        ),
        const SizedBox(height: 12),
        _SignOutCard(
          onTap: () async {
            BcFeedback.tap();
            if (await vm.hasHeldJob()) {
              if (!context.mounted) return;
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
            if (!context.mounted) return;
            final ok = await showBcConfirm(
              context,
              icon: Icons.logout_rounded,
              tone: BcDialogTone.danger,
              title: tr('Sign out?'),
              message: vm.isOnline
                  ? tr('You are on duty. Signing out stops new job alerts on this phone until you sign in again.')
                  : tr('You will need an SMS code to sign in again. Your app lock will be turned off.'),
              confirmLabel: tr('Sign out'),
              confirmIcon: Icons.logout_rounded,
            );
            if (ok) auth.logout();
          },
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  void _showProfileDetails(
    BuildContext context,
    JobsController vm,
    AuthController auth,
    StatsController stats,
    String initial,
    String? meritStatus,
  ) {
    _loadBranchRequests();
    // Fresh profile = fresh signed licence link (an earlier one may have expired).
    vm.refreshProfile();
    showBcSheet<void>(
      context,
      builder: (_) => ChangeNotifierProvider.value(
        value: stats,
        // Rebuild on profile or request changes so a review shows without reopening.
        child: ListenableBuilder(
          listenable: Listenable.merge([vm, _myBranchRequests]),
          builder: (_, _) => _ProfileDetailsSheet(
            driverName: vm.profile?.name ?? auth.driver?.name ?? tr('Driver'),
            initial: initial,
            isOnline: vm.isOnline,
            profile: vm.profile,
            meritStatus: meritStatus,
            branches: _branches(vm, auth),
            branchRequests: _myBranchRequests.value,
            onRetryLicense: vm.refreshProfile,
          ),
        ),
      ),
    );
  }
}

String? _nonBlank(String? s) => (s == null || s.trim().isEmpty) ? null : s;

String _meritLabel(int? points, String? status) {
  final raw = _nonBlank(status)?.toUpperCase();
  final standing = raw == null ? null : tr(raw);
  if (points == null && standing == null) return '—';
  if (points != null && standing != null) {
    return tr('Merit {points} · {standing}', {'points': points, 'standing': standing});
  }
  if (points != null) return tr('Merit {points}', {'points': points});
  return standing ?? '—';
}

String _ratingLine(double average, int? count) {
  final score = average.toStringAsFixed(1);
  final reviews = count ?? 0;
  return reviews > 0 ? tr('{score} · {reviews} reviews', {'score': score, 'reviews': reviews}) : score;
}

/// Avatar with a soft brand ring and an online/offline dot.
class _RingAvatar extends StatelessWidget {
  const _RingAvatar({required this.photoUrl, required this.initial, required this.online, this.size = 60});
  final String? photoUrl;
  final String initial;
  final bool online;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: c.brandSubtle,
            border: Border.all(color: c.brand.withValues(alpha: 0.25), width: 1.5),
          ),
          child: DriverAvatar(profilePhotoUrl: photoUrl, initials: initial, size: size, textSize: size * 0.42),
        ),
        Positioned(
          right: 2,
          bottom: 2,
          child: Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: online ? const Color(0xFF22C55E) : c.disabled,
              border: Border.all(color: c.card, width: 2.5),
            ),
          ),
        ),
      ],
    );
  }
}

class _DriverProfileCard extends StatelessWidget {
  const _DriverProfileCard({
    required this.driverName,
    required this.initial,
    required this.photoUrl,
    required this.isOnline,
    required this.meritPoints,
    required this.meritStatus,
    required this.storeName,
    required this.storeCity,
    required this.avgRating,
    required this.ratingCount,
    required this.onTap,
  });

  final String driverName;
  final String initial;
  final String? photoUrl;
  final bool isOnline;
  final int? meritPoints;
  final String? meritStatus;
  final String? storeName;
  final String? storeCity;
  final double? avgRating;
  final int? ratingCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final branchLine = [storeName, storeCity].whereType<String>().toSet().join(' · ');
    return BcGroupCard(
      children: [
        InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 12, 18),
            child: Row(
              children: [
                _RingAvatar(photoUrl: photoUrl, initial: initial, online: isOnline),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        driverName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: c.text),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.storefront_outlined, size: 15, color: c.textMuted),
                          const SizedBox(width: 5),
                          Expanded(
                            child: Text(
                              branchLine.isEmpty ? '—' : branchLine,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, color: c.textMuted),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _Pill(
                            icon: Icons.workspace_premium_outlined,
                            text: _meritLabel(meritPoints, meritStatus),
                            color: c.brand,
                          ),
                          if (avgRating != null)
                            _Pill(
                              icon: Icons.star_rounded,
                              text: _ratingLine(avgRating!, ratingCount),
                              color: c.warning,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: c.textMuted, size: 24),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.text, required this.color});
  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 5),
        Text(
          text,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color),
        ),
      ],
    ),
  );
}

class _DutyStatusCard extends StatelessWidget {
  const _DutyStatusCard({required this.isOnline, required this.loading, required this.onToggle});

  final bool isOnline;
  final bool loading;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final dark = c.isDark;
    final on = isOnline;
    final divider = on ? (dark ? const Color(0xFF065F46) : const Color(0xFFBBEBD3)) : c.border;
    return AnimatedContainer(
      duration: BcMotion.standard,
      padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BcRadius.card),
        gradient: LinearGradient(
          colors: on
              ? (dark
                    ? [const Color(0xFF064E3B).withValues(alpha: 0.35), const Color(0xFF022C22).withValues(alpha: 0.45)]
                    : const [Color(0xFFECFDF5), Color(0xFFE2F8EE)])
              : [c.card, c.card],
        ),
        border: Border.all(color: on ? (dark ? const Color(0xFF065F46) : const Color(0xFFA7F3D0)) : c.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    AnimatedContainer(
                      duration: BcMotion.standard,
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: on
                            ? const Color(0xFF10B981)
                            : (dark ? const Color(0xFF64748B) : const Color(0xFF94A3B8)),
                        boxShadow: on
                            ? [BoxShadow(color: const Color(0xFF10B981).withValues(alpha: 0.45), blurRadius: 6)]
                            : null,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      on ? tr('On duty') : tr('Off duty'),
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.text),
                    ),
                    if (loading) ...[
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(strokeWidth: 1.5, color: c.brand),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Padding(
                  padding: const EdgeInsets.only(left: 22),
                  child: Text(
                    on ? tr('Ready to receive jobs') : tr('You are not receiving new jobs'),
                    style: TextStyle(fontSize: 12.5, color: c.textMuted),
                  ),
                ),
              ],
            ),
          ),
          Container(width: 1, height: 44, color: divider),
          const SizedBox(width: 10),
          on
              ? const ScooterIllustration(width: 64, height: 40)
              : const ScooterIllustration(
                  width: 64,
                  height: 40,
                  primary: Color(0xFFCBD5E1),
                  accent: Color(0xFFE2E8F0),
                  stroke: Color(0xFF94A3B8),
                ),
          const SizedBox(width: 6),
          BcSwitch(value: on, onChanged: loading ? null : onToggle),
        ],
      ),
    );
  }
}

/// Brand switch used across the Me tab.
/// Preference row with a compact segmented choice on the right (theme, language).
class _SegmentRow<T> extends StatelessWidget {
  const _SegmentRow({
    required this.icon,
    required this.iconBg,
    required this.iconTint,
    required this.title,
    required this.subtitle,
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  final IconData icon;
  final Color iconBg;
  final Color iconTint;
  final String title;
  final String subtitle;
  final List<(T value, String label, IconData? icon)> options;
  final T selected;
  final ValueChanged<T> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final selectedBg = c.isDark ? c.brand : c.brandDark;
    Widget seg((T, String, IconData?) o) {
      final on = o.$1 == selected;
      return Semantics(
        button: true,
        selected: on,
        child: Material(
          color: on ? selectedBg : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => onSelect(o.$1),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (o.$3 != null) ...[
                    Icon(o.$3, size: 15, color: on ? Colors.white : c.textMuted),
                    const SizedBox(width: 5),
                  ],
                  Text(
                    o.$2,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                      color: on ? Colors.white : c.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(13)),
            child: Icon(icon, color: iconTint, size: 21),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text),
                ),
                const SizedBox(height: 2),
                Text(subtitle, style: TextStyle(fontSize: 12.5, color: c.textMuted, height: 1.35)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: c.isDark ? const Color(0xFF1E293B) : const Color(0xFFEFF3F8),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [for (final o in options) seg(o)]),
          ),
        ],
      ),
    );
  }
}

/// Vehicle breakdown card — wrench tile, copy, and a compact outlined action on the right.
class _VehicleBreakdownCard extends StatelessWidget {
  const _VehicleBreakdownCard({required this.isOnline, required this.onReport});
  final bool isOnline;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    final dark = context.bc.isDark;
    final bg = dark ? const Color(0xFF2A1417) : const Color(0xFFFEF2F2);
    final border = dark ? const Color(0xFF4A1B22) : const Color(0xFFFEE2E2);
    final iconBg = dark ? const Color(0xFF3E171E) : const Color(0xFFFEE2E2);
    final iconTint = dark ? const Color(0xFFF87171) : const Color(0xFFDC2626);
    final titleCol = dark ? const Color(0xFFFCA5A5) : const Color(0xFF991B1B);
    final descCol = (dark ? const Color(0xFFF87171) : const Color(0xFF7F1D1D)).withValues(alpha: 0.85);
    final btnTint = isOnline ? (dark ? const Color(0xFFFCA5A5) : const Color(0xFFDC2626)) : const Color(0xFF9CA3AF);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(BcRadius.card),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(14)),
                child: Icon(Icons.build_outlined, color: iconTint, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tr('Vehicle broke down?'),
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: titleCol),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      isOnline
                          ? tr('Report it so admin can send another rider and knows where to find you.')
                          : tr('Go on duty to report a vehicle failure.'),
                      style: TextStyle(fontSize: 12.5, color: descCol, height: 1.4),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: isOnline ? onReport : null,
            style: OutlinedButton.styleFrom(
              foregroundColor: btnTint,
              disabledForegroundColor: btnTint,
              backgroundColor: dark ? Colors.transparent : Colors.white.withValues(alpha: 0.6),
              side: BorderSide(color: btnTint.withValues(alpha: isOnline ? 0.8 : 0.5), width: 1.3),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              minimumSize: const Size.fromHeight(44),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BcRadius.button)),
            ),
            icon: const Icon(Icons.error_outline_rounded, size: 18),
            label: Text(tr('Report Failure'), style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

class _SignOutCard extends StatelessWidget {
  const _SignOutCard({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final danger = c.isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626);
    return Material(
      color: c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(BcRadius.card),
        side: BorderSide(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.logout_rounded, color: danger, size: 20),
              const SizedBox(width: 10),
              Text(
                tr('Sign out'),
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: danger),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One labelled value inside a profile-details group.
typedef _InfoItem = ({IconData icon, String label, String? value, Color? color, VoidCallback? onTap});

class _InfoGroup extends StatelessWidget {
  const _InfoGroup({required this.title, required this.items});
  final String title;
  final List<_InfoItem> items;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final shown = items.where((i) => i.value != null && i.value!.trim().isNotEmpty).toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BcSheetLabel(title),
        BcGroupCard(
          children: [
            for (final i in shown)
              InkWell(
                onTap: i.onTap,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(11)),
                        child: Icon(i.icon, color: c.brand, size: 18),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(i.label, style: TextStyle(fontSize: 12, color: c.textMuted)),
                            const SizedBox(height: 2),
                            Text(
                              i.value!,
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: i.color ?? c.text),
                            ),
                          ],
                        ),
                      ),
                      if (i.onTap != null) Icon(Icons.chevron_right, color: c.textMuted, size: 20),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _ProfileDetailsSheet extends StatelessWidget {
  const _ProfileDetailsSheet({
    required this.driverName,
    required this.initial,
    required this.isOnline,
    required this.profile,
    required this.meritStatus,
    required this.branches,
    required this.branchRequests,
    required this.onRetryLicense,
  });

  /// Re-fetches the profile so the licence gets a new signed link.
  final Future<void> Function() onRetryLicense;

  final String driverName;
  final String initial;
  final bool isOnline;
  final DriverProfile? profile;
  final String? meritStatus;
  final List<StoreRef> branches;
  final List<DriverBranchRequest> branchRequests;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final stats = context.watch<StatsController>();
    final p = profile;
    final ratingsAverage = stats.ratingsAverage ?? p?.avgRating;
    final ratingsCount = stats.ratingsCount > 0 ? stats.ratingsCount : p?.ratingCount;
    final vehicleLine = [_nonBlank(p?.vehicleType), _nonBlank(p?.vehicleColor)].whereType<String>().join(' · ');
    final license = _nonBlank(p?.licenseImageUrl?.trim());
    final streak = p?.consecutiveSuccessfulDeliveries ?? 0;

    return BcSheetBody(
      header: BcSheetHeader(
        leading: _RingAvatar(photoUrl: p?.profilePhotoUrl, initial: initial, online: isOnline, size: 52),
        title: driverName,
        subtitle: tr('Your driver profile'),
      ),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _Pill(
              icon: Icons.workspace_premium_outlined,
              text: _meritLabel(p?.meritPoints, meritStatus),
              color: c.brand,
            ),
            if (ratingsAverage != null)
              _Pill(icon: Icons.star_rounded, text: _ratingLine(ratingsAverage, ratingsCount), color: c.warning),
            if (streak > 0)
              _Pill(
                icon: Icons.local_fire_department_outlined,
                text: tr('{streak} delivery streak', {'streak': streak}),
                color: c.success,
              ),
          ],
        ),
        _InfoGroup(
          title: tr('Personal details'),
          items: [
            (
              icon: Icons.phone_outlined,
              label: tr('Phone'),
              value: p?.phone,
              color: c.brand,
              onTap: p?.phone == null ? null : () => Intents.dial(p!.phone!),
            ),
            (icon: Icons.badge_outlined, label: 'NIC', value: p?.nicNumber, color: null, onTap: null),
            (icon: Icons.home_outlined, label: tr('Address'), value: p?.address, color: null, onTap: null),
            (
              icon: Icons.accessibility_new_rounded,
              label: tr('Accessibility notes'),
              value: p?.disabilities,
              color: null,
              onTap: null,
            ),
          ],
        ),
        _InfoGroup(
          title: tr('Vehicle'),
          items: [
            (icon: Icons.pin_outlined, label: tr('Vehicle number'), value: p?.vehicleNumber, color: null, onTap: null),
            (icon: Icons.two_wheeler_outlined, label: tr('Vehicle'), value: vehicleLine, color: null, onTap: null),
            (
              icon: Icons.credit_card_outlined,
              label: tr('License number'),
              value: p?.licenseNumber,
              color: null,
              onTap: null,
            ),
          ],
        ),
        if (branches.isNotEmpty)
          _InfoGroup(
            title: tr('Branches'),
            items: [
              for (final b in branches)
                (
                  icon: Icons.storefront_outlined,
                  label: tr('Branch'),
                  value: [Format.shortBranchName(b.name), _nonBlank(b.city)].whereType<String>().join(' · '),
                  color: null,
                  onTap: null,
                ),
            ],
          ),
        BcSheetLabel(tr('License document')),
        if (license == null && p?.hasLicenseImage != true)
          BcSheetCard(
            child: Row(
              children: [
                Icon(Icons.image_not_supported_outlined, color: c.textMuted, size: 20),
                const SizedBox(width: 10),
                Text(tr('Not uploaded yet'), style: TextStyle(fontSize: 13, color: c.textMuted)),
              ],
            ),
          )
        else if (license == null)
          AspectRatio(
            aspectRatio: 16 / 10,
            child: _LicenseLoadError(onRetry: onRetryLicense),
          )
        else ...[
          GestureDetector(
            onTap: () => _showLicenseFullscreen(context, license),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(BcRadius.card),
              child: AspectRatio(
                aspectRatio: 16 / 10,
                child: CachedNetworkImage(
                  imageUrl: license,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => Container(
                    color: c.surfaceElevated,
                    alignment: Alignment.center,
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: c.brand),
                    ),
                  ),
                  // Usually an expired signed link — fetch a new one instead of a blank box.
                  errorWidget: (_, _, _) => _LicenseLoadError(onRetry: onRetryLicense),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(tr('Tap to view full size'), style: TextStyle(fontSize: 12, color: c.textMuted)),
        ],
        const SizedBox(height: 16),
        RiderReviewsSection(ratings: stats.ratings.take(8).toList(), loading: stats.ratingsLoading),
        if (branchRequests.isNotEmpty) ...[
          BcSheetLabel(tr('Branch requests')),
          for (final r in branchRequests) _BranchRequestRow(r),
        ],
      ],
    );
  }

  void _showLicenseFullscreen(BuildContext context, String url) {
    showBcDialog<void>(
      context,
      builder: (ctx) => BcDialog(
        icon: Icons.badge_outlined,
        title: tr('License document'),
        showClose: true,
        content: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: AspectRatio(
            aspectRatio: 3 / 4,
            child: InteractiveViewer(
              child: CachedNetworkImage(imageUrl: url, fit: BoxFit.contain),
            ),
          ),
        ),
        secondaryLabel: tr('Close'),
        onSecondary: () => Navigator.of(ctx).pop(),
      ),
    );
  }
}

/// Shown in place of the licence image when it fails to load.
class _LicenseLoadError extends StatefulWidget {
  const _LicenseLoadError({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  State<_LicenseLoadError> createState() => _LicenseLoadErrorState();
}

class _LicenseLoadErrorState extends State<_LicenseLoadError> {
  bool _retrying = false;

  Future<void> _retry() async {
    if (_retrying) return;
    setState(() => _retrying = true);
    await widget.onRetry();
    if (mounted) setState(() => _retrying = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      color: c.surfaceElevated,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.broken_image_outlined, color: c.textMuted, size: 28),
          const SizedBox(height: 6),
          Text(
            tr("Couldn't load the license"),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: c.textMuted),
          ),
          TextButton(onPressed: _retrying ? null : _retry, child: Text(_retrying ? tr('Loading…') : tr('Retry'))),
        ],
      ),
    );
  }
}

class _BranchRequestRow extends StatelessWidget {
  const _BranchRequestRow(this.req);
  final DriverBranchRequest req;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final s = req.status.toUpperCase();
    final (label, color) = switch (s) {
      'APPROVED' => (tr('Approved'), c.success),
      'REJECTED' => (tr('Rejected'), c.danger),
      'PENDING' => (tr('Pending'), c.brand),
      _ => (s.isEmpty ? s : s[0] + s.substring(1).toLowerCase(), c.brand),
    };
    final note = req.reviewNote?.trim();
    final rejectionReason = s == 'REJECTED' && note != null && note.isNotEmpty ? note : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: BcSheetCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(11)),
              child: Icon(Icons.swap_horiz_rounded, color: color, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${req.type} · ${req.toStoreName ?? req.toStoreId}',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.text),
                  ),
                  const SizedBox(height: 2),
                  Text(Format.jobDateTime(req.createdAt), style: TextStyle(fontSize: 11.5, color: c.textMuted)),
                  // The admin's note is optional — only shown when they left one on a rejection.
                  if (rejectionReason != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      tr('Reason: {reason}', {'reason': rejectionReason}),
                      style: TextStyle(fontSize: 12.5, height: 1.35, color: c.danger),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
              child: Text(
                label,
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
