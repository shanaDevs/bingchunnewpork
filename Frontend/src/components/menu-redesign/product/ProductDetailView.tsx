'use client';

import { ArrowLeft, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Container } from '@/components/home-redesign/ui/Container';
import { heroBackdropImage } from '@/components/home-redesign/sections/hero/hero.config';
import { cn } from '@/components/home-redesign/lib/cn';
import { formatLkr } from '@/components/menu-redesign/lib/formatMenuPrice';
import {
  IceLevelField,
  QuantityStepper,
  SugarLevelField,
  ToppingsField,
} from '@/components/menu-redesign/product/ProductOptions';
import { ProductReviewsSection } from '@/components/menu-redesign/product/ProductReviewsSection';
import { RelatedProducts } from '@/components/menu-redesign/product/RelatedProducts';
import OnlineOrderingClosedBanner from '@/components/order/OnlineOrderingClosedBanner';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { useBranchOrderingHours } from '@/hooks/useBranchOrderingHours';
import {
  DEFAULT_ICE_LEVEL,
  DEFAULT_SUGAR_LEVEL,
  productNeedsDrinkOptions,
  type IceLevel,
  type SugarLevel,
} from '@/lib/drinkOptions';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { cameFromMenu } from '@/lib/menuReturn';
import { trackRecentlyViewed } from '@/lib/recentlyViewed';
import {
  getNearbyFulfillmentStore,
  getProductOrderableQty,
  getRemainingOrderQty,
  getMenuUnavailableBadgeLabel,
  isProductComingSoon,
  isProductInStock,
} from '@/lib/productAvailability';
import { flyToCart } from '@/lib/cartFeedback';
import { resolveProductImageUrl } from '@/lib/productImageUrl';
import { api } from '@/lib/api';
import { calcUnitPrice, selectActiveStoreId, useCartStore } from '@/store/cartStore';
import type { Product, Topping } from '@/types';

const MAX_QUANTITY = 99;

