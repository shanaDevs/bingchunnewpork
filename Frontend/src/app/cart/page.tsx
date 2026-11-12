'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { Fragment, useMemo } from 'react';
import { Minus, Plus, Trash2, ArrowRight, ChevronLeft, Gift } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useCartStore } from '@/store/cartStore';
import type { LocalCartItem } from '@/store/cartStore';
import EmptyCartState from '@/components/cart/EmptyCartState';
import CupIcon, { cupFillFromCount } from '@/components/cart/CupIcon';
import { useCupPourPulse } from '@/hooks/useCupPourPulse';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import ProductImage from '@/components/ui/ProductImage';
import { formatDrinkOptionLine } from '@/lib/drinkOptions';
import { getMaxLineQty, getProductOrderableQty } from '@/lib/productAvailability';
import toast from 'react-hot-toast';
import PromoOffersPanel from '@/components/promotions/PromoOffersPanel';
import { usePromoStore } from '@/store/promoStore';
import { cartItemsToPromoPayload } from '@/lib/promoCartLines';
import { useApplySpinClaim } from '@/hooks/useApplySpinClaim';
import { usePromoSubtotalDiscount } from '@/hooks/usePromoSubtotalDiscount';
import { rewardDiscountForSubtotal } from '@/lib/promoSubtotalDiscount';
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
import { api } from '@/lib/api';
import { activePickupMaxOrderAmount, pickupMaxOrderAmountToast } from '@/lib/pickupPayment';
import {
  appliesConvenienceFee,
  chargedConvenienceFee,
  computeConvenienceFee,
  formatConvenienceFeeLabel,
  resolveCheckoutConvenienceRates,
} from '@/lib/fees';

