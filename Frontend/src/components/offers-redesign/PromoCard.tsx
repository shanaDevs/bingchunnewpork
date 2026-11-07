"use client";

import { Hourglass } from "lucide-react";
import Image from "next/image";
import { cn } from "@/components/home-redesign/lib/cn";
import type { Promotion } from "./promotion";
import { cardTheme, DealFigure, EndsLine, MinOrderLine, PromoAction, PromotionArtwork, RedeemBox, Sparkle, type CardTheme } from "./parts";

/** A scalloped stamp edge: 18 bumps round a circle on a 100×100 box. */
const SCALLOP = (() => {
  const bumps = 18;
  const r = 45;
  const point = (i: number) => {
    const angle = (i / bumps) * Math.PI * 2;
    return `${(50 + r * Math.cos(angle)).toFixed(2)} ${(50 + r * Math.sin(angle)).toFixed(2)}`;
  };
  let d = `M${point(0)}`;
  for (let i = 1; i <= bumps; i++) d += `A8.6 8.6 0 0 1 ${point(i)}`;
  return `${d}Z`;
})();

/** The "Limited time" chip, shown along the card's top when it's in that category. */
function CardTags({ promotion, className }: { promotion: Promotion; className?: string }) {
  if (!promotion.categories.includes("limited")) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-300 px-2.5 py-1 text-[0.6875rem] leading-none font-bold tracking-[0.08em] text-brand-950 uppercase">
        <Hourglass className="size-3" aria-hidden="true" />
        Limited time
      </span>
    </div>
  );
}

/** Code (or a no-code note), end date, minimum order and the action, below a dashed tear line. */
function CardFooter({ promotion, theme, inline = false }: { promotion: Promotion; theme: CardTheme; inline?: boolean }) {
  return (
    <div className={cn("mt-auto flex flex-col gap-4 border-t-2 border-dashed border-current/20 pt-5", inline && "sm:flex-row sm:flex-wrap sm:items-end sm:justify-between")}>
      <div className="space-y-2">
        <RedeemBox promotion={promotion} theme={theme} />
        <EndsLine promotion={promotion} className={theme.style.muted} />
        <MinOrderLine promotion={promotion} className={theme.style.muted} />
      </div>
      <PromoAction promotion={promotion} theme={theme} />
    </div>
  );
}

/** The card's name and description. */
function CardCopy({ promotion, theme, titleClassName }: { promotion: Promotion; theme: CardTheme; titleClassName?: string }) {
  return (
    <>
      <h3 className={cn("text-xl leading-snug font-bold", titleClassName)}>{promotion.title}</h3>
      {promotion.description ? (
        <p className={cn("mt-1.5 mb-5 text-[0.9375rem] leading-relaxed", theme.style.text)}>{promotion.description}</p>
      ) : (
        <div className="mb-5" />
      )}
    </>
  );
}

/**
 * An Upload Banner offer: the admin's banner image across the top, then its name, description, price and the
 * admin's button (Add to Bucket by default). Two columns wide in the grid, like the wide ticket.
 */
