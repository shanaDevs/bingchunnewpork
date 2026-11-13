class Product {
  const Product({
    required this.id,
    required this.name,
    required this.slug,
    required this.basePrice,
    required this.isAvailable,
    required this.categoryId,
    required this.categoryName,
    required this.categorySlug,
    this.description,
    this.imageUrl,
    this.tag,
    this.avgRating,
    this.ratingCount = 0,
    this.isOutOfStock = false,
    this.isComingSoon = false,
    this.isLowStock = false,
    this.hasStoreAvailability = false,
    this.atSelectedStore,
    this.branchInStock,
    this.branchQuantity,
  });

  static const unboundedQty = 1 << 30;
  static const outOfStockThreshold = 5;
  static const fallbackRating = 4.8;

  final String id;
  final String name;
  final String slug;
  final String? description;
  final int basePrice;
  final String? imageUrl;
  final String? tag;
  final bool isAvailable;
  final String categoryId;
  final String categoryName;
  final String categorySlug;
  final double? avgRating;
  final int ratingCount;
  final bool isOutOfStock;
  final bool isComingSoon;
  final bool isLowStock;
  final bool hasStoreAvailability;
  final bool? atSelectedStore;
  final bool? branchInStock;
  final int? branchQuantity;

  double get displayRating => avgRating ?? fallbackRating;

  /// Max units a customer may order. [branchQuantity] is online-available from the API.
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

  bool get hasBoundedStock =>
      orderableQty > 0 && orderableQty < unboundedQty;

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
}
