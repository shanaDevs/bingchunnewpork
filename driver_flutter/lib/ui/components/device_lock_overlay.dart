import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/device_requirements.dart';
import '../../core/system_settings.dart';
import 'language_switch.dart';
import 'run_kit.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Full-screen blocking overlay when GPS or internet is off — port of DeviceLockOverlay.kt.
/// Covers login, home, jobs, and incoming ride — nothing underneath is tappable.
class DeviceLockLayer extends StatefulWidget {
  const DeviceLockLayer({super.key, required this.requirements});
  final DeviceRequirements requirements;

  @override
  State<DeviceLockLayer> createState() => _DeviceLockLayerState();
}

class _DeviceLockLayerState extends State<DeviceLockLayer> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-read GPS / permission / internet on resume (e.g. after visiting Settings).
    if (state == AppLifecycleState.resumed) widget.requirements.refresh();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.requirements,
      builder: (context, _) {
        final s = widget.requirements.state;
        if (s.isSatisfied) return const SizedBox.shrink();
        return DeviceLockOverlay(state: s, onRecheck: widget.requirements.refresh);
      },
    );
  }
}

/// Lock screen: brand row with an EN / 中文 switch, a pulsing illustration, and a
/// checklist of what's off (GPS, data) with a fix action for each.
class DeviceLockOverlay extends StatefulWidget {
  const DeviceLockOverlay({super.key, required this.state, required this.onRecheck});
  final DeviceRequirementState state;
  final Future<void> Function() onRecheck;

  @override
  State<DeviceLockOverlay> createState() => _DeviceLockOverlayState();
}

