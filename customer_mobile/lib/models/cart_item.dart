import 'product.dart';

enum ProductSize { REGULAR, LARGE }

extension ProductSizeExtension on ProductSize {
  String get nameString {
    switch (this) {
      case ProductSize.REGULAR:
        return 'REGULAR';
      case ProductSize.LARGE:
        return 'LARGE';
    }
  }

  String get displayString {
    switch (this) {
      case ProductSize.REGULAR:
        return 'Regular';
      case ProductSize.LARGE:
        return 'Large';
    }
  }
}

class CartItem {
  final String? id;
  final Product product;
  final ProductSize size;
  final int quantity;
  final List<Topping> selectedToppings;

  CartItem({
    this.id,
    required this.product,
    this.size = ProductSize.REGULAR,
    this.quantity = 1,
    this.selectedToppings = const [],
  });

  int get unitPrice {
    int price = product.basePrice;
    if (size == ProductSize.LARGE) {
      price += 100;
    }
    for (final topping in selectedToppings) {
      price += topping.extraPrice;
    }
    return price;
  }

  int get totalPrice => unitPrice * quantity;

  CartItem copyWith({
    String? id,
    Product? product,
    ProductSize? size,
    int? quantity,
    List<Topping>? selectedToppings,
  }) {
    return CartItem(
      id: id ?? this.id,
      product: product ?? this.product,
      size: size ?? this.size,
      quantity: quantity ?? this.quantity,
      selectedToppings: selectedToppings ?? this.selectedToppings,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      'productId': product.id,
      'size': size.nameString,
      'quantity': quantity,
      'toppingIds': selectedToppings.map((t) => t.id).toList(),
    };
  }

  factory CartItem.fromJson(Map<String, dynamic> json, Product product) {
    ProductSize parsedSize = ProductSize.REGULAR;
    if (json['size'] == 'LARGE') parsedSize = ProductSize.LARGE;

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

    return CartItem(
      id: json['id'] as String?,
      product: product,
      size: parsedSize,
      quantity: json['quantity'] as int? ?? 1,
      selectedToppings: parsedToppings,
    );
  }
}
