import '../config/api_config.dart';

String _stringValue(Object? value, [String fallback = '']) {
  return value is String ? value : fallback;
}

String? _nullableString(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

int _intValue(Object? value, [int fallback = 0]) {
  if (value is num) return value.toInt();
  return value is String ? int.tryParse(value) ?? fallback : fallback;
}

bool _boolValue(Object? value, [bool fallback = false]) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    if (value.toLowerCase() == 'true') return true;
    if (value.toLowerCase() == 'false') return false;
  }
  return fallback;
}

DateTime? _dateValue(Object? value) {
  if (value is DateTime) return value;
  return value is String ? DateTime.tryParse(value) : null;
}

Map<String, dynamic>? _jsonMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is! Map) return null;
  final result = <String, dynamic>{};
  for (final entry in value.entries) {
    if (entry.key is String) result[entry.key as String] = entry.value;
  }
  return result;
}

class SpinGiftProduct {
  const SpinGiftProduct({
    required this.id,
    required this.name,
    required this.basePrice,
    this.imageUrl,
    this.slug,
  });

  final String id;
  final String name;
  final int basePrice;
  final String? imageUrl;
  final String? slug;

  factory SpinGiftProduct.fromJson(Map<String, dynamic> json) {
    return SpinGiftProduct(
      id: _stringValue(json['id']),
      name: _stringValue(json['name']),
      basePrice: _intValue(json['basePrice']),
      imageUrl: ApiConfig.resolveAssetUrl(_nullableString(json['imageUrl'])),
      slug: _nullableString(json['slug']),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'basePrice': basePrice,
    if (imageUrl != null) 'imageUrl': imageUrl,
    if (slug != null) 'slug': slug,
  };
}

class SpinOffer {
  const SpinOffer({
    required this.id,
    required this.label,
    required this.offerType,
    required this.discountValue,
    required this.color,
    required this.sortOrder,
    required this.minOrderValue,
    this.description,
    this.giftProductId,
    this.giftProduct,
  });

  final String id;
  final String label;
  final String? description;
  final String offerType;
  final int discountValue;
  final String color;
  final int sortOrder;
  final int minOrderValue;
  final String? giftProductId;
  final SpinGiftProduct? giftProduct;

  bool get isNoPrize => offerType.toUpperCase() == 'NO_PRIZE';
  bool get isPrize => !isNoPrize;
  bool get isGift => offerType.toUpperCase() == 'GIFT';
  bool get isConfigured {
    const supported = {
      'PERCENTAGE',
      'FIXED',
      'FREE_DELIVERY',
      'GIFT',
      'NO_PRIZE',
    };
    return id.trim().isNotEmpty && supported.contains(offerType.toUpperCase());
  }

  /// Web `formatSpinOffer`.
  String get formatted {
    switch (offerType.toUpperCase()) {
      case 'PERCENTAGE':
        return '$discountValue% OFF';
      case 'FIXED':
        return 'LKR $discountValue OFF';
      case 'FREE_DELIVERY':
        return 'Free Delivery';
      case 'GIFT':
        final name = giftProduct?.name;
        return (name != null && name.isNotEmpty) ? 'Free $name' : label;
      case 'NO_PRIZE':
        return 'Try Again';
      default:
        return label;
    }
  }

  /// Web `spinSegmentLines` — [line1, line2?].
  (String, String?) get segmentLines {
    switch (offerType.toUpperCase()) {
      case 'PERCENTAGE':
        return ('$discountValue%', 'OFF');
      case 'FIXED':
        return ('LKR', '$discountValue');
      case 'FREE_DELIVERY':
        return ('FREE', 'DELIVERY');
      case 'NO_PRIZE':
        return ('TRY', 'AGAIN');
      case 'GIFT':
        return ('FREE', 'GIFT');
      default:
        return (label, null);
    }
  }

  factory SpinOffer.fromJson(Map<String, dynamic> json) {
    final gift = _jsonMap(json['giftProduct']);
    return SpinOffer(
      id: _stringValue(json['id']),
      label: _stringValue(json['label'], 'Reward'),
      description: _nullableString(json['description']),
      offerType: _stringValue(json['offerType'], 'NO_PRIZE'),
      discountValue: _intValue(json['discountValue']),
      color: _stringValue(json['color'], '#307ef2'),
      sortOrder: _intValue(json['sortOrder']),
      minOrderValue: _intValue(json['minOrderValue']),
      giftProductId: _nullableString(json['giftProductId']),
      giftProduct: gift == null ? null : SpinGiftProduct.fromJson(gift),
    );
  }

  Map<String, dynamic> toJson() {
    final gift = giftProduct;
    return {
      'id': id,
      'label': label,
      if (description != null) 'description': description,
      'offerType': offerType,
      'discountValue': discountValue,
      'color': color,
      'sortOrder': sortOrder,
      'minOrderValue': minOrderValue,
      if (giftProductId != null) 'giftProductId': giftProductId,
      if (gift != null) 'giftProduct': gift.toJson(),
    };
  }
}

class SpinClaim {
  const SpinClaim({
    required this.resultId,
    required this.claimCode,
    required this.expiresAt,
    required this.offer,
  });

  final String resultId;
  final String claimCode;
  final DateTime expiresAt;
  final SpinOffer offer;

  bool get isExpired => !expiresAt.isAfter(DateTime.now());
  bool get isUsable =>
      !isExpired &&
      claimCode.trim().isNotEmpty &&
      offer.isConfigured &&
      offer.isPrize;

