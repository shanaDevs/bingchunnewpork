class MenuCategory {
  const MenuCategory({required this.id, required this.name, this.slug = ''});
  final String id;
  final String name;

  /// Branch stock filters by slug.
  final String slug;
}

class Topping {
  const Topping({required this.id, required this.name, required this.extraPrice, required this.isAvailable});
  final String id;
  final String name;
  final double extraPrice;
  final bool isAvailable;
}

class Product {
  const Product({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.basePrice,
    this.description,
    this.imageUrl,
    this.tag,
    this.categoryName,
    this.toppings = const [],
    this.isOutOfStock = false,
  });

  final String id;
  final String categoryId;
  final String name;
  final double basePrice;
  final String? description;
  final String? imageUrl;
  final String? tag;
  final String? categoryName;
  final List<Topping> toppings;
  final bool isOutOfStock;

  List<Topping> get availableToppings => toppings.where((t) => t.isAvailable).toList();

  /// "Bubble Milk Tea" → ("Bubble", "Milk Tea") — the web card shows the first word muted.
  (String lead, String rest) get splitName {
    final idx = name.indexOf(' ');
    if (idx == -1) return ('', name);
    return (name.substring(0, idx), name.substring(idx + 1));
  }
}

class StoreOption {
  const StoreOption({required this.id, required this.name});
  final String id;
  final String name;
}

/// Branch cashier — used by the "processed by" filter on archived orders.
class CashierOption {
  const CashierOption({required this.id, required this.name});
  final String id;
  final String name;
}
