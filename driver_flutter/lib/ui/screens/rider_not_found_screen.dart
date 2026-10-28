import 'package:flutter/material.dart';

import '../../core/endpoints.dart';
import '../../core/format.dart';
import '../../core/intents.dart';
import '../components/auth_kit.dart';
import '../components/buttons.dart';
import '../components/snack.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Shown when the code was right but the number has no rider account —
/// the rider can check the number and retry, or ring customer care.
class RiderNotFoundScreen extends StatelessWidget {
  const RiderNotFoundScreen({super.key, required this.phone});

  /// The verified number, `07XXXXXXXX`.
  final String phone;

  void _backToLogin(BuildContext context) => Navigator.of(context).popUntil((r) => r.isFirst);

  Future<void> _callSupport(BuildContext context) async {
    final error = await Intents.dial(SupportContact.phone);
    if (error != null && context.mounted) showBcSnack(context, error);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return PopScope(
      // System back goes to the number step, not to the spent code screen.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _backToLogin(context);
      },
      child: BcAuthScaffold(
        kicker: tr('Hmm, no match'),
        subtitle: tr('This number is not linked to a Bing Chun rider account.'),
        onBack: () => _backToLogin(context),
        badge: BcAuthBadge(icon: Icons.person_off_outlined, tint: c.warning),
        card: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            BcAuthCardHeader(
              title: tr('Rider Not Found'),
              message: Text(
                tr(
                  "We couldn't find a rider registered with this mobile number. "
                  'Please check the number, or contact customer care if you think this is a mistake.',
                ),
              ),
            ),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: c.warningSubtle,
                borderRadius: BorderRadius.circular(BcRadius.button),
                border: Border.all(color: c.warning.withValues(alpha: 0.35)),
              ),
              child: Row(
                children: [
                  Icon(Icons.phone_iphone_rounded, color: c.warning, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('Number you entered'), style: BcType.tiny.copyWith(color: c.textMuted)),
                        const SizedBox(height: 2),
                        Text(Format.lkMobileDisplay(phone), style: BcType.bodyStrong.copyWith(color: c.text)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _Tip(icon: Icons.check_circle_outline_rounded, text: tr('Use the number your branch registered for you.')),
            _Tip(icon: Icons.support_agent_rounded, text: tr('New rider? Ask your branch manager to add you first.')),
            const SizedBox(height: 18),
            BcAuthButton(
              label: tr('Back to login'),
              icon: Icons.login_rounded,
              onPressed: () => _backToLogin(context),
            ),
            const SizedBox(height: 12),
            BcOutlineButton(
              label: tr('Call customer care · {phone}', {'phone': SupportContact.display}),
              icon: Icons.call_outlined,
              color: c.brand,
              expand: true,
              onPressed: () => _callSupport(context),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tip extends StatelessWidget {
  const _Tip({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: c.brand),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: BcType.caption.copyWith(color: c.textMuted))),
        ],
      ),
    );
  }
}
