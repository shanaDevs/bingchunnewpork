'use client';

import { ArrowRight, ShoppingBag, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import toast from 'react-hot-toast';
import { cn } from '@/components/home-redesign/lib/cn';
import { formatLkr } from '@/components/menu-redesign/lib/formatMenuPrice';
import { QuantityStepper, ToppingsField } from '@/components/menu-redesign/product/ProductOptions';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { useBranchOrderingHours } from '@/hooks/useBranchOrderingHours';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import {
  getProductOrderableQty,
  getRemainingOrderQty,
  isProductInStock,
} from '@/lib/productAvailability';
import { flyToCart } from '@/lib/cartFeedback';
import { resolveProductImageUrl } from '@/lib/productImageUrl';
import { calcUnitPrice, useCartStore } from '@/store/cartStore';
import type { Product, Topping } from '@/types';

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
const MAX_QUANTITY = 99;

type QuickAddDialogProps = {
  product: Product;
  onClose: () => void;
};

export function QuickAddDialog({ product, onClose }: QuickAddDialogProps) {
  const id = useId();
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const branchOrdering = useBranchOrderingHours();

  const availableToppings = useMemo(
    () => (product.toppings ?? []).map((pt) => pt.topping).filter((t) => t.isAvailable),
    [product.toppings],
  );

  const [selectedToppings, setSelectedToppings] = useState<Topping[]>([]);
  const [quantity, setQuantity] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);
  const photoRef = useRef<HTMLImageElement>(null);

  const orderableQty = getProductOrderableQty(product);
  const remainingQty = getRemainingOrderQty(product, cartItems);
  const maxPickerQty = remainingQty === Number.MAX_SAFE_INTEGER ? MAX_QUANTITY : remainingQty;
  const maxQty = Math.min(MAX_QUANTITY, maxPickerQty > 0 ? maxPickerQty : MAX_QUANTITY);

  const unitPrice = calcUnitPrice(product, 'REGULAR', selectedToppings);
  const total = unitPrice * quantity;
  const imageSrc = resolveProductImageUrl(product.imageUrl) ?? '/promos/menu-hero-cup.png';
  const orderingClosed = branchOrdering.hasBranch && !branchOrdering.isOpen;
  const inStock = isProductInStock(product);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    unmounting.current = false;
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    return () => {
      unmounting.current = true;
      dialog.close();
      document.documentElement.style.removeProperty('overflow');
    };
  }, []);

  const toggleTopping = (topping: Topping) => {
    setSelectedToppings((current) =>
      current.some((t) => t.id === topping.id)
        ? current.filter((t) => t.id !== topping.id)
        : [...current, topping],
    );
  };

  const add = (event: MouseEvent<HTMLButtonElement>) => {
    if (orderingClosed) {
      toast.error('Online ordering is closed.');
      return;
    }
    if (!inStock) {
      toast.error('This item is not available at your branch.');
      return;
    }
    const cartState = useCartStore.getState();
    if (!hasCompletedOrderSetup(cartState)) {
      onClose();
      openOrderModal();
      return;
    }
    const result = addItem({
      product,
      size: 'REGULAR',
      toppings: selectedToppings,
      quantity,
      unitPrice,
    });
    if (!result.ok) {
      toast.error(
        result.reason === 'ordering_closed'
          ? 'Online ordering is closed.'
          : orderableQty === Number.MAX_SAFE_INTEGER
            ? 'Unable to add this item.'
            : 'Not enough stock for that quantity.',
      );
      return;
    }
    if (result.clamped) toast.error('Quantity adjusted to match branch stock.');
    else flyToCart(photoRef.current, event.currentTarget);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent p-0 backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex md:items-center md:p-4"
    >
      <div className="relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-white text-slate-900 shadow-2xl shadow-brand-950/30 transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0 md:max-h-[calc(100dvh-2rem)] md:max-w-lg md:rounded-3xl">
        <header className="flex shrink-0 items-center gap-4 border-b border-brand-100 p-5 pr-16">
          <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-brand-50 ring-1 ring-brand-100 ring-inset">
            <Image
              ref={photoRef}
              src={imageSrc}
              alt=""
              width={463}
              height={800}
              sizes="64px"
              className="h-16 w-auto object-contain drop-shadow-[0_6px_8px_rgb(15_33_71/0.2)]"
            />
          </div>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-lg leading-snug font-semibold text-brand-950">
              {product.name}
            </h2>
            <p className="font-numeric mt-0.5 text-lg font-extrabold text-brand-600">{formatLkr(product.basePrice)}</p>
            <Link
              href={`/menu/${product.id}`}
              onClick={onClose}
              className={cn(
                'group mt-0.5 inline-flex items-center gap-1 rounded text-xs font-semibold text-slate-500 hover:text-brand-700',
                focusRing,
              )}
            >
              View full details
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              'absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100',
              focusRing,
            )}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        {availableToppings.length > 0 && (
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <ToppingsField toppings={availableToppings} value={selectedToppings} onToggle={toggleTopping} />
          </div>
        )}

        <footer
          className={cn(
            'flex shrink-0 items-center gap-2 px-5 py-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] sm:gap-3 sm:p-5 sm:max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))]',
            availableToppings.length > 0 && 'border-t border-brand-100',
          )}
        >
          <QuantityStepper value={quantity} onChange={setQuantity} max={maxQty} disabled={!inStock || maxQty <= 0} />
          <button
            type="button"
            onClick={add}
            disabled={!inStock || maxQty <= 0}
            className={cn(
              'flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-semibold whitespace-nowrap text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:opacity-50 sm:h-auto sm:py-3 sm:text-base',
              focusRing,
            )}
          >
            <ShoppingBag className="size-5 shrink-0 max-sm:hidden" aria-hidden="true" />
            <span>Add to cart</span>
            <span aria-hidden="true" className="-mx-0.5 opacity-60 sm:mx-0">
              ·
            </span>
            <span className="font-numeric font-bold sm:font-semibold">{formatLkr(total)}</span>
          </button>
        </footer>
      </div>
    </dialog>
  );
}
