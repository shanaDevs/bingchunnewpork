import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../core/feedback/bc_feedback.dart';
import '../../core/utils/money.dart';
import '../../features/catalog/domain/entities/product.dart';
import '../../l10n/app_localizations.dart';
import 'bc_rating_heads.dart';
import 'product_image.dart';

enum ProductCardLayout { grid, list }

/// Storefront drink cell — web `.product-card--app`.
class ProductCard extends StatefulWidget {
  const ProductCard({
    super.key,
    required this.product,
    this.onTap,
    this.onAdd,
    this.onWishlist,
    this.wishlisted = false,
    this.wishlistGuest = false,
    this.heroTag,
    this.layout = ProductCardLayout.grid,
    this.fallbackRating = Product.fallbackRating,
  });

  final Product product;
  final VoidCallback? onTap;
  final VoidCallback? onAdd;
  final VoidCallback? onWishlist;
  final bool wishlisted;
  final bool wishlistGuest;
  final String? heroTag;
  final ProductCardLayout layout;
  final double fallbackRating;

  @override
  State<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<ProductCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shine;
  bool _pressed = false;

  @override
  void initState() {
    super.initState();
    _shine = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 650),
    );
  }

  @override
  void dispose() {
    _shine.dispose();
    super.dispose();
  }

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
    final reduce = MediaQuery.of(context).disableAnimations;
    if (value && !reduce) {
      _shine.forward(from: 0);
    }
  }

  Color _tagColor(BcColors colors, String tag) {
    final t = tag.toLowerCase();
    if (t == 'coming soon') return colors.comingSoon;
    if (t == 'popular' || t == 'best seller') return colors.accent;
    if (t == 'new') return colors.success;
    return colors.brand;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<BcColors>()!;
    final l10n = AppLocalizations.of(context);
    final product = widget.product;
    final tag = product.displayTag;
    final dimmed = !product.canOrder;
    final stockLabel = product.isComingSoon
        ? l10n.comingSoon
        : (!product.canOrder
              ? l10n.outOfStock
              : (product.isLowStock ? l10n.lowStock : null));
    final reduce = MediaQuery.of(context).disableAnimations;
    final desc = product.description?.trim();
    final rating = product.avgRating ?? widget.fallbackRating;
    final semantics = [
      product.name,
      Money.lkr(product.basePrice),
      ?stockLabel,
    ].join(', ');

    final image = ProductImage(url: product.imageUrl);
    final staged = widget.heroTag == null
        ? image
        : Hero(tag: widget.heroTag!, child: image);

    return Semantics(
      label: semantics,
      button: true,
      child: Material(
        color: colors.navyCard,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(
            color: _pressed ? colors.brand : colors.navyBorder,
            width: _pressed ? 1.5 : 1,
          ),
        ),
        child: InkWell(
          onTap: () {
            BcFeedback.hfSelect();
            widget.onTap?.call();
          },
          onTapDown: (_) => _setPressed(true),
          onTapUp: (_) => _setPressed(false),
          onTapCancel: () => _setPressed(false),
          onLongPress: dimmed || widget.onAdd == null
              ? null
              : () {
                  BcFeedback.hfLongPress();
                  widget.onAdd?.call();
                },
          child: widget.layout == ProductCardLayout.list
              ? _ListBody(
                  staged: staged,
                  dimmed: dimmed,
                  reduce: reduce,
                  shine: _shine,
                  pressed: _pressed,
                  tag: tag,
                  tagColor: tag == null ? null : _tagColor(colors, tag),
                  stockLabel: stockLabel,
                  product: product,
                  desc: desc,
                  rating: rating,
                  colors: colors,
                  l10n: l10n,
                  wishlisted: widget.wishlisted,
                  wishlistGuest: widget.wishlistGuest,
                  onWishlist: widget.onWishlist,
                  onAdd: widget.onAdd,
                )
              : _GridBody(
                  staged: staged,
                  dimmed: dimmed,
                  reduce: reduce,
                  shine: _shine,
                  pressed: _pressed,
                  tag: tag,
                  tagColor: tag == null ? null : _tagColor(colors, tag),
                  stockLabel: stockLabel,
                  product: product,
                  desc: desc,
                  rating: rating,
                  colors: colors,
                  l10n: l10n,
                  wishlisted: widget.wishlisted,
                  wishlistGuest: widget.wishlistGuest,
                  onWishlist: widget.onWishlist,
                  onAdd: widget.onAdd,
                ),
        ),
      ),
    );
  }
}

