'use client';

import {
  AlertCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Container } from '@/components/home-redesign/ui/Container';
import { cn } from '@/components/home-redesign/lib/cn';
import { MenuProductCard } from '@/components/menu-redesign/MenuProductCard';
import { menuCopy } from '@/components/menu-redesign/menuCopy';
import OnlineOrderingClosedBanner from '@/components/order/OnlineOrderingClosedBanner';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { useSessionState } from '@/hooks/useSessionState';
import { useBranchOrderingHours } from '@/hooks/useBranchOrderingHours';
import { useAuthStore } from '@/store/authStore';
import { useWishlistIds } from '@/hooks/useWishlist';
import { api, ApiError } from '@/lib/api';
import { clearMenuReturn } from '@/lib/menuReturn';
import { sortProductsForMenu } from '@/lib/productMenuSort';
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';
import { isProductInStock } from '@/lib/productAvailability';
import { selectActiveStoreId, useCartStore } from '@/store/cartStore';
import type { Category, Order, Product } from '@/types';

const HEADER_HEIGHT = 88;
const RESULTS_GAP = 16;

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function CategoryFromUrl({
  categories,
  onCategory,
}: {
  categories: Category[];
  onCategory: (slug: string) => void;
}) {
  const requested = useSearchParams().get('category');
  useEffect(() => {
    if (!requested || categories.length === 0) return;
    const match = categories.find((c) => c.slug === requested);
    if (match) onCategory(match.slug);
    window.history.replaceState(null, '', window.location.pathname);
  }, [requested, categories, onCategory]);
  return null;
}

function categoryTitle(name: string, slug: string) {
  return slug === 'all' ? menuCopy.listing.allTreats : name;
}

export function MenuListing() {
  return (
    <Suspense fallback={null}>
      <MenuListingContent />
    </Suspense>
  );
}

function MenuListingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [storedCategory, setStoredCategory] = useSessionState<string>('bingchun:menu-category', 'all');
  const [query, setQuery] = useSessionState('bingchun:menu-query', '');
  const debouncedSearch = useDebouncedValue(query.trim(), 300);
  const orderMode = useCartStore((s) => s.orderMode);
  const cartItems = useCartStore((s) => s.items);
  const activeStoreId = useCartStore(selectActiveStoreId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: wishlistIds = [] } = useWishlistIds();
  const wishlistSet = useMemo(() => new Set(wishlistIds), [wishlistIds]);
  const branchOrdering = useBranchOrderingHours();
  const recentlyViewedIds = useMemo(
    () => (typeof window === 'undefined' ? [] : getRecentlyViewedIds()),
    [],
  );

  const [stuck, setStuck] = useState(false);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [scrollRequest, setScrollRequest] = useState(0);

  useEffect(() => {
    clearMenuReturn();
  }, []);

  const {
    data: categories = [],
    isError: categoriesError,
    refetch: refetchCategories,
  } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/menu/categories'),
  });

  const tabs = useMemo(
    () => [{ id: 'all', name: 'All', slug: 'all' }, ...categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))],
    [categories],
  );

  const categorySlug = tabs.some((t) => t.slug === storedCategory) ? storedCategory : 'all';

  const hasSearch = debouncedSearch.length > 0;

  const {
    data: products = [],
    isLoading,
    isFetching,
    isError: productsError,
    error: productsQueryError,
    refetch: refetchProducts,
  } = useQuery<Product[]>({
    queryKey: ['products', categorySlug, debouncedSearch, activeStoreId, hasSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categorySlug && categorySlug !== 'all') params.append('category', categorySlug);
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (activeStoreId) params.append('storeId', activeStoreId);
      params.append('sort', 'name_asc');
      const qs = params.toString();
      return api.get(`/menu/products${qs ? `?${qs}` : ''}`);
    },
  });

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

  const toolbarBottom = () => HEADER_HEIGHT + (toolbarRef.current?.offsetHeight ?? 0);

  const selectCategory = (slug: string) => {
    const scrolledPast = (resultsRef.current?.getBoundingClientRect().top ?? 0) < toolbarBottom();
    setStoredCategory(slug);
    const params = new URLSearchParams(searchParams.toString());
    if (slug === 'all') params.delete('category');
    else params.set('category', slug);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    if (scrolledPast) setScrollRequest((r) => r + 1);
  };

  const openCategoryFromUrl = useCallback(
    (slug: string) => {
      setStoredCategory(slug);
      setQuery('');
    },
    [setStoredCategory, setQuery],
  );

  // The toolbar is rounded to match the section's top edge, but square once it sticks under the header
  // (see reference: bingchun-homepage-redesign MenuListing.tsx). IntersectionObserver matches the design;
  // we pin with fixed top-22 because app globals set overflow-x:hidden on body, which breaks position:sticky.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      rootMargin: `-${HEADER_HEIGHT + 1}px 0px 0px 0px`,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const sync = () => setToolbarHeight(toolbar.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(toolbar);
    return () => ro.disconnect();
  }, [categories.length, tabs.length]);

  useEffect(() => {
    const results = resultsRef.current;
    if (!scrollRequest || !results) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: window.scrollY + results.getBoundingClientRect().top - toolbarBottom() - RESULTS_GAP,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [scrollRequest]);

  const apiDown = productsError || categoriesError;
  const errorMessage =
    productsQueryError instanceof ApiError
      ? productsQueryError.message
      : 'Could not load menu. Please check your connection and try again.';

  const activeTab = tabs.find((t) => t.slug === categorySlug) ?? tabs[0];
  const title = categoryTitle(activeTab.name, activeTab.slug);
  const soldOutCount = sortedProducts.filter((p) => !isProductInStock(p)).length;
  const storeName = useCartStore((s) => s.deliveryInfo?.storeName ?? s.takeawayInfo?.storeName);
  const needle = query.trim();
  const elsewhere =
    needle && categorySlug !== 'all' && sortedProducts.length === 0
      ? products.filter((p) => p.name.toLowerCase().includes(needle.toLowerCase())).length
      : 0;

  return (
    <section aria-label={menuCopy.listing.label} className="relative -mt-8 rounded-t-[2.5rem] bg-white pb-12 sm:-mt-10 sm:pb-16">
      <Suspense fallback={null}>
        <CategoryFromUrl categories={categories} onCategory={openCategoryFromUrl} />
      </Suspense>
      <div ref={sentinelRef} aria-hidden="true" />
      {stuck ? <div aria-hidden="true" style={{ height: toolbarHeight }} /> : null}
      {/* Stays under the fixed header while the grid scrolls. The header has no bar of its own (its
          blurred scrim fades out over its last few pixels), so once stuck this bar also fills a strip
          up behind that fade (before:), leaving no gap for the cards to show through, and a faint
          hairline (after:) keeps the header and the bar reading as two layers. */}
      <div
        ref={toolbarRef}
        className={cn(
          'z-30 bg-white/95 backdrop-blur-md transition-[border-radius,box-shadow] duration-200',
          stuck
            ? 'fixed inset-x-0 top-22 shadow-[0_1px_0_var(--color-brand-100)] before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-white before:content-[\'\'] after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-brand-100/70 after:content-[\'\']'
            : 'relative rounded-t-[2.5rem]',
        )}
      >
        <Container className="flex flex-col gap-3 py-4 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div
            role="group"
            aria-label={menuCopy.listing.categories}
            className="-mx-1.5 -my-2.5 flex gap-2 overflow-x-auto px-1.5 py-2.5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((tab) => {
              const active = tab.slug === categorySlug;
              return (
                <button
                  key={tab.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectCategory(tab.slug)}
                  className={cn(
                    'flex shrink-0 items-center rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors duration-200',
                    focusRing,
                    active
                      ? 'bg-brand-600 text-snow shadow-md shadow-brand-600/25'
                      : 'bg-brand-50 text-brand-800 ring-1 ring-brand-100 ring-inset hover:bg-brand-100',
                  )}
                >
                  {tab.slug === 'all' ? menuCopy.listing.all : tab.name}
                </button>
              );
            })}
          </div>

          <label className="relative block shrink-0 lg:w-72">
            <span className="sr-only">{menuCopy.listing.searchLabel}</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-brand-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={menuCopy.listing.searchPlaceholder}
              autoComplete="off"
              className="w-full rounded-full bg-brand-50/70 py-2.5 pr-4 pl-12 text-base text-slate-900 ring-1 ring-brand-100 ring-inset transition-shadow placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-600 focus:outline-none"
            />
          </label>
        </Container>
      </div>

      <Container className="pt-8 sm:pt-10">
        {apiDown && (
          <div
            className="mb-6 flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center"
            role="alert"
          >
            <AlertCircle className="text-red-500 shrink-0" size={24} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-brand-950">Menu unavailable</p>
              <p className="text-sm text-slate-600 mt-1">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                refetchProducts();
                refetchCategories();
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-snow',
                focusRing,
              )}
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        )}

        {!apiDown && branchOrdering.hasBranch && !branchOrdering.isOpen && (
          <OnlineOrderingClosedBanner className="mb-4" message={branchOrdering.closedMessage} />
        )}

        {!apiDown && !isLoading && orderMode && !activeStoreId && (
          <p className="text-sm text-amber-700 mb-4 text-center">
            Select your branch in order settings to see branch stock.{' '}
            <button type="button" onClick={() => openOrderModal()} className="text-brand-600 underline font-semibold">
              Set up order
            </button>
          </p>
        )}

        <div ref={resultsRef} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-semibold text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96]">
            {title}
          </h2>
          <p className="text-sm text-slate-500" aria-live="polite">
            {isFetching && debouncedSearch ? (
              'Searching…'
            ) : (
              <>
                {menuCopy.listing.itemCount(sortedProducts.length)}
                {needle ? menuCopy.listing.matching(needle) : ''}
                {soldOutCount > 0 && storeName
                  ? menuCopy.listing.soldOutAt(soldOutCount, storeName)
                  : soldOutCount > 0
                    ? menuCopy.listing.soldOutAt(soldOutCount, 'this branch')
                    : ''}
              </>
            )}
          </p>
        </div>

        {isLoading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-3xl bg-brand-50" />
            ))}
          </div>
        ) : !apiDown && sortedProducts.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-[2rem] bg-brand-50 px-6 py-12 text-center ring-1 ring-brand-100 ring-inset">
            <Image src="/images/mascots/search.png" alt="" width={500} height={500} sizes="128px" className="size-28 sm:size-32" />
            <p className="mt-3 text-lg font-semibold text-brand-900">{menuCopy.listing.noMatch(needle)}</p>
            <p className="mt-1 text-sm text-slate-600">{menuCopy.listing.noMatchHint}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  selectCategory('all');
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset transition-colors hover:bg-brand-50',
                  focusRing,
                )}
              >
                <X className="size-4" aria-hidden="true" />
                {menuCopy.listing.clearSearch}
              </button>
              {elsewhere > 0 && (
                <button
                  type="button"
                  onClick={() => selectCategory('all')}
                  className={cn(
                    'rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-snow transition-colors hover:bg-brand-700',
                    focusRing,
                  )}
                >
                  {menuCopy.listing.seeMatchesInAll(elsewhere)}
                </button>
              )}
            </div>
          </div>
        ) : !apiDown ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sortedProducts.map((product) => (
              <MenuProductCard
                key={product.id}
                product={product}
                available={isProductInStock(product)}
                orderingClosed={branchOrdering.hasBranch && !branchOrdering.isOpen}
              />
            ))}
          </div>
        ) : null}
      </Container>
    </section>
  );
}
