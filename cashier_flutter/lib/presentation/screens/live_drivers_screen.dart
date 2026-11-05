import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../domain/entities/delivery.dart';
import '../../domain/entities/admin_session.dart';
import '../../l10n/l10n.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/delivery_map.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/states.dart';
import '../labels.dart';
import '../state/auth_controller.dart';
import '../state/live_drivers_controller.dart';
import '../theme/pos_theme.dart';
import 'delivery_job_screen.dart';

/// Live Drivers page with its own controller (bar tab or pushed from More).
class LiveDriversPage extends StatelessWidget {
  const LiveDriversPage({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.read<AppContainer>();
    final AdminSession session = context.read<AuthController>().session!;
    return ChangeNotifierProvider(
      create: (_) => LiveDriversController(c.deliveryRepository, c.socket, session),
      child: const LiveDriversScreen(),
    );
  }
}

/// Live Drivers — port of the web `/admin/delivery/live`: branch riders on an
/// OpenStreetMap with trails, today's runs, live GPS over the socket.
class LiveDriversScreen extends StatelessWidget {
  const LiveDriversScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<LiveDriversController>();
    final c = context.pos;
    final session = ctrl.session;
    final selected = ctrl.drivers.where((d) => d.driverId == ctrl.selectedDriverId).firstOrNull;
    final onMap = ctrl.onMap;

    return RefreshIndicator(
      onRefresh: () => ctrl.refresh(silent: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.lg, PosSpacing.xxl),
        children: [
          PageHeader(
            title: tr('Live Drivers'),
            subtitle: tr('{n} riders on the map · {runs} live runs', {'n': onMap.length, 'runs': ctrl.liveRuns.length}),
            actions: [PosIconButton(icon: Icons.refresh_rounded, tooltip: tr('Refresh'), onPressed: ctrl.refresh)],
          ),
          const SizedBox(height: PosSpacing.md),
          if (session.storeId == null)
            InlineNotice(message: tr('Branch account is not linked to a store.'), tone: NoticeTone.warning)
          else if (ctrl.loading && ctrl.drivers.isEmpty)
            LoadingView(message: tr('Loading riders…'))
          else if (ctrl.error != null && ctrl.drivers.isEmpty)
            ErrorView(message: ctrl.error!, onRetry: ctrl.refresh)
          else ...[
            // The map always shows, like the web page; riders appear as they share GPS.
            SizedBox(
              height: (MediaQuery.sizeOf(context).height * (isTablet(context) ? 0.5 : 0.42)).clamp(300.0, 620.0),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: DeliveryMap(
                      focus: selected?.location,
                      focusNonce: ctrl.focusNonce,
                      pins: [
                        for (final d in onMap)
                          MapPin(
                            at: d.location!,
                            kind: MapPinKind.rider,
                            selected: d.driverId == ctrl.selectedDriverId,
                            onTap: () => ctrl.select(d.driverId),
                          ),
                      ],
                      lines: [
                        for (final d in onMap)
                          if (d.trail.length >= 2)
                            MapLine(
                              points: d.trail,
                              color: (d.driverId == ctrl.selectedDriverId ? PosColors.preparing : c.brand).withValues(
                                alpha: 0.75,
                              ),
                              width: d.driverId == ctrl.selectedDriverId ? 4.5 : 3,
                            ),
                      ],
                    ),
                  ),
                  if (onMap.isEmpty)
                    Positioned(
                      left: 10,
                      top: 10,
                      right: 56,
                      child: Align(
                        alignment: Alignment.topLeft,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: c.card.withValues(alpha: 0.94),
                            borderRadius: BorderRadius.circular(PosRadius.pill),
                            border: Border.all(color: c.border),
                            boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 8, offset: Offset(0, 2))],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.location_searching_rounded, size: 15, color: c.textMuted),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  tr('No rider is sharing a location right now.'),
                                  style: PosType.caption.copyWith(color: c.text, fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (selected != null) ...[
              const SizedBox(height: PosSpacing.md),
              _SelectedRider(driver: selected, job: ctrl.jobFor(selected), storeId: session.storeId!),
            ],
            const SizedBox(height: PosSpacing.lg),
            SectionLabel(tr('Riders ({n})', {'n': ctrl.drivers.length})),
            if (ctrl.drivers.isEmpty)
              EmptyView(message: tr('No riders in this branch pool.'), icon: Icons.two_wheeler_rounded)
            else
              ResponsiveGrid(
                minItemWidth: 340,
                children: [
                  for (final d in ctrl.drivers)
                    _RiderTile(
                      driver: d,
                      job: ctrl.jobFor(d),
                      selected: d.driverId == ctrl.selectedDriverId,
                      onTap: d.location == null ? null : () => ctrl.select(d.driverId),
                    ),
                ],
              ),
            const SizedBox(height: PosSpacing.lg),
            SectionLabel(tr("Today's runs ({n})", {'n': ctrl.jobs.length})),
            if (ctrl.jobs.isEmpty)
              Text(tr('No delivery runs scheduled today.'), style: PosType.body.copyWith(color: c.textMuted))
            else
              for (final j in ctrl.jobs) ...[
                PosCard(
                  padding: const EdgeInsets.all(PosSpacing.md),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => DeliveryJobScreen(jobId: j.id, storeId: j.storeId ?? session.storeId!),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(j.title, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5)),
                            Text(
                              '${j.driverName ?? tr('Unassigned')} · ${tr('{done}/{total} delivered', {'done': j.deliveredCount, 'total': j.orderCount})}',
                              style: PosType.caption.copyWith(color: c.textMuted),
                            ),
                          ],
                        ),
                      ),
                      PosBadge(
                        label: deliveryStatusLabel(j.effectiveStatus),
                        color: deliveryStatusColor(context, j.effectiveStatus),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: PosSpacing.sm),
              ],
          ],
        ],
      ),
    );
  }
}

