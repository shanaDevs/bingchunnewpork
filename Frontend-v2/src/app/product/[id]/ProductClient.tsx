'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Heart, Minus, Plus, Star,
} from 'lucide-react';
import AddToCupIcon from '@/components/cart/AddToCupIcon';
import { api, ApiError } from '@/lib/api';
import type { Product, Topping } from '@/types';
import { selectActiveStoreId, useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useWishlistIds, useWishlistToggle } from '@/hooks/useWishlist';
import { useBranchOrderingHours } from '@/hooks/useBranchOrderingHours';
import OnlineOrderingClosedBanner from '@/components/order/OnlineOrderingClosedBanner';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import ProductCard from '@/components/menu/ProductCard';
import ProductRadialImage from '@/components/menu/ProductRadialImage';
import StarRatingInput, { StarRatingDisplay } from '@/components/ui/StarRatingInput';
import { resolveProductImageUrl } from '@/lib/productImageUrl';
import toast from 'react-hot-toast';
import { trackRecentlyViewed } from '@/lib/recentlyViewed';
import {
  getProductOrderableQty,
  getRemainingOrderQty,
  getProductDisplayTag,
  getNearbyFulfillmentStore,
  isProductComingSoon,
  isProductInStock,
  isProductLowStock,
} from '@/lib/productAvailability';

type ProductReview = {
  id: string;
  rating: number;
  text: string;
  author: string;
  createdAt: string;
};

