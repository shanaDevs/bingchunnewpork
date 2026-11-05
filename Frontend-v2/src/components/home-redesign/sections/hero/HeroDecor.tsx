import Image from "next/image";
import type { CSSProperties } from "react";
import { HERO_TARGETS } from "./hero.config";

type Spot = { x: number; y: number; size: number };
type Placed = { id: string; z: number; desktop: Spot; tablet: Spot; phone: Spot };

// Positions in % of each layout's canvas; size in cqw. z < 10 sits behind the headline.
const pearls: Placed[] = [
  {
    id: "pearl-1",
    z: 25,
    desktop: { x: 20, y: 56, size: 2.2 },
    tablet: { x: 14, y: 70, size: 4.4 },
    phone: { x: 10, y: 79.3, size: 5 },
  },
  {
    id: "pearl-2",
    z: 4,
    desktop: { x: 82, y: 50, size: 1.6 },
    tablet: { x: 75, y: 30, size: 3 },
    phone: { x: 88, y: 75, size: 3.8 },
  },
  {
    id: "pearl-3",
    z: 35,
    desktop: { x: 43, y: 91, size: 1.4 },
    tablet: { x: 60, y: 82, size: 2.8 },
    phone: { x: 66, y: 89, size: 4.2 },
  },
  {
    id: "pearl-4",
    z: 25,
    desktop: { x: 79, y: 69, size: 1.8 },
    tablet: { x: 90, y: 62, size: 3.6 },
    phone: { x: 24, y: 90, size: 4 },
  },
];

/**
 * Extra pearls spilled along the bottom of the phone hero (hidden from sm up). Named pearl-N so the
 * entrance and ambient loops pick them up; listed after the shared pearls, so desktop's pearl stagger
 * is unchanged.
 */
const phonePearls: (Spot & { id: string; z: number })[] = [
  { id: "pearl-5", z: 25, x: 40, y: 90.5, size: 3.2 },
  { id: "pearl-6", z: 25, x: 58, y: 88, size: 2.6 },
  { id: "pearl-7", z: 25, x: 80, y: 93, size: 3.4 },
  { id: "pearl-8", z: 25, x: 4, y: 94, size: 4.4 },
];

const sparkles: (Placed & { tone: "white" | "sun" })[] = [
  {
    id: "sparkle-1",
    z: 4,
    tone: "white",
    desktop: { x: 26, y: 22, size: 2.2 },
    tablet: { x: 17, y: 5, size: 4.4 },
    phone: { x: 12, y: 6.9, size: 6.4 },
  },
  {
    id: "sparkle-2",
    z: 4,
    tone: "sun",
    desktop: { x: 74, y: 27, size: 1.6 },
    tablet: { x: 83, y: 9, size: 3.2 },
    phone: { x: 88, y: 8.7, size: 4.8 },
  },
  {
    id: "sparkle-3",
    z: 4,
    tone: "white",
    desktop: { x: 93, y: 72, size: 1.3 },
    tablet: { x: 95, y: 47, size: 2.6 },
    phone: { x: 92, y: 86, size: 4 },
  },
  {
    id: "sparkle-4",
    z: 4,
    tone: "sun",
    desktop: { x: 17, y: 51, size: 1.2 },
    tablet: { x: 6, y: 57, size: 2.6 },
    phone: { x: 8, y: 88, size: 4 },
  },
];

function spotStyle({ z, desktop, tablet, phone }: Placed) {
  return {
    "--x": `${desktop.x}%`,
    "--y": `${desktop.y}%`,
    "--s": `${desktop.size}cqw`,
    "--tx": `${tablet.x}%`,
    "--ty": `${tablet.y}%`,
    "--ts": `${tablet.size}cqw`,
    "--px": `${phone.x}%`,
    "--py": `${phone.y}%`,
    "--ps": `${phone.size}cqw`,
    zIndex: z,
  } as CSSProperties;
}

const spotClass =
  "absolute -translate-1/2 top-(--py) left-(--px) w-(--ps) sm:top-(--ty) sm:left-(--tx) sm:w-(--ts) wide:top-(--y) wide:left-(--x) wide:w-(--s)";

/** Glossy boba pearl. */
function Pearl() {
  return (
    <span className="block aspect-square w-full rounded-full bg-[radial-gradient(circle_at_32%_28%,#5a4a63_0%,#231a2b_38%,#0b0710_100%)] shadow-[0_1.2cqw_2cqw_rgb(15_33_71/0.35)] wide:shadow-[0_0.6cqw_1cqw_rgb(15_33_71/0.35)]" />
  );
}

