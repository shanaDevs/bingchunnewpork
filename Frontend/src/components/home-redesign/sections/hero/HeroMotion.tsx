"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { breakpoints, COMPACT_REVEAL_SPEED, stageWideQueries } from "@/components/home-redesign/config/motion";
import { gsap, ScrollTrigger, useGSAP } from "@/components/home-redesign/lib/gsap";
import "./hero-intro.css";
import { buildHeaderIntro, buildStageAmbient, buildStageIntro, heroAssetsReady } from "./heroIntro";
import { HERO_INTRO_PENDING_CLASS } from "./heroIntroBoot";

/** Longest we hold the entrance waiting for product images / fonts before playing anyway. */
const ASSET_WAIT_MS = 900;

/**
 * Client wrapper for the hero <section>. Owns the GSAP entrance + ambient loops; all hero
 * markup stays server-rendered and is passed through as children.
 * The hero part of the entrance (not the header) replays whenever the hero is scrolled back into
 * view from below: it resets to its starting state once fully off-screen, then plays on return.
 */
export function HeroMotion({ children, ...props }: ComponentPropsWithoutRef<"section">) {
  const scope = useRef<HTMLElement>(null);
  // Refs survive React Strict Mode's mount → unmount → mount, so these reflect the real page load.
  const introAllowed = useRef<boolean | null>(null);
  const introDone = useRef(false);

  useGSAP(
    () => {
      const root = document.documentElement;
      introAllowed.current ??=
        root.classList.contains(HERO_INTRO_PENDING_CLASS) && !window.__bcHeroIntroTimedOut;
      window.__bcHeroIntroStarted = true;

      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          // The landscape desktop composition (desktop, and landscape screens from 1024px).
          wide: stageWideQueries.join(", "),
          reduce: breakpoints.reducedMotion,
        },
        (context) => {
          const { wide, reduce } = context.conditions as Record<string, boolean>;
          // Initial states below are applied synchronously, in the same frame the CSS hide is lifted.
          root.classList.remove(HERO_INTRO_PENDING_CLASS);
          if (reduce || !scope.current) return;

          const q = gsap.utils.selector(scope.current);
          // The header lives outside the hero scope, so query the document directly.
          const headerItems = Array.from(document.querySelectorAll("[data-header-row] > *"));
          // Every layout shows the full composition, so they share its choreography; the portrait ones
          // (`compact`) start the drinks further down, as they fill more of the hero there.
          const compact = !wide;
          const ambient = buildStageAmbient(q, compact);
          const intro = buildStageIntro(q, ambient, compact);

          ScrollTrigger.create({
            trigger: scope.current,
            start: "top bottom",
            end: "bottom top",
            onLeave: () => {
              ambient.pause(0);
              intro.pause(0);
            },
            // Scrolling back up to the hero replays its entrance; phones and tablets replay it faster.
            onEnterBack: () => void intro.timeScale(wide ? 1 : COMPACT_REVEAL_SPEED).restart(),
          });

          if (!introAllowed.current || introDone.current) {
            intro.progress(1);
            ambient.play();
            return;
          }

          const header = buildHeaderIntro(headerItems, Boolean(wide));
          intro.eventCallback("onComplete", () => {
            introDone.current = true;
          });

          let cancelled = false;
          heroAssetsReady(scope.current, ASSET_WAIT_MS).then(() => {
            if (cancelled) return;
            header.play();
            intro.play();
          });
          return () => {
            cancelled = true;
          };
        },
        scope.current ?? undefined,
      );
    },
    { scope },
  );

  return (
    <section ref={scope} {...props}>
      {children}
    </section>
  );
}
