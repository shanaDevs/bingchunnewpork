import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/endpoints.dart';
import '../../core/feedback.dart';
import '../../l10n/l10n.dart';
import '../screens/terms_screen.dart';
import '../theme/bc_theme.dart';
import 'language_switch.dart';
import 'qd_brand.dart';
import 'qd_kit.dart';
import 'sheet_kit.dart';

/// Sign-in page frame shared by the phone, code and "not a rider" steps (QuickDrop style):
/// the brand blue fading into the page behind a top row (wordmark or back button + language
/// toggle) and the [hero] block, then the [body], with the help footer pinned to the bottom.
class BcAuthScaffold extends StatelessWidget {
  const BcAuthScaffold({
    super.key,
    required this.hero,
    required this.body,
    this.onBack,
    this.onLogoTap,
  });

  /// Greeting / scene shown on the blue fade, under the top row.
  final Widget hero;

  /// Form content on the page background (12-16px side padding is added here).
  final Widget body;

  /// Shows a glass back button instead of the wordmark when set.
  final VoidCallback? onBack;

  /// Tap on the wordmark (hidden debug gesture).
  final VoidCallback? onLogoTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final mq = MediaQuery.of(context);
    final fade = [...c.authFade]..[c.authFade.length - 1] = c.background;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.background,
        body: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight),
              child: IntrinsicHeight(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      padding: EdgeInsets.only(top: mq.padding.top + 8),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: fade,
                          stops: BcColors.authFadeStops,
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: SizedBox(
                              height: 44,
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  if (onBack != null)
                                    _GlassBack(onTap: onBack!)
                                  else
                                    GestureDetector(
                                      behavior: HitTestBehavior.opaque,
                                      onTap: onLogoTap,
                                      child: const QdWordmark(inverse: true),
                                    ),
                                  const BcLanguageSwitch(onDark: true),
                                ],
                              ),
                            ),
                          ),
                          hero,
                        ],
                      ),
                    ),
                    Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: body),
                    const Spacer(),
                    const SizedBox(height: 20),
                    const BcAuthFooter(),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GlassBack extends StatelessWidget {
  const _GlassBack({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: tr('Back'),
    child: GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: 0.2),
          border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
        ),
        child: const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 22),
      ),
    ),
  );
}

/// Icon tile for status steps (not a rider ...).
class BcAuthBadge extends StatelessWidget {
  const BcAuthBadge({super.key, required this.icon, this.tint});

  final IconData icon;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final color = tint ?? c.primary;
    return Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(64 * 0.28),
        color: color.withValues(alpha: 0.14),
      ),
      child: Icon(icon, color: color, size: 32),
    );
  }
}

/// Greeting text block on the blue fade: optional light first line, big title, subtitle.
class BcAuthGreeting extends StatelessWidget {
  const BcAuthGreeting({
    super.key,
    this.lead,
    required this.title,
    this.titleSize = 44,
    this.subtitle,
    this.extra,
    this.center = false,
  });

  final String? lead;
  final String title;
  final double titleSize;
  final String? subtitle;
  final Widget? extra;
  final bool center;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final align = center ? CrossAxisAlignment.center : CrossAxisAlignment.start;
    final ta = center ? TextAlign.center : TextAlign.start;
    return Column(
      crossAxisAlignment: align,
      children: [
        if (lead != null)
          Text(
            lead!,
            textAlign: ta,
            style: BcType.subtitle.copyWith(
              fontFamily: BcFonts.heading,
              fontSize: 22,
              fontWeight: FontWeight.w600,
              height: 28 / 22,
              color: c.heroSubtitle,
            ),
          ),
        Text(
          title,
          textAlign: ta,
          style: BcType.displayHero.copyWith(
            fontFamily: BcFonts.heading,
            fontSize: titleSize,
            fontWeight: FontWeight.w800,
            height: (titleSize + 8) / titleSize,
            letterSpacing: -1.2,
            color: c.heroTitle,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Text(
            subtitle!,
            textAlign: ta,
            style: TextStyle(fontSize: 15, height: 22 / 15, fontWeight: FontWeight.w500, color: c.heroSubtitle),
          ),
        ],
        ?extra,
      ],
    );
  }
}

