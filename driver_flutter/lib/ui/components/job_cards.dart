import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../data/models/driver.dart';
import '../../l10n/l10n.dart';
import '../theme/bc_theme.dart';
import 'qd_brand.dart';
import 'qd_kit.dart';
import 'surfaces.dart';

/// Home (Jobs tab) building blocks — QuickDrop `HomeHero`, `ActiveJobOverview`,
/// `AssignedBranches`, `LastShiftCard`, `WaitingForJobs`.

String _greeting() {
  final h = DateTime.now().hour;
  final raw = h < 12 ? tr('Good morning,') : (h < 17 ? tr('Good afternoon,') : tr('Good evening,'));
  final s = raw.replaceAll(RegExp(r'[,，\s]+$'), '');
  if (L10n.isZh) return s;
  return s
      .split(' ')
      .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1).toLowerCase())
      .join(' ');
}

/// Tall brand hero: wordmark + bell, greeting and rider name beside the mascot, then the
/// full-width duty slide switch.
class HomeHeader extends StatelessWidget {
  const HomeHeader({
    super.key,
    required this.driverName,
    required this.isOnline,
    required this.onToggleDuty,
    required this.onSettingsTap,
    this.dutyLoading = false,
  });

  final String driverName;
  final bool isOnline;
  final bool dutyLoading;
  final ValueChanged<bool> onToggleDuty;
  final VoidCallback onSettingsTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final name = driverName.trim().isEmpty ? tr('Driver') : driverName.trim();
    return QdBrandHeader(
      tall: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const QdWordmark(inverse: true, size: QdWordmarkSize.sm),
              const Spacer(),
              Semantics(
                button: true,
                label: tr('Settings'),
                child: GestureDetector(
                  onTap: onSettingsTap,
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.2),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.28)),
                    ),
                    child: const Icon(Icons.settings_outlined, color: Colors.white, size: 21),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              const QdBellButton(),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _greeting(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: BcType.subtitle.copyWith(color: c.heroSubtitle, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        name,
                        maxLines: 1,
                        style: BcType.displayHero.copyWith(color: c.heroTitle),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              IgnorePointer(
                child: Image.asset(
                  'assets/images/rider_mascot.png',
                  height: 118,
                  fit: BoxFit.contain,
                  semanticLabel: tr('QuickDrop rider'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          QdSlideToggle(
            online: isOnline,
            busy: dutyLoading,
            onGoOnline: () => onToggleDuty(true),
            onGoOffline: () => onToggleDuty(false),
          ),
        ],
      ),
    );
  }
}

/// Section title with an optional count badge and trailing caption.
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, required this.count, required this.trailing, this.info = false});

  final String title;
  final int count;
  final String trailing;
  final bool info;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 16, 2, 8),
      child: Row(
        children: [
          Text(title, style: BcType.section.copyWith(color: c.foreground)),
          if (count > 0) ...[
            const SizedBox(width: 8),
            QdBadge('$count', tone: info ? QdTone.neutral : QdTone.primary),
          ],
          const Spacer(),
          Text(trailing, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.mutedForeground)),
        ],
      ),
    );
  }
}

enum PillKind { primary, outline, danger, soft, call, accent, error }

/// Full-radius action button: filled with c.action (primary), outlined, danger outline or soft.
class PillButton extends StatelessWidget {
  const PillButton({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
    this.trailingIcon,
    this.kind = PillKind.primary,
    this.loading = false,
    this.height = 52,
  });