class _GridBody extends StatelessWidget {
  const _GridBody({
    required this.staged,
    required this.dimmed,
    required this.reduce,
    required this.shine,
    required this.pressed,
    required this.tag,
    required this.tagColor,
    required this.stockLabel,
    required this.product,
    required this.desc,
    required this.rating,
    required this.colors,
    required this.l10n,
    required this.wishlisted,
    required this.wishlistGuest,
    required this.onWishlist,
    required this.onAdd,
  });

  final Widget staged;
  final bool dimmed;
  final bool reduce;
  final AnimationController shine;
  final bool pressed;
  final String? tag;
  final Color? tagColor;
  final String? stockLabel;
  final Product product;
  final String? desc;
  final double rating;
  final BcColors colors;
  final AppLocalizations l10n;
  final bool wishlisted;
  final bool wishlistGuest;
  final VoidCallback? onWishlist;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              Opacity(opacity: dimmed ? 0.55 : 1, child: staged),
              if (!reduce) _ShineSweep(animation: shine),
              if (pressed && !reduce && !dimmed)
                const Positioned(
                  right: 4,
                  bottom: 0,
                  child: ExcludeSemantics(
                    child: Image(
                      image: AssetImage('assets/brand/mascot-hover.png'),
                      width: 52,
                      height: 52,
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              if (tag != null && tagColor != null)
                Positioned(
                  top: 0,
                  left: 0,
                  child: _CornerTag(label: tag!.toUpperCase(), color: tagColor!),
                ),
              Positioned(
                top: 6,
                right: 6,
                child: _HeartButton(
                  wishlisted: wishlisted,
                  tooltip: wishlistGuest
                      ? l10n.signInToWishlist
                      : (wishlisted
                            ? l10n.removeWishlist
                            : l10n.saveWishlist),
                  onPressed: onWishlist,
                ),
              ),
              if (dimmed)
                ColoredBox(
                  color: Colors.black.withValues(alpha: 0.4),
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: product.isComingSoon
                            ? colors.comingSoon.withValues(alpha: 0.85)
                            : Colors.black.withValues(alpha: 0.35),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.25),
                        ),
                      ),
                      child: Text(
                        stockLabel ?? '',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
              if (!dimmed && product.isLowStock)
                Positioned(
                  left: 8,
                  bottom: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: colors.accent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      l10n.lowStock.toUpperCase(),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 10,
                        letterSpacing: 0.04,
                      ),
                    ),
                  ),
                ),
              if (!dimmed)
                Positioned(
                  bottom: 8,
                  right: 8,
                  child: _AddControl(
                    enabled: onAdd != null,
                    tooltip: l10n.addToCup,
                    onPressed: () {
                      BcFeedback.hfTap();
                      onAdd?.call();
                    },
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                product.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                  height: 1.25,
                  letterSpacing: -0.02,
                ),
              ),
              if (desc != null && desc!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  desc!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    height: 1.4,
                    letterSpacing: 0.01,
                    color: colors.textSoft,
                  ),
                ),
              ],
              const SizedBox(height: 4),
              BcRatingHeads(rating: rating),
              const SizedBox(height: 6),
              _PriceChip(amount: product.basePrice),
            ],
          ),
        ),
      ],
    );
  }
}

class _ListBody extends StatelessWidget {
  const _ListBody({
    required this.staged,
    required this.dimmed,
    required this.reduce,
    required this.shine,
    required this.pressed,
    required this.tag,
    required this.tagColor,
    required this.stockLabel,
    required this.product,
    required this.desc,
    required this.rating,
    required this.colors,
    required this.l10n,
    required this.wishlisted,
    required this.wishlistGuest,
    required this.onWishlist,
    required this.onAdd,
  });

