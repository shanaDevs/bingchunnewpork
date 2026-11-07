'use client';

import { Suspense, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Search,
  X,
  RefreshCw,
  AlertCircle,
  LayoutGrid,
  List,
} from 'lucide-react';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { api, ApiError } from '@/lib/api';
import type { Product, Category, ProductSortMode, Order } from '@/types';
import ProductCard from '@/components/menu/ProductCard';
import ProductCardSkeleton from '@/components/menu/ProductCardSkeleton';
import CategoryChip from '@/components/menu/CategoryChip';
import MenuHeroSlide from '@/components/menu/MenuHeroSlide';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { selectActiveStoreId, useCartStore } from '@/store/cartStore';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { getCategoryEmoji } from '@/lib/categoryEmojis';
import { isProductInStock, isProductComingSoon, isProductLowStock } from '@/lib/productAvailability';
import { sortProductsForMenu } from '@/lib/productMenuSort';
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';
import { useAuthStore } from '@/store/authStore';
import { useWishlistIds, useWishlistToggle } from '@/hooks/useWishlist';
import { useBranchOrderingHours } from '@/hooks/useBranchOrderingHours';
import OnlineOrderingClosedBanner from '@/components/order/OnlineOrderingClosedBanner';

const ProductDrawer = dynamic(() => import('@/components/menu/ProductDrawer'), {
  ssr: false,
  loading: () => null,
});

type MenuClientProps = {
  initialProducts?: Product[];
  initialCategories?: Category[];
};

const SORT_OPTIONS: { value: ProductSortMode; label: string }[] = [
  { value: 'name_asc', label: 'A–Z' },
  { value: 'name_desc', label: 'Z–A' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'newest', label: 'Newest' },
];

const TAG_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All tags' },
  { value: 'New', label: 'New' },
  { value: 'Best Seller', label: 'Best Seller' },
  { value: 'Popular', label: 'Popular' },
  { value: 'Classic', label: 'Classic' },
  { value: 'Signature', label: 'Signature' },
  { value: 'Rs.200 Only', label: 'Rs.200 Only' },
];

function categoryLabel(name: string, slug: string) {
  return slug === 'all' ? 'All Items' : name;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function MenuPage({ initialProducts = [], initialCategories = [] }: MenuClientProps) {
  return (
    <Suspense fallback={<MenuPageFallback />}>
      <MenuPageContent initialProducts={initialProducts} initialCategories={initialCategories} />
    </Suspense>
  );
}

function MenuPageFallback() {
  return (
    <div className="menu-page min-h-screen bg-white md:bg-navy">
      <div className="menu-page__section-inner py-4 sm:py-5 px-4">
        <div className="mb-4 h-28 rounded-2xl bg-navy-light/60 animate-pulse" />
        <div className="mb-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-20 shrink-0 rounded-full bg-navy-light/60 animate-pulse" />
          ))}
        </div>
        <ProductCardSkeleton count={8} />
      </div>
    </div>
  );
}

