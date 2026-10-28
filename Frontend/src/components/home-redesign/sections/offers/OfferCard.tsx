"use client";

import { ArrowRight, CalendarDays } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyHomeOfferToCart } from "@/lib/applyHomeOffer";
import { Button } from "@/components/home-redesign/ui/Button";
import { cn } from "@/components/home-redesign/lib/cn";
import { CopyCodeButton } from "./CopyCodeButton";
import { formatOfferDate, type Offer } from "./offers.data";

const themes = {
  blue: {
    card: "bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-700))] text-snow hover:shadow-brand-900/25",
    blob: "bg-white/10",
    dashedRing: "border-white/25",
    discount: "text-snow",
    body: "text-snow/80",
    divider: "border-white/30",
    coupon: "border-white/50 bg-white/10 text-snow",
    copy: "text-snow/80 hover:bg-white/15 hover:text-snow focus-visible:outline-white",
    muted: "text-snow/75",
    button: "inverse",
  },
  pale: {
    card: "bg-brand-50 text-brand-950 ring-1 ring-brand-100 ring-inset hover:shadow-brand-900/10",
    blob: "bg-brand-100/70",
    dashedRing: "border-brand-200",
    discount: "text-brand-600",
    body: "text-slate-600",
    divider: "border-brand-200",
    coupon: "border-brand-300 bg-white text-brand-700",
    copy: "text-brand-600 hover:bg-brand-100 hover:text-brand-700 focus-visible:outline-brand-600",
    muted: "text-slate-500",
    button: "primary",
  },
} as const;

/**
 * How the product image(s) are posed. The second image's offsets are fractions of the main image's
 * height (--img-h), so a pair keeps its shape at any card size. A single image uses `stack.main`.
 * - stack: the second sits lower and smaller, tilted away; suits two different products.
 * - cheers: both lean in until their tops meet, like a toast; suits two of the same drink.
 */
const pairs = {
  stack: {
    main: "rotate-6 group-hover:rotate-3",
    second:
      "top-[calc(var(--pad)+var(--img-h)*0.16)] right-[calc(var(--u)*6+var(--img-h)*0.48)] h-[calc(var(--img-h)*0.82)] -rotate-8 group-hover:-rotate-4",
  },
  cheers: {
    main: "-rotate-10 group-hover:-rotate-14",
    second:
      "top-[calc(var(--pad)+var(--img-h)*0.05)] right-[calc(var(--u)*6+var(--img-h)*0.54)] h-[calc(var(--img-h)*0.94)] rotate-10 group-hover:rotate-14",
  },
} as const;

function Sparkle({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("absolute fill-sun-400", className)}>
      <path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12C6.2 11.4 11.4 6.2 12 0z" />
    </svg>
  );
}

/**
 * Coupon-style promo card rendered purely from offer data. Optional fields (coupon code, expiry,
 * image) simply drop out when an admin leaves them empty. The button applies the promotion to the cart
 * (adding its product where it has one) and goes to the cart when it was applied.
 *
 * It is a three-row subgrid (copy, tear line, footer) of the offers grid, so cards side by side share
 * row heights: their tear lines and buttons line up even when only one has a coupon code. The parent
 * grid must leave three rows per card (see OffersSection).
 *
 * Padding, type, the product image and the decorations scale with the card's width, so one design
 * works from a ~290px column in a row of three up to a ~700px stacked card. A subgrid can't be a size
 * container itself (containment breaks subgrid), so the parent grid supplies the card width as `--cw`
 * in its own container's cqw, and `--u` is 1% of it. Both stay unresolved until used in the children.
 *
 * Phones (below sm) get a compact ticket with everything still on it: the expiry moves up under the
 * title, and the code and a compact button share one row at the bottom. The description and tear line
 * are left out there to keep it short, and the copy button is a full 44px tap target. The copy keeps
 * clear of the product image(s) and always reaches below it, so the bottom row never overlaps a product.
 */
