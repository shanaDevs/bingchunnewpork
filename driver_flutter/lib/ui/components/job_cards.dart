import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../../data/models/delivery_job.dart';
import '../theme/bc_theme.dart';
import 'driver_ops.dart';
import 'surfaces.dart';
import '../../l10n/l10n.dart';

/// Home (Jobs tab) building blocks — port of JobsChrome.kt + JobCards.kt,
/// restyled to the light "home" layout.

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return tr('Good morning,');
  if (h < 17) return tr('Good afternoon,');
  return tr('Good evening,');
}

/// Creative home app bar: blue gradient with a wavy bottom edge, soft clouds and the
/// rider mascot, avatar with an online dot, and white round bell / settings buttons.
class HomeHeader extends StatelessWidget {
  const HomeHeader({
    super.key,
    required this.driverName,
    required this.branchName,
    required this.photoUrl,
    required this.alertCount,
    required this.isOnline,
    required this.onBranchTap,
    required this.onNotificationsTap,
    required this.onSettingsTap,
  });

  final String driverName;
  final String branchName;
  final String? photoUrl;
  final int alertCount;
  final bool isOnline;
  final VoidCallback onBranchTap;
  final VoidCallback onNotificationsTap;
  final VoidCallback onSettingsTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final first = driverName.trim().split(' ').first;
    final name = first.isEmpty ? 'Driver' : first[0].toUpperCase() + first.substring(1);
    final top = MediaQuery.paddingOf(context).top;
    return ClipPath(
      clipper: _HeaderWaveClipper(),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [c.brandDark, c.brand, c.brandLight],
            stops: const [0, 0.55, 1],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          children: [
            // Soft clouds along the bottom.
            Positioned.fill(child: CustomPaint(painter: _CloudPainter())),
            // Rider mascot under the buttons (bottom-right), clear of them.
            Positioned(
              right: 4,
              bottom: 8,
              child: IgnorePointer(
                child: Image.asset(
                  'assets/images/rider_mascot.png',
                  height: 96,
                  fit: BoxFit.contain,
                  semanticLabel: tr('Bing Chun rider'),
                ),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(20, top + 10, 16, 72),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _OnlineAvatar(photoUrl: photoUrl, name: name, online: isOnline),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_greeting(), style: TextStyle(fontSize: 13.5, color: Colors.white.withValues(alpha: 0.9))),
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            height: 1.15,
                          ),
                        ),
                        const SizedBox(height: 4),
                        InkWell(
                          onTap: onBranchTap,
                          borderRadius: BorderRadius.circular(8),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.location_on_outlined, size: 16, color: Colors.white),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: Text(
                                    branchName.isEmpty ? tr('Branch') : branchName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.95)),
                                  ),
                                ),
                                const SizedBox(width: 2),
                                const Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: Colors.white),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  _RoundIconButton(
                    icon: Icons.notifications_none_rounded,
                    tooltip: tr('Notifications'),
                    badge: alertCount,
                    onTap: onNotificationsTap,
                  ),
                  const SizedBox(width: 10),
                  _RoundIconButton(icon: Icons.settings_outlined, tooltip: tr('Settings'), onTap: onSettingsTap),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnlineAvatar extends StatelessWidget {
  const _OnlineAvatar({required this.photoUrl, required this.name, required this.online});
  final String? photoUrl;
  final String name;
  final bool online;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(2.5),
          decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
          child: DriverAvatar(profilePhotoUrl: photoUrl, initials: name, size: 56, textSize: 22),
        ),
        Positioned(
          right: 1,
          bottom: 1,
          child: Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: online ? const Color(0xFF22C55E) : c.disabled,
              border: Border.all(color: Colors.white, width: 2.5),
            ),
          ),
        ),
      ],
    );
  }
}

