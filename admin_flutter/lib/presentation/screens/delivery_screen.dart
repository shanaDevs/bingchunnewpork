import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../domain/entities/delivery.dart';
import '../../domain/logic/delivery_rules.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/re_ring_button.dart';
import '../components/sheets.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../components/date_range_dialog.dart';
import '../labels.dart';
import '../state/auth_controller.dart';
import '../state/delivery_controller.dart';
import '../theme/pos_theme.dart';
import 'delivery_job_screen.dart';

/// Delivery page with its own controller (bar tab or pushed from More).
class DeliveryPage extends StatelessWidget {
  const DeliveryPage({super.key, this.embedded = false});

  /// Inside the branch admin Delivery hub, which draws the page title.
  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final c = context.read<AppContainer>();
    final session = context.read<AuthController>().session!;
    return ChangeNotifierProvider(
      create: (_) => DeliveryController(c.deliveryRepository, c.socket, session),
      child: DeliveryScreen(embedded: embedded),
    );
  }
}

/// Delivery Jobs — port of the web `/admin/delivery` in cashier mode (Jobs tab
/// only, today's schedules, read-only job details and route maps).
class DeliveryScreen extends StatelessWidget {
  const DeliveryScreen({super.key, this.embedded = false});
  final bool embedded;

  Future<void> _pickDates(BuildContext context, DeliveryController ctrl) async {
    final choice = await showOptionSheet<String>(
      context,
      title: tr('Schedule dates'),
      selected: ctrl.dateFrom == null ? 'today' : 'custom',
      options: [('today', tr('Today')), ('custom', tr('Custom Range'))],
    );
    if (choice == null || !context.mounted) return;
    if (choice == 'today') {
      ctrl.setRange(null, null);
      return;
    }
    final now = DateTime.now();
    final range = await showDateRangeDialog(
      context,
      firstDate: DateTime(now.year - 2),
      lastDate: now.add(const Duration(days: 30)),
      initial: DateTimeRange(start: now.subtract(const Duration(days: 6)), end: now),
    );
    if (range != null) ctrl.setRange(formatYmd(range.start), formatYmd(range.end));
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<DeliveryController>();
    final c = context.pos;
    final tab = ctrl.tab;
    final jobs = ctrl.jobsFor(tab);

    final (String title, String description, IconData icon, Color color, String empty) = switch (tab) {
      DeliveryJobsTab.active => (
        tr('Active schedules'),
        tr("Today's unclaimed jobs and runs currently in progress. Tap a run to open full job details."),
        Icons.local_shipping_outlined,
        c.brand,
        tr('No active delivery schedules.'),
      ),
      DeliveryJobsTab.completed => (
        tr('Completed schedules'),
        tr('Past delivery runs · tap a run to review full job details.'),
        Icons.check_circle_outline_rounded,
        c.successText,
        tr('No completed delivery schedules yet.'),
      ),
      DeliveryJobsTab.incomplete => (
        tr('Incomplete schedules'),
        tr(
          'Jobs nobody picked up (Missed), claimed but never started (Abandoned), claimed but not finished (Partially Completed), or Cancelled.',
        ),
        Icons.warning_amber_rounded,
        c.warningText,
        tr('No incomplete delivery schedules.'),
      ),
    };

    return RefreshIndicator(
      onRefresh: () => ctrl.refresh(silent: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.lg, PosSpacing.xxl),
        children: [
          if (!embedded) ...[
            PageHeader(
              title: tr('Delivery'),
              subtitle: tr('Scheduled delivery runs · classify new orders on the Orders page'),
              actions: [PosIconButton(icon: Icons.refresh_rounded, tooltip: tr('Refresh'), onPressed: ctrl.refresh)],
            ),
            const SizedBox(height: PosSpacing.md),
          ],
          if (ctrl.storeId == null)
            InlineNotice(message: tr('Branch account is not linked to a store.'), tone: NoticeTone.warning)
          else ...[
            // Web "Filters" card: Branch (fixed for branch staff) + Rider, applied on Apply.
            _FiltersCard(ctrl: ctrl, branch: ctrl.session.branchLabel ?? tr('Your branch')),
            if (ctrl.canPickDates) ...[
              const SizedBox(height: PosSpacing.sm),
              Align(
                alignment: Alignment.centerLeft,
                child: FilterPill(
                  label: ctrl.dateFrom == null ? tr('Today') : '${ctrl.dateFrom} – ${ctrl.dateTo}',
                  icon: Icons.calendar_today_rounded,
                  active: ctrl.dateFrom != null,
                  onTap: () => _pickDates(context, ctrl),
                ),
              ),
            ],
            const SizedBox(height: PosSpacing.md),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              clipBehavior: Clip.none,
              child: Row(
                children: [
                  for (final (t, label, icon) in [
                    (DeliveryJobsTab.active, tr('Active'), Icons.local_shipping_outlined),
                    (DeliveryJobsTab.completed, tr('Complete'), Icons.check_circle_outline_rounded),
                    (DeliveryJobsTab.incomplete, tr('Incomplete'), Icons.warning_amber_rounded),
                  ]) ...[
                    _SubTab(
                      label: '$label (${ctrl.countFor(t)})',
                      icon: icon,
                      selected: tab == t,
                      onTap: () => ctrl.setTab(t),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            const SizedBox(height: PosSpacing.md),
            PosCard(
              padding: const EdgeInsets.all(PosSpacing.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, color: color, size: 20),
                  const SizedBox(width: PosSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: PosType.heading.copyWith(color: c.text, fontSize: 16)),
                        const SizedBox(height: 2),
                        Text(description, style: PosType.caption.copyWith(color: c.textMuted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: PosSpacing.md),
            if (ctrl.loading && jobs.isEmpty)
              LoadingView(message: tr('Loading schedules…'))
            else if (ctrl.error != null && jobs.isEmpty)
              ErrorView(message: ctrl.error!, onRetry: ctrl.refresh)
            else if (jobs.isEmpty)
              EmptyView(message: empty, icon: Icons.map_outlined)
            else
              ResponsiveGrid(
                children: [for (final j in jobs) _JobCard(job: j, storeId: ctrl.storeId!, tab: tab)],
              ),
          ],
        ],
      ),
    );
  }
}

class _SubTab extends StatelessWidget {
  const _SubTab({required this.label, required this.icon, required this.selected, required this.onTap});
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final fg = selected ? Colors.white : c.textMuted;
    return Material(
      color: selected ? c.brand : c.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.button),
        side: BorderSide(color: selected ? c.brand : c.border.withValues(alpha: 0.6)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PosRadius.button),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Icon(icon, size: 15, color: fg),
              const SizedBox(width: 6),
              Text(label, style: PosType.bodyStrong.copyWith(color: fg, fontSize: 12.5)),
            ],
          ),
        ),
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job, required this.storeId, required this.tab});
  final DeliveryJob job;
  final String storeId;
  final DeliveryJobsTab tab;

