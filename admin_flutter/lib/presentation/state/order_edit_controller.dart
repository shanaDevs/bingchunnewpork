import 'package:flutter/foundation.dart';

import '../../domain/entities/menu.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_rules.dart';
import '../../domain/repositories/repositories.dart';

/// Draft line in the edit screen: an existing order item or a newly added product.
class DraftLine {
  DraftLine.existing(OrderLine line)
    : orderItemId = line.id,
      clientId = line.id,
      product = null,
      name = line.productName,
      detail = line.toppings.join(', '),
      unitPrice = line.unitPrice,
      quantity = line.quantity,
      originalQuantity = line.quantity,
      toppings = const [];

  DraftLine.added(Product this.product, this.toppings, this.quantity, this.clientId)
    : orderItemId = null,
      name = product.name,
      detail = toppings.map((t) => t.name).join(', '),
      unitPrice = product.basePrice + toppings.fold<double>(0, (s, t) => s + t.extraPrice),
      originalQuantity = 0;

  final String? orderItemId;
  final String clientId;
  final Product? product;
  final String name;
  final String detail;
  final double unitPrice;
  final List<Topping> toppings;
  final int originalQuantity;
  int quantity;

  bool get isNew => orderItemId == null;

  OrderItemChange toChange() => isNew
      ? NewItemChange(productId: product!.id, quantity: quantity, toppingIds: toppings.map((t) => t.id).toList())
      : ExistingItemChange(orderItemId!, quantity);
}

/// Edit / add items — port of the web AdminOrderEditModal (`PUT /orders/:id/items`).
/// Add-only mode (paid orders) cannot lower existing quantities.
class OrderEditController extends ChangeNotifier {
  OrderEditController(this._menu, this._orders, this.order, this.mode)
    : lines = order.items.map(DraftLine.existing).toList() {
    _loadMenu();
  }

  final MenuRepository _menu;
  final OrderRepository _orders;
  final OrderDetail order;
  final OrderEditMode mode;
  final List<DraftLine> lines;

  List<MenuCategory> categories = const [];
  List<Product> products = const [];
  bool menuLoading = true;
  String? menuError;
  String selectedCategory = 'all';
  String search = '';
  bool saving = false;
  int _seq = 0;

  Future<void> _loadMenu() async {
    try {
      categories = await _menu.categories();
      final storeId = order.storeId;
      products = storeId == null ? const [] : await _menu.products(storeId);
    } catch (e) {
      menuError = e.toString();
    }
    menuLoading = false;
    notifyListeners();
  }

  List<Product> get visibleProducts {
    Iterable<Product> list = products;
    if (selectedCategory != 'all') list = list.where((p) => p.categoryId == selectedCategory);
    if (search.isNotEmpty) list = list.where((p) => p.name.toLowerCase().contains(search));
    return list.toList();
  }

  void selectCategory(String id) {
    selectedCategory = id;
    notifyListeners();
  }

  void setSearch(String s) {
    search = s.trim().toLowerCase();
    notifyListeners();
  }

  static const maxQuantity = 20;

  /// Lowest quantity allowed for [line]: add-only never goes below the original.
  int minQuantity(DraftLine line) => mode == OrderEditMode.addOnly && !line.isNew ? line.originalQuantity : 1;

  /// Existing items can only be deleted in full edit mode; added items always can.
  bool canRemove(DraftLine line) => line.isNew || mode == OrderEditMode.full;

  void setQuantity(DraftLine line, int q) {
    line.quantity = q.clamp(minQuantity(line), maxQuantity);
    notifyListeners();
  }

  void remove(DraftLine line) {
    if (!canRemove(line)) return;
    lines.remove(line);
    notifyListeners();
  }

  /// Same product with the same toppings merges into one new line.
  void addProduct(Product p, List<Topping> toppings, int quantity) {
    final ids = toppings.map((t) => t.id).toSet();
    for (final l in lines) {
      if (l.isNew && l.product!.id == p.id && setEquals(l.toppings.map((t) => t.id).toSet(), ids)) {
        l.quantity = (l.quantity + quantity).clamp(1, maxQuantity);
        notifyListeners();
        return;
      }
    }
    lines.add(DraftLine.added(p, toppings, quantity, 'new-${_seq++}'));
    notifyListeners();
  }

  double get subtotal => lines.fold(0, (s, l) => s + l.unitPrice * l.quantity);
  double get previewTotal => previewOrderTotal(order, subtotal);
  double get previewBalance => previewBalanceDue(order, subtotal, mode);

  bool get changed =>
      lines.length != order.items.length || lines.any((l) => l.isNew || l.quantity != l.originalQuantity);
  bool get hasItems => lines.isNotEmpty;

  Future<OrderDetail?> save() async {
    saving = true;
    notifyListeners();
    try {
      final updated = await _orders.updateItems(order.id, lines.map((l) => l.toChange()).toList());
      return updated ?? await _orders.get(order.orderNumber);
    } finally {
      saving = false;
      notifyListeners();
    }
  }
}
