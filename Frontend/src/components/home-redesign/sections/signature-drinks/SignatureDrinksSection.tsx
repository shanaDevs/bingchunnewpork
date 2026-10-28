"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/home-redesign/ui/Button";
import { Container } from "@/components/home-redesign/ui/Container";
import { isProductComingSoon, isProductInStock } from "@/lib/productAvailability";
import { resolveProductImageUrl } from "@/lib/productImageUrl";
import type { Product } from "@/types";
import { DrinkMarquee } from "./DrinkMarquee";
import { SignatureDrinksMotion } from "./SignatureDrinksMotion";

/** How many popular products ride the carousel. */
const MAX_CARDS = 10;

type ShowcaseDrink = {
  name: string;
  src: string;
  width: number;
  height: number;
};

// Shown only while the popular products load, or if none are tagged Popular: cut-outs from the menu,
// with no price or rating, each linking to the full menu.
const showcaseDrinks: ShowcaseDrink[] = [
  { name: "Mango Pomelo Sago", src: "/images/products/Mango-Pomelo-Sago.png", width: 463, height: 800 },
  { name: "Blueberry Sundae", src: "/images/products/Blueberry-Sundae-360.png", width: 426, height: 800 },
  { name: "Strawberry Lemon Tea", src: "/images/products/Strawberry-Lemon-Tea-700ml.png", width: 336, height: 800 },
  { name: "Chocolate Oreo Sundae", src: "/images/products/Chocolate-Oreo-Sundae-360.png", width: 493, height: 800 },
  { name: "Strawberry Milkshake", src: "/images/products/Strawberry-Milkshake-500u.png", width: 553, height: 800 },
  { name: "Brown Sugar Boba Sundae", src: "/images/products/Brown-Black-Sugar-Boba-Sundae-360.png", width: 462, height: 800 },
  { name: "Grape Bobo Tea", src: "/images/products/Grape-Bobo-Tea-700ml.png", width: 356, height: 800 },
  { name: "Mulberry Milkshake", src: "/images/products/Mulberry-Milkshake.png", width: 487, height: 800 },
];

const formatLkr = (price: number) => `LKR ${price.toLocaleString("en-US")}`;

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 fill-sun-400">
      <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
    </svg>
  );
}

/**
 * Bing Chun pops out of the hovered card's top-left corner: it springs up and out from inside the card
 * with a slight overshoot, then sways while the card stays hovered. The enter timing sits on the
 * group-hover classes and a quicker exit on the base ones, so it pops in but tucks away briskly. The short
 * enter delay keeps cards drifting under a still cursor from flashing it. It only pokes ~12px above the card,
 * since the marquee's edge mask clips anything past its py-8 (less the card's 8px hover lift).
 * Pausing (rather than removing) the sway on mouse-out stops it snapping upright while it fades away.
 * Every hover style has a `data-spotlight` twin: below lg, where there is no hover, DrinkMarquee spotlights
 * one card at a time (the one passing the centre, or the one tapped).
 */
function HoverMascot() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -top-3 -left-3 z-20 w-13 origin-bottom-right translate-x-3 translate-y-4 scale-50 rotate-12 opacity-0 transition duration-200 ease-in group-hover:translate-0 group-hover:scale-100 group-hover:-rotate-6 group-hover:opacity-100 group-hover:delay-75 group-hover:duration-500 group-hover:ease-[cubic-bezier(0.34,1.56,0.64,1)] group-data-spotlight:translate-0 group-data-spotlight:scale-100 group-data-spotlight:-rotate-6 group-data-spotlight:opacity-100 group-data-spotlight:delay-75 group-data-spotlight:duration-500 group-data-spotlight:ease-[cubic-bezier(0.34,1.56,0.64,1)] sm:w-14"
    >
      <Image
        src="/images/mascot-hover.png"
        alt=""
        width={463}
        height={594}
        sizes="56px"
        className="sticker block h-auto w-full origin-bottom animate-mascot-sway [animation-play-state:paused] group-hover:[animation-play-state:running] group-data-spotlight:[animation-play-state:running]"
      />
    </div>
  );
}

const cardClass =
  "group relative flex w-64 shrink-0 flex-col rounded-3xl bg-brand-50 p-4 ring-1 ring-brand-100 transition duration-300 hover:-translate-y-2 hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-900/20 hover:ring-brand-600 data-spotlight:-translate-y-2 data-spotlight:bg-brand-600 data-spotlight:shadow-xl data-spotlight:shadow-brand-900/20 data-spotlight:ring-brand-600 sm:w-72";
const nameClass =
  "text-lg font-semibold text-brand-950 transition-colors duration-300 group-hover:text-snow group-data-spotlight:text-snow";
// mt-auto keeps the buttons level across cards whose names wrap onto two lines.
// On the blue card the button turns white, like the inverse variant (its own hover is stacked so it wins).
const cardButtonClass =
  "mt-auto w-full justify-center group-hover:bg-white group-hover:text-brand-700 group-hover:hover:bg-brand-50 group-data-spotlight:bg-white group-data-spotlight:text-brand-700";
const imageShadow = "drop-shadow-[0_10px_12px_rgb(15_33_71/0.2)] transition-transform duration-300 group-hover:scale-105 group-data-spotlight:scale-105";

/**
 * Fixed-width card for a menu product. Hovering one lifts it and fills it with brand blue; the text and
 * button flip to white so they stay readable, and the mascot pops out of the top-left corner.
 * Below lg the same look comes from `data-spotlight`, set by DrinkMarquee (touch screens have no hover).
 * Order Now hands the product to the page, which opens the order setup or the product drawer.
 */
