import 'package:flutter/material.dart';

import '../../core/endpoints.dart';
import '../../l10n/l10n.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';

// Placeholder text — replace with the final legal copy.

/// Terms of Use + Privacy Policy, readable before sign-in.
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final terms = [
      tr('You must be an approved QuickDrop rider, registered by your branch, to use this app. Your account is personal: do not share your sign-in or let anyone else ride on it.'),
      tr('Keep your mobile number, name and vehicle details up to date and accurate.'),
      tr('Deliver orders carefully and on time, treat customers and branch staff with respect, and follow the road rules and safety guidance at all times.'),
      tr('Never open, tamper with or keep an order, and report any problem with an order from the app straight away.'),
      tr('Earnings and payouts are calculated and paid by the company according to your agreement with your branch. Contact your branch or support if something looks wrong.'),
      tr('The company may suspend or close an account that breaks these terms or puts people at risk.'),
    ];
    final privacy = [
      tr('Location: while you are online (on duty) the app collects your GPS location, including in the background, so the company can assign and track deliveries. Location is not collected while you are offline.'),
      tr('Data we collect: your mobile number, name, vehicle details, location and your job history.'),
      tr('How it is used: to sign you in, assign and complete deliveries, calculate earnings, keep riders and customers safe, and give you support.'),
      tr('Who sees it: customers can see your name and live location during their delivery. Your data is shared with your branch and the company, and is never sold.'),
      tr('Retention: we keep your data while your account is active and for as long as the law or our records require, then delete or anonymise it.'),
      tr('Security: your data is sent over encrypted connections and access is limited to authorised staff.'),
      tr('Questions or requests about your data: call {phone} or email {email}.', {'phone': SupportContact.display, 'email': SupportContact.email}),
    ];

    return QdPage(
      title: tr('Terms & Privacy'),
      children: [
        _Section(title: tr('Terms of Use'), icon: Icons.gavel_rounded, points: terms),
        const SizedBox(height: 14),
        _Section(title: tr('Privacy Policy'), icon: Icons.privacy_tip_outlined, points: privacy),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.icon, required this.points});

  final String title;
  final IconData icon;
  final List<String> points;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: c.primaryStrong, size: 22),
              const SizedBox(width: 10),
              Text(title, style: BcType.subtitle.copyWith(color: c.foreground)),
            ],
          ),
          const SizedBox(height: 12),
          for (final p in points)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Container(width: 6, height: 6, decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(p, style: BcType.body.copyWith(fontSize: 14, height: 21 / 14, color: c.foreground))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
