"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { revealSpeed } from "@/components/home-redesign/config/motion";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/components/home-redesign/lib/gsap";

/** Gap between consecutive heading words as they rise. */
const WORD_STAGGER = 0.06;
/** Gap between cards that come into view together (a row of three). */
const CARD_STAGGER = 0.12;
/** How far (px) a card travels as it floats in. */
const RISE = 48;

/**
 * "down" brings things up from below (scrolling down the page); "up" (scrolling back up) drops them
 * in from above.
 */
type RevealDirection = "down" | "up";

/** One independently triggered piece of the reveal: the header, or a single card. */
type Unit = {
  el: HTMLElement;
  build: (dir: RevealDirection) => gsap.core.Timeline;
  tl?: gsap.core.Timeline;
  dir: RevealDirection;
  pending?: gsap.core.Tween;
};

/**
 * Client wrapper for the offers <section>. The header and each card reveal on their own scroll triggers,
 * so stacked cards on a phone each play as they reach the screen rather than all at once off-screen.
 * Header: the eyebrow fades in, the heading words rise out of their lines, the highlighter swipes in
 * behind "Love." and the link follows. Cards: each floats in, then its product pops into place; cards
 * entering together (a desktop row) follow one another left to right.
 * Like the sections above it replays in both scroll directions: each piece resets once fully off-screen
 * and plays again when it comes back, rising from below scrolling down and dropping from above scrolling
 * up. Skipped entirely under reduced motion. The markup stays server-rendered and arrives as children.
 *
 * Hooks: `data-offers-header` containing `data-offers-eyebrow`, `data-offers-heading`,
 * `data-offers-highlight`, `data-offers-link`; `data-offers-card` containing `data-offers-product`s.
 * The cards' and products' own CSS transitions must not cover transform or opacity, or they would lag
 * behind the tweens.
 */