export default function ProductDetailView() {
  const { id: paramId } = useParams() as { id?: string };
  const id = paramId ?? '';
  const router = useRouter();
  const photoRef = useRef<HTMLImageElement>(null);

  const [selectedToppings, setSelectedToppings] = useState<Topping[]>([]);
  const [sugarLevel, setSugarLevel] = useState<SugarLevel>(DEFAULT_SUGAR_LEVEL);
  const [iceLevel, setIceLevel] = useState<IceLevel>(DEFAULT_ICE_LEVEL);
  const [quantity, setQuantity] = useState(1);
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const activeStoreId = useCartStore(selectActiveStoreId);
  const cartHydrated = useCartHydrated();
  const branchOrdering = useBranchOrderingHours();
  const orderingClosed = branchOrdering.hasBranch && !branchOrdering.isOpen;
  const setupComplete = useCartStore((s) => hasCompletedOrderSetup(s));

  useEffect(() => {
    if (!cartHydrated) return;
    if (hasCompletedOrderSetup(useCartStore.getState())) return;
    openOrderModal({ required: true });
  }, [cartHydrated]);

  const { data: product, isLoading, isError } = useQuery<Product>({
    queryKey: ['product', id, activeStoreId],
    queryFn: () =>
      api.get(`/menu/products/${id}${activeStoreId ? `?storeId=${activeStoreId}` : ''}`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (id) trackRecentlyViewed(id);
  }, [id]);

  useEffect(() => {
    setActiveImgIndex(0);
  }, [product?.id]);

  const availableToppings = useMemo(
    () => (product?.toppings ?? []).map((pt) => pt.topping).filter((t) => t.isAvailable),
    [product?.toppings],
  );
  const needsDrinkOptions = product ? productNeedsDrinkOptions(product) : false;

  const inStock = product ? isProductInStock(product) : false;
  const comingSoon = product ? isProductComingSoon(product) : false;
  const unavailableBadge = product ? getMenuUnavailableBadgeLabel(product) : 'Sold out';
  const orderableQty = product ? getProductOrderableQty(product) : 0;
  const remainingQty = product ? getRemainingOrderQty(product, cartItems) : 0;
  const maxPickerQty = remainingQty === Number.MAX_SAFE_INTEGER ? MAX_QUANTITY : remainingQty;
  const maxQty = Math.min(MAX_QUANTITY, maxPickerQty > 0 ? maxPickerQty : MAX_QUANTITY);
  const pickerQuantity =
    maxPickerQty <= 0 ? 1 : Math.min(Math.max(1, quantity), maxPickerQty);

  const unitPrice = product ? calcUnitPrice(product, 'REGULAR', selectedToppings) : 0;
  const total = unitPrice * pickerQuantity;

  const galleryImages = useMemo(() => {
    if (!product) return [] as string[];
    const raw =
      product.imageUrls?.length
        ? product.imageUrls
        : product.imageUrl
          ? [product.imageUrl]
          : [];
    const resolved = raw
      .map((url) => resolveProductImageUrl(url))
      .filter((url): url is string => Boolean(url));
    return [...new Set(resolved)];
  }, [product]);

  const imageSrc = galleryImages[activeImgIndex] ?? galleryImages[0] ?? '/promos/menu-hero-cup.png';

  const toggleTopping = (topping: Topping) => {
    setSelectedToppings((current) =>
      current.some((t) => t.id === topping.id)
        ? current.filter((t) => t.id !== topping.id)
        : [...current, topping],
    );
  };

  const backToMenu = (event: MouseEvent) => {
    if (product && cameFromMenu(product.id)) {
      event.preventDefault();
      router.back();
    }
  };

  const handleAddToCart = (event: MouseEvent<HTMLButtonElement>) => {
    if (!product) return;
    if (orderingClosed) {
      toast.error('Online ordering is closed. Save this item to your wishlist instead.');
      return;
    }
    if (!inStock) {
      toast.error(comingSoon ? 'This item is coming soon at your branch.' : 'This item is out of stock at your branch.');
      return;
    }
    if (!hasCompletedOrderSetup(useCartStore.getState())) {
      openOrderModal();
      return;
    }
    const result = addItem({
      product,
      size: 'REGULAR',
      sugarLevel: needsDrinkOptions ? sugarLevel : null,
      iceLevel: needsDrinkOptions ? iceLevel : null,
      toppings: selectedToppings,
      quantity: pickerQuantity,
      unitPrice,
      fulfillmentStore: getNearbyFulfillmentStore(product, activeStoreId),
    });
    if (!result.ok) {
      toast.error(
        result.reason === 'ordering_closed'
          ? 'Online ordering is closed.'
          : orderableQty === Number.MAX_SAFE_INTEGER
            ? 'Unable to add this item.'
            : `Only ${orderableQty} available at your branch.`,
      );
      return;
    }
    if (result.clamped) toast.error('Quantity adjusted to match branch stock.');
    else flyToCart(photoRef.current, event.currentTarget);
  };

  const band = (
    <div aria-hidden="true" className="pt-22 pb-9 sm:pb-14 lg:pb-10" style={{ backgroundImage: heroBackdropImage }} />
  );

  if (isLoading) {
    return (
      <>
        {band}
        <div className="flex min-h-[40vh] items-center justify-center bg-white rounded-t-[2.5rem] -mt-8">
          <div className="size-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      </>
    );
  }

  if (isError || !product) {
    return (
      <>
        {band}
        <div className="rounded-t-[2.5rem] -mt-8 bg-white px-6 py-20 text-center">
          <h2 className="text-2xl font-bold text-brand-950">Product not found</h2>
          <Link href="/menu" className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-2.5 text-snow font-semibold">
            Back to menu
          </Link>
        </div>
      </>
    );
  }

  if (!setupComplete) {
    return <>{band}</>;
  }

  const descriptionText =
    product.description?.trim() ||
    'Handcrafted with premium ingredients — customize with toppings and add it to your cup.';

  return (
    <>
      {band}
      <section className="relative -mt-8 rounded-t-[2.5rem] bg-white sm:-mt-10">
        <Container className="grid grid-cols-1 gap-x-12 gap-y-5 pt-6 pb-10 sm:pt-8 lg:grid-cols-2 lg:pt-10.5 lg:pb-16 lg:[--visual-h:clamp(24rem,calc(100svh-9.625rem),48rem)]">
          <Link
            href="/menu"
            onClick={backToMenu}
            className="-mb-1 inline-flex items-center gap-1.5 justify-self-start rounded-full bg-white py-2 pr-4 pl-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset hover:bg-brand-50 sm:hidden"
          >
            <ArrowLeft className="size-4" />
            Back to menu
          </Link>

          <div className="flex flex-col gap-3 self-start lg:sticky lg:top-32.5 lg:col-start-1 lg:row-start-1">
          <div
            className={cn(
              'group relative flex aspect-[4/3.4] items-end justify-center rounded-[2.5rem] sm:aspect-auto sm:h-112 lg:h-(--visual-h)',
              inStock
                ? 'border-2 border-brand-600 bg-brand-50 shadow-[0_28px_60px_-24px_color-mix(in_srgb,var(--color-brand-600)_45%,transparent)]'
                : 'border-2 border-slate-300 bg-brand-50',
            )}
          >
            {inStock && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-6 -right-1 z-20 w-20 origin-bottom-left -translate-x-4 translate-y-5 scale-50 -rotate-12 opacity-0 transition duration-200 ease-in group-hover:translate-0 group-hover:scale-100 group-hover:rotate-6 group-hover:opacity-100 group-hover:delay-75 group-hover:duration-500 lg:w-24"
              >
                <Image
                  src="/images/mascot-hover.png"
                  alt=""
                  width={463}
                  height={594}
                  sizes="96px"
                  className="sticker block h-auto w-full origin-bottom animate-mascot-sway [animation-play-state:paused] group-hover:[animation-play-state:running]"
                />
              </div>
            )}
            <Link
              href="/menu"
              onClick={backToMenu}
              className="absolute top-5 left-5 z-10 hidden rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-brand-700 shadow-sm hover:bg-brand-50 sm:inline-flex sm:items-center sm:gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Back to menu
            </Link>
            {!inStock && (
              <p
                className={cn(
                  'absolute top-5 right-5 rounded-full px-3 py-1.5 text-xs font-bold tracking-[0.08em] text-snow uppercase',
                  comingSoon ? 'bg-brand-600' : 'bg-brand-950',
                )}
              >
                {unavailableBadge}
              </p>
            )}
            <Image
              key={imageSrc}
              ref={photoRef}
              src={imageSrc}
              alt={product.name}
              width={463}
              height={800}
              sizes="(min-width: 1024px) 420px, 320px"
              priority={activeImgIndex === 0}
              className={cn(
                'relative h-[84%] w-auto object-contain pb-[6%] drop-shadow-[0_16px_18px_rgb(15_33_71/0.18)]',
                !inStock && 'opacity-60 grayscale',
              )}
            />
          </div>

          {galleryImages.length > 1 && (
            <div
              className="flex gap-2 overflow-x-auto pb-0.5 sm:gap-3"
              role="tablist"
              aria-label={`${product.name} photos`}
            >
              {galleryImages.map((src, idx) => {
                const isActive = activeImgIndex === idx;
                return (
                  <button
                    key={`${src}-${idx}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Photo ${idx + 1} of ${galleryImages.length}`}
                    onClick={() => setActiveImgIndex(idx)}
                    className={cn(
                      'grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50 ring-2 ring-inset transition sm:h-[4.5rem] sm:w-[4.5rem]',
                      isActive ? 'ring-brand-600' : 'ring-brand-100 hover:ring-brand-300',
                    )}
                  >
                    <Image
                      src={src}
                      alt=""
                      width={80}
                      height={80}
                      sizes="72px"
                      className="h-full w-full object-contain p-1.5"
                    />
                  </button>
                );
              })}
            </div>
          )}
          </div>

          <div className="lg:col-start-2 lg:row-start-1">
            <h1 className="font-display-condensed text-[clamp(2.25rem,5vw,3.75rem)] leading-[0.95] text-black uppercase lg:text-[clamp(2.25rem,3vw,3rem)]">
              {product.name}
            </h1>
            <p className="mt-3 max-w-prose text-base text-slate-600 sm:text-lg lg:mt-2 lg:text-base">{descriptionText}</p>
            <p className="font-numeric mt-6 text-3xl leading-none font-extrabold text-brand-600 sm:text-4xl lg:mt-5 lg:text-[2.125rem]">
              {formatLkr(product.basePrice)}
            </p>

            {orderingClosed && <OnlineOrderingClosedBanner className="mt-6" message={branchOrdering.closedMessage} />}

            {needsDrinkOptions && (
              <fieldset disabled={!inStock} className={cn('mt-8 space-y-6 lg:mt-5 lg:space-y-5', !inStock && 'opacity-50')}>
                <legend className="sr-only">Ice and sugar</legend>
                <IceLevelField value={iceLevel} onChange={setIceLevel} disabled={!inStock} />
                <SugarLevelField value={sugarLevel} onChange={setSugarLevel} disabled={!inStock} />
              </fieldset>
            )}
            {availableToppings.length > 0 && (
              <fieldset disabled={!inStock} className={cn('mt-8 lg:mt-5', !inStock && 'opacity-50')}>
                <legend className="sr-only">Toppings</legend>
                <ToppingsField toppings={availableToppings} value={selectedToppings} onToggle={toggleTopping} />
              </fieldset>
            )}

            <div className="z-30 mt-8 rounded-full bg-white/95 p-1.5 shadow-lg shadow-brand-950/15 ring-1 ring-brand-100 backdrop-blur-md ring-inset md:sticky md:bottom-0 md:-mx-8 md:rounded-none md:border-t md:border-brand-100 md:px-8 md:pt-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))] md:shadow-none md:ring-0 lg:static lg:mx-0 lg:mt-9 lg:w-fit lg:rounded-full lg:border-0 lg:bg-brand-50 lg:p-2 lg:ring-1 lg:ring-brand-100 lg:ring-inset">
              {inStock ? (
                <div className="flex items-center gap-2 sm:gap-3">
                  <QuantityStepper value={pickerQuantity} onChange={setQuantity} max={maxQty} disabled={orderingClosed} />
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={maxQty <= 0 || orderingClosed}
                    className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-semibold whitespace-nowrap text-snow shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:opacity-50 sm:h-auto sm:px-5 sm:py-4 sm:text-lg lg:flex-none lg:px-8 lg:py-3 lg:text-base"
                  >
                    <ShoppingBag className="size-5 shrink-0 max-sm:hidden" aria-hidden="true" />
                    <span>Add to cart</span>
                    <span aria-hidden="true" className="-mx-0.5 opacity-60 sm:mx-0">
                      ·
                    </span>
                    <span className="font-numeric font-bold sm:text-lg lg:text-base">{formatLkr(total)}</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-brand-950">
                      {comingSoon ? 'Coming soon at this branch.' : 'Sold out at this branch.'}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => openOrderModal({ startAtSetup: true })}
                    className="shrink-0 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-snow hover:bg-brand-700"
                  >
                    Change branch
                  </button>
                </div>
              )}
            </div>
          </div>
        </Container>

        <ProductReviewsSection product={product} />
        <RelatedProducts product={product} />
      </section>
    </>
  );
}