  final Widget staged;
  final bool dimmed;
  final bool reduce;
  final AnimationController shine;
  final bool pressed;
  final String? tag;
  final Color? tagColor;
  final String? stockLabel;
  final Product product;
  final String? desc;
  final double rating;
  final BcColors colors;
  final AppLocalizations l10n;
  final bool wishlisted;
  final bool wishlistGuest;
  final VoidCallback? onWishlist;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 132,
      child: Row(
        children: [
          SizedBox(
            width: 112,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Opacity(opacity: dimmed ? 0.55 : 1, child: staged),
                if (!reduce) _ShineSweep(animation: shine),
                if (tag != null && tagColor != null)
                  Positioned(
                    top: 0,
                    left: 0,
                    child: _CornerTag(
                      label: tag!.toUpperCase(),
                      color: tagColor!,
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                  if (desc != null && desc!.isNotEmpty)
                    Text(
                      desc!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: colors.textSoft,
                      ),
                    ),
                  const SizedBox(height: 4),
                  BcRatingHeads(rating: rating),
                  const Spacer(),
                  _PriceChip(amount: product.basePrice),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _HeartButton(
                  wishlisted: wishlisted,
                  tooltip: wishlistGuest
                      ? l10n.signInToWishlist
                      : (wishlisted
                            ? l10n.removeWishlist
                            : l10n.saveWishlist),
                  onPressed: onWishlist,
                ),
                if (!dimmed)
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (product.isLowStock)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            l10n.lowStock,
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(
                                  color: colors.accent,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ),
                      _AddControl(
                        enabled: onAdd != null,
                        tooltip: l10n.addToCup,
                        onPressed: () {
                          BcFeedback.hfTap();
                          onAdd?.call();
                        },
                      ),
                    ],
                  )
                else
                  Text(
                    stockLabel ?? '',
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ShineSweep extends StatelessWidget {
  const _ShineSweep({required this.animation});

  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          final t = animation.value;
          if (t == 0 || t == 1) return const SizedBox.shrink();
          return Align(
            alignment: Alignment(-1.2 + 2.5 * t, 0),
            child: FractionallySizedBox(
              widthFactor: 0.45,
              heightFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      Colors.white.withValues(alpha: 0),
                      Colors.white.withValues(
                        alpha: Theme.of(context).brightness == Brightness.dark
                            ? 0.14
                            : 0.55,
                      ),
                      Colors.white.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PriceChip extends StatelessWidget {
  const _PriceChip({required this.amount});

  final int amount;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<BcColors>()!;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: isDark ? const Color(0x24307EF2) : null,
        gradient: isDark
            ? null
            : const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFE8F1FE), Color(0xFFD6E6FD)],
              ),
        border: isDark
            ? null
            : Border.all(color: const Color(0x1F307EF2)),
      ),
      child: Text(
        Money.lkr(amount),
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
          color: isDark ? colors.brandLight : colors.brand,
          fontWeight: FontWeight.w700,
          fontSize: 14,
          height: 1.1,
        ),
      ),
    );
  }
}

class _HeartButton extends StatelessWidget {
  const _HeartButton({
    required this.wishlisted,
    required this.tooltip,
    required this.onPressed,
  });

  final bool wishlisted;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Tooltip(
      message: tooltip,
      child: SizedBox(
        width: 48,
        height: 48,
        child: Center(
          child: Material(
            color: isDark
                ? const Color(0xD90F1428)
                : const Color(0xF0FFFFFF),
            shape: const CircleBorder(
              side: BorderSide(color: Color(0x140F172A)),
            ),
            elevation: 2,
            shadowColor: Colors.black.withValues(alpha: 0.12),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onPressed == null
                  ? null
                  : () {
                      BcFeedback.hfTap();
                      onPressed!();
                    },
              child: SizedBox(
                width: 29.6,
                height: 29.6,
                child: Icon(
                  wishlisted ? Icons.favorite : Icons.favorite_border,
                  size: 15,
                  color: wishlisted
                      ? const Color(0xFFEF4444)
                      : Theme.of(context).extension<BcColors>()!.textMuted,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CornerTag extends StatelessWidget {
  const _CornerTag({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 5, 8, 5),
      decoration: BoxDecoration(
        color: color,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(19),
          bottomRight: Radius.circular(14),
        ),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: 10,
          letterSpacing: 0.04,
          height: 1.2,
        ),
      ),
    );
  }
}

class _AddControl extends StatelessWidget {
  const _AddControl({
    required this.enabled,
    required this.onPressed,
    required this.tooltip,
  });

  final bool enabled;
  final VoidCallback onPressed;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<BcColors>()!;
    return Tooltip(
      message: tooltip,
      child: SizedBox(
        width: 48,
        height: 48,
        child: Center(
          child: Material(
            color: enabled ? colors.brand : colors.navyLight,
            shape: const CircleBorder(),
            elevation: enabled ? 4 : 0,
            shadowColor: colors.brand.withValues(alpha: 0.4),
            child: InkWell(
              onTap: onPressed,
              customBorder: const CircleBorder(),
              child: const SizedBox(
                width: 32,
                height: 32,
                child: Icon(Icons.add, size: 18, color: Colors.white),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

typedef BcProductCard = ProductCard;
