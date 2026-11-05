"use client";

import { CircleAlert, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";

/** Shared look of the account pages (see AccountShell). */

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

/**
 * The customer's picture: the mascot peeking up in a blue circle, as on the phones' Order Now button. Decorative
 * (the name always sits beside it). Size it with `className` (e.g. size-12).
 */
export function MemberAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_30%,var(--color-brand-400),var(--color-brand-600)_75%)] shadow-[inset_0_1px_1px_rgb(255_255_255/0.45),0_8px_20px_-6px_rgb(15_33_71/0.5)] ring-3 ring-white",
        className,
      )}
    >
      {/* The artwork fills only part of the PNG (x 180-446, y 78-283 of 612 x 408): sized so it spans 78% of the
          circle and centred both ways, as on the Order Now button. */}
      <Image
        src="/images/order-now-mascot.png"
        alt=""
        width={612}
        height={408}
        sizes="112px"
        className="absolute top-[-2.9%] left-[-41.8%] w-[179.5%] max-w-none"
      />
    </span>
  );
}
/** A card without its padding, for cards whose sections pad themselves (`cn` doesn't merge, so p-0 can't undo card's). */
export const cardFrame = "rounded-[1.5rem] bg-white shadow-[0_24px_60px_-34px_rgb(15_33_71/0.5)] ring-1 ring-brand-100 sm:rounded-[2rem]";
export const card = cn(cardFrame, "p-5 sm:p-7");
export const primaryButton = cn(
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-snow shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:shadow-none",
  focusRing,
);
export const secondaryButton = cn(
  "inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 transition-colors ring-inset hover:bg-brand-50",
  focusRing,
);
/** Small text buttons in a card's action row (Edit, Delete). */
export const smallButton = cn(
  "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50",
  focusRing,
);

/** The field label and a text field, as on the sign-in card: a ring that turns brand blue, with a soft halo, on focus. */
export const fieldLabel = "flex items-baseline justify-between gap-2 text-[0.9375rem] font-semibold text-slate-700";
export function textField(invalid: boolean) {
  return cn(
    "mt-1.5 h-12 w-full rounded-[0.875rem] px-4 text-[0.9375rem] font-medium text-brand-950 ring-1 ring-inset outline-none transition-[box-shadow,background-color] placeholder:font-normal placeholder:text-slate-400 disabled:text-slate-500",
    invalid
      ? "bg-rose-50/50 ring-rose-300 focus:shadow-[0_0_0_4px_rgb(244_63_94/0.12)] focus:ring-rose-400"
      : "bg-slate-50/70 ring-slate-200 hover:ring-slate-300 focus:bg-white focus:shadow-[0_0_0_4px_rgb(48_121_234/0.14)] focus:ring-brand-500",
  );
}

export function ErrorText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

/** "Optional", after a field's label. */
export function OptionalTag() {
  return <span className="text-xs font-medium text-slate-400">Optional</span>;
}

export function BrowseMenuLink({ className }: { className?: string }) {
  return (
    <Link href="/menu" className={cn(primaryButton, className)}>
      <UtensilsCrossed className="size-4" aria-hidden="true" />
      Browse the Menu
    </Link>
  );
}

/**
 * For a title's highlighted words: the homepage headings' tilted yellow highlighter, made tall enough to sit behind
 * the whole words (a half-height swipe would leave their tops on the blue band), with their brand-blue words on it.
 * `data-highlight` lets useTitleMotion swipe it in.
 */
export function MarkerHighlight({ children }: { children: ReactNode }) {
  return (
    <span className="relative isolate mx-[0.05em] inline-block px-[0.2em] text-brand-700">
      <span
        aria-hidden="true"
        data-highlight
        className="absolute inset-x-0 top-[0.06em] bottom-[0.02em] -z-10 -rotate-2 rounded-[0.3em] bg-sun-300 shadow-[0_0.08em_0_var(--color-brand-800)]"
      />
      {children}
    </span>
  );
}

/** For a pop-up title's highlighted words: blue words on a tilted yellow marker swipe, as in the sign-in card. */
export function TitleHighlight({ children }: { children: ReactNode }) {
  return (
    <span className="relative isolate inline-block px-[0.12em] text-brand-700">
      <span aria-hidden="true" className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.5em] -rotate-2 rounded-full bg-sun-300" />
      {children}
    </span>
  );
}
