"use client";

import { Award, Crown, Flame, Gem, Plus, Sparkles, Tag, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { cn } from "@/components/home-redesign/lib/cn";
import type { Product } from "@/types";
import { formatLkr } from "../orders/orderParts";

/**
 * The colours and icon for the admin's tag (free text, e.g. "Best Seller"); any other tag ("Rs.200 Only") gets a
 * plain one. None is brand blue, so they stay clear on a hovered (blue) card.
 */
const TAG_STYLES: Record<string, { className: string; icon: LucideIcon }> = {
  "best seller": { className: "bg-sun-400 text-brand-950", icon: Crown },
  signature: { className: "bg-violet-600 text-snow", icon: Gem },
  popular: { className: "bg-rose-500 text-snow", icon: Flame },
  new: { className: "bg-emerald-500 text-snow", icon: Sparkles },
  classic: { className: "bg-amber-700 text-snow", icon: Award },
};
const OTHER_TAG = { className: "bg-white text-brand-950", icon: Tag };

/**
 * One of the mood picker's suggestions, in the prototype menu card's look: ice-blue card, the cut-out on a soft blue
 * glow with a round + in its corner, the name, and the price in a light-blue box across the bottom. Hovering lifts it
 * and fills it with brand blue, a band of light sweeps across it and the mascot pops out of its top-left corner.
 * A live menu product (name, photo, tag and price as the admin set them); the whole card opens the menu's add-to-bag
 * drawer for it (`onOrder`).
 */
export function MoodCard({ product, onOrder }: { product: Product; onOrder: () => void }) {
  const label = product.tag?.trim();
  const tag = label ? (TAG_STYLES[label.toLowerCase().replace(/-/g, " ")] ?? OTHER_TAG) : null;
  const TagIcon = tag?.icon;
  return (
    <article className="group relative isolate flex flex-col rounded-3xl bg-brand-50 p-3 ring-1 ring-brand-100 transition duration-300 hover:z-10 hover:-translate-y-2 hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-900/20 hover:ring-brand-600 sm:p-4 starting:translate-y-3 starting:opacity-0">
      {/* A band of light sweeping once across the hovered card. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
        <div className="absolute inset-y-0 left-0 w-3/5 translate-x-[-100%] bg-[linear-gradient(105deg,transparent_30%,rgb(255_255_255/0.55)_50%,transparent_70%)] group-hover:translate-x-[170%] group-hover:transition-[translate] group-hover:delay-100 group-hover:duration-900 group-hover:ease-in-out" />
      </div>
      {/* Bing Chun popping out of the hovered card's top-left corner. */}
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
      {label && tag && TagIcon && (
        <p
          className={cn(
            "pointer-events-none absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold shadow-sm sm:top-4 sm:right-4 sm:text-xs",
            tag.className,
          )}
        >
          <TagIcon className="size-3 sm:size-3.5" strokeWidth={2.5} aria-hidden="true" />
          {label}
        </p>
      )}

      <div className="relative flex h-36 items-end justify-center px-3 pt-5 sm:h-44 sm:px-4 sm:pt-6 xl:h-52">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_70%_68%_at_55%_52%,var(--color-brand-100)_0%,rgb(217_232_255/0.55)_45%,transparent_85%)] transition-opacity duration-300 group-hover:opacity-0"
        />
        <div className="relative flex h-[90%] w-full items-end justify-center">
          {product.imageUrl ? (
            // The menu's photos come from the backend's storage, as on the menu itself.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-auto object-contain drop-shadow-[0_10px_12px_rgb(15_33_71/0.2)] transition-[scale] duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="self-center text-6xl">🧋</span>
          )}
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 z-10 grid size-9 place-items-center rounded-full bg-brand-600 text-snow shadow-md shadow-brand-900/25 transition-[background-color,color] duration-200 group-hover:bg-white group-hover:text-brand-700 sm:size-10"
        >
          <Plus className="size-5" strokeWidth={3} />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-1 pt-3 pb-1 sm:gap-3 sm:px-2 sm:pt-4 sm:pb-1">
        <h3 className="text-base leading-snug font-semibold text-brand-950 transition-colors duration-300 group-hover:text-snow sm:text-[1.0625rem]">
          {/* The button stretches over the whole card (its ::after). */}
          <button
            type="button"
            onClick={onOrder}
            className="rounded-sm text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-brand-600"
          >
            {product.name}
          </button>
        </h3>
        <p className="font-numeric mt-auto rounded-xl bg-brand-100 py-2.5 text-center text-lg leading-none font-extrabold whitespace-nowrap text-brand-600 transition-colors duration-300 group-hover:bg-white sm:py-3 sm:text-[1.375rem] lg:text-xl">
          {formatLkr(product.basePrice)}
        </p>
      </div>
    </article>
  );
}