  factory SpinClaim.fromJson(Map<String, dynamic> json) {
    final offer = _jsonMap(json['offer']);
    return SpinClaim(
      resultId: _stringValue(json['resultId']),
      claimCode: _stringValue(json['claimCode']),
      expiresAt:
          _dateValue(json['expiresAt']) ??
          DateTime.fromMillisecondsSinceEpoch(0),
      offer: SpinOffer.fromJson(offer ?? const {}),
    );
  }

  Map<String, dynamic> toJson() => {
    'resultId': resultId,
    'claimCode': claimCode,
    'expiresAt': expiresAt.toIso8601String(),
    'offer': offer.toJson(),
  };
}

class SpinLoyaltyProgress {
  const SpinLoyaltyProgress({
    required this.enabled,
    required this.unlocked,
    required this.requiredOrders,
    required this.validOrderCount,
    required this.ordersNeeded,
    required this.minOrderAmount,
    required this.winChanceNumerator,
    required this.winChanceDenominator,
  });

  final bool enabled;
  final bool unlocked;
  final int requiredOrders;
  final int validOrderCount;
  final int ordersNeeded;
  final int minOrderAmount;
  final int winChanceNumerator;
  final int winChanceDenominator;

  factory SpinLoyaltyProgress.fromJson(Map<String, dynamic> json) {
    return SpinLoyaltyProgress(
      enabled: _boolValue(json['enabled']),
      unlocked: _boolValue(json['unlocked']),
      requiredOrders: _intValue(json['requiredOrders']),
      validOrderCount: _intValue(json['validOrderCount']),
      ordersNeeded: _intValue(json['ordersNeeded']),
      minOrderAmount: _intValue(json['minOrderAmount']),
      winChanceNumerator: _intValue(json['winChanceNumerator'], 1),
      winChanceDenominator: _intValue(json['winChanceDenominator'], 10),
    );
  }
}

class SpinEligibility {
  const SpinEligibility({
    required this.enabled,
    required this.canSpin,
    this.reason,
    this.nextSpinAt,
    this.spinsUsed = 0,
    this.spinsAllowed = 1,
    this.spinsRemaining = 1,
    this.spinDurationSeconds = 8,
    this.spinWindowHours = 24,
    this.loyaltySpin,
  });

  final bool enabled;
  final bool canSpin;
  final String? reason;
  final DateTime? nextSpinAt;
  final int spinsUsed;
  final int spinsAllowed;
  final int spinsRemaining;
  final int spinDurationSeconds;
  final int spinWindowHours;
  final SpinLoyaltyProgress? loyaltySpin;

  bool get shouldShowEntryPoints {
    if (!enabled) return false;
    final journey = loyaltySpin;
    if (journey != null && journey.enabled && !journey.unlocked) return false;
    return canSpin;
  }

  /// Web clamps duration to 3–20s.
  int get spinAnimMs {
    final secs = spinDurationSeconds.clamp(3, 20);
    return secs * 1000;
  }

  factory SpinEligibility.fromJson(Map<String, dynamic> json) {
    final loyalty = _jsonMap(json['loyaltySpin']);
    return SpinEligibility(
      enabled: _boolValue(json['enabled']),
      canSpin: _boolValue(json['canSpin']),
      reason: _nullableString(json['reason']),
      nextSpinAt: _dateValue(json['nextSpinAt']),
      spinsUsed: _intValue(json['spinsUsed']),
      spinsAllowed: _intValue(json['spinsAllowed']),
      spinsRemaining: _intValue(json['spinsRemaining']),
      spinDurationSeconds: _intValue(json['spinDurationSeconds'], 8),
      spinWindowHours: _intValue(json['spinWindowHours'], 24),
      loyaltySpin:
          loyalty == null ? null : SpinLoyaltyProgress.fromJson(loyalty),
    );
  }
}

class SpinPlayResult {
  const SpinPlayResult({
    required this.resultId,
    required this.offer,
    required this.offerIndex,
    this.alreadyClaimed = false,
    this.claimCode,
    this.expiresAt,
    this.isPrize = true,
  });

  final bool alreadyClaimed;
  final String resultId;
  final String? claimCode;
  final DateTime? expiresAt;
  final SpinOffer offer;
  final int offerIndex;
  final bool isPrize;

  factory SpinPlayResult.fromJson(Map<String, dynamic> json) {
    final offer = SpinOffer.fromJson(_jsonMap(json['offer']) ?? const {});
    final claimCode = _nullableString(json['claimCode']);
    return SpinPlayResult(
      alreadyClaimed: _boolValue(json['alreadyClaimed']),
      resultId: _stringValue(json['resultId']),
      claimCode: claimCode,
      expiresAt: _dateValue(json['expiresAt']),
      offer: offer,
      offerIndex: _intValue(json['offerIndex'], -1),
      isPrize: _boolValue(
        json['isPrize'],
        claimCode != null && !offer.isNoPrize,
      ),
    );
  }

  SpinClaim? toClaim() {
    final code = claimCode;
    final exp = expiresAt;
    if (code == null || code.isEmpty || exp == null) return null;
    if (!isPrize || offer.isNoPrize) return null;
    return SpinClaim(
      resultId: resultId,
      claimCode: code,
      expiresAt: exp,
      offer: offer,
    );
  }
}

/// Matches web `SpinWheelModal` rotation math.
abstract final class SpinWheelMath {
  static double segmentAngle(int count) => 360 / (count < 1 ? 1 : count);

  static double targetCenter(int index, int count) {
    final step = segmentAngle(count);
    return index * step + step / 2;
  }

  /// Web: `rotation + extraTurns * 360 + (360 - targetCenter)`.
  static double nextRotation({
    required double currentRotation,
    required int index,
    required int count,
    required int extraTurns,
  }) {
    final center = targetCenter(index, count);
    return currentRotation + extraTurns * 360 + (360 - center);
  }
}
