"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { revealSpeed } from "@/components/home-redesign/config/motion";
import { gsap, ScrollTrigger, useGSAP } from "./gsap";

/** How far (px) a block floats up as it comes in. */
const RISE = 48;

/**
 * Scroll motion for the Offers page below the hero, played once per piece as it comes into view (at the phones'
 * quicker reveal speed below laptop): `data-reveal` blocks float up and fade in. Inside one,
 * `data-reveal-highlight` (a heading's marker swipe) sweeps in, `data-reveal-pop` pieces pop into place one after
 * another and `data-reveal-wipe` wipes in from the left. The deal cards arrive with the live data, so
 * DealsExplorer floats those in itself. None of it runs under reduced motion. Elements animated here mustn't have
 * CSS transitions on transform or opacity.
 */
export function OffersReveal({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(scope);
        const speed = revealSpeed();

        q<HTMLElement>("[data-reveal]").forEach((block) => {
          const tl = gsap.timeline({ scrollTrigger: { trigger: block, start: "top 88%", once: true } }).timeScale(speed);
          tl.from(block, { y: RISE, autoAlpha: 0, duration: 0.8, ease: "power3.out" });
          const highlights = block.querySelectorAll("[data-reveal-highlight]");
          if (highlights.length) tl.from(highlights, { scaleX: 0, transformOrigin: "left center", duration: 0.6, ease: "power3.inOut" }, 0.4);
          const pops = block.querySelectorAll("[data-reveal-pop]");
          if (pops.length) {
            tl.from(pops, { scale: 0.5, autoAlpha: 0, rotation: -10, transformOrigin: "50% 80%", duration: 0.6, ease: "back.out(2)", stagger: 0.07 }, 0.25);
          }
          const wipes = block.querySelectorAll("[data-reveal-wipe]");
          if (wipes.length) tl.fromTo(wipes, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.1, ease: "power2.inOut" }, 0.35);
        });
      });
      return () => mm.revert();
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}

/**
 * Re-measures every scroll trigger on the page whenever its height changes. Things arrive after the triggers below
 * them were placed (the deals swap their loading state for the cards or an empty message, the Feeling Lucky banner
 * appears with the wheel's settings), and a stale trigger fires far too late: the block stays invisible while it's
 * already on screen.
 */
export function useRemeasureOnResize() {
  useEffect(() => {
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ScrollTrigger.refresh(), 100);
    });
    observer.observe(document.body);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
}
