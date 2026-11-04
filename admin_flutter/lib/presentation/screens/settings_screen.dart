import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../domain/entities/admin.dart';
import '../../domain/entities/admin_session.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

/// Branch settings — port of the web `/admin/settings` for branch admins:
/// online ordering hours, branch open / closed, plus the pickup-editing,
/// weekly stock reset and rider capacity values.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.session, required this.canUpdate});
  final AdminSession session;
  final bool canUpdate;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final Loadable<BranchHours> _hours;
  late final Loadable<AppSettingsInfo> _app;
  late final Loadable<BranchOperatingStatus> _status;

  @override
  void initState() {
    super.initState();
    final repo = context.read<AppContainer>().adminRepository;
    _hours = Loadable(repo.branchHours);
    _app = Loadable(repo.appSettings);
    _status = Loadable(repo.branchOperatingStatus);
  }

  @override
  void dispose() {
    _hours.dispose();
    _app.dispose();
    _status.dispose();
    super.dispose();
  }

  Future<void> _toggleBranch(BranchOperatingStatus s) async {
    final closing = !s.isClosed;
    final ok = await confirmDialog(
      context,
      title: closing ? tr('Close the branch?') : tr('Open the branch?'),
      message: closing
          ? tr('Customers will not be able to place new online orders until you open the branch again.')
          : tr('Customers can place online orders again during ordering hours.'),
      confirmLabel: closing ? tr('Close branch') : tr('Open branch'),
      danger: closing,
      icon: closing ? Icons.door_front_door_outlined : Icons.meeting_room_outlined,
    );
    if (!ok || !mounted) return;
    try {
      await context.read<AppContainer>().adminRepository.setBranchOpen(!closing);
      PosFeedback.success();
      if (mounted) showPosSnack(context, closing ? tr('Branch closed') : tr('Branch opened'), kind: PosSnackKind.success);
      _status.load(silent: true);
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return AdminPageList(
      maxWidth: 900,
      onRefresh: () => Future.wait([_hours.load(silent: true), _app.load(silent: true), _status.load(silent: true)]),
      children: [
        PageHeader(title: tr('Settings'), subtitle: widget.session.branchLabel),
        const SizedBox(height: PosSpacing.md),
        LoadableBuilder(
          value: _status,
          builder: (context, s) => SectionCard(
            title: tr('Branch status'),
            subtitle: s.isClosed
                ? tr('Closed since {t}', {'t': formatShortDateTime(s.closedAt!)})
                : tr('Open — taking online orders during ordering hours'),
            trailing: PosBadge(label: s.isClosed ? tr('Closed') : tr('Open'), color: s.isClosed ? c.dangerText : c.successText),
            child: PosButton(
              label: s.isClosed ? tr('Open branch') : tr('Close branch'),
              icon: s.isClosed ? Icons.meeting_room_outlined : Icons.door_front_door_outlined,
              variant: s.isClosed ? PosButtonVariant.success : PosButtonVariant.danger,
              onPressed: widget.canUpdate ? () => _toggleBranch(s) : null,
            ),
          ),
        ),
        const SizedBox(height: PosSpacing.md),
        LoadableBuilder(
          value: _hours,
          builder: (context, h) => _HoursCard(
            key: ValueKey(h),
            hours: h,
            canUpdate: widget.canUpdate,
            onSaved: () => _hours.load(silent: true),
          ),
        ),
        const SizedBox(height: PosSpacing.md),
        LoadableBuilder(
          value: _app,
          builder: (context, a) => Column(
            children: [
              SectionCard(
                title: tr('Pickup queue — order editing'),
                subtitle: tr('When staff can change pickup orders before pickup is confirmed.'),
                child: Column(
                  children: [
                    _flag(tr('Allow adding items — online payment (paid)'), a.pickupAllowAddItemsPaidOnline),
                    _flag(tr('Allow full edit — cash at counter (unpaid)'), a.pickupAllowEditCashUnpaid),
                  ],
                ),
              ),
              const SizedBox(height: PosSpacing.md),
              SectionCard(
                title: tr('Weekly stock reset schedule'),
                subtitle: tr('The day the branch performs its weekly stock reset.'),
                child: _value(tr('Reset day'), _weekday(a.weeklyResetDay)),
              ),
              if (!widget.session.isPickupOnly) ...[
                const SizedBox(height: PosSpacing.md),
                SectionCard(
                  title: tr('Delivery — rider capacity'),
                  subtitle: tr('Maximum cups one rider carries per delivery group.'),
                  child: _value(tr('Cups per rider'), formatCount(a.maxCupsPerRider)),
                ),
              ],
              const SizedBox(height: PosSpacing.sm),
              InlineNotice(
                message: tr('These values are platform-wide and are changed by head office.'),
                tone: NoticeTone.info,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _flag(String label, bool on) {
    final c = context.pos;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: PosType.body.copyWith(color: c.text, fontSize: 13))),
          PosBadge(label: on ? tr('On') : tr('Off'), color: on ? c.successText : c.textMuted),
        ],
      ),
    );
  }

  Widget _value(String label, String value) {
    final c = context.pos;
    return Row(
      children: [
        Expanded(child: Text(label, style: PosType.body.copyWith(color: c.textMuted, fontSize: 13))),
        Text(value, style: PosType.bodyStrong.copyWith(color: c.text)),
      ],
    );
  }

  String _weekday(int? d) => switch (d) {
    0 => tr('Sunday'),
    1 => tr('Monday'),
    2 => tr('Tuesday'),
    3 => tr('Wednesday'),
    4 => tr('Thursday'),
    5 => tr('Friday'),
    6 => tr('Saturday'),
    _ => tr('Not scheduled'),
  };
}

class _HoursCard extends StatefulWidget {
  const _HoursCard({super.key, required this.hours, required this.canUpdate, required this.onSaved});
  final BranchHours hours;
  final bool canUpdate;
  final VoidCallback onSaved;

  @override
  State<_HoursCard> createState() => _HoursCardState();
}

class _HoursCardState extends State<_HoursCard> {
  late String _open = widget.hours.openTime;
  late String _close = widget.hours.closeTime;
  late String? _onlineStart = widget.hours.onlineStart;
  late String? _onlineStop = widget.hours.onlineStop;
  late final _cutoff = TextEditingController(text: '${widget.hours.pickupCutoffMinutes}');
  bool _busy = false;

  @override
  void dispose() {
    _cutoff.dispose();
    super.dispose();
  }

  TimeOfDay _parse(String? hhmm, TimeOfDay fallback) {
    final parts = (hhmm ?? '').split(':');
    if (parts.length < 2) return fallback;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    return h == null || m == null ? fallback : TimeOfDay(hour: h, minute: m);
  }

  String _fmt(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<String?> _pick(String? current, TimeOfDay fallback) async {
    final t = await showTimePicker(context: context, initialTime: _parse(current, fallback));
    return t == null ? null : _fmt(t);
  }

  Future<void> _save() async {
    final cutoff = int.tryParse(_cutoff.text.trim());
    if (cutoff == null || cutoff < 0 || cutoff > 180) {
      showPosSnack(context, tr('Pickup cutoff must be 0–180 minutes'), kind: PosSnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AppContainer>().adminRepository.saveBranchHours(
        BranchHours(
          storeName: widget.hours.storeName,
          openTime: _open,
          closeTime: _close,
          onlineStart: _onlineStart,
          onlineStop: _onlineStop,
          pickupCutoffMinutes: cutoff,
        ),
      );
      PosFeedback.success();
      if (mounted) showPosSnack(context, tr('Branch ordering hours saved'), kind: PosSnackKind.success);
      widget.onSaved();
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
    if (mounted) setState(() => _busy = false);
  }

  Widget _timeField(String label, String? value, ValueChanged<String?> onChanged, {bool optional = false, TimeOfDay fallback = const TimeOfDay(hour: 9, minute: 0)}) {
    final c = context.pos;
    return InkWell(
      borderRadius: BorderRadius.circular(PosRadius.button),
      onTap: !widget.canUpdate
          ? null
          : () async {
              final v = await _pick(value, fallback);
              if (v != null) setState(() => onChanged(v));
            },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: optional && value != null && widget.canUpdate
              ? IconButton(icon: const Icon(Icons.close_rounded, size: 18), onPressed: () => setState(() => onChanged(null)))
              : Icon(Icons.schedule_rounded, size: 18, color: c.textMuted),
        ),
        child: Text(value ?? tr('Not set'), style: PosType.body.copyWith(color: value == null ? c.textSoft : c.text)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = isTablet(context);
    Widget pair(Widget a, Widget b) => wide
        ? Row(children: [Expanded(child: a), const SizedBox(width: PosSpacing.md), Expanded(child: b)])
        : Column(children: [a, const SizedBox(height: PosSpacing.md), b]);
    final name = widget.hours.storeName;
    return SectionCard(
      title: tr('Online ordering hours'),
      subtitle: name.isEmpty
          ? tr('Control when customers can place pickup and delivery orders on the website.')
          : tr('Control when customers can order from {name} on the website.', {'name': name}),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          pair(
            _timeField(tr('Store open'), _open, (v) => _open = v ?? _open),
            _timeField(tr('Store close'), _close, (v) => _close = v ?? _close, fallback: const TimeOfDay(hour: 23, minute: 0)),
          ),
          const SizedBox(height: PosSpacing.md),
          pair(
            _timeField(tr('Online orders start (optional)'), _onlineStart, (v) => _onlineStart = v, optional: true),
            _timeField(tr('Online orders stop (optional)'), _onlineStop, (v) => _onlineStop = v, optional: true, fallback: const TimeOfDay(hour: 22, minute: 0)),
          ),
          const SizedBox(height: PosSpacing.md),
          TextField(
            controller: _cutoff,
            enabled: widget.canUpdate,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(labelText: tr('Pickup stops before close (minutes)')),
          ),
          if (widget.canUpdate) ...[
            const SizedBox(height: PosSpacing.md),
            PosButton(label: tr('Save hours'), icon: Icons.check_rounded, loading: _busy, onPressed: _save),
          ],
        ],
      ),
    );
  }
}
