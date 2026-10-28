import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/wishlist_provider.dart';
import '../theme/bc_theme.dart';
import '../widgets/product_add_sheet.dart';
import '../widgets/product_radial_image.dart';
import '../widgets/wishlist_heart_button.dart';

class WishlistScreen extends ConsumerStatefulWidget {
  const WishlistScreen({super.key});

  @override
  ConsumerState<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends ConsumerState<WishlistScreen> {
  List<Product> _products = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final products = await api.get<List<Product>>(
        '/wishlist',
        listParser: (list) => list.map((e) {
          final map = e as Map<String, dynamic>;
          final product = map['product'] as Map<String, dynamic>? ?? map;
          return Product.fromJson(product);
        }).toList(),
      );
      if (!mounted) return;
      setState(() {
        _products = products;
        _loading = false;
      });
      await ref.read(wishlistProvider.notifier).fetchIds();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ids = ref.watch(wishlistProvider.select((s) => s.productIds));
    final visible = _products.where((p) => ids.contains(p.id)).toList();
    final top = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          Container(
            padding: EdgeInsets.fromLTRB(8, top + 8, 16, 12),
            color: Colors.white,
            child: Row(
              children: [
                IconButton(
                  onPressed: () => context.pop(),
                  icon: const Icon(Icons.arrow_back_rounded, color: Color(0xFF0F172A)),
                ),
                Expanded(
                  child: Text(
                    'Wishlist',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFF0F172A),
                    ),
                  ),
                ),
                if (visible.isNotEmpty)
                  Text(
                    '${visible.length}',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF64748B),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!, style: GoogleFonts.poppins(color: const Color(0xFF64748B))),
                            TextButton(onPressed: _load, child: const Text('Retry')),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        color: BcColors.brand,
                        onRefresh: _load,
                        child: visible.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                children: [
                                  const SizedBox(height: 80),
                                  Icon(Icons.favorite_border_rounded, size: 48, color: Colors.grey.shade400),
                                  const SizedBox(height: 12),
                                  Center(
                                    child: Text(
                                      'No favourites yet',
                                      style: GoogleFonts.poppins(
                                        fontWeight: FontWeight.w600,
                                        color: const Color(0xFF64748B),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Center(
                                    child: Text(
                                      'Tap the heart on a drink to save it here',
                                      textAlign: TextAlign.center,
                                      style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF94A3B8)),
                                    ),
                                  ),
                                ],
                              )
                            : ListView.separated(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                                itemCount: visible.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 10),
                                itemBuilder: (context, index) {
                                  final product = visible[index];
                                  return Material(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(16),
                                      onTap: () => showProductAddSheet(context, product),
                                      child: Padding(
                                        padding: const EdgeInsets.all(10),
                                        child: Row(
                                          children: [
                                            ProductRadialImage(
                                              imageUrl: product.imageUrl,
                                              width: 72,
                                              height: 72,
                                              borderRadius: BorderRadius.circular(14),
                                              placeholderIcon: Icons.icecream,
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    product.name,
                                                    maxLines: 2,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: GoogleFonts.poppins(
                                                      fontWeight: FontWeight.w700,
                                                      fontSize: 14,
                                                      color: const Color(0xFF0F172A),
                                                    ),
                                                  ),
                                                  const SizedBox(height: 4),
                                                  Text(
                                                    'LKR ${product.basePrice}',
                                                    style: GoogleFonts.poppins(
                                                      fontWeight: FontWeight.w800,
                                                      fontSize: 13,
                                                      color: BcColors.brand,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                            WishlistHeartButton(productId: product.id, iconSize: 18, padding: 8),
                                          ],
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
          ),
        ],
      ),
    );
  }
}
