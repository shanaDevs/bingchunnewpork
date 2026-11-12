'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';
import { cn } from '@/components/home-redesign/lib/cn';
import ProductImage from '@/components/ui/ProductImage';
import { formatDrinkOptionLine } from '@/lib/drinkOptions';
import { getMaxLineQty, getProductOrderableQty } from '@/lib/productAvailability';
import type { LocalCartItem } from '@/store/cartStore';
import { useCartStore } from '@/store/cartStore';
import toast from 'react-hot-toast';
import { cartCopy } from './cartCopy';
import { animateItemOut, PopValue } from './CartMotion';

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

function formatLkr(amount: number) {
  return `LKR ${amount.toLocaleString()}`;
}

export function CartItemCard({
  item,
  allItems,
  displayQty,
  bogoFreeQty = 0,
  onClearBogo,
}: {
  item: LocalCartItem;
  allItems: LocalCartItem[];
  displayQty?: number;
  bogoFreeQty?: number;
  onClearBogo?: () => void;
}) {
  const { updateQuantity, removeItem } = useCartStore();
  const itemRef = useRef<HTMLLIElement>(null);
  const removing = useRef(false);
  const maxLineQty = getMaxLineQty(item.product, allItems, item.id);
  const orderableQty = getProductOrderableQty(item.product);
  const atMax = maxLineQty !== Number.MAX_SAFE_INTEGER && item.quantity >= maxLineQty;
  const shownQty = displayQty ?? item.quantity;
  const lineTotal = item.unitPrice * shownQty;
  const optionLine = [
    item.size,
    formatDrinkOptionLine({ iceLevel: item.iceLevel, sugarLevel: item.sugarLevel }),
    item.toppings.length > 0 ? item.toppings.map((t) => t.name).join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
      remove();
      return;
    }
    updateQuantity(item.id, nextQty);
  }

  function remove() {
    if (removing.current) return;
    removing.current = true;
    animateItemOut(itemRef.current, () => {
      removeItem(item.id);
      if (bogoFreeQty > 0) onClearBogo?.();
    });
  }

  return (
    <li
      ref={itemRef}
      data-cart="item"
      className={cn(
        'group grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2.5 rounded-[1.5rem] bg-white p-3 shadow-[0_14px_36px_-26px_rgb(15_33_71/0.45)] ring-1 ring-brand-100 transition-[translate,box-shadow] duration-300 sm:gap-x-5 sm:gap-y-3 sm:rounded-[1.75rem] sm:p-4',
        'hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-26px_rgb(31_98_214/0.55)] hover:ring-brand-200',
      )}
    >
      <Link
        href={`/product/${item.product.id}`}
        tabIndex={-1}
        aria-hidden="true"
        className="relative flex size-16 items-end justify-center overflow-hidden rounded-xl bg-brand-50 ring-1 ring-brand-100 ring-inset sm:row-span-2 sm:h-36 sm:w-32 sm:rounded-2xl"
      >
        <span className="absolute top-1/2 left-1/2 aspect-square w-[120%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,var(--color-brand-200),transparent)]" />
        <span data-cart="item-photo" className="relative block size-full">
          <ProductImage
            name={item.product.name}
            imageUrl={item.product.imageUrl}
            className="size-full p-1 drop-shadow-[0_8px_10px_rgb(15_33_71/0.22)] transition-[scale,rotate] duration-300 ease-out group-hover:scale-105 group-hover:-rotate-3"
            contain
          />
        </span>
      </Link>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] leading-snug font-semibold text-brand-950 sm:text-lg">
              <Link href={`/product/${item.product.id}`} className={cn('rounded-sm hover:text-brand-700', focusRing)}>
                {item.product.name}
              </Link>
            </h3>
            {optionLine && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 sm:text-[0.8125rem]">{optionLine}</p>
            )}
            {item.fulfillmentStore && (
              <p className="mt-1 text-xs font-semibold text-amber-600">
                {cartCopy.fromBranch(item.fulfillmentStore.name)}
              </p>
            )}
          </div>
          <p className="font-numeric hidden text-lg font-extrabold whitespace-nowrap text-brand-600 sm:block">
            <PopValue value={formatLkr(lineTotal)} className="origin-right" />
          </p>
        </div>

        <p className="font-numeric mt-0.5 text-xs font-medium text-slate-500 sm:mt-1.5 sm:text-[0.8125rem]">
          {cartCopy.each(formatLkr(item.unitPrice))}
        </p>
      </div>

      <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:col-start-2">
        <div className="inline-flex items-center gap-1 rounded-full bg-brand-50 p-1 ring-1 ring-brand-100 ring-inset">
          <button
            type="button"
            onClick={decrementQty}
            aria-label="Decrease quantity"
            className={cn(
              'grid size-8 place-items-center rounded-full text-brand-700 transition-colors hover:bg-white',
              focusRing,
            )}
          >
            <Minus className="size-3.5" strokeWidth={2.5} />
          </button>
          <span className="font-numeric w-7 text-center text-sm font-bold text-brand-950">{shownQty}</span>
          <button
            type="button"
            onClick={incrementQty}
            disabled={atMax}
            aria-label="Increase quantity"
            className={cn(
              'grid size-8 place-items-center rounded-full text-brand-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40',
              focusRing,
            )}
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>

        <p className="font-numeric text-base font-extrabold text-brand-600 sm:hidden">
          <PopValue value={formatLkr(lineTotal)} />
        </p>

        <button
          type="button"
          onClick={remove}
          aria-label={`${cartCopy.remove} ${item.product.name}`}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 max-sm:w-9 max-sm:justify-center max-sm:px-0 sm:h-10',
            focusRing,
          )}
        >
          <Trash2 className="size-3.5" strokeWidth={2.25} />
          <span className="max-sm:hidden">{cartCopy.remove}</span>
        </button>
      </div>
    </li>
  );
}

export function CartGiftCard({
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
    <li
      data-cart="item"
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-[1.5rem] bg-emerald-50/80 p-3 ring-1 ring-emerald-200 ring-inset sm:gap-x-5 sm:rounded-[1.75rem] sm:p-4"
    >
      <div className="relative flex size-16 items-end justify-center overflow-hidden rounded-xl bg-emerald-100/60 ring-1 ring-emerald-200 ring-inset sm:row-span-2 sm:h-36 sm:w-32 sm:rounded-2xl">
        <span data-cart="item-photo" className="relative block size-full">
          <ProductImage name={name} imageUrl={imageUrl} className="size-full p-1" contain />
        </span>
      </div>
      <div className="min-w-0">
        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-emerald-700 uppercase">
          {badge}
        </span>
        <h3 className="mt-1 text-[0.9375rem] font-semibold text-brand-950 sm:text-lg">{name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {[size, subtitle].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-brand-950">{quantity}</span>
          <div className="flex items-center gap-2">
            {basePrice != null && basePrice > 0 && (
              <span className="text-xs text-slate-400 line-through">{formatLkr(basePrice * quantity)}</span>
            )}
            <span className="text-sm font-bold text-emerald-600">{cartCopy.free}</span>
          </div>
        </div>
      </div>
    </li>
  );
}
