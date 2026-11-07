import { HERO_TARGETS, heroBackdropImage } from "./hero.config";

/** Full-bleed background: blue gradient, soft colour pools and the white wave into the page. */
export function HeroBackdrop() {
  return (
    <div data-hero={HERO_TARGETS.backdrop} aria-hidden="true" className="absolute inset-0">
      {/* Its bottom 4px are clipped away (the gradient itself keeps its full size), behind the wave,
          whose curve never dips lower than ~7px above its bottom edge. At fractional pixel ratios (2.625x phones, scaled or zoomed tablets) the
          browser can leave a sub-pixel gap along the wave's bottom edge; with no blue under it, nothing
          shows through, so there is never a hairline under the hero. */}
      <div
        data-decor="gradient"
        className="absolute inset-0 [clip-path:inset(0_0_4px_0)]"
        style={{ backgroundImage: heroBackdropImage }}
      />
      {/* z-1: above the glow and halo rings (z auto) so they never paint onto the
          white and get cut off at the hero's edge, but below the drinks, pearls and sparkles (z 4+). */}
      <svg
        data-decor="wave"
        className="absolute inset-x-0 bottom-0 z-1 h-[clamp(2.5rem,5vw,5.5rem)] w-full text-snow"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
      >
        <path
          fill="currentColor"
          d="M0 58C180 30 330 20 520 38C700 55 820 82 1010 72C1180 63 1320 32 1440 26V100H0Z"
        />
      </svg>
    </div>
  );
}
