'use client';

import { Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/components/home-redesign/lib/cn';
import { formatLkrShort } from '@/components/menu-redesign/lib/formatMenuPrice';
import { mapProductTag, productStageScale, tagStyles, type MenuCardTag } from '@/components/menu-redesign/lib/tagStyles';
import { QuickAddDialog } from '@/components/menu-redesign/QuickAddDialog';
import { getMenuUnavailableBadgeLabel, isProductComingSoon } from '@/lib/productAvailability';
import { markMenuReturn } from '@/lib/menuReturn';
import { resolveProductImageUrl } from '@/lib/productImageUrl';
import type { Product } from '@/types';

type MenuProductCardProps = {
  product: Product;
  available: boolean;
  layout?: 'grid' | 'list';
  fromMenu?: boolean;
  orderingClosed?: boolean;
};

function TagBadge({ tag }: { tag: MenuCardTag }) {
  const { className, icon: Icon, label } = tagStyles[tag];
  return (
    <p
      className={cn(
        'pointer-events-none absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold shadow-sm sm:top-4 sm:right-4 sm:text-xs',
        className,
      )}
    >
      <Icon className="size-3 sm:size-3.5" strokeWidth={2.5} aria-hidden="true" />
      {label}
    </p>
  );
}

function CardMascot() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -top-3 -left-3 z-20 w-12 origin-bottom-right translate-x-3 translate-y-4 scale-50 rotate-12 opacity-0 transition duration-200 ease-in group-hover:translate-0 group-hover:scale-100 group-hover:-rotate-6 group-hover:opacity-100 group-hover:delay-75 group-hover:duration-500 group-hover:ease-[cubic-bezier(0.34,1.56,0.64,1)] sm:w-14"
    >
      <Image
        src="/images/mascot-hover.png"
        alt=""
        width={463}
        height={594}
        sizes="56px"
        className="sticker block h-auto w-full origin-bottom animate-mascot-sway [animation-play-state:paused] group-hover:[animation-play-state:running]"
      />
    </div>
  );
}

function CardGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      <div className="absolute inset-y-0 left-0 w-3/5 translate-x-[-100%] bg-[linear-gradient(105deg,transparent_30%,rgb(255_255_255/0.55)_50%,transparent_70%)] group-hover:translate-x-[170%] group-hover:transition-[translate] group-hover:delay-100 group-hover:duration-900 group-hover:ease-in-out" />
    </div>
  );
}

function QuickAddButton({ product, orderingClosed }: { product: Product; orderingClosed: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (orderingClosed) return;
          setOpen(true);
        }}
        disabled={orderingClosed}
        aria-haspopup="dialog"
        aria-label={
          orderingClosed ? 'Online ordering is closed' : `Add ${product.name} to cart`
        }
        className="absolute right-0 bottom-0 z-10 grid size-9 place-items-center rounded-full bg-brand-600 text-snow shadow-md shadow-brand-900/25 transition-[background-color,color,scale] duration-200 hover:scale-110 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 group-hover:bg-white group-hover:text-brand-700 group-hover:hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:group-hover:bg-brand-600 disabled:group-hover:text-snow sm:size-10"
      >
        <Plus className="size-5" strokeWidth={3} aria-hidden="true" />
      </button>
      {open && !orderingClosed && <QuickAddDialog product={product} onClose={() => setOpen(false)} />}
    </>
  );
}

