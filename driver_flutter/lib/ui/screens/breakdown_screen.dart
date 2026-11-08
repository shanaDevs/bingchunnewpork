import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/local_profile.dart';
import '../../l10n/l10n.dart';
import '../../state/jobs_controller.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';
import 'report_breakdown_screen.dart';

/// Breakdown status (QuickDrop breakdown/index.tsx). The server has no status API, so this
/// shows the last report sent from this phone (if any) and the report action.
class BreakdownScreen extends StatefulWidget {
  const BreakdownScreen({super.key});

  @override
  State<BreakdownScreen> createState() => _BreakdownScreenState();
}

class _BreakdownScreenState extends State<BreakdownScreen> {
  @override
  void initState() {
    super.initState();
    LocalProfile.instance.load();
  }

  Future<void> _report(JobsController vm) async {
    BcFeedback.tap();
    final ok = await ReportBreakdownScreen.open(context, onSubmit: vm.reportVehicleFailure);
    if (ok) {
      BcFeedback.success();
      await LocalProfile.instance.recordBreakdown();
    } else {
      BcFeedback.error();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    return QdPage(
      title: tr('Breakdown status'),
      footer: QdPillButton(
        label: tr('Report vehicle breakdown'),
        icon: Icons.build_outlined,
        onPressed: vm.isOnline ? () => _report(vm) : null,
      ),
      children: [
        ListenableBuilder(
          listenable: LocalProfile.instance,
          builder: (context, _) {
            final at = LocalProfile.instance.lastBreakdownAt;
            if (at == null) {
              return QdEmpty(
                icon: Icons.build_outlined,
                title: tr('No breakdown reported'),
                message: tr('If your vehicle breaks down, report it so support can send another rider and knows where to find you.'),
              );
            }
            return QdCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const QdIconTile(Icons.build_outlined),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          tr('Last report sent'),
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground),
                        ),
                      ),
                      QdBadge(tr('Reported'), tone: QdTone.warning, dot: true),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    Format.jobDateTime(at.toIso8601String()),
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    tr('Support has been told your location. The live status of the report is not available in the app. Call support if you need an update.'),
                    style: TextStyle(fontSize: 13, color: c.mutedForeground, height: 1.4),
                  ),
                ],
              ),
            );
          },
        ),
        if (!vm.isOnline) QdFootnote(tr('Go on duty to report a vehicle failure.')),
      ],
    );
  }
}
