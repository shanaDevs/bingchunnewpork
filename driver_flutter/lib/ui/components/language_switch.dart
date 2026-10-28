import 'package:flutter/material.dart';

import '../../core/runtime_config.dart';
import '../../l10n/l10n.dart';
import '../theme/bc_theme.dart';

/// Compact EN / 中文 switch — changes the whole app language immediately
/// (same setting as Profile → Language). [onDark] gives a translucent white
/// style for use over the blue headers.
class BcLanguageSwitch extends StatelessWidget {
  const BcLanguageSwitch({super.key, this.onDark = false});
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final rc = RuntimeConfig.instance;
    return ListenableBuilder(
      listenable: rc,
      builder: (context, _) => Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: onDark ? Colors.white.withValues(alpha: 0.16) : c.card,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: onDark ? Colors.white.withValues(alpha: 0.28) : c.border),
          boxShadow: onDark || c.cardShadow.a == 0
              ? null
              : [BoxShadow(color: c.cardShadow, blurRadius: 10, offset: const Offset(0, 3))],
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
                  onTap: () => rc.language = lang,
                  child: AnimatedContainer(
                    duration: BcMotion.standard,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: rc.language == lang ? (onDark ? Colors.white : c.brand) : Colors.transparent,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      label,
                      style: TextStyle(
                        color: rc.language == lang
                            ? (onDark ? c.brandDark : Colors.white)
                            : (onDark ? Colors.white.withValues(alpha: 0.85) : c.textMuted),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
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