  final String label;
  final VoidCallback? onTap;
  final IconData? icon;
  final IconData? trailingIcon;
  final PillKind kind;
  final bool loading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final enabled = onTap != null && !loading;
    final (bg, fg, border) = switch (kind) {
      PillKind.primary => (c.action, c.actionForeground, null),
      PillKind.soft => (c.primarySoft, c.primaryStrong, null),
      PillKind.outline => (Colors.transparent, c.foreground, c.border),
      PillKind.danger => (Colors.transparent, c.errorStrong, c.error.withValues(alpha: 0.5)),
      PillKind.call => (c.call, c.callForeground, null),
      PillKind.accent => (c.accent, c.accentForeground, null),
      PillKind.error => (c.error, c.errorForeground, null),
    };
    final radius = BorderRadius.circular(BcRadius.full);
    return Opacity(
      opacity: onTap == null ? 0.5 : 1,
      child: Material(
        color: bg,
        shape: RoundedRectangleBorder(borderRadius: radius, side: border == null ? BorderSide.none : BorderSide(color: border, width: 1.4)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled
              ? () {
                  BcFeedback.tap();
                  onTap!();
                }
              : null,
          child: SizedBox(
            height: height,
            child: Center(
              child: loading
                  ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (icon != null) ...[Icon(icon, size: 20, color: fg), const SizedBox(width: 8)],
                        Flexible(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: fg),
                          ),
                        ),
                        if (trailingIcon != null) ...[const SizedBox(width: 6), Icon(trailingIcon, size: 20, color: fg)],
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MetaItem extends StatelessWidget {
  const _MetaItem({required this.icon, required this.label, this.highlight = false});
  final IconData icon;
  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final fg = highlight ? c.highlightForeground : c.mutedForeground;
    return Container(
      padding: highlight ? const EdgeInsets.symmetric(horizontal: 10, vertical: 4) : EdgeInsets.zero,
      decoration: highlight ? BoxDecoration(color: c.highlight, borderRadius: BorderRadius.circular(BcRadius.full)) : null,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: fg),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, fontWeight: highlight ? FontWeight.w700 : FontWeight.w500, color: fg),
            ),
          ),
        ],
      ),
    );
  }
}

/// Segmented stop progress bar.
class SegmentedProgress extends StatelessWidget {
  const SegmentedProgress({super.key, required this.completed, required this.total, this.done = false, this.onBrand = false});
  final int completed;
  final int total;
  final bool done;

