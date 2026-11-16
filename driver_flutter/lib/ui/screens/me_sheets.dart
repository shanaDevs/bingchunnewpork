import 'dart:io';

import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/runtime_config.dart';
import '../../core/system_settings.dart';
import '../../data/models/driver.dart';
import '../components/buttons.dart';
import '../components/sheet_kit.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Port of ShiftHistorySheet.kt + JobAlertsSheet.kt.

/// Driver's own on/off duty timeline, most recent first.
Future<void> showShiftHistory(BuildContext context, Future<List<DriverShiftEntry>> Function() load) {
  return showBcSheet<void>(context, builder: (_) => _ShiftHistorySheet(load: load));
}

class _ShiftHistorySheet extends StatefulWidget {
  const _ShiftHistorySheet({required this.load});
  final Future<List<DriverShiftEntry>> Function() load;

  @override
  State<_ShiftHistorySheet> createState() => _ShiftHistorySheetState();
}

class _ShiftHistorySheetState extends State<_ShiftHistorySheet> {
  late final Future<List<DriverShiftEntry>> _future = widget.load();

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return FutureBuilder<List<DriverShiftEntry>>(
      future: _future,
      builder: (context, snap) {
        final List<Widget> body;
        if (snap.connectionState != ConnectionState.done) {
          body = [
            Padding(
              padding: const EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator(color: c.brand)),
            ),
          ];
        } else if (snap.hasError) {
          final e = snap.error;
          body = [
            BcSheetCard(
              child: Text(
                e is StateError ? e.message : e?.toString() ?? tr('Could not load shift history'),
                style: TextStyle(color: c.errorSoft, fontSize: 13),
              ),
            ),
          ];
        } else {
          final shifts = snap.data ?? const [];
          body = shifts.isEmpty
              ? [
                  BcSheetCard(
                    padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
                    child: Column(
                      children: [
                        Icon(Icons.event_busy_outlined, color: c.textMuted, size: 32),
                        const SizedBox(height: 8),
                        Text(tr('No shifts yet.'), style: TextStyle(color: c.textMuted, fontSize: 13)),
                      ],
                    ),
                  ),
                ]
              : [
                  _TimelineCard(
                    children: [
                      for (var i = 0; i < shifts.length; i++)
                        _ShiftRow(shift: shifts[i], first: i == 0, last: i == shifts.length - 1),
                    ],
                  ),
                ];
        }
        return BcSheetBody(
          header: BcSheetHeader(
            icon: Icons.schedule_outlined,
            iconBg: c.primarySoft,
            iconTint: c.primaryStrong,
            title: tr('Shift history'),
            subtitle: tr('When you went on and off duty'),
          ),
          children: body,
        );
      },
    );
  }
}

/// Plain rounded card wrapper for a list of rows (timeline lives inside).
class _TimelineCard extends StatelessWidget {
  const _TimelineCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => BcSheetCard(
    padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
  );
}

