"use client";

import { ArrowRight, Clock, Loader2, RotateCcw, Sparkles, Star, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { homeFontVariables } from "@/components/home-redesign/fonts";
import { cn } from "@/components/home-redesign/lib/cn";
import { gsap, useGSAP } from "@/components/home-redesign/lib/gsap";
import { CopyCodeButton } from "@/components/home-redesign/sections/offers/CopyCodeButton";
import { resolveProductImageUrl } from "@/lib/productImageUrl";
import type { SpinOffer } from "@/lib/spinStorage";
import { Confetti } from "./Confetti";
import { OFFER_ICONS, SpinWheel, type WheelHandle } from "./SpinWheel";
import { isWinningPlay, prizeName, sliceOfOffer, textOnFill, type SpinPlayResponse } from "./wheel";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

const button =
  "group relative isolate inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-600 px-7 py-3.5 text-base font-semibold whitespace-nowrap text-snow shadow-lg shadow-brand-600/30 transition-[translate,background-color] hover:bg-brand-700 active:translate-y-0.5 low:py-3";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A four-point sparkle on a 24×24 box. */
function Sparkle({ className, ...data }: { className?: string } & Record<`data-${string}`, string>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("fill-current", className)} {...data}>
      <path d="M12 0C12.9 6.6 17.4 11.1 24 12 17.4 12.9 12.9 17.4 12 24 11.1 17.4 6.6 12.9 0 12 6.6 11.1 11.1 6.6 12 0Z" />
    </svg>
  );
}

