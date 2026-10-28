import 'package:flutter/widgets.dart';

import 'zh.dart';

/// App languages. English strings are the lookup keys; [zhStrings] maps them to Chinese.
enum AppLanguage {
  en('en', 'English'),
  zh('zh', '中文');

  const AppLanguage(this.code, this.nativeName);
  final String code;
  final String nativeName;

  Locale get locale => Locale(code);

  static AppLanguage fromCode(String? code) =>
      AppLanguage.values.firstWhere((l) => l.code == code, orElse: () => AppLanguage.en);
}

class L10n {
  L10n._();

  /// Active language; set by RuntimeConfig. Read at call time, so every rebuild picks it up.
  static AppLanguage current = AppLanguage.en;

  static bool get isZh => current == AppLanguage.zh;

  /// Locale passed to intl DateFormat / NumberFormat.
  static String get dateLocale => current.code;

  static const supportedLocales = [Locale('en'), Locale('zh')];

  static String tr(String en, [Map<String, Object?> args = const {}]) {
    var s = isZh ? (zhStrings[en] ?? en) : en;
    if (args.isNotEmpty) {
      args.forEach((k, v) => s = s.replaceAll('{$k}', '${v ?? ''}'));
    }
    return s;
  }

  /// Rebuilds every element in place (state is kept) so text built from [tr] refreshes
  /// right after a language switch, including inside const widgets.
  static void rebuildAll() {
    void mark(Element e) {
      e.markNeedsBuild();
      e.visitChildren(mark);
    }

    WidgetsBinding.instance.rootElement?.visitChildren(mark);
  }
}

/// Translate an English UI string. `{name}` placeholders are filled from [args].
String tr(String en, [Map<String, Object?> args = const {}]) => L10n.tr(en, args);

/// Picks the singular/plural English key by [n], then translates. `{n}` is filled in.
String trn(int n, String one, String other, [Map<String, Object?> args = const {}]) =>
    L10n.tr(n == 1 ? one : other, {'n': n, ...args});