function BannerCard({ promotion, theme, className }: { promotion: Promotion; theme: CardTheme; className?: string }) {
  const banner = promotion.banner!;
  return (
    <article
      className={cn(
        "group relative isolate flex flex-col overflow-hidden rounded-[1.75rem] transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_40px_-16px_rgb(15_33_71/0.4)]",
        theme.style.card,
        className,
      )}
      style={theme.cardStyle}
    >
      <div className="relative aspect-[16/9] overflow-hidden sm:aspect-[21/9]">
        {banner.imageUrl ? (
          <Image
            src={banner.imageUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover transition-[scale] duration-500 group-hover:scale-105"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
            <span className={cn("absolute top-1/2 left-1/2 aspect-square w-[min(60%,14rem)] -translate-1/2 rounded-full", theme.style.glow)} />
            <PromotionArtwork promotion={promotion} sizes="200px" className="absolute inset-x-[25%] top-[10%] bottom-[6%]" />
          </div>
        )}
        <CardTags promotion={promotion} className="absolute inset-x-5 top-5" />
      </div>
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <h3 className="text-2xl leading-snug font-bold">{promotion.title}</h3>
          {banner.price !== undefined && (
            <p className={cn("font-display-condensed text-[clamp(2.5rem,5vw,3.25rem)] leading-[0.85] uppercase", theme.style.figure)} style={theme.figureStyle}>
              LKR {banner.price.toLocaleString("en-US")}
            </p>
          )}
        </div>
        {promotion.description ? (
          <p className={cn("mt-1.5 mb-5 text-[0.9375rem] leading-relaxed", theme.style.text)}>{promotion.description}</p>
        ) : (
          <div className="mb-5" />
        )}
        <CardFooter promotion={promotion} theme={theme} inline />
      </div>
    </article>
  );
}

/**
 * One promotion in the deals grid, in one of the compositions (`look`) so the grid never reads as a row of
 * identical coupons:
 * - poster: tall (two grid rows) with its art big on a sunburst, the figure overlapping its feet.
 * - wide: a ticket two columns wide, copy on one side, the art on the other past a perforated tear line.
 * - stamp: compact, the figure up top and the art inside a scalloped stamp in the corner.
 * - banner: the admin's Upload Banner offer (BannerCard).
 * Each wears its colours (cardTheme) and a "Limited time" chip when it's in that category.
 * Its own CSS transitions cover `translate` and shadows only, never `transform` or opacity, so GSAP tweens on
 * the box around it never fight them.
 */
export function PromoCard({ promotion, className }: { promotion: Promotion; className?: string }) {
  const theme = cardTheme(promotion);
  const { style } = theme;
  if (promotion.look === "banner") return <BannerCard promotion={promotion} theme={theme} className={className} />;

  const card = cn(
    "group relative isolate flex overflow-hidden rounded-[1.75rem] transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_40px_-16px_rgb(15_33_71/0.4)]",
    style.card,
    className,
  );

  if (promotion.look === "poster") {
    return (
      <article className={cn(card, "flex-col")} style={theme.cardStyle}>
        <div aria-hidden="true" className="relative min-h-60 flex-1 overflow-hidden">
          <div className="absolute top-[58%] left-1/2 aspect-square w-[160%] -translate-1/2">
            <span
              data-offers-spin
              className="absolute inset-0 rounded-full bg-[repeating-conic-gradient(rgb(255_255_255/0.14)_0deg_8deg,transparent_8deg_18deg)] [mask-image:radial-gradient(closest-side,#000_15%,transparent_80%)]"
            />
          </div>
          <span className={cn("absolute top-[58%] left-1/2 aspect-square w-[70%] -translate-1/2 rounded-full", style.glow)} />
          <PromotionArtwork promotion={promotion} sizes="220px" className="absolute inset-x-[10%] bottom-0 h-[min(84%,19rem)] transition-[scale] duration-500 group-hover:scale-105" />
          <Sparkle className="absolute top-[22%] left-[10%] size-5 text-sun-300" />
          <Sparkle className="absolute top-[40%] right-[9%] size-4 text-snow/80" />
        </div>
        <CardTags promotion={promotion} className="absolute inset-x-5 top-5" />
        <div className="relative flex flex-col px-6 pb-6">
          <DealFigure promotion={promotion} theme={theme} className="-mt-6 text-[clamp(4.25rem,9vw,5.75rem)]" />
          <div className="mt-3 flex flex-1 flex-col">
            <CardCopy promotion={promotion} theme={theme} titleClassName="text-2xl" />
            <CardFooter promotion={promotion} theme={theme} />
          </div>
        </div>
      </article>
    );
  }

  if (promotion.look === "wide") {
    const artFirst = promotion.artFirst;
    return (
      <article
        className={cn(card, "flex-col sm:grid", artFirst ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]" : "sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]")}
        style={theme.cardStyle}
      >
        <div className={cn("relative flex flex-col p-6 sm:p-7", artFirst && "sm:order-2")}>
          <CardTags promotion={promotion} />
          <DealFigure promotion={promotion} theme={theme} className="mt-4 text-[clamp(3.5rem,7vw,4.75rem)]" />
          <div className="mt-3 flex flex-1 flex-col">
            <CardCopy promotion={promotion} theme={theme} />
            <CardFooter promotion={promotion} theme={theme} inline />
          </div>
        </div>
        {/* The art, past a perforated tear line with notches at both ends (they match the white page). */}
        <div
          aria-hidden="true"
          className={cn(
            "relative -order-1 h-48 sm:h-auto sm:border-dashed sm:border-current/20",
            artFirst ? "sm:order-1 sm:border-r-2" : "sm:order-none sm:border-l-2",
          )}
        >
          <span className={cn("absolute -top-4 hidden size-8 rounded-full bg-white sm:block", artFirst ? "-right-4" : "-left-4")} />
          <span className={cn("absolute -bottom-4 hidden size-8 rounded-full bg-white sm:block", artFirst ? "-right-4" : "-left-4")} />
          <span className={cn("absolute top-1/2 left-1/2 aspect-square w-[min(85%,15rem)] -translate-1/2 rounded-full", style.glow)} />
          <span className="absolute top-1/2 left-1/2 aspect-square w-[min(68%,12rem)] -translate-1/2 rounded-full border-2 border-dashed border-current/20" />
          <PromotionArtwork
            promotion={promotion}
            sizes="240px"
            className="absolute inset-x-[8%] top-1/2 h-[min(82%,16rem)] -translate-y-1/2 transition-[scale,rotate] duration-500 group-hover:scale-105 group-hover:-rotate-2"
          />
          <Sparkle className="absolute top-[12%] right-[12%] size-5 text-sun-300" />
          <Sparkle className="absolute bottom-[18%] left-[10%] size-3.5 text-snow/80" />
        </div>
      </article>
    );
  }

  return (
    <article className={cn(card, "flex-col p-6")} style={theme.cardStyle}>
      <CardTags promotion={promotion} className="pr-0" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <DealFigure promotion={promotion} theme={theme} className="pt-2 text-[clamp(3.25rem,6vw,4rem)]" />
        {/* The stamp: the art inside a scalloped badge, tilted. */}
        <div aria-hidden="true" className="relative -mr-2 size-28 shrink-0 rotate-6 transition-[rotate] duration-500 group-hover:rotate-[-4deg]">
          <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
            <path d={SCALLOP} className="fill-white/25" />
            <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 4" />
          </svg>
          <PromotionArtwork promotion={promotion} sizes="120px" className="absolute inset-[10%]" />
        </div>
      </div>
      <div className="mt-2 flex flex-1 flex-col">
        <CardCopy promotion={promotion} theme={theme} />
        <CardFooter promotion={promotion} theme={theme} />
      </div>
    </article>
  );
}