/** Four-point sparkle. */
function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" className="block w-full" fill="currentColor">
      <path d="M12 0C12.9 6.6 17.4 11.1 24 12 17.4 12.9 12.9 17.4 12 24 11.1 17.4 6.6 12.9 0 12 6.6 11.1 11.1 6.6 12 0Z" />
    </svg>
  );
}

/** Text ring of the sticker badge. The ambient loop spins this SVG; the mascot sits on top, unrotated. */
function Badge() {
  return (
    <svg viewBox="0 0 200 200" className="block w-full">
      <defs>
        <path id="hero-badge-circle" d="M100 100m-74 0a74 74 0 1 1 148 0a74 74 0 1 1-148 0" />
      </defs>
      <circle cx="100" cy="100" r="98" className="fill-white" />
      <circle cx="100" cy="100" r="54" className="fill-brand-600" />
      <text className="fill-brand-700 font-display-condensed" fontSize="24" letterSpacing="2.5">
        <textPath href="#hero-badge-circle" textLength="462">
          ICE CREAM &amp; TEA • BING CHUN •
        </textPath>
      </text>
    </svg>
  );
}

/**
 * Canvas-aligned decoration: halo rings, boba pearls, sparkles and a badge
 * (the badge is left out on phones).
 * No z-index on the wrapper, so items can sit in front of or behind the drinks individually.
 */
export function HeroDecor() {
  return (
    // Keeps the glow and halo rings inside the canvas (under the wave), out of the strip below it.
    // Phone and tablet clip only top and bottom: when the canvas is narrower than the screen the
    // rings run on past its sides instead of ending in a hard edge (the section clips the rest).
    <div
      data-hero={HERO_TARGETS.decor}
      aria-hidden="true"
      className="absolute inset-0 [clip-path:inset(0_-100vw)] wide:overflow-hidden wide:[clip-path:none]"
    >
      <div
        data-decor="glow"
        className="absolute top-[51%] left-1/2 aspect-square w-[118cqw] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-brand-400)_80%,transparent),transparent)] sm:top-[58%] sm:w-[96cqw] wide:top-[72%] wide:w-[64cqw]"
      />
      <div
        data-decor="ring-inner"
        className="absolute top-[51%] left-1/2 aspect-square w-[84cqw] -translate-1/2 rounded-full border-[0.4cqw] border-white/15 sm:top-[58%] sm:w-[64cqw] sm:border-[0.25cqw] wide:top-[72%] wide:w-[42cqw] wide:border-[0.15cqw]"
      />
      <div
        data-decor="ring-outer"
        className="absolute top-[51%] left-1/2 aspect-square w-[116cqw] -translate-1/2 rounded-full border-[0.35cqw] border-dashed border-white/12 sm:top-[58%] sm:w-[90cqw] sm:border-[0.2cqw] wide:top-[72%] wide:w-[60cqw] wide:border-[0.12cqw]"
      />

      {pearls.map((p) => (
        <div key={p.id} data-decor={p.id} className={spotClass} style={spotStyle(p)}>
          <Pearl />
        </div>
      ))}

      {phonePearls.map(({ id, z, x, y, size }) => (
        <div
          key={id}
          data-decor={id}
          className="absolute -translate-1/2 sm:hidden"
          style={{ left: `${x}%`, top: `${y}%`, width: `${size}cqw`, zIndex: z }}
        >
          <Pearl />
        </div>
      ))}

      {sparkles.map((s) => (
        <div
          key={s.id}
          data-decor={s.id}
          className={`${spotClass} ${s.tone === "sun" ? "text-sun-400" : "text-snow"}`}
          style={spotStyle(s)}
        >
          <Sparkle />
        </div>
      ))}

      <div
        data-decor="badge"
        className="absolute right-[4%] bottom-[5%] z-40 w-[25cqw] max-w-36 -rotate-12 max-sm:hidden drop-shadow-[0_8px_12px_rgb(15_33_71/0.3)] sm:bottom-[5.5%] sm:w-[17cqw] wide:right-[min(3rem,3.75cqw)] wide:bottom-[calc(14%+min(5rem,6.25cqw))] wide:w-[9cqw] wide:drop-shadow-[0_12px_18px_rgb(15_33_71/0.3)]"
      >
        <Badge />
        {/* The PNG has transparent padding (artwork sits slightly above centre), so it is sized past
            the blue disc and nudged down to centre the head and paws inside it. */}
        <Image
          src="/images/order-now-mascot.png"
          alt=""
          width={612}
          height={408}
          sizes="144px"
          className="absolute top-1/2 left-1/2 w-[92%] max-w-none -translate-x-1/2 -translate-y-[44.5%]"
        />
      </div>
    </div>
  );
}