function ProductCard({ product, onOrder }: { product: Product; onOrder: (product: Product) => void }) {
  const src = resolveProductImageUrl(product.imageUrl);
  const inStock = isProductInStock(product);
  const unavailableLabel = isProductComingSoon(product) ? "Coming Soon" : "Out of Stock";
  const rating = product.avgRating;

  return (
    <article className={cardClass}>
      <HoverMascot />
      {rating != null && rating > 0 && (
        <p className="absolute top-4 right-4 z-10 flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-brand-950 shadow-sm">
          <StarIcon />
          {rating.toFixed(1)}
          <span className="sr-only">out of 5 stars</span>
        </p>
      )}
      {/* Fixed-height stage keeps every product the same height, whatever its cut-out width. */}
      <div className="flex h-64 items-end justify-center px-6 pt-8 sm:h-72">
        <div className="relative size-full">
          {src ? (
            <Image
              src={src}
              alt={product.name}
              fill
              unoptimized
              sizes="(min-width: 1024px) 160px, 140px"
              className={`object-contain object-bottom ${imageShadow}`}
            />
          ) : (
            <span aria-hidden="true" className="grid size-full place-items-center text-7xl">
              🧋
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col px-2 pt-5 pb-2">
        <h3 className={nameClass}>{product.name}</h3>
        <p className="font-numeric mt-1 mb-5 font-bold text-brand-600 transition-colors duration-300 group-hover:text-brand-100 group-data-spotlight:text-brand-100">
          {formatLkr(product.basePrice)}
        </p>
        <Button onClick={() => onOrder(product)} disabled={!inStock} className={cardButtonClass}>
          {inStock ? "Order Now" : unavailableLabel}
        </Button>
      </div>
    </article>
  );
}

/** Stand-in card from the static cut-outs, used until real products are available. */
function ShowcaseCard({ name, src, width, height }: ShowcaseDrink) {
  return (
    <article className={cardClass}>
      <HoverMascot />
      <div className="flex h-64 items-end justify-center px-6 pt-8 sm:h-72">
        <Image
          src={src}
          alt={name}
          width={width}
          height={height}
          sizes="(min-width: 1024px) 160px, 140px"
          className={`h-full w-auto object-contain ${imageShadow}`}
        />
      </div>
      <div className="flex flex-1 flex-col px-2 pt-5 pb-2">
        <h3 className={`${nameClass} mb-5`}>{name}</h3>
        <Button href="/menu" className={cardButtonClass}>
          View Menu
        </Button>
      </div>
    </article>
  );
}

type SignatureDrinksSectionProps = {
  /** Popular products from the menu API, already sorted by stock. */
  products: Product[];
  onOrder: (product: Product) => void;
};

/**
 * Shopping-focused carousel of the menu's Popular products, each with a price and an order button,
 * closed by a link to the full menu.
 * SignatureDrinksMotion reveals the header, cards and CTA on scroll; the `data-favourites-*` attributes are its hooks.
 */
export function SignatureDrinksSection({ products, onOrder }: SignatureDrinksSectionProps) {
  const shown = products.slice(0, MAX_CARDS);
  // Changes whenever the card set does, so the reveal and the marquee re-measure the new cards.
  const contentKey = shown.length > 0 ? shown.map((p) => p.id).join(",") : "showcase";

  return (
    // Starts on brand-50 (where the brand statement's gradient ends) and fades to white, so there is no seam.
    // Top padding stays small because the brand statement above already ends with deep bottom padding.
    <SignatureDrinksMotion
      contentKey={contentKey}
      className="bg-[linear-gradient(to_bottom,var(--color-brand-50),white_16rem)] pt-2 pb-20 sm:pt-4 sm:pb-24 lg:pt-6 lg:pb-28"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p
            data-favourites-eyebrow
            className="inline-block rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold tracking-[0.2em] text-black uppercase ring-1 ring-brand-100">
            Signature Favourites
          </p>
          {/* Same type treatment as the brand statement heading above. */}
          <h2
            data-favourites-heading
            className="font-display mt-5 font-semibold [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em] text-[clamp(2.5rem,5.5vw,4.25rem)] leading-[1.1] tracking-[-0.01em] text-black uppercase">
            Find Your Next{" "}
            {/* Tilted highlighter swipe behind the last word. `isolate` keeps it behind the text only. */}
            <span className="relative isolate inline-block px-[0.12em] text-brand-700">
              <span
                aria-hidden="true"
                data-favourites-highlight
                className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.5em] -rotate-2 rounded-full bg-sun-300"
              />
              Favourite
            </span>
          </h2>
        </div>
      </Container>

      {/* Full-bleed, outside the container, so cards drift in from the very edge of the screen.
          The marquee's own py-8 adds to this margin. */}
      <DrinkMarquee contentKey={contentKey} className="mt-4 lg:mt-8">
        {/* The reveal animates this wrapper rather than the card, whose own hover transitions would fight it.
            `flex` lets the card stretch to the row's height, so every card matches the tallest (two-line names). */}
        {shown.length > 0
          ? shown.map((product) => (
              <div key={product.id} data-favourites-card className="flex shrink-0">
                <ProductCard product={product} onOrder={onOrder} />
              </div>
            ))
          : showcaseDrinks.map((drink) => (
              <div key={drink.name} data-favourites-card className="flex shrink-0">
                <ShowcaseCard {...drink} />
              </div>
            ))}
      </DrinkMarquee>

      {/* The marquee's py-8 already spaces this from the cards. */}
      <Container>
        <div data-favourites-cta className="mt-4 flex justify-center lg:mt-6">
          <Button href="/menu" className="group px-7 py-3.5 text-base">
            Explore Menu
            <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Button>
        </div>
      </Container>
    </SignatureDrinksMotion>
  );
}
