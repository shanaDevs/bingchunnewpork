'use client';

import ProductCard from '@/components/menu/ProductCard';
import type { Product } from '@/types';
import {
  isProductComingSoon,
  isProductInStock,
  isProductLowStock,
} from '@/lib/productAvailability';
import { getCategoryEmoji } from '@/lib/categoryEmojis';

export interface WishlistProductCardProps {
  product: Product;
  index?: number;
  onAddToCart: () => void;
  /** Owner wishlist: remove item. Shared: toggle viewer wishlist. */
  onToggleWishlist?: () => void;
  isWishlisted?: boolean;
  orderingClosed?: boolean;
}

/** Same card as the menu — kept as a thin wrapper for wishlist call sites. */
export default function WishlistProductCard({
  product,
  index = 0,
  onAddToCart,
  onToggleWishlist,
  isWishlisted = false,
}: WishlistProductCardProps) {
  const inStock = isProductInStock(product);
  const comingSoon = isProductComingSoon(product);

  return (
    <ProductCard
      id={product.id}
      index={index}
      layout="grid"
      name={product.name}
      basePrice={product.basePrice}
      description={product.description}
      imageUrl={product.imageUrl}
      tag={inStock ? product.tag : undefined}
      categoryName={product.category?.name}
      emoji={getCategoryEmoji(product.category?.slug ?? '')}
      isAvailable={inStock}
      isComingSoon={comingSoon}
      isLowStock={isProductLowStock(product)}
      rating={product.avgRating}
      ratingCount={product.ratingCount}
      isWishlisted={isWishlisted}
      onWishlistToggle={onToggleWishlist}
      onSelect={onAddToCart}
    />
  );
}
