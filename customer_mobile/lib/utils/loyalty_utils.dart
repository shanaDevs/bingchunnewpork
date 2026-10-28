double _jsonDouble(Object? value, double fallback) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? fallback;
  return fallback;
}

int _jsonInt(Object? value, int fallback) {
  if (value is num) return value.toInt();
  if (value is String) return double.tryParse(value)?.toInt() ?? fallback;
  return fallback;
}

String _jsonString(Object? value, String fallback) {
  if (value == null) return fallback;
  final text = value.toString().trim();
  return text.isEmpty ? fallback : text;
}

class LoyaltySettings {
  final double pointsPerLkr;
  final double redeemValue;
  final int maxRedeemPct;
  final int minOrderToEarn;
  final bool customerRedeemEnabled;
  final bool checkoutRedeemEnabled;
  final int minPointsToRedeem;

  const LoyaltySettings({
    this.pointsPerLkr = 0.01,
    this.redeemValue = 1.0,
    this.maxRedeemPct = 100,
    this.minOrderToEarn = 200,
    this.customerRedeemEnabled = true,
    this.checkoutRedeemEnabled = true,
    this.minPointsToRedeem = 100,
  });

  factory LoyaltySettings.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const LoyaltySettings();
    return LoyaltySettings(
      pointsPerLkr: _jsonDouble(json['pointsPerLkr'], 0.01),
      redeemValue: _jsonDouble(json['redeemValue'], 1.0),
      maxRedeemPct: _jsonInt(json['maxRedeemPct'], 100),
      minOrderToEarn: _jsonInt(json['minOrderToEarn'], 200),
      customerRedeemEnabled: json['customerRedeemEnabled'] as bool? ?? true,
      checkoutRedeemEnabled: json['checkoutRedeemEnabled'] as bool? ?? true,
      minPointsToRedeem: _jsonInt(json['minPointsToRedeem'], 100),
    );
  }
}

bool isCheckoutRedeemUnlocked({
  required int lifetimePointsEarned,
  required int minPointsToRedeem,
}) {
  if (minPointsToRedeem <= 0) return true;
  return lifetimePointsEarned >= minPointsToRedeem;
}

class LoyaltyTier {
  final String id;
  final String name;
  final int minSpendLkr;
  final String emoji;
  final String perk;
  final String? accent;

  const LoyaltyTier({
    required this.id,
    required this.name,
    required this.minSpendLkr,
    required this.emoji,
    required this.perk,
    this.accent,
  });

  factory LoyaltyTier.fromJson(Map<String, dynamic> json) {
    return LoyaltyTier(
      id: _jsonString(json['id'], ''),
      name: _jsonString(json['name'], 'Member'),
      minSpendLkr: _jsonInt(json['minSpendLkr'], 0),
      emoji: _jsonString(json['emoji'], '⭐'),
      perk: _jsonString(json['perk'], ''),
      accent: json['accent'] == null ? null : _jsonString(json['accent'], ''),
    );
  }
}

enum LoyaltyTierStyle { bronze, silver, gold, neutral }

String _normalizedTierIdentity(String value) {
  return value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '');
}

bool loyaltyTiersMatch(LoyaltyTier? first, LoyaltyTier? second) {
  if (first == null || second == null) return false;
  if (identical(first, second)) return true;

  final firstId = _normalizedTierIdentity(first.id);
  final secondId = _normalizedTierIdentity(second.id);
  if (firstId.isNotEmpty && secondId.isNotEmpty) {
    return firstId == secondId;
  }

  final firstName = _normalizedTierIdentity(first.name);
  final secondName = _normalizedTierIdentity(second.name);
  return firstName.isNotEmpty &&
      firstName == secondName &&
      first.minSpendLkr == second.minSpendLkr;
}

/// Resolves the visual tier without deriving membership from points or balances.
///
/// The API currently publishes Pearl, Crystal, and Crown, while some
/// environments use Bronze, Silver, and Gold labels. Known metadata aliases are
/// preferred; otherwise the tier's position in the live, spend-ordered journey
/// supplies the visual level. A tier absent from that metadata remains neutral.
LoyaltyTierStyle loyaltyTierStyleFor(
  LoyaltyTier? tier,
  List<LoyaltyTier> tiers,
) {
  if (tier == null) return LoyaltyTierStyle.neutral;

  final identity = _normalizedTierIdentity('${tier.id} ${tier.name}');
  if (identity.contains('gold') || identity.contains('crown')) {
    return LoyaltyTierStyle.gold;
  }
  if (identity.contains('silver') ||
      identity.contains('platinum') ||
      identity.contains('crystal')) {
    return LoyaltyTierStyle.silver;
  }
  if (identity.contains('bronze') ||
      identity.contains('copper') ||
      identity.contains('peach') ||
      identity.contains('pearl')) {
    return LoyaltyTierStyle.bronze;
  }

  final orderedTiers = [...tiers]
    ..sort((a, b) => a.minSpendLkr.compareTo(b.minSpendLkr));
  final index = orderedTiers.indexWhere(
    (candidate) => loyaltyTiersMatch(candidate, tier),
  );
  if (index < 0) return LoyaltyTierStyle.neutral;
  if (index == 0) return LoyaltyTierStyle.bronze;
  if (index == 1) return LoyaltyTierStyle.silver;
  return LoyaltyTierStyle.gold;
}

