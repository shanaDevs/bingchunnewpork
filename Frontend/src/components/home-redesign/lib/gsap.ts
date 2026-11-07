"use client";

/**
 * Single entry point for GSAP in this project.
 * Import `gsap` and `useGSAP` from here (not directly from the packages) so plugins
 * are registered exactly once. Register additional plugins (e.g. ScrollTrigger) below.
 * Only import this module from Client Components.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/** How long the page height must stay still before scroll triggers are re-measured. */
const REFRESH_DEBOUNCE_MS = 200;

// ScrollTrigger measures trigger positions when each trigger is created and re-measures only on window
// resize and page load, not when content above it changes height. The redesigned pages load data after
// they mount (popular products, home offers), which pushes later sections down by a screen or more; their
// reveals would then fire at the old positions, e.g. hiding the app banner while it is on screen.
// Watching the page's height and refreshing once it settles keeps every trigger in step.
if (typeof window !== "undefined" && typeof ResizeObserver !== "undefined") {
  let timer: number | undefined;
  let lastHeight = 0;
  new ResizeObserver(() => {
    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) return;
    lastHeight = height;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ScrollTrigger.refresh(), REFRESH_DEBOUNCE_MS);
  }).observe(document.body);
}

export { gsap, ScrollTrigger, SplitText, useGSAP };
