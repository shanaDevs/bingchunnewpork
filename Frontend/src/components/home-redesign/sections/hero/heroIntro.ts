import { gsap } from "@/components/home-redesign/lib/gsap";
import type { HeroDrinkId } from "./hero.config";

/**
 * Hero entrance choreography.
 *
 * Every tween targets transform/opacity on elements that carry no layout transforms of their own
 * (or whose static offsets use the separate CSS `translate`/`rotate` properties), and every
 * tween ends at GSAP's identity state — so the settled frame is exactly the approved static layout.
 * Drinks animate their inner `drink-motion` layer; the outer wrapper keeps placement and tilt.
 */

type Selector = (selector: string) => Element[];

type DrinkEntrance = {
  /** Start time in the master timeline (seconds). */
  at: number;
  duration: number;
  ease: string;
  /** Starting offsets, relative to the drink's own size; tweened back to identity. */
  from: gsap.TweenVars;
};

/** Flight paths: back drinks swoop in from the upper corners, front drinks rise from the lower corners, the main cup erupts from below last. */
const stageDrinks: Record<HeroDrinkId, DrinkEntrance> = {
  "far-left": {
    at: 0.7,
    duration: 1.15,
    ease: "back.out(1.15)",
    from: { xPercent: -260, yPercent: -95, rotation: -110, scale: 0.7 },
  },
  "far-right": {
    at: 0.8,
    duration: 1.15,
    ease: "back.out(1.15)",
    from: { xPercent: 260, yPercent: -105, rotation: 110, scale: 0.7 },
  },
  left: {
    at: 0.9,
    duration: 1.05,
    ease: "back.out(1.2)",
    from: { xPercent: -190, yPercent: 140, rotation: -55, scale: 0.75 },
  },
  right: {
    at: 1.0,
    duration: 1.05,
    ease: "back.out(1.2)",
    from: { xPercent: 190, yPercent: 140, rotation: 55, scale: 0.75 },
  },
  main: {
    at: 1.1,
    duration: 1.2,
    ease: "back.out(1.3)",
    from: { yPercent: 125, rotation: 14, scale: 0.55 },
  },
};

/** Gentle post-landing float per drink: y in px, rotation in degrees, period in seconds. */
const drinkFloat: Record<HeroDrinkId, { y: number; rotation: number; duration: number; delay: number }> = {
  main: { y: -8, rotation: 0.6, duration: 3.4, delay: 0 },
  left: { y: -10, rotation: -1.2, duration: 2.9, delay: 0.4 },
  right: { y: -9, rotation: 1.1, duration: 3.2, delay: 0.8 },
  "far-left": { y: -12, rotation: -1.5, duration: 3.8, delay: 0.2 },
  "far-right": { y: -11, rotation: 1.5, duration: 3.5, delay: 1.1 },
};

function drinkMotion(q: Selector, id: HeroDrinkId) {
  return q(`[data-drink="${id}"] [data-hero="drink-motion"]`);
}

/** Extra distance below the hero's bottom edge, in drink heights: covers the tilt and drop shadow. */
const BELOW_HERO_MARGIN = 0.25;

/**
 * Phone and tablet: the drinks are a much larger share of the hero's height than on desktop, so
 * desktop's starting offsets left them partly visible at the bottom of the hero (over the wave),
 * sitting still until their turn. This raises a drink's starting yPercent just enough that it
 * begins fully below the hero, at its starting scale. Never lower than the desktop offset.
 */
function yPercentBelowHero(from: gsap.TweenVars) {
  const base = Number(from.yPercent ?? 0);
  const scale = Number(from.scale ?? 1);
  return (_: number, el: Element) => {
    const hero = el.closest('[data-hero="root"]');
    const box = el.getBoundingClientRect();
    if (!hero || !box.height) return base;
    const visibleTop = box.top + (box.height * (1 - scale)) / 2;
    const needed = hero.getBoundingClientRect().bottom - visibleTop + box.height * BELOW_HERO_MARGIN;
    return Math.max(base, (needed / box.height) * 100);
  };
}

/**
 * Header items drop in (0–~0.9s). Kept separate from the hero intros so the hero can replay on
 * scroll without hiding the fixed header.
 */
export function buildHeaderIntro(headerItems: Element[], desktop: boolean) {
  return gsap.timeline({ paused: true, defaults: { ease: "power3.out" } }).from(headerItems, {
    autoAlpha: 0,
    y: desktop ? -18 : -12,
    duration: desktop ? 0.6 : 0.5,
    stagger: desktop ? 0.07 : 0.06,
  });
}