  /// White-on-blue variant for use over the brand gradient.
  final bool onBrand;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final n = total < 1 ? 1 : total;
    return Row(
      children: [
        for (var i = 0; i < n; i++) ...[
          if (i > 0) const SizedBox(width: 4),
          Expanded(
            child: AnimatedContainer(
              duration: BcMotion.standard,
              height: 6,
              decoration: BoxDecoration(
                color: onBrand
                    ? Colors.white.withValues(alpha: i < completed ? 0.95 : 0.28)
                    : i < completed
                    ? (done ? c.success : c.primary)
                    : c.muted,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class ActiveJobCard extends StatelessWidget {
  const ActiveJobCard({
    super.key,
    required this.job,
    required this.detail,
    required this.onOpen,
    this.onViewDetails,
    this.onReportIssue,
  });

  final JobSummary job;
  final DeliveryJobDetail? detail;

  /// Opens the live run (dashboard) — "Continue" and the next-stop panel.
  final VoidCallback onOpen;

  /// Opens the Job Details page — "Details", "View all" and the order rows.
  /// Falls back to [onOpen] when not set.
  final VoidCallback? onViewDetails;

  /// Shows the "Report an issue" button when set.
  final VoidCallback? onReportIssue;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final orders = detail?.orders ?? const <JobOrder>[];
    final activeOrder = orders.where((o) => o.isPending).firstOrNull ?? orders.firstOrNull;
    final preview = job.previewStops.firstOrNull;

    final storeTitle = job.storeName.trim().isEmpty ? tr('Branch') : job.storeName;
    final storeAddress = (detail?.store.addressLine.trim().isNotEmpty ?? false)
        ? detail!.store.addressLine
        : (job.storeCity.trim().isEmpty ? tr('Pickup location') : job.storeCity);
    String firstNonBlank(List<String?> xs, String fallback) =>
        xs.firstWhere((s) => s != null && s.trim().isNotEmpty, orElse: () => fallback)!;
    final customerName = firstNonBlank([activeOrder?.customerName, preview?.customerName], tr('Customer'));
    final customerAddress = firstNonBlank([activeOrder?.shortAddress, preview?.shortAddress], tr('Delivery address'));


    final pickedUp = detail?.pickedUp ?? job.status == 'IN_PROGRESS';
    final orderTotal = orders.isEmpty ? job.orderCount : orders.length;
    final deliveredCount = detail?.deliveredCount ?? 0;
    final totalStops = orderTotal + 1;
    final completedStops = (pickedUp ? 1 : 0) + deliveredCount;
    final allDone = detail != null && orders.isNotEmpty && orders.every((o) => !o.isPending);
    final stepLabel = !pickedUp ? tr('Pickup') : (allDone ? tr('Complete') : tr('Delivery'));
    final beforePickup = !pickedUp;
    final earn = detail?.totalDeliveryFees ?? job.totalDeliveryFees;

    final viewDetails = onViewDetails ?? onOpen;
    final shown = orders.take(3).toList();
    final rideLabel = Format.rideIdLabel(job.rideCode, job.id).replaceFirst('·', '•');

    return QdCard(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(BcRadius.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 1. Job summary + progress; tap opens the full job.
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                BcFeedback.tap();
                viewDetails();
              },
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                tr('Active job').toUpperCase(),
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1, color: c.primary),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                rideLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: BcType.subtitle.copyWith(color: c.foreground),
                              ),
                            ],
                          ),
                        ),
                        if (earn > 0) ...[
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                tr('You earn').toUpperCase(),
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 1, color: c.mutedForeground),
                              ),
                              const SizedBox(height: 4),
                              Text(Format.money(earn), style: BcType.subtitle.copyWith(color: c.successStrong)),
                            ],
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Flexible(child: _MetaItem(icon: Icons.storefront_outlined, label: storeTitle, highlight: true)),
                        const SizedBox(width: 14),
                        _MetaItem(
                          icon: Icons.inventory_2_outlined,
                          label: trn(orderTotal, '{n} order', '{n} orders'),
                        ),
                        const Spacer(),
                        Text(tr('Details'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.primary)),
                        Icon(Icons.chevron_right_rounded, size: 18, color: c.primary),
                      ],
                    ),
                    const SizedBox(height: 16),
                    SegmentedProgress(completed: completedStops, total: totalStops, done: allDone),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            tr('{done} of {total} stops', {'done': completedStops, 'total': totalStops}),
                            style: TextStyle(fontSize: 13, color: c.mutedForeground),
                          ),
                        ),
                        Text(
                          stepLabel,
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: allDone ? c.successStrong : c.primary),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            // 2. Next stop highlight.
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: allDone
                  ? Container(
                      padding: const EdgeInsets.all(11),
                      decoration: BoxDecoration(color: c.successSoft, borderRadius: BorderRadius.circular(BcRadius.md)),
                      child: Row(
                        children: [
                          Icon(Icons.check_rounded, size: 24, color: c.successStrong),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              tr('All stops done. Complete the job.'),
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.foreground),
                            ),
                          ),
                        ],
                      ),
                    )
                  : NextStopPanel(
                      icon: beforePickup ? Icons.storefront_outlined : Icons.place_outlined,
                      eyebrow: beforePickup ? tr('Next stop') : tr('Next delivery'),
                      title: beforePickup ? storeTitle : customerName,
                      subtitle: beforePickup ? storeAddress : customerAddress,
                      onTap: () {
                        BcFeedback.tap();
                        onOpen();
                      },
                    ),
            ),
            // 3. Orders preview.
            if (shown.isNotEmpty) ...[
              Divider(height: 1, thickness: 1, color: c.border),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 8, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        tr('Orders ({n})', {'n': orders.length}),
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        BcFeedback.tap();
                        viewDetails();
                      },
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(tr('View all'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.primary)),
                          Icon(Icons.chevron_right_rounded, size: 18, color: c.primary),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              for (var i = 0; i < shown.length; i++) ...[
                if (i > 0) Divider(height: 1, thickness: 1, indent: 20, endIndent: 20, color: c.border),
                _OrderRow(order: shown[i], onTap: viewDetails),
              ],
              const SizedBox(height: 4),
            ],
            // 4. Actions.
            Divider(height: 1, thickness: 1, color: c.border),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  PillButton(
                    label: beforePickup ? tr('Navigate to pickup') : tr('Navigate'),
                    icon: Icons.navigation_outlined,
                    // Opens the in-app active run (map + route); its directions icon hands off to Google Maps.
                    onTap: onOpen,
                  ),
                  if (onReportIssue != null) ...[
                    const SizedBox(height: 12),
                    PillButton(
                      label: tr('Report an issue'),
                      icon: Icons.warning_amber_rounded,
                      kind: PillKind.danger,
                      onTap: onReportIssue,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class NextStopPanel extends StatelessWidget {
  const NextStopPanel({super.key, required this.icon, required this.eyebrow, required this.title, required this.subtitle, required this.onTap});
  final IconData icon;
  final String eyebrow;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final ink = c.highlightForeground;
    return Material(
      color: c.highlight,
      borderRadius: BorderRadius.circular(BcRadius.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(11),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(shape: BoxShape.circle, color: c.inverse),
                child: Icon(icon, size: 22, color: c.inverseForeground),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      eyebrow.toUpperCase(),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1, color: ink.withValues(alpha: 0.7)),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: ink),
                    ),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: ink.withValues(alpha: 0.75)),
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

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.order, required this.onTap});
  final JobOrder order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final unpaid = order.isFailed || order.status == 'CANCELLED';
    final notable = order.isDelivered || unpaid;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(shape: BoxShape.circle, color: c.primarySoft),
              child: Text('${order.sequence}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: c.primaryStrong)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: order.customerName.trim().isEmpty ? tr('Customer') : order.customerName,
                      style: TextStyle(fontWeight: FontWeight.w700, color: c.foreground),
                    ),
                    TextSpan(text: ' · ${order.city}', style: TextStyle(color: c.mutedForeground)),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14),
              ),
            ),
            if (notable) ...[
              const SizedBox(width: 8),
              StatusChip(order.isFailed ? 'DELIVERY_FAILED' : order.status),
            ],
            const SizedBox(width: 8),
            Text(
              Format.money(order.deliveryFee),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: unpaid ? c.mutedForeground : c.foreground,
                decoration: unpaid ? TextDecoration.lineThrough : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Branches this rider takes jobs from.
class AssignedBranchesCard extends StatelessWidget {
  const AssignedBranchesCard({super.key, required this.branches, this.homeStoreId, this.onTap});

  final List<StoreRef> branches;
  final String? homeStoreId;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        QdSectionTitle(tr('Assigned branches'), topGap: 4),
        QdCard(
          padding: EdgeInsets.zero,
          child: branches.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(tr('No branches assigned yet.'), style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                )
              : Column(
                  children: [
                    for (var i = 0; i < branches.length; i++) ...[
                      if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                      InkWell(
                        onTap: onTap,
                        borderRadius: BorderRadius.circular(BcRadius.lg),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(BcRadius.md)),
                                child: Icon(Icons.storefront_outlined, size: 20, color: c.primaryStrong),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      Format.shortBranchName(branches[i].name),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.foreground),
                                    ),
                                    if ((branches[i].city ?? '').trim().isNotEmpty)
                                      Text(
                                        branches[i].city!,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontSize: 13, color: c.mutedForeground),
                                      ),
                                  ],
                                ),
                              ),
                              if (branches[i].id == homeStoreId) QdBadge(tr('Home branch'), tone: QdTone.success, dot: true),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

