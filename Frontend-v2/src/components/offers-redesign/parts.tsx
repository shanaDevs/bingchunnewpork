"use client";

import { ArrowRight, CalendarDays, Hourglass, ShoppingBag, Ticket } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { CopyCodeButton } from "@/components/home-redesign/sections/offers/CopyCodeButton";
import { openOrderModal } from "@/components/order/SiteOrderPrompt";
import { applyHomeOfferToCart } from "@/lib/applyHomeOffer";
import { PROMOTION_MASCOTS, type Promotion, type PromotionTone } from "./promotion";

/** A four-point sparkle on a 24×24 box. */
export const STAR_PATH = "M12 0C12.9 6.6 17.4 11.1 24 12 17.4 12.9 12.9 17.4 12 24 11.1 17.4 6.6 12.9 0 12 6.6 11.1 11.1 6.6 12 0Z";

/** Starts hidden only where it will animate in, so there's no flash before the entrance (and it shows at once with reduced motion). */
export const enters = "motion-safe:opacity-0";

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2";

export function Sparkle({ className, ...data }: { className?: string } & Record<`data-${string}`, string>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("fill-current", className)} {...data}>
      <path d={STAR_PATH} />
    </svg>
  );
}

type ToneClasses = { card: string; figure: string; tag: string; text: string; muted: string; code: string; copy: string; button: string; glow: string };

/**
 * Each card colourway: the surface, the big figure and its tag, body text, the dashed code box and its copy
 * button, and the action button. Light tones use dark text and the reverse; every pair meets AA contrast.
 * White text is `text-snow`: the app's light theme remaps `.text-white` to dark text site-wide.
 */
export const TONES: Record<PromotionTone, ToneClasses> = {
  blue: {
    card: "bg-[linear-gradient(140deg,var(--color-brand-500),var(--color-brand-700))] text-snow",
    figure: "text-snow [text-shadow:0_0.05em_0_var(--color-brand-800)]",
    tag: "bg-sun-300 text-brand-900",
    text: "text-snow/85",
    muted: "text-snow/75",
    code: "border-white/50 bg-white/10 text-snow",
    copy: "text-snow/80 hover:bg-white/15 hover:text-snow focus-visible:outline-white",
    button: "bg-white text-brand-700 hover:bg-brand-50 focus-visible:outline-white",
    glow: "bg-white/12",
  },
  sun: {
    card: "bg-[linear-gradient(140deg,var(--color-sun-300),var(--color-sun-400))] text-brand-950",
    figure: "text-brand-700",
    tag: "bg-brand-600 text-snow",
    text: "text-brand-950/80",
    muted: "text-brand-950/70",
    code: "border-brand-700/40 bg-white/60 text-brand-800",
    copy: "text-brand-700 hover:bg-white/70 focus-visible:outline-brand-700",
    button: "bg-brand-600 text-snow hover:bg-brand-700 focus-visible:outline-brand-700",
    glow: "bg-white/45",
  },
  ice: {
    card: "bg-brand-50 text-brand-950 ring-1 ring-brand-100 ring-inset",
    figure: "text-brand-600",
    tag: "bg-sun-300 text-brand-900",
    text: "text-slate-600",
    muted: "text-slate-500",
    code: "border-brand-300 bg-white text-brand-700",
    copy: "text-brand-600 hover:bg-brand-100 hover:text-brand-700 focus-visible:outline-brand-600",
    button: "bg-brand-600 text-snow hover:bg-brand-700 focus-visible:outline-brand-600",
    glow: "bg-brand-100/80",
  },
  berry: {
    card: "bg-[linear-gradient(140deg,#ff7ab8,#d63a84)] text-snow",
    figure: "text-snow [text-shadow:0_0.05em_0_#a3245f]",
    tag: "bg-white text-[#b42667]",
    text: "text-snow/90",
    muted: "text-snow/80",
    code: "border-white/60 bg-white/15 text-snow",
    copy: "text-snow/85 hover:bg-white/20 hover:text-snow focus-visible:outline-white",
    button: "bg-white text-[#b42667] hover:bg-pink-50 focus-visible:outline-white",
    glow: "bg-white/15",
  },
  mint: {
    card: "bg-[linear-gradient(140deg,#8ee8c8,#38c495)] text-emerald-950",
    figure: "text-emerald-950",
    tag: "bg-white text-emerald-800",
    text: "text-emerald-950/80",
    muted: "text-emerald-950/70",
    code: "border-emerald-900/35 bg-white/55 text-emerald-900",
    copy: "text-emerald-900 hover:bg-white/60 focus-visible:outline-emerald-900",
    button: "bg-emerald-900 text-snow hover:bg-emerald-950 focus-visible:outline-emerald-900",
    glow: "bg-white/35",
  },
  ink: {
    card: "bg-[radial-gradient(120%_90%_at_85%_8%,var(--color-brand-700),var(--color-brand-950)_62%)] text-snow",
    figure: "text-sun-300",
    tag: "bg-sun-300 text-brand-950",
    text: "text-snow/80",
    muted: "text-snow/70",
    code: "border-sun-300/60 bg-white/5 text-sun-300",
    copy: "text-sun-300/90 hover:bg-white/10 hover:text-sun-300 focus-visible:outline-sun-300",
    button: "bg-sun-300 text-brand-950 hover:bg-sun-400 focus-visible:outline-sun-300",
    glow: "bg-brand-500/25",
  },
};

