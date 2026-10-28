import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/category.dart';
import '../models/cart_item.dart';
import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../services/cart_sfx.dart';
import '../theme/bc_theme.dart';
import '../widgets/cup_icon.dart';
import '../widgets/product_add_sheet.dart';
import '../widgets/product_radial_image.dart';
import '../widgets/wishlist_heart_button.dart';
import '../utils/app_toast.dart';
import '../utils/shell_layout.dart';

class MenuScreen extends ConsumerStatefulWidget {
  final String? initialCategorySlug;

  const MenuScreen({super.key, this.initialCategorySlug});

  @override
  ConsumerState<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends ConsumerState<MenuScreen> {
  String _selectedCategorySlug = 'all';
  String _searchQuery = '';
  String _selectedSort = 'A-Z';
  String _selectedTag = 'All';
  bool _isGridView = true;
  List<Category> _categories = [];
  List<Product> _products = [];
  bool _isLoading = false;
  bool _hasFullCatalog = false;
  bool _searchFocused = false;
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();

  static const _sortOptions = ['A-Z', 'Z-A', 'Price ↑', 'Price ↓'];
  static const _defaultTags = [
    'All',
    'Popular',
    'Best Seller',
    'New',
    'Classic',
    'Signature',
  ];

  bool get _isSearchActive => _searchFocused || _searchQuery.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    _selectedCategorySlug =
        widget.initialCategorySlug?.trim().isNotEmpty == true
        ? widget.initialCategorySlug!.trim()
        : 'all';
    _searchFocus.addListener(_onSearchFocusChanged);
    Future.microtask(_loadData);
  }

