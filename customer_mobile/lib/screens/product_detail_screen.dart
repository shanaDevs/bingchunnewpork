import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/cart_item.dart';
import '../models/product.dart';
import '../providers/cart_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../services/cart_sfx.dart';
import '../theme/bc_theme.dart';
import '../widgets/product_radial_image.dart';
import '../widgets/pop_quantity_text.dart';
import '../widgets/wishlist_heart_button.dart';
import '../utils/product_pricing.dart';
import '../utils/app_toast.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;
  final Product? initialProduct;

  const ProductDetailScreen({
    super.key,
    required this.productId,
    this.initialProduct,
  });

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  Product? _product;
  bool _isLoading = false;

  final List<Topping> _selectedToppings = [];
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    if (widget.initialProduct != null) {
      _product = widget.initialProduct;
      // If product has toppings already populated, we use them, otherwise we load them.
      if (_product!.toppings.isEmpty) {
        _loadProduct();
      }
    } else {
      _loadProduct();
    }
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadProduct() async {
    setState(() {
      _isLoading = true;
    });

    final api = ref.read(apiClientProvider);
    final storeId = ref.read(fulfillmentProvider).storeId;
    try {
      final path = storeId != null
          ? '/menu/products/${widget.productId}?storeId=$storeId'
          : '/menu/products/${widget.productId}';
      final prod = await api.get<Product>(
        path,
        requireAuth: false,
        parser: (json) => Product.fromJson(json),
      );
      setState(() {
        _product = prod;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        showAppToast(context, 'Failed to load item: ${e.toString()}', isError: true);
      }
    }
  }

  int get _calculatedUnitPrice {
    if (_product == null) return 0;
    return computeUnitPrice(
      _product!,
      size: ProductSize.REGULAR,
      toppings: _selectedToppings,
    );
  }

  int get _calculatedTotalPrice => _calculatedUnitPrice * _quantity;

  int get _maxQty {
    final prod = _product;
    if (prod == null) return Product.softMaxQty;
    return ref.read(cartProvider.notifier).remainingOrderQty(prod);
  }

  Future<void> _handleAddToCart() async {
    if (_product == null) return;

    if (!_product!.canOrder) {
      showAppToast(
        context,
        _product!.isComingSoon
            ? 'Sorry, this item is coming soon.'
            : 'Sorry, this item is out of stock.',
        isError: true,
      );
      return;
    }

    final success = await ref.read(cartProvider.notifier).addToCart(
          _product!,
          size: ProductSize.REGULAR,
          toppings: _selectedToppings,
          quantity: _quantity,
        );

    if (!mounted) return;

    if (success) {
      await CartSfx.instance.playAdd();
      showAppToast(context, 'Added ${_product?.name ?? 'item'} to cup', isError: false);
      if (mounted) Navigator.of(context).pop();
    } else {
      final error = ref.read(cartProvider).errorMessage ?? 'Failed to add item';
      showAppToast(context, error, isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading || _product == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: CircularProgressIndicator(color: BcColors.brand)),
      );
    }

    final prod = _product!;

    return Scaffold(
      appBar: AppBar(
        title: Text(prod.name),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Center(
              child: WishlistHeartButton(productId: prod.id, iconSize: 20, padding: 8),
            ),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Product image
                  Stack(
                    children: [
                      ProductRadialImage(
                        imageUrl: prod.imageUrl,
                        height: 200,
                        borderRadius: BorderRadius.circular(16),
                        padding: const EdgeInsets.all(16),
                        placeholderIcon: Icons.icecream,
                        placeholderSize: 80,
                      ),
                      WishlistHeartOverlay(productId: prod.id),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // Product details
                  Text(
                    prod.name,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                  ),
                  if (prod.description != null && prod.description!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      prod.description!,
                      style: TextStyle(color: context.bc.mutedText, height: 1.4),
                    ),
                  ],
                  if (prod.canOrder && prod.isLowStock) ...[
                    const SizedBox(height: 10),
                    const Text(
                      'Low stock at your branch',
                      style: TextStyle(
                        color: Color(0xFFF59E0B),
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ] else if (!prod.canOrder) ...[
                    const SizedBox(height: 10),
                    Text(
                      prod.isComingSoon ? 'Coming Soon' : 'Out of Stock',
                      style: const TextStyle(
                        color: BcColors.error,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  if (prod.toppings.isNotEmpty) ...[
                    _buildSectionHeader('Choose Toppings'),
                    ...prod.toppings.map((topping) {
                      final isChecked = _selectedToppings.contains(topping);
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: CheckboxListTile(
                          value: isChecked,
                          title: Text(topping.name, style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
                          subtitle: Text('+ LKR ${topping.extraPrice}', style: const TextStyle(color: BcColors.brand)),
                          activeColor: BcColors.brand,
                          checkColor: Colors.white,
                          tileColor: context.bc.cardBg,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                            side: BorderSide(color: context.bc.border),
                          ),
                          onChanged: (val) {
                            setState(() {
                              if (val == true) {
                                _selectedToppings.add(topping);
                              } else {
                                _selectedToppings.remove(topping);
                              }
                            });
                          },
                        ),
                      );
                    }),
                  ],
                ],
              ),
            ),
          ),
          // Add to cup bottom bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: BoxDecoration(
              color: context.bc.cardBg,
              border: Border(top: BorderSide(color: context.bc.border)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Quantity Selector
                Row(
                  children: [
                    _buildQuantityButton(Icons.remove, () {
                      if (_quantity > 1) {
                        setState(() {
                          _quantity--;
                        });
                      }
                    }),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: PopQuantityText(
                        quantity: _quantity,
                        fontSize: 18.0,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    _buildQuantityButton(Icons.add, () {
                      final maxQty = _maxQty;
                      if (_quantity < maxQty) {
                        setState(() {
                          _quantity++;
                        });
                        return;
                      }
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
                    }),
                  ],
                ),
                // Action Button
                ElevatedButton(
                  onPressed: prod.canOrder && _maxQty > 0 ? _handleAddToCart : null,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                  ),
                  child: Text(
                    !prod.canOrder
                        ? (prod.isComingSoon ? 'Coming Soon' : 'Out of Stock')
                        : _maxQty <= 0
                            ? 'Limit reached'
                            : 'Add to cup • LKR $_calculatedTotalPrice',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10.0),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.bold,
          color: Theme.of(context).colorScheme.onSurface,
        ),
      ),
    );
  }

  Widget _buildQuantityButton(IconData icon, VoidCallback onPressed) {
    return Container(
      decoration: BoxDecoration(
        color: context.bc.secondaryBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.bc.border),
      ),
      child: IconButton(
        icon: Icon(icon, color: Theme.of(context).colorScheme.onSurface),
        onPressed: onPressed,
      ),
    );
  }
}
