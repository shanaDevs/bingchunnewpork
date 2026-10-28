'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Heart,
  Sparkles,
  Share2,
  Trash2,
  ChevronRight,
  Clock,
  Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AddToCupIcon from '@/components/cart/AddToCupIcon';
import AnimatedMascot from '@/components/mascot/AnimatedMascot';
import ProductDrawer from '@/components/menu/ProductDrawer';
import WishlistProductCard from '@/components/wishlist/WishlistProductCard';
import WishlistScrollRail from '@/components/wishlist/WishlistScrollRail';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { deferUntilOrderSetup } from '@/lib/postOrderSetupAction';
import { useCartStore, calcUnitPrice, selectActiveStoreId } from '@/store/cartStore';
import { useWishlistToggle, useClearWishlist, useWishlistIds, createWishlistShareLink, type WishlistItem } from '@/hooks/useWishlist';
import { useBranchOrderingHours } from '@/hooks/useBranchOrderingHours';
import OnlineOrderingClosedBanner from '@/components/order/OnlineOrderingClosedBanner';
import { isProductInStock } from '@/lib/productAvailability';
import { computeWishlistStats, groupWishlistCategories } from '@/lib/wishlistStats';
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';
import { confirmDialog } from '@/store/confirmStore';
import { api } from '@/lib/api';
import type { Product } from '@/types';