/// One shift in a vertical timeline: dot + connector, start time, duration chip.
class _ShiftRow extends StatelessWidget {
  const _ShiftRow({required this.shift, required this.first, required this.last});
  final DriverShiftEntry shift;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final ongoing = shift.endedAt == null;
    final dot = ongoing ? c.success : c.brand;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 20,
            child: Column(
              children: [
                Expanded(child: Container(width: 2, color: first ? Colors.transparent : c.border)),
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: dot,
                    border: Border.all(
                      color: dot.withValues(alpha: 0.25),
                      width: 3,
                      strokeAlign: BorderSide.strokeAlignOutside,
                    ),
                  ),
                ),
                Expanded(child: Container(width: 2, color: last ? Colors.transparent : c.border)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    Format.jobDateTime(shift.startedAt),
                    style: TextStyle(color: c.text, fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    ongoing
                        ? tr('Started — still on duty')
                        : tr('Ended {p1}', {'p1': Format.jobDateTime(shift.endedAt)}),
                    style: TextStyle(color: c.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: (ongoing ? c.success : c.brand).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                ongoing ? tr('Ongoing') : Format.duration(shift.durationMinutes),
                style: TextStyle(color: ongoing ? c.success : c.brand, fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Notification reliability, battery optimization bypass, and Android 14 full-screen alerts.
Future<void> showJobAlertsSheet(BuildContext context) =>
    showBcSheet<void>(context, builder: (_) => const _JobAlertsSheet());

class _JobAlertsSheet extends StatefulWidget {
  const _JobAlertsSheet();

  @override
  State<_JobAlertsSheet> createState() => _JobAlertsSheetState();
}

class _JobAlertsSheetState extends State<_JobAlertsSheet> with WidgetsBindingObserver {
  bool _batteryUnrestricted = false;
  bool _canFsi = true;
  bool _fsiOn = RuntimeConfig.instance.fullScreenAlertsEnabled;
  bool _bubbleOn = true;
  bool _bubblePermitted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final battery = await SystemSettings.isIgnoringBatteryOptimizations();
    final fsi = await SystemSettings.canUseFullScreenIntent();
    final bubble = await SystemSettings.quickBubbleStatus();
    if (mounted) {
      setState(() {
        _bubbleOn = bubble.enabled;
        _bubblePermitted = bubble.permitted;
        _batteryUnrestricted = battery;
        _canFsi = fsi;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final dark = c.isDark;
    return BcSheetBody(
      header: BcSheetHeader(
        icon: Icons.notifications_active_outlined,
        iconBg: c.primarySoft,
        iconTint: c.primaryStrong,
        title: tr('Job Alerts & Reliability'),
        subtitle: tr('Never miss incoming delivery rides'),
      ),
      children: [
        if (Platform.isAndroid) ...[
          _AlertOptionCard(
            icon: Icons.battery_alert_outlined,
            iconBg: c.primarySoft,
            iconTint: c.primaryStrong,
            title: tr('Background Running'),
            subtitle: _batteryUnrestricted
                ? tr('Battery optimizations disabled. The app can alert you when minimized.')
                : tr('Android may put the app to sleep and delay new delivery jobs.'),
            done: _batteryUnrestricted,
            actionLabel: _batteryUnrestricted ? tr('Settings') : tr('Allow background running'),
            onAction: () async {
              BcFeedback.tap();
              await SystemSettings.requestIgnoreBatteryOptimizations();
              _refresh();
            },
          ),
          const SizedBox(height: 12),
          _AlertOptionCard(
            icon: Icons.fullscreen,
            iconBg: c.primarySoft,
            iconTint: c.primaryStrong,
            title: tr('Full-Screen Ride Alerts'),
            subtitle: !_fsiOn
                ? tr('Off. New rides will NOT show over the lock screen, only as a small notification. Turn on so you never miss a ride.')
                : _canFsi
                ? tr('Allowed. Incoming jobs can ring over the lock screen immediately.')
                : tr('Permission required to pop up incoming jobs over locked screens.'),
            // Off counts as a problem: locked phones then get no ride screen.
            done: _fsiOn && _canFsi,
            trailing: BcSwitch(
              value: _fsiOn,
              onChanged: (v) {
                BcFeedback.tap();
                RuntimeConfig.instance.fullScreenAlertsEnabled = v;
                setState(() => _fsiOn = v);
              },
            ),
            // Only needed when the rider wants full-screen alerts but Android hasn't allowed them.
            actionLabel: _fsiOn && !_canFsi ? tr('Allow full-screen alerts') : null,
            onAction: () async {
              BcFeedback.tap();
              await SystemSettings.openFullScreenIntentSettings();
            },
          ),
          const SizedBox(height: 12),
          _AlertOptionCard(
            icon: Icons.bubble_chart_outlined,
            iconBg: c.primarySoft,
            iconTint: c.primaryStrong,
            title: tr('Quick Action Bubble'),
            subtitle: !_bubbleOn
                ? tr('Off. No floating Bring It bubble when you leave the app.')
                : _bubblePermitted
                ? tr('On. When you leave the app, a floating Bring It bubble stays on screen. Tap it to return, drag it anywhere, or drop it on ✕ to hide it.')
                : tr('Allow "Display over other apps" so the floating Bring It bubble can show when you leave the app.'),
            done: !_bubbleOn || _bubblePermitted,
            showStatus: _bubbleOn,
            trailing: BcSwitch(
              value: _bubbleOn,
              onChanged: (v) async {
                BcFeedback.tap();
                setState(() => _bubbleOn = v);
                await SystemSettings.setQuickBubbleEnabled(v);
                if (v && !_bubblePermitted) await SystemSettings.openOverlaySettings();
              },
            ),
            actionLabel: _bubbleOn && !_bubblePermitted ? tr('Allow display over other apps') : null,
            onAction: () async {
              BcFeedback.tap();
              await SystemSettings.openOverlaySettings();
            },
          ),
          const SizedBox(height: 12),
        ],
        _AlertOptionCard(
          icon: Icons.notifications_active_outlined,
          iconBg: c.primarySoft,
          iconTint: c.primaryStrong,
          title: tr('System Notification Sounds'),
          subtitle: tr('Ensure Bring It notification channels are set to High Priority with sound.'),
          done: true,
          showStatus: false,
          actionLabel: tr('Open app notification settings'),
          onAction: () {
            BcFeedback.tap();
            SystemSettings.openNotificationSettings();
          },
        ),
        BcSheetLabel(Platform.isIOS ? tr('iPhone tips') : tr('Device tips')),
        BcSheetCard(
          color: dark ? const Color(0xFF16233B) : const Color(0xFFEBF3FD),
          borderColor: dark ? const Color(0xFF1E3A5F) : const Color(0xFFDCE8F8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(shape: BoxShape.circle, color: c.card),
                child: Icon(Icons.smartphone_outlined, color: c.brand, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Platform.isIOS ? 'iPhone' : tr('Xiaomi, Redmi & Samsung Devices'),
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: c.text),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      Platform.isIOS
                          ? tr(
                              '1. Allow notifications and Time Sensitive alerts.\n2. Keep Background App Refresh on for Bring It.\n3. Set Location to "Always" while delivering.',
                            )
                          : tr(
                              '1. Enable \'Autostart\' in Security / App Info.\n2. Set Battery Saver to \'No restrictions\'.\n3. Lock the app in Recent Apps so the OS does not kill it.',
                            ),
                      style: TextStyle(fontSize: 13, color: c.textMuted, height: 19 / 12.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        BcOutlineButton(label: tr('Done'), expand: true, onPressed: () => Navigator.of(context).pop()),
      ],
    );
  }
}

class _AlertOptionCard extends StatelessWidget {
  const _AlertOptionCard({
    required this.icon,
    required this.iconBg,
    required this.iconTint,
    required this.title,
    required this.subtitle,
    required this.done,
    required this.actionLabel,
    required this.onAction,
    this.showStatus = true,
    this.trailing,
  });

  final IconData icon;
  final Color iconBg;
  final Color iconTint;
  final String title;
  final String subtitle;
  final bool done;
  /// No button is shown when null.
  final String? actionLabel;
  final VoidCallback onAction;
  final bool showStatus;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return BcSheetCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(13)),
                child: Icon(icon, color: iconTint, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text),
                    ),
                    if (showStatus) ...[
                      const SizedBox(height: 4),
                      BcStatusChip(ok: done, label: done ? tr('Ready') : tr('Action needed')),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      subtitle,
                      style: TextStyle(fontSize: 13, color: c.textMuted, height: 17 / 12.5),
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            ],
          ),
          if (actionLabel case final label?) ...[
            const SizedBox(height: 14),
            done
                ? BcOutlineButton(label: label, expand: true, onPressed: onAction)
                : BcGradientButton(label: label, onPressed: onAction),
          ],
        ],
      ),
    );
  }
}

/// Brand-styled on/off switch shared by the profile and job-alert settings.
class BcSwitch extends StatelessWidget {
  const BcSwitch({super.key, required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final dark = c.isDark;
    return Switch(
      value: value,
      onChanged: onChanged,
      activeThumbColor: Colors.white,
      activeTrackColor: dark ? c.brand : c.brandDark,
      inactiveThumbColor: dark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
      inactiveTrackColor: dark ? const Color(0xFF334155) : const Color(0xFFCBD5E1),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    );
  }
}
