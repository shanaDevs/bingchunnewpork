'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { Button } from '@/components/home-redesign/ui/Button';
import { cn } from '@/components/home-redesign/lib/cn';
import { MASCOT_IMAGES } from '@/lib/mascotImages';
import { cartCopy } from './cartCopy';
import { useEmptyBagEntrance } from './CartMotion';

const STAR_PATH =
  'M12 0C12.9 6.6 17.4 11.1 24 12 17.4 12.9 12.9 17.4 12 24 11.1 17.4 6.6 12.9 0 12 6.6 11.1 11.1 6.6 12 0Z';

export function CartEmpty() {
  const ref = useRef<HTMLDivElement>(null);
  useEmptyBagEntrance(ref);

  return (
    <div
      ref={ref}
      className="relative isolate mx-auto flex max-w-2xl flex-col items-center overflow-hidden rounded-[2.5rem] bg-cream-50 px-6 pt-8 pb-10 text-center ring-1 ring-cream-200 ring-inset sm:px-12 sm:pt-10 sm:pb-12"
    >
      <span
        aria-hidden="true"
        className="absolute top-2 left-1/2 -z-10 aspect-square w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-100),transparent)]"
      />
      {[
        'top-14 left-[18%] size-4 [animation-delay:-1s]',
        'top-28 right-[16%] size-5 [animation-delay:-2.6s]',
        'top-44 left-[24%] size-3 [animation-delay:-3.8s]',
      ].map((className) => (
        <span
          key={className}
          aria-hidden="true"
          className={cn(
            'absolute -z-10 animate-float rounded-full bg-[radial-gradient(circle_at_32%_28%,#5a4a63_0%,#231a2b_38%,#0b0710_100%)] shadow-[0_4px_8px_rgb(15_33_71/0.3)] max-sm:hidden',
            className,
          )}
        />
      ))}
      <Image
        src={MASCOT_IMAGES.emptyCartSad}
        alt=""
        width={500}
        height={500}
        sizes="208px"
        data-cart-empty="mascot"
        className="size-40 origin-bottom animate-mascot-sway object-contain sm:size-52"
      />
      <h2
        data-cart-empty="title"
        className="mt-2 font-display-condensed text-[clamp(2rem,5vw,3rem)] leading-[0.95] text-brand-950 uppercase"
      >
        {cartCopy.empty.titleBefore}
        <span className="relative isolate inline-block px-[0.1em] text-brand-700">
          <span
            aria-hidden="true"
            data-cart-empty="highlight"
            className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.4em] -rotate-2 rounded-full bg-sun-300"
          />
          {cartCopy.empty.titleHighlight}
        </span>
      </h2>
      <p data-cart-empty="text" className="mt-3 max-w-md text-base text-slate-600 sm:text-lg">
        {cartCopy.empty.text}
      </p>
      <Button href="/menu" data-cart-empty="cta" className="mt-7 px-8 py-3.5 text-base shadow-lg shadow-brand-600/25">
        {cartCopy.empty.cta}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-sun-300">
          <path d={STAR_PATH} />
        </svg>
      </Button>
    </div>
  );
}