interface WishlistDashboardProps {
  items: WishlistItem[];
  isLoading?: boolean;
  variant?: 'owner' | 'shared';
  ownerName?: string;
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function WishlistDashboard({ items, isLoading, variant = 'owner', ownerName }: WishlistDashboardProps) {
  const isOwner = variant === 'owner';
  const isShared = variant === 'shared';
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const addItem = useCartStore((s) => s.addItem);
  const activeStoreId = useCartStore(selectActiveStoreId);
  const branchOrdering = useBranchOrderingHours();

  const { toggle: toggleWishlist } = useWishlistToggle();
  const { data: viewerWishlistIds = [] } = useWishlistIds();
  const viewerWishlistSet = useMemo(() => new Set(viewerWishlistIds), [viewerWishlistIds]);
  const clearWishlist = useClearWishlist();

  useEffect(() => {
    setRecentIds(getRecentlyViewedIds());
  }, [items.length]);

  const products = useMemo(() => items.map((item) => item.product), [items]);
  const stats = useMemo(() => computeWishlistStats(products), [products]);
  const categories = useMemo(() => groupWishlistCategories(products), [products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter((p) => p.category?.id === selectedCategory);
  }, [products, selectedCategory]);

  const wishlistIdSet = useMemo(() => new Set(products.map((p) => p.id)), [products]);

  const { data: recommended = [] } = useQuery<Product[]>({
    queryKey: ['products', 'popular', 'wishlist-rec', activeStoreId],
    queryFn: () => {
      const params = new URLSearchParams({ tag: 'Popular' });
      if (activeStoreId) params.append('storeId', activeStoreId);
      return api.get(`/menu/products?${params.toString()}`);
    },
    staleTime: 120_000,
  });

  const recommendedFiltered = useMemo(
    () => recommended.filter((p) => !wishlistIdSet.has(p.id)).slice(0, 8),
    [recommended, wishlistIdSet],
  );

  const { data: recentProducts = [] } = useQuery<Product[]>({
    queryKey: ['products', 'recently-viewed', recentIds, activeStoreId],
    queryFn: async () => {
      const ids = recentIds.filter((id) => !wishlistIdSet.has(id)).slice(0, 8);
      if (ids.length === 0) return [];
      const results = await Promise.all(
        ids.map((id) =>
          api
            .get<Product>(`/menu/products/${id}${activeStoreId ? `?storeId=${activeStoreId}` : ''}`)
            .catch(() => null),
        ),
      );
      return results.filter((p): p is Product => p != null);
    },
    enabled: recentIds.length > 0,
    staleTime: 60_000,
  });

  const handleProductSelect = useCallback((product: Product) => {
    if (!isProductInStock(product)) return;
    const cartState = useCartStore.getState();
    if (!hasCompletedOrderSetup(cartState)) {
      deferUntilOrderSetup(() => setSelectedProduct(product));
      openOrderModal();
      return;
    }
    setSelectedProduct(product);
  }, []);

  const handleAddAll = useCallback(() => {
    if (branchOrdering.hasBranch && !branchOrdering.isOpen) {
      toast.error(
        isOwner
          ? 'Online ordering is closed. Your wishlist is saved for when we reopen.'
          : 'Online ordering is closed. Please try again when we reopen.',
      );
      return;
    }
    const runAddAll = () => {
      let added = 0;
      for (const product of filteredProducts) {
        if (!isProductInStock(product)) continue;
        const result = addItem({
          product,
          size: 'REGULAR',
          toppings: [],
          quantity: 1,
          unitPrice: calcUnitPrice(product, 'REGULAR', []),
        }, { quiet: true });
        if (result.ok) added += 1;
      }
      if (added > 0) toast.success(`Added ${added} item${added === 1 ? '' : 's'} to your cup`);
      else toast.error('No in-stock items to add');
    };
    const cartState = useCartStore.getState();
    if (!hasCompletedOrderSetup(cartState)) {
      deferUntilOrderSetup(runAddAll);
      openOrderModal();
      return;
    }
    runAddAll();
  }, [addItem, filteredProducts, branchOrdering.hasBranch, branchOrdering.isOpen, isOwner]);

  const handleShare = useCallback(async () => {
    const title = isOwner ? 'My Bing Chun Wishlist' : `${ownerName ?? 'A friend'}'s Bing Chun Wishlist`;
    const text = isOwner
      ? `Check out my favourite bubble tea picks on Bing Chun Sri Lanka (${stats.savedItems} saved)`
      : `Check out ${ownerName ?? 'a friend'}'s favourite bubble tea picks on Bing Chun Sri Lanka (${stats.savedItems} saved)`;
    let url = typeof window !== 'undefined' ? window.location.href : '';
    if (isOwner) {
      try {
        const token = await createWishlistShareLink();
        url = `${window.location.origin}/wishlist/shared/${token}`;
      } catch {
        toast.error('Could not create share link');
        return;
      }
    }
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Wishlist link copied!');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Wishlist link copied!');
      } catch {
        toast.error('Could not copy wishlist link');
      }
    }
  }, [stats.savedItems, isOwner, ownerName]);

  const handleClear = useCallback(async () => {
    if (products.length === 0) return;
    const ok = await confirmDialog({
      title: 'Clear wishlist?',
      message: 'Remove all saved items from your wishlist. This cannot be undone.',
      confirmLabel: 'Clear all',
      variant: 'danger',
    });
    if (!ok) return;
    clearWishlist.mutate(products.map((p) => p.id), {
      onSuccess: () => toast.success('Wishlist cleared'),
      onError: () => toast.error('Could not clear wishlist'),
    });
  }, [clearWishlist, products]);

  const isEmpty = !isLoading && products.length === 0;

  return (
    <div className={`wishlist-dash${isShared ? ' wishlist-dash--shared' : ''}`}>
      <div className="wishlist-dash__bubbles" aria-hidden>
        <span className="wishlist-dash__bubble wishlist-dash__bubble--1" />
        <span className="wishlist-dash__bubble wishlist-dash__bubble--2" />
        <span className="wishlist-dash__bubble wishlist-dash__bubble--3" />
        <span className="wishlist-dash__bubble wishlist-dash__bubble--4" />
      </div>

      <div className="wishlist-dash__sticky">
        <div className="wishlist-dash__topbar">
          <div className="wishlist-dash__topbar-copy">
            <Heart size={18} className="wishlist-dash__topbar-icon" fill="currentColor" aria-hidden />
            <span className="wishlist-dash__topbar-title">
              {isShared ? `${ownerName ?? 'Shared'} Wishlist` : 'My Wishlist'}
            </span>
            {!isEmpty && (
              <span className="wishlist-dash__topbar-count">{stats.savedItems}</span>
            )}
          </div>
        </div>
      </div>

      {/* Hero */}
      <motion.section className="wishlist-dash__hero" {...fadeUp} transition={{ duration: 0.45 }}>
        {branchOrdering.hasBranch && !branchOrdering.isOpen && (
          <div className="wishlist-dash__section-inner px-4 pb-4 max-w-6xl mx-auto w-full">
            <OnlineOrderingClosedBanner message={branchOrdering.closedMessage} />
          </div>
        )}
        <div className="wishlist-dash__hero-glow" aria-hidden />
        <div className="wishlist-dash__hero-inner">
          <div className="wishlist-dash__hero-copy">
            <span className="wishlist-dash__eyebrow">
              <Sparkles size={14} strokeWidth={2.25} aria-hidden />
              {isShared ? 'Shared with you' : 'Saved with love'}
            </span>
            <h1 className="wishlist-dash__hero-title">
              {isShared ? `${ownerName ?? 'A friend'}'s Favourites` : 'My Favourite Collection'}
            </h1>
            <p className="wishlist-dash__hero-lead">
              {isShared
                ? 'Add any drinks you like to your own cup — no account needed.'
                : 'Your curated bubble tea & treats — ready to order whenever the craving hits.'}
            </p>
          </div>
          <div className="wishlist-dash__hero-visual" aria-hidden>
            <AnimatedMascot pose="cup-offer" size="md" showCup showBubble={false} />
          </div>
        </div>
      </motion.section>

      {isLoading ? (
        <div className="wishlist-dash__grid wishlist-dash__grid--loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="wishlist-card wishlist-card--skeleton" />
          ))}
        </div>
      ) : isEmpty ? (
        <motion.section
          className="wishlist-dash__empty"
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="wishlist-dash__empty-bubbles" aria-hidden>
            <span /><span /><span />
          </div>
          <AnimatedMascot pose="wave" size="md" showCup={false} showBubble={false} />
          <h2 className="wishlist-dash__empty-title">
            {isShared ? 'This shared wishlist is empty' : 'Your wishlist is empty'}
          </h2>
          <p className="wishlist-dash__empty-text">
            {isShared
              ? 'The owner has not saved any drinks yet. Browse the menu to find your own favourites.'
              : "Tap the heart on drinks you love — they'll appear here like magic."}
          </p>
          <Link href="/menu" className="wishlist-dash__btn wishlist-dash__btn--primary">
            Browse Drinks <ChevronRight size={16} />
          </Link>
        </motion.section>
      ) : (
        <>
          {/* Filters + actions in one row */}
          <motion.div
            className="wishlist-dash__toolbar"
            {...fadeUp}
            transition={{ duration: 0.45, delay: 0.08 }}
          >
            <div className="wishlist-dash__filters" role="tablist" aria-label="Filter by category">
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategory === 'all'}
                className={`wishlist-dash__chip ${selectedCategory === 'all' ? 'wishlist-dash__chip--active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All ({products.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === cat.id}
                  className={`wishlist-dash__chip ${selectedCategory === cat.id ? 'wishlist-dash__chip--active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.name} ({cat.count})
                </button>
              ))}
            </div>
            <div className="wishlist-dash__toolbar-actions">
              <button
                type="button"
                className="wishlist-dash__quick-btn"
                onClick={handleAddAll}
                disabled={branchOrdering.hasBranch && !branchOrdering.isOpen}
              >
                <AddToCupIcon inverted className="add-to-cup-icon--btn" /> Add All
              </button>
              <button type="button" className="wishlist-dash__quick-btn" onClick={handleShare}>
                <Share2 size={16} /> Share
              </button>
              {isOwner && (
                <button
                  type="button"
                  className="wishlist-dash__quick-btn wishlist-dash__quick-btn--danger"
                  onClick={handleClear}
                  disabled={clearWishlist.isPending}
                >
                  <Trash2 size={16} /> Clear
                </button>
              )}
            </div>
          </motion.div>

          {/* Product grid */}
          <>
            {isShared && (
              <div className="wishlist-dash__shared-mobile-rail">
                <div className="wishlist-dash__section-head">
                  <h2 className="wishlist-dash__section-title">
                    <Heart size={18} fill="currentColor" aria-hidden /> Shared picks
                  </h2>
                  <p className="wishlist-dash__section-sub">Swipe to browse — tap + to add to your cup</p>
                </div>
                <WishlistScrollRail ariaLabel="Shared wishlist products">
                  {filteredProducts.map((product, i) => {
                    const wishlisted = viewerWishlistSet.has(product.id);
                    return (
                      <div key={product.id} className="wishlist-dash__rail-item">
                        <WishlistProductCard
                          product={product}
                          index={i}
                          orderingClosed={branchOrdering.hasBranch && !branchOrdering.isOpen}
                          onAddToCart={() => handleProductSelect(product)}
                          isWishlisted={wishlisted}
                          onToggleWishlist={() => toggleWishlist(product.id, wishlisted)}
                        />
                      </div>
                    );
                  })}
                </WishlistScrollRail>
              </div>
            )}
            <div
              className={`wishlist-dash__grid product-card-grid${isShared ? ' wishlist-dash__shared-desktop-grid' : ''}`}
            >
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product, i) => {
                  const wishlisted = isShared
                    ? viewerWishlistSet.has(product.id)
                    : true;
                  return (
                    <div key={product.id} className="wishlist-dash__grid-cell">
                      <WishlistProductCard
                        product={product}
                        index={i}
                        orderingClosed={branchOrdering.hasBranch && !branchOrdering.isOpen}
                        onAddToCart={() => handleProductSelect(product)}
                        isWishlisted={wishlisted}
                        onToggleWishlist={() => toggleWishlist(product.id, wishlisted)}
                      />
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          </>

          {filteredProducts.length === 0 && selectedCategory !== 'all' && (
            <p className="wishlist-dash__filter-empty">No items in this category.</p>
          )}
        </>
      )}

      {/* Recently viewed */}
      {recentProducts.length > 0 && (
        <motion.section
          className="wishlist-dash__section"
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.12 }}
        >
          <div className="wishlist-dash__section-head">
            <div>
              <h2 className="wishlist-dash__section-title">
                <Clock size={18} aria-hidden /> Recently Viewed
              </h2>
              <p className="wishlist-dash__section-sub">Pick up where you left off</p>
            </div>
          </div>
          <WishlistScrollRail ariaLabel="Recently viewed products">
            {recentProducts.map((product, i) => {
              const wishlisted = viewerWishlistSet.has(product.id);
              return (
                <div key={product.id} className="wishlist-dash__rail-item">
                  <WishlistProductCard
                    product={product}
                    index={i}
                    orderingClosed={branchOrdering.hasBranch && !branchOrdering.isOpen}
                    onAddToCart={() => handleProductSelect(product)}
                    isWishlisted={wishlisted}
                    onToggleWishlist={() => toggleWishlist(product.id, wishlisted)}
                  />
                </div>
              );
            })}
          </WishlistScrollRail>
        </motion.section>
      )}

      {/* Recommended */}
      {recommendedFiltered.length > 0 && (
        <motion.section
          className="wishlist-dash__section"
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.16 }}
        >
          <div className="wishlist-dash__section-head">
            <div>
              <h2 className="wishlist-dash__section-title">
                <Wand2 size={18} aria-hidden /> Recommended For You
              </h2>
              <p className="wishlist-dash__section-sub">Popular picks you might love</p>
            </div>
          </div>
          <WishlistScrollRail ariaLabel="Recommended products">
            {recommendedFiltered.map((product, i) => {
              const wishlisted = viewerWishlistSet.has(product.id);
              return (
                <div key={product.id} className="wishlist-dash__rail-item">
                  <WishlistProductCard
                    product={product}
                    index={i}
                    orderingClosed={branchOrdering.hasBranch && !branchOrdering.isOpen}
                    onAddToCart={() => handleProductSelect(product)}
                    isWishlisted={wishlisted}
                    onToggleWishlist={() => toggleWishlist(product.id, wishlisted)}
                  />
                </div>
              );
            })}
          </WishlistScrollRail>
        </motion.section>
      )}

      <AnimatePresence>
        {selectedProduct && (
          <ProductDrawer product={selectedProduct} onClose={() => setSelectedProduct(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
