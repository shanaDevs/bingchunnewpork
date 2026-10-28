import 'package:bing_chun_customer/utils/loyalty_utils.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('LoyaltySummary', () {
    test('parses the live summary shape and numeric strings', () {
      final summary = LoyaltySummary.fromJson({
        'points': 420,
        'totalSpendLkr': '12500.00',
        'referralBonusPoints': 100,
        'settings': {
          'pointsPerLkr': 0.01,
          'redeemValue': 1,
          'maxRedeemPct': 100,
          'minOrderToEarn': 200,
          'customerRedeemEnabled': true,
          'checkoutRedeemEnabled': true,
        },
        'tiers': [
          {
            'id': 'crystal',
            'name': 'Crystal',
            'minSpendLkr': 15000,
            'emoji': '💠',
            'perk': 'Weekend bonus',
          },
          {
            'id': 'pearl',
            'name': 'Pearl',
            'minSpendLkr': 7500,
            'emoji': '🫧',
            'perk': 'Earn on every order',
          },
        ],
        'redeemRewards': [
          {
            'id': 'topping',
            'title': 'Free Topping',
            'description': 'Any topping',
            'cost': 150,
            'emoji': '🧋',
          },
        ],
        'upcomingOffers': [
          {
            'id': 'weekend',
            'title': 'Weekend Boost',
            'date': 'Sat–Sun',
            'description': 'Extra points',
            'emoji': '✨',
          },
        ],
        'transactions': [
          {
            'id': 'earned',
            'points': 25,
            'type': 'ORDER_EARN',
            'createdAt': '2026-08-26T10:00:00.000Z',
          },
          {
            'id': 'redeemed',
            'points': -10,
            'type': 'REDEEM',
            'createdAt': '2026-08-26T11:00:00.000Z',
          },
        ],
      });

      expect(summary.totalSpendLkr, 12500);
      expect(summary.tiers.map((tier) => tier.id), ['pearl', 'crystal']);
      expect(summary.redeemRewards.single.cost, 150);
      expect(summary.upcomingOffers.single.title, 'Weekend Boost');
      expect(summary.lifetimeEarned, 25);
      expect(summary.lifetimeRedeemed, 10);
      expect(summary.transactions.last.kind, LoyaltyTransactionKind.redeem);
    });

    test('accepts numeric tier ids from API metadata', () {
      final tier = LoyaltyTier.fromJson({
        'id': 101,
        'name': 'Bronze Member',
        'minSpendLkr': '0',
        'emoji': '🥉',
        'perk': 'Starter benefits',
      });

      expect(tier.id, '101');
      expect(tier.name, 'Bronze Member');
    });

    test('does not advertise a referral bonus when API omits it', () {
      final summary = LoyaltySummary.fromJson({
        'points': 25,
        'totalSpendLkr': 1000,
        'settings': <String, dynamic>{},
      });

      expect(summary.referralBonusPoints, 0);
    });
  });

  group('loyaltyTierStyleFor', () {
    const tiers = [
      LoyaltyTier(
        id: 'pearl',
        name: 'Pearl',
        minSpendLkr: 7500,
        emoji: '🫧',
        perk: 'Earn points',
      ),
      LoyaltyTier(
        id: 'crystal',
        name: 'Crystal',
        minSpendLkr: 15000,
        emoji: '💠',
        perk: 'Bonus points',
      ),
      LoyaltyTier(
        id: 'crown',
        name: 'Crown',
        minSpendLkr: 30000,
        emoji: '👑',
        perk: 'Premium benefits',
      ),
    ];

    test('maps the live Pearl, Crystal, and Crown metadata', () {
      expect(loyaltyTierStyleFor(tiers[0], tiers), LoyaltyTierStyle.bronze);
      expect(loyaltyTierStyleFor(tiers[1], tiers), LoyaltyTierStyle.silver);
      expect(loyaltyTierStyleFor(tiers[2], tiers), LoyaltyTierStyle.gold);
    });

    test('normalizes member suffixes, case, and punctuation', () {
      const bronze = LoyaltyTier(
        id: 'BRONZE_MEMBER',
        name: 'Bronze Member',
        minSpendLkr: 0,
        emoji: '🥉',
        perk: '',
      );
      const silver = LoyaltyTier(
        id: 'tier-2',
        name: 'PLATINUM MEMBER',
        minSpendLkr: 100,
        emoji: '🥈',
        perk: '',
      );
      const gold = LoyaltyTier(
        id: 'tier-3',
        name: 'Gold Member',
        minSpendLkr: 200,
        emoji: '🥇',
        perk: '',
      );

      expect(
        loyaltyTierStyleFor(bronze, const [bronze, silver, gold]),
        LoyaltyTierStyle.bronze,
      );
      expect(
        loyaltyTierStyleFor(silver, const [bronze, silver, gold]),
        LoyaltyTierStyle.silver,
      );
      expect(
        loyaltyTierStyleFor(gold, const [bronze, silver, gold]),
        LoyaltyTierStyle.gold,
      );
    });

    test('uses live threshold order for custom names', () {
      const starter = LoyaltyTier(
        id: 'starter',
        name: 'Starter',
        minSpendLkr: 0,
        emoji: '1',
        perk: '',
      );
      const plus = LoyaltyTier(
        id: 'plus',
        name: 'Plus',
        minSpendLkr: 100,
        emoji: '2',
        perk: '',
      );
      const elite = LoyaltyTier(
        id: 'elite',
        name: 'Elite',
        minSpendLkr: 200,
        emoji: '3',
        perk: '',
      );
      const unordered = [elite, starter, plus];

      expect(loyaltyTierStyleFor(starter, unordered), LoyaltyTierStyle.bronze);
      expect(loyaltyTierStyleFor(plus, unordered), LoyaltyTierStyle.silver);
      expect(loyaltyTierStyleFor(elite, unordered), LoyaltyTierStyle.gold);
    });

    test('keeps missing and unpublished tiers neutral', () {
      const outsider = LoyaltyTier(
        id: 'unknown',
        name: 'Unknown',
        minSpendLkr: 999,
        emoji: '?',
        perk: '',
      );

      expect(loyaltyTierStyleFor(null, tiers), LoyaltyTierStyle.neutral);
      expect(loyaltyTierStyleFor(outsider, tiers), LoyaltyTierStyle.neutral);
    });
  });

  group('loyaltyTierProgress', () {
    const tiers = [
      LoyaltyTier(
        id: 'pearl',
        name: 'Pearl',
        minSpendLkr: 7500,
        emoji: '🫧',
        perk: 'Earn points',
      ),
      LoyaltyTier(
        id: 'crystal',
        name: 'Crystal',
        minSpendLkr: 15000,
        emoji: '💠',
        perk: 'Bonus points',
      ),
    ];

    test('tracks progress to the first tier', () {
      final progress = loyaltyTierProgress(3750, tiers);

      expect(progress.currentTier, isNull);
      expect(progress.nextTier?.id, 'pearl');
      expect(progress.remainingSpendLkr, 3750);
      expect(progress.fraction, 0.5);
      expect(
        loyaltyTierStyleFor(progress.currentTier ?? progress.nextTier, tiers),
        LoyaltyTierStyle.bronze,
      );
    });

    test('reports a completed maximum tier', () {
      final progress = loyaltyTierProgress(18000, tiers);

      expect(progress.currentTier?.id, 'crystal');
      expect(progress.nextTier, isNull);
      expect(progress.remainingSpendLkr, 0);
      expect(progress.fraction, 1);
    });
  });
}