export default function SingleProductPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  const [quantity, setQuantity] = useState(1);
  const [selectedToppings, setSelectedToppings] = useState<Set<Topping>>(new Set());
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [galleryHovered, setGalleryHovered] = useState(false);
  const reduceMotion = useReducedMotion();

  const [newRating, setNewRating] = useState(5);
  const [newAuthor, setNewAuthor] = useState('');
  const [newReviewText, setNewReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setNewAuthor(user.name);
    }
  }, [user]);

  /** Carousel: 3–5★ reviews with comments, newest first, last 20 only. */
  const { data: carouselReviews = [] } = useQuery<ProductReview[]>({
    queryKey: ['product-reviews', id, 'minStars-3'],
    queryFn: () =>
      api.get(`/menu/products/${id}/ratings?minStars=3&withComment=true&limit=20`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (carouselReviews.length <= 1) return;
    const timer = setInterval(() => {
      setReviewIndex((prev) => (prev + 1) % carouselReviews.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [carouselReviews.length]);

  useEffect(() => {
    if (carouselReviews.length === 0) {
      setReviewIndex(0);
      return;
    }
    setReviewIndex((prev) => prev % carouselReviews.length);
  }, [carouselReviews.length]);

  const handlePrevReview = () => {
    if (carouselReviews.length <= 1) return;
    setReviewIndex((prev) => (prev - 1 + carouselReviews.length) % carouselReviews.length);
  };

  const handleNextReview = () => {
    if (carouselReviews.length <= 1) return;
    setReviewIndex((prev) => (prev + 1) % carouselReviews.length);
  };

  const visibleReviews = useMemo(() => {
    if (carouselReviews.length === 0) return [];
    const count = Math.min(4, carouselReviews.length);
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push(carouselReviews[(reviewIndex + i) % carouselReviews.length]);
    }
    return list;
  }, [reviewIndex, carouselReviews]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newAuthor.trim();
    const comment = newReviewText.trim();

    if (name.length <= 3) {
      toast.error('Name must be more than 3 characters.');
      return;
    }
    if (!comment) {
      toast.error('Please write a review.');
      return;
    }

    setSubmittingReview(true);
    try {
      await api.post(
        `/menu/products/${id}/rating`,
        { stars: newRating, comment, name },
        isAuthenticated,
      );
      setNewReviewText('');
      if (!isAuthenticated || !user?.name) {
        setNewAuthor('');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-reviews', id] }),
        queryClient.invalidateQueries({ queryKey: ['product', id] }),
      ]);
      toast.success('Thank you! Your review has been added.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not submit review.';
      toast.error(message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const activeStoreId = useCartStore(selectActiveStoreId);
  const cartHydrated = useCartHydrated();

  const { data: product, isLoading, isError } = useQuery<Product>({
    queryKey: ['product', id, activeStoreId],
    queryFn: () =>
      api.get(`/menu/products/${id}${activeStoreId ? `?storeId=${activeStoreId}` : ''}`),
  });

  useEffect(() => {
    if (id) trackRecentlyViewed(id);
  }, [id]);

  const { data: recommendedProducts = [] } = useQuery<Product[]>({
    queryKey: ['products', 'recommendations', activeStoreId],
    queryFn: () =>
      api.get(`/menu/products${activeStoreId ? `?storeId=${activeStoreId}` : ''}`),
  });

  const { data: wishlistIds = [] } = useWishlistIds();
  const { toggle: toggleWishlist } = useWishlistToggle();
  const isWishlisted = wishlistIds.includes(id);
  const branchOrdering = useBranchOrderingHours();
  const orderingClosed = branchOrdering.hasBranch && !branchOrdering.isOpen;

  const recommendationProducts = useMemo(
    () => recommendedProducts.filter((p) => p.id !== id).slice(0, 10),
    [recommendedProducts, id],
  );

  const availableToppings = useMemo(
    () => (product?.toppings ?? []).map((pt) => pt.topping).filter((t) => t.isAvailable),
    [product?.toppings]
  );

  const toppingsExtra = Array.from(selectedToppings).reduce((acc, t) => acc + (t.extraPrice || 0), 0);
  const unitPrice = (product?.basePrice || 0) + toppingsExtra;
  const inStock = product ? isProductInStock(product) : false;
  const comingSoon = product ? isProductComingSoon(product) : false;
  const lowStock = product ? isProductLowStock(product) : false;
  const displayTag = product ? getProductDisplayTag(product) : undefined;
  const orderableQty = product ? getProductOrderableQty(product) : 0;
  const remainingQty = product ? getRemainingOrderQty(product, cartItems) : 0;
  const maxPickerQty = remainingQty === Number.MAX_SAFE_INTEGER ? 99 : remainingQty;

  useEffect(() => {
    if (maxPickerQty <= 0) {
      setQuantity(1);
      return;
    }
    setQuantity((q) => Math.min(Math.max(1, q), maxPickerQty));
  }, [maxPickerQty, id]);

  const galleryImages = useMemo(() => {
    if (product?.imageUrls?.length) return product.imageUrls.filter(Boolean);
    return product?.imageUrl ? [product.imageUrl] : [];
  }, [product?.imageUrl, product?.imageUrls]);

  const handleToggleTopping = (t: Topping) => {
    setSelectedToppings((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleAddToCart = () => {
    if (!product) return;

    if (orderingClosed) {
      toast.error('Online ordering is closed. Save this item to your wishlist instead.');
      return;
    }

    if (!inStock) {
      toast.error(comingSoon ? 'This item is coming soon at your branch.' : 'This item is out of stock at your branch.');
      return;
    }

    if (cartHydrated) {
      const state = useCartStore.getState();
      if (!hasCompletedOrderSetup(state)) {
        openOrderModal({ allowSkip: true });
        return;
      }
    }

    const result = addItem({
      product,
      size: 'REGULAR',
      toppings: Array.from(selectedToppings),
      quantity,
      unitPrice,
      fulfillmentStore: getNearbyFulfillmentStore(product, activeStoreId),
    });

    if (!result.ok) {
      if (result.reason === 'ordering_closed') {
        toast.error('Online ordering is closed. Save this item to your wishlist instead.');
        return;
      }
      toast.error(
        orderableQty === Number.MAX_SAFE_INTEGER
          ? 'Unable to add this item to your cup.'
          : `Only ${orderableQty} available at your branch.`,
      );
      return;
    }
    if (result.clamped) {
      toast.error('Quantity adjusted to match stock at your branch.');
    }

    toast.success(`${product.name} added to your cup!`);
  };

  if (isLoading) {
    return (
      <div className="product-page min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="product-page min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold text-fg mb-2">Product Not Found</h2>
        <p className="text-muted mb-6">The product you are looking for does not exist or has been removed.</p>
        <button onClick={() => router.back()} className="px-6 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-full font-semibold shadow-md">
          Back to Menu
        </button>
      </div>
    );
  }

  const descriptionText = product.description?.trim() ||
    'A signature treat crafted with artisanal caramelized sugar, premium Ceylon tea, and fresh whole milk. Features house-made boba pearls slow-cooked to perfection, with caramelized tapioca and chewy-fresh heavy boba.';

  const ingredientsText = product.ingredients?.trim() ||
    'Premium Black Tea, Fresh Whole Milk, Brown Sugar Syrup, Tapioca Pearls, Cassava Starch.';

  const resolvedMainImage = resolveProductImageUrl(galleryImages[activeImgIndex] || product.imageUrl);

  return (
    <div className="product-page min-h-screen pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 space-y-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-brand transition-colors py-1 px-2 rounded-lg hover:bg-navy-card"
          >
            <ChevronLeft size={16} />
            <span>Back to Menu</span>
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-5 space-y-4">
            <div
              className="product-page__gallery product-card--app rounded-3xl aspect-square w-full relative"
              onMouseEnter={() => setGalleryHovered(true)}
              onMouseLeave={() => setGalleryHovered(false)}
            >
              <div className="product-card__image-area h-full min-h-0">
                <ProductRadialImage
                  key={activeImgIndex}
                  imageUrl={resolvedMainImage ?? undefined}
                  alt={product.name}
                  emoji="🍦"
                  className="h-full w-full"
                />
              </div>

              <motion.div
                className="product-card__mascot product-page__gallery-mascot"
                initial={false}
                animate={
                  galleryHovered && !reduceMotion
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: -12 }
                }
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden
              >
                <Image
                  src="/brand/mascot-hover.png"
                  alt=""
                  width={56}
                  height={56}
                  className="product-card__mascot-img product-page__gallery-mascot-img"
                />
              </motion.div>

              {displayTag && (
                <span className={`product-card__tag absolute top-0 left-0 z-[6] rounded-br-[14px] rounded-tl-[19px] ${
                  comingSoon
                    ? 'product-card__tag--coming-soon'
                    : !inStock
                      ? 'product-card__tag--oos'
                      : 'product-card__tag--brand'
                }`}>
                  {displayTag}
                </span>
              )}
            </div>

            {galleryImages.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {galleryImages.map((img, idx) => {
                const resolvedThumb = resolveProductImageUrl(img || product.imageUrl);
                const isActive = activeImgIndex === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImgIndex(idx)}
                    aria-label={`Show image ${idx + 1}`}
                    aria-pressed={isActive}
                    className={`product-page__thumb product-card--app rounded-2xl aspect-square w-full ${
                      isActive ? 'product-card--active' : ''
                    }`}
                  >
                    <div className="product-card__image-area h-full min-h-0">
                      <ProductRadialImage
                        imageUrl={resolvedThumb ?? undefined}
                        alt={`${product.name} view ${idx + 1}`}
                        emoji="🍦"
                        className="h-full w-full"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            )}
          </div>

          <div className="xl:col-span-4 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl sm:text-2xl font-extrabold text-fg leading-tight">
                {product.name}
              </h1>

              <button
                onClick={() => toggleWishlist(id, isWishlisted)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-bold transition-all shrink-0 ${
                  isWishlisted
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : 'product-page__chip hover:border-red-400/60'
                }`}
              >
                <Heart size={14} fill={isWishlisted ? 'currentColor' : 'none'} className={isWishlisted ? 'text-red-400' : 'text-muted'} />
                <span>{product.wishlistCount ?? 0}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold">
              <StarRatingDisplay value={Math.round(product.avgRating || 0)} size={18} className="justify-start" />
              <span className="text-fg font-bold">
                {product.avgRating != null ? product.avgRating.toFixed(1) : '—'}
              </span>
              <span className="text-muted">·</span>
              <span className="text-muted underline cursor-pointer">
                {product.ratingCount ?? 0} {(product.ratingCount ?? 0) === 1 ? 'Review' : 'Reviews'}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-2">
              <div className="text-2xl sm:text-3xl font-extrabold text-fg">
                LKR {(unitPrice * quantity).toLocaleString()}
              </div>
              {quantity > 1 && (
                <span className="text-[11px] font-bold text-muted">
                  LKR {unitPrice.toLocaleString()} × {quantity}
                </span>
              )}
              {toppingsExtra > 0 && (
                <span className="text-[11px] font-bold text-brand-light bg-brand-subtle border border-brand/30 px-2 py-0.5 rounded-full">
                  +LKR {toppingsExtra} toppings
                </span>
              )}
            </div>

            {availableToppings.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted uppercase tracking-wider block">
                  Toppings
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableToppings.map((t) => {
                    const isSel = selectedToppings.has(t);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleToggleTopping(t)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all flex items-center gap-1 product-page__chip ${
                          isSel ? 'product-page__chip--active' : ''
                        }`}
                      >
                        <span>{t.name}</span>
                        <span className="text-[10px] opacity-75">(+{t.extraPrice})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {orderingClosed && (
              <OnlineOrderingClosedBanner
                className="mb-3"
                message={branchOrdering.closedMessage}
              />
            )}

            <div className="flex items-center gap-3 pt-1">
              {orderingClosed ? (
                <button
                  type="button"
                  onClick={() => {
                    toggleWishlist(id, isWishlisted);
                    toast.success(isWishlisted ? 'Removed from wishlist' : 'Saved to wishlist');
                  }}
                  className="flex-1 py-3 px-5 bg-brand hover:bg-brand-dark text-white rounded-full font-bold text-sm shadow-lg shadow-brand/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Heart size={16} fill={isWishlisted ? 'currentColor' : 'none'} />
                  <span>{isWishlisted ? 'Saved to wishlist' : 'Save to wishlist'}</span>
                </button>
              ) : (
              <button
                onClick={handleAddToCart}
                disabled={!inStock || maxPickerQty <= 0}
                className="flex-1 py-3 px-5 bg-brand hover:bg-brand-dark text-white rounded-full font-bold text-sm shadow-lg shadow-brand/25 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <AddToCupIcon inverted className="add-to-cup-icon--btn" />
                <span>{inStock ? 'Add to Cup' : comingSoon ? 'Coming Soon' : 'Out of Stock'}</span>
              </button>
              )}

              <div className="flex items-center gap-2.5 product-page__chip px-3 py-2 rounded-full shadow-sm">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="text-muted hover:text-fg disabled:opacity-30"
                >
                  <Minus size={14} />
                </button>
                <span className="font-bold text-xs w-4 text-center text-fg">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(maxPickerQty, q + 1))}
                  disabled={quantity >= maxPickerQty}
                  className="text-muted hover:text-fg disabled:opacity-30"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            {inStock && lowStock && (
              <p className="text-xs text-amber-500 font-semibold">Low stock at your branch</p>
            )}

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-fg uppercase tracking-wider">Review Carousel</h3>
                {carouselReviews.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePrevReview}
                      className="w-6 h-6 rounded-full border border-navy-border bg-navy-card flex items-center justify-center text-muted hover:bg-navy-light hover:text-fg transition-colors active:scale-95"
                      title="Previous reviews"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextReview}
                      className="w-6 h-6 rounded-full border border-navy-border bg-navy-card flex items-center justify-center text-muted hover:bg-navy-light hover:text-fg transition-colors active:scale-95"
                      title="Next reviews"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {visibleReviews.map((rev, idx) => (
                  <motion.div
                    key={`${rev.id}-${reviewIndex}-${idx}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="product-page__surface rounded-2xl p-3 space-y-1.5"
                  >
                    <StarRatingDisplay value={rev.rating} size={16} className="justify-start" />
                    <p className="text-[11px] font-semibold text-fg line-clamp-2 leading-snug whitespace-pre-wrap break-words">
                      &ldquo;{rev.text}&rdquo;
                    </p>
                    <div className="pt-0.5">
                      <span className="text-[10px] font-bold text-muted truncate block">
                        {rev.author}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="xl:col-span-3 space-y-4">
            <div className="product-page__surface rounded-3xl p-5 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-fg uppercase tracking-wider mb-2">
                  Description
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  {descriptionText}
                </p>
              </div>

              <div className="border-t border-navy-border pt-3">
                <h3 className="text-xs font-bold text-fg uppercase tracking-wider mb-2">
                  Ingredients
                </h3>
                <p className="text-xs text-muted leading-relaxed font-medium">
                  {ingredientsText}
                </p>
              </div>
            </div>

            <div className="product-page__surface rounded-3xl p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-navy-border pb-2.5">
                <h3 className="text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-1.5">
                  <Star size={16} className="text-amber-400" fill="currentColor" strokeWidth={1.5} />
                  <span>Add Review</span>
                </h3>
              </div>

              <form onSubmit={handleSubmitReview} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                    Rating
                  </label>
                  <div className="bg-brand-subtle p-2 rounded-xl flex items-center justify-between border border-brand/25">
                    <StarRatingInput
                      value={newRating}
                      onChange={setNewRating}
                      size={22}
                      showLabel={false}
                      className="[&>div]:justify-start [&>div]:gap-1"
                    />
                    <span className="text-xs font-bold text-brand-light">{newRating}/5</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    placeholder="Enter your name"
                    minLength={4}
                    maxLength={100}
                    required
                    className="product-page__input w-full px-3 py-1.5 text-xs rounded-xl font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                    Your Review
                  </label>
                  <textarea
                    value={newReviewText}
                    onChange={(e) => setNewReviewText(e.target.value)}
                    placeholder="Share your thoughts… emoji welcome 😊"
                    rows={3}
                    required
                    inputMode="text"
                    className="product-page__input w-full px-3 py-1.5 text-xs rounded-xl resize-y font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingReview}
                  className="w-full py-2 px-3 bg-brand hover:bg-brand-dark text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <span>{submittingReview ? 'Submitting…' : 'Submit Review'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        <section className="product-page__recommendations space-y-3 pt-4">
          <h2 className="text-base sm:text-lg font-bold text-fg">
            You might also like
          </h2>

          <div className="product-page__recommendations-grid product-card-grid">
            {recommendationProducts.map((recProduct, idx) => (
              <ProductCard
                key={recProduct.id}
                id={recProduct.id}
                layout="grid"
                name={recProduct.name}
                basePrice={recProduct.basePrice}
                description={recProduct.description}
                imageUrl={recProduct.imageUrl}
                tag={isProductInStock(recProduct) ? recProduct.tag : undefined}
                isAvailable={isProductInStock(recProduct)}
                isComingSoon={isProductComingSoon(recProduct)}
                isLowStock={isProductLowStock(recProduct)}
                index={idx}
                rating={recProduct.avgRating}
                ratingCount={recProduct.ratingCount}
                onSelect={() => router.push(`/product/${recProduct.id}`)}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
