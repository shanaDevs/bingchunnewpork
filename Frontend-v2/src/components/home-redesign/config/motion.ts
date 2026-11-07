/**
 * Shared motion settings for future GSAP work.
 * Centralising these keeps timing consistent across sections and easy to tune.
 */

// Use with gsap.matchMedia() so animations only run where intended.
export const breakpoints = {
  desktop: "(min-width: 1280px)",
  belowLaptop: "(max-width: 1023px)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const;

/**
 * Where the hero shows its landscape desktop composition (the `wide:` variant in globals.css): desktop,
 * plus landscape screens from 1024px. Each entry is one media query, so it can be combined with "and".
 */
export const stageWideQueries = ["(min-width: 1280px)", "(min-width: 1024px) and (orientation: landscape)"] as const;

/**
 * Scroll-triggered reveals (the ones that replay as you scroll down or back up) play this much faster on
 * phones and tablets, below laptop, so they keep up with quick thumb scrolling. Desktop plays at 1.
 */
export const COMPACT_REVEAL_SPEED = 1.35;

/** Playback speed for a scroll-triggered reveal at the current viewport width. Client only. */
export const revealSpeed = () =>
  window.matchMedia(breakpoints.belowLaptop).matches ? COMPACT_REVEAL_SPEED : 1;

export const motionDefaults = {
  duration: 0.8,
  ease: "power3.out",
  stagger: 0.08,
} as const;
