import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../l10n/l10n.dart';
import '../../tracking/location_tracker.dart';
import '../components/bc_dialog.dart';
import '../components/inputs.dart';
import '../components/job_cards.dart';
import '../components/qd_kit.dart';
import '../components/run_kit.dart';
import '../theme/bc_theme.dart';

const _minDescription = 10;

/// The note is stored on the report; keep room for the type prefix.
const _maxDescription = 200;

const _types = <(String, IconData)>[
  ('Flat tyre', Icons.album_outlined),
  ('Engine failure', Icons.settings_outlined),
  ('Battery problem', Icons.battery_alert_outlined),
  ('Accident', Icons.warning_amber_rounded),
  ('Out of fuel', Icons.local_gas_station_outlined),
  ('Other', Icons.help_outline_rounded),
];

/// QuickDrop "Report Breakdown": what happened, a description and the rider's location.
/// With an active job, support reassigns it to another rider. [onSubmit] throws on failure.
class ReportBreakdownScreen extends StatefulWidget {
  const ReportBreakdownScreen({super.key, required this.onSubmit, this.rideLabel});

  final Future<void> Function(String? note) onSubmit;

  /// Active ride's label (e.g. "Ride ID • RIDE-1004"), shown in the notice when set.
  final String? rideLabel;

  /// Opens the screen; true once the breakdown was reported.
  static Future<bool> open(
    BuildContext context, {
    required Future<void> Function(String? note) onSubmit,
    String? rideLabel,
  }) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => ReportBreakdownScreen(onSubmit: onSubmit, rideLabel: rideLabel)),
    );
    return ok ?? false;
  }

  @override
  State<ReportBreakdownScreen> createState() => _ReportBreakdownScreenState();
}

class _ReportBreakdownScreenState extends State<ReportBreakdownScreen> {
  final _description = TextEditingController();
  int? _type;
  bool _attempted = false;
  bool _submitting = false;
  String? _error;
  DriverFix? _fix;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _locate());
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    final fix = await context.read<AppContainer>().locationTracker.getCurrentLocation();
    if (mounted) setState(() => _fix = fix);
  }

  bool get _descriptionValid => _description.text.trim().length >= _minDescription;

  Future<void> _submit() async {
    setState(() => _attempted = true);
    if (_type == null || !_descriptionValid) {
      BcFeedback.error();
      return;
    }
    final confirmed = await showBcConfirm(
      context,
      title: tr('Report breakdown?'),
      message: widget.rideLabel != null
          ? tr('Your active job {ride} will be reassigned to another rider.', {'ride': widget.rideLabel!})
          : tr('Support will be told your location and send another rider.'),
      confirmLabel: tr('Report breakdown'),
      icon: Icons.warning_amber_rounded,
      tone: BcDialogTone.danger,
    );
    if (!confirmed || !mounted) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final note = '${tr(_types[_type!].$1)}: ${_description.text.trim()}';
      await widget.onSubmit(note.length > 250 ? note.substring(0, 250) : note);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      BcFeedback.error();
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e is StateError ? e.message : e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final fix = _fix;
    return PopScope(
      canPop: !_submitting,
      child: Scaffold(
        backgroundColor: c.background,
        resizeToAvoidBottomInset: true,
        body: Column(
          children: [
            QdAppBar(title: tr('Report Breakdown')),
            Expanded(
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(10, 12, 10, 20),
                children: [
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(BcRadius.md)),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline_rounded, color: c.primary, size: 22),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            widget.rideLabel != null
                                ? tr('Your active job {ride} will be reassigned to another rider.', {'ride': widget.rideLabel!})
                                : tr('Support will be told your location and send another rider.'),
                            style: TextStyle(fontSize: 15, height: 1.4, color: c.foreground),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.only(left: 2, bottom: 8),
                    child: Text(
                      tr('What happened?'),
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.foreground),
                    ),
                  ),
                  QdCard(
                    padding: EdgeInsets.zero,
                    outlined: true,
                    child: Column(
                      children: [
                        for (var i = 0; i < _types.length; i++) ...[
                          if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                          InkWell(
                            onTap: _submitting
                                ? null
                                : () {
                                    BcFeedback.tap();
                                    setState(() => _type = i);
                                  },
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                              child: Row(
                                children: [
                                  Icon(_types[i].$2, size: 22, color: c.foreground),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      tr(_types[i].$1),
                                      style: TextStyle(fontSize: 16, color: c.foreground),
                                    ),
                                  ),
                                  BcRadioDot(selected: _type == i, fill: c.primary, onFill: c.primaryForeground),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (_attempted && _type == null)
                    Padding(
                      padding: const EdgeInsets.only(left: 2, top: 6),
                      child: Text(tr('Choose what happened.'), style: TextStyle(fontSize: 13, color: c.errorStrong)),
                    ),
                  const SizedBox(height: 16),
                  BcTextField(
                    controller: _description,
                    label: tr('Description'),
                    placeholder: tr('Describe the problem and whether you are safe.'),
                    maxLines: 4,
                    isError: _attempted && !_descriptionValid,
                    supportingText: _attempted && !_descriptionValid
                        ? tr('Describe the problem in at least {n} characters.', {'n': _minDescription})
                        : null,
                    inputFormatters: [LengthLimitingTextInputFormatter(_maxDescription)],
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.only(left: 2, bottom: 8),
                    child: Text(
                      tr('Your current location'),
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.foreground),
                    ),
                  ),
                  QdCard(
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(BcRadius.md),
                          child: SizedBox(
                            height: 140,
                            child: fix == null
                                ? Container(
                                    color: c.muted,
                                    alignment: Alignment.center,
                                    child: SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: c.primaryStrong),
                                    ),
                                  )
                                : GoogleMap(
                                    initialCameraPosition: CameraPosition(target: LatLng(fix.lat, fix.lng), zoom: 15),
                                    markers: {Marker(markerId: const MarkerId('me'), position: LatLng(fix.lat, fix.lng))},
                                    liteModeEnabled: true,
                                    zoomControlsEnabled: false,
                                    myLocationButtonEnabled: false,
                                    mapToolbarEnabled: false,
                                    compassEnabled: false,
                                  ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.location_on_outlined, color: c.primary, size: 22),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    fix == null
                                        ? tr('Getting your location…')
                                        : '${fix.lat.toStringAsFixed(5)}, ${fix.lng.toStringAsFixed(5)}',
                                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                                  ),
                                  Text(
                                    tr('Your location is shared with support.'),
                                    style: TextStyle(fontSize: 13, color: c.mutedForeground),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    RunNote(icon: Icons.error_outline_rounded, text: _error!, color: c.errorStrong),
                  ],
                ],
              ),
            ),
          ],
        ),
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: c.surface,
            border: Border(top: BorderSide(color: c.border)),
          ),
          padding: EdgeInsets.fromLTRB(10, 10, 10, 10 + MediaQuery.paddingOf(context).bottom),
          child: PillButton(
            label: tr('Report breakdown'),
            icon: Icons.warning_amber_rounded,
            kind: PillKind.error,
            height: 56,
            loading: _submitting,
            onTap: _submit,
          ),
        ),
      ),
    );
  }
}