class _HeaderWaveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final w = size.width;
    final h = size.height;
    return Path()
      ..lineTo(0, h - 26)
      ..cubicTo(w * 0.22, h - 4, w * 0.42, h - 2, w * 0.58, h - 18)
      ..cubicTo(w * 0.74, h - 34, w * 0.88, h - 40, w, h - 22)
      ..lineTo(w, 0)
      ..close();
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class _CloudPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final far = Paint()..color = Colors.white.withValues(alpha: 0.10);
    final near = Paint()..color = Colors.white.withValues(alpha: 0.18);
    // Distant cloud bank
    canvas.drawPath(
      Path()
        ..moveTo(w * 0.30, h)
        ..quadraticBezierTo(w * 0.38, h - 46, w * 0.50, h - 34)
        ..quadraticBezierTo(w * 0.60, h - 66, w * 0.74, h - 44)
        ..quadraticBezierTo(w * 0.86, h - 72, w, h - 50)
        ..lineTo(w, h)
        ..close(),
      far,
    );
    // Closer puffs
    canvas.drawPath(
      Path()
        ..moveTo(w * 0.42, h)
        ..quadraticBezierTo(w * 0.50, h - 30, w * 0.60, h - 22)
        ..quadraticBezierTo(w * 0.70, h - 42, w * 0.82, h - 26)
        ..quadraticBezierTo(w * 0.92, h - 40, w, h - 24)
        ..lineTo(w, h)
        ..close(),
      near,
    );
    // A couple of small sparkles
    final dot = Paint()..color = Colors.white.withValues(alpha: 0.35);
    canvas.drawCircle(Offset(w * 0.47, h * 0.30), 2, dot);
    canvas.drawCircle(Offset(w * 0.55, h * 0.52), 1.5, dot);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({required this.icon, required this.tooltip, required this.onTap, this.badge = 0});

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: Colors.white,
          shape: const CircleBorder(),
          elevation: 3,
          shadowColor: const Color(0x33000000),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Tooltip(
              message: tooltip,
              child: SizedBox(width: 46, height: 46, child: Icon(icon, color: c.brand, size: 23)),
            ),
          ),
        ),
        if (badge > 0)
          Positioned(
            top: -4,
            right: -4,
            child: Container(
              constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
              padding: const EdgeInsets.symmetric(horizontal: 5),
              decoration: BoxDecoration(
                color: c.danger,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white, width: 2),
              ),
              alignment: Alignment.center,
              child: Text(
                badge > 9 ? '9+' : '$badge',
                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ),
          ),
      ],
    );
  }
}

/// Duty panel: power badge, "You are Online", a real switch, and the active-run count.
class BcDutyDock extends StatelessWidget {
  const BcDutyDock({
    super.key,
    required this.isOnline,
    required this.activeCount,
    required this.onToggleDuty,
    this.loading = false,
    this.newJobPulse = false,
  });

  final bool isOnline;
  final int activeCount;
  final ValueChanged<bool> onToggleDuty;
  final bool loading;
  final bool newJobPulse;