/// QuickDrop primary action: full-width action-blue pill with a soft blue glow.
class BcAuthButton extends StatelessWidget {
  const BcAuthButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.enabled = true,
    this.icon = Icons.keyboard_double_arrow_right_rounded,
  });

  final String label;
  final bool loading;
  final bool enabled;
  final IconData? icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = enabled && !loading;
    return AnimatedOpacity(
      duration: BcMotion.fast,
      opacity: active || loading ? 1 : 0.5,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(BcRadius.full),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF1677FF).withValues(alpha: c.isDark ? 0.22 : 0.32),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Material(
          color: c.action,
          borderRadius: BorderRadius.circular(BcRadius.full),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: active ? onPressed : null,
            child: SizedBox(
              height: 58,
              child: Center(
                child: loading
                    ? SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: c.actionForeground),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              label,
                              overflow: TextOverflow.ellipsis,
                              style: BcType.button.copyWith(fontSize: 17, color: c.actionForeground),
                            ),
                          ),
                          if (icon != null) ...[
                            const SizedBox(width: 8),
                            Icon(icon, color: c.actionForeground, size: 22),
                          ],
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "Need help? Contact Support • Terms & Privacy", pinned at the bottom of every sign-in step.
class BcAuthFooter extends StatelessWidget {
  const BcAuthFooter({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final link = BcType.caption.copyWith(fontSize: 14, fontWeight: FontWeight.w700, color: c.primaryStrong);
    Widget tap(String label, VoidCallback onTap) => InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(label, style: link)),
    );
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.paddingOf(context).bottom),
      decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        children: [
          Text(tr('Need help?'), style: BcType.caption.copyWith(fontSize: 14, color: c.mutedForeground)),
          tap(tr('Contact Support'), () => showContactSupportSheet(context)),
          Text('•', style: BcType.caption.copyWith(fontSize: 14, color: c.mutedForeground)),
          tap(tr('Terms & Privacy'), () {
            BcFeedback.tap();
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const TermsScreen()));
          }),
        ],
      ),
    );
  }
}

/// Contact Support sheet (works before sign-in): call, WhatsApp, email.
Future<void> showContactSupportSheet(BuildContext context) {
  BcFeedback.tap();
  return showBcSheet<void>(
    context,
    builder: (sheetContext) {
      final c = sheetContext.bc;
      Future<void> open(Uri uri) async {
        BcFeedback.tap();
        final ok = await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
        if (!ok && sheetContext.mounted) {
          ScaffoldMessenger.of(sheetContext).showSnackBar(SnackBar(content: Text(tr('Could not open this on your phone.'))));
        }
      }

      Widget action(IconData icon, String title, String sub, Color tint, Uri uri) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Material(
          color: c.surface,
          borderRadius: BorderRadius.circular(BcRadius.card),
          child: InkWell(
            borderRadius: BorderRadius.circular(BcRadius.card),
            onTap: () => open(uri),
            child: Container(
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(BcRadius.card),
                border: Border.all(color: c.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(color: tint.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(13)),
                    child: Icon(icon, color: tint, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: BcType.bodyStrong.copyWith(color: c.foreground)),
                        Text(sub, style: BcType.caption.copyWith(color: c.mutedForeground)),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: c.iconMuted),
                ],
              ),
            ),
          ),
        ),
      );

      return BcSheetBody(
        header: BcSheetHeader(
          icon: Icons.support_agent_rounded,
          title: tr('Contact Support'),
          subtitle: tr('We are here to help riders'),
        ),
        children: [
          action(Icons.call_rounded, tr('Call'), SupportContact.display, c.call, Uri.parse('tel:${SupportContact.phone}')),
          action(Icons.chat_rounded, 'WhatsApp', tr('Chat with the support team'), c.success, Uri.parse(SupportContact.whatsapp)),
          action(Icons.mail_outline_rounded, tr('Email'), SupportContact.email, c.primary, Uri.parse('mailto:${SupportContact.email}')),
        ],
      );
    },
  );
}
