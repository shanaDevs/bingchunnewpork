"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { revealSpeed } from "@/components/home-redesign/config/motion";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/components/home-redesign/lib/gsap";

/** Gap between consecutive heading words as they rise. */
const WORD_STAGGER = 0.06;
/** Gap between consecutive cards as they float in. */
const CARD_STAGGER = 0.08;
/** How far (px) the eyebrow and cards travel. Kept under the marquee's py-8 so they aren't cut by its edge mask. */
const RISE = 40;

/** When the CTA starts rising after the cards (scrolling down), so it lands as the last cards settle. */
const CTA_DELAY = 0.3;

/**
 * "down" plays header first, then cards, then the CTA, each coming up from below; "up" (scrolling back up
 * the page) plays the CTA and cards first, then the header, each dropping in from above.
 */
type RevealDirection = "down" | "up";

/**
 * Client wrapper for the favourites <section>. When it scrolls into view the eyebrow fades in, the heading
 * words rise out of their lines, the highlighter swipes in behind "Favourite", the cards currently on
 * screen float in one after another, left to right, and the "Explore Menu" button follows. Like the brand statement above, it replays in both
 * scroll directions: it resets once the section is fully off-screen, then plays again when it comes back.
 * Skipped entirely under reduced motion. The markup stays server-rendered and arrives as children.
 *
 * Hooks: `data-favourites-eyebrow`, `data-favourites-heading`, `data-favourites-highlight`, `data-favourites-card`
 * (a wrapper around each card, since the cards' own hover transitions would fight the tweens), `data-favourites-cta`.
 */
export function SignatureDrinksMotion({
  children,
  contentKey,
  ...props
}: ComponentPropsWithoutRef<"section"> & {
  /** Changes when the cards change (e.g. products arrive from the API), so the reveal is rebuilt for them. */
  contentKey?: string;
}) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const section = scope.current;
        const heading = section?.querySelector<HTMLElement>("[data-favourites-heading]");
        if (!section || !heading) return;

        const eyebrow = section.querySelector<HTMLElement>("[data-favourites-eyebrow]");
        const highlight = section.querySelector<HTMLElement>("[data-favourites-highlight]");
        const cta = section.querySelector<HTMLElement>("[data-favourites-cta]");

        let direction: RevealDirection = "down";
        let tl: gsap.core.Timeline | undefined;

        /** Cards (from both marquee copies) that are on screen right now, left to right. Off-screen ones aren't hidden. */
        const visibleCards = () =>
          Array.from(section.querySelectorAll<HTMLElement>("[data-favourites-card]"))
            .map((card) => ({ card, rect: card.getBoundingClientRect() }))
            .filter(({ rect }) => rect.right > 0 && rect.left < window.innerWidth)
            .sort((a, b) => a.rect.left - b.rect.left)
            .map(({ card }) => card);

        /**
         * Rebuilds the (paused) reveal for the given direction. The old timeline is reverted first, in the
         * same tick, so the new from-tweens record the settled layout as their end state and nothing flashes.
         * The marquee keeps drifting, so the set of on-screen cards is re-measured on every build.
         */
        const build = (dir: RevealDirection) => {
          tl?.revert();
          direction = dir;
          const sign = dir === "down" ? 1 : -1;
          const words = Array.from(heading.querySelectorAll<HTMLElement>(".favourites-word"));
          const cards = visibleCards();
          const timeline = gsap.timeline({ paused: true }).timeScale(revealSpeed());

          const header = gsap.timeline();
          if (eyebrow) header.from(eyebrow, { y: sign * 16, autoAlpha: 0, duration: 0.6, ease: "power2.out" }, 0);
          words.forEach((word, i) => {
            header.from(word, { yPercent: sign * 110, duration: 0.7, ease: "power3.out" }, 0.1 + i * WORD_STAGGER);
          });
          if (highlight) {
            header.from(
              highlight,
              { scaleX: 0, transformOrigin: "left center", duration: 0.6, ease: "power3.inOut" },
              0.1 + words.length * WORD_STAGGER + 0.15,
            );
          }

          const deck = gsap.timeline();
          cards.forEach((card, i) => {
            deck.from(card, { y: sign * RISE, autoAlpha: 0, duration: 0.8, ease: "power3.out" }, i * CARD_STAGGER);
          });

          const button = cta
            ? gsap.from(cta, { y: sign * 16, autoAlpha: 0, duration: 0.6, ease: "power2.out" })
            : undefined;

          // The half nearest the incoming edge of the screen leads; the other overlaps it so it never feels slow.
          if (dir === "down") {
            timeline.add(header, 0).add(deck, 0.35);
            if (button) timeline.add(button, 0.35 + CTA_DELAY);
          } else {
            timeline.add(deck, 0).add(header, 0.25);
            if (button) timeline.add(button, 0);
          }

          tl = timeline;
          return timeline;
        };

        const split = SplitText.create(heading, {
          type: "words",
          wordsClass: "favourites-word",
          // Each word slides out from behind its own clip, so it appears to rise out of the line.
          mask: "words",
          // Re-split when fonts load or the width changes, so wrapping always matches the real layout.
          autoSplit: true,
          onSplit: () => {
            // Carry the reveal across a re-split: same direction, same progress, still playing if it was.
            const progress = tl?.progress() ?? 0;
            tl?.revert();
            tl = undefined;
            const timeline = build(direction).progress(progress);
            if (progress > 0) timeline.play();
          },
        });

        // Play when the section comes into view, scrolling down (top passes 85%) or up (bottom passes 15%).
        // Only from a reset state, so small scrolls back and forth never restart a visible reveal.
        const reveal = (dir: RevealDirection) => {
          if (tl?.progress() !== 0) return;
          build(dir).play();
        };
        ScrollTrigger.create({
          trigger: section,
          start: "top 85%",
          end: "bottom 15%",
          onEnter: () => reveal("down"),
          onEnterBack: () => reveal("up"),
        });
        // Rewind to the hidden start state only once the section is completely off-screen.
        const reset = () => void tl?.pause(0);
        ScrollTrigger.create({
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          onLeave: reset,
          onLeaveBack: reset,
        });

        // Timelines rebuilt on scroll or re-split are created outside this context, so revert explicitly.
        return () => {
          tl?.revert();
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