  static const _green = Color(0xFF22C55E);

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final on = isOnline;
    final tint = on ? (c.isDark ? const Color(0xFF0E2A1E) : const Color(0xFFE9FBF1)) : c.surfacePill;
    return AnimatedContainer(
      duration: BcMotion.standard,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BcRadius.card + 4),
        gradient: LinearGradient(colors: [tint, c.card], stops: const [0, 0.62]),
        border: Border.all(color: on ? _green.withValues(alpha: 0.22) : c.border),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 20, offset: const Offset(0, 6))],
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 16, 14),
      child: Row(
        children: [
          // Power badge
          AnimatedContainer(
            duration: BcMotion.standard,
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: on ? _green : c.disabled,
              boxShadow: on
                  ? [BoxShadow(color: _green.withValues(alpha: 0.35), blurRadius: 12, offset: const Offset(0, 4))]
                  : null,
            ),
            child: const Icon(Icons.power_settings_new_rounded, color: Colors.white, size: 26),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tr('You are'), style: TextStyle(fontSize: 11.5, color: c.textMuted)),
                Text(
                  on ? tr('Online') : tr('Offline'),
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.text, height: 1.2),
                ),
                Text(
                  on ? tr('Ready for cup runs') : tr('Switch on to get runs'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, color: c.textMuted),
                ),
              ],
            ),
          ),
          if (loading)
            SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: _green))
          else
            Switch(
              value: on,
              onChanged: onToggleDuty,
              activeThumbColor: Colors.white,
              activeTrackColor: _green,
              inactiveThumbColor: Colors.white,
              inactiveTrackColor: c.disabled,
              trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
            ),
          const SizedBox(width: 10),
          Container(width: 1, height: 52, color: c.border),
          const SizedBox(width: 14),
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(shape: BoxShape.circle, color: c.brandSubtle),
            child: Icon(Icons.two_wheeler_rounded, color: c.brand, size: 24),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$activeCount',
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: c.text, height: 1.1),
              ),
              Text(
                activeCount == 1 ? tr('Active run') : tr('Active runs'),
                style: TextStyle(fontSize: 11.5, color: c.textMuted),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Section title with a count bubble and a trailing caption.
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, required this.count, required this.trailing, this.info = false});

  final String title;
  final int count;
  final String trailing;
  final bool info;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final accent = info ? c.info : c.brand;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 26, 4, 12),
      child: Row(
        children: [
          Text(
            title,
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: c.text),
          ),
          if (count > 0) ...[
            const SizedBox(width: 10),
            Container(
              width: 30,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: accent.withValues(alpha: 0.12), shape: BoxShape.circle),
              child: Text(
                '$count',
                style: TextStyle(fontSize: 13, color: accent, fontWeight: FontWeight.w700),
              ),
            ),
          ],
          const Spacer(),
          Text(trailing, style: TextStyle(fontSize: 12, color: c.textMuted)),
        ],
      ),
    );
  }
}

/// Filled circle marker used on the route preview (pin = branch, flag = customer).
class _RouteMarker extends StatelessWidget {
  const _RouteMarker({required this.icon, required this.color});
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 34,
    height: 34,
    decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    child: Icon(icon, color: Colors.white, size: 18),
  );
}

