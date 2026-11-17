import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/runtime_config.dart';
import '../../l10n/l10n.dart';
import '../theme/bc_theme.dart';

/// Two-state language **toggle** (EN ⇄ 中文) with a sliding thumb. One tap on the other
/// side flips the whole app instantly — no bottom sheet. Used on sign-in, the lock screen
/// and Settings (same setting everywhere).
///
/// [onDark] gives a frosted-glass look for use over the blue headers.
class BcLanguageSwitch extends StatelessWidget {
  const BcLanguageSwitch({super.key, this.onDark = false, this.height = 38, this.width});

  final bool onDark;
  final double height;

  /// Total width; defaults to a compact size that fits both labels.
  final double? width;

  static const _langs = [(AppLanguage.en, 'EN'), (AppLanguage.zh, '中文')];

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final rc = RuntimeConfig.instance;
    return ListenableBuilder(
      listenable: rc,
      builder: (context, _) {
        final index = rc.language == AppLanguage.zh ? 1 : 0;
        final w = width ?? 104.0;
        const pad = 3.0;
        final trackColor = onDark ? Colors.white.withValues(alpha: 0.2) : c.muted;
        final thumbColor = onDark ? Colors.white : c.action;
        return Semantics(
          container: true,
          toggled: index == 1,
          label: tr('Language'),
          child: Container(
            width: w,
            height: height,
            padding: const EdgeInsets.all(pad),
            decoration: BoxDecoration(
              color: trackColor,
              borderRadius: BorderRadius.circular(99),
              border: Border.all(color: onDark ? Colors.white.withValues(alpha: 0.3) : c.border),
            ),
            child: Stack(
              children: [
                AnimatedAlign(
                  duration: BcMotion.standard,
                  curve: Curves.easeOutCubic,
                  alignment: index == 0 ? Alignment.centerLeft : Alignment.centerRight,
                  child: FractionallySizedBox(
                    widthFactor: 0.5,
                    heightFactor: 1,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: thumbColor,
                        borderRadius: BorderRadius.circular(99),
                        boxShadow: const [BoxShadow(color: Color(0x33101828), blurRadius: 6, offset: Offset(0, 2))],
                      ),
                    ),
                  ),
                ),
                Row(
                  children: [
                    for (final (lang, label) in _langs)
                      Expanded(
                        child: Semantics(
                          button: true,
                          selected: rc.language == lang,
                          label: lang.nativeName,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () {
                              if (rc.language == lang) return;
                              HapticFeedback.selectionClick();
                              rc.language = lang;
                            },
                            child: Center(
                              child: AnimatedDefaultTextStyle(
                                duration: BcMotion.standard,
                                style: TextStyle(
                                  fontFamily: BcFonts.sans,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: rc.language == lang
                                      ? (onDark ? c.action : c.actionForeground)
                                      : (onDark ? Colors.white.withValues(alpha: 0.9) : c.mutedForeground),
                                ),
                                child: Text(label),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