  void _openRoute(BuildContext context, {required bool actual}) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) =>
          DeliveryRouteScreen(jobId: job.id, storeId: job.storeId ?? storeId, actual: actual, title: job.title),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final j = job;
    final status = j.effectiveStatus;
    final distance = j.actualDistanceKm ?? j.distanceKm;
    final minutes = j.actualMinutes ?? j.estimatedMinutes;
    return PosCard(
      padding: const EdgeInsets.all(PosSpacing.md),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => DeliveryJobScreen(jobId: j.id, storeId: j.storeId ?? storeId),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(j.title, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 14)),
                    if (j.rideCode != null)
                      Text(
                        j.rideCode!,
                        style: PosType.caption.copyWith(color: c.textMuted, fontFamily: 'monospace', fontSize: 11.5),
                      ),
                  ],
                ),
              ),
              PosBadge(label: deliveryStatusLabel(status), color: deliveryStatusColor(context, status)),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              _Fact(Icons.schedule_rounded, formatShortDateTime(j.completedAt ?? j.scheduledAt)),
              _Fact(Icons.two_wheeler_rounded, j.driverName ?? tr('Unassigned')),
              _Fact(
                Icons.receipt_long_outlined,
                tr('{done}/{total} delivered', {'done': j.deliveredCount, 'total': j.orderCount}),
              ),
              if (j.totalCups != null) _Fact(Icons.local_cafe_outlined, trn(j.totalCups!, '{n} cup', '{n} cups')),
              if (distance != null) _Fact(Icons.route_rounded, '${distance.toStringAsFixed(1)} km'),
              if (minutes != null) _Fact(Icons.timer_outlined, tr('{n} min', {'n': minutes})),
              if (j.totalRevenue != null) _Fact(Icons.payments_outlined, formatMoney(j.totalRevenue!)),
            ],
          ),
          const SizedBox(height: PosSpacing.sm),
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    TextButton.icon(
                      onPressed: () => _openRoute(context, actual: false),
                      icon: const Icon(Icons.map_outlined, size: 17),
                      label: Text(tr('View route')),
                      style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                    ),
                    if (tab == DeliveryJobsTab.completed && j.hasActualRoute)
                      TextButton.icon(
                        onPressed: () => _openRoute(context, actual: true),
                        icon: const Icon(Icons.timeline_rounded, size: 17),
                        label: Text(tr('Actual route')),
                        style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                      ),
                    // Unclaimed for 30 s+: ring the branch riders again (web ReRingButton).
                    if (j.status == 'SCHEDULED' && j.driverName == null) ReRingButton(job: j),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: c.textMuted),
            ],
          ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: c.textSoft),
        const SizedBox(width: 4),
        Text(text, style: PosType.caption.copyWith(color: c.text, fontSize: 12)),
      ],
    );
  }
}

