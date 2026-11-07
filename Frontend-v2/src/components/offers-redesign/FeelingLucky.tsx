"use client";

import { Clock, LogIn, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { Button } from "@/components/home-redesign/ui/Button";
import { Container } from "@/components/home-redesign/ui/Container";
import { MiniWheel } from "@/components/spin-redesign/MiniWheel";
import { spinAllowanceText } from "@/components/spin-redesign/wheel";
import { useSpinEligibility } from "@/hooks/useSpinEligibility";
import { formatSpinCooldownMessage, shouldShowSpinEntryPoints } from "@/lib/spinEligibility";
import { useSpinStore } from "@/store/spinStore";
import { gsap, useGSAP } from "./gsap";
import { OffersReveal } from "./OffersReveal";
import { PROMOTION_MASCOTS } from "./promotion";

/**
 * Feeling Lucky?: a compact sunny banner on the Offers page inviting customers to Spin & Win: a little wheel with the
 * cool mascot peeking round it, the heading, the admin's allowance ("One lucky spin every hour") and a line inviting
 * a spin. No prizes are listed.
 *
 * It follows the server's answer for this visitor (shared with the pop-up, so it changes the moment a spin is used):
 * - wheel off, fewer than two prizes, or still asking: no banner;
 * - may spin: Spin & Win, which opens the pop-up;
 * - needs to sign in first (the admin's criteria): Sign in to spin;
 * - anything else (cooldown, outside the schedule, the loyalty journey still locked): why, in place of the button.
 *
 * It only appears once that answer is in, after the rest of the page has set up its scroll motion, so it brings its
 * own (OffersReveal). The page re-measures its scroll triggers when it grows (useRemeasureOnResize).
 */
export function FeelingLucky() {
  const { eligibility, isAuthenticated } = useSpinEligibility();
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);
  const rootRef = useRef<HTMLDivElement>(null);
  const shown = Boolean(eligibility?.enabled);

  useGSAP(
    () => {
      if (!shown) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo("[data-mini-wheel-face]", { rotation: -9 }, { rotation: 9, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
      });
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [shown] },
  );

  if (!eligibility || !shown) return null;

  const canSpin = shouldShowSpinEntryPoints(eligibility);
  const reason = formatSpinCooldownMessage(eligibility.nextSpinAt, eligibility.reason ?? undefined);
  // The server's sign-in refusals all start "Sign in…" (spinEligibilityRules).
  const needsSignIn = !canSpin && !isAuthenticated && /^sign in/i.test(eligibility.reason ?? "");
  const allowance = spinAllowanceText(eligibility.spinsAllowed, eligibility.spinWindowHours).replace(/\.$/, "");
  const mascot = PROMOTION_MASCOTS.cool;

  return (
    <div ref={rootRef}>
      <OffersReveal>
        <section aria-labelledby="lucky-heading" className="bg-white pb-20 sm:pb-24 lg:pb-28">
          <Container>
            <div
              data-reveal
              className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(115deg,var(--color-sun-300),var(--color-sun-400)_50%,#ffb86b)] px-6 py-9 sm:rounded-[2.5rem] sm:px-10 md:py-8"
            >
              {/* Confetti dots and soft circles. */}
              <div aria-hidden="true" className="absolute inset-0 -z-10">
                <span className="absolute -top-16 -right-10 size-56 rounded-full bg-white/25" />
                <span className="absolute -bottom-24 left-1/3 size-64 rounded-full bg-white/20" />
                <span className="absolute inset-0 bg-[radial-gradient(rgb(26_79_178/0.12)_1.5px,transparent_1.5px)] bg-size-[20px_20px]" />
              </div>

              <div className="flex flex-col items-center gap-7 text-center md:flex-row md:gap-10 md:text-left">
                <div className="relative mr-6 sm:mr-8" data-reveal-pop>
                  <MiniWheel className="size-36 sm:size-44" />
                  <Image
                    src={mascot.src}
                    alt=""
                    width={mascot.width}
                    height={mascot.height}
                    sizes="96px"
                    className="sticker absolute -right-8 -bottom-4 size-20 rotate-6 sm:-right-10 sm:size-24"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="inline-block rounded-full bg-brand-900/10 px-3 py-1 text-xs font-bold tracking-[0.18em] text-brand-900 uppercase">
                    {allowance}
                  </p>
                  <h2 id="lucky-heading" className="font-display-condensed mt-3 text-[clamp(2.75rem,6vw,4.25rem)] leading-[0.9] text-brand-950 uppercase">
                    Feeling{" "}
                    <span className="relative isolate inline-block px-[0.1em] text-brand-700">
                      Lucky?
                      <span aria-hidden="true" data-reveal-highlight className="absolute inset-x-0 bottom-[0.08em] -z-10 h-[0.42em] -rotate-2 rounded-full bg-white" />
                    </span>
                  </h2>
                  <p className="mt-2 max-w-xl text-base text-brand-950/80 sm:text-lg">
                    Spin the Bing Chun wheel for a sweet surprise on your next order.
                  </p>
                </div>

                {canSpin ? (
                  <Button onClick={() => requestOpenSpin()} aria-haspopup="dialog" className="group shrink-0 px-7 py-3.5 text-base shadow-lg shadow-brand-900/20">
                    <Sparkles className="size-4 transition-transform duration-300 group-hover:rotate-12" aria-hidden="true" />
                    Spin &amp; Win
                  </Button>
                ) : needsSignIn ? (
                  <Button href="/account/login" className="shrink-0 px-7 py-3.5 text-base shadow-lg shadow-brand-900/20">
                    <LogIn className="size-4" aria-hidden="true" />
                    Sign in to spin
                  </Button>
                ) : (
                  <p className="inline-flex max-w-xs shrink-0 items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-left text-sm font-semibold text-brand-950">
                    <Clock className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
                    {reason}
                  </p>
                )}
              </div>
            </div>
          </Container>
        </section>
      </OffersReveal>
    </div>
  );
}