function CartItemRow({
  item,
  allItems,
  displayQty,
  bogoFreeQty = 0,
  onClearBogo,
}: {
  item: LocalCartItem;
  allItems: LocalCartItem[];
  /** When set, show this qty/price instead of the raw line (BOGO paid portion). */
  displayQty?: number;
  bogoFreeQty?: number;
  onClearBogo?: () => void;
}) {
  const { updateQuantity, removeItem } = useCartStore();
  const maxLineQty = getMaxLineQty(item.product, allItems, item.id);
  const orderableQty = getProductOrderableQty(item.product);
  const atMax = maxLineQty !== Number.MAX_SAFE_INTEGER && item.quantity >= maxLineQty;
  const shownQty = displayQty ?? item.quantity;
  const lineTotal = item.unitPrice * shownQty;

  function incrementQty() {
    const result = updateQuantity(item.id, item.quantity + 1);
    if (!result.ok || result.clamped) {
      toast.error(
        orderableQty === Number.MAX_SAFE_INTEGER
          ? 'Unable to add more of this item.'
          : 'Not enough stock at your branch for that quantity.',
      );
    }
  }

  function decrementQty() {
    const nextQty = item.quantity - 1;
    if (nextQty <= 0 || (bogoFreeQty > 0 && nextQty <= bogoFreeQty)) {
      removeItem(item.id);
      if (bogoFreeQty > 0) onClearBogo?.();
      return;
    }
    updateQuantity(item.id, nextQty);
  }

  function handleRemove() {
    removeItem(item.id);
    if (bogoFreeQty > 0) onClearBogo?.();
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      className="card p-4 flex gap-4"
    >
      <ProductImage
        name={item.product.name}
        imageUrl={item.product.imageUrl}
        className="w-16 h-16 rounded-xl shrink-0"
        contain
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-fg text-sm line-clamp-1">{item.product.name}</h3>
        <p className="text-muted text-xs mt-0.5">
          {[
            item.size,
            formatDrinkOptionLine({ iceLevel: item.iceLevel, sugarLevel: item.sugarLevel }),
            item.toppings.length > 0 ? item.toppings.map((t) => t.name).join(', ') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {item.fulfillmentStore && (
          <p className="text-amber-400 text-xs mt-1">
            📍 From {item.fulfillmentStore.name.replace('Bing Chun - ', '')}
          </p>
        )}
        <div className="flex items-center justify-between mt-3">
          {/* Qty controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={decrementQty}
              className="w-7 h-7 rounded-full border border-navy-border flex items-center justify-center hover:border-brand transition-colors"
            >
              <Minus size={12} />
            </button>
            <span className="text-fg font-semibold text-sm w-6 text-center">{shownQty}</span>
            <button
              onClick={incrementQty}
              disabled={atMax}
              className="w-7 h-7 rounded-full border border-navy-border flex items-center justify-center hover:border-brand transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={12} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-brand font-bold text-sm">LKR {lineTotal.toLocaleString()}</span>
            <button
              onClick={handleRemove}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-colors text-muted"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CartGiftRow({
  name,
  imageUrl,
  basePrice,
  size,
  quantity = 1,
  badge = 'Free gift',
  subtitle = 'Included with your applied offer',
}: {
  name: string;
  imageUrl?: string | null;
  basePrice?: number | null;
  size?: string;
  quantity?: number;
  badge?: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      className="card p-4 flex gap-4 border-green-500/30 bg-green-500/5"
    >
      <ProductImage
        name={name}
        imageUrl={imageUrl}
        className="w-16 h-16 rounded-xl shrink-0"
        contain
      />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wide text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded">
          {badge}
        </span>
        <h3 className="font-semibold text-fg text-sm line-clamp-1 mt-1">{name}</h3>
        <p className="text-muted text-xs mt-0.5">
          {size}
          {size && subtitle ? ' · ' : ''}
          {subtitle}
        </p>
        <div className="flex items-center justify-between mt-3">
          <span className="text-fg font-semibold text-sm w-6 text-center">{quantity}</span>
          <div className="flex items-center gap-2">
            {basePrice != null && basePrice > 0 && (
              <span className="text-muted text-xs line-through">
                LKR {(basePrice * quantity).toLocaleString()}
              </span>
            )}
            <span className="text-green-400 font-bold text-sm">FREE</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function CartPage() {
  const { items, subtotal, orderMode, deliveryInfo, takeawayInfo, clearCart, getFulfillmentStoreId } = useCartStore();
  const reward = usePromoStore((s) => s.reward);
  const clearReward = usePromoStore((s) => s.clearReward);
  const router = useRouter();
  const sub = subtotal();
  useApplySpinClaim(sub, orderMode);
  usePromoSubtotalDiscount(sub);
  const isTakeaway = orderMode === 'TAKEAWAY';
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings-checkout'],
    queryFn: () =>
      api.get<{ pickupMaxOrderAmount?: number | null }>('/settings/app'),
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
    isTakeaway &&
    displayConvenienceFee > 0 &&
    appliesConvenienceFee(orderMode, previewPaymentMethod);
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

  function clearBogoOffer() {
    if (isFreeProductPromoKind(reward?.promotionKind)) {
      clearReward();
    }
  }
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
  const hasGift = hasSpinGift;
  const giftName = reward?.giftProduct?.name || reward?.giftLabel || 'Free gift';
  const totalQty = lineQty + (hasSpinGift ? 1 : 0);
  const fillLevel = cupFillFromCount(totalQty);
  const pourPulse = useCupPourPulse();
  const hasNearbyItems = items.some((i) => i.fulfillmentStore);
  const promoCartItems = useMemo(() => cartItemsToPromoPayload(items), [items]);

  if (items.length === 0) {
    return (
      <div>
        {(reward?.source === 'spin' || hasGift) && (
          <div className="max-w-md mx-auto px-4 pt-8">
            <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted">
                {hasGift ? 'Free gift ready' : 'Spin reward ready'}
              </p>
              {hasGift ? (
                <div className="flex items-center gap-3 mt-2">
                  {reward?.giftProduct?.imageUrl ? (
                    <ProductImage
                      name={giftName}
                      imageUrl={reward.giftProduct.imageUrl}
                      className="w-14 h-14 rounded-xl shrink-0"
                      contain
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
                      <Gift size={22} className="text-green-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-white">{giftName}</p>
                    <p className="text-green-400 text-xs font-semibold mt-0.5">FREE</p>
                  </div>
                </div>
              ) : (
                <p className="font-bold text-white mt-0.5">{reward?.label}</p>
              )}
              {reward?.code && (
                <p className="font-mono text-xs text-brand mt-1">{reward.code}</p>
              )}
              <p className="text-muted text-xs mt-2">Add drinks to your cup to use this offer at checkout.</p>
            </div>
          </div>
        )}
        <EmptyCartState />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/menu" className="btn-outline p-2">
          <ChevronLeft size={18} />
        </Link>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <CupIcon
            fillLevel={fillLevel}
            fillFrom={pourPulse?.fillBefore}
            pouring={pourPulse != null}
            size="lg"
            itemCount={totalQty}
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-fg">Your Cup</h1>
            <p className="text-muted text-sm">
              {bogoFreeUnits > 0
                ? `${paidQty} drink${paidQty !== 1 ? 's' : ''} + ${bogoFreeUnits} free`
                : `${lineQty} drink${lineQty !== 1 ? 's' : ''}`}
              {hasGift ? ' + 1 free gift' : ''} · {Math.round(fillLevel * 100)}% full
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)] gap-8">
        {/* Items */}
        <div className="space-y-3">
          {hasNearbyItems && (
            <p className="text-xs text-amber-400/90 px-1">
              Items marked with 📍 are fulfilled from a nearby branch. Your main order branch stays the same.
            </p>
          )}
          <AnimatePresence mode="popLayout">
            {items.map((item) => {
              const lineFreeQty = getBogoFreeUnitsForCartLine(reward, item);
              const paidLineQty = getBogoPaidUnitsForCartLine(reward, item);
              const splitBogo = lineFreeQty > 0 && paidLineQty > 0;
              return (
                <Fragment key={item.id}>
                  <CartItemRow
                    item={item}
                    allItems={items}
                    displayQty={splitBogo ? paidLineQty : undefined}
                    bogoFreeQty={lineFreeQty}
                    onClearBogo={clearBogoOffer}
                  />
                  {splitBogo && (
                    <CartGiftRow
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
              <CartGiftRow
                name={giftName}
                imageUrl={reward?.giftProduct?.imageUrl}
                basePrice={reward?.giftProduct?.basePrice}
              />
            )}
          </AnimatePresence>

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => {
                clearCart();
                clearBogoOffer();
              }}
              className="text-sm text-muted hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <Trash2 size={13} /> Empty cup
            </button>
          </div>
        </div>

        {/* Order summary */}
        <div className="space-y-4">
          {/* Order mode info */}
          {orderMode && (
            <div className="card p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-muted font-semibold uppercase tracking-wider">Order Type</p>
                <button
                  type="button"
                  onClick={() => openOrderModal()}
                  className="text-xs font-bold text-brand hover:text-brand-light transition-colors"
                >
                  Change
                </button>
              </div>
              <div>
                <p className="text-fg text-sm font-medium">{orderMode === 'DELIVERY' ? 'Delivery' : 'Takeaway'}</p>
                {orderMode === 'DELIVERY' && deliveryInfo && (
                  <p className="text-muted text-xs">{deliveryInfo.address}</p>
                )}
                {orderMode === 'TAKEAWAY' && takeawayInfo && (
                  <p className="text-muted text-xs">{takeawayInfo.storeName}</p>
                )}
              </div>
              {(!deliveryInfo && !takeawayInfo) && (
                <p className="text-xs text-brand mt-2">⚠️ Setup delivery/pickup details at checkout</p>
              )}
            </div>
          )}

          {/* Price breakdown */}
          <div className="card p-5">
              <h3 className="font-semibold text-fg mb-4">Order Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted">
                  Subtotal (
                  {bogoFreeUnits > 0
                    ? `${paidQty} paid + ${bogoFreeUnits} free`
                    : `${lineQty} item${lineQty !== 1 ? 's' : ''}`}
                  {hasGift ? ' + 1 free gift' : ''})
                </span>
                <span className="text-fg">LKR {paidSubtotal.toLocaleString()}</span>
              </div>
              {baseDeliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Delivery fee</span>
                  <span className="text-fg">
                    {reward?.freeDelivery ? (
                      <span className="text-green-400">FREE</span>
                    ) : (
                      `LKR ${baseDeliveryFee.toLocaleString()}`
                    )}
                  </span>
                </div>
              )}
              {freeProductLine && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{freeProductLine}</span>
                  <span className="text-green-400 font-semibold">FREE</span>
                </div>
              )}
              {discount > 0 && !freeProductLine && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    Discount{discountPercentLabel != null ? ` (${discountPercentLabel}%)` : ''}
                  </span>
                  <span className="text-green-400">− LKR {discount.toLocaleString()}</span>
                </div>
              )}
              {showWaivedPickupConvenienceFee && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted line-through">
                    {formatConvenienceFeeLabel(orderMode, convenienceRates)}
                  </span>
                  <span className="text-muted line-through">
                    LKR {displayConvenienceFee.toLocaleString()}
                  </span>
                </div>
              )}
              {!isTakeaway && convenienceFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    {formatConvenienceFeeLabel(orderMode, convenienceRates)}
                  </span>
                  <span className="text-fg">LKR {convenienceFee.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t border-navy-border pt-3 flex justify-between font-bold">
                <span className="text-fg">Total</span>
                <span className="text-brand text-lg">LKR {total.toLocaleString()}</span>
              </div>
            </div>

            <PromoOffersPanel
              orderTotal={sub}
              orderMode={orderMode}
              storeId={getFulfillmentStoreId()}
              cartItems={promoCartItems}
              allowManualCode
              compact
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (!orderMode) {
                    openOrderModal();
                    return;
                  }
                  if (isTakeaway && pickupMaxOrderAmount != null) {
                    toast(pickupMaxOrderAmountToast(pickupMaxOrderAmount), { duration: 5000 });
                  }
                  router.push('/checkout');
                }}
                className="btn-primary w-full py-4 text-base order-2 sm:order-1"
              >
                Proceed to Checkout <ArrowRight size={18} />
              </motion.button>
              <Link
                href="/menu"
                className="btn-outline w-full py-4 text-base font-bold border-2 border-brand text-brand bg-brand/10 hover:bg-brand/15 hover:border-brand-light hover:text-brand-light order-1 sm:order-2"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
