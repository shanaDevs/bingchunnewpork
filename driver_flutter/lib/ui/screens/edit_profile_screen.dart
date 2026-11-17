import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../core/local_profile.dart';
import '../../l10n/l10n.dart';
import '../../state/auth_controller.dart';
import '../../state/jobs_controller.dart';
import '../../state/stats_controller.dart';
import '../components/bc_dialog.dart';
import '../components/driver_ops.dart';
import '../components/inputs.dart';
import '../components/profile_kit.dart';
import '../components/profile_photo.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';

/// Edit profile (QuickDrop profile/edit.tsx). The display name is stored on this device
/// only; the photo is uploaded to the rider account. Everything else (identity,
/// vehicle, licence, ratings) is read-only here.
class EditProfileScreen extends StatelessWidget {
  const EditProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => StatsController(ctx.read<AppContainer>())..loadRatings(),
      child: const _EditBody(),
    );
  }
}

class _EditBody extends StatefulWidget {
  const _EditBody();

  @override
  State<_EditBody> createState() => _EditBodyState();
}

class _EditBodyState extends State<_EditBody> {
  static const _nameMax = 50;
  late final TextEditingController _name;
  bool _touched = false;
  String _initial = '';

  @override
  void initState() {
    super.initState();
    final vm = context.read<JobsController>();
    final auth = context.read<AuthController>();
    _initial = riderDisplayName(LocalProfile.instance.displayName, vm.profile, auth);
    _name = TextEditingController(text: _initial);
    vm.refreshProfile();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  String _normalize(String v) => v.trim().replaceAll(RegExp(r'\s+'), ' ');

  String? _problem(String v) {
    final n = _normalize(v);
    if (n.isEmpty) return tr('Enter your name.');
    if (n.length < 2 || n.length > _nameMax) return tr('Use between 2 and 50 characters.');
    if (!RegExp(r"^[\p{L}\p{M} .'\-]+$", unicode: true).hasMatch(n)) {
      return tr('Use letters, spaces, apostrophes, dots or hyphens only.');
    }
    return null;
  }

  Future<void> _save(String serverName) async {
    final problem = _problem(_name.text);
    setState(() => _touched = true);
    if (problem != null) return;
    final ok = await showBcConfirm(
      context,
      icon: Icons.save_outlined,
      title: tr('Save changes?'),
      message: tr('This name is saved on this phone only and is not sent to the server.'),
      confirmLabel: tr('Save changes'),
    );
    if (!ok || !mounted) return;
    final n = _normalize(_name.text);
    await LocalProfile.instance.setDisplayName(n == serverName ? null : n);
    BcFeedback.success();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Profile updated.'))));
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    final auth = context.watch<AuthController>();
    final stats = context.watch<StatsController>();
    final p = vm.profile;
    final serverName = nonBlank(p?.name) ?? nonBlank(auth.driver?.name) ?? tr('Driver');
    final problem = _problem(_name.text);
    final changed = _normalize(_name.text) != _initial;
    final vehicleLine = [nonBlank(p?.vehicleType), nonBlank(p?.vehicleColor)].whereType<String>().join(' · ');
    final license = nonBlank(p?.licenseImageUrl?.trim());
    final ratingsAverage = stats.ratingsAverage ?? p?.avgRating;
    final streak = p?.consecutiveSuccessfulDeliveries ?? 0;

    Widget field(String label, String? value, {VoidCallback? onTap}) {
      if (nonBlank(value) == null) return const SizedBox.shrink();
      return InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
              const SizedBox(width: 16),
              Flexible(
                child: Text(
                  value!,
                  textAlign: TextAlign.end,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: onTap == null ? c.foreground : c.primaryStrong),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final riderId = nonBlank(p?.id ?? auth.driver?.id);
    return QdPage(
      title: tr('Edit profile'),
      footer: QdPillButton(
        label: tr('Save changes'),
        icon: Icons.save_outlined,
        onPressed: changed ? () => _save(serverName) : null,
      ),
      children: [
        Center(
          child: Column(
            children: [
              EditableAvatar(name: _normalize(_name.text).isEmpty ? serverName : _normalize(_name.text), photoUrl: p?.profilePhotoUrl, size: 96),
              const SizedBox(height: 12),
              Text(tr('Tap the photo to change it'), style: TextStyle(fontSize: 13, color: c.mutedForeground)),
            ],
          ),
        ),
        const SizedBox(height: 20),
        BcTextField(
          controller: _name,
          label: tr('Full name'),
          placeholder: tr('Your full name'),
          isError: _touched && problem != null,
          supportingText: _touched ? problem : null,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 6),
        QdFootnote(tr('Your name is saved on this phone only. Your photo is saved to your rider account.')),
        const SizedBox(height: 12),
        QdCard(
          muted: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (riderId != null) field(tr('Rider ID'), riderId.length > 10 ? riderId.substring(0, 8).toUpperCase() : riderId.toUpperCase()),
              field(tr('Mobile number'), p?.phone == null ? null : Format.lkMobileDisplay(p!.phone!), onTap: p?.phone == null ? null : () => Intents.dial(p!.phone!)),
              field('NIC', p?.nicNumber),
              field(tr('Address'), p?.address),
              field(tr('Accessibility notes'), p?.disabilities),
              field(tr('Vehicle number'), p?.vehicleNumber),
              field(tr('Vehicle'), vehicleLine),
              field(tr('License number'), p?.licenseNumber),
              if (ratingsAverage != null) field(tr('Rating'), ratingsAverage.toStringAsFixed(1)),
              if (streak > 0) field(tr('Delivery streak'), '$streak'),
              const SizedBox(height: 6),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lock_outline_rounded, size: 16, color: c.mutedForeground),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      tr('Managed by Bring It. Contact support to change these details.'),
                      style: TextStyle(fontSize: 13, color: c.mutedForeground, height: 1.4),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        QdSectionTitle(tr('License document')),
        if (license == null)
          QdCard(
            child: Row(
              children: [
                Icon(Icons.image_not_supported_outlined, color: c.mutedForeground, size: 20),
                const SizedBox(width: 10),
                Text(tr('Not uploaded yet'), style: TextStyle(fontSize: 13, color: c.mutedForeground)),
              ],
            ),
          )
        else ...[
          GestureDetector(
            onTap: () => _showLicense(license),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(BcRadius.lg),
              child: AspectRatio(
                aspectRatio: 16 / 10,
                child: CachedNetworkImage(
                  imageUrl: license,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => Container(
                    color: c.elevated,
                    alignment: Alignment.center,
                    child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: c.primary)),
                  ),
                  errorWidget: (_, _, _) => _LicenseError(onRetry: vm.refreshProfile),
                ),
              ),
            ),
          ),
          QdFootnote(tr('Tap to view full size')),
        ],
        const SizedBox(height: 20),
        RiderReviewsSection(ratings: stats.ratings.take(8).toList(), loading: stats.ratingsLoading),
      ],
    );
  }

  void _showLicense(String url) {
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
            child: InteractiveViewer(child: CachedNetworkImage(imageUrl: url, fit: BoxFit.contain)),
          ),
        ),
        secondaryLabel: tr('Close'),
        onSecondary: () => Navigator.of(ctx).pop(),
      ),
    );
  }
}

/// Shown in place of the licence image when it fails to load (usually an expired signed link).
class _LicenseError extends StatefulWidget {
  const _LicenseError({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  State<_LicenseError> createState() => _LicenseErrorState();
}

class _LicenseErrorState extends State<_LicenseError> {
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
      color: c.elevated,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.broken_image_outlined, color: c.mutedForeground, size: 28),
          const SizedBox(height: 6),
          Text(tr("Couldn't load the license"), textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: c.mutedForeground)),
          TextButton(onPressed: _retrying ? null : _retry, child: Text(_retrying ? tr('Loading…') : tr('Retry'))),
        ],
      ),
    );
  }
}
