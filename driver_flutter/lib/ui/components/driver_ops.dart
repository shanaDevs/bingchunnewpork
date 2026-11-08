import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../data/models/driver.dart';
import '../theme/bc_theme.dart';
import 'bc_dialog.dart';
import 'run_kit.dart';
import 'qd_kit.dart';
import '../../l10n/l10n.dart';

/// Status-aware action content for an active run: contextual copy, "Navigate to branch",
/// "Reject job", and the primary action button. Purely presentational.
class RunActionBar extends StatelessWidget {
  const RunActionBar({
    super.key,
    required this.job,
    required this.distanceToBranchM,
    required this.withinBranch,
    required this.primaryLabel,
    required this.acting,
    required this.error,
    required this.onNavigateBranch,
    required this.onPrimary,
    required this.onReject,
  });

  final DeliveryJobDetail job;
  final double? distanceToBranchM;
  final bool withinBranch;
  final String? primaryLabel;
  final bool acting;
  final String? error;
  final VoidCallback onNavigateBranch;
  final VoidCallback onPrimary;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final red = c.error;
    Widget navBranch() =>
        RunOutlineButton(label: tr('Navigate to branch'), icon: Icons.navigation_rounded, onPressed: onNavigateBranch);
    final parts = <Widget>[];
    if (error != null) parts.add(RunNote(icon: Icons.error_outline_rounded, text: error!, color: c.danger));
    if (job.needsPickup) {
      parts.add(
        RunCardHeader(
          icon: Icons.storefront_rounded,
          title: job.hasPickupOverride ? tr('Confirm pickup') : tr('Confirm pickup at the outlet'),
          subtitle: job.hasPickupOverride
              ? Format.pickupOverrideHint(distanceToBranchM, job.pickupPlaceName)
              : Format.pickupUnlockHint(distanceToBranchM, job.store.completionRadiusM, withinBranch),
        ),
      );
      if (!withinBranch) parts.add(navBranch());
    } else if (job.canStart) {
      parts.add(
        RunCardHeader(
          icon: Icons.inventory_2_rounded,
          title: tr('Ready to start delivery?'),
          subtitle: tr('Pickup is done. Start delivery to navigate to the first customer.'),
        ),
      );
    } else if (job.isReturning) {
      parts.add(
        RunCardHeader(
          icon: Icons.flag_rounded,
          tint: c.warning,
          bg: c.warningSubtle,
          title: tr('Return to branch to complete'),
          subtitle: withinBranch
              ? tr('You are within {completionRadiusM}m — Complete Ride is available.', {
                  'completionRadiusM': job.store.completionRadiusM,
                })
              : tr('Navigate back to {storeName} ({distHint}). Complete Ride unlocks within {radiusM}m.', {
                  'storeName': Format.shortBranchName(job.store.name),
                  'distHint': distanceToBranchM == null
                      ? tr('Getting GPS…')
                      : tr('{distanceM}m away', {'distanceM': distanceToBranchM!.toInt()}),
                  'radiusM': job.store.completionRadiusM,
                }),
        ),
      );
      parts.add(navBranch());
    }
    if (primaryLabel != null) {
      final gated = job.needsPickup || job.isReturning;
      parts.add(
        RunPrimaryButton(
          label: primaryLabel!,
          icon: job.needsPickup
              ? Icons.check_circle_rounded
              : job.canStart
              ? Icons.play_arrow_rounded
              : Icons.flag_circle_rounded,
          loading: acting,
          enabled: gated ? withinBranch : true,
          locked: gated && !withinBranch && !(job.needsPickup && job.hasPickupOverride),
          onPressed: onPrimary,
        ),
      );
    }
    if (job.canReject) {
      parts.add(
        RunOutlineButton(
          label: tr('Reject job'),
          icon: Icons.do_not_disturb_on_outlined,
          color: red,
          enabled: !acting,
          onPressed: onReject,
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < parts.length; i++) ...[if (i > 0) const SizedBox(height: 10), parts[i]],
      ],
    );
  }
}

/// Brief success check-mark dialog that closes itself.
Future<void> showBcSuccess(BuildContext context, {required String title, String? subtitle}) async {
  final nav = Navigator.of(context, rootNavigator: true);
  var open = true;
  Future<void>.delayed(BcMotion.success + const Duration(milliseconds: 300), () {
    if (open && nav.canPop()) nav.pop();
  });
  await showBcDialog<void>(
    context,
    barrierDismissible: false,
    builder: (ctx) =>
        BcDialog(icon: Icons.check_rounded, tone: BcDialogTone.success, title: title, message: subtitle, maxWidth: 300),
  );
  open = false;
}