export type CardTheme = { style: ToneClasses; cardStyle?: CSSProperties; figureStyle?: CSSProperties };

/**
 * The card's colours: the admin's Card Designer colours when they set them (its background, with the accent on the
 * big figure where it stands out), dressed with the ink or ice text colours to suit; else the page's colourway.
 */
export function cardTheme(promotion: Promotion): CardTheme {
  const { colours } = promotion;
  if (!colours) return { style: TONES[promotion.tone] };
  return {
    style: TONES[colours.dark ? "ink" : "ice"],
    cardStyle: { background: colours.background },
    figureStyle: colours.accent ? { color: colours.accent } : undefined,
  };
}

/** The big figure ("20%") with its tag ("OFF") beside it. */
export function DealFigure({ promotion, theme, className }: { promotion: Promotion; theme: CardTheme; className?: string }) {
  return (
    <p className={cn("font-display-condensed flex flex-wrap items-start gap-x-2 leading-[0.85] uppercase", theme.style.figure, className)} style={theme.figureStyle}>
      {promotion.headline}
      {promotion.suffix && (
        <span className={cn("mt-[0.12em] rounded-lg px-2 py-1 text-[0.3em] leading-none", theme.style.tag)}>{promotion.suffix === "off" ? "OFF" : "FREE"}</span>
      )}
    </p>
  );
}

/**
 * How to redeem it: the promo code in a dashed box with a copy button, on every offer. For an offer the bag applies
 * by itself (or adds with Add to Cup), a note under it that typing the code isn't needed.
 */