class _FiltersCard extends StatefulWidget {
  const _FiltersCard({required this.ctrl, required this.branch});
  final DeliveryController ctrl;
  final String branch;

  @override
  State<_FiltersCard> createState() => _FiltersCardState();
}

class _FiltersCardState extends State<_FiltersCard> {
  /// Rider picked but not applied yet ('' = all riders).
  late String _pending = widget.ctrl.driverId ?? '';

  String _riderName(String id) => id.isEmpty
      ? tr('All riders')
      : widget.ctrl.riders.where((r) => r.id == id).map((r) => r.name).firstOrNull ?? tr('All riders');

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final ctrl = widget.ctrl;

    Widget field(String label, Widget child) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: PosType.caption.copyWith(color: c.textMuted, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        child,
      ],
    );

    Widget box(String text, {IconData? trailing, VoidCallback? onTap}) => Material(
      color: c.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.button),
        side: BorderSide(color: c.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PosRadius.button),
        onTap: onTap,
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.body.copyWith(color: onTap == null ? c.textMuted : c.text, fontSize: 13.5),
                ),
              ),
              if (trailing != null) Icon(trailing, size: 18, color: c.textMuted),
            ],
          ),
        ),
      ),
    );

    return PosCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.lg, PosSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tr('Filters'), style: PosType.section.copyWith(color: c.text)),
                Text(
                  tr("Showing today's delivery schedules."),
                  style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: c.border.withValues(alpha: 0.7)),
          Padding(
            padding: const EdgeInsets.all(PosSpacing.lg),
            // One row like the web: Branch, Rider, Apply and the reset icon.
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(child: field(tr('Branch'), box(widget.branch))),
                const SizedBox(width: PosSpacing.sm),
                Expanded(
                  child: field(
                    tr('Rider'),
                    box(
                      _riderName(_pending),
                      trailing: Icons.expand_more_rounded,
                      onTap: () async {
                        final v = await showOptionSheet<String>(
                          context,
                          title: tr('Rider'),
                          selected: _pending,
                          options: [('', tr('All riders')), for (final r in ctrl.riders) (r.id, r.name)],
                        );
                        if (v != null) setState(() => _pending = v);
                      },
                    ),
                  ),
                ),
                const SizedBox(width: PosSpacing.sm),
                SizedBox(
                  width: 100,
                  child: PosButton(
                    label: tr('Apply'),
                    height: 44,
                    onPressed: () => ctrl.setDriver(_pending.isEmpty ? null : _pending),
                  ),
                ),
                const SizedBox(width: PosSpacing.sm),
                // Monochrome reset icon in place of the web's "Reset" text button.
                Tooltip(
                  message: tr('Reset'),
                  child: Material(
                    color: c.card,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(PosRadius.button),
                      side: BorderSide(color: c.border),
                    ),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(PosRadius.button),
                      onTap: () {
                        setState(() => _pending = '');
                        if (ctrl.driverId != null) ctrl.setDriver(null);
                      },
                      child: SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(Icons.restart_alt_rounded, size: 22, color: c.text),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
