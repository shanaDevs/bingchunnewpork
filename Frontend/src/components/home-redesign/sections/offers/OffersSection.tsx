"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Container } from "@/components/home-redesign/ui/Container";
import { useHomeOffers } from "@/hooks/useHomeOffers";
import { OfferCard } from "./OfferCard";
import { OffersMotion } from "./OffersMotion";
import { toOffer } from "./offers.data";

/** Cards shown on the home page; the rest are on the promotions page. */
const MAX_OFFERS = 6;

/**
 * The live home promotions (the same ones the app's offers slider used, for the chosen store), drawn
 * as coupon cards rather than uploaded posters. The whole section disappears when there are none.
 */
export function OffersSection() {
  const homeOffers = useHomeOffers();
  const activeOffers = useMemo(() => homeOffers.slice(0, MAX_OFFERS).map(toOffer), [homeOffers]);
  if (activeOffers.length === 0) return null;

  return (
    // Top padding stays small because the video section above already ends with deep bottom padding.
    // OffersMotion reveals the header and cards on scroll; the `data-offers-*` attributes are its hooks.
    <OffersMotion
      contentKey={activeOffers.map((offer) => offer.id).join(",")}
      aria-labelledby="offers-heading"
      className="bg-white pt-4 pb-24 sm:pb-28 lg:pb-32">
      <Container>
        {/* Centred like the favourites header above. */}
        <div data-offers-header className="mx-auto max-w-2xl text-center">
          <p data-offers-eyebrow className="inline-block rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold tracking-[0.2em] text-black uppercase ring-1 ring-brand-100">
            Exclusive Deals
          </p>
          {/* Same treatment as the favourites heading above: black type, blue highlighted word. */}
          <h2
            id="offers-heading"
            data-offers-heading
            className="font-display mt-5 font-semibold [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em] text-[clamp(2.5rem,5.5vw,4.25rem)] leading-[1.1] tracking-[-0.01em] text-black uppercase"
          >
            A Little More to{" "}
            <span className="relative isolate inline-block px-[0.12em] text-brand-700">
              <span
                aria-hidden="true"
                data-offers-highlight
                className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.5em] -rotate-2 rounded-full bg-sun-300"
              />
              Love.
            </span>
          </h2>
          <Link
            href="/promotions"
            data-offers-link
            className="group mt-5 inline-flex items-center gap-2 font-semibold text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
          >
            View All Offers
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        {/* Each card spans three rows and subgrids them (see OfferCard), so the cards in a row align.
            The wrapper is the size container the cards scale against; `--cw` is one card's width
            (keep its 3rem in step with the two gap-6 gaps). A row gap would land inside the cards'
            subgrid rows, so rows of cards are spaced with a top margin instead. */}
        <div className="mt-12 @container lg:mt-14">
          <div className="grid gap-x-6 [--cw:100cqw] max-lg:[&>article+article]:mt-6 max-sm:[&>article+article]:mt-4 lg:grid-cols-3 lg:[--cw:calc((100cqw-3rem)/3)] lg:[&>article:nth-child(n+4)]:mt-6">
            {activeOffers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        </div>
      </Container>
    </OffersMotion>
  );
}
