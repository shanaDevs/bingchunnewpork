import '../config/api_config.dart';

class ActivePromo {
  final String code;
  final String? title;
  final String? description;
  final String discountType;
  final int discountValue;
  final int? minOrderValue;
  final String? promotionKind;
  final Map<String, dynamic>? promotionRules;
  final Map<String, dynamic>? cardDesign;
  final int sortOrder;
  final bool showOnHome;
  final List<String> productIds;

  const ActivePromo({
    required this.code,
    this.title,
    this.description,
    required this.discountType,
    required this.discountValue,
    this.minOrderValue,
    this.promotionKind,
    this.promotionRules,
    this.cardDesign,
    this.sortOrder = 0,
    this.showOnHome = true,
    this.productIds = const [],
  });

  factory ActivePromo.fromJson(Map<String, dynamic> json) {
    final rules = _asMap(json['promotionRules']);
    final design = _asMap(json['cardDesign']);
    return ActivePromo(
      code: (json['code'] as String? ?? '').toUpperCase(),
      title: json['title'] as String?,
      description: json['description'] as String?,
      discountType: json['discountType'] as String? ?? 'PERCENTAGE',
      discountValue: (json['discountValue'] as num?)?.toInt() ?? 0,
      minOrderValue: (json['minOrderValue'] as num?)?.toInt(),
      promotionKind: json['promotionKind'] as String?,
      promotionRules: rules,
      cardDesign: design,
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      showOnHome: json['showOnHome'] as bool? ?? true,
      productIds: _productIdsFromRules(rules),
    );
  }

  static Map<String, dynamic>? _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return null;
  }

  static List<String> _productIdsFromRules(Map<String, dynamic>? rules) {
    if (rules == null) return const [];
    final ids = <String>{};
    void takeList(dynamic raw) {
      if (raw is! List) return;
      for (final item in raw) {
        if (item is Map && item['id'] is String) ids.add(item['id'] as String);
      }
    }

    takeList(rules['selectedProducts']);
    takeList(rules['comboProducts']);
    final productId = rules['productId'];
    if (productId is String && productId.isNotEmpty) ids.add(productId);
    final gift = rules['giftProduct'];
    if (gift is Map && gift['id'] is String) ids.add(gift['id'] as String);
    return ids.toList();
  }

  bool get isSpinLinked {
    final kind = (promotionKind ?? '').toUpperCase();
    if (kind.contains('SPIN')) return true;
    final codeUpper = code.toUpperCase();
    return codeUpper.startsWith('SPIN') || codeUpper.contains('WHEEL');
  }

  bool get isFirstOrderOffer {
    final kind = (promotionKind ?? '').toUpperCase();
    if (kind == 'WELCOME' ||
        kind == 'FIRST_ORDER' ||
        kind == 'LOYALTY_OFFER_1' ||
        kind == 'LOYALTY_OFFER_2' ||
        kind == 'LOYALTY_OFFER_2_GIFT') {
      return true;
    }
    final codeUpper = code.toUpperCase();
    return codeUpper == 'LOYALTY-OFFER1' ||
        codeUpper == 'LOYALTY-OFFER2' ||
        codeUpper == 'WELCOME10' ||
        codeUpper.startsWith('WELCOME');
  }

  /// Loyalty campaign Offer 1 or Offer 2 — auto-apply when eligible.
  bool get isLoyaltyCampaignOffer => isFirstOrderOffer;

  String get displayTitle {
    if (title != null && title!.trim().isNotEmpty) return title!.trim();
    return discountLabel;
  }

  String get discountLabel {
    final kind = (promotionKind ?? '').toUpperCase();
    final type = discountType.toUpperCase();
    if (kind == 'FREE_DELIVERY' || type == 'DELIVERY' || code.contains('FREEDELIVERY') || code.contains('DELIVERY')) {
      return 'FREE DELIVERY';
    }
    if (type.contains('PERCENT')) return '$discountValue% OFF';
    return 'LKR $discountValue OFF';
  }

  String get subtitle {
    if (description != null && description!.trim().isNotEmpty) return description!.trim();
    if (minOrderValue != null && minOrderValue! > 0) {
      return 'Orders above LKR $minOrderValue';
    }
    return 'Limited time offer';
  }

  /// Prefer admin card art, then linked product photos, then [fallbackImageUrl].
  String? resolveImageUrl({String? fallbackImageUrl}) {
    final design = cardDesign;
    if (design != null) {
      final bg = design['backgroundImage'];
      if (bg is String && bg.trim().isNotEmpty) {
        return ApiConfig.resolveAssetUrl(bg.trim());
      }
      final elements = design['elements'];
      if (elements is List) {
        for (final el in elements) {
          if (el is Map && el['type'] == 'image') {
            final content = el['content'];
            if (content is String && content.trim().isNotEmpty) {
              return ApiConfig.resolveAssetUrl(content.trim());
            }
          }
        }
      }
    }

    final rules = promotionRules;
    if (rules != null) {
      final banner = rules['bannerImageUrl'];
      if (banner is String && banner.trim().isNotEmpty) {
        return ApiConfig.resolveAssetUrl(banner.trim());
      }
      for (final key in ['selectedProducts', 'comboProducts']) {
        final list = rules[key];
        if (list is List) {
          for (final item in list) {
            if (item is Map) {
              final url = item['imageUrl'];
              if (url is String && url.trim().isNotEmpty) {
                return ApiConfig.resolveAssetUrl(url.trim());
              }
            }
          }
        }
      }
      final gift = rules['giftProduct'];
      if (gift is Map) {
        final url = gift['imageUrl'];
        if (url is String && url.trim().isNotEmpty) {
          return ApiConfig.resolveAssetUrl(url.trim());
        }
      }
    }

    if (fallbackImageUrl != null && fallbackImageUrl.trim().isNotEmpty) {
      return ApiConfig.resolveAssetUrl(fallbackImageUrl.trim());
    }
    return null;
  }
}