class _RiderTile extends StatelessWidget {
  const _RiderTile({required this.driver, required this.job, required this.selected, this.onTap});
  final LiveDriver driver;
  final DeliveryJob? job;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final d = driver;
    final onDuty = d.dutyStatus != 'OFF_DUTY';
    return PosCard(
      onTap: onTap,
      borderColor: selected ? PosColors.preparing : null,
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: (d.location != null ? PosColors.preparing : c.textSoft).withValues(alpha: 0.15),
            child: Icon(
              Icons.two_wheeler_rounded,
              color: d.location != null ? PosColors.preparing : c.textSoft,
              size: 20,
            ),
          ),
          const SizedBox(width: PosSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(d.name, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5)),
                Text(
                  [
                    if (job != null) job!.title,
                    if (d.updatedAt != null) tr('Seen {time}', {'time': formatTime(d.updatedAt!)}),
                    if (d.location == null) tr('No location'),
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.caption.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ),
          PosBadge(label: dutyStatusLabel(d.dutyStatus), color: onDuty ? c.successText : c.textSoft),
        ],
      ),
    );
  }
}

class _SelectedRider extends StatelessWidget {
  const _SelectedRider({required this.driver, required this.job, required this.storeId});
  final LiveDriver driver;
  final DeliveryJob? job;
  final String storeId;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return PosCard(
      borderColor: PosColors.preparing.withValues(alpha: 0.6),
      padding: const EdgeInsets.all(PosSpacing.md),
      child: Row(
        children: [
          const Icon(Icons.two_wheeler_rounded, color: PosColors.preparing),
          const SizedBox(width: PosSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(driver.name, style: PosType.bodyStrong.copyWith(color: c.text)),
                Text(
                  job == null ? tr('Not on a run') : '${job!.title} · ${deliveryStatusLabel(job!.effectiveStatus)}',
                  style: PosType.caption.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ),
          if (job != null)
            PosButton(
              label: tr('Open run'),
              expand: false,
              height: 38,
              variant: PosButtonVariant.outline,
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => DeliveryJobScreen(jobId: job!.id, storeId: job!.storeId ?? storeId),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
