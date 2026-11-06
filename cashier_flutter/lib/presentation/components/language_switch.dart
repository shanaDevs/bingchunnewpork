import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../core/runtime_config.dart';
import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';

/// Compact EN / 中文 switch — changes the whole app language immediately
/// (same setting as More → Language). [onDark] gives a translucent white
/// style for use over the indigo hero. Same control as the delivery app.
class PosLanguageSwitch extends StatelessWidget {
  const PosLanguageSwitch({super.key, this.onDark = false});
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final rc = RuntimeConfig.instance;
    return ListenableBuilder(
      listenable: rc,
      builder: (context, _) => Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: onDark ? Colors.white.withValues(alpha: 0.14) : c.card,
          borderRadius: BorderRadius.circular(PosRadius.pill),
          border: Border.all(color: onDark ? Colors.white.withValues(alpha: 0.26) : c.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (lang, label) in [(AppLanguage.en, 'EN'), (AppLanguage.zh, '中文')])
              Semantics(
                button: true,
                selected: rc.language == lang,
                label: lang.nativeName,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    if (rc.language == lang) return;
                    PosFeedback.tap();
                    rc.language = lang;
                  },
                  child: AnimatedContainer(
                    duration: PosMotion.standard,
                    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
                    decoration: BoxDecoration(
                      color: rc.language == lang ? (onDark ? Colors.white : c.brand) : Colors.transparent,
                      borderRadius: BorderRadius.circular(PosRadius.pill),
                    ),
                    child: Text(
                      label,
                      style: PosType.label.copyWith(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                        color: rc.language == lang
                            ? (onDark ? PosColors.sidebarActiveText : Colors.white)
                            : (onDark ? Colors.white.withValues(alpha: 0.85) : c.textMuted),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
