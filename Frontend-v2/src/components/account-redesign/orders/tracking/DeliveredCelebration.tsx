"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { playOrderDeliveredSound } from "@/lib/uiSounds";
import { primaryButton } from "../../accountUi";

/** How long it stays up by itself, as on the old tracking page. */
const VISIBLE_MS = 5800;
const COLOURS = ["bg-sun-300", "bg-sun-400", "bg-emerald-400", "bg-brand-500", "bg-pink-400", "bg-violet-400", "bg-white", "bg-brand-300"];
const PIECES = Array.from({ length: 40 }, (_, index) => ({
  left: `${(index * 13 + 5) % 100}%`,
  delay: `${(index % 10) * 0.08}s`,
  colour: COLOURS[index % COLOURS.length],
  size: 0.45 + (index % 5) * 0.12,
}));

/**
 * The moment an order is delivered (or ready for pickup) while its details are open, as the old tracking page had
 * it: confetti, the cheering mascot, "Delivered!" or "Ready for Pickup!", the order number, a line, and Awesome! / On
 * my way!, with the delivered sound (not with reduced motion). It closes itself after a few seconds, or with a tap
 * outside, Escape or its button. A native modal <dialog>, above everything.
 */
export function DeliveredCelebration({ orderNumber, delivery, onClose }: { orderNumber: string; delivery: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const unmounting = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    unmounting.current = false;
    dialog.showModal();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) playOrderDeliveredSound();
    const timer = window.setTimeout(onClose, VISIBLE_MS);
    return () => {
      unmounting.current = true;
      window.clearTimeout(timer);
      dialog.close();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="celebration-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // bg-transparent! beats .home-redesign's own white background (unlayered CSS), so the dimmed backdrop shows.
      className="home-redesign m-0 h-dvh max-h-none w-full max-w-none items-center justify-center overflow-hidden bg-transparent! p-4 backdrop:bg-brand-950/60 backdrop:backdrop-blur-[3px] open:flex"
    >
      {PIECES.map((piece, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn("pointer-events-none absolute top-0 animate-confetti-fall rounded-sm motion-reduce:hidden", piece.colour)}
          style={{ left: piece.left, animationDelay: piece.delay, width: `${piece.size}rem`, height: `${piece.size * 1.4}rem` }}
        />
      ))}
      <div className="relative w-full max-w-sm rounded-[2rem] bg-white px-6 pt-6 pb-7 text-center shadow-2xl shadow-brand-950/30 transition-[opacity,scale] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] starting:scale-50 starting:opacity-0">
        <p className="text-sm font-bold tracking-[0.12em] text-brand-600 uppercase">{delivery ? "🏆 You won!" : "🎊 Woohoo!"}</p>
        <h2 id="celebration-title" className="mt-1 font-display-condensed text-5xl leading-none text-brand-950 uppercase">
          {delivery ? "Delivered!" : "Ready for pickup!"}
        </h2>
        <p className="font-numeric mt-1 text-sm font-bold text-slate-500">#{orderNumber}</p>
        <Image src="/mascots/order-confirmed.png" alt="Bing Chun mascot celebrating" width={280} height={280} className="mx-auto mt-2 size-44 animate-float object-contain motion-reduce:animate-none" priority />
        <p className="mt-2 text-sm text-slate-700">{delivery ? "Your order has arrived — enjoy every sip!" : "Head to the counter and collect your order!"}</p>
        <button type="button" onClick={onClose} className={cn(primaryButton, "mt-5 w-full")}>
          {delivery ? "Awesome!" : "On my way!"}
        </button>
      </div>
    </dialog>
  );
}
