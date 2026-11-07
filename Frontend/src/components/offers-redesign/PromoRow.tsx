"use client";

import { ChevronRight, Hourglass, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { CopyCodeButton } from "@/components/home-redesign/sections/offers/CopyCodeButton";
import type { Promotion } from "./promotion";
import { cardTheme, DealFigure, focusRing, PromotionArtwork } from "./parts";
import { PromoCard } from "./PromoCard";

/**
 * One promotion as a compact coupon, for phones (DealsExplorer shows PromoCard from 640px): its art on the left,
 * past a perforated tear line with notches cut top and bottom; on the right the "Limited time" chip (when it's in
 * that category), the big figure, the name, and its promo code with a copy button.
 * The name is a button stretched over the whole coupon, so a tap anywhere opens the full deal (`onOpen`,
 * DealSheet); the copy button sits above it and only copies.
 */
export function PromoRow({ promotion, onOpen, className }: { promotion: Promotion; onOpen: () => void; className?: string }) {
  const theme = cardTheme(promotion);
  const { style } = theme;

  return (
    <article className={cn("relative isolate flex min-h-32 overflow-hidden rounded-2xl", style.card, className)} style={theme.cardStyle}>
      <div aria-hidden="true" className="relative w-26 shrink-0 border-r-2 border-dashed border-current/20">
        <span className={cn("absolute top-1/2 left-1/2 aspect-square w-[82%] -translate-1/2 rounded-full", style.glow)} />
        <PromotionArtwork promotion={promotion} sizes="104px" className="absolute inset-x-[6%] top-1/2 h-[80%] -translate-y-1/2" />
        {/* The notches, the page's white showing through. */}
        <span className="absolute -top-3 -right-3 size-6 rounded-full bg-white" />
        <span className="absolute -right-3 -bottom-3 size-6 rounded-full bg-white" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-3 pr-9 pl-3.5">
        {promotion.categories.includes("limited") && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-sun-300 px-2 py-0.5 text-[0.625rem] leading-none font-bold tracking-[0.06em] text-brand-950 uppercase">
              <Hourglass className="size-2.5" aria-hidden="true" />
              Limited time
            </span>
          </div>
        )}
        <DealFigure promotion={promotion} theme={theme} className="text-[2.25rem]" />
        <h3 className="text-[0.9375rem] leading-snug font-bold">
          <button
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            className="cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-3 focus-visible:after:-outline-offset-3 focus-visible:after:outline-current"
          >
            {promotion.title}
          </button>
        </h3>
        <p className="relative z-10 flex items-center gap-1">
          <span className="sr-only">Code</span>
          <span className={cn("rounded-md border-2 border-dashed px-2 py-0.5 font-mono text-sm font-bold tracking-[0.12em] select-all", style.code)}>{promotion.code}</span>
          <CopyCodeButton code={promotion.code} className={cn("max-sm:size-10", style.copy)} />
        </p>
      </div>

      <ChevronRight className="pointer-events-none absolute top-1/2 right-2.5 size-5 -translate-y-1/2 opacity-60" aria-hidden="true" />
    </article>
  );
}

/**
 * A deal in full, in a sheet up from the bottom (phones, from a PromoRow): the same PromoCard the larger screens
 * show in the grid, with its description, code, end date and action. A native modal <dialog>: the page behind is
 * inert, Escape, the close button or a tap outside close it, and focus goes back to the coupon that opened it.
 */
export function DealSheet({ promotion, onClose }: { promotion: Promotion; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    unmounting.current = false;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      unmounting.current = true;
      dialog.close();
      document.documentElement.style.removeProperty("overflow");
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={promotion.title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A close the browser forces (e.g. repeated Escape) still leaves the sheet; skip the one from unmounting.
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent p-0 backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex"
    >
      {/* The card's action closes the sheet as it goes: it may open the order prompt, which the modal would cover. */}
      <div
        onClickCapture={(event) => {
          if ((event.target as Element).closest("[data-promo-action]")) onClose();
        }}
        className="relative max-h-[calc(100dvh-0.75rem)] w-full overflow-y-auto rounded-t-[1.75rem] bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900 shadow-2xl shadow-brand-950/30 transition-[opacity,translate] duration-300 ease-out starting:translate-y-6 starting:opacity-0"
      >
        <div className="relative mb-3 flex h-10 items-center justify-center">
          <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-slate-200" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn("absolute top-0 right-0 grid size-10 cursor-pointer place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100", focusRing)}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <PromoCard promotion={promotion} className="w-full" />
      </div>
    </dialog>
  );
}
