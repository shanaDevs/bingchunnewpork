import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/cart_item.dart';
import '../models/product.dart';
import '../services/api_client.dart';
import '../utils/product_pricing.dart';
import 'auth_provider.dart';
import 'fulfillment_provider.dart';
import 'loyalty_float_provider.dart';

class CartState {
  final List<CartItem> items;
  final bool isLoading;
  final String? errorMessage;
  final String? promoCode;
  final int discount;

  CartState({
    required this.items,
    this.isLoading = false,
    this.errorMessage,
    this.promoCode,
    this.discount = 0,
  });

  factory CartState.initial() => CartState(items: []);

  int get subtotal => items.fold(0, (sum, item) => sum + item.totalPrice);
  int get convenienceFee => computeConvenienceFee(subtotal);
  int get total {
    final raw = subtotal + convenienceFee - discount;
    return raw < 0 ? 0 : raw;
  }

  CartState copyWith({
    List<CartItem>? items,
    bool? isLoading,
    Object? errorMessage = _unset,
    Object? promoCode = _unset,
    int? discount,
  }) {
    return CartState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: identical(errorMessage, _unset)
          ? this.errorMessage
          : errorMessage as String?,
      promoCode:
          identical(promoCode, _unset) ? this.promoCode : promoCode as String?,
      discount: discount ?? this.discount,
    );
  }
}

const Object _unset = Object();

final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  final api = ref.watch(apiClientProvider);
  final notifier = CartNotifier(api, ref);
  
  // Listen to auth changes to fetch or clear cart without recreating the CartNotifier
  ref.listen<AuthState>(authProvider, (previous, next) {
    if (next.status == AuthStatus.authenticated && previous?.status != AuthStatus.authenticated) {
      if (notifier.state.items.isEmpty) {
        notifier.fetchCart();
      }
    } else if (next.status == AuthStatus.unauthenticated) {
      notifier.clearLocal();
    }
  }, fireImmediately: true);

  return notifier;
});

class CartNotifier extends StateNotifier<CartState> {
  final ApiClient _api;
  final Ref _ref;

  CartNotifier(this._api, this._ref) : super(CartState.initial());

  Size _screenSize() {
    final views = WidgetsBinding.instance.platformDispatcher.views;
    if (views.isEmpty) return const Size(390, 844);
    final view = views.first;
    return view.physicalSize / view.devicePixelRatio;
  }

  void _triggerLoyaltyFloat({
    required String direction,
    required int subtotalBefore,
    required int subtotalAfter,
  }) {
    // Defer so FAB keys have settled after cart rebuild.
    Future.microtask(() {
      _ref.read(loyaltyFloatProvider.notifier).triggerFromSubtotalChange(
            direction: direction,
            subtotalBefore: subtotalBefore,
            subtotalAfter: subtotalAfter,
            screenSize: _screenSize(),
          );
    });
  }

  void clearLocal() {
    state = CartState.initial();
    _ref.read(loyaltyFloatProvider.notifier).clearBadge();
  }

  Future<void> fetchCart() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final data = await _api.get<Map<String, dynamic>>('/cart');
      final itemsJson = data['items'] as List<dynamic>? ?? [];

      final List<CartItem> parsedItems = [];
      for (final dynamic item in itemsJson) {
        if (item is! Map<String, dynamic>) continue;
        try {
          final prodJson = item['product'];
          if (prodJson is! Map<String, dynamic>) continue;
          final product = Product.fromJson(prodJson);
          parsedItems.add(CartItem.fromJson(item, product));
        } catch (_) {
          // Skip malformed lines so one bad item doesn't empty the whole cup.
        }
      }

