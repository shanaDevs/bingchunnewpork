import 'package:bing_chun_customer/models/spin.dart';
import 'package:bing_chun_customer/providers/spin_provider.dart';
import 'package:flutter_test/flutter_test.dart';

SpinOffer _offer(String id) => SpinOffer(
  id: id,
  label: '10% off',
  offerType: 'PERCENTAGE',
  discountValue: 10,
  color: '#307ef2',
  sortOrder: 0,
  minOrderValue: 0,
);

void main() {
  group('Spin API parsing', () {
    test('missing eligibility settings fail closed', () {
      final eligibility = SpinEligibility.fromJson(const {});

      expect(eligibility.enabled, isFalse);
      expect(eligibility.canSpin, isFalse);
      expect(eligibility.reason, isNull);
      expect(eligibility.nextSpinAt, isNull);
    });

    test('nullable and malformed prize fields do not throw', () {
      final result = SpinPlayResult.fromJson({
        'resultId': null,
        'claimCode': null,
        'expiresAt': null,
        'offer': {
          'id': 'gift-1',
          'label': null,
          'description': 42,
          'offerType': 'GIFT',
          'discountValue': '0',
          'imageUrl': null,
          'giftProduct': {
            'id': null,
            'name': null,
            'basePrice': 'invalid',
            'imageUrl': null,
          },
        },
      });

      expect(result.isPrize, isFalse);
      expect(result.claimCode, isNull);
      expect(result.offer.description, isNull);
      expect(result.offer.giftProduct?.imageUrl, isNull);
      expect(result.toClaim(), isNull);
    });

    test('active claim payload without isPrize remains claimable', () {
      final result = SpinPlayResult.fromJson({
        'alreadyClaimed': true,
        'resultId': 'result-1',
        'claimCode': 'SPIN-1234',
        'expiresAt': '2099-01-01T00:00:00.000Z',
        'offer': {
          'id': 'offer-1',
          'label': 'Free delivery',
          'offerType': 'FREE_DELIVERY',
        },
      });

      expect(result.isPrize, isTrue);
      expect(result.toClaim()?.claimCode, 'SPIN-1234');
    });

    test('missing offer cannot create a claim', () {
      final result = SpinPlayResult.fromJson({
        'claimCode': 'SPIN-UNSAFE',
        'expiresAt': '2099-01-01T00:00:00.000Z',
        'offer': null,
      });

      expect(result.offer.isNoPrize, isTrue);
      expect(result.toClaim(), isNull);
    });
  });

  group('Spin entry point visibility', () {
    final offers = [_offer('one'), _offer('two')];
    const eligible = SpinEligibility(enabled: true, canSpin: true);

    test('shows only after settings, eligibility, and hydration agree', () {
      final state = SpinUiState(
        enabled: true,
        offers: offers,
        eligibility: eligible,
        hydrated: true,
      );

      expect(state.canShowTrigger, isTrue);
      expect(state.copyWith(enabled: false).canShowTrigger, isFalse);
      expect(
        state
            .copyWith(
              eligibility: const SpinEligibility(enabled: true, canSpin: false),
            )
            .canShowTrigger,
        isFalse,
      );
      expect(state.copyWith(loading: true).canShowTrigger, isFalse);
    });

    test('active reward hides the trigger', () {
      final state = SpinUiState(
        enabled: true,
        offers: offers,
        eligibility: eligible,
        hydrated: true,
        claim: SpinClaim(
          resultId: 'result-1',
          claimCode: 'SPIN-1234',
          expiresAt: DateTime.utc(2099),
          offer: offers.first,
        ),
      );

      expect(state.canShowTrigger, isFalse);
    });

    test('loyalty journey lock hides the trigger', () {
      final state = SpinUiState(
        enabled: true,
        offers: offers,
        eligibility: const SpinEligibility(
          enabled: true,
          canSpin: false,
          loyaltySpin: SpinLoyaltyProgress(
            enabled: true,
            unlocked: false,
            requiredOrders: 3,
            validOrderCount: 1,
            ordersNeeded: 2,
            minOrderAmount: 1000,
            winChanceNumerator: 1,
            winChanceDenominator: 10,
          ),
        ),
        hydrated: true,
      );

      expect(state.canShowTrigger, isFalse);
    });
  });
}
