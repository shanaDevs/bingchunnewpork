import '../../domain/entities/product.dart';
import '../../../../core/network/api_envelope.dart';
import '../../../../core/utils/media_url.dart';

class ProductDto {
  const ProductDto({
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

  factory ProductDto.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    var categoryId = asString(json['categoryId']) ?? '';
    var categoryName = '';
    var categorySlug = '';
    if (category is Map) {
      categoryId = asString(category['id']) ?? categoryId;
      categoryName = asString(category['name']) ?? '';
      categorySlug = asString(category['slug']) ?? '';
    }

    final availability = json['storeAvailability'];
    Map<String, dynamic>? branch;
    bool? atSelectedStore;
    if (availability is Map) {
      atSelectedStore = asBool(availability['atSelectedStore']);
      final stock = availability['branchStock'];
      if (stock is Map) branch = Map<String, dynamic>.from(stock);
    }

    return ProductDto(
      id: asString(json['id']) ?? '',
      name: asString(json['name']) ?? '',
      slug: asString(json['slug']) ?? '',
      description: asString(json['description']),
      basePrice: asInt(json['basePrice']) ?? 0,
      imageUrl: asString(json['imageUrl']) ?? firstImageUrl(json['imageUrls']),
      tag: asString(json['tag']),
      isAvailable: asBool(json['isAvailable']) ?? true,
      categoryId: categoryId,
      categoryName: categoryName,
      categorySlug: categorySlug,
      avgRating: asDouble(json['avgRating']),
      ratingCount: asInt(json['ratingCount']) ?? 0,
      isOutOfStock: asBool(json['isOutOfStock']) ?? asBool(branch?['isOutOfStock']) ?? false,
      isComingSoon: branch?['isComingSoon'] == true,
      isLowStock: asBool(branch?['isLowStock']) ?? false,
      hasStoreAvailability: availability is Map,
      atSelectedStore: atSelectedStore,
      branchInStock: asBool(branch?['inStock']),
      branchQuantity: asInt(branch?['quantity']),
    );
  }

  Map<String, dynamic> toCacheJson() => {
    'id': id,
    'name': name,
    'slug': slug,
    'description': description,
    'basePrice': basePrice,
    'imageUrl': imageUrl,
    'tag': tag,
    'isAvailable': isAvailable,
    'categoryId': categoryId,
    'category': {
      'id': categoryId,
      'name': categoryName,
      'slug': categorySlug,
    },
    'avgRating': avgRating,
    'ratingCount': ratingCount,
    'isOutOfStock': isOutOfStock,
    if (hasStoreAvailability)
      'storeAvailability': {
        'atSelectedStore': atSelectedStore,
        'branchStock': {
          'inStock': branchInStock,
          'isComingSoon': isComingSoon,
          'isLowStock': isLowStock,
          'isOutOfStock': isOutOfStock,
          'quantity': branchQuantity,
        },
      },
  };

  Product toEntity() => Product(
    id: id,
    name: name,
    slug: slug,
    description: description,
    basePrice: basePrice,
    imageUrl: resolveMediaUrl(imageUrl),
    tag: tag,
    isAvailable: isAvailable,
    categoryId: categoryId,
    categoryName: categoryName,
    categorySlug: categorySlug,
    avgRating: avgRating,
    ratingCount: ratingCount,
    isOutOfStock: isOutOfStock,
    isComingSoon: isComingSoon,
    isLowStock: isLowStock,
    hasStoreAvailability: hasStoreAvailability,
    atSelectedStore: atSelectedStore,
    branchInStock: branchInStock,
    branchQuantity: branchQuantity,
  );
}

String? firstImageUrl(dynamic raw) {
  if (raw is List) {
    for (final item in raw) {
      if (item is String && item.isNotEmpty) return item;
    }
  }
  return null;
}
