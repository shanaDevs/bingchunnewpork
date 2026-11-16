import '../config/api_config.dart';

class Topping {
  final String id;
  final String name;
  final int extraPrice;
  final bool isAvailable;

  Topping({
    required this.id,
    required this.name,
    required this.extraPrice,
    required this.isAvailable,
  });

  factory Topping.fromJson(Map<String, dynamic> json) {
    return Topping(
      id: json['id'] as String,
      name: json['name'] as String,
      extraPrice: json['extraPrice'] as int? ?? 0,
      isAvailable: json['isAvailable'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'extraPrice': extraPrice,
      'isAvailable': isAvailable,
    };
  }
}

class ProductTopping {
  final String productId;
  final String toppingId;
  final Topping topping;

  ProductTopping({
    required this.productId,
    required this.toppingId,
    required this.topping,
  });

  factory ProductTopping.fromJson(Map<String, dynamic> json) {
    return ProductTopping(
      productId: json['productId'] as String? ?? '',
      toppingId: json['toppingId'] as String? ?? '',
      topping: Topping.fromJson(json['topping'] as Map<String, dynamic>),
    );
  }
}

class Product {
  /// Matches web/backend: remaining ≤ 5 is treated as out of stock for online orders.
  static const outOfStockThreshold = 5;

  /// Matches web/backend: remaining ≤ 25 is low stock while still orderable.
  static const lowStockThreshold = 25;

  static const unboundedQty = 1 << 30;

  /// Soft per-line cap used when branch stock is unbounded.
  static const softMaxQty = 10;

  final String id;
  final String categoryId;
  final String name;
  final String slug;
  final String? description;
  final int basePrice;
  final String? imageUrl;
  final String? tag;
  final bool isAvailable;
  final bool isCombo;
  final List<Topping> toppings;
  final String? categorySlug;
  final bool isOutOfStock;
  final bool isComingSoon;
  final bool isLowStock;
  final bool hasStoreAvailability;
  final bool? atSelectedStore;
  final bool? branchInStock;
  /// Online-available qty from the menu API (on-hand minus out-of-stock buffer).
  final int? branchQuantity;

  Product({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.slug,
    this.description,
    required this.basePrice,
    String? imageUrl,
    this.tag,
    required this.isAvailable,
    required this.isCombo,
    required this.toppings,
    this.categorySlug,
    this.isOutOfStock = false,
    this.isComingSoon = false,
    this.isLowStock = false,
    this.hasStoreAvailability = false,
    this.atSelectedStore,
    this.branchInStock,
    this.branchQuantity,
  }) : imageUrl = ApiConfig.resolveAssetUrl(imageUrl);

  /// Max units a customer may order at the selected branch.
  /// [branchQuantity] is online-available (on-hand minus the branch OOS buffer).
  int get orderableQty {
    if (!isAvailable || isComingSoon || isOutOfStock) return 0;
    if (!hasStoreAvailability) return unboundedQty;
    if (atSelectedStore != true) return 0;
    if (branchInStock == false) return 0;
    final qty = branchQuantity;
    if (qty == null) return unboundedQty;
    if (qty <= 0) return 0;
    return qty;
  }

  bool get hasBoundedStock => orderableQty > 0 && orderableQty < unboundedQty;

  bool get canOrder {
    if (!isAvailable || isComingSoon || isOutOfStock) return false;
    if (!hasStoreAvailability) return isAvailable;
    if (atSelectedStore != true) return false;
    if (branchInStock == false) return false;
    return orderableQty > 0;
  }

  String? get displayTag {
    if (isComingSoon) return 'Coming Soon';
    if (tag == null || tag!.isEmpty) return null;
    return tag;
  }

  /// Absolute max for a single add/update when considering the soft cap.
  int get maxSelectableQty {
    final orderable = orderableQty;
    if (orderable == 0) return 0;
    if (orderable >= unboundedQty) return softMaxQty;
    return orderable < softMaxQty ? orderable : softMaxQty;
  }

  factory Product.fromJson(Map<String, dynamic> json) {
    // Parse toppings. In backend it is nested as array of objects containing `topping`
    final List<Topping> parsedToppings = [];
    if (json['toppings'] != null) {
      for (final dynamic item in json['toppings']) {
        if (item is Map<String, dynamic> && item['topping'] != null) {
          parsedToppings.add(Topping.fromJson(item['topping'] as Map<String, dynamic>));
        } else if (item is Map<String, dynamic>) {
          parsedToppings.add(Topping.fromJson(item));
        }
      }
    }

    final category = json['category'];
    final categorySlug = category is Map<String, dynamic> ? category['slug'] as String? : null;

    final availability = json['storeAvailability'];
    Map<String, dynamic>? branch;
    bool? atSelectedStore;
    final hasStoreAvailability = availability is Map;
    if (availability is Map) {
      final map = Map<String, dynamic>.from(availability);
      atSelectedStore = map['atSelectedStore'] as bool?;
      final stock = map['branchStock'];
      if (stock is Map) branch = Map<String, dynamic>.from(stock);
    }

    final branchOut = branch?['isOutOfStock'] as bool?;
    final rootOut = json['isOutOfStock'] as bool?;
    // Prefer branch stock when present — root `false` must not hide branch OOS.
    final resolvedOutOfStock = hasStoreAvailability
        ? (branchOut ?? rootOut ?? false)
        : (rootOut ?? branchOut ?? false);

    return Product(
      id: json['id'] as String,
      categoryId: json['categoryId'] as String? ??
          (category is Map<String, dynamic> ? category['id'] as String? ?? '' : ''),
      name: json['name'] as String? ?? '',
      // Cart API returns a slim product (no slug); keep parsing resilient.
      slug: json['slug'] as String? ?? '',
      description: json['description'] as String?,
      basePrice: (json['basePrice'] as num?)?.toInt() ?? 0,
      imageUrl: json['imageUrl'] as String?,
      tag: json['tag'] as String?,
      isAvailable: json['isAvailable'] as bool? ?? true,
      isCombo: json['isCombo'] as bool? ?? false,
      toppings: parsedToppings,
      categorySlug: categorySlug,
      isOutOfStock: resolvedOutOfStock,
      isComingSoon: branch?['isComingSoon'] == true,
      isLowStock: branch?['isLowStock'] as bool? ?? false,
      hasStoreAvailability: hasStoreAvailability,
      atSelectedStore: atSelectedStore,
      branchInStock: branch?['inStock'] as bool?,
      branchQuantity: (branch?['quantity'] as num?)?.toInt(),
    );
  }
}
