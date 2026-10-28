import 'package:bing_chun_driver/l10n/l10n.dart';
import 'package:bing_chun_driver/l10n/zh.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() => L10n.current = AppLanguage.en);

  test('English returns the key with placeholders filled', () {
    L10n.current = AppLanguage.en;
    expect(tr('Stop {n} · {name}', {'n': '02', 'name': 'Amal'}), 'Stop 02 · Amal');
    expect(trn(1, '{n} stop', '{n} stops'), '1 stop');
    expect(trn(3, '{n} stop', '{n} stops'), '3 stops');
  });

  test('Chinese looks up the translation and falls back to English', () {
    L10n.current = AppLanguage.zh;
    expect(tr('Sign in'), '登录');
    expect(trn(3, '{n} stop', '{n} stops'), '3 个站点');
    expect(tr('Some untranslated text'), 'Some untranslated text');
  });

  test('every Chinese entry keeps the same placeholders as its key', () {
    final ph = RegExp(r'\{\w+\}');
    for (final e in zhStrings.entries) {
      final a = ph.allMatches(e.key).map((m) => m[0]).toList()..sort();
      final b = ph.allMatches(e.value).map((m) => m[0]).toList()..sort();
      expect(b, a, reason: e.key);
    }
  });

  test('language codes round-trip', () {
    expect(AppLanguage.fromCode('zh'), AppLanguage.zh);
    expect(AppLanguage.fromCode(null), AppLanguage.en);
    expect(AppLanguage.fromCode('fr'), AppLanguage.en);
  });
}
