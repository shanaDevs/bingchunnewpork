import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/period_filter.dart';
import '../components/pos_card.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';
import 'delivery_screen.dart';

enum _HubTab { dashboard, jobs, drivers, complaints, failures }

/// Branch admin Delivery — the whole web `/admin/delivery` page: Dashboard,
/// Jobs, Drivers, Complaints and Failures (branch admins can manage riders and
/// review complaints).
class DeliveryHubScreen extends StatefulWidget {
  const DeliveryHubScreen({super.key, required this.session, required this.canUpdate});
  final AdminSession session;
  final bool canUpdate;

  @override
  State<DeliveryHubScreen> createState() => _DeliveryHubScreenState();
}

class _DeliveryHubScreenState extends State<DeliveryHubScreen> {
  _HubTab _tab = _HubTab.jobs;

  String _label(_HubTab t) => switch (t) {
    _HubTab.dashboard => tr('Dashboard'),
    _HubTab.jobs => tr('Jobs'),
    _HubTab.drivers => tr('Drivers'),
    _HubTab.complaints => tr('Complaints'),
    _HubTab.failures => tr('Failures'),
  };

  IconData _icon(_HubTab t) => switch (t) {
    _HubTab.dashboard => Icons.space_dashboard_outlined,
    _HubTab.jobs => Icons.local_shipping_outlined,
    _HubTab.drivers => Icons.two_wheeler_rounded,
    _HubTab.complaints => Icons.report_gmailerrorred_outlined,
    _HubTab.failures => Icons.error_outline_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final storeId = widget.session.storeId;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.lg, 0),
          child: Column(
            children: [
              PageHeader(
                title: tr('Delivery'),
                subtitle: tr('Runs, riders and delivery issues for {b}', {'b': widget.session.branchLabel ?? tr('your branch')}),
              ),
              const SizedBox(height: PosSpacing.md),
              PillTabs<_HubTab>(
                items: [for (final t in _HubTab.values) (t, _label(t), _icon(t), null)],
                selected: _tab,
                onSelect: (t) => setState(() => _tab = t),
              ),
            ],
          ),
        ),
        Expanded(
          child: storeId == null
              ? Padding(
                  padding: const EdgeInsets.all(PosSpacing.lg),
                  child: InlineNotice(message: tr('Branch account is not linked to a store.'), tone: NoticeTone.warning),
                )
              : IndexedStack(
                  index: _tab.index,
                  children: [
                    _DashboardTab(storeId: storeId),
                    const DeliveryPage(embedded: true),
                    _DriversTab(storeId: storeId, canUpdate: widget.canUpdate),
                    _ComplaintsTab(storeId: storeId, canUpdate: widget.canUpdate),
                    _FailuresTab(storeId: storeId),
                  ],
                ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------- Dashboard

class _DashboardTab extends StatefulWidget {
  const _DashboardTab({required this.storeId});
  final String storeId;

  @override
  State<_DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<_DashboardTab> {
  PeriodFilter _period = const PeriodFilter.month();
  late final Loadable<DeliveryOpsDashboard> _data;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _data = Loadable(() {
      final r = _period.orderRange;
      return repo.deliveryDashboard(storeId: widget.storeId, from: r.startDate, to: r.endDate);
    });
  }

  @override
  void dispose() {
    _data.dispose();
    super.dispose();
  }

  String _mins(double? v) => v == null ? '—' : '${v.toStringAsFixed(v < 10 ? 1 : 0)} min';

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return ListenableBuilder(
      listenable: _data,
      builder: (context, _) {
        final d = _data.data;
        return AdminPageList(
          onRefresh: () => _data.load(silent: true),
          children: [
            PeriodSegments(
              value: _period,
              onChanged: (p) {
                if (!p.ready) return;
                setState(() => _period = p);
                _data.load();
              },
            ),
            const SizedBox(height: PosSpacing.md),
            if (d == null)
              _data.error != null
                  ? ErrorView(message: _data.error!, onRetry: _data.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else ...[
              SectionLabel(tr('Live now')),
              KpiGrid(
                children: [
                  KpiTile(icon: Icons.wifi_tethering_rounded, title: tr('Online'), value: formatCount(d.online), color: PosColors.ready),
                  KpiTile(icon: Icons.delivery_dining_rounded, title: tr('On delivery'), value: formatCount(d.onDelivery), color: c.accent),
                  KpiTile(icon: Icons.bedtime_outlined, title: tr('Off duty'), value: formatCount(d.offDuty), color: c.textMuted),
                  KpiTile(icon: Icons.route_rounded, title: tr('Jobs in progress'), value: formatCount(d.jobsInProgress)),
                ],
              ),
              const SizedBox(height: PosSpacing.lg),
              SectionLabel(periodLabel(_period)),
              KpiGrid(
                children: [
                  KpiTile(icon: Icons.check_circle_outline_rounded, title: tr('Completed jobs'), value: formatCount(d.completedJobs), color: PosColors.ready),
                  KpiTile(icon: Icons.receipt_long_outlined, title: tr('Orders delivered'), value: formatCount(d.distinctOrders)),
                  KpiTile(icon: Icons.straighten_rounded, title: tr('Distance'), value: '${d.totalDistanceKm.toStringAsFixed(1)} km'),
                  KpiTile(icon: Icons.timer_outlined, title: tr('Avg. time per order'), value: _mins(d.avgMinutesPerOrder)),
                  KpiTile(icon: Icons.storefront_outlined, title: tr('Avg. station time'), value: _mins(d.avgStationMinutes)),
                  KpiTile(icon: Icons.schedule_rounded, title: tr('Online time'), value: '${(d.onlineMinutes / 60).toStringAsFixed(1)} h'),
                ],
              ),
              const SizedBox(height: PosSpacing.md),
              AdaptiveRows(
                children: [
                  SectionCard(
                    title: tr('Top Riders'),
                    subtitle: periodLabel(_period),
                    child: RankBars(
                      rows: [
                        for (final r in d.topRiders.take(5))
                          (r.name, r.orders.toDouble(), trn(r.orders, '{n} order', '{n} orders'), tr('{j} jobs · {km} km', {'j': r.jobs, 'km': r.distanceKm.toStringAsFixed(1)})),
                      ],
                      empty: tr('No deliveries in this period'),
                    ),
                  ),
                  SectionCard(
                    title: tr('Active Jobs'),
                    subtitle: tr('Runs on the road right now'),
                    child: d.activeJobs.isEmpty
                        ? Padding(
                            padding: const EdgeInsets.symmetric(vertical: PosSpacing.lg),
                            child: Center(child: Text(tr('No active jobs'), style: PosType.caption.copyWith(color: c.textMuted))),
                          )
                        : Column(
                            children: [
                              for (final j in d.activeJobs)
                                ListTile(
                                  dense: true,
                                  contentPadding: EdgeInsets.zero,
                                  leading: Icon(Icons.delivery_dining_rounded, color: c.brand),
                                  title: Text(j.riderName, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13)),
                                  subtitle: Text(
                                    [trn(j.orderCount, '{n} order', '{n} orders'), if (j.distanceKm != null) '${j.distanceKm!.toStringAsFixed(1)} km'].join(' · '),
                                    style: PosType.caption.copyWith(color: c.textMuted),
                                  ),
                                  trailing: PosBadge(label: j.status.replaceAll('_', ' '), color: c.brand),
                                ),
                            ],
                          ),
                  ),
                ],
              ),
            ],
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------- Drivers

String dutyLabel(String s) => switch (s) {
  'ONLINE' => tr('Online'),
  'ON_DELIVERY' => tr('On delivery'),
  'OFF_DUTY' => tr('Off duty'),
  _ => s.replaceAll('_', ' '),
};

class _DriversTab extends StatefulWidget {
  const _DriversTab({required this.storeId, required this.canUpdate});
  final String storeId;
  final bool canUpdate;

  @override
  State<_DriversTab> createState() => _DriversTabState();
}

class _DriversTabState extends State<_DriversTab> {
  int _page = 1;
  String _name = '';
  bool? _active;
  late final Loadable<Paged<DriverRow>> _rows;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _rows = Loadable(() => repo.drivers(storeId: widget.storeId, page: _page, name: _name, active: _active));
  }

  @override
  void dispose() {
    _rows.dispose();
    super.dispose();
  }

  Future<void> _toggle(DriverRow d) async {
    final off = d.isActive;
    final ok = await confirmDialog(
      context,
      title: off ? tr('Deactivate rider?') : tr('Activate rider?'),
      message: off ? tr('{name} will not be offered new delivery runs.', {'name': d.name}) : tr('{name} can take delivery runs again.', {'name': d.name}),
      confirmLabel: off ? tr('Deactivate') : tr('Activate'),
      danger: off,
      icon: Icons.two_wheeler_rounded,
    );
    if (!ok || !mounted) return;
    try {
      await context.read<AppContainer>().adminRepository.setDriverActive(d.id, !d.isActive);
      PosFeedback.success();
      if (mounted) showPosSnack(context, tr('Rider updated'), kind: PosSnackKind.success);
      _rows.load(silent: true);
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return ListenableBuilder(
      listenable: _rows,
      builder: (context, _) {
        final page = _rows.data;
        return AdminPageList(
          onRefresh: () => _rows.load(silent: true),
          children: [
            SearchBox(
              hint: tr('Search riders by name'),
              onChanged: (v) {
                _name = v;
                _page = 1;
                _rows.load();
              },
            ),
            const SizedBox(height: PosSpacing.sm),
            PillTabs<bool?>(
              items: [(null, tr('All'), null, null), (true, tr('Active'), null, null), (false, tr('Inactive'), null, null)],
              selected: _active,
              onSelect: (v) {
                setState(() => _active = v);
                _page = 1;
                _rows.load();
              },
            ),
            const SizedBox(height: PosSpacing.md),
            if (page == null)
              _rows.error != null
                  ? ErrorView(message: _rows.error!, onRetry: _rows.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else if (page.items.isEmpty)
              EmptyView(message: tr('No riders found'), icon: Icons.two_wheeler_rounded)
            else ...[
              ResponsiveGrid(
                minItemWidth: 360,
                children: [
                  for (final d in page.items)
                    PosCard(
                      padding: const EdgeInsets.all(PosSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              CircleAvatar(
                                radius: 22,
                                backgroundColor: c.brandSubtle,
                                backgroundImage: d.photoUrl == null ? null : NetworkImage(d.photoUrl!),
                                child: d.photoUrl != null ? null : Icon(Icons.person_rounded, color: c.brand),
                              ),
                              const SizedBox(width: PosSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(d.name, style: PosType.bodyStrong.copyWith(color: c.text)),
                                    Text(
                                      [?d.phone, if (d.vehicleNumber != null) '${d.vehicleType ?? ''} ${d.vehicleNumber}'.trim()].join(' · '),
                                      style: PosType.caption.copyWith(color: c.textMuted),
                                    ),
                                  ],
                                ),
                              ),
                              PosBadge(
                                label: dutyLabel(d.dutyStatus),
                                color: d.dutyStatus == 'ONLINE'
                                    ? c.successText
                                    : d.dutyStatus == 'ON_DELIVERY'
                                    ? c.warningText
                                    : c.textMuted,
                              ),
                            ],
                          ),
                          const SizedBox(height: PosSpacing.sm),
                          Wrap(
                            spacing: PosSpacing.lg,
                            runSpacing: 4,
                            children: [
                              _fact(tr('Completed jobs'), formatCount(d.completedJobs)),
                              _fact(tr('Delivery fees'), formatMoney(d.totalDeliveryFees)),
                              _fact(tr('Rating'), d.rating == null ? '—' : '${d.rating!.toStringAsFixed(1)} ★ (${d.ratingCount})'),
                              if (d.homeBranch != null) _fact(tr('Home branch'), shortBranch(d.homeBranch)),
                            ],
                          ),
                          const SizedBox(height: PosSpacing.sm),
                          Row(
                            children: [
                              PosBadge(label: d.isActive ? tr('Active') : tr('Inactive'), color: d.isActive ? c.successText : c.dangerText),
                              if (d.meritStatus != null) ...[const SizedBox(width: 6), PosBadge(label: d.meritStatus!, color: c.brand)],
                              const Spacer(),
                              if (widget.canUpdate)
                                PosButton(
                                  label: d.isActive ? tr('Deactivate') : tr('Activate'),
                                  variant: d.isActive ? PosButtonVariant.outline : PosButtonVariant.success,
                                  expand: false,
                                  height: 34,
                                  onPressed: () => _toggle(d),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              Pager(
                page: _page,
                pages: page.pages,
                total: page.total,
                onPage: (p) {
                  _page = p;
                  _rows.load();
                },
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _fact(String label, String value) {
    final c = context.pos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 10.5)),
        Text(value, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 12.5)),
      ],
    );
  }
}

// ---------------------------------------------------------------- Complaints

String complaintStatusLabel(String s) => switch (s) {
  'OPEN' => tr('Open'),
  'CONFIRMED' => tr('Confirmed'),
  'DISMISSED' => tr('Dismissed'),
  'RESOLVED' => tr('Resolved'),
  _ => s,
};

class _ComplaintsTab extends StatefulWidget {
  const _ComplaintsTab({required this.storeId, required this.canUpdate});
  final String storeId;
  final bool canUpdate;

  @override
  State<_ComplaintsTab> createState() => _ComplaintsTabState();
}

class _ComplaintsTabState extends State<_ComplaintsTab> {
  int _page = 1;
  late final Loadable<Paged<DriverComplaint>> _rows;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _rows = Loadable(() => repo.complaints(storeId: widget.storeId, page: _page));
  }

  @override
  void dispose() {
    _rows.dispose();
    super.dispose();
  }

  Future<void> _review(DriverComplaint cp, String status) async {
    final confirm = status == 'CONFIRMED';
    final ok = await confirmDialog(
      context,
      title: confirm ? tr('Confirm complaint?') : tr('Dismiss complaint?'),
      message: confirm
          ? tr('The complaint counts against {name}\'s merit score.', {'name': cp.driverName ?? tr('the rider')})
          : tr('The complaint is closed with no action against the rider.'),
      confirmLabel: confirm ? tr('Confirm') : tr('Dismiss'),
      danger: confirm,
      icon: Icons.gavel_rounded,
    );
    if (!ok || !mounted) return;
    try {
      await context.read<AppContainer>().adminRepository.reviewComplaint(cp.id, status);
      PosFeedback.success();
      if (mounted) showPosSnack(context, tr('Complaint updated'), kind: PosSnackKind.success);
      _rows.load(silent: true);
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return ListenableBuilder(
      listenable: _rows,
      builder: (context, _) {
        final page = _rows.data;
        return AdminPageList(
          onRefresh: () => _rows.load(silent: true),
          children: [
            if (page == null)
              _rows.error != null
                  ? ErrorView(message: _rows.error!, onRetry: _rows.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else if (page.items.isEmpty)
              EmptyView(message: tr('No rider complaints'), icon: Icons.sentiment_satisfied_alt_rounded)
            else ...[
              ResponsiveGrid(
                minItemWidth: 380,
                children: [
                  for (final cp in page.items)
                    PosCard(
                      padding: const EdgeInsets.all(PosSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  cp.category.replaceAll('_', ' '),
                                  style: PosType.bodyStrong.copyWith(color: c.text),
                                ),
                              ),
                              PosBadge(
                                label: complaintStatusLabel(cp.status),
                                color: cp.status == 'OPEN'
                                    ? c.warningText
                                    : cp.status == 'CONFIRMED'
                                    ? c.dangerText
                                    : c.successText,
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(cp.description, style: PosType.body.copyWith(color: c.text, fontSize: 13)),
                          const SizedBox(height: 6),
                          Text(
                            [
                              if (cp.orderNumber != null) '#${cp.orderNumber}',
                              ?cp.driverName,
                              ?cp.customerName,
                              formatShortDateTime(cp.createdAt),
                            ].join(' · '),
                            style: PosType.caption.copyWith(color: c.textMuted),
                          ),
                          if (cp.resolvedByName != null)
                            Text(tr('Reviewed by {n}', {'n': cp.resolvedByName}), style: PosType.caption.copyWith(color: c.textSoft)),
                          if (widget.canUpdate && cp.status == 'OPEN') ...[
                            const SizedBox(height: PosSpacing.sm),
                            Row(
                              children: [
                                Expanded(
                                  child: PosButton(label: tr('Dismiss'), variant: PosButtonVariant.outline, height: 38, onPressed: () => _review(cp, 'DISMISSED')),
                                ),
                                const SizedBox(width: PosSpacing.sm),
                                Expanded(
                                  child: PosButton(label: tr('Confirm'), variant: PosButtonVariant.danger, height: 38, onPressed: () => _review(cp, 'CONFIRMED')),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
              Pager(
                page: _page,
                pages: page.pages,
                total: page.total,
                onPage: (p) {
                  _page = p;
                  _rows.load();
                },
              ),
            ],
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------- Failures

String failureOutcomeLabel(String o) => switch (o) {
  'CUSTOMER_UNREACHABLE' => tr('Customer unreachable'),
  'CUSTOMER_REFUSED' => tr('Customer refused'),
  'WRONG_ADDRESS' => tr('Wrong address'),
  'RETURNED' => tr('Returned to branch'),
  _ => o.replaceAll('_', ' ').toLowerCase().replaceFirstMapped(RegExp('^.'), (m) => m[0]!.toUpperCase()),
};

class _FailuresTab extends StatefulWidget {
  const _FailuresTab({required this.storeId});
  final String storeId;

  @override
  State<_FailuresTab> createState() => _FailuresTabState();
}

class _FailuresTabState extends State<_FailuresTab> {
  int _page = 1;
  late final Loadable<Paged<DeliveryFailure>> _rows;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _rows = Loadable(() => repo.failures(storeId: widget.storeId, page: _page));
  }

  @override
  void dispose() {
    _rows.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return ListenableBuilder(
      listenable: _rows,
      builder: (context, _) {
        final page = _rows.data;
        return AdminPageList(
          onRefresh: () => _rows.load(silent: true),
          children: [
            InlineNotice(
              message: tr('Failed delivery attempts reported by riders. Re-assign failed orders from the web admin.'),
              tone: NoticeTone.info,
            ),
            const SizedBox(height: PosSpacing.md),
            if (page == null)
              _rows.error != null
                  ? ErrorView(message: _rows.error!, onRetry: _rows.load)
                  : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView())
            else if (page.items.isEmpty)
              EmptyView(message: tr('No failed deliveries'), icon: Icons.check_circle_outline_rounded)
            else ...[
              ResponsiveGrid(
                minItemWidth: 380,
                children: [
                  for (final f in page.items)
                    PosCard(
                      padding: const EdgeInsets.all(PosSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              if (f.orderNumber != null) Text('#${f.orderNumber}', style: PosType.bodyStrong.copyWith(color: c.text)),
                              const SizedBox(width: 6),
                              PosBadge(label: failureOutcomeLabel(f.outcome), color: c.dangerText),
                              const Spacer(),
                              PosBadge(label: tr('Attempt {n}', {'n': f.attemptNo}), color: c.textMuted),
                            ],
                          ),
                          const SizedBox(height: 6),
                          if (f.note != null) Text(f.note!, style: PosType.body.copyWith(color: c.text, fontSize: 13)),
                          Text(
                            [?f.driverName, ?f.customerName, formatShortDateTime(f.createdAt)].join(' · '),
                            style: PosType.caption.copyWith(color: c.textMuted),
                          ),
                          if (f.reassignmentStatus != null) ...[
                            const SizedBox(height: 4),
                            PosBadge(label: f.reassignmentStatus!.replaceAll('_', ' '), color: c.brand),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
              Pager(
                page: _page,
                pages: page.pages,
                total: page.total,
                onPage: (p) {
                  _page = p;
                  _rows.load();
                },
              ),
            ],
          ],
        );
      },
    );
  }
}