/** A small rounded tile standing for a prize: the gift's photo, or its icon in the slice's own colour. */
function PrizeTile({ offer }: { offer: SpinOffer }) {
  const [failed, setFailed] = useState(false);
  const photo = offer.offerType === "GIFT" ? resolveProductImageUrl(offer.giftProduct?.imageUrl) : undefined;
  const Icon = OFFER_ICONS[offer.offerType];
  if (photo && !failed) {
    return (
      <span aria-hidden="true" className="size-14 shrink-0 overflow-hidden rounded-2xl bg-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.12)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" onError={() => setFailed(true)} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-14 shrink-0 place-items-center rounded-2xl shadow-[inset_0_-3px_0_rgb(0_0_0/0.12)]"
      style={{ backgroundColor: offer.color, color: textOnFill(offer.color) }}
    >
      <Icon className="size-[55%]" strokeWidth={2.4} />
    </span>
  );
}

export type SpinJourney = { progress: number; label: string };

export type SpinWinDialogProps = {
  offers: SpinOffer[];
  loading: boolean;
  spinning: boolean;
  result: SpinPlayResponse | null;
  /** Why the customer can't spin right now, or what went wrong. */
  message: string | null;
  /** Spin Now is off: on cooldown, or locked behind the loyalty journey. */
  blocked: boolean;
  /** The line under the title. */
  intro: string;
  /** Orders towards unlocking the wheel, when the loyalty journey gates it. */
  journey: SpinJourney | null;
  signedIn: boolean;
  claimLabel: string;
  /** After a loss, when the admin's allowance leaves the customer another spin. */
  canSpinAgain: boolean;
  onSpinAgain: () => void;
  onSpin: (wheel: WheelHandle | null) => void;
  onClaim: () => void;
  onBrowse: () => void;
  onClose: () => void;
};

/**
 * The Spin & Win pop-up (SpinWheelModal decides when it opens and talks to the server). A native modal <dialog>: the
 * page behind is inert, focus starts on Spin Now and stays inside, and Escape, the close button or a click outside
 * close it (not while the wheel is turning), with focus going back to where it was. If the browser forces it closed
 * mid-spin anyway (it lets a repeated Escape through), the reward was already saved when the server answered.
 *
 * A tall card on every screen, white blended with light blue: the heading and a line under it at the top, the wheel
 * (sunburst, sparkles), then the actions anchored at the bottom. The prize takes space from the wheel instead of
 * leaving an empty placeholder beforehand; the card has a fixed height capped by the viewport, and the wheel fills what
 * is left without scrolling. Short screens (`low`) tighten the spacing; phones held sideways (`short`) are too short to
 * stack, so there the wheel sits on the left and the rest on the right.
 *
 * It lives outside the home page's wrapper (it's mounted for every customer page), so it brings its own: the
 * `contents` element carries the redesign's fonts and type without adding a box.
 */
export default function SpinWinDialog({ offers, loading, spinning, result, message, blocked, intro, journey, signedIn, claimLabel, canSpinAgain, onSpinAgain, onSpin, onClaim, onBrowse, onClose }: SpinWinDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const spinButtonRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<WheelHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);

  const won = result && isWinningPlay(result) ? result : null;
  const ready = !loading && offers.length >= 2;
  const inactive = spinning || !ready || blocked;
  // The server can answer a loss with a prize slice when the wheel has no "Try again" slice: don't pick that one out.
  const landed = result && (won || result.offer.offerType === "NO_PRIZE") ? sliceOfOffer(offers, result.offer) : -1;

  // A layout effect, so it closes while still in the page: only then does the browser give focus back.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    unmounting.current = false;
    dialog.showModal();
    // Focus starts on Spin Now (showModal would put it on the close button, the first thing in it).
    spinButtonRef.current?.focus();
    return () => {
      unmounting.current = true;
      dialog.close();
    };
  }, []);

  // The stage's ambient motion: the sunburst turns, the sparkles twinkle.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(stageRef);
        gsap.to(q("[data-spin-burst]"), { rotation: 360, duration: 60, ease: "none", repeat: -1 });
        gsap.to(q("[data-spin-sparkle]"), { scale: 0.5, opacity: 0.4, duration: 1.2, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: { each: 0.3, from: "random" } });
      });
      return () => mm.revert();
    },
    { scope: stageRef },
  );

  // Spin Now is gone once the spin is done, so focus moves to the result. Focusing a button instead would show its
  // focus ring (focus moved by script), which on a phone looks like something is stuck selected.
  useEffect(() => {
    if (!result) {
      spinButtonRef.current?.focus();
      return;
    }
    resultRef.current?.focus({ preventScroll: true });
    if (!won || result.alreadyClaimed || reducedMotion()) return;
    wheelRef.current?.celebrate();
    // A happy buzz with the confetti, on phones that can (Android; iPhones have no vibration API).
    navigator.vibrate?.([40, 60, 90]);
  }, [result, won]);

  const close = () => {
    if (!spinning) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-intro`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      // A close the browser forces (e.g. repeated Escape) still leaves the pop-up; skip the one from unmounting.
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) close();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none items-center justify-center overflow-hidden bg-transparent p-3 backdrop:bg-brand-950/65 backdrop:backdrop-blur-[4px] open:flex sm:p-6"
    >
      <div className={`home-redesign contents ${homeFontVariables}`}>
        <div className="relative grid h-[44rem] max-h-full w-full max-w-[28rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[1.75rem] bg-linear-to-b from-brand-100 via-white to-brand-50 text-slate-900 shadow-2xl shadow-brand-950/40 transition-[opacity,scale] duration-300 ease-out starting:scale-95 starting:opacity-0 portrait:max-sm:h-[min(44rem,calc(min(28rem,100vw-1.5rem)+19rem))] sm:rounded-[2.25rem] short:h-full short:max-w-[48rem] short:grid-cols-2 short:grid-rows-[1fr_auto_auto_1fr]">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            aria-disabled={spinning}
            className={cn(
              "absolute top-3 right-3 z-30 grid size-10 cursor-pointer place-items-center rounded-full bg-white/90 text-brand-800 shadow-md transition-[background-color,opacity] hover:bg-white aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:top-4 sm:right-4",
              focusRing,
            )}
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          <header className="px-14 pt-6 text-center low:pt-5 short:col-start-2 short:row-start-2 short:pr-14 short:pl-7 short:text-left">
            <h2 id={`${id}-title`} className="font-display-condensed text-[clamp(2.5rem,7vw,3.75rem)] leading-[0.9] text-brand-950 uppercase low:text-[2.25rem]">
              Spin &amp;{" "}
              <span className="relative isolate inline-block px-[0.08em] text-brand-700">
                Win
                <span aria-hidden="true" className="absolute inset-x-0 bottom-[0.08em] -z-10 h-[0.42em] -rotate-2 rounded-full bg-sun-300" />
              </span>
            </h2>
            <p id={`${id}-intro`} className={cn("mt-2 text-sm text-balance text-slate-500 sm:text-base", result && "short:hidden")}>
              {intro}
            </p>
            {journey && (
              <div className="mt-2 flex items-center gap-2 text-left">
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-brand-100">
                  <span className="block h-full rounded-full bg-brand-600" style={{ width: `${journey.progress}%` }} />
                </span>
                <span className="shrink-0 text-xs font-bold text-brand-950 tabular-nums">{journey.label}</span>
              </div>
            )}
          </header>

          {/* The stage: the wheel, with a turning sunburst and sparkles (decorative). */}
          <div
            ref={stageRef}
            className="relative isolate flex min-h-0 items-center justify-center px-5 pt-3 pb-6 [container-type:size] max-sm:px-1 low:pb-4 short:col-start-1 short:row-span-4 short:row-start-1 short:py-6"
          >
            {/* Faded out before the stage's edges, so the rays melt into the card instead of stopping at a line. */}
            <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden [mask-image:radial-gradient(closest-side,#000_50%,transparent)]">
              <div className="absolute top-1/2 left-1/2 aspect-square w-[170%] -translate-1/2">
                <span
                  data-spin-burst
                  className="absolute inset-0 rounded-full bg-[repeating-conic-gradient(rgb(48_121_234/0.08)_0deg_7deg,transparent_7deg_15deg)] [mask-image:radial-gradient(closest-side,#000_20%,transparent_75%)]"
                />
              </div>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <Star data-spin-sparkle className="absolute top-[21%] left-[6%] size-6 -rotate-15 fill-white text-brand-400" strokeWidth={1.75} />
              <Sparkle data-spin-sparkle="" className="absolute top-[12%] right-[9%] size-7 rotate-12 text-brand-400" />
              <Sparkle className="absolute top-[8%] left-[22%] size-3 text-brand-300" />
              {/* The two beside the wheel's middle would sit half behind its rim on phones, where it fills the width. */}
              <Star className="absolute top-[53%] right-[4%] size-4 rotate-20 fill-brand-100 text-brand-400 max-sm:hidden" strokeWidth={1.75} />
              <Sparkle data-spin-sparkle="" className="absolute bottom-[19%] left-[7%] size-6 -rotate-12 text-brand-400" />
              <Star data-spin-sparkle className="absolute right-[15%] bottom-[8%] size-5 rotate-12 fill-white text-brand-300" strokeWidth={1.75} />
              <Sparkle className="absolute top-[49%] left-[3%] size-3 text-brand-200 max-sm:hidden" />
            </div>

            {ready ? (
              <div
                role="img"
                aria-label={`Prize wheel: ${offers.map((offer) => offer.label).join(", ")}`}
                className="w-[min(100cqw,100cqh)] shrink-0 transition-[width] duration-500 ease-out"
              >
                <SpinWheel ref={wheelRef} offers={offers} spinning={spinning} landed={landed >= 0 ? landed : null} className="w-full" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-brand-700">
                <Loader2 className="size-8 animate-spin" aria-hidden="true" />
                <p className="text-sm text-slate-500">Loading the wheel…</p>
              </div>
            )}
          </div>

          {/* The result sits above the action, keeping the button at the bottom of the card. */}
          <div className="relative flex flex-col gap-3 px-5 pb-5 low:gap-2 low:pb-4 sm:px-7 sm:pb-7 short:col-start-2 short:row-start-3 short:pt-4 short:pb-6">
            {/* Keep the live region mounted for announcements, with no empty space before a result. */}
            <div ref={resultRef} tabIndex={-1} aria-live="polite" className="outline-none empty:hidden">
              {won ? (
                <div key={won.resultId} className="flex items-center gap-3 rounded-2xl bg-[linear-gradient(120deg,var(--color-sun-300),#fff3c4)] p-3 ring-1 ring-sun-400/70 transition-[opacity,scale] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] starting:scale-75 starting:opacity-0 sm:p-3.5">
                  <PrizeTile offer={won.offer} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold tracking-[0.14em] text-brand-700 uppercase">{won.alreadyClaimed ? "Your reward is waiting" : "You won!"}</p>
                    <p className="font-display-condensed line-clamp-3 text-2xl leading-none text-brand-950 uppercase sm:text-[1.75rem] short:line-clamp-2 short:text-xl">{prizeName(won.offer)}</p>
                    {won.claimCode && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-brand-950/75">
                        Code <span className="truncate font-mono font-bold text-brand-950">{won.claimCode}</span>
                        <CopyCodeButton code={won.claimCode} className="-my-1.5 size-7 shrink-0 text-brand-700 hover:bg-white/60 focus-visible:outline-brand-700" />
                      </p>
                    )}
                    <p className="text-xs leading-snug text-pretty text-brand-950/75">
                      {won.expiresAt && `Use it by ${formatDate(won.expiresAt)}. `}
                      {won.offer.minOrderValue > 0 && `Min. order LKR ${won.offer.minOrderValue.toLocaleString()}. `}
                      {signedIn ? "Saved to your account." : "Saved on this browser."}
                    </p>
                    {won.offer.description && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-pretty text-brand-950/75">{won.offer.description}</p>}
                  </div>
                </div>
              ) : result ? (
                <div key="again" className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-100 transition-[opacity,translate] duration-300 starting:translate-y-2 starting:opacity-0 sm:p-3.5">
                  <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-900 shadow-[inset_0_-3px_0_rgb(0_0_0/0.12)]">
                    <RotateCcw className="size-[55%]" strokeWidth={2.4} />
                  </span>
                  <div>
                    <p className="font-display-condensed text-2xl leading-none text-brand-950 uppercase">So close!</p>
                    <p className="mt-1 text-sm text-pretty text-slate-600">{result.offer.description || "No prize this time. Better luck on your next spin!"}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {message && !result && !spinning && (
              <p role="alert" className="flex items-start gap-2 rounded-2xl bg-brand-50 p-3 text-sm text-brand-950 ring-1 ring-brand-100">
                <Clock className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
                {message}
              </p>
            )}

            {/* One spin: Spin Now, then what to do next in its place. */}
            {!result ? (
              <button
                ref={spinButtonRef}
                type="button"
                onClick={() => {
                  if (!inactive) onSpin(wheelRef.current);
                }}
                aria-disabled={inactive}
                className={cn(button, "aria-disabled:cursor-not-allowed aria-disabled:opacity-80 aria-disabled:active:translate-y-0", spinning && "aria-disabled:cursor-wait", focusRing)}
              >
                {/* A soft ring pulsing out from it while it waits. */}
                {!inactive && <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-full motion-safe:animate-cta-pulse" />}
                {spinning ? (
                  <>
                    <RotateCcw className="size-5 shrink-0 animate-spin [animation-direction:reverse]" aria-hidden="true" />
                    Spinning…
                  </>
                ) : !ready ? (
                  "Loading…"
                ) : (
                  <>
                    <Sparkles className="size-5 shrink-0 transition-transform group-hover:rotate-12" aria-hidden="true" />
                    Spin Now
                  </>
                )}
              </button>
            ) : won ? (
              <button type="button" onClick={onClaim} className={cn(button, focusRing)}>
                {claimLabel}
                <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            ) : canSpinAgain ? (
              <button type="button" onClick={onSpinAgain} className={cn(button, focusRing)}>
                <Sparkles className="size-5 shrink-0 transition-transform group-hover:rotate-12" aria-hidden="true" />
                Spin Again
              </button>
            ) : (
              <button type="button" onClick={onBrowse} className={cn(button, focusRing)}>
                Browse the Deals
                <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {won && !won.alreadyClaimed && <Confetti key={won.resultId} />}
      </div>
    </dialog>
  );
}
