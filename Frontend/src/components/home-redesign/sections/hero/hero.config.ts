/**
 * Hero content, product layout and animation hooks.
 *
 * Layout model: the hero is a fixed-aspect canvas with every drink placed in percentages of it,
 * so each composition scales uniformly with the canvas width. There are three canvases:
 * - desktop (`wide:`: 1280px+, and landscape screens from 1024px): HERO_CANVAS, landscape, scales up
 *   to the 1600px max width.
 * - tablet (sm, 640px up to `wide`) and phone (below 640px): HERO_COMPACT_CANVAS, portrait versions of
 *   the desktop composition, sized to fit the first screen. Phones leave out the badge and the two
 *   far drinks (no `phone` placement) and centre the CTA below the drinks. Phone side drinks keep
 *   the desktop proportions: 84% of the main cup's height, touching its sides, bases level with it.
 */

/** Design canvas the desktop percentages were authored against. */
export const HERO_CANVAS = { width: 1440, height: 820 } as const;

/** Portrait canvases for phones and tablets (width / height); must match the aspect classes in HeroSection. */
export const HERO_COMPACT_CANVAS = {
  phone: { width: 390, height: 580 },
  tablet: { width: 768, height: 880 },
} as const;

/**
 * Selectors for the future GSAP phase. Each element carries `data-hero="<value>"`, e.g.
 * `gsap.from('[data-hero="headline-line"]', …)` inside a `useGSAP({ scope })` call.
 *
 * Drinks: animate `[data-hero="drink-motion"]` (the inner layer). The outer `drink` wrapper
 * owns static placement and base rotation, so animation transforms never fight the layout.
 * Do not transform the stage itself: that would create a stacking context and break the
 * drink/headline layering.
 */
export const HERO_TARGETS = {
  root: "root",
  backdrop: "backdrop",
  decor: "decor",
  headline: "headline",
  headlineLine: "headline-line",
  cta: "cta",
  stage: "stage",
  drink: "drink",
  drinkMotion: "drink-motion",
} as const;

/** Blue gradient with soft colour pools behind the hero; the mobile menu reuses it so the two read as one surface. */
export const heroBackdropImage = [
  "radial-gradient(60% 55% at 12% 8%, color-mix(in oklab, var(--color-brand-400) 55%, transparent), transparent 70%)",
  "radial-gradient(55% 60% at 95% 100%, color-mix(in oklab, var(--color-brand-800) 70%, transparent), transparent 70%)",
  "linear-gradient(180deg, var(--color-brand-600) 0%, var(--color-brand-600) 45%, var(--color-brand-700) 100%)",
].join(", ");

export const heroCopy = {
  headlineLines: ["Sip into", "Happiness"],
  cta: { label: "Explore Our Menu", href: "/menu" },
} as const;

export type DrinkPlacement = {
  /** Horizontal centre, % of stage width. */
  x: number;
  /** Top edge, % of stage height. */
  y: number;
  /** Height, % of stage height. Width follows the image aspect ratio. */
  h: number;
  /** Base tilt in degrees. */
  rotate: number;
};

export type HeroDrinkId = "main" | "left" | "right" | "far-left" | "far-right";

export type HeroDrinkConfig = {
  id: HeroDrinkId;
  src: string;
  alt: string;
  /** Intrinsic pixel size of the source PNG (used for aspect ratio). */
  width: number;
  height: number;
  /** Stacking order (desktop, tablet and phone). Headline sits at 10: lower drinks pass behind it. */
  layer: number;
  desktop: DrinkPlacement;
  tablet: DrinkPlacement;
  phone?: DrinkPlacement;
};

export const heroDrinks: HeroDrinkConfig[] = [
  {
    id: "far-left",
    src: "/images/products/Lemon-Green-Tea-700ml.webp",
    alt: "Lemon Green Tea",
    width: 313,
    height: 800,
    layer: 5,
    desktop: { x: 9.5, y: 23.8, h: 37, rotate: -14 },
    tablet: { x: 13, y: 26, h: 37, rotate: -14 },
  },
  {
    id: "far-right",
    src: "/images/products/Strawberry-Bobo-Jasmine-Milk-Tea-700ml.webp",
    alt: "Strawberry Bobo Jasmine Milk Tea",
    width: 346,
    height: 800,
    layer: 5,
    desktop: { x: 90.5, y: 19.5, h: 38, rotate: 12 },
    tablet: { x: 87, y: 23, h: 38, rotate: 12 },
  },
  {
    id: "left",
    src: "/images/products/Strawberry-Mango-Lemon-Tea-v2.webp",
    alt: "Strawberry Mango Lemon Tea",
    width: 463,
    height: 800,
    layer: 20,
    desktop: { x: 35, y: 54, h: 43, rotate: -9 },
    tablet: { x: 31, y: 45, h: 36, rotate: -9 },
    phone: { x: 19, y: 29.8, h: 38.8, rotate: -9 },
  },
  {
    id: "right",
    src: "/images/products/Blueberry-Bobo-Tea-500u.webp",
    alt: "Blueberry Bobo Tea",
    width: 481,
    height: 800,
    layer: 20,
    desktop: { x: 65, y: 52, h: 44, rotate: 8 },
    tablet: { x: 69, y: 44, h: 37, rotate: 8 },
    phone: { x: 80.5, y: 27.4, h: 39.7, rotate: 8 },
  },
  {
    id: "main",
    src: "/images/products/Brown-Black-Sugar-Boba-Milk-Tea-500u.webp",
    alt: "Brown Black Sugar Boba Milk Tea",
    width: 463,
    height: 800,
    layer: 30,
    desktop: { x: 50, y: 46.8, h: 51.5, rotate: -2 },
    tablet: { x: 50, y: 22, h: 55, rotate: -2 },
    phone: { x: 50, y: 24.1, h: 46.6, rotate: -2 },
  },
];
