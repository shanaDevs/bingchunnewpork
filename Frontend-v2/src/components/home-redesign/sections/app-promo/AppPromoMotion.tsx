"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { revealSpeed } from "@/components/home-redesign/config/motion";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/components/home-redesign/lib/gsap";

/** Gap between consecutive heading words as they rise. */
const WORD_STAGGER = 0.06;

/** "down" brings things up from below (scrolling down the page); "up" drops them in from above. */
type RevealDirection = "down" | "up";

/**
 * Client wrapper for the app promo <section>. The banner floats in, the heading words rise out of their
 * lines and the copy follows; meanwhile the phone slides up, the mango cup pops in with its splash, the
 * mascot swoops in from the top right and the ingredients burst out around them.
 * Like the offers above it, it replays in both scroll directions: it resets once the banner is fully
 * off-screen and plays again when it returns. Skipped entirely under reduced motion.
 *
 * Hooks: `data-app-banner` containing `data-app-heading`, `data-app-copy` (several),
 * `data-app-phone`, `data-app-cup`, `data-app-mascot` and `data-app-garnish` (several). None of these may
 * carry a CSS transition on transform, translate, rotate or scale, or it would lag behind the tweens.
 */
export function AppPromoMotion({ children, ...props }: ComponentPropsWithoutRef<"section">) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const banner = scope.current?.querySelector<HTMLElement>("[data-app-banner]");
        const heading = banner?.querySelector<HTMLElement>("[data-app-heading]");
        if (!banner || !heading) return;

        const q = (selector: string) => Array.from(banner.querySelectorAll<HTMLElement>(selector));
        const copy = q("[data-app-copy]");
        const phone = q("[data-app-phone]");
        const cup = q("[data-app-cup]");
        const mascot = q("[data-app-mascot]");
        const garnishes = q("[data-app-garnish]");

        let tl: gsap.core.Timeline | undefined;
        let dir: RevealDirection = "down";

        const build = () => {
          const sign = dir === "down" ? 1 : -1;
          const words = Array.from(heading.querySelectorAll<HTMLElement>(".app-word"));
          const t = gsap.timeline({ paused: true }).timeScale(revealSpeed());
          t.from(banner, { y: sign * 48, autoAlpha: 0, duration: 0.8, ease: "power3.out" }, 0);
          words.forEach((word, i) => {
            t.from(word, { yPercent: sign * 110, duration: 0.7, ease: "power3.out" }, 0.2 + i * WORD_STAGGER);
          });
          const afterWords = 0.2 + words.length * WORD_STAGGER;
          t.from(copy, { y: sign * 14, autoAlpha: 0, duration: 0.6, ease: "power2.out", stagger: 0.1 }, afterWords);
          t.from(phone, { y: sign * 90, rotation: -6, autoAlpha: 0, duration: 0.9, ease: "power3.out" }, 0.3);
          t.from(
            cup,
            { scale: 0.5, rotation: -18, autoAlpha: 0, transformOrigin: "50% 100%", duration: 0.8, ease: "back.out(1.7)" },
            0.55,
          );
          t.from(mascot, { x: 140, y: -90, rotation: 18, autoAlpha: 0, duration: 1, ease: "power3.out" }, 0.65);
          t.from(
            garnishes,
            { scale: 0, autoAlpha: 0, duration: 0.55, ease: "back.out(2.2)", stagger: { each: 0.04, from: "random" } },
            0.75,
          );
          return t;
        };

        /** The old timeline is reverted first, in the same tick, so the new from-tweens record the settled layout. */
        const rebuild = (next: RevealDirection) => {
          tl?.revert();
          dir = next;
          tl = build();
        };

        /** Plays from the reset state only, so small scrolls back and forth never restart a visible reveal. */
        const reveal = (next: RevealDirection) => {
          if (tl?.progress() !== 0) return;
          if (next !== dir) rebuild(next);
          tl?.play();
        };

        ScrollTrigger.create({
          trigger: banner,
          start: "top 85%",
          end: "bottom 15%",
          onEnter: () => reveal("down"),
          onEnterBack: () => reveal("up"),
        });
        // Rewind to the hidden start state only once the banner is completely off-screen.
        ScrollTrigger.create({
          trigger: banner,
          start: "top bottom",
          end: "bottom top",
          onLeave: () => tl?.pause(0),
          onLeaveBack: () => tl?.pause(0),
        });

        const split = SplitText.create(heading, {
          type: "words",
          wordsClass: "app-word",
          // Each word slides out from behind its own clip, so it appears to rise out of the line.
          mask: "words",
          // Re-split when fonts load or the width changes, so wrapping always matches the real layout.
          autoSplit: true,
          onSplit: () => {
            // Carry the reveal across a re-split: same direction, same progress, still playing if it was.
            const progress = tl?.progress() ?? 0;
            rebuild(dir);
            tl?.progress(progress);
            if (progress > 0 && progress < 1) tl?.play();
          },
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