class LoyaltyRedeemReward {
  final String id;
  final String title;
  final String description;
  final int cost;
  final String emoji;
  final String? tag;

  const LoyaltyRedeemReward({
    required this.id,
    required this.title,
    required this.description,
    required this.cost,
    required this.emoji,
    this.tag,
  });

  factory LoyaltyRedeemReward.fromJson(Map<String, dynamic> json) {
    return LoyaltyRedeemReward(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? 'Reward',
      description: json['description'] as String? ?? '',
      cost: _jsonInt(json['cost'], 0),
      emoji: json['emoji'] as String? ?? '🎁',
      tag: json['tag'] as String?,
    );
  }
}

class LoyaltyUpcomingOffer {
  final String id;
  final String title;
  final String date;
  final String description;
  final String emoji;

  const LoyaltyUpcomingOffer({
    required this.id,
    required this.title,
    required this.date,
    required this.description,
    required this.emoji,
  });

  factory LoyaltyUpcomingOffer.fromJson(Map<String, dynamic> json) {
    return LoyaltyUpcomingOffer(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? 'Reward offer',
      date: json['date'] as String? ?? '',
      description: json['description'] as String? ?? '',
      emoji: json['emoji'] as String? ?? '✨',
    );
  }
}

enum LoyaltyTransactionKind { earn, redeem, other }

class LoyaltyTransaction {
  final String id;
  final String? orderId;
  final int points;
  final String type;
  final String? note;
  final DateTime? createdAt;

  const LoyaltyTransaction({
    required this.id,
    this.orderId,
    required this.points,
    required this.type,
    this.note,
    this.createdAt,
  });

  factory LoyaltyTransaction.fromJson(Map<String, dynamic> json) {
    final createdAt = json['createdAt'] as String?;
    return LoyaltyTransaction(
      id: json['id'] as String? ?? '',
      orderId: json['orderId'] as String?,
      points: _jsonInt(json['points'], 0),
      type: json['type'] as String? ?? 'LOYALTY',
      note: json['note'] as String?,
      createdAt: createdAt == null ? null : DateTime.tryParse(createdAt),
    );
  }

  LoyaltyTransactionKind get kind {
    final normalized = type.toUpperCase();
    if (points > 0 || normalized.contains('EARN')) {
      return LoyaltyTransactionKind.earn;
    }
    if (points < 0 || normalized.contains('REDEEM')) {
      return LoyaltyTransactionKind.redeem;
    }
    return LoyaltyTransactionKind.other;
  }

  String get displayType {
    return type
        .toLowerCase()
        .split('_')
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }
}

class LoyaltySummary {
  final int points;
  final int lifetimePointsEarned;
  final bool checkoutRedeemUnlocked;
  final int totalSpendLkr;
  final LoyaltySettings settings;
  final int referralBonusPoints;
  final List<LoyaltyTier> tiers;
  final List<LoyaltyRedeemReward> redeemRewards;
  final List<LoyaltyUpcomingOffer> upcomingOffers;
  final List<LoyaltyTransaction> transactions;

  const LoyaltySummary({
    required this.points,
    this.lifetimePointsEarned = 0,
    this.checkoutRedeemUnlocked = false,
    required this.totalSpendLkr,
    required this.settings,
    required this.referralBonusPoints,
    required this.tiers,
    required this.redeemRewards,
    required this.upcomingOffers,
    required this.transactions,
  });

  factory LoyaltySummary.fromJson(Map<String, dynamic> json) {
    List<T> parseList<T>(
      dynamic value,
      T Function(Map<String, dynamic>) parser,
    ) {
      if (value is! List) return const [];
      return value
          .whereType<Map>()
          .map((item) => parser(Map<String, dynamic>.from(item)))
          .toList(growable: false);
    }

    final settings = LoyaltySettings.fromJson(
      json['settings'] is Map
          ? Map<String, dynamic>.from(json['settings'] as Map)
          : null,
    );
    final lifetimePointsEarned = _jsonInt(json['lifetimePointsEarned'], 0);
    final unlocked = json['checkoutRedeemUnlocked'] as bool? ??
        isCheckoutRedeemUnlocked(
          lifetimePointsEarned: lifetimePointsEarned,
          minPointsToRedeem: settings.minPointsToRedeem,
        );

    final tiers = [...parseList(json['tiers'], LoyaltyTier.fromJson)]
      ..sort((a, b) => a.minSpendLkr.compareTo(b.minSpendLkr));
    return LoyaltySummary(
      points: _jsonInt(json['points'], 0),
      lifetimePointsEarned: lifetimePointsEarned,
      checkoutRedeemUnlocked: unlocked,
      totalSpendLkr: _jsonInt(json['totalSpendLkr'], 0),
      settings: settings,
      // A missing bonus means referral earning is not advertised by the API.
      // This keeps the customer UI from presenting an invented points value.
      referralBonusPoints: _jsonInt(json['referralBonusPoints'], 0),
      tiers: tiers,
      redeemRewards: parseList(
        json['redeemRewards'],
        LoyaltyRedeemReward.fromJson,
      ),
      upcomingOffers: parseList(
        json['upcomingOffers'],
        LoyaltyUpcomingOffer.fromJson,
      ),
      transactions: parseList(
        json['transactions'],
        LoyaltyTransaction.fromJson,
      ),
    );
  }

