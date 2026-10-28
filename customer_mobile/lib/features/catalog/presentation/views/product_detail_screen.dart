import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/utils/money.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/bc_buttons.dart';
import '../../../../shared/widgets/error_state.dart';
import '../../../../shared/widgets/loading_state.dart';
import '../../../../shared/widgets/product_image.dart';
import '../../../fulfillment/presentation/providers/fulfillment_providers.dart';
import '../../domain/entities/product_detail.dart';
import '../catalog_order_actions.dart';
import '../providers/catalog_dependencies.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  late Future<ProductDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<ProductDetail> _load() async {
    final storeId = ref.read(orderSetupProvider).storeId;
    final result = await ref.read(getProductByIdProvider)(
      widget.productId,
      storeId: storeId,
    );
    if (result.failure != null || result.data == null) {
      throw result.failure ?? Exception('missing');
    }
    return result.data!;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return FutureBuilder(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return Scaffold(appBar: AppBar(), body: const LoadingState());
        }
        if (snapshot.hasError) {
          final err = snapshot.error;
          if (err is NotFoundFailure) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (context.mounted) context.go('/404');
            });
            return Scaffold(appBar: AppBar(), body: const LoadingState());
          }
          return Scaffold(
            appBar: AppBar(),
            body: ErrorState(
              message: err is Failure ? err.message : l10n.noProducts,
              onRetry: () => setState(() => _future = _load()),
            ),
          );
        }
        final detail = snapshot.data!;
        final product = detail.product;
        return Scaffold(
          appBar: AppBar(title: Text(product.name)),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: Hero(
                  tag: 'product-${product.id}',
                  child: ProductImage(url: product.imageUrl, size: 200),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                product.name,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(Money.lkr(product.basePrice)),
              if (product.description != null) ...[
                const SizedBox(height: 8),
                Text(product.description!),
              ],
              if (!product.canOrder)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    product.isComingSoon ? l10n.comingSoon : l10n.outOfStock,
                  ),
                )
              else if (product.isLowStock)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    l10n.lowStock,
                    style: TextStyle(
                      color: Theme.of(context).extension<BcColors>()!.accent,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          bottomNavigationBar: product.canOrder
              ? SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child:                     BcPrimaryButton(
                      label: l10n.addToCup,
                      onPressed: () =>
                          startAddToCup(context, ref, product),
                    ),
                  ),
                )
              : null,
        );
      },
    );
  }
}