class DriverAvatar extends StatelessWidget {
  const DriverAvatar({super.key, this.profilePhotoUrl, required this.initials, this.size = 52, this.textSize = 22});

  final String? profilePhotoUrl;
  final String initials;
  final double size;
  final double textSize;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final t = initials.trim();
    final initial = t.isEmpty ? 'D' : t.substring(0, 1).toUpperCase();
    final url = profilePhotoUrl?.trim();
    final fallback = Center(
      child: Text(
        initial,
        style: TextStyle(fontSize: textSize, fontWeight: FontWeight.w700, color: c.brand),
      ),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: c.brandSubtle),
      clipBehavior: Clip.antiAlias,
      child: (url == null || url.isEmpty)
          ? fallback
          : CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              placeholder: (_, _) => fallback,
              errorWidget: (_, _, _) => fallback,
            ),
    );
  }
}

/// Customer reviews card. Shows the newest [collapsedCount] reviews; the rest
/// open with "Show all" so a long list doesn't push everything else off screen.
class RiderReviewsSection extends StatefulWidget {
  const RiderReviewsSection({
    super.key,
    required this.ratings,
    required this.loading,
    this.emptyLabel,
    this.collapsedCount = 2,
  });

  final List<RiderRatingItem> ratings;
  final bool loading;
  final String? emptyLabel;
  final int collapsedCount;

  @override
  State<RiderReviewsSection> createState() => _RiderReviewsSectionState();
}

class _RiderReviewsSectionState extends State<RiderReviewsSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final ratings = widget.ratings;
    final collapsible = ratings.length > widget.collapsedCount;
    final shown = collapsible && !_expanded ? ratings.take(widget.collapsedCount).toList() : ratings;
    return QdCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(tr('Customer reviews'), style: BcType.section.copyWith(color: c.foreground)),
              ),
              if (ratings.isNotEmpty) QdBadge('${ratings.length}', tone: QdTone.primary),
            ],
          ),
          const SizedBox(height: 10),
          if (widget.loading && ratings.isEmpty)
            Text(tr('Loading reviews…'), style: BcType.caption.copyWith(color: c.mutedForeground))
          else if (ratings.isEmpty)
            Text(widget.emptyLabel ?? tr('No reviews yet'), style: BcType.caption.copyWith(color: c.mutedForeground))
          else ...[
            AnimatedSize(
              duration: BcMotion.fast,
              curve: Curves.easeOut,
              alignment: Alignment.topCenter,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < shown.length; i++) ...[
                    if (i > 0) const SizedBox(height: 10),
                    _ReviewRow(shown[i]),
                  ],
                ],
              ),
            ),
            if (collapsible)
              Align(
                alignment: Alignment.center,
                child: TextButton.icon(
                  onPressed: () => setState(() => _expanded = !_expanded),
                  icon: Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 20),
                  label: Text(_expanded ? tr('Show less') : tr('Show all {n} reviews', {'n': ratings.length})),
                  style: TextButton.styleFrom(foregroundColor: c.primaryStrong),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow(this.review);
  final RiderRatingItem review;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final stars = review.stars.clamp(0, 5);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Semantics(
              label: tr('{stars} out of 5 stars', {'stars': stars}),
              excludeSemantics: true,
              child: Row(
                children: [
                  // Earned stars filled, the rest outlined, so the count reads at a glance.
                  for (var i = 0; i < 5; i++)
                    Padding(
                      padding: const EdgeInsets.only(right: 2),
                      child: Icon(
                        i < stars ? Icons.star_rounded : Icons.star_outline_rounded,
                        size: 18,
                        color: i < stars ? c.accent : c.iconMuted.withValues(alpha: 0.45),
                      ),
                    ),
                  const SizedBox(width: 4),
                  Text(
                    '$stars/5',
                    style: BcType.caption.copyWith(color: c.foreground, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
            Text(Format.dateTime(review.createdAt), style: BcType.tiny.copyWith(color: c.mutedForeground)),
          ],
        ),
        if (review.comment != null && review.comment!.trim().isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(review.comment!, style: BcType.body.copyWith(color: c.foreground)),
        ],
        if (review.orderNumber != null && review.orderNumber!.trim().isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(
            tr('Order #{orderNumber}', {'orderNumber': review.orderNumber}),
            style: BcType.tiny.copyWith(color: c.mutedForeground),
          ),
        ],
      ],
    );
  }
}
