"use client";

import { ShoppingBag, Shuffle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import type { Product } from "@/types";
import { focusRing, primaryButton, secondaryButton } from "../accountUi";
import { formatLkr } from "../orders/orderParts";

/** The reel's steps: quick at first, slowing to a stop (ms between drinks). About 2 seconds in all. */
const STEP_DELAYS = [60, 60, 70, 70, 80, 90, 100, 115, 130, 150, 175, 205, 240, 290];

/** A random index into `length` items that isn't `not` (when there's a choice). */
function randomIndex(length: number, not: number | null) {
  if (length < 2 || not === null) return Math.floor(Math.random() * length);
  const index = Math.floor(Math.random() * (length - 1));
  return index >= not ? index + 1 : index;
}

/**
 * Surprise me: a slot window that shuffles through everything on the live menu suiting the mood (`pool`), slowing
 * down until it lands on one at random (never the same one twice running), then its name, description and price
 * with Order it (the menu's add-to-bag drawer, `onOrder`) and Spin again. With reduced motion it lands straight
 * away. `tint` is the mood's colour; the mood picker shows the panel, counts the spins and closes it.
 */
export function SurprisePanel({
  pool,
  tint,
  spinKey,
  onSpin,
  onClose,
  onOrder,
}: {
  pool: Product[];
  tint: string;
  /** Goes up with each press of Surprise me or Spin again. */
  spinKey: number;
  onSpin: () => void;
  onClose: () => void;
  onOrder: (product: Product) => void;
}) {
  const [shown, setShown] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const landed = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  // Each spinKey is a press of Surprise me or Spin again: run the reel and land on a new drink.
  useEffect(() => {
    const target = randomIndex(pool.length, landed.current);
    const stop = () => {
      landed.current = target;
      setShown(target);
      setSpinning(false);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || pool.length < 2) {
      timers.current.push(window.setTimeout(stop, 0));
    } else {
      // Step through the drinks from wherever the reel is, finishing on the target.
      const start = (target - STEP_DELAYS.length + pool.length * STEP_DELAYS.length) % pool.length;
      let at = 0;
      timers.current.push(window.setTimeout(() => setSpinning(true), 0));
      STEP_DELAYS.forEach((delay, step) => {
        at += delay;
        timers.current.push(window.setTimeout(() => setShown((start + step) % pool.length), at));
      });
      timers.current.push(window.setTimeout(stop, at + 120));
    }
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, [spinKey, pool]);

  const product = pool[shown];
  if (!product) return null;

  return (
    <div className={cn("relative mt-5 flex items-center gap-6 rounded-[1.5rem] p-5 max-sm:flex-col max-sm:items-start sm:p-6", tint)}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the surprise"
        className={cn("absolute top-3 right-3 grid size-8 place-items-center rounded-full text-slate-500 transition-colors hover:bg-white/70 hover:text-brand-950", focusRing)}
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      {/* The slot window: the drinks drop through it while it spins. */}
      <div
        aria-hidden="true"
        className="relative grid h-44 w-40 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-[inset_0_10px_14px_-10px_rgb(15_33_71/0.25),inset_0_-10px_14px_-10px_rgb(15_33_71/0.25)] ring-1 ring-brand-100"
      >
        {/* The menu's photos come from the backend's storage, as on the menu itself. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={`${spinKey}-${shown}-${spinning}`}
          src={product.imageUrl ?? ""}
          alt=""
          className={cn("max-h-36 w-auto object-contain drop-shadow-[0_10px_10px_rgb(15_33_71/0.2)] motion-reduce:animate-none", spinning ? "animate-slot-in blur-[1px]" : "animate-slot-land")}
        />
      </div>

      <div className="min-w-0 flex-1">
        {/* While it spins the names flick past with the drinks; the description keeps its space, so nothing jumps. */}
        <p className="text-[0.6875rem] font-bold tracking-[0.16em] text-brand-700 uppercase">{spinning ? "Shuffling…" : "Your surprise"}</p>
        {spinning ? (
          <p className="mt-1 truncate text-2xl leading-tight font-bold text-brand-950/50">{product.name}</p>
        ) : (
          <button type="button" onClick={() => onOrder(product)} className={cn("mt-1 block rounded text-left text-2xl leading-tight font-bold text-brand-950 hover:underline", focusRing)}>
            {product.name}
          </button>
        )}
        <p className={cn("mt-1.5 line-clamp-2 min-h-10 max-w-xl text-sm text-slate-600", spinning && "invisible")}>{product.description}</p>
        <p className={cn("font-numeric mt-2 text-base font-extrabold text-brand-700", spinning && "invisible")}>{formatLkr(product.basePrice)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onOrder(product)} disabled={spinning} className={cn(primaryButton, "px-5 py-2.5")}>
            <ShoppingBag className="size-4" aria-hidden="true" />
            Order it
          </button>
          <SpinButton disabled={spinning} label="Spin again" onSpin={onSpin} />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {spinning ? "" : `Your surprise: ${product.name}`}
      </p>
    </div>
  );
}

/** Surprise me / Spin again, with the shuffle icon. */
export function SpinButton({ label, onSpin, disabled = false, className }: { label: string; onSpin: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onSpin} className={cn(secondaryButton, "px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-60", className)}>
      <Shuffle className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