  @override
  void didUpdateWidget(covariant MenuScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialCategorySlug == widget.initialCategorySlug) return;
    setState(() {
      _selectedCategorySlug =
          widget.initialCategorySlug?.trim().isNotEmpty == true
          ? widget.initialCategorySlug!.trim()
          : 'all';
    });
  }

  void _onSearchFocusChanged() {
    if (!mounted) return;
    setState(() => _searchFocused = _searchFocus.hasFocus);
    if (_searchFocus.hasFocus && !_hasFullCatalog) {
      _loadData();
    }
  }

  void _exitSearch() {
    _searchController.clear();
    _searchFocus.unfocus();
    setState(() {
      _searchQuery = '';
      _searchFocused = false;
    });
  }

  @override
  void dispose() {
    _searchFocus.removeListener(_onSearchFocusChanged);
    _searchFocus.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final api = ref.read(apiClientProvider);
    try {
      final cats = await api.get<List<Category>>(
        '/menu/categories',
        requireAuth: false,
        listParser: (list) => list
            .map((e) => Category.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

      final fulfillment = ref.read(fulfillmentProvider);
      String path = '/menu/products';
      if (fulfillment.storeId != null) {
        path += '?storeId=${fulfillment.storeId}';
      }

      final prods = await api.get<List<Product>>(
        path,
        requireAuth: false,
        listParser: (list) => list
            .map((e) => Product.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

      if (mounted) {
        setState(() {
          _categories = cats;
          _products = prods;
          _hasFullCatalog = true;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        showAppToast(context, 'Failed to load menu: $e', isError: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final cart = ref.watch(cartProvider);
    ref.listen<FulfillmentState>(fulfillmentProvider, (prev, next) {
      if (prev?.storeId != next.storeId) {
        _loadData();
      }
    });
    final gridBottomInset = shellMenuScrollBottomInset(context) + 34;
    final cartCount = cart.items.fold<int>(
      0,
      (sum, item) => sum + item.quantity,
    );
    final userName = auth.user?.name.trim().isNotEmpty == true
        ? auth.user!.name.trim().split(' ').first
        : 'Bing Chun';
    final q = _foldSearch(_searchQuery);
    final searching = q.isNotEmpty;
    final categoryNameBySlug = {for (final c in _categories) c.slug: c.name};
    final selectedCategory = _selectedCategorySlug == 'all'
        ? null
        : _categories.cast<Category?>().firstWhere(
            (c) => c!.slug == _selectedCategorySlug,
            orElse: () => null,
          );
    final sortedProducts = _products.where((p) {
      if (!searching && selectedCategory != null) {
        final matchesSlug = p.categorySlug == selectedCategory.slug;
        final matchesId = p.categoryId == selectedCategory.id;
        if (!matchesSlug && !matchesId) return false;
      }
      if (searching &&
          !_productMatchesQuery(p, q, categoryNameBySlug[p.categorySlug])) {
        return false;
      }
      if (_selectedTag != 'All' && !searching) {
        final tag = (p.tag ?? '').trim();
        if (tag.toLowerCase() != _selectedTag.toLowerCase()) return false;
      }
      return true;
    }).toList();
    if (_selectedSort == 'Z-A') {
      sortedProducts.sort(
        (a, b) => b.name.toLowerCase().compareTo(a.name.toLowerCase()),
      );
    } else if (_selectedSort == 'Price ↑') {
      sortedProducts.sort((a, b) => a.basePrice.compareTo(b.basePrice));
    } else if (_selectedSort == 'Price ↓') {
      sortedProducts.sort((a, b) => b.basePrice.compareTo(a.basePrice));
    } else {
      sortedProducts.sort(
        (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
      );
    }
    // Keep orderable drinks first so out-of-stock items sink to the bottom.
    sortedProducts.sort((a, b) {
      final aOk = a.canOrder;
      final bOk = b.canOrder;
      if (aOk == bOk) return 0;
      return aOk ? -1 : 1;
    });

    final availableTags = <String>{
      ..._defaultTags.skip(1),
      ..._products.map((p) => (p.tag ?? '').trim()).where((t) => t.isNotEmpty),
    }.toList()..sort();
    final tagChoices = ['All', ...availableTags];

    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FD),
      body: Stack(
        children: [
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!_isSearchActive)
                  _MenuTopBar(
                    userName: userName,
                    cartCount: cartCount,
                    onBellTap: () => context.push('/notifications'),
                    onCartTap: () => context.go('/cart'),
                  ),
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    _isSearchActive ? 4 : 18,
                    10,
                    18,
                    0,
                  ),
                  child: Row(
                    children: [
                      if (_isSearchActive) ...[
                        IconButton(
                          onPressed: _exitSearch,
                          icon: const Icon(
                            Icons.arrow_back_rounded,
                            color: Color(0xFF0F172A),
                          ),
                          tooltip: 'Back',
                        ),
                        const SizedBox(width: 2),
                      ],
                      Expanded(
                        child: _MenuSearchBox(
                          controller: _searchController,
                          focusNode: _searchFocus,
                          searchQuery: _searchQuery,
                          onChanged: (value) {
                            setState(() => _searchQuery = value);
                            if (value.trim().isNotEmpty && !_hasFullCatalog) {
                              _loadData();
                            }
                          },
                          onClear: () {
                            _searchController.clear();
                            setState(() => _searchQuery = '');
                            _searchFocus.requestFocus();
                          },
                        ),
                      ),
                    ],
                  ),
                ),
                if (_isSearchActive && searching)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
                    child: Text(
                      sortedProducts.isEmpty
                          ? 'No matches'
                          : '${sortedProducts.length} result${sortedProducts.length == 1 ? '' : 's'}',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: const Color(0xFF64748B),
                      ),
                    ),
                  ),
                Expanded(
                  child: RefreshIndicator(
                    color: BcColors.brand,
                    onRefresh: _loadData,
                    notificationPredicate: (notification) =>
                        !_isSearchActive && notification.depth == 0,
                    child: CustomScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      slivers: [
                        if (!_isSearchActive)
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  SizedBox(
                                    height: 42,
                                    child: ListView.builder(
                                      scrollDirection: Axis.horizontal,
                                      itemCount: _categories.length + 1,
                                      itemBuilder: (context, index) {
                                        final isAll = index == 0;
                                        final slug = isAll
                                            ? 'all'
                                            : _categories[index - 1].slug;
                                        final name = isAll
                                            ? 'All Items'
                                            : _categories[index - 1].name;
                                        final isSelected =
                                            _selectedCategorySlug == slug;
                                        return Padding(
                                          padding: EdgeInsets.only(
                                            right: index == _categories.length
                                                ? 0
                                                : 10,
                                          ),
                                          child: _buildCategoryChip(
                                            name,
                                            isSelected,
                                            () {
                                              setState(
                                                () => _selectedCategorySlug =
                                                    slug,
                                              );
                                            },
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          'Showing ${sortedProducts.length} items',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: GoogleFonts.poppins(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w500,
                                            color: const Color(0xFF64748B),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      _FilterChipButton(
                                        icon:
                                            Icons.format_list_bulleted_rounded,
                                        label: _selectedTag == 'All'
                                            ? 'All tags'
                                            : _selectedTag,
                                        onTap: () => _showTagPicker(tagChoices),
                                      ),
                                      const SizedBox(width: 8),
                                      _FilterChipButton(
                                        icon: Icons.keyboard_arrow_down_rounded,
                                        label: _selectedSort,
                                        iconRight: true,
                                        onTap: _showSortPicker,
                                      ),
                                      const SizedBox(width: 8),
                                      _ViewToggleButton(
                                        isGrid: _isGridView,
                                        onTap: () => setState(
                                          () => _isGridView = !_isGridView,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        if (_isSearchActive && !searching)
                          SliverFillRemaining(
                            hasScrollBody: false,
                            child: Center(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 32,
                                ),
                                child: Text(
                                  'Search for bubble tea, milkshakes, sundaes...',
                                  textAlign: TextAlign.center,
                                  style: GoogleFonts.poppins(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                    color: const Color(0xFF94A3B8),
                                  ),
                                ),
                              ),
                            ),
                          )
                        else
                          SliverPadding(
                            padding: EdgeInsets.fromLTRB(
                              18,
                              12,
                              18,
                              gridBottomInset,
                            ),
                            sliver: _isLoading
                                ? const SliverFillRemaining(
                                    hasScrollBody: false,
                                    child: Center(
                                      child: CircularProgressIndicator(
                                        color: BcColors.brand,
                                      ),
                                    ),
                                  )
                                : sortedProducts.isEmpty
                                ? SliverFillRemaining(
                                    hasScrollBody: false,
                                    child: Center(
                                      child: Text(
                                        'No products found.',
                                        style: GoogleFonts.poppins(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w500,
                                          color: const Color(0xFF64748B),
                                        ),
                                      ),
                                    ),
                                  )
                                : (_isSearchActive || !_isGridView)
                                ? SliverList(
                                    delegate: SliverChildBuilderDelegate(
                                      (context, index) => Padding(
                                        padding: EdgeInsets.only(
                                          bottom:
                                              index == sortedProducts.length - 1
                                              ? 0
                                              : 12,
                                        ),
                                        child: MenuProductCard(
                                          product: sortedProducts[index],
                                          listMode: true,
                                          onTap: () => _openProductCustomizer(
                                            sortedProducts[index],
                                          ),
                                          onAddQuick: () => _handleQuickAdd(
                                            sortedProducts[index],
                                          ),
                                          quantity: _productQuantityInCart(
                                            sortedProducts[index],
                                          ),
                                          onIncrement: () => _handleQuickAdd(
                                            sortedProducts[index],
                                          ),
                                          onDecrement: () =>
                                              _handleQuickDecrement(
                                                sortedProducts[index],
                                              ),
                                        ),
                                      ),
                                      childCount: sortedProducts.length,
                                    ),
                                  )
                                : SliverGrid(
                                    gridDelegate:
                                        const SliverGridDelegateWithFixedCrossAxisCount(
                                          crossAxisCount: 2,
                                          mainAxisExtent: 262,
                                          crossAxisSpacing: 12,
                                          mainAxisSpacing: 12,
                                        ),
                                    delegate: SliverChildBuilderDelegate(
                                      (context, index) => MenuProductCard(
                                        product: sortedProducts[index],
                                        onTap: () => _openProductCustomizer(
                                          sortedProducts[index],
                                        ),
                                        onAddQuick: () => _handleQuickAdd(
                                          sortedProducts[index],
                                        ),
                                        quantity: _productQuantityInCart(
                                          sortedProducts[index],
                                        ),
                                        onIncrement: () => _handleQuickAdd(
                                          sortedProducts[index],
                                        ),
                                        onDecrement: () =>
                                            _handleQuickDecrement(
                                              sortedProducts[index],
                                            ),
                                      ),
                                      childCount: sortedProducts.length,
                                    ),
                                  ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (cart.items.isNotEmpty && !_isSearchActive)
            Positioned(
              left: 18,
              right: 18,
              bottom: 14,
              child: _MenuCartBar(
                count: cartCount,
                total: cart.total,
                onTap: () => context.go('/cart'),
              ),
            ),
        ],
      ),
    );
  }

  static String _foldSearch(String value) {
    return value
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static bool _productMatchesQuery(
    Product product,
    String foldedQuery,
    String? categoryName,
  ) {
    if (foldedQuery.isEmpty) return true;
    final hay = _foldSearch(
      [
        product.name,
        product.slug,
        product.description ?? '',
        product.tag ?? '',
        product.categorySlug ?? '',
        categoryName ?? '',
      ].join(' '),
    );
    return foldedQuery.split(' ').every((token) => hay.contains(token));
  }

  int _productQuantityInCart(Product product) {
    return ref
        .read(cartProvider)
        .items
        .where((item) => item.product.id == product.id)
        .fold<int>(0, (sum, item) => sum + item.quantity);
  }

  Future<void> _playCartAddSound() => CartSfx.instance.playAdd();

  Future<void> _handleQuickAdd(Product product) async {
    if (!product.canOrder) {
      showAppToast(
        context,
        product.isComingSoon
            ? 'Sorry, this item is coming soon.'
            : 'Sorry, this item is out of stock.',
        isError: true,
      );
      return;
    }
    if (product.toppings.isNotEmpty || product.isCombo) {
      _openProductCustomizer(product);
      return;
    }
    final success = await ref
        .read(cartProvider.notifier)
        .addToCart(product, toppings: const [], quantity: 1);
    if (!mounted) return;
    if (!success) {
      final error =
          ref.read(cartProvider).errorMessage ??
          'Not enough stock at your branch for that quantity.';
      showAppToast(context, error, isError: true);
      return;
    }
    await _playCartAddSound();
  }

  Future<void> _handleQuickDecrement(Product product) async {
    final cart = ref.read(cartProvider);
    final notifier = ref.read(cartProvider.notifier);
    final candidate = cart.items.firstWhere(
      (item) =>
          item.product.id == product.id &&
          item.size == ProductSize.REGULAR &&
          item.selectedToppings.isEmpty,
      orElse: () => CartItem(product: product, quantity: 0),
    );
    if (candidate.quantity == 0) return;
    await notifier.updateQuantity(candidate, candidate.quantity - 1);
  }

  void _openProductCustomizer(Product product) {
    if (!product.canOrder) {
      showAppToast(
        context,
        product.isComingSoon
            ? 'Sorry, this item is coming soon.'
            : 'Sorry, this item is out of stock.',
        isError: true,
      );
      return;
    }
    showProductAddSheet(context, product);
  }

  Future<T?> _showMenuFilterSheet<T>({
    required String title,
    required List<Widget> Function(BuildContext sheetContext) tiles,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        final bottom = MediaQuery.viewPaddingOf(sheetContext).bottom;
        final maxHeight = MediaQuery.sizeOf(sheetContext).height * 0.55;
        return Padding(
          padding: EdgeInsets.only(bottom: bottom),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxHeight),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 10),
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: const Color(0xFFD8E4F3),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        title,
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFF0F172A),
                        ),
                      ),
                    ),
                  ),
                  ...tiles(sheetContext),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _showTagPicker(List<String> tags) async {
    final picked = await _showMenuFilterSheet<String>(
      title: 'Filter by tag',
      tiles: (sheetContext) => [
        for (final tag in tags)
          ListTile(
            title: Text(
              tag == 'All' ? 'All tags' : tag,
              style: GoogleFonts.poppins(
                fontWeight: tag == _selectedTag
                    ? FontWeight.w700
                    : FontWeight.w500,
                color: tag == _selectedTag
                    ? BcColors.brand
                    : const Color(0xFF1E293B),
              ),
            ),
            trailing: tag == _selectedTag
                ? const Icon(Icons.check_rounded, color: BcColors.brand)
                : null,
            onTap: () => Navigator.pop(sheetContext, tag),
          ),
      ],
    );
    if (picked != null && mounted) setState(() => _selectedTag = picked);
  }

  Future<void> _showSortPicker() async {
    final picked = await _showMenuFilterSheet<String>(
      title: 'Sort by',
      tiles: (sheetContext) => [
        for (final option in _sortOptions)
          ListTile(
            title: Text(
              option,
              style: GoogleFonts.poppins(
                fontWeight: option == _selectedSort
                    ? FontWeight.w700
                    : FontWeight.w500,
                color: option == _selectedSort
                    ? BcColors.brand
                    : const Color(0xFF1E293B),
              ),
            ),
            trailing: option == _selectedSort
                ? const Icon(Icons.check_rounded, color: BcColors.brand)
                : null,
            onTap: () => Navigator.pop(sheetContext, option),
          ),
      ],
    );
    if (picked != null && mounted) setState(() => _selectedSort = picked);
  }

  Widget _buildCategoryChip(String name, bool isSelected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isSelected ? BcColors.brand : Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: isSelected ? BcColors.brand : const Color(0xFFD7E3F3),
            width: 1.1,
          ),
          boxShadow: [
            if (isSelected)
              BoxShadow(
                color: BcColors.brand.withValues(alpha: 0.16),
                blurRadius: 10,
                offset: const Offset(0, 3),
              )
            else
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
          ],
        ),
        child: Text(
          name,
          style: GoogleFonts.poppins(
            color: isSelected ? Colors.white : const Color(0xFF1E293B),
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
            fontSize: 12,
            letterSpacing: 0.1,
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Card
// • Mascot animates inside the card image area (no grid overflow)
// • Listener fires on pointer-down even during scroll
// • Name fades on one line — never wraps, always readable
// ─────────────────────────────────────────────────────────────────────────────

class MenuProductCard extends StatefulWidget {
  final Product product;
  final VoidCallback onTap;
  final VoidCallback onAddQuick;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;
  final int quantity;
  final bool listMode;

  const MenuProductCard({
    super.key,
    required this.product,
    required this.onTap,
    required this.onAddQuick,
    required this.onIncrement,
    required this.onDecrement,
    required this.quantity,
    this.listMode = false,
  });

  @override
  State<MenuProductCard> createState() => _MenuProductCardState();
}

class _MenuProductCardState extends State<MenuProductCard> {
  bool _mascotVisible = false;
  bool _isHovered = false;

  void _showMascot() {
    if (mounted) setState(() => _mascotVisible = true);
  }

  void _hideMascot() {
    if (mounted) setState(() => _mascotVisible = false);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.listMode) return _buildListCard();
    return _buildGridCard();
  }

  Widget _buildListCard() {
    return MouseRegion(
      onEnter: (_) {
        _isHovered = true;
        _showMascot();
      },
      onExit: (_) {
        _isHovered = false;
        _hideMascot();
      },
      child: Listener(
        onPointerDown: (_) => _showMascot(),
        onPointerUp: (_) =>
            Future.delayed(const Duration(milliseconds: 1200), () {
              if (!_isHovered) _hideMascot();
            }),
        onPointerCancel: (_) => _hideMascot(),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Opacity(
            opacity: 1,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              height: 118,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: _mascotVisible
                      ? BcColors.brand
                      : const Color(0xFFE3ECF7),
                  width: _mascotVisible ? 1.4 : 1,
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: Stack(
                children: [
                  Row(
                    children: [
                      SizedBox(
                        width: 108,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            ProductRadialImage(
                              imageUrl: widget.product.imageUrl,
                              expand: true,
                              active: _mascotVisible,
                              borderRadius: const BorderRadius.horizontal(
                                left: Radius.circular(18),
                              ),
                              padding: const EdgeInsets.all(8),
                              placeholderIcon: Icons.icecream,
                              placeholderSize: 28,
                            ),
                            if (widget.product.canOrder &&
                                widget.product.displayTag != null)
                              Positioned(
                                left: 0,
                                top: 0,
                                child: _ProductTagBadge(
                                  tag: widget.product.displayTag!,
                                ),
                              ),
                            if (!widget.product.canOrder)
                              Positioned(
                                left: 0,
                                bottom: 0,
                                child: _StockStatusBadge(
                                  label: widget.product.isComingSoon
                                      ? 'COMING SOON'
                                      : 'OUT OF STOCK',
                                  color: widget.product.isComingSoon
                                      ? const Color(0xFF93C5FD)
                                      : BcColors.error,
                                  textColor: widget.product.isComingSoon
                                      ? const Color(0xFF1E3A8A)
                                      : Colors.white,
                                ),
                              )
                            else if (widget.product.isLowStock)
                              const Positioned(
                                left: 0,
                                bottom: 0,
                                child: _StockStatusBadge(),
                              ),
                            Positioned(
                              right: 4,
                              top: 4,
                              child: WishlistHeartButton(
                                productId: widget.product.id,
                                iconSize: 14,
                                padding: 4,
                              ),
                            ),
                            Positioned(
                              right: 0,
                              bottom: 0,
                              child: IgnorePointer(
                                child: AnimatedOpacity(
                                  opacity: _mascotVisible ? 1 : 0,
                                  duration: const Duration(milliseconds: 220),
                                  child: Image.asset(
                                    'assets/brand/mascot-hover.png',
                                    width: 36,
                                    height: 36,
                                    fit: BoxFit.contain,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.product.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                  color: const Color(0xFF0F172A),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.star_rounded,
                                    color: Color(0xFFF5B301),
                                    size: 13,
                                  ),
                                  const SizedBox(width: 2),
                                  Text(
                                    '4.8',
                                    style: GoogleFonts.poppins(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: const Color(0xFF64748B),
                                    ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    'LKR ${widget.product.basePrice}',
                                    style: GoogleFonts.poppins(
                                      color: BcColors.brand,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                              const Spacer(),
                              SizedBox(
                                width: 140,
                                child: widget.product.canOrder
                                    ? _InlineQtyBar(
                                        quantity: widget.quantity,
                                        enabled: true,
                                        onPlus: widget.onIncrement,
                                        onMinus: widget.onDecrement,
                                        onFirstAdd: widget.onAddQuick,
                                      )
                                    : const SizedBox(height: 36),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGridCard() {
    return MouseRegion(
      onEnter: (_) {
        _isHovered = true;
        _showMascot();
      },
      onExit: (_) {
        _isHovered = false;
        _hideMascot();
      },
      child: Listener(
        onPointerDown: (_) => _showMascot(),
        onPointerUp: (_) =>
            Future.delayed(const Duration(milliseconds: 1200), () {
              if (!_isHovered) _hideMascot();
            }),
        onPointerCancel: (_) => _hideMascot(),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Opacity(
            opacity: 1,
            child: SizedBox.expand(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutCirc,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: _mascotVisible
                        ? BcColors.brand
                        : const Color(0xFFE3ECF7),
                    width: _mascotVisible ? 1.4 : 1,
                  ),
                  boxShadow: [
                    if (_mascotVisible)
                      BoxShadow(
                        color: BcColors.brand.withValues(alpha: 0.16),
                        blurRadius: 18,
                        offset: const Offset(0, 6),
                      )
                    else
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: Stack(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              ProductRadialImage(
                                imageUrl: widget.product.imageUrl,
                                heroTag: 'product_image_${widget.product.id}',
                                expand: true,
                                active: _mascotVisible,
                                borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(18),
                                ),
                                padding: const EdgeInsets.fromLTRB(
                                  10,
                                  12,
                                  10,
                                  8,
                                ),
                                placeholderIcon: Icons.icecream,
                                placeholderSize: 36,
                              ),
                              if (widget.product.canOrder &&
                                  widget.product.displayTag != null)
                                Positioned(
                                  left: 0,
                                  top: 0,
                                  child: _ProductTagBadge(
                                    tag: widget.product.displayTag!,
                                  ),
                                ),
                              if (!widget.product.canOrder)
                                Positioned(
                                  left: 0,
                                  bottom: 0,
                                  child: _StockStatusBadge(
                                    label: widget.product.isComingSoon
                                        ? 'COMING SOON'
                                        : 'OUT OF STOCK',
                                    color: widget.product.isComingSoon
                                        ? const Color(0xFF93C5FD)
                                        : BcColors.error,
                                    textColor: widget.product.isComingSoon
                                        ? const Color(0xFF1E3A8A)
                                        : Colors.white,
                                  ),
                                )
                              else if (widget.product.isLowStock)
                                const Positioned(
                                  left: 0,
                                  bottom: 0,
                                  child: _StockStatusBadge(),
                                ),
                              WishlistHeartOverlay(
                                productId: widget.product.id,
                              ),
                              Positioned(
                                right: 2,
                                bottom: 0,
                                child: IgnorePointer(
                                  child: AnimatedOpacity(
                                    opacity: _mascotVisible ? 1.0 : 0.0,
                                    duration: const Duration(milliseconds: 250),
                                    child: AnimatedSlide(
                                      offset: _mascotVisible
                                          ? Offset.zero
                                          : const Offset(0.25, 0.4),
                                      duration: const Duration(
                                        milliseconds: 380,
                                      ),
                                      curve: Curves.easeOutBack,
                                      child: Image.asset(
                                        'assets/brand/mascot-hover.png',
                                        width: 48,
                                        height: 48,
                                        fit: BoxFit.contain,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                height: 32,
                                child: Align(
                                  alignment: Alignment.topLeft,
                                  child: Text(
                                    widget.product.name,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12,
                                      color: const Color(0xFF0F172A),
                                      height: 1.25,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.star_rounded,
                                    color: Color(0xFFF5B301),
                                    size: 12,
                                  ),
                                  const SizedBox(width: 2),
                                  Text(
                                    '4.8',
                                    style: GoogleFonts.poppins(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: const Color(0xFF64748B),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'LKR ${widget.product.basePrice}',
                                style: GoogleFonts.poppins(
                                  color: BcColors.brand,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                          child: widget.product.canOrder
                              ? _InlineQtyBar(
                                  quantity: widget.quantity,
                                  enabled: true,
                                  onPlus: widget.onIncrement,
                                  onMinus: widget.onDecrement,
                                  onFirstAdd: widget.onAddQuick,
                                )
                              : const SizedBox(height: 40),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StockStatusBadge extends StatelessWidget {
  const _StockStatusBadge({
    this.label = 'LOW STOCK',
    this.color = const Color(0xFFF59E0B),
    this.textColor = Colors.white,
  });

  final String label;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: const BorderRadius.only(
          topRight: Radius.circular(10),
          bottomLeft: Radius.circular(4),
        ),
      ),
      child: Text(
        label,
        style: GoogleFonts.poppins(
          color: textColor,
          fontSize: 8,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _ProductTagBadge extends StatelessWidget {
  const _ProductTagBadge({required this.tag});

  final String tag;

  Color get _bg {
    if (tag == 'Coming Soon') return const Color(0xFF93C5FD);
    if (tag == 'Popular' || tag == 'Best Seller') return BcColors.accent;
    if (tag == 'New') return BcColors.success;
    return BcColors.brand;
  }

  @override
  Widget build(BuildContext context) {
    final isComingSoon = tag == 'Coming Soon';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: _bg,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(14),
          bottomRight: Radius.circular(12),
        ),
      ),
      child: Text(
        tag.toUpperCase(),
        style: GoogleFonts.poppins(
          color: isComingSoon ? const Color(0xFF1E3A8A) : Colors.white,
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _MenuTopBar extends StatelessWidget {
  const _MenuTopBar({
    required this.userName,
    required this.cartCount,
    required this.onBellTap,
    required this.onCartTap,
  });

  final String userName;
  final int cartCount;
  final VoidCallback onBellTap;
  final VoidCallback onCartTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Image.asset(
              'assets/brand/customer-avatar.png',
              width: 34,
              height: 34,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0xFFE8F1FF),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(
                  Icons.person,
                  color: BcColors.brand,
                  size: 18,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  userName,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF0F172A),
                  ),
                ),
                Text(
                  'Premium Bubble Tea',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: BcColors.brand,
                  ),
                ),
              ],
            ),
          ),
          const WishlistHeaderButton(compact: true),
          const SizedBox(width: 8),
          _TopIconButton(
            icon: Icons.notifications_none_rounded,
            onTap: onBellTap,
          ),
          const SizedBox(width: 10),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onCartTap,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 6, 2),
                child: CupIcon.fromCount(
                  itemCount: cartCount,
                  size: CupIconSize.sm,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopIconButton extends StatelessWidget {
  const _TopIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: SizedBox(
          width: 32,
          height: 32,
          child: Icon(icon, size: 22, color: const Color(0xFF0F172A)),
        ),
      ),
    );
  }
}

class _MenuSearchBox extends StatelessWidget {
  const _MenuSearchBox({
    required this.controller,
    required this.focusNode,
    required this.searchQuery,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final String searchQuery;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 46,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFD8E4F3)),
      ),
      child: TextField(
        controller: controller,
        focusNode: focusNode,
        onChanged: onChanged,
        textCapitalization: TextCapitalization.none,
        textInputAction: TextInputAction.search,
        autocorrect: false,
        enableSuggestions: false,
        style: GoogleFonts.poppins(fontSize: 13, fontWeight: FontWeight.w500),
        decoration: InputDecoration(
          border: InputBorder.none,
          hintText: 'Search bubble tea, ice cream...',
          hintStyle: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: const Color(0xFF94A3B8),
          ),
          prefixIcon: const Icon(
            Icons.search_rounded,
            color: Color(0xFF64748B),
            size: 22,
          ),
          suffixIcon: searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(
                    Icons.close_rounded,
                    color: Color(0xFF64748B),
                  ),
                  onPressed: onClear,
                )
              : null,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 12,
          ),
        ),
      ),
    );
  }
}

class _FilterChipButton extends StatelessWidget {
  const _FilterChipButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.iconRight = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool iconRight;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        height: 34,
        constraints: const BoxConstraints(maxWidth: 108),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFDCE6F4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: iconRight
              ? [
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF1E293B),
                      ),
                    ),
                  ),
                  const SizedBox(width: 2),
                  Icon(icon, size: 16, color: const Color(0xFF334155)),
                ]
              : [
                  Icon(icon, size: 14, color: BcColors.brand),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF1E293B),
                      ),
                    ),
                  ),
                ],
        ),
      ),
    );
  }
}

class _ViewToggleButton extends StatelessWidget {
  const _ViewToggleButton({required this.onTap, required this.isGrid});
  final VoidCallback onTap;
  final bool isGrid;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        height: 34,
        width: 36,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFDCE6F4)),
        ),
        child: Icon(
          isGrid ? Icons.view_list_rounded : Icons.grid_view_rounded,
          size: 18,
          color: const Color(0xFF334155),
        ),
      ),
    );
  }
}

class _InlineQtyBar extends StatelessWidget {
  const _InlineQtyBar({
    required this.quantity,
    required this.enabled,
    required this.onPlus,
    required this.onMinus,
    required this.onFirstAdd,
  });

  final int quantity;
  final bool enabled;
  final VoidCallback onPlus;
  final VoidCallback onMinus;
  final VoidCallback onFirstAdd;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: Row(
        children: [
          _QtyButton(
            icon: Icons.remove_rounded,
            enabled: enabled && quantity > 0,
            emphasized: false,
            onTap: onMinus,
          ),
          Expanded(
            child: Center(
              child: Text(
                '${math.max(quantity, 1)}',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF0F172A),
                ),
              ),
            ),
          ),
          _QtyButton(
            icon: Icons.add_rounded,
            enabled: enabled,
            emphasized: true,
            onTap: quantity == 0 ? onFirstAdd : onPlus,
          ),
        ],
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({
    required this.icon,
    required this.enabled,
    required this.emphasized,
    required this.onTap,
  });

  final IconData icon;
  final bool enabled;
  final bool emphasized;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bg = !enabled
        ? const Color(0xFFE8EEF6)
        : emphasized
        ? BcColors.brand
        : Colors.white;
    final fg = !enabled
        ? const Color(0xFF94A3B8)
        : emphasized
        ? Colors.white
        : BcColors.brand;

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: emphasized || !enabled
                ? null
                : Border.all(color: BcColors.brand, width: 1.5),
          ),
          child: Icon(icon, size: 18, color: fg),
        ),
      ),
    );
  }
}

class _MenuCartBar extends StatelessWidget {
  const _MenuCartBar({
    required this.count,
    required this.total,
    required this.onTap,
  });

  final int count;
  final int total;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 8,
      shadowColor: Colors.black.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          height: 58,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFDCE6F4)),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 42,
                height: 38,
                child: Center(
                  child: CupIcon.fromCount(
                    itemCount: count,
                    size: CupIconSize.sm,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  '$count items • LKR ${_formatLkr(total)}',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF1E293B),
                  ),
                ),
              ),
              Container(
                height: 38,
                padding: const EdgeInsets.symmetric(horizontal: 22),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF3B82F6), Color(0xFF2563EB)],
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  children: [
                    Text(
                      'View cup',
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(
                      Icons.arrow_forward_rounded,
                      size: 18,
                      color: Colors.white,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatLkr(int value) {
    final raw = value.toString();
    final chars = raw.split('').reversed.toList();
    final out = <String>[];
    for (var i = 0; i < chars.length; i++) {
      if (i > 0 && i % 3 == 0) out.add(',');
      out.add(chars[i]);
    }
    return out.reversed.join();
  }
}