class _MetricCell extends StatelessWidget {
  const _MetricCell({required this.icon, required this.label, required this.value, this.accent = false});
  final IconData icon;
  final String label;
  final String value;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, color: c.brand, size: 24),
        const SizedBox(width: 8),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label, style: TextStyle(fontSize: 11, color: c.textMuted)),
              const SizedBox(height: 1),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: accent ? c.brand : c.text),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class ActiveJobCard extends StatelessWidget {
  const ActiveJobCard({super.key, required this.job, required this.detail, required this.onOpen});

  final JobSummary job;
  final DeliveryJobDetail? detail;
  final VoidCallback onOpen;

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
    final customerPhone = activeOrder?.customerPhone.trim() ?? '';

    final destLat = activeOrder?.lat ?? detail?.store.lat ?? 6.8344;
    final destLng = activeOrder?.lng ?? detail?.store.lng ?? 79.8653;
    final estMinutes = (job.estimatedMinutes ?? 0) > 0
        ? job.estimatedMinutes!
        : ((activeOrder?.estimatedMinutes ?? 0) > 0 ? activeOrder!.estimatedMinutes : 18);
    final distanceKm = (job.estimatedDistanceKm ?? 0) > 0 ? job.estimatedDistanceKm! : 5.2;

    Future<void> call() async {
      BcFeedback.tap();
      final messenger = ScaffoldMessenger.of(context);
      if (customerPhone.isEmpty) {
        messenger.showSnackBar(SnackBar(content: Text(tr('No customer phone available'))));
        return;
      }
      final err = await Intents.dial(customerPhone);
      if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
    }

    Future<void> navigate() async {
      BcFeedback.tap();
      final messenger = ScaffoldMessenger.of(context);
      final err = await Intents.navigateTo(destLat, destLng, label: customerName);
      if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
    }

    return BcCard(
      padding: const EdgeInsets.all(18),
      onTap: () {
        BcFeedback.tap();
        onOpen();
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: c.successSubtle, borderRadius: BorderRadius.circular(99)),
                child: Text(
                  job.status.replaceAll('_', ' '),
                  style: TextStyle(fontSize: 11, color: c.success, fontWeight: FontWeight.w800, letterSpacing: 0.4),
                ),
              ),
              const Spacer(),
              Flexible(
                flex: 3,
                child: Text(
                  Format.rideIdLabel(job.rideCode, job.id).replaceFirst('·', '•'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                  style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _RouteStop(
            marker: _RouteMarker(icon: Icons.location_on, color: c.brand),
            title: storeTitle,
            subtitle: storeAddress,
          ),
          Container(
            margin: const EdgeInsets.only(left: 16),
            width: 1.5,
            height: 18,
            color: c.textMuted.withValues(alpha: 0.5),
          ),
          _RouteStop(
            marker: _RouteMarker(icon: Icons.flag_rounded, color: c.success),
            title: customerName,
            subtitle: customerAddress,
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
            decoration: BoxDecoration(color: c.surfacePill, borderRadius: BorderRadius.circular(14)),
            child: IntrinsicHeight(
              child: Row(
                children: [
                  Expanded(
                    child: _MetricCell(
                      icon: Icons.schedule_rounded,
                      label: tr('ETA'),
                      value: tr('{n} min', {'n': estMinutes}),
                    ),
                  ),
                  VerticalDivider(width: 1, thickness: 1, color: c.border),
                  Expanded(
                    child: _MetricCell(
                      icon: Icons.route_outlined,
                      label: tr('Distance'),
                      value: '${distanceKm % 1 == 0 ? distanceKm.toStringAsFixed(1) : distanceKm} km',
                    ),
                  ),
                  if (job.totalDeliveryFees > 0) ...[
                    VerticalDivider(width: 1, thickness: 1, color: c.border),
                    Expanded(
                      child: _MetricCell(
                        icon: Icons.account_balance_wallet_outlined,
                        label: tr('Earnings'),
                        value: Format.money(job.totalDeliveryFees),
                        accent: true,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                flex: 10,
                child: SizedBox(
                  height: 52,
                  child: OutlinedButton.icon(
                    onPressed: call,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.brand,
                      side: BorderSide(color: c.brand, width: 1.4),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.call_rounded, size: 22),
                    label: Text(tr('Call'), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 12,
                child: SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: navigate,
                    style: FilledButton.styleFrom(
                      backgroundColor: c.brand,
                      foregroundColor: c.onBrand,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.navigation_outlined, size: 22),
                    label: Text(tr('Navigate'), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RouteStop extends StatelessWidget {
  const _RouteStop({required this.marker, required this.title, required this.subtitle});
  final Widget marker;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Row(
      children: [
        marker,
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: c.text),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.5, color: c.textMuted),
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
    return BcCard(
      padding: const EdgeInsets.all(18),
      onTap: () {
        BcFeedback.tap();
        onOpen();
      },
      borderColor: alerting ? c.brand.withValues(alpha: 0.6) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(14)),
                child: Icon(Icons.local_cafe_outlined, color: c.brand, size: 28),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Format.deliverySummary(job.orderCount, job.totalCups),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [job.storeName, job.storeCity].where((s) => s.trim().isNotEmpty).join(' • '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: c.textMuted),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.calendar_today_outlined, size: 13, color: c.textMuted),
                        const SizedBox(width: 5),
                        Text(Format.jobDateTime(job.scheduledAt), style: TextStyle(fontSize: 13, color: c.textMuted)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: c.infoSubtle, borderRadius: BorderRadius.circular(99)),
                    child: Text(
                      tr('SCHEDULED'),
                      style: TextStyle(fontSize: 10.5, color: c.info, fontWeight: FontWeight.w800, letterSpacing: 0.3),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Text(
                        Format.money(job.totalDeliveryFees),
                        style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, color: c.brand),
                      ),
                      const SizedBox(width: 4),
                      Icon(Icons.chevron_right, color: c.textMuted, size: 20),
                    ],
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          Material(
            color: claimEnabled ? c.brand : c.brandSubtle,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: claimEnabled && !claiming
                  ? () {
                      BcFeedback.tap();
                      onClaim();
                    }
                  : null,
              child: SizedBox(
                height: 50,
                child: Center(
                  child: claiming
                      ? SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: c.onBrand),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              claimEnabled ? Icons.bolt_rounded : Icons.description_outlined,
                              size: 19,
                              color: claimEnabled ? c.onBrand : c.brand,
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                claimEnabled ? tr('Claim cup run') : (disabledLabel ?? tr('Go online to claim')),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 13.5,
                                  color: claimEnabled ? c.onBrand : c.brand,
                                  fontWeight: claimEnabled ? FontWeight.w700 : FontWeight.w500,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Icon(Icons.chevron_right, size: 18, color: claimEnabled ? c.onBrand : c.brand),
                          ],
                        ),
                ),
              ),
            ),
          ),
          if (alerting) ...[
            const SizedBox(height: 6),
            TextButton(
              onPressed: onSilence,
              child: Text(
                tr('Silence alert'),
                style: TextStyle(color: c.brand, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Empty queue: no box — a centred mascot with slow "radar" rings, the message, and a
/// status pill (waiting for runs when online, a nudge to go online otherwise).
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
    final ring = online ? c.brand : c.textMuted;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
      child: Column(
        children: [
          SizedBox(
            width: 220,
            height: 200,
            child: AnimatedBuilder(
              animation: _radar,
              builder: (_, child) => Stack(
                alignment: Alignment.center,
                children: [
                  if (online && !reduced)
                    for (final phase in [0.0, 0.33, 0.66])
                      Builder(
                        builder: (_) {
                          final t = (_radar.value + phase) % 1.0;
                          return Opacity(
                            opacity: (1 - t) * 0.35,
                            child: Container(
                              width: 120 + 96 * t,
                              height: 120 + 96 * t,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: ring, width: 1.5),
                              ),
                            ),
                          );
                        },
                      ),
                  child!,
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 150,
                    height: 150,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(colors: [ring.withValues(alpha: 0.16), ring.withValues(alpha: 0.04)]),
                    ),
                  ),
                  Opacity(
                    opacity: online ? 1 : 0.55,
                    child: Image.asset('assets/images/rider_mascot.png', height: 104, fit: BoxFit.contain),
                  ),
                  Positioned(
                    left: 4,
                    top: 44,
                    child: _FloatChip(icon: Icons.local_cafe_rounded, color: const Color(0xFFE11D48)),
                  ),
                  Positioned(
                    right: 4,
                    top: 30,
                    child: _FloatChip(icon: Icons.location_on_rounded, color: c.brand),
                  ),
                  Positioned(
                    right: 10,
                    bottom: 22,
                    child: _FloatChip(icon: Icons.inventory_2_rounded, color: c.success),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            tr('Queue is clear'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: c.text),
          ),
          const SizedBox(height: 6),
          Text(
            tr('New cup runs will appear here automatically.'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: c.textMuted, height: 1.4),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.fromLTRB(10, 7, 14, 7),
            decoration: BoxDecoration(
              color: (online ? c.success : c.warning).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(99),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (online)
                  AnimatedBuilder(
                    animation: _radar,
                    builder: (_, _) => Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: c.success.withValues(alpha: reduced ? 1 : 0.45 + 0.55 * (1 - _radar.value)),
                      ),
                    ),
                  )
                else
                  Icon(Icons.power_settings_new_rounded, size: 14, color: c.warning),
                const SizedBox(width: 7),
                Text(
                  online ? tr('Waiting for new runs') : tr('Go online to receive jobs'),
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: online ? c.success : c.warning),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Small white floating icon bubble around the empty-state mascot.
class _FloatChip extends StatelessWidget {
  const _FloatChip({required this.icon, required this.color});
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: context.bc.card,
        boxShadow: const [BoxShadow(color: Color(0x220A2647), blurRadius: 10, offset: Offset(0, 3))],
      ),
      child: Icon(icon, size: 17, color: color),
    );
  }
}

int jobsScheduledMillis(String? iso) => Format.toLocal(iso)?.millisecondsSinceEpoch ?? -1 << 62;
