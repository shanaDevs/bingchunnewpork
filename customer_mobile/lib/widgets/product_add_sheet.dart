import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/cart_item.dart';
import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../providers/shell_chrome_provider.dart';
import '../services/cart_sfx.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../utils/product_pricing.dart';
import 'pop_quantity_text.dart';
import 'product_radial_image.dart';
import 'wishlist_heart_button.dart';

Future<bool?> showProductAddSheet(BuildContext context, Product product) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useRootNavigator: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.55),
    builder: (_) => ProductAddSheet(initialProduct: product),
  );
}

class ProductAddSheet extends ConsumerStatefulWidget {
  final Product initialProduct;

  const ProductAddSheet({super.key, required this.initialProduct});

  @override
  ConsumerState<ProductAddSheet> createState() => _ProductAddSheetState();
}

class _ProductAddSheetState extends ConsumerState<ProductAddSheet> {
  Product? _product;
  bool _isLoading = false;
  bool _isAdding = false;

  final List<Topping> _selectedToppings = [];
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    _product = widget.initialProduct;
    if (_product!.toppings.isEmpty) {
      _loadProduct();
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) suppressShellChrome(ref);
    });
  }

  @override
  void dispose() {
    restoreShellChrome(ref);
    super.dispose();
  }

  Future<void> _loadProduct() async {
    setState(() => _isLoading = true);
    final api = ref.read(apiClientProvider);
    final storeId = ref.read(fulfillmentProvider).storeId;
    try {
      final path = storeId != null
          ? '/menu/products/${widget.initialProduct.id}?storeId=$storeId'
          : '/menu/products/${widget.initialProduct.id}';
      final prod = await api.get<Product>(
        path,
        requireAuth: false,
        parser: (json) => Product.fromJson(json),
      );
      if (mounted) {
        setState(() {
          _product = prod;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Product? get _prod => _product;

  List<Topping> get _availableToppings =>
      (_prod?.toppings ?? []).where((t) => t.isAvailable).toList();

  int get _unitPrice => _prod == null
      ? 0
      : computeUnitPrice(_prod!, size: ProductSize.REGULAR, toppings: _selectedToppings);

  int get _totalPrice => _unitPrice * _quantity;

  int get _toppingsExtra =>
      _selectedToppings.fold(0, (sum, t) => sum + t.extraPrice);

  int get _maxQty {
    final prod = _prod;
    if (prod == null) return Product.softMaxQty;
    return ref.read(cartProvider.notifier).remainingOrderQty(prod);
  }

  Future<void> _handleAdd() async {
    final prod = _prod;
    if (prod == null || _isAdding) return;

    if (!prod.canOrder) {
      showAppToast(
        context,
        prod.isComingSoon
            ? 'Sorry, this item is coming soon.'
            : 'Sorry, this item is out of stock.',
        isError: true,
      );
      return;
    }

    setState(() => _isAdding = true);
    final success = await ref.read(cartProvider.notifier).addToCart(
          prod,
          size: ProductSize.REGULAR,
          toppings: List<Topping>.from(_selectedToppings),
          quantity: _quantity,
        );
    if (!mounted) return;

    setState(() => _isAdding = false);

    if (success) {
      // Fire-and-forget on a shared player so sheet dispose doesn't kill SFX.
      unawaited(CartSfx.instance.playAdd());
      if (mounted) {
        showAppToast(context, 'Added ${prod.name} to cup', isError: false);
        Navigator.of(context).pop(true);
      }
    } else {
      final error = ref.read(cartProvider).errorMessage ?? 'Failed to add item';
      showAppToast(context, error, isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final toppingCount = _availableToppings.length;
    final sheetInitialSize = toppingCount > 4 ? 0.92 : 0.88;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: DraggableScrollableSheet(
        initialChildSize: sheetInitialSize,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) {
          return Container(
            decoration: BoxDecoration(
              color: bc.cardBg,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              border: Border(top: BorderSide(color: bc.border)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.35),
                  blurRadius: 24,
                  offset: const Offset(0, -6),
                ),
              ],
            ),
            child: _prod == null && _isLoading
                ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
                : Column(
                    children: [
                      const SizedBox(height: 10),
                      Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: bc.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      Expanded(
                        child: ListView(
                          controller: scrollController,
                          padding: EdgeInsets.fromLTRB(20, 16, 20, 12 + safeBottom),
                          children: [
                            _buildHeader(onSurface),
                            const SizedBox(height: 20),
                            _buildPriceBreakdown(onSurface),
                            if (_availableToppings.isNotEmpty) ...[
                              const SizedBox(height: 20),
                              _buildSectionTitle('Toppings'),
                              const SizedBox(height: 8),
                              ..._availableToppings.map(_buildToppingTile),
                            ],
                            const SizedBox(height: 8),
                          ],
                        ),
                      ),
                      _buildBottomBar(onSurface, safeBottom),
                    ],
                  ),
          );
        },
      ),
    );
  }

  Widget _buildHeader(Color onSurface) {
    final prod = _prod!;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ProductRadialImage(
          imageUrl: prod.imageUrl,
          width: 72,
          height: 72,
          placeholderIcon: Icons.icecream,
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                prod.name,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: onSurface,
                ),
              ),
              if (prod.description != null && prod.description!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  prod.description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: context.bc.mutedText, fontSize: 12, height: 1.35),
                ),
              ],
              const SizedBox(height: 6),
              Text(
                'From LKR ${prod.basePrice}',
                style: const TextStyle(
                  color: BcColors.brand,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              if (prod.canOrder && prod.isLowStock) ...[
                const SizedBox(height: 6),
                const Text(
                  'Low stock at your branch',
                  style: TextStyle(
                    color: Color(0xFFF59E0B),
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                ),
              ],
            ],
          ),
        ),
        WishlistHeartButton(productId: prod.id, iconSize: 18, padding: 8),
        IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: Icon(Icons.close, color: context.bc.mutedText),
        ),
      ],
    );
  }

  Widget _buildPriceBreakdown(Color onSurface) {
    final prod = _prod!;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bc.pageBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.bc.border),
      ),
      child: Column(
        children: [
          _priceRow('Base price', prod.basePrice, onSurface),
          if (_toppingsExtra > 0) _priceRow('Toppings', _toppingsExtra, onSurface),
          const Divider(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Total',
                style: TextStyle(fontWeight: FontWeight.bold, color: onSurface, fontSize: 16),
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Text(
                  'LKR $_totalPrice',
                  key: ValueKey<int>(_totalPrice),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: BcColors.brand,
                    fontSize: 18,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _priceRow(String label, int amount, Color onSurface) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: context.bc.mutedText, fontSize: 13)),
          Text('LKR $amount', style: TextStyle(color: onSurface, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.bold,
        color: Theme.of(context).colorScheme.onSurface,
      ),
    );
  }

  Widget _buildToppingTile(Topping topping) {
    final checked = _selectedToppings.any((t) => t.id == topping.id);
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: checked
            ? BcColors.brand.withValues(alpha: 0.08)
            : context.bc.pageBg,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            setState(() {
              if (checked) {
                _selectedToppings.removeWhere((t) => t.id == topping.id);
              } else {
                _selectedToppings.add(topping);
              }
            });
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: checked ? BcColors.brand : context.bc.border,
                width: checked ? 1.5 : 1,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child: Icon(
                    checked ? Icons.check_circle_rounded : Icons.circle_outlined,
                    color: checked ? BcColors.brand : context.bc.mutedText,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    topping.name,
                    style: TextStyle(
                      color: onSurface,
                      fontSize: 13,
                      fontWeight: checked ? FontWeight.w600 : FontWeight.w500,
                      height: 1.3,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '+ LKR ${topping.extraPrice}',
                  style: TextStyle(
                    color: checked ? BcColors.brand : context.bc.mutedText,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomBar(Color onSurface, double safeBottom) {
    final maxQty = _maxQty;
    final canOrder = _prod?.canOrder ?? false;
    final canAdd = _prod != null && !_isAdding && canOrder && maxQty > 0;
    if (maxQty > 0 && _quantity > maxQty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _quantity > maxQty && maxQty > 0) {
          setState(() => _quantity = maxQty);
        }
      });
    }
    return Container(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 12 + safeBottom),
      decoration: BoxDecoration(
        color: context.bc.cardBg,
        border: Border(top: BorderSide(color: context.bc.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 12,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        children: [
          _qtyButton(Icons.remove, _quantity > 1 ? () => setState(() => _quantity--) : null),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: PopQuantityText(quantity: _quantity, fontSize: 18, color: onSurface),
          ),
          _qtyButton(
            Icons.add,
            () {
              if (_quantity < maxQty) {
                setState(() => _quantity++);
                return;
              }
              final prod = _prod;
              if (prod == null) return;
              showAppToast(
                context,
                !prod.canOrder || maxQty <= 0
                    ? (prod.isComingSoon
                        ? 'Sorry, this item is coming soon.'
                        : 'Sorry, this item is out of stock.')
                    : (prod.hasBoundedStock
                        ? 'Not enough stock at your branch for that quantity.'
                        : 'Maximum ${Product.softMaxQty} per item.'),
                isError: true,
              );
            },
          ),
          const SizedBox(width: 12),
          Expanded(
            child: ElevatedButton(
              onPressed: canAdd ? _handleAdd : null,
              style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _isAdding
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text(
                      !canOrder
                          ? (_prod?.isComingSoon == true ? 'Coming Soon' : 'Out of Stock')
                          : maxQty <= 0
                              ? 'Limit reached'
                              : 'Add to cup • LKR $_totalPrice',
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _qtyButton(IconData icon, VoidCallback? onPressed) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.bc.border),
      ),
      child: IconButton(
        icon: Icon(icon, color: onPressed != null ? onSurface : context.bc.mutedText),
        onPressed: onPressed,
      ),
    );
  }
}
