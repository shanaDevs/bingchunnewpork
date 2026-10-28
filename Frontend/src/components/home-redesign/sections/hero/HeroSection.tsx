import { HERO_TARGETS } from "./hero.config";
import { HeroBackdrop } from "./HeroBackdrop";
import { HeroContent } from "./HeroContent";
import { HeroDecor } from "./HeroDecor";
import { HeroMotion } from "./HeroMotion";
import { HeroProductStage } from "./HeroProductStage";

/**
 * Static hero composition. Layer order on desktop (z-index):
 * backdrop → decor (2–4) → far drinks (5) → headline (10) → side drinks (20)
 * → front pearls (25) → main drink (30) → CTA + badge (40).
 * Tablet and phone use the same layering on portrait canvases (see hero.config); `wide:` (globals.css)
 * switches to the desktop canvas, on desktop and on landscape screens from 1024px.
 * The canvas is the `@container`, so cqw units scale with the composition, not the viewport.
 * HeroMotion is the client <section> that runs the GSAP entrance; everything inside stays server-rendered.
 * The bottom padding is a plain strip below the wave: the drinks' drop shadows fade out there
 * instead of being cut off by overflow-hidden (which the drink fly-ins from below rely on).
 *
 * Phone and tablet canvases start below the fixed header (pt-22) and are as wide as the screen,
 * unless that would push the composition below the first screen: then they narrow just enough to fit
 * 100svh (the viewport with the browser toolbars showing), with a floor for landscape phones.
 * The multipliers are the canvas aspect ratios from HERO_COMPACT_CANVAS.
 */
export function HeroSection() {
  return (
    <HeroMotion
      data-hero={HERO_TARGETS.root}
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden pb-16 text-snow"
    >
      <div className="relative pt-22 wide:pt-0">
        <HeroBackdrop />
        <div className="@container relative mx-auto aspect-[390/580] w-[min(100%,max(18rem,calc((100svh-5.5rem)*0.672)))] max-w-site sm:aspect-[768/880] sm:w-[min(100%,max(20rem,calc((100svh-5.5rem)*0.873)))] wide:w-full wide:aspect-[1440/820]">
          <HeroDecor />
          <HeroContent />
          <HeroProductStage />
        </div>
      </div>
    </HeroMotion>
  );
}