      state = state.copyWith(
        items: parsedItems,
        isLoading: false,
        errorMessage: null,
      );
      _ref.read(loyaltyFloatProvider.notifier).syncBadgeFromSubtotal(state.subtotal);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
    }
  }

  int productQtyInCart(
    String productId, {
    String? excludeLineId,
    CartItem? excludeItem,
  }) {
    return state.items.fold<int>(0, (sum, item) {
      if (item.product.id != productId) return sum;
      if (excludeItem != null && identical(item, excludeItem)) return sum;
      if (excludeLineId != null && item.id != null && item.id == excludeLineId) {
        return sum;
      }
      return sum + item.quantity;
    });
  }

  int remainingOrderQty(
    Product product, {
    String? excludeLineId,
    CartItem? excludeItem,
  }) {
    final orderable = product.orderableQty;
    final inCart = productQtyInCart(
      product.id,
      excludeLineId: excludeLineId,
      excludeItem: excludeItem,
    );
    final cap = orderable >= Product.unboundedQty
        ? Product.softMaxQty
        : (orderable < Product.softMaxQty ? orderable : Product.softMaxQty);
    return (cap - inCart).clamp(0, Product.softMaxQty);
  }

  String _stockError(Product product, int orderableQty) {
    if (!product.canOrder || orderableQty <= 0) {
      if (product.isComingSoon) return 'Sorry, this item is coming soon.';
      return 'Sorry, this item is out of stock.';
    }
    return 'Not enough stock at your branch for that quantity.';
  }

  Future<bool> addToCart(
    Product product, {
    ProductSize size = ProductSize.REGULAR,
    required List<Topping> toppings,
    int quantity = 1,
  }) async {
    final subtotalBefore = state.subtotal;
    final orderableQty = product.orderableQty;
    final remaining = remainingOrderQty(product);

    if (!product.canOrder || remaining <= 0) {
      state = state.copyWith(errorMessage: _stockError(product, orderableQty));
      return false;
    }

    final cappedQty = quantity > remaining ? remaining : quantity;
    if (cappedQty <= 0) {
      state = state.copyWith(errorMessage: _stockError(product, orderableQty));
      return false;
    }
    if (cappedQty < quantity) {
      state = state.copyWith(
        errorMessage: 'Not enough stock at your branch for that quantity.',
      );
      return false;
    }

    final auth = _ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      final existingIndex = state.items.indexWhere((item) {
        if (item.product.id != product.id) return false;
        if (item.size != size) return false;
        if (item.selectedToppings.length != toppings.length) return false;

        final list1 = item.selectedToppings.map((t) => t.id).toList()..sort();
        final list2 = toppings.map((t) => t.id).toList()..sort();
        for (int i = 0; i < list1.length; i++) {
          if (list1[i] != list2[i]) return false;
        }
        return true;
      });

      if (existingIndex != -1) {
        final existingItem = state.items[existingIndex];
        final newQuantity = existingItem.quantity + cappedQty;
        final updatedItems = [...state.items];
        updatedItems[existingIndex] = existingItem.copyWith(
          product: product,
          quantity: newQuantity,
        );
        state = state.copyWith(items: updatedItems, errorMessage: null);
      } else {
        final localItem = CartItem(
          product: product,
          size: size,
          quantity: cappedQty,
          selectedToppings: toppings,
        );
        state = state.copyWith(
          items: [...state.items, localItem],
          errorMessage: null,
        );
      }
      _triggerLoyaltyFloat(
        direction: 'add',
        subtotalBefore: subtotalBefore,
        subtotalAfter: state.subtotal,
      );
      return true;
    }

    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      await _api.post(
        '/cart/items',
        {
          'productId': product.id,
          'size': size.nameString,
          'quantity': cappedQty,
          'toppingIds': toppings.map((t) => t.id).toList(),
        },
      );
      // Optimistic local merge so the cup updates even if fetch is slow.
      _mergeLocalAdd(
        product: product,
        size: size,
        toppings: toppings,
        quantity: cappedQty,
      );
      await fetchCart();
      _triggerLoyaltyFloat(
        direction: 'add',
        subtotalBefore: subtotalBefore,
        subtotalAfter: state.subtotal,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  void _mergeLocalAdd({
    required Product product,
    required ProductSize size,
    required List<Topping> toppings,
    required int quantity,
  }) {
    final existingIndex = state.items.indexWhere((item) {
      if (item.product.id != product.id) return false;
      if (item.size != size) return false;
      if (item.selectedToppings.length != toppings.length) return false;
      final list1 = item.selectedToppings.map((t) => t.id).toList()..sort();
      final list2 = toppings.map((t) => t.id).toList()..sort();
      for (int i = 0; i < list1.length; i++) {
        if (list1[i] != list2[i]) return false;
      }
      return true;
    });

    if (existingIndex != -1) {
      final existingItem = state.items[existingIndex];
      final updatedItems = [...state.items];
      updatedItems[existingIndex] = existingItem.copyWith(
        product: product,
        quantity: existingItem.quantity + quantity,
      );
      state = state.copyWith(items: updatedItems, isLoading: false, errorMessage: null);
    } else {
      state = state.copyWith(
        items: [
          ...state.items,
          CartItem(
            product: product,
            size: size,
            quantity: quantity,
            selectedToppings: toppings,
          ),
        ],
        isLoading: false,
        errorMessage: null,
      );
    }
  }

  Future<bool> updateQuantity(CartItem item, int newQuantity) async {
    final subtotalBefore = state.subtotal;
    if (newQuantity > 0) {
      final maxForLine = remainingOrderQty(
            item.product,
            excludeLineId: item.id,
            excludeItem: item,
          ) +
          item.quantity;
      if (newQuantity > maxForLine) {
        state = state.copyWith(
          errorMessage: _stockError(item.product, item.product.orderableQty),
        );
        return false;
      }
    }

    final auth = _ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      // Local updates
      if (newQuantity == 0) {
        state = state.copyWith(
          items: state.items.where((i) => i != item).toList(),
          errorMessage: null,
        );
      } else {
        state = state.copyWith(
          items: state.items
              .map((i) => i == item ? i.copyWith(quantity: newQuantity) : i)
              .toList(),
          errorMessage: null,
        );
      }
      final after = state.subtotal;
      if (after != subtotalBefore) {
        _triggerLoyaltyFloat(
          direction: after > subtotalBefore ? 'add' : 'remove',
          subtotalBefore: subtotalBefore,
          subtotalAfter: after,
        );
      }
      return true;
    }

    if (item.id == null) return false;

    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      await _api.put(
        '/cart/items/${item.id}',
        {'quantity': newQuantity},
      );
      await fetchCart();
      final after = state.subtotal;
      if (after != subtotalBefore) {
        _triggerLoyaltyFloat(
          direction: after > subtotalBefore ? 'add' : 'remove',
          subtotalBefore: subtotalBefore,
          subtotalAfter: after,
        );
      }
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  void setPromoCode(String? code) {
    state = state.copyWith(
      promoCode: code?.trim().toUpperCase(),
      discount: code == null || code.trim().isEmpty ? 0 : state.discount,
    );
  }

  void clearPromo() {
    state = CartState(
      items: state.items,
      isLoading: state.isLoading,
      errorMessage: state.errorMessage,
    );
  }

  Future<bool> applyPromoCode(String code) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final fulfillment = _ref.read(fulfillmentProvider);
      final data = await _api.post<Map<String, dynamic>>(
        '/promos/validate',
        {
          'code': code.trim().toUpperCase(),
          'orderTotal': state.subtotal,
          'channel': 'APP',
          if (fulfillment.orderMode != null) 'orderMode': fulfillment.orderMode,
          if (fulfillment.storeId != null) 'storeId': fulfillment.storeId,
        },
        requireAuth: _ref.read(authProvider).status == AuthStatus.authenticated,
      );
      final discount = (data['discount'] as num?)?.toInt();
      final discountVal = (data['discountValue'] as num?)?.toInt() ?? 0;
      final type = data['discountType'] as String? ?? 'PERCENTAGE';

      int finalDiscount = discount ?? 0;
      if (discount == null) {
        if (type.toUpperCase().contains('PERCENT')) {
          finalDiscount = state.subtotal * discountVal ~/ 100;
        } else {
          finalDiscount = discountVal;
        }
      }

      state = state.copyWith(
        isLoading: false,
        promoCode: code.trim().toUpperCase(),
        discount: finalDiscount,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
        promoCode: code.trim().toUpperCase(),
      );
      // Still keep the code for checkout even if min-order validation fails on empty cart.
      return state.items.isEmpty;
    }
  }

  Future<void> clearCart() async {
    final auth = _ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      clearLocal();
      return;
    }

    state = state.copyWith(isLoading: true);
    try {
      await _api.delete('/cart');
      state = CartState.initial();
      _ref.read(loyaltyFloatProvider.notifier).clearBadge();
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
    }
  }
}