export function OfferCard({ offer }: { offer: Offer }) {
  const t = themes[offer.theme];
  const pair = pairs[offer.secondImage ? (offer.imagePair ?? "stack") : "stack"];
  const router = useRouter();
  const [applying, setApplying] = useState(false);

  const claim = async () => {
    if (applying) return;
    setApplying(true);
    try {
      const { shouldGoToCart } = await applyHomeOfferToCart(offer.source);
      if (shouldGoToCart) router.push("/cart");
    } finally {
      setApplying(false);
    }
  };

  return (
    <article
      data-offers-card
      className={cn(
        // Transitions only what hover changes, so OffersMotion's transform/opacity tweens aren't eased again.
        "group relative isolate row-span-3 grid grid-rows-subgrid gap-y-0 overflow-hidden rounded-[2rem] transition-[translate,box-shadow] duration-300 [--u:calc(var(--cw,100cqw)/100)] [--pad:clamp(1.25rem,calc(var(--u)*6),2.5rem)] [--img-h:clamp(7rem,calc(var(--u)*32),14rem)] hover:-translate-y-1 hover:shadow-xl",
        t.card,
      )}
    >
      {/* Decorative graphics: a soft blob, a dashed orbit around the product and two yellow sparkles. */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute -top-[clamp(4rem,calc(var(--u)*18),6rem)] -right-[clamp(4rem,calc(var(--u)*18),6rem)] -z-10 size-[clamp(14rem,calc(var(--u)*60),20rem)] rounded-full",
          t.blob,
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "absolute top-[calc(var(--pad)+0.5rem)] right-[calc(var(--u)*3)] -z-10 size-(--img-h) rounded-full border-2 border-dashed",
          t.dashedRing,
        )}
      />
      <Sparkle className="top-[calc(var(--u)*6)] right-[45%] size-[clamp(0.75rem,calc(var(--u)*3.5),1rem)]" />
      <Sparkle className="top-[45%] right-[calc(var(--u)*5)] size-[clamp(1rem,calc(var(--u)*5),1.5rem)]" />

      {/* The optional second product sits behind and left of the first (see `pairs`). */}
      {offer.secondImage && (
        <Image
          src={offer.secondImage.src}
          alt={offer.secondImage.alt}
          width={offer.secondImage.width}
          height={offer.secondImage.height}
          sizes="120px"
          unoptimized
          data-offers-product
          className={cn(
            "absolute w-auto drop-shadow-[0_14px_16px_rgb(15_33_71/0.25)] transition-[rotate] duration-300",
            pair.second,
          )}
        />
      )}
      {offer.image && (
        <Image
          src={offer.image.src}
          alt={offer.image.alt}
          width={offer.image.width}
          height={offer.image.height}
          sizes="140px"
          unoptimized
          data-offers-product
          className={cn(
            "absolute top-(--pad) right-[calc(var(--u)*6)] h-(--img-h) w-auto drop-shadow-[0_14px_16px_rgb(15_33_71/0.25)] transition-[rotate] duration-300",
            pair.main,
          )}
        />
      )}

      {/* Right padding keeps the copy clear of the product image(s). On phones it is worked out from the image
          size (the widest pair reaches about one image height in from its right offset), and the block is
          at least as tall as the image, so the code-and-button row below always clears it. */}
      <div className="p-(--pad) pr-[34%] max-sm:min-h-[calc(var(--pad)+var(--img-h)+0.5rem)] max-sm:pr-[calc(var(--u)*6+var(--img-h)+0.5rem)] max-sm:pb-3">
        <p
          className={cn(
            "font-display-condensed flex flex-wrap items-start gap-x-2 text-[clamp(2.25rem,calc(var(--u)*12.5),5.5rem)] leading-[0.9] uppercase",
            t.discount,
          )}
        >
          {offer.discount}
          {offer.discountSuffix && (
            <span className="mt-[0.15em] rounded-lg bg-sun-300 px-2 py-0.5 text-[0.32em] leading-none text-brand-800">
              {offer.discountSuffix}
            </span>
          )}
        </p>
        <h3 className="mt-[clamp(0.75rem,calc(var(--u)*4),1.25rem)] text-[clamp(1.125rem,calc(var(--u)*5),1.5rem)] leading-snug font-semibold max-sm:mt-2">
          {offer.title}
        </h3>
        {offer.description && (
          <p className={cn("mt-2 text-[clamp(0.875rem,calc(var(--u)*3.6),1rem)] leading-relaxed max-sm:hidden", t.body)}>
            {offer.description}
          </p>
        )}
        {/* Phones show the expiry here, beside the product, as the shorter "Ends …" so it stays on one line. */}
        {offer.endsAt && (
          <p className={cn("mt-1.5 flex items-center gap-1.5 text-sm sm:hidden", t.muted)}>
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Ends <time dateTime={offer.endsAt}>{formatOfferDate(offer.endsAt)}</time>
            </span>
          </p>
        )}
      </div>

      {/* Ticket tear line: dashed divider with notches cut into both edges (they match the white page).
          Each notch is centred on the card's edge: one padding plus half its own width out. */}
      <div aria-hidden="true" className={cn("relative mx-(--pad) border-t-2 border-dashed max-sm:hidden", t.divider)}>
        <span className="absolute -top-4 -left-[calc(var(--pad)+1rem)] size-8 rounded-full bg-white" />
        <span className="absolute -top-4 -right-[calc(var(--pad)+1rem)] size-8 rounded-full bg-white" />
      </div>

      {/* Full-width button pinned to the bottom (mt-auto), so it lines up across the row whatever sits above it.
          Phones put the code and the button side by side instead (with no code, the button fills the row);
          on the narrowest phones the button wraps onto its own full-width line. */}
      <div className="flex flex-col gap-5 px-(--pad) pt-5 pb-(--pad) max-sm:flex-row max-sm:flex-wrap max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:pt-0">
        <div className={cn("flex flex-col gap-2", !offer.couponCode && "max-sm:hidden")}>
          {offer.couponCode && (
            <p className={cn("flex items-center gap-2 text-sm font-medium max-sm:gap-1.5", t.muted)}>
              <span className="max-sm:sr-only">Use code</span>
              <span
                className={cn(
                  "rounded-lg border border-dashed px-2.5 py-1 font-mono text-base font-bold tracking-[0.15em] select-all max-sm:px-2 max-sm:tracking-[0.1em]",
                  t.coupon,
                )}
              >
                {offer.couponCode}
              </span>
              <CopyCodeButton code={offer.couponCode} className={cn("-ml-1 max-sm:size-11", t.copy)} />
            </p>
          )}
          {offer.endsAt && (
            <p className={cn("flex items-center gap-1.5 text-sm max-sm:hidden", t.muted)}>
              <CalendarDays className="size-4" aria-hidden="true" />
              Valid until <time dateTime={offer.endsAt}>{formatOfferDate(offer.endsAt)}</time>
            </p>
          )}
        </div>
        <Button
          onClick={() => void claim()}
          disabled={applying}
          variant={t.button}
          className="mt-auto w-full justify-center max-sm:mt-0 max-sm:w-auto max-sm:grow max-sm:px-4"
        >
          {applying ? "Adding..." : offer.ctaLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
