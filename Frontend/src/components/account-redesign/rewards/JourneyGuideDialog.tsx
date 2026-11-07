"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { guideForStep } from "@/components/loyalty/LoyaltyJourneyTutorialModal";
import type { CustomerLoyaltyJourney, CustomerLoyaltyJourneyStepKey } from "@/lib/loyalty";
import { focusRing, primaryButton, secondaryButton } from "../accountUi";

/**
 * How one loyalty-journey offer works, opened from its stop on the journey track: its status, the tip and steps (the
 * old rewards page's guide, guideForStep), and the whole path with this offer marked. A native modal <dialog>, in
 * the account's pop-up style: a sheet from the bottom on phones, a centred card wider.
 */
export function JourneyGuideDialog({ journey, focusKey, onClose }: { journey: CustomerLoyaltyJourney; focusKey: CustomerLoyaltyJourneyStepKey; onClose: () => void }) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);
  const step = journey.steps.find((item) => item.key === focusKey) ?? journey.steps[0];

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

  if (!step) return null;
  const guide = guideForStep(step);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-status`}
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
      // bg-transparent! beats .home-redesign's own white background (unlayered CSS), so the dimmed backdrop shows.
      className="home-redesign m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent! p-0 backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex md:items-center md:p-4"
    >
      <div className="relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-white text-slate-900 shadow-2xl shadow-brand-950/30 transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0 md:max-h-[calc(100dvh-2rem)] md:max-w-md md:rounded-3xl">
        <header className="shrink-0 px-6 pt-6 pr-18">
          <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-brand-600 uppercase">Offer {step.stepNumber} · How it works</p>
          <h2
            id={`${id}-title`}
            className="mt-1 font-display text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.01em] text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em]"
          >
            {step.title}
          </h2>
          <p id={`${id}-status`} className="mt-1.5 text-sm text-slate-600">
            <span className="font-semibold text-brand-950">{step.statusLabel}</span>
            {step.detail ? ` · ${step.detail}` : ""}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn("absolute top-5 right-5 grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100", focusRing)}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-6 pt-4 pb-6 max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p className="rounded-2xl bg-cream-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-cream-200 ring-inset">{guide.tip}</p>

          <h3 className="mt-5 text-sm font-bold text-brand-950">{guide.howTitle}</h3>
          <ol className="mt-2 flex flex-col gap-2">
            {guide.steps.map((line, index) => (
              <li key={line} className="flex gap-3 text-sm text-slate-700">
                <span className="font-numeric grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{index + 1}</span>
                {line}
              </li>
            ))}
          </ol>

          <h3 className="mt-5 text-sm font-bold text-brand-950">The whole journey</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {journey.steps.map((item) => {
              const isFocus = item.key === step.key;
              return (
                <li
                  key={item.key}
                  aria-current={isFocus ? "step" : undefined}
                  className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm", isFocus ? "bg-brand-50 ring-1 ring-brand-200 ring-inset" : "")}
                >
                  <span
                    className={cn(
                      "font-numeric grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                      item.status === "completed" ? "bg-emerald-500 text-snow" : "bg-white text-brand-700 ring-1 ring-brand-200",
                    )}
                  >
                    {item.status === "completed" ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : item.stepNumber}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-brand-950">Offer {item.stepNumber}</span> <span className="text-slate-600">{item.title}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{item.statusLabel}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Got it
            </button>
            <Link href="/menu" onClick={onClose} className={primaryButton}>
              Order now
            </Link>
          </div>
        </div>
      </div>
    </dialog>
  );
}
