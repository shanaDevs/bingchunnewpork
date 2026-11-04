import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../domain/entities/delivery.dart';
import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';

/// "Re-ring driver" on an unclaimed run — port of the web ReRingButton: shows
/// 30 s after the job was published while it is still SCHEDULED with no rider,
/// then cools down 30 s after each ring.
class ReRingButton extends StatefulWidget {
  const ReRingButton({super.key, required this.job});
  final DeliveryJob job;

  static const visibleAfter = Duration(seconds: 30);
  static const cooldown = Duration(seconds: 30);

  /// Unclaimed and old enough to re-ring.
  static bool eligible(DeliveryJob job, DateTime now) {
    final created = job.createdAt;
    return job.status == 'SCHEDULED' &&
        job.driverId == null &&
        job.driverName == null &&
        created != null &&
        now.difference(created) >= visibleAfter;
  }

  @override
  State<ReRingButton> createState() => _ReRingButtonState();
}

class _ReRingButtonState extends State<ReRingButton> {
  late final Timer _tick;
  DateTime _now = DateTime.now();
  DateTime? _lastRung;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _now = DateTime.now()));
  }

  @override
  void dispose() {
    _tick.cancel();
    super.dispose();
  }

  Future<void> _ring() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await context.read<AppContainer>().deliveryRepository.reRing(widget.job.id);
      if (mounted) setState(() => _lastRung = DateTime.now());
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!ReRingButton.eligible(widget.job, _now)) return const SizedBox.shrink();
    final c = context.pos;
    final left = _lastRung == null ? Duration.zero : ReRingButton.cooldown - _now.difference(_lastRung!);
    final coolingDown = left > Duration.zero;
    final label = _sending
        ? tr('Re-ringing…')
        : coolingDown
        ? tr('Rung — again in {n}s', {'n': (left.inMilliseconds / 1000).ceil().clamp(1, 30)})
        : _error != null
        ? tr('Retry re-ring')
        : tr('Re-ring driver');
    const sky = Color(0xFF0369A1);
    final disabled = _sending || coolingDown;
    return Tooltip(
      message: _error ?? '',
      child: OutlinedButton.icon(
        onPressed: disabled ? null : _ring,
        style: OutlinedButton.styleFrom(
          foregroundColor: sky,
          backgroundColor: disabled ? c.surface : const Color(0xFFF0F9FF),
          side: BorderSide(color: disabled ? c.border : const Color(0xFF7DD3FC)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PosRadius.sm)),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          minimumSize: const Size(0, 36),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        icon: _sending
            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.notifications_active_outlined, size: 17),
        label: Text(label, style: PosType.caption.copyWith(fontWeight: FontWeight.w700)),
      ),
    );
  }
}
