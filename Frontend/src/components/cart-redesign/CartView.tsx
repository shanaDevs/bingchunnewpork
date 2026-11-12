'use client';

import { Fragment, useMemo, useRef } from 'react';
import { Gift, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Container } from '@/components/home-redesign/ui/Container';
import { cn } from '@/components/home-redesign/lib/cn';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import ProductImage from '@/components/ui/ProductImage';
import { useApplySpinClaim } from '@/hooks/useApplySpinClaim';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { usePromoSubtotalDiscount } from '@/hooks/usePromoSubtotalDiscount';
import { api } from '@/lib/api';
import {
  appliesConvenienceFee,
  chargedConvenienceFee,
  computeConvenienceFee,
  formatConvenienceFeeLabel,
  resolveCheckoutConvenienceRates,
} from '@/lib/fees';
import { activePickupMaxOrderAmount, pickupMaxOrderAmountToast } from '@/lib/pickupPayment';
import { cartItemsToPromoPayload } from '@/lib/promoCartLines';
import { hasPromoGift } from '@/lib/promoGift';
import {
  bogoOfferActiveInCart,
  countBogoFreeUnitsInCart,
  displayPaidSubtotal,
  freeProductBenefitLabel,
  getBogoFreeUnitsForCartLine,
  getBogoPaidUnitsForCartLine,
  showsFreeProductSummaryLine,
} from '@/lib/promoFreeProduct';
import { isFreeProductPromoKind } from '@/lib/promotionAutoApply';
import { rewardDiscountForSubtotal } from '@/lib/promoSubtotalDiscount';
import { useCartStore } from '@/store/cartStore';
import { usePromoStore } from '@/store/promoStore';
import toast from 'react-hot-toast';
import { cartCopy } from './cartCopy';
import { CartEmpty } from './CartEmpty';
import { CartGiftCard, CartItemCard } from './CartItemCard';
import { CartHero } from './CartHero';
import { useCartEntrance } from './CartMotion';
import { CartSummary } from './CartSummary';

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export function CartView() {
  const { items, subtotal, orderMode, deliveryInfo, takeawayInfo, clearCart, getFulfillmentStoreId } =
    useCartStore();
  const reward = usePromoStore((s) => s.reward);
  const clearReward = usePromoStore((s) => s.clearReward);
  const router = useRouter();
  const hydrated = useCartHydrated();
  const panelRef = useRef<HTMLElement>(null);
  const sub = subtotal();
  useApplySpinClaim(sub, orderMode);
  usePromoSubtotalDiscount(sub);

  const isTakeaway = orderMode === 'TAKEAWAY';
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings-checkout'],
    queryFn: () => api.get<{ pickupMaxOrderAmount?: number | null }>('/settings/app'),
    enabled: isTakeaway,
    staleTime: 60_000,
  });
  const pickupMaxOrderAmount = activePickupMaxOrderAmount(appSettings?.pickupMaxOrderAmount);
  const { data: paymentConfig } = useQuery({
    queryKey: ['payment-methods', orderMode, sub],
    queryFn: () =>
      api.get<{
        convenientFeeRate?: number;
        pickupConvenientFeeRate?: number;
        deliveryConvenientFeeRate?: number;
      }>(`/settings/payment-methods?orderMode=${orderMode}&orderSubtotal=${sub}`),
    enabled: !!orderMode && sub > 0,
    staleTime: 60_000,
  });

  const convenienceRates = resolveCheckoutConvenienceRates(paymentConfig);
  const previewPaymentMethod = orderMode === 'DELIVERY' || orderMode === 'TAKEAWAY' ? 'PAYHERE' : null;
  const displayConvenienceFee = previewPaymentMethod
    ? computeConvenienceFee(sub, orderMode, previewPaymentMethod, convenienceRates)
    : 0;
  const convenienceFee = chargedConvenienceFee(sub, orderMode, previewPaymentMethod, convenienceRates);
  const showWaivedPickupConvenienceFee =
    isTakeaway && displayConvenienceFee > 0 && appliesConvenienceFee(orderMode, previewPaymentMethod);
  const baseDeliveryFee = orderMode === 'DELIVERY' && deliveryInfo ? deliveryInfo.fee : 0;
  const deliveryFee = reward?.freeDelivery ? 0 : baseDeliveryFee;
  const bogoFreeUnits = countBogoFreeUnitsInCart(reward, items);
  const bogoActive = bogoOfferActiveInCart(reward, items);
  const discount =
    reward && isFreeProductPromoKind(reward.promotionKind) && !bogoActive
      ? 0
      : reward
        ? rewardDiscountForSubtotal(reward, sub)
        : 0;
  const freeProductLine =
    showsFreeProductSummaryLine(reward, items) ? freeProductBenefitLabel(reward) : null;
  const paidSubtotal = displayPaidSubtotal(sub, reward, items);
  const discountPercentLabel =
    reward?.discountType?.toUpperCase() === 'PERCENTAGE' &&
    reward.discountValue != null &&
    reward.discountValue > 0
      ? reward.discountValue
      : (() => {
          if (sub <= 0 || discount <= 0) return null;
          const pct = Math.round((discount / sub) * 100);
          if (pct < 1 || pct > 100) return null;
          return Math.floor((sub * pct) / 100) === discount ? pct : null;
        })();
  const total = Math.max(0, sub + deliveryFee + convenienceFee - discount);
  const lineQty = items.reduce((s, i) => s + i.quantity, 0);
  const paidQty = lineQty - bogoFreeUnits;
  const hasSpinGift = hasPromoGift(reward) && !isFreeProductPromoKind(reward?.promotionKind);
  const giftName = reward?.giftProduct?.name || reward?.giftLabel || 'Free gift';
  const hasNearbyItems = items.some((i) => i.fulfillmentStore);
  const promoCartItems = useMemo(() => cartItemsToPromoPayload(items), [items]);
  const itemCountLabel =
    bogoFreeUnits > 0
      ? `${paidQty} paid + ${bogoFreeUnits} free`
      : cartCopy.itemCount(lineQty);

  useCartEntrance(panelRef, hydrated && items.length > 0);

  function clearBogoOffer() {
    if (isFreeProductPromoKind(reward?.promotionKind)) clearReward();
  }

  function checkout() {
    if (!orderMode) {
      openOrderModal({ required: true });
      return;
    }
    if (isTakeaway && pickupMaxOrderAmount != null) {
      toast(pickupMaxOrderAmountToast(pickupMaxOrderAmount), { duration: 5000 });
    }
    router.push('/checkout');
  }

  const summaryRows = [
    {
      label: (
        <>
          {cartCopy.subtotal} ({itemCountLabel}
          {hasSpinGift ? ' + 1 free gift' : ''})
        </>
      ),
      value: `LKR ${paidSubtotal.toLocaleString()}`,
    },
    ...(baseDeliveryFee > 0
      ? [
          {
            label: cartCopy.deliveryFee,
            value: reward?.freeDelivery ? cartCopy.free : `LKR ${baseDeliveryFee.toLocaleString()}`,
            valueClassName: reward?.freeDelivery ? 'text-emerald-600' : undefined,
          },
        ]
      : []),
    ...(freeProductLine
      ? [{ label: freeProductLine, value: cartCopy.free, valueClassName: 'text-emerald-600' }]
      : []),
    ...(discount > 0 && !freeProductLine
      ? [
          {
            label: (
              <>
                {cartCopy.discount}
                {discountPercentLabel != null ? ` (${discountPercentLabel}%)` : ''}
              </>
            ),
            value: `− LKR ${discount.toLocaleString()}`,
            valueClassName: 'text-emerald-600',
          },
        ]
      : []),
    ...(showWaivedPickupConvenienceFee
      ? [
          {
            label: formatConvenienceFeeLabel(orderMode, convenienceRates),
            value: `LKR ${displayConvenienceFee.toLocaleString()}`,
            muted: true,
          },
        ]
      : []),
    ...(!isTakeaway && convenienceFee > 0
      ? [
          {
            label: formatConvenienceFeeLabel(orderMode, convenienceRates),
            value: `LKR ${convenienceFee.toLocaleString()}`,
          },
        ]
      : []),
  ];

  return (
    <>
      <CartHero />

      <section ref={panelRef} className="relative -mt-8 rounded-t-[2.5rem] bg-white sm:-mt-10">
        <Container className="pt-8 pb-12 sm:pt-10 lg:pt-12 lg:pb-20">
          {!hydrated ? (
            <div className="min-h-96" />
          ) : items.length === 0 ? (
            <div className="space-y-6">
              {(reward?.source === 'spin' || hasSpinGift) && (
                <div className="mx-auto max-w-2xl rounded-[1.5rem] bg-brand-50 px-4 py-3 ring-1 ring-brand-100 ring-inset sm:px-5">
                  <p className="text-[0.625rem] font-semibold tracking-[0.14em] text-brand-600 uppercase">
                    {hasSpinGift ? cartCopy.giftReady : cartCopy.spinReady}
                  </p>
                  {hasSpinGift ? (
                    <div className="mt-2 flex items-center gap-3">
                      {reward?.giftProduct?.imageUrl ? (
                        <ProductImage
                          name={giftName}
                          imageUrl={reward.giftProduct.imageUrl}
                          className="size-14 rounded-xl"
                          contain
                        />
                      ) : (
                        <div className="grid size-14 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                          <Gift size={22} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-brand-950">{giftName}</p>
                        <p className="text-xs font-semibold text-emerald-600">{cartCopy.free}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 font-semibold text-brand-950">{reward?.label}</p>
                  )}
                  {reward?.code && (
                    <p className="mt-1 font-mono text-xs text-brand-600">{reward.code}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">{cartCopy.spinHint}</p>
                </div>
              )}
              <CartEmpty />
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] lg:gap-10 xl:gap-14">
              <div>
                <div
                  data-cart="list-header"
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:gap-x-4"
                >
                  <h2 className="flex items-center gap-2 font-display-condensed text-[1.75rem] leading-none text-brand-950 uppercase sm:gap-3 sm:text-4xl">
                    {cartCopy.inYourBag}
                    <span
                      key={lineQty + (hasSpinGift ? 1 : 0)}
                      className="rounded-full bg-brand-50 px-2.5 py-1 font-sans text-xs font-semibold tracking-normal text-brand-700 normal-case ring-1 ring-brand-100 transition-[scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ring-inset starting:scale-115 sm:px-3 sm:text-sm"
                    >
                      {cartCopy.itemCount(lineQty + (hasSpinGift ? 1 : 0))}
                    </span>
                  </h2>
                  <Link
                    href="/menu"
                    className={cn(
                      'group inline-flex items-center gap-1 rounded-full py-1.5 pr-3 pl-2.5 text-xs font-semibold whitespace-nowrap text-brand-700 ring-1 ring-brand-200 ring-inset transition-colors hover:bg-brand-50 sm:gap-1.5 sm:py-2 sm:pr-4 sm:pl-3 sm:text-sm',
                      focusRing,
                    )}
                  >
                    <Plus
                      className="size-3.5 transition-transform duration-300 group-hover:rotate-90 sm:size-4"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    <span className="max-[399px]:hidden">{cartCopy.addMore}</span>
                    <span className="min-[400px]:hidden">{cartCopy.addMoreShort}</span>
                  </Link>
                </div>

                {hasNearbyItems && (
                  <p className="mt-3 text-xs text-amber-700/90">{cartCopy.nearbyNote}</p>
                )}

                <ul className="mt-5 flex flex-col gap-4 sm:mt-6">
                  {items.map((item) => {
                    const lineFreeQty = getBogoFreeUnitsForCartLine(reward, item);
                    const paidLineQty = getBogoPaidUnitsForCartLine(reward, item);
                    const splitBogo = lineFreeQty > 0 && paidLineQty > 0;
                    return (
                      <Fragment key={item.id}>
                        <CartItemCard
                          item={item}
                          allItems={items}
                          displayQty={splitBogo ? paidLineQty : undefined}
                          bogoFreeQty={lineFreeQty}
                          onClearBogo={clearBogoOffer}
                        />
                        {splitBogo && (
                          <CartGiftCard
                            name={item.product.name}
                            imageUrl={item.product.imageUrl}
                            basePrice={item.unitPrice}
                            size={item.size}
                            quantity={lineFreeQty}
                            badge="Free with offer"
                            subtitle={reward?.label || 'Buy 1 Get 1'}
                          />
                        )}
                      </Fragment>
                    );
                  })}
                  {hasSpinGift && (
                    <CartGiftCard
                      name={giftName}
                      imageUrl={reward?.giftProduct?.imageUrl}
                      basePrice={reward?.giftProduct?.basePrice}
                    />
                  )}
                </ul>
              </div>

              <CartSummary
                orderMode={orderMode}
                deliveryAddress={deliveryInfo?.address}
                takeawayStoreName={takeawayInfo?.storeName}
                rows={summaryRows}
                total={total}
                promoOrderTotal={sub}
                storeId={getFulfillmentStoreId()}
                promoCartItems={promoCartItems}
                onCheckout={checkout}
                onEmpty={() => {
                  clearCart();
                  clearBogoOffer();
                }}
              />
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
