"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { revealSpeed } from "@/components/home-redesign/config/motion";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/components/home-redesign/lib/gsap";

/** Gap between consecutive words (and treats) as the statement reveals. */
const WORD_STAGGER = 0.045;

/** "down" reveals the top line first; "up" (scrolling back up the page) reveals the bottom line first. */
type RevealDirection = "down" | "up";

/**
 * Groups words and treats (given in reading order) into the visual lines they wrapped onto.
 * Compares vertical centres, which a treat's tilt or a pop-in scale (both about the centre) don't move.
 */
function groupIntoLines(items: HTMLElement[], lineHeight: number) {
  const lines: HTMLElement[][] = [];
  let lineCentre = -Infinity;
  for (const item of items) {
    const { top, height } = item.getBoundingClientRect();
    const centre = top + height / 2;
    if (centre - lineCentre > lineHeight / 2) {
      lines.push([]);
      lineCentre = centre;
    }
    lines[lines.length - 1].push(item);
  }
  return lines;
}

/**
 * Client wrapper for the statement <section>. When the statement scrolls into view, its words
 * rise into place one by one and each ice cream pops in as the sentence reaches it. Replays in both
 * scroll directions: it resets once the statement is fully off-screen, then plays again when it comes
 * back into view. Scrolling down it reveals from the first line; scrolling up, from the last line
 * upwards (words within a line always run left to right). Skipped entirely under reduced motion.
 * The markup stays server-rendered and arrives as children.
 */
export function BrandStatementMotion({ children, ...props }: ComponentPropsWithoutRef<"section">) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const heading = scope.current?.querySelector<HTMLElement>("[data-statement]");
        if (!heading) return;

        let lines: HTMLElement[][] = [];
        let direction: RevealDirection = "down";
        let tl: gsap.core.Timeline | undefined;

        /**
         * Rebuilds the (paused) reveal in the given line order. The old timeline is reverted first, in the
         * same tick, so the new from-tweens record the real settled layout as their end state, not the
         * hidden one, and nothing flashes in between.
         */
        const build = (dir: RevealDirection) => {
          tl?.revert();
          direction = dir;
          const order = dir === "down" ? lines : [...lines].reverse();
          const timeline = gsap.timeline({ paused: true }).timeScale(revealSpeed());

          order.flat().forEach((item, i) => {
            const at = i * WORD_STAGGER;
            if (item.hasAttribute("data-treat")) {
              timeline.from(
                item,
                {
                  scale: 0,
                  rotation: -35,
                  autoAlpha: 0,
                  duration: 0.7,
                  ease: "back.out(2.2)",
                },
                at,
              );
            } else {
              timeline.from(item, { yPercent: 110, duration: 0.7, ease: "power3.out" }, at);
            }
          });

          tl = timeline;
          return timeline;
        };

        const split = SplitText.create(heading, {
          type: "words",
          wordsClass: "statement-word",
          // Each word slides up from behind its own clip, so it appears to rise out of the line.
          mask: "words",
          // Re-split when fonts load or the width changes, so wrapping always matches the real layout.
          autoSplit: true,
          onSplit: () => {
            // Carry the reveal across a re-split: same direction, same progress, still playing if it was.
            const progress = tl?.progress() ?? 0;
            tl?.revert();
            tl = undefined;

            // Words and treats in reading order, so each treat appears right after its word.
            const items = Array.from(heading.querySelectorAll<HTMLElement>(".statement-word, [data-treat]"));
            lines = groupIntoLines(items, parseFloat(getComputedStyle(heading).lineHeight));

            const timeline = build(direction).progress(progress);
            if (progress > 0) timeline.play();
          },
        });

        // Play when the statement comes into view, scrolling down (top passes 85%) or up (bottom passes 15%).
        // Only from a reset state, so small scrolls back and forth never restart a visible reveal; that is
        // also the only time the line order is switched, since every item is hidden then.
        const reveal = (dir: RevealDirection) => {
          if (tl?.progress() !== 0) return;
          (dir === direction ? tl : build(dir)).play();
        };
        ScrollTrigger.create({
          trigger: heading,
          start: "top 85%",
          end: "bottom 15%",
          onEnter: () => reveal("down"),
          onEnterBack: () => reveal("up"),
        });
        // Rewind to the hidden start state only once the statement is completely off-screen.
        const reset = () => void tl?.pause(0);
        ScrollTrigger.create({
          trigger: heading,
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
    { scope },
  );

  return (
    <section ref={scope} {...props}>
      {children}
    </section>
  );
}