export function OffersMotion({
  children,
  contentKey,
  ...props
}: ComponentPropsWithoutRef<"section"> & {
  /** Changes when the offers change (they load from the API), so each card gets its reveal. */
  contentKey?: string;
}) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const section = scope.current;
        const header = section?.querySelector<HTMLElement>("[data-offers-header]");
        const heading = header?.querySelector<HTMLElement>("[data-offers-heading]");
        if (!section || !header || !heading) return;

        const eyebrow = header.querySelector<HTMLElement>("[data-offers-eyebrow]");
        const highlight = header.querySelector<HTMLElement>("[data-offers-highlight]");
        const link = header.querySelector<HTMLElement>("[data-offers-link]");

        const headerUnit: Unit = {
          el: header,
          dir: "down",
          build: (dir) => {
            const sign = dir === "down" ? 1 : -1;
            const words = Array.from(heading.querySelectorAll<HTMLElement>(".offers-word"));
            const tl = gsap.timeline({ paused: true }).timeScale(revealSpeed());
            if (eyebrow) tl.from(eyebrow, { y: sign * 16, autoAlpha: 0, duration: 0.6, ease: "power2.out" }, 0);
            words.forEach((word, i) => {
              tl.from(word, { yPercent: sign * 110, duration: 0.7, ease: "power3.out" }, 0.1 + i * WORD_STAGGER);
            });
            const afterWords = 0.1 + words.length * WORD_STAGGER;
            if (highlight) {
              tl.from(
                highlight,
                { scaleX: 0, transformOrigin: "left center", duration: 0.6, ease: "power3.inOut" },
                afterWords + 0.15,
              );
            }
            if (link) tl.from(link, { y: sign * 12, autoAlpha: 0, duration: 0.5, ease: "power2.out" }, afterWords + 0.25);
            return tl;
          },
        };

        const cardUnits: Unit[] = Array.from(section.querySelectorAll<HTMLElement>("[data-offers-card]")).map(
          (card) => ({
            el: card,
            dir: "down",
            build: (dir) => {
              const sign = dir === "down" ? 1 : -1;
              const products = card.querySelectorAll<HTMLElement>("[data-offers-product]");
              const tl = gsap.timeline({ paused: true }).timeScale(revealSpeed());
              tl.from(card, { y: sign * RISE, autoAlpha: 0, duration: 0.8, ease: "power3.out" }, 0);
              if (products.length) {
                tl.from(
                  products,
                  {
                    scale: 0.6,
                    rotation: -12,
                    autoAlpha: 0,
                    transformOrigin: "50% 80%",
                    duration: 0.7,
                    ease: "back.out(1.8)",
                    stagger: 0.08,
                  },
                  0.3,
                );
              }
              return tl;
            },
          }),
        );

        /**
         * (Re)builds a unit's paused reveal for the given direction. The old timeline is reverted first, in
         * the same tick, so the new from-tweens record the settled layout as their end state.
         */
        const rebuild = (unit: Unit, dir: RevealDirection) => {
          unit.tl?.revert();
          unit.dir = dir;
          unit.tl = unit.build(dir);
        };

        const reset = (unit: Unit) => {
          unit.pending?.kill();
          unit.pending = undefined;
          unit.tl?.pause(0);
        };

        // Cards entering in the same tick (a desktop row) are queued, then played left to right.
        let queue: Unit[] = [];
        const flush = () => {
          const batch = queue.sort((a, b) => a.el.getBoundingClientRect().left - b.el.getBoundingClientRect().left);
          queue = [];
          batch.forEach((unit, i) => {
            unit.pending = gsap.delayedCall((i * CARD_STAGGER) / revealSpeed(), () => {
              unit.pending = undefined;
              unit.tl?.play();
            });
          });
        };

        /** Plays a unit from its reset state only, so small scrolls back and forth never restart a visible reveal. */
        const reveal = (unit: Unit, dir: RevealDirection, staggered: boolean) => {
          if (unit.tl?.progress() !== 0 || unit.pending) return;
          if (dir !== unit.dir) rebuild(unit, dir);
          if (!staggered) return void unit.tl?.play();
          if (queue.length === 0) requestAnimationFrame(flush);
          queue.push(unit);
        };

        const watch = (unit: Unit, staggered: boolean) => {
          // Play when it comes into view, scrolling down (top passes 88%) or up (bottom passes 12%).
          ScrollTrigger.create({
            trigger: unit.el,
            start: "top 88%",
            end: "bottom 12%",
            onEnter: () => reveal(unit, "down", staggered),
            onEnterBack: () => reveal(unit, "up", staggered),
          });
          // Rewind to the hidden start state only once it is completely off-screen.
          ScrollTrigger.create({
            trigger: unit.el,
            start: "top bottom",
            end: "bottom top",
            onLeave: () => reset(unit),
            onLeaveBack: () => reset(unit),
          });
        };

        cardUnits.forEach((unit) => {
          rebuild(unit, "down");
          watch(unit, true);
        });

        const split = SplitText.create(heading, {
          type: "words",
          wordsClass: "offers-word",
          // Each word slides out from behind its own clip, so it appears to rise out of the line.
          mask: "words",
          // Re-split when fonts load or the width changes, so wrapping always matches the real layout.
          autoSplit: true,
          onSplit: () => {
            // Carry the header reveal across a re-split: same direction, same progress, still playing if it was.
            const progress = headerUnit.tl?.progress() ?? 0;
            rebuild(headerUnit, headerUnit.dir);
            headerUnit.tl?.progress(progress);
            if (progress > 0 && progress < 1) headerUnit.tl?.play();
          },
        });
        watch(headerUnit, false);

        // Timelines rebuilt on scroll or re-split are created outside this context, so revert explicitly.
        return () => {
          [headerUnit, ...cardUnits].forEach((unit) => {
            unit.pending?.kill();
            unit.tl?.revert();
          });
          split.revert();
        };
      });
    },
    { scope, dependencies: [contentKey], revertOnUpdate: true },
  );

  return (
    <section ref={scope} {...props}>
      {children}
    </section>
  );
}
