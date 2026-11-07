"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { revealSpeed } from "@/components/home-redesign/config/motion";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/components/home-redesign/lib/gsap";

/** Gap between one column starting and the next. */
const COLUMN_STAGGER = 0.1;
/** Gap between consecutive items (heading, links) inside a column. */
const ITEM_STAGGER = 0.045;
/** Gap between watermark letters rising. */
const LETTER_STAGGER = 0.05;

/**
 * Client wrapper for the site <footer>. When it scrolls into view going down the page, the content
 * builds up in order: the columns rise in left to right (each one's heading and links cascading), the
 * divider draws across, the "BING CHUN" watermark letters rise out of the line, then the mascot pops up
 * from behind it. It only plays scrolling down: it resets once the footer is fully below the screen
 * again, ready for the next pass. Skipped entirely under reduced motion. The markup stays
 * server-rendered and arrives as children.
 *
 * Hooks: `data-footer-col` (a column) containing `data-footer-item`s, `data-footer-line`,
 * `data-footer-watermark`, `data-footer-copyright`, `data-footer-mascot`.
 */
export function FooterMotion({ children, ...props }: ComponentPropsWithoutRef<"footer">) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const footer = scope.current;
        if (!footer) return;

        const columns = Array.from(footer.querySelectorAll<HTMLElement>("[data-footer-col]"));
        const line = footer.querySelector<HTMLElement>("[data-footer-line]");
        const watermark = footer.querySelector<HTMLElement>("[data-footer-watermark]");
        const copyright = footer.querySelector<HTMLElement>("[data-footer-copyright]");
        const mascot = footer.querySelector<HTMLElement>("[data-footer-mascot]");

        let tl: gsap.core.Timeline | undefined;

        /**
         * Rebuilds the (paused) reveal. The old timeline is reverted first, in the same tick, so the new
         * from-tweens record the settled layout as their end state and nothing flashes.
         */
        const build = () => {
          tl?.revert();
          const timeline = gsap.timeline({ paused: true }).timeScale(revealSpeed());

          columns.forEach((col, c) => {
            const items = col.querySelectorAll<HTMLElement>("[data-footer-item]");
            timeline.from(
              items,
              { y: 24, autoAlpha: 0, duration: 0.7, ease: "power3.out", stagger: ITEM_STAGGER },
              c * COLUMN_STAGGER,
            );
          });

          if (line) {
            timeline.from(line, { scaleX: 0, transformOrigin: "left center", duration: 1.1, ease: "power2.inOut" }, 0.3);
          }
          const letters = watermark?.querySelectorAll<HTMLElement>(".footer-letter");
          if (letters?.length) {
            // Each letter rises from behind its own clip, whose bottom sits on the divider.
            timeline.from(letters, { yPercent: 100, duration: 0.9, ease: "power4.out", stagger: LETTER_STAGGER }, 0.55);
          }
          if (copyright) timeline.from(copyright, { autoAlpha: 0, duration: 0.6, ease: "power2.out" }, 0.9);
          if (mascot) {
            // Starts ducked behind the line (its window clips it), then pops up with an overshoot. Its CSS
            // peekaboo loop restarts at that moment, so the first ~4s are rest and it never ducks mid-pop.
            timeline.from(
              mascot,
              {
                yPercent: 60,
                duration: 0.7,
                ease: "back.out(2)",
                onStart: () => mascot.getAnimations().forEach((a) => (a.currentTime = 0)),
              },
              1.2,
            );
          }

          tl = timeline;
          return timeline;
        };

        // The watermark splits into letters; re-split when fonts load or the width changes, keeping progress.
        const split = watermark
          ? SplitText.create(watermark, {
              type: "chars",
              charsClass: "footer-letter",
              mask: "chars",
              autoSplit: true,
              onSplit: () => {
                const progress = tl?.progress() ?? 0;
                tl?.revert();
                tl = undefined;
                const timeline = build().progress(progress);
                if (progress > 0 && progress < 1) timeline.play();
              },
            })
          : undefined;
        if (!split) build();

        ScrollTrigger.create({
          trigger: footer,
          // The footer ends the page, so its top never climbs far; 90% fires as soon as a little shows.
          start: "top 90%",
          onEnter: () => {
            if (tl?.progress() === 0) tl.play();
          },
        });
        // Back to the hidden start only once the footer is completely below the screen again.
        ScrollTrigger.create({
          trigger: footer,
          start: "top bottom",
          onLeaveBack: () => void tl?.pause(0),
        });

        // Timelines rebuilt on re-split are created outside this context, so revert explicitly.
        return () => {
          tl?.revert();
          split?.revert();
        };
      });
    },
    { scope },
  );

  return (
    <footer ref={scope} {...props}>
      {children}
    </footer>
  );
}