  static const LoyaltySummary guest = LoyaltySummary(
    points: 0,
    lifetimePointsEarned: 0,
    checkoutRedeemUnlocked: false,
    totalSpendLkr: 0,
    settings: LoyaltySettings(),
    referralBonusPoints: 0,
    tiers: [],
    redeemRewards: [],
    upcomingOffers: [],
    transactions: [],
  );

  int get lifetimeEarned {
    if (lifetimePointsEarned > 0) return lifetimePointsEarned;
    final earned = transactions
        .where((transaction) => transaction.points > 0)
        .fold<int>(0, (sum, transaction) => sum + transaction.points);
    return earned == 0 ? points : earned;
  }

  int get lifetimeRedeemed {
    return transactions
        .where((transaction) => transaction.points < 0)
        .fold<int>(0, (sum, transaction) => sum + transaction.points.abs());
  }
}

class LoyaltyTierProgress {
  final LoyaltyTier? currentTier;
  final LoyaltyTier? nextTier;
  final int remainingSpendLkr;
  final double fraction;

  const LoyaltyTierProgress({
    required this.currentTier,
    required this.nextTier,
    required this.remainingSpendLkr,
    required this.fraction,
  });
}

LoyaltyTierProgress loyaltyTierProgress(
  int totalSpendLkr,
  List<LoyaltyTier> tiers,
) {
  if (tiers.isEmpty) {
    return const LoyaltyTierProgress(
      currentTier: null,
      nextTier: null,
      remainingSpendLkr: 0,
      fraction: 0,
    );
  }

  LoyaltyTier? currentTier;
  var currentIndex = -1;
  for (var i = 0; i < tiers.length; i++) {
    if (totalSpendLkr >= tiers[i].minSpendLkr) {
      currentTier = tiers[i];
      currentIndex = i;
    }
  }

  final nextIndex = currentIndex + 1;
  if (nextIndex >= tiers.length) {
    return LoyaltyTierProgress(
      currentTier: currentTier,
      nextTier: null,
      remainingSpendLkr: 0,
      fraction: 1,
    );
  }

  final nextTier = tiers[nextIndex];
  final floor = currentTier?.minSpendLkr ?? 0;
  final span = nextTier.minSpendLkr - floor;
  final fraction = span <= 0
      ? 1.0
      : ((totalSpendLkr - floor) / span).clamp(0.0, 1.0).toDouble();

  return LoyaltyTierProgress(
    currentTier: currentTier,
    nextTier: nextTier,
    remainingSpendLkr: (nextTier.minSpendLkr - totalSpendLkr)
        .clamp(0, nextTier.minSpendLkr)
        .toInt(),
    fraction: fraction,
  );
}

class CheckoutPointsRedeemResult {
  final int maxPoints;
  final int points;
  final int discountLkr;

  const CheckoutPointsRedeemResult({
    required this.maxPoints,
    required this.points,
    required this.discountLkr,
  });
}

CheckoutPointsRedeemResult calcCheckoutPointsRedeem({
  required int usePoints,
  required int availablePoints,
  double redeemValue = 1.0,
  required int remainingPayable,
}) {
  final safeRedeemValue = redeemValue < 0.01 ? 0.01 : redeemValue;
  final available = availablePoints < 0 ? 0 : availablePoints;
  final requested = usePoints < 0 ? 0 : usePoints;
  final maxDiscountLkr = remainingPayable < 0 ? 0 : remainingPayable;
  final maxPoints = available < (maxDiscountLkr / safeRedeemValue).floor()
      ? available
      : (maxDiscountLkr / safeRedeemValue).floor();
  final points = requested < maxPoints ? requested : maxPoints;
  return CheckoutPointsRedeemResult(
    maxPoints: maxPoints,
    points: points,
    discountLkr: (points * safeRedeemValue).floor(),
  );
}

int estimateLoyaltyPointsEarned(int orderTotalLkr, LoyaltySettings settings) {
  if (orderTotalLkr < settings.minOrderToEarn) return 0;
  return (orderTotalLkr * settings.pointsPerLkr).floor();
}
