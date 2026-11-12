'use client';

import { ArrowRight, Bike, MapPin, Store, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import PromoOffersPanel from '@/components/promotions/PromoOffersPanel';
import { cn } from '@/components/home-redesign/lib/cn';
import { cartCopy } from './cartCopy';
import { PopValue } from './CartMotion';

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

type SummaryRow = {
  label: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
  muted?: boolean;
};

export function CartSummary({
  orderMode,
  deliveryAddress,
  takeawayStoreName,
  rows,
  total,
  promoOrderTotal,
  storeId,
  promoCartItems,
  onCheckout,
  onEmpty,
}: {
  orderMode: 'DELIVERY' | 'TAKEAWAY' | null;
  deliveryAddress?: string | null;
  takeawayStoreName?: string | null;
  rows: SummaryRow[];
  total: number;
  promoOrderTotal: number;
  storeId?: string | null;
  promoCartItems: ReturnType<typeof import('@/lib/promoCartLines').cartItemsToPromoPayload>;
  onCheckout: () => void;
  onEmpty: () => void;
}) {
  const Icon = !orderMode ? MapPin : orderMode === 'TAKEAWAY' ? Store : Bike;
  const kicker = !orderMode
    ? cartCopy.orderType
    : orderMode === 'TAKEAWAY'
      ? 'Pickup from'
      : 'Delivery to';
  const name = !orderMode
    ? cartCopy.chooseStore
    : orderMode === 'TAKEAWAY'
      ? takeawayStoreName || 'Selected branch'
      : deliveryAddress || 'Address at checkout';

  return (
    <section
      aria-labelledby="cart-summary-heading"
      data-cart="summary"
      className="rounded-[1.5rem] bg-brand-50 p-4 ring-1 ring-brand-100 ring-inset sm:rounded-[2rem] sm:p-6 lg:sticky lg:top-28"
    >
      <h2
        id="cart-summary-heading"
        className="font-display-condensed text-[1.75rem] leading-none text-brand-950 uppercase sm:text-4xl"
      >
        {cartCopy.summaryHeading}
      </h2>

      <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-white py-2 pr-2 pl-2.5 ring-1 ring-brand-100 ring-inset sm:mt-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <p className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug">
          <span className="text-[0.625rem] font-semibold tracking-[0.1em] break-words text-slate-500 uppercase">
            {kicker}
          </span>
          <span className="text-sm font-semibold break-words text-brand-950">{name}</span>
        </p>
        <button
          type="button"
          onClick={() => openOrderModal()}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-brand-200 ring-inset transition-colors hover:bg-brand-50',
            focusRing,
          )}
        >
          {cartCopy.changeBranch}
        </button>
      </div>

      <dl className="mt-4 flex flex-col gap-2 text-sm sm:mt-5 sm:gap-3 sm:text-base">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start justify-between gap-4">
            <dt className={cn('text-slate-600', row.muted && 'line-through')}>{row.label}</dt>
            <dd
              className={cn(
                'font-numeric shrink-0 font-semibold text-brand-950',
                row.muted && 'line-through text-slate-400',
                row.valueClassName,
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-end justify-between gap-4 border-t-2 border-dashed border-brand-200 pt-3 sm:mt-5 sm:pt-5">
        <p className="text-sm font-semibold text-brand-950 sm:text-base">{cartCopy.total}</p>
        <p className="font-numeric text-2xl leading-none font-extrabold whitespace-nowrap text-brand-600 sm:text-[2rem]">
          <PopValue value={`LKR ${total.toLocaleString()}`} className="origin-right" />
        </p>
      </div>

      <PromoOffersPanel
        orderTotal={promoOrderTotal}
        orderMode={orderMode}
        storeId={storeId}
        cartItems={promoCartItems}
        allowManualCode
        compact
        className="mt-4 sm:mt-6"
      />

      <button
        type="button"
        onClick={onCheckout}
        className={cn(
          'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-base font-semibold text-snow shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 sm:mt-6 sm:py-4 sm:text-lg',
          focusRing,
        )}
      >
        {cartCopy.checkout}
        <ArrowRight className="size-5" aria-hidden="true" />
      </button>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Link
          href="/menu"
          className={cn(
            'text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800',
            focusRing,
          )}
        >
          {cartCopy.continueShopping}
        </Link>
        <button
          type="button"
          onClick={onEmpty}
          className={cn(
            'inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-rose-600',
            focusRing,
          )}
        >
          <Trash2 className="size-3.5" />
          {cartCopy.emptyCup}
        </button>
      </div>
    </section>
  );
}