/// Most recent completed shift (shown while offline).
class LastShiftCard extends StatelessWidget {
  const LastShiftCard({super.key, required this.shift});

  final DriverShiftEntry? shift;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final s = shift;
    final start = Format.toLocal(s?.startedAt);
    final end = Format.toLocal(s?.endedAt);
    final timeFmt = DateFormat('h:mm a', L10n.dateLocale);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        QdSectionTitle(tr('Last shift'), topGap: 4),
        QdCard(
          child: (s == null || start == null)
              ? Text(tr('No shifts yet.'), style: TextStyle(fontSize: 14, color: c.mutedForeground))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      DateFormat('EEE, MMM d', L10n.dateLocale).format(start),
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${timeFmt.format(start)}${end == null ? '' : ' – ${timeFmt.format(end)}'}',
                      style: TextStyle(fontSize: 13, color: c.mutedForeground),
                    ),
                    const SizedBox(height: 14),
                    Divider(height: 1, thickness: 1, color: c.border),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Icon(Icons.schedule_rounded, size: 20, color: c.primary),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              Format.duration(s.durationMinutes),
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground),
                            ),
                            Text(tr('Duration'), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}

class ScheduledJobCard extends StatelessWidget {
  const ScheduledJobCard({
    super.key,
    required this.job,
    required this.onOpen,
    required this.onClaim,
    required this.onSilence,
    this.claimEnabled = false,
    this.disabledLabel,
    this.claiming = false,
    this.alerting = false,
  });