class _DeviceLockOverlayState extends State<DeviceLockOverlay> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))
    ..repeat();
  bool _checking = false;

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  DeviceRequirementState get _s => widget.state;

  Future<void> _turnOnGps() async {
    if (!_s.locationPermission) {
      final p = await Geolocator.requestPermission();
      if (p == LocationPermission.deniedForever) await openAppSettings();
    }
    if (!_s.gpsOn) await Geolocator.openLocationSettings();
    await widget.onRecheck();
  }

  Future<void> _turnOnData() async {
    await SystemSettings.openWireless();
    await widget.onRecheck();
  }

  Future<void> _recheck() async {
    setState(() => _checking = true);
    await widget.onRecheck();
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final red = c.error;
    final reduced = MediaQuery.of(context).disableAnimations;
    final top = MediaQuery.paddingOf(context).top;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final gpsOk = !_s.needsGps;
    final dataOk = !_s.needsInternet;
    final missing = (gpsOk ? 0 : 1) + (dataOk ? 0 : 1);

    return Positioned.fill(
      child: Material(
        color: c.background,
        child: Stack(
          children: [
            // Soft blue wash at the top.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 360,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      c.primaryStrong.withValues(alpha: c.isDark ? 0.22 : 0.14),
                      c.background,
                    ],
                  ),
                ),
              ),
            ),
            ListView(
              padding: EdgeInsets.fromLTRB(20, top + 12, 20, bottom + 20),
              children: [
                Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(shape: BoxShape.circle, color: c.card),
                      child: ClipOval(child: Image.asset('assets/images/logo.png', fit: BoxFit.cover)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        tr('QuickDrop Rider'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: c.foreground, fontSize: 15, fontWeight: FontWeight.w800),
                      ),
                    ),
                    const BcLanguageSwitch(),
                  ],
                ),
                const SizedBox(height: 28),
                Center(
                  child: SizedBox(
                    width: 220,
                    height: 200,
                    child: AnimatedBuilder(
                      animation: _pulse,
                      builder: (_, child) => Stack(
                        alignment: Alignment.center,
                        children: [
                          if (!reduced)
                            for (final phase in [0.0, 0.5])
                              Builder(
                                builder: (_) {
                                  final t = (_pulse.value + phase) % 1.0;
                                  return Opacity(
                                    opacity: (1 - t) * 0.4,
                                    child: Container(
                                      width: 132 + 84 * t,
                                      height: 132 + 84 * t,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        border: Border.all(color: red, width: 1.5),
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
                              color: c.card,
                              boxShadow: [BoxShadow(color: red.withValues(alpha: 0.18), blurRadius: 24)],
                            ),
                          ),
                          Image.asset('assets/images/rider_mascot.png', height: 104, fit: BoxFit.contain),
                          Positioned(
                            right: 36,
                            bottom: 22,
                            child: Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: red,
                                border: Border.all(color: c.card, width: 3),
                                boxShadow: [BoxShadow(color: red.withValues(alpha: 0.35), blurRadius: 10)],
                              ),
                              child: Icon(
                                gpsOk ? Icons.wifi_off_rounded : Icons.location_off_rounded,
                                color: Colors.white,
                                size: 24,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  tr('Rider App locked'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.foreground, fontSize: 24, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  tr('Turn these on to keep receiving and tracking rides.'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.mutedForeground, fontSize: 14, height: 1.45),
                ),
                const SizedBox(height: 22),
                RunCard(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                  child: Column(
                    children: [
                      _RequirementRow(
                        icon: Icons.my_location_rounded,
                        title: tr('Location (GPS)'),
                        subtitle: gpsOk ? tr('Location is on') : tr('Needed to find and track your rides'),
                        ok: gpsOk,
                        onAction: _turnOnGps,
                      ),
                      Divider(height: 1, indent: 66, color: c.border),
                      _RequirementRow(
                        icon: Icons.wifi_rounded,
                        title: tr('Mobile data or Wi‑Fi'),
                        subtitle: dataOk ? tr('Connected') : tr('Needed to receive new ride alerts'),
                        ok: dataOk,
                        onAction: _turnOnData,
                      ),
                    ],
                  ),
                ),
                // Play "prominent disclosure": shown in-app before the system location prompt,
                // which only opens after the rider taps the Agree button below.
                if (!_s.locationPermission) ...[const SizedBox(height: 14), const _LocationDisclosure()],
                const SizedBox(height: 22),
                RunPrimaryButton(
                  label: gpsOk
                      ? tr('Turn on Data')
                      : (_s.locationPermission ? tr('Turn on GPS') : tr('Agree & allow location')),
                  icon: gpsOk ? Icons.wifi_rounded : Icons.gps_fixed_rounded,
                  onPressed: gpsOk ? _turnOnData : _turnOnGps,
                ),
                const SizedBox(height: 6),
                Center(
                  child: TextButton.icon(
                    onPressed: _checking ? null : _recheck,
                    style: TextButton.styleFrom(foregroundColor: c.primaryStrong),
                    icon: _checking
                        ? SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: c.primaryStrong),
                          )
                        : const Icon(Icons.refresh_rounded, size: 18),
                    label: Text(
                      missing > 1 ? tr('Check again · {n} items off', {'n': missing}) : tr('Check again'),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// What location we collect, when, and why — Google Play prominent-disclosure text.
/// Collapsed by default; tap the header to expand.
class _LocationDisclosure extends StatefulWidget {
  const _LocationDisclosure();

  @override
  State<_LocationDisclosure> createState() => _LocationDisclosureState();
}

class _LocationDisclosureState extends State<_LocationDisclosure> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final body = TextStyle(color: c.mutedForeground, fontSize: 13, height: 1.45);
    Widget point(String text) => Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('•  ', style: body),
          Expanded(child: Text(text, style: body)),
        ],
      ),
    );
    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        Text(
          tr(
            'QuickDrop Rider collects your location while you are on duty, '
            'even when the app is closed or not in use, to:',
          ),
          style: body,
        ),
        point(tr('send you new delivery jobs from your branch')),
        point(tr('show dispatch and customers your live position during a delivery')),
        point(tr('confirm pickup at the branch and drop-off at each stop')),
        const SizedBox(height: 8),
        Text(
          tr(
            'Location is not collected when you are off duty or signed out. '
            'On Android, an "On duty" notification is shown whenever it is being collected.',
          ),
          style: body,
        ),
      ],
    );
    return RunCard(
      padding: EdgeInsets.zero,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => setState(() => _expanded = !_expanded),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.privacy_tip_outlined, color: c.primaryStrong, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        tr('How QuickDrop Rider uses your location'),
                        style: TextStyle(color: c.foreground, fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                    ),
                    AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: Icon(Icons.expand_more_rounded, color: c.mutedForeground),
                    ),
                  ],
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOut,
                  alignment: Alignment.topCenter,
                  child: _expanded ? details : const SizedBox(width: double.infinity),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RequirementRow extends StatelessWidget {
  const _RequirementRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.ok,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool ok;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final red = c.error;
    final tint = ok ? c.success : red;
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(13)),
            child: Icon(icon, color: tint, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(color: c.foreground, fontSize: 15, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(subtitle, style: TextStyle(color: c.mutedForeground, fontSize: 12.5, height: 1.3)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (ok)
            RunPill(label: tr('On'), color: c.success, icon: Icons.check_circle_rounded)
          else
            Material(
              color: red.withValues(alpha: 0.1),
              shape: StadiumBorder(side: BorderSide(color: red.withValues(alpha: 0.4))),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onAction,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  child: Text(
                    tr('Turn on'),
                    style: TextStyle(color: red, fontSize: 12.5, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