function MenuPageContent({
  initialProducts = [],
  initialCategories = [],
}: MenuClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProductSortMode>('name_asc');
  const [tagFilter, setTagFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const orderMode = useCartStore((s) => s.orderMode);
  const cartItems = useCartStore((s) => s.items);
  const cartHydrated = useCartHydrated();
  const activeStoreId = useCartStore(selectActiveStoreId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: wishlistIds = [] } = useWishlistIds();
  const { toggle: toggleWishlist } = useWishlistToggle();
  const wishlistSet = useMemo(() => new Set(wishlistIds), [wishlistIds]);
  const branchOrdering = useBranchOrderingHours();
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentlyViewedIds(getRecentlyViewedIds());
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    const state = useCartStore.getState();
    if (hasCompletedOrderSetup(state)) return;
    openOrderModal({ required: true });
  }, [cartHydrated]);

  const hasSearch = debouncedSearch.length > 0;

  const isDefaultCatalog =
    selectedCategory === 'all' &&
    !debouncedSearch &&
    !activeStoreId &&
    sort === 'name_asc' &&
    !tagFilter;

  const {
    data: categories = initialCategories,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/menu/categories'),
    ...(initialCategories.length > 0
      ? { initialData: initialCategories, initialDataUpdatedAt: Date.now() - 60_000 }
      : {}),
  });

  const {
    data: products = [],
    isLoading,
    isFetching,
    isError: productsError,
    error: productsQueryError,
    refetch: refetchProducts,
  } = useQuery<Product[]>({
    queryKey: ['products', selectedCategory, debouncedSearch, activeStoreId, hasSearch, sort, tagFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (activeStoreId) params.append('storeId', activeStoreId);
      if (tagFilter) params.append('tag', tagFilter);
      params.append('sort', sort);
      const qs = params.toString();
      return api.get(`/menu/products${qs ? `?${qs}` : ''}`);
    },
    placeholderData: keepPreviousData,
    ...(isDefaultCatalog && initialProducts.length > 0
      ? { initialData: initialProducts, initialDataUpdatedAt: Date.now() - 60_000 }
      : {}),
  });

  const showColdSkeleton = isLoading && products.length === 0;
  const isRefreshing = isFetching && !showColdSkeleton;

  const { data: myOrders = [] } = useQuery<Order[]>({
    queryKey: ['orders', 'my', 'menu-sort'],
    queryFn: async () => {
      const result = await api.get<Order[]>('/orders/my?limit=30', true);
      return Array.isArray(result) ? result : [];
    },
    enabled: isAuthenticated,
    staleTime: 120_000,
  });

  const orderedProductIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const order of myOrders) {
      for (const item of order.items ?? []) {
        if (!item.productId || seen.has(item.productId)) continue;
        seen.add(item.productId);
        ids.push(item.productId);
      }
    }
    return ids;
  }, [myOrders]);

  const menuUserSignals = useMemo(
    () => ({
      wishlistIds: wishlistSet,
      recentlyViewedIds,
      orderedProductIds,
      cartProductIds: new Set(cartItems.map((item) => item.product.id)),
    }),
    [wishlistSet, recentlyViewedIds, orderedProductIds, cartItems],
  );

  const sortedProducts = useMemo(
    () => sortProductsForMenu(products, menuUserSignals),
    [products, menuUserSignals],
  );

  const closeDrawer = useCallback(() => setSelectedProduct(null), []);

  const handleProductSelect = useCallback((product: Product) => {
    if (!isProductInStock(product)) return;
    const cartState = useCartStore.getState();
    if (!hasCompletedOrderSetup(cartState)) {
      openOrderModal();
      return;
    }
    setSelectedProduct(product);
  }, []);

  const allCategories = useMemo(
    () => [{ id: 'all', name: 'All Items', slug: 'all', icon: '✨', sortOrder: -1 }, ...categories],
    [categories],
  );

  const handleCategorySelect = useCallback(
    (slug: string) => {
      setSelectedCategory(slug);
      const params = new URLSearchParams(searchParams.toString());
      if (slug === 'all') params.delete('category');
      else params.set('category', slug);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const catParam = searchParams.get('category');
    if (!catParam) {
      setSelectedCategory('all');
      return;
    }
    if (catParam === 'all') {
      setSelectedCategory('all');
      return;
    }
    if (categories.length === 0) return;
    const match = categories.find((c) => c.slug === catParam);
    if (match) setSelectedCategory(match.slug);
  }, [searchParams, categories]);

  useEffect(() => {
    const bar = categoryBarRef.current;
    if (!bar) return;
    const activeChip = bar.querySelector<HTMLElement>('[aria-selected="true"]');
    activeChip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedCategory, categories.length]);

  const apiDown = productsError || categoriesError;
  const errorMessage =
    productsQueryError instanceof ApiError
      ? productsQueryError.message
      : 'Could not load menu. Please check your connection and try again.';

  const gridClass =
    viewMode === 'list'
      ? 'menu-product-list'
      : 'product-card-grid grid grid-cols-2 gap-3 sm:gap-4 md:gap-4 menu-page__product-grid';

  return (
    <div className="menu-page menu-app min-h-screen">
      <div className="menu-page__content">
        <section className="menu-hero">
          <div className="menu-page__section-inner menu-hero__inner py-5 md:py-6">
            <MenuHeroSlide
              search={
                <>
                  <label htmlFor="menu-search" className="sr-only">
                    Search menu
                  </label>
                  <div
                    className={`menu-hero__search input-icon-wrap${search.length > 0 ? ' input-icon-wrap--end' : ''}`}
                  >
                    <Search size={20} className="input-icon" aria-hidden />
                    <input
                      id="menu-search"
                      type="text"
                      role="searchbox"
                      placeholder="Search bubble tea, ice cream..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="menu-hero__search-input search-bar"
                      autoComplete="off"
                    />
                    {search.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="input-action h-9 w-9 rounded-full text-muted hover:bg-navy-card hover:text-fg transition-colors"
                        aria-label="Clear search"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </>
              }
              categories={
                <LayoutGroup id="menu-category-chips">
                  <div
                    ref={categoryBarRef}
                    className="menu-hero__categories category-bar flex gap-2 overflow-x-auto pb-0.5 scrollbar-none -mx-1 px-1 h-12 items-center"
                    role="tablist"
                    aria-label="Menu categories"
                  >
                    {allCategories.map((cat, i) => (
                      <CategoryChip
                        key={cat.slug}
                        name={categoryLabel(cat.name, cat.slug)}
                        active={selectedCategory === cat.slug}
                        index={i}
                        onSelect={() => handleCategorySelect(cat.slug)}
                      />
                    ))}
                  </div>
                </LayoutGroup>
              }
            />
          </div>
        </section>

        <div className="menu-page__section-inner py-4 sm:py-5">
          {apiDown && (
            <div
              className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 sm:p-5"
              role="alert"
            >
              <AlertCircle className="text-red-400 shrink-0" size={24} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-fg">Menu unavailable</p>
                <p className="text-sm text-muted mt-1">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  refetchProducts();
                  refetchCategories();
                }}
                className="btn-outline px-4 py-2 text-sm shrink-0"
              >
                <RefreshCw size={16} />
                Retry
              </button>
            </div>
          )}

          {!apiDown && branchOrdering.hasBranch && !branchOrdering.isOpen && (
            <OnlineOrderingClosedBanner
              className="mb-4"
              message={branchOrdering.closedMessage}
            />
          )}

          {!apiDown && !showColdSkeleton && orderMode && !activeStoreId && (
            <p className="text-sm text-amber-400/90 mb-4 text-center">
              Select your branch in order settings to see branch stock.
              <button type="button" onClick={() => openOrderModal()} className="text-brand ml-1 underline">
                Set up order
              </button>
            </p>
          )}

          <div className="menu-toolbar">
            <p className="menu-toolbar__count text-sm text-muted">
              {isRefreshing && debouncedSearch ? (
                'Searching…'
              ) : isRefreshing ? (
                'Updating…'
              ) : (
                <>
                  Showing <span className="text-fg font-semibold">{sortedProducts.length}</span>
                  {sortedProducts.length === 1 ? ' item' : ' items'}
                </>
              )}
            </p>
            <div className="menu-toolbar__actions">
              <label className="sr-only" htmlFor="menu-tag-filter">
                Filter by tag
              </label>
              <select
                id="menu-tag-filter"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="menu-toolbar__sort menu-toolbar__filter"
              >
                {TAG_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="menu-sort">
                Sort products
              </label>
              <select
                id="menu-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as ProductSortMode)}
                className="menu-toolbar__sort"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="menu-toolbar__view" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={`menu-toolbar__view-btn${viewMode === 'grid' ? ' menu-toolbar__view-btn--active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  aria-pressed={viewMode === 'grid'}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  type="button"
                  className={`menu-toolbar__view-btn${viewMode === 'list' ? ' menu-toolbar__view-btn--active' : ''}`}
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          {showColdSkeleton ? (
            <ProductCardSkeleton count={8} layout={viewMode} />
          ) : !apiDown && sortedProducts.length === 0 ? (
            <div className="text-center py-16 sm:py-20">
              <div className="text-6xl mb-4 flex justify-center items-center center ">
                <img
                  src="/mascots/search.png"
                  alt="no items found"
                  style={{ width: '100px', height: '100px' }}
                />
              </div>
              <p className="text-xl font-semibold text-fg mb-2">No items found</p>
              <p className="text-muted text-sm">Try another category or search term</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  handleCategorySelect('all');
                  setTagFilter('');
                  setSort('name_asc');
                }}
                className="btn-primary px-6 py-2.5 mt-6 text-sm"
              >
                Clear filters
              </button>
            </div>
          ) : !apiDown ? (
            <div className={`${gridClass}${isRefreshing ? ' opacity-80 transition-opacity' : ''}`}>
              {sortedProducts.map((product, i) => {
                const inStock = isProductInStock(product);
                const comingSoon = isProductComingSoon(product);
                const wishlisted = wishlistSet.has(product.id);

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    index={i}
                    layout={viewMode}
                    name={product.name}
                    basePrice={product.basePrice}
                    imageUrl={product.imageUrl}
                    tag={inStock ? product.tag : undefined}
                    categoryName={product.category?.name}
                    emoji={getCategoryEmoji(product.category?.slug ?? '')}
                    isAvailable={inStock}
                    isComingSoon={comingSoon}
                    isLowStock={isProductLowStock(product)}
                    rating={product.avgRating}
                    ratingCount={product.ratingCount}
                    isWishlisted={wishlisted}
                    onWishlistToggle={() => toggleWishlist(product.id, wishlisted)}
                    onSelect={() => handleProductSelect(product)}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {selectedProduct && <ProductDrawer product={selectedProduct} onClose={closeDrawer} />}
      </AnimatePresence>
    </div>
  );
}
