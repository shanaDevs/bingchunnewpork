import 'package:bing_chun_customer/core/utils/media_url.dart';
import 'package:bing_chun_customer/core/utils/money.dart';
import 'package:bing_chun_customer/features/catalog/data/dto/product_dto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Money.lkr formats integer rupees', () {
    expect(Money.lkr(450), 'LKR 450');
    expect(Money.lkr(1500), 'LKR 1,500');
  });

  test('resolveMediaUrl prefixes API host for relative paths', () {
    expect(resolveMediaUrl(null), isNull);
    expect(
      resolveMediaUrl('/products/Bobo-Milk-Tea-500u.png'),
      'http://localhost:4000/products/Bobo-Milk-Tea-500u.png',
    );
    expect(
      resolveMediaUrl('https://cdn.example/p.png'),
      'https://cdn.example/p.png',
    );
  });

  test('ProductDto maps list payload fields', () {
    final product = ProductDto.fromJson({
      'id': 'p1',
      'name': 'Bobo Milk Tea',
      'slug': 'bobo-milk-tea',
      'description': 'Classic',
      'basePrice': 650,
      'imageUrl': '/products/Bobo-Milk-Tea-500u.png',
      'tag': 'Popular',
      'isAvailable': true,
      'category': {'id': 'c1', 'name': 'Milk Tea', 'slug': 'milk-tea'},
      'avgRating': 4.8,
      'ratingCount': 12,
    }).toEntity();

    expect(product.name, 'Bobo Milk Tea');
    expect(product.basePrice, 650);
    expect(product.categorySlug, 'milk-tea');
    expect(product.canOrder, isTrue);
    expect(product.imageUrl, contains('/products/Bobo-Milk-Tea-500u.png'));
  });

  test('Coming Soon from branch stock cannot be added', () {
    final product = ProductDto.fromJson({
      'id': 'p2',
      'name': 'New Brew',
      'slug': 'new-brew',
      'basePrice': 500,
      'isAvailable': true,
      'storeAvailability': {
        'atSelectedStore': true,
        'branchStock': {'inStock': false, 'isComingSoon': true, 'quantity': 0},
      },
    }).toEntity();

    expect(product.isComingSoon, isTrue);
    expect(product.canOrder, isFalse);
    expect(product.displayTag, 'Coming Soon');
    expect(product.branchQuantity, 0);
    expect(product.orderableQty, 0);
  });

  test('branchStock.quantity is orderable above the out-of-stock threshold', () {
    final product = ProductDto.fromJson({
      'id': 'p4',
      'name': 'Thai Milk Tea',
      'slug': 'thai-milk-tea',
      'basePrice': 550,
      'isAvailable': true,
      'storeAvailability': {
        'atSelectedStore': true,
        'branchStock': {'inStock': true, 'quantity': 12},
      },
    }).toEntity();

    expect(product.branchQuantity, 12);
    expect(product.hasBoundedStock, isTrue);
    expect(product.orderableQty, 12);
    expect(product.canOrder, isTrue);
  });

  test('remaining qty of 5 is out of stock', () {
    final product = ProductDto.fromJson({
      'id': 'p5',
      'name': 'Matcha Latte',
      'slug': 'matcha-latte',
      'basePrice': 600,
      'isAvailable': false,
      'isOutOfStock': true,
      'storeAvailability': {
        'atSelectedStore': true,
        'branchStock': {
          'inStock': false,
          'isOutOfStock': true,
          'isLowStock': false,
          'quantity': 5,
        },
      },
    }).toEntity();

    expect(product.canOrder, isFalse);
    expect(product.isOutOfStock, isTrue);
    expect(product.isLowStock, isFalse);
    expect(product.orderableQty, 0);
  });

  test('remaining qty of 25 is low stock and still orderable', () {
    final product = ProductDto.fromJson({
      'id': 'p6',
      'name': 'Taro Milk Tea',
      'slug': 'taro-milk-tea',
      'basePrice': 600,
      'isAvailable': true,
      'isOutOfStock': false,
      'storeAvailability': {
        'atSelectedStore': true,
        'branchStock': {
          'inStock': true,
          'isOutOfStock': false,
          'isLowStock': true,
          'quantity': 25,
        },
      },
    }).toEntity();

    expect(product.canOrder, isTrue);
    expect(product.isLowStock, isTrue);
    expect(product.orderableQty, 25);
  });

  test('isAvailable false is out of stock even with remaining qty', () {
    final product = ProductDto.fromJson({
      'id': 'p7',
      'name': 'Brown Sugar Boba',
      'slug': 'brown-sugar-boba',
      'basePrice': 650,
      'isAvailable': false,
      'isOutOfStock': true,
      'storeAvailability': {
        'atSelectedStore': true,
        'branchStock': {
          'inStock': false,
          'isOutOfStock': true,
          'isLowStock': false,
          'quantity': 50,
        },
      },
    }).toEntity();

    expect(product.canOrder, isFalse);
    expect(product.isOutOfStock, isTrue);
    expect(product.isAvailable, isFalse);
  });

  test('low-stock online-available quantity below 5 is still orderable', () {
    final product = ProductDto.fromJson({
      'id': 'p8b',
      'name': 'Brown Sugar Boba Milk Tea',
      'slug': 'brown-sugar-boba-milk-tea',
      'basePrice': 480,
      'isAvailable': true,
      'isOutOfStock': false,
      'storeAvailability': {
        'atSelectedStore': true,
        'branchStock': {
          'inStock': true,
          'isOutOfStock': false,
          'isLowStock': true,
          'quantity': 3,
        },
      },
    }).toEntity();

    expect(product.orderableQty, 3);
    expect(product.canOrder, isTrue);
    expect(product.isLowStock, isTrue);
  });

  test('online-available quantity of 6 is fully orderable', () {
    final product = ProductDto.fromJson({
      'id': 'p8',
      'name': 'Blueberry Chocolate Sundae',
      'slug': 'blueberry-chocolate-sundae',
      'basePrice': 480,
      'isAvailable': true,
      'isOutOfStock': false,
      'storeAvailability': {
        'atSelectedStore': true,
        'branchStock': {
          'inStock': true,
          'isOutOfStock': false,
          'isLowStock': true,
          'quantity': 6,
        },
      },
    }).toEntity();

    expect(product.orderableQty, 6);
    expect(product.canOrder, isTrue);
    expect(product.isLowStock, isTrue);
  });

  test('list payload without isOutOfStock still parses', () {
    final product = ProductDto.fromJson({
      'id': 'p3',
      'name': 'Thai Milk Tea',
      'slug': 'thai-milk-tea',
      'description': null,
      'basePrice': 550,
      'imageUrl': null,
      'tag': 'Popular',
      'isAvailable': true,
      'isOutOfStock': null,
    }).toEntity();

    expect(product.isOutOfStock, isFalse);
    expect(product.canOrder, isTrue);
    expect(product.description, isNull);
  });
}
