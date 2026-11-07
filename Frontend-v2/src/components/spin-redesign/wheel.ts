import type { SpinOffer } from "@/lib/spinStorage";

/** What POST /spin/play answers. The server has already picked the prize and recorded it. */
export type SpinPlayResponse = {
  alreadyClaimed?: boolean;
  resultId: string;
  claimCode: string | null;
  expiresAt: string | null;
  offer: SpinOffer;
  offerIndex: number;
  isPrize?: boolean;
};

/** The dark text used on light slices (brand-950). */
const NAVY = "#0f2147";
const WHITE = "#ffffff";

/** From this many slices the labels run along the radius: across the slice there is no longer room for them. */
export const RADIAL_LABELS_FROM = 7;

/** The little pull back before the wheel goes. Counts towards the admin's spin length. */
export const WIND_UP_S = 0.35;

export const sliceAngle = (count: number) => 360 / Math.max(count, 1);

/** The slice under the pointer when the wheel is turned `rotation` degrees clockwise. */
export const sliceAt = (rotation: number, count: number) =>
  Math.floor((((-rotation % 360) + 360) % 360) / sliceAngle(count)) % count;

/**
 * Where to stop so slice `index` is under the pointer: `turns` whole turns on from `current`, plus whatever is left.
 * `offset` (degrees from the slice's centre) keeps it from always stopping dead centre.
 */
export function landingRotation(current: number, index: number, count: number, turns: number, offset: number) {
  const slice = sliceAngle(count);
  const landing = (360 - (index * slice + slice / 2) + offset + 360) % 360;
  const ahead = (landing - (current % 360) + 360) % 360;
  return current + turns * 360 + ahead;
}

/**
 * The admin's spin length as the wheel's motion. Turns grow with the length so the speed stays about the same (a long
 * spin with few turns looks stopped seconds before it ends), and long spins ease out more gently for the same reason.
 */
export function spinTiming(totalSeconds: number) {
  const spinS = Math.max(totalSeconds - WIND_UP_S, 0.5);
  return {
    spinS,
    turns: Math.max(4, Math.round(spinS * 1.1)),
    ease: spinS > 8 ? "power3.out" : "power4.out",
  };
}

/** The wheel slice showing this offer, or -1 when the wheel was loaded before the admin changed it. */
export const sliceOfOffer = (offers: SpinOffer[], offer: SpinOffer) => offers.findIndex((slice) => slice.id === offer.id);

export const isWinningPlay = (play: SpinPlayResponse) => play.isPrize !== false && play.offer.offerType !== "NO_PRIZE";

/**
 * The admin's label ("shown on wheel") as a slice's big line and small line: "10% OFF" → 10% / OFF,
 * "LKR 100 OFF" → LKR 100 / OFF, "Free Delivery" → Free / Delivery, "Mega Deal Today" → Mega / Deal Today.
 */
export function sliceLines(label: string): { top: string; bottom: string } {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { top: words[0] ?? "", bottom: "" };
  if (words.length > 2 && /^off$/i.test(words[words.length - 1])) {
    return { top: words.slice(0, -1).join(" "), bottom: words[words.length - 1] };
  }
  // A currency stays with its amount.
  const big = /^(lkr|rs\.?)$/i.test(words[0]) && /^[\d,.]+$/.test(words[1]) ? 2 : 1;
  return { top: words.slice(0, big).join(" "), bottom: words.slice(big).join(" ") };
}

/** A line split at the space nearest its middle, once it's too long to read well on one. */
export function wrapLines(text: string, oneLineUpTo = 12): string[] {
  const words = text.split(" ");
  if (text.length <= oneLineUpTo || words.length < 2) return [text];
  let best = 1;
  for (let i = 1; i < words.length; i += 1) {
    const gap = (n: number) => Math.abs(words.slice(0, n).join(" ").length - text.length / 2);
    if (gap(i) < gap(best)) best = i;
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * The biggest size up to `max` at which these lines fit across a slice `radius` out from the centre, so any label the
 * admin writes stays inside its slice. `charWidth` is the font's average character width, in ems.
 */
export function fitFont(lines: string[], max: number, radius: number, count: number, charWidth = 0.5) {
  const width = Math.min(2 * radius * Math.tan(((sliceAngle(count) / 2) * Math.PI) / 180) * 0.85, 150);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  return Math.min(max, width / (longest * charWidth));
}

/** The prize as the result card names it, with the gift's full name. */
export function prizeName(offer: SpinOffer): string {
  switch (offer.offerType) {
    case "PERCENTAGE":
      return `${offer.discountValue}% off your order`;
    case "FIXED":
      return `LKR ${offer.discountValue} off your order`;
    case "FREE_DELIVERY":
      return "Free delivery";
    case "GIFT":
      return offer.giftProduct?.name ? `A free ${offer.giftProduct.name}` : offer.label;
    default:
      return offer.label;
  }
}

/** One line for the dialog's intro, from the admin's spin allowance and how much of it is left. */
export function spinAllowanceText(allowed = 1, windowHours = 24, remaining?: number): string {
  const spins = allowed === 1 ? "One lucky spin" : `${allowed} lucky spins`;
  const every =
    windowHours === 24
      ? "every day"
      : windowHours % 24 === 0
        ? `every ${windowHours / 24} days`
        : windowHours === 1
          ? "every hour"
          : `every ${windowHours} hours`;
  const left = allowed > 1 && remaining !== undefined ? ` ${remaining} left.` : "";
  return `${spins} ${every}.${left}`;
}

function hexToRgb(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]) {
  const [lr, lg, lb] = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** White or navy, whichever reads better on the admin's slice colour. White when the colour can't be read. */
export function textOnFill(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return WHITE;
  const fill = luminance(rgb);
  return contrast(fill, 1) >= contrast(fill, luminance(hexToRgb(NAVY)!)) ? WHITE : NAVY;
}

/** The line between slices: white, except on near-white slices, where it would vanish. */
export function seamOnFill(color: string): string {
  const rgb = hexToRgb(color);
  return rgb && luminance(rgb) > 0.85 ? "#bcd7ff" : WHITE;
}

/** The longest a radial label may run: from just inside the rim to just outside the hub. */
const RADIAL_LENGTH = 88;

/** A label running along the radius: as big as the slice's width and the label's length allow. */
export function radialFontSize(count: number, text: string, length = RADIAL_LENGTH) {
  const width = 2 * 90 * Math.tan(((sliceAngle(count) / 2) * Math.PI) / 180) * 0.7;
  return Math.min(22, width, length / (Math.max(text.length, 1) * 0.55));
}

/** A gift photo's size on a slice: narrower slices get a smaller one. */
export function photoSize(count: number) {
  return Math.min(count < RADIAL_LABELS_FROM ? 46 : 40, 2 * 118 * Math.tan(((sliceAngle(count) / 2) * Math.PI) / 180) * 0.55);
}
