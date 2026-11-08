import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:bing_chun_driver/core/offer_outcomes.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await OfferOutcomes.instance.resetForTest();
  });

  test('counts by outcome and period, first outcome per job wins', () async {
    final o = OfferOutcomes.instance;
    final now = DateTime.now();
    expect(o.record('a', OfferOutcome.accepted, at: now), isTrue);
    expect(o.record('a', OfferOutcome.missed, at: now), isFalse);
    o.record('b', OfferOutcome.declined, at: now);
    o.record('c', OfferOutcome.missed, at: now);
    o.record('old', OfferOutcome.accepted, at: now.subtract(const Duration(days: 40)));
    final c = o.counts(from: now.subtract(const Duration(days: 29)));
    expect((c.accepted, c.declined, c.missed, c.total), (1, 1, 1, 3));
    expect(o.counts(from: now.subtract(const Duration(days: 60))).accepted, 2);
    expect(o.counts(from: now.subtract(const Duration(days: 60)), to: now.subtract(const Duration(days: 10))).total, 1);
  });

  test('persists and reloads', () async {
    OfferOutcomes.instance.record('x', OfferOutcome.declined);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await OfferOutcomes.instance.resetForTest();
    await OfferOutcomes.instance.load();
    expect(OfferOutcomes.instance.counts(from: DateTime(2000)).declined, 1);
  });
}
