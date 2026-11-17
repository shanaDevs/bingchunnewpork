import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../components/auth_kit.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Shown when the code was right but the number has no rider account —
/// the rider can check the number and retry, or ring customer care.
class RiderNotFoundScreen extends StatelessWidget {
  const RiderNotFoundScreen({super.key, required this.phone});

  /// The verified number, `07XXXXXXXX`.
  final String phone;

  void _backToLogin(BuildContext context) => Navigator.of(context).popUntil((r) => r.isFirst);

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
        onBack: () => _backToLogin(context),
        hero: Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 36),
          child: Column(
            children: [
              BcAuthBadge(icon: Icons.person_off_outlined, tint: c.warning),
              const SizedBox(height: 16),
              BcAuthGreeting(
                center: true,
                title: tr('Rider Not Found'),
                titleSize: 32,
                subtitle: tr(
                  "We couldn't find a rider registered with this mobile number. "
                  'Please check the number, or contact support if you think this is a mistake.',
                ),
              ),
            ],
          ),
        ),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: c.warningSubtle,
                borderRadius: BorderRadius.circular(BcRadius.md),
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
                        Text(tr('Number you entered'), style: BcType.tiny.copyWith(color: c.mutedForeground)),
                        const SizedBox(height: 2),
                        Text(Format.lkMobileDisplay(phone), style: BcType.bodyStrong.copyWith(color: c.foreground)),
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
              label: tr('Try another number'),
              onPressed: () => _backToLogin(context),
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: () => showContactSupportSheet(context),
                child: Text(
                  tr('Contact Support'),
                  style: BcType.caption.copyWith(fontSize: 14, fontWeight: FontWeight.w700, color: c.primaryStrong),
                ),
              ),
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
          Icon(icon, size: 16, color: c.primaryStrong),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: BcType.caption.copyWith(color: c.mutedForeground))),
        ],
      ),
    );
  }
}