  final JobSummary job;
  final VoidCallback onOpen;
  final VoidCallback onClaim;
  final VoidCallback onSilence;
  final bool claimEnabled;
  final String? disabledLabel;
  final bool claiming;
  final bool alerting;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdCard(
      padding: const EdgeInsets.all(12),
      outlined: alerting,
      color: null,
      onTap: () {
        BcFeedback.tap();
        onOpen();
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(BcRadius.md)),
                child: Icon(Icons.local_cafe_outlined, color: c.primaryStrong, size: 26),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Format.deliverySummary(job.orderCount, job.totalCups),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      [job.storeName, job.storeCity].where((s) => s.trim().isNotEmpty).join(' • '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: c.mutedForeground),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.calendar_today_outlined, size: 13, color: c.mutedForeground),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            Format.jobDateTime(job.scheduledAt),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13, color: c.mutedForeground),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  QdBadge(tr('SCHEDULED'), tone: QdTone.primary),
                  const SizedBox(height: 10),
                  Text(
                    Format.money(job.totalDeliveryFees),
                    style: BcType.section.copyWith(color: c.successStrong),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          PillButton(
            label: claimEnabled ? tr('Claim cup run') : (disabledLabel ?? tr('Go online to claim')),
            icon: claimEnabled ? Icons.bolt_rounded : null,
            kind: claimEnabled ? PillKind.primary : PillKind.soft,
            loading: claiming,
            height: 48,
            onTap: claimEnabled ? onClaim : null,
          ),
          if (alerting) ...[
            const SizedBox(height: 4),
            TextButton(
              onPressed: onSilence,
              child: Text(tr('Silence alert'), style: TextStyle(color: c.primary, fontWeight: FontWeight.w700)),
            ),
          ],
        ],
      ),
    );
  }
}

/// Empty queue: QuickDrop "waiting for jobs" card with a radar pulse when online, or a
/// nudge to go online otherwise.
class NoOtherJobsCard extends StatefulWidget {
  const NoOtherJobsCard({super.key, this.isOnline = true});
  final bool isOnline;

  @override
  State<NoOtherJobsCard> createState() => _NoOtherJobsCardState();
}

class _NoOtherJobsCardState extends State<NoOtherJobsCard> with SingleTickerProviderStateMixin {
  late final AnimationController _radar = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))
    ..repeat();

  @override
  void dispose() {
    _radar.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final reduced = MediaQuery.of(context).disableAnimations;
    final online = widget.isOnline;
    final ring = online ? c.primary : c.mutedForeground;
    const size = 112.0;
    return QdCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Column(
        children: [
          SizedBox(
            width: size,
            height: size,
            child: AnimatedBuilder(
              animation: _radar,
              builder: (_, child) => Stack(
                alignment: Alignment.center,
                children: [
                  if (online && !reduced)
                    for (final phase in [0.0, 0.5])
                      Builder(
                        builder: (_) {
                          final t = (_radar.value + phase) % 1.0;
                          final d = size * (0.5 + 0.5 * t);
                          return Opacity(
                            opacity: 0.35 * (1 - t),
                            child: Container(width: d, height: d, decoration: BoxDecoration(shape: BoxShape.circle, color: ring)),
                          );
                        },
                      ),
                  child!,
                ],
              ),
              child: Container(
                width: size * 0.5,
                height: size * 0.5,
                decoration: BoxDecoration(shape: BoxShape.circle, color: online ? c.primarySoft : c.muted),
                child: Icon(online ? Icons.radar_rounded : Icons.power_settings_new_rounded, size: 34, color: ring),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            online ? tr('Waiting for jobs') : tr('Queue is clear'),
            textAlign: TextAlign.center,
            style: BcType.subtitle.copyWith(color: c.foreground),
          ),
          const SizedBox(height: 6),
          Text(
            online ? tr('New cup runs will appear here automatically.') : tr('Go online to receive jobs'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: c.mutedForeground, height: 1.4),
          ),
          const SizedBox(height: 14),
          QdBadge(
            online ? tr('Waiting for new runs') : tr('Offline'),
            tone: online ? QdTone.success : QdTone.neutral,
            dot: true,
          ),
        ],
      ),
    );
  }
}

int jobsScheduledMillis(String? iso) => Format.toLocal(iso)?.millisecondsSinceEpoch ?? -1 << 62;