export function MenuProductCard({
  product,
  available,
  layout = 'grid',
  fromMenu = true,
  orderingClosed = false,
}: MenuProductCardProps) {
  const markReturn = fromMenu ? () => markMenuReturn(product.id) : undefined;
  const cardTag = mapProductTag(product.tag);
  const imageSrc = resolveProductImageUrl(product.imageUrl) ?? '/promos/menu-hero-cup.png';
  const isList = layout === 'list';
  const comingSoon = isProductComingSoon(product);
  const unavailableBadge = getMenuUnavailableBadgeLabel(product);

  if (isList) {
    return (
      <article className="flex gap-4 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
        <div className="relative h-24 w-24 shrink-0">
          <Image src={imageSrc} alt="" fill className="object-contain" sizes="96px" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-brand-950">
            <Link href={`/menu/${product.id}`} onClick={markReturn} className="hover:underline">
              {product.name}
            </Link>
          </h3>
          <p className="font-numeric mt-1 text-brand-600 font-bold">{formatLkrShort(product.basePrice)}</p>
          {!available && (
            <p className="text-xs font-bold text-brand-950 uppercase mt-1">{unavailableBadge}</p>
          )}
        </div>
        {available && (
          <div className="self-center">
            <QuickAddButton product={product} orderingClosed={orderingClosed} />
          </div>
        )}
      </article>
    );
  }

  return (
    <article
      className={cn(
        'group relative isolate flex flex-col rounded-3xl bg-brand-50 p-3 ring-1 ring-brand-100 transition duration-300 starting:translate-y-3 starting:opacity-0 sm:p-4',
        available &&
          'hover:z-10 hover:-translate-y-2 hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-900/20 hover:ring-brand-600',
      )}
    >
      {available && <CardGlow />}
      {available && <CardMascot />}
      {cardTag && available && <TagBadge tag={cardTag} />}
      {!available && (
        <p
          className={cn(
            'pointer-events-none absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.08em] text-snow uppercase sm:top-4 sm:left-4',
            comingSoon ? 'bg-brand-600' : 'bg-brand-950',
          )}
        >
          {unavailableBadge}
        </p>
      )}

      <div className="relative flex h-36 items-end justify-center px-3 pt-5 sm:h-44 sm:px-4 sm:pt-6 xl:h-52">
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 -z-20 bg-[radial-gradient(ellipse_70%_68%_at_55%_52%,var(--color-brand-100)_0%,rgb(217_232_255/0.55)_45%,transparent_85%)] transition-opacity duration-300',
            available ? 'group-hover:opacity-0' : 'opacity-60 grayscale',
          )}
        />
        <div
          className="relative flex w-full items-end justify-center"
          style={{ height: `${productStageScale() * 100}%` }}
        >
          <Image
            src={imageSrc}
            alt=""
            width={463}
            height={800}
            sizes="(min-width: 1280px) 190px, (min-width: 640px) 160px, 130px"
            className={cn(
              'h-full w-auto object-contain drop-shadow-[0_10px_12px_rgb(15_33_71/0.2)] transition-[scale,filter,opacity] duration-300',
              available ? 'group-hover:scale-105' : 'opacity-60 grayscale-[65%]',
            )}
          />
        </div>
        {available && <QuickAddButton product={product} orderingClosed={orderingClosed} />}
      </div>

      <div className="flex flex-1 flex-col gap-2 px-1 pt-3 pb-1 sm:gap-3 sm:px-2 sm:pt-4 sm:pb-1">
        <h3
          className={cn(
            'text-base leading-snug font-semibold text-brand-950 transition-colors duration-300 sm:text-[1.0625rem]',
            available && 'group-hover:text-snow',
          )}
        >
          <Link
            href={`/menu/${product.id}`}
            onClick={markReturn}
            className="rounded-sm after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-brand-600"
          >
            {product.name}
            {!available && <span className="sr-only"> ({unavailableBadge})</span>}
          </Link>
        </h3>
        <p
          className={cn(
            'font-numeric mt-auto rounded-xl py-2.5 text-center text-lg leading-none font-extrabold whitespace-nowrap transition-colors duration-300 sm:py-3 sm:text-[1.375rem] lg:text-xl',
            available ? 'bg-brand-100 text-brand-600 group-hover:bg-white' : 'bg-slate-100 text-slate-400',
          )}
        >
          {formatLkrShort(product.basePrice)}
        </p>
      </div>
    </article>
  );
}