export function RedeemBox({ promotion, theme, className }: { promotion: Promotion; theme: CardTheme; className?: string }) {
  const { style } = theme;
  const { code } = promotion;
  return (
    <div className={cn("space-y-2", className)}>
      <p className={cn("flex items-center gap-2 text-sm font-medium", style.muted)}>
        <span className="sr-only sm:not-sr-only">Code</span>
        <span className={cn("rounded-lg border-2 border-dashed px-2.5 py-1 font-mono text-base font-bold tracking-[0.14em] select-all", style.code)}>
          {code}
        </span>
        <CopyCodeButton code={code} className={cn("-ml-1 max-sm:size-11", style.copy)} />
      </p>
      {promotion.redeem.type !== "code" && (
        <p className={cn("flex items-start gap-2 text-sm leading-snug", style.muted)}>
          <Ticket className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">No code needed</span>
            <span className="block text-[0.8125rem]">Tap it under Available offers in your bag</span>
          </span>
        </p>
      )}
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const endDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Colombo" });

/** The current time, updated every `everyMs` while the page is open. */
function useNow(everyMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** When it ends: "Ends 31 Dec 2026", with "5 days left" for the last three weeks. "No end date" without one. */
export function EndsLine({ promotion, className }: { promotion: Promotion; className?: string }) {
  const now = useNow(60_000);
  const { endsAt } = promotion;
  if (!endsAt) {
    return (
      <p className={cn("flex items-center gap-1.5 text-sm", className)}>
        <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
        No end date
      </p>
    );
  }
  const daysLeft = Math.floor((new Date(endsAt).getTime() - now.getTime()) / DAY_MS);
  const soon = daysLeft >= 0 && daysLeft <= 21;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm", className)}>
      {soon ? <Hourglass className="size-4 shrink-0" aria-hidden="true" /> : <CalendarDays className="size-4 shrink-0" aria-hidden="true" />}
      <span>
        Ends <time dateTime={endsAt}>{endDate.format(new Date(endsAt))}</time>
      </span>
      {soon && (
        <span className="rounded-full bg-sun-300 px-2 py-0.5 text-xs font-bold text-brand-950">
          {daysLeft === 0 ? "Last day!" : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
        </span>
      )}
    </p>
  );
}

/** The minimum order the admin set, so it's no surprise at checkout. Nothing when there isn't one. */
export function MinOrderLine({ promotion, className }: { promotion: Promotion; className?: string }) {
  if (promotion.minOrderValue <= 0) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-sm", className)}>
      <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
      Min. order LKR {promotion.minOrderValue.toLocaleString("en-US")}
    </p>
  );
}

/**
 * The card's action, by how the offer is redeemed (as on the old promotions page):
 * - a code: Use at checkout, with the code filled in;
 * - a code the cup applies by itself: View in cup;
 * - no code: Add to Cup (Order Now without products), which puts the offer and its products in the cup;
 * - a banner: the admin's button label, adding its product, or choosing how to order when it has none.
 */
export function PromoAction({ promotion, theme, className }: { promotion: Promotion; theme: CardTheme; className?: string }) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const { redeem, offer, banner } = promotion;
  const classes = cn(
    "group/shop inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-70",
    focusRing,
    theme.style.button,
    className,
  );
  const arrow = <ArrowRight className="size-4 transition-transform group-hover/shop:translate-x-0.5" aria-hidden="true" />;

  if (!banner && redeem.type === "code") {
    return (
      <Link data-promo-action href={`/checkout?promo=${encodeURIComponent(redeem.code)}`} aria-label={`Use ${promotion.title} at checkout`} className={classes}>
        Use at checkout
        {arrow}
      </Link>
    );
  }
  if (!banner && redeem.type === "auto") {
    return (
      <Link data-promo-action href="/cart" aria-label={`View ${promotion.title} in your cup`} className={classes}>
        View in cup
        {arrow}
      </Link>
    );
  }

  const hasProducts = offer.productIds.length > 0;
  const label = banner?.ctaLabel ?? (hasProducts ? "Add to Cup" : "Order Now");
  const act = async () => {
    if (applying) return;
    if (banner && !hasProducts) {
      openOrderModal({ allowSkip: true });
      return;
    }
    setApplying(true);
    try {
      const { shouldGoToCart } = await applyHomeOfferToCart(offer);
      if (shouldGoToCart) router.push("/cart");
    } finally {
      setApplying(false);
    }
  };
  return (
    <button type="button" data-promo-action onClick={act} disabled={applying} aria-label={`${label}: ${promotion.title}`} className={classes}>
      {label}
      {arrow}
    </button>
  );
}

/**
 * The art for a promotion, all decorative: its product photo(s) (a pair leaning in, the second behind and
 * smaller) or a mascot sticker. `className` places and sizes the box (it must be positioned, e.g. absolute with
 * insets, and have a height); images fill its height.
 */
export function PromotionArtwork({ promotion, className, sizes = "200px" }: { promotion: Promotion; className?: string; sizes?: string }) {
  const { art } = promotion;
  if (art.type === "mascot") {
    const mascot = PROMOTION_MASCOTS[art.mascot];
    return (
      <div aria-hidden="true" className={className}>
        <Image src={mascot.src} alt="" width={mascot.width} height={mascot.height} sizes={sizes} className="sticker size-full object-contain" />
      </div>
    );
  }
  const [front, back] = art.images;
  // Product photos come from the API at unknown sizes: the box sets the height and the width follows the image.
  return (
    <div aria-hidden="true" className={className}>
      {back && (
        <Image
          src={back}
          alt=""
          width={480}
          height={800}
          sizes={sizes}
          unoptimized
          className="absolute bottom-[4%] left-[2%] h-[80%] w-auto -rotate-10 object-contain drop-shadow-[0_14px_16px_rgb(15_33_71/0.28)]"
        />
      )}
      <Image
        src={front}
        alt=""
        width={480}
        height={800}
        sizes={sizes}
        unoptimized
        className={cn(
          "absolute bottom-0 h-full w-auto object-contain drop-shadow-[0_16px_18px_rgb(15_33_71/0.3)]",
          back ? "right-[2%] rotate-8" : "left-1/2 -translate-x-1/2 rotate-6",
        )}
      />
    </div>
  );
}

/**
 * A section's centred heading: the site's pill eyebrow, then the heading with a yellow highlighter swipe behind
 * the highlighted words (as on the homepage), then an optional intro line. OffersReveal plays it in.
 */
export function SectionHeading({
  id,
  eyebrow,
  heading,
  intro,
  className,
}: {
  id: string;
  eyebrow: ReactNode;
  heading: (highlight: (chunks: ReactNode) => ReactNode) => ReactNode;
  intro?: ReactNode;
  className?: string;
}) {
  const highlight = (chunks: ReactNode) => (
    <span className="relative isolate inline-block px-[0.12em] text-brand-700">
      {chunks}
      <span aria-hidden="true" data-reveal-highlight className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.45em] -rotate-2 rounded-full bg-sun-300" />
    </span>
  );
  return (
    <header data-reveal className={cn("mx-auto max-w-2xl text-center", className)}>
      <p className="inline-block rounded-full bg-brand-50 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-black uppercase ring-1 ring-brand-100 sm:text-sm">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="font-display mt-4 text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.05] font-semibold tracking-[-0.01em] text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.12em]"
      >
        {heading(highlight)}
      </h2>
      {intro && <p className="mt-3 text-base text-slate-600 sm:text-lg">{intro}</p>}
    </header>
  );
}