/**
 * Full entrance (~2.85s) for the full composition, used at every size; `compact` is the portrait
 * layouts (phone and tablet). Ambient loops start the moment the main cup lands.
 */
export function buildStageIntro(q: Selector, ambient: gsap.core.Timeline, compact = false) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });

  // A — decoration fades up (0–1.4s); the header runs alongside via buildHeaderIntro
  tl.from(q('[data-decor="glow"]'), { autoAlpha: 0, scale: 0.7, duration: 1.4, ease: "power2.out" }, 0)
    .from(q('[data-decor^="ring"]'), { autoAlpha: 0, scale: 0.75, duration: 1.4, stagger: 0.12 }, 0.05)
    .from(
      q('[data-decor^="sparkle"]'),
      { autoAlpha: 0, scale: 0, rotation: -90, duration: 0.7, stagger: 0.08, ease: "back.out(2)" },
      0.25,
    );

  // B — headline lines punch up from their baseline (0.3–1.3s)
  tl.from(
    q('[data-hero="headline-line"]'),
    {
      autoAlpha: 0,
      yPercent: 45,
      scale: 0.9,
      transformOrigin: "50% 100%",
      duration: 0.85,
      stagger: 0.14,
      ease: "back.out(1.5)",
    },
    0.3,
  );

  // C — drinks fly in on staggered, overlapping paths (0.7–2.3s)
  (Object.keys(stageDrinks) as HeroDrinkId[]).forEach((id) => {
    const { at, duration, ease, from } = stageDrinks[id];
    const start = compact ? { ...from, yPercent: yPercentBelowHero(from) } : from;
    tl.from(drinkMotion(q, id), { ...start, duration, ease }, at);
  });

  // D — supporting details land around the composition (1.45–2.85s)
  tl.from(
    q('[data-decor^="pearl"]'),
    { autoAlpha: 0, scale: 0, duration: 0.6, stagger: 0.07, ease: "back.out(2.2)" },
    1.45,
  )
    .from(q('[data-hero="cta"]'), { autoAlpha: 0, y: 22, duration: 0.8 }, 1.68)
    .from(q('[data-decor="badge"]'), { autoAlpha: 0, scale: 0.4, duration: 0.9, ease: "back.out(1.8)" }, 1.75)
    .from(q('[data-decor="badge"] svg'), { rotation: -150, duration: 1.1 }, 1.75);

  const mainLands = stageDrinks.main.at + stageDrinks.main.duration;
  tl.call(() => void ambient.play(), undefined, mainLands);

  return tl;
}

/**
 * Understated loops after landing: drinks bob independently, pearls drift, sparkles twinkle,
 * the badge text and dashed halo turn slowly. Built paused; played by the intro (or directly
 * when the intro is skipped).
 */
export function buildStageAmbient(q: Selector) {
  const loop = { repeat: -1, yoyo: true, ease: "sine.inOut" } as const;
  const tl = gsap.timeline({ paused: true });

  (Object.keys(drinkFloat) as HeroDrinkId[]).forEach((id) => {
    const { y, rotation, duration, delay } = drinkFloat[id];
    tl.to(drinkMotion(q, id), { y, rotation, duration, ...loop }, delay);
  });

  q('[data-decor^="pearl"]').forEach((pearl, i) => {
    tl.to(pearl, { y: -8 - (i % 3) * 3, duration: 2.6 + i * 0.5, ...loop }, i * 0.3);
  });

  q('[data-decor^="sparkle"]').forEach((sparkle, i) => {
    tl.to(sparkle, { scale: 0.7, opacity: 0.55, duration: 1.4 + i * 0.35, ...loop }, i * 0.45);
  });

  // The badge spin waits for the badge's own entrance (which ends ~0.6s after the main cup lands).
  tl.to(q('[data-decor="badge"] svg'), { rotation: 360, duration: 28, ease: "none", repeat: -1 }, 0.7)
    .to(q('[data-decor="ring-outer"]'), { rotation: 360, duration: 120, ease: "none", repeat: -1 }, 0);

  return tl;
}

/** Resolves once hero images are decoded and fonts are ready, or after `timeoutMs`. */
export function heroAssetsReady(scope: Element, timeoutMs: number) {
  const images = Array.from(scope.querySelectorAll("img"));
  const decoded = Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  const fonts = document.fonts?.ready ?? Promise.resolve();
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([Promise.all([decoded, fonts]), timeout]).then(() => undefined);
}
