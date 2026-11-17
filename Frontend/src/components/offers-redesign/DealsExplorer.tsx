"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { revealSpeed } from "@/components/home-redesign/config/motion";
import { Container } from "@/components/home-redesign/ui/Container";
import { Flip, gsap, ScrollTrigger, useGSAP } from "./gsap";
import { focusRing, SectionHeading } from "./parts";
import { matchesFilter, PROMOTION_FILTERS, type Promotion, type PromotionFilter } from "./promotion";
import { PromoCard } from "./PromoCard";
import { DealSheet, PromoRow } from "./PromoRow";

const FILTER_LABELS: Record<PromotionFilter, string> = {
  all: "All",
  discounts: "Discounts",
  freebies: "Freebies",
  delivery: "Delivery",
  limited: "Limited Time",
};

/** How far (px) a card travels as it floats in. */
const RISE = 48;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dealCount = (count: number) => `${count} ${count === 1 ? "deal" : "deals"}`;

/**
 * The filter tabs: All, Discounts, Freebies, Delivery and Limited Time, as toggle buttons. From 640px they sit in
 * one bar with a blue pill sliding behind the chosen one; phones show them as separate chips, wrapping onto a
 * second line so every one is in view at once (the chosen chip turns blue).
 */
function FilterBar({ filter, onChange }: { filter: PromotionFilter; onChange: (filter: PromotionFilter) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // Keep the pill on the chosen button, also when the row's size changes (fonts load, resize).
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const place = () => {
      const button = row.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (button) setPill({ left: button.offsetLeft, width: button.offsetWidth });
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(row);
    return () => resize.disconnect();
  }, [filter]);

  return (
    <div>
      <div
        ref={rowRef}
        role="group"
        aria-label="Filter deals"
        className="relative flex flex-wrap justify-center gap-2 sm:mx-auto sm:w-max sm:flex-nowrap sm:gap-1 sm:rounded-full sm:bg-brand-50 sm:p-1.5 sm:ring-1 sm:ring-brand-100"
      >
        {pill && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 bottom-1.5 rounded-full bg-brand-600 shadow-[0_8px_18px_-6px_rgb(31_98_214/0.6)] transition-[left,width] duration-400 ease-[cubic-bezier(0.34,1.3,0.64,1)] max-sm:hidden"
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {PROMOTION_FILTERS.map((id) => {
          const active = id === filter;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(id)}
              className={cn(
                "relative z-10 inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors sm:px-5",
                focusRing,
                "focus-visible:outline-brand-600",
                active ? "text-snow" : "text-brand-900 hover:text-brand-600",
                // Phones: each a chip of its own.
                active
                  ? "max-sm:bg-brand-600 max-sm:shadow-[0_8px_18px_-6px_rgb(31_98_214/0.6)]"
                  : "max-sm:bg-brand-50 max-sm:ring-1 max-sm:ring-brand-100 max-sm:ring-inset",
              )}
            >
              {FILTER_LABELS[id]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Placeholder cards in the bento's shapes while the deals load. */
function DealsSkeleton() {
  const shapes = [LOOK_SPANS.poster, "", LOOK_SPANS.wide, "", LOOK_SPANS.poster, LOOK_SPANS.wide];
  return (
    <div aria-hidden="true" className="mt-6 grid gap-3 sm:grid-flow-dense sm:grid-cols-2 sm:gap-5 lg:mt-8 lg:grid-cols-4">
      {shapes.map((span, i) => (
        <div key={i} className={cn("min-h-32 animate-pulse rounded-2xl bg-brand-50 sm:min-h-72 sm:rounded-[1.75rem]", span)} />
      ))}
    </div>
  );
}

/**
 * Discover Your Deals: the heading, the filter tabs and the grid of the admin's live promotions.
 *
 * The grid is a bento: four columns on desktop, two on tablets; posters run two rows tall and wide tickets (and
 * banners) two columns wide (LOOK_SPANS), packed densely so filtering leaves no holes where it can. Phones get a
 * list of compact coupons instead (PromoRow), each opening the full card in a sheet (DealSheet); banners show in
 * full there too. Every deal stays rendered; the ones outside the filter are `hidden`.
 *
 * Filtering animates with GSAP: the cards that are leaving shrink away first, then the rest glide to their new
 * places (Flip) and the arriving ones pop in. Cards float in as they scroll into view, including ones that turn up
 * later when the admin adds an offer. Instant under reduced motion. The count is announced politely.
 */
export function DealsExplorer({
  promotions,
  status,
  onRetry,
}: {
  promotions: Promotion[];
  status: "pending" | "error" | "success";
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<PromotionFilter>("all");
  /** The deal open in the sheet (phones), by id so it follows the latest data (and closes if the offer ends). */
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const details = promotions.find((promotion) => promotion.id === detailsId) ?? null;
  const gridRef = useRef<HTMLDivElement>(null);
  /** The layout before a filter change, for Flip to animate from once the new one renders. */
  const flipState = useRef<Flip.FlipState | null>(null);
  const busy = useRef(false);
  /** Cards already floated in, so a data refresh only animates the new ones. */
  const revealed = useRef(new Set<string>());
  const shown = promotions.filter((promotion) => matchesFilter(promotion, filter));
  const idsKey = promotions.map((promotion) => promotion.id).join("|");

  const cards = () => Array.from(gridRef.current?.querySelectorAll<HTMLElement>("[data-promo-card]") ?? []);

  const choose = (next: PromotionFilter) => {
    if (next === filter || busy.current) return;
    if (reducedMotion()) return setFilter(next);
    busy.current = true;
    const visible = cards().filter((card) => !card.hidden);
    const leaving = visible.filter((card) => {
      const promotion = promotions[Number(card.dataset.index)];
      return !promotion || !matchesFilter(promotion, next);
    });
    const swap = () => {
      flipState.current = Flip.getState(visible.filter((card) => !leaving.includes(card)));
      setFilter(next);
    };
    if (leaving.length === 0) return swap();
    gsap.to(leaving, { opacity: 0, scale: 0.88, duration: 0.22, ease: "power2.in", onComplete: swap });
  };

  // After the new filter renders: glide the cards that stayed from where they were, pop the new ones in.
  useGSAP(
    () => {
      const state = flipState.current;
      if (!state) return;
      flipState.current = null;
      const arriving = cards().filter((card) => !card.hidden && !state.elementStates.some((el) => el.element === card));
      gsap.set(arriving, { opacity: 0 });
      Flip.from(state, {
        duration: 0.55,
        ease: "power3.inOut",
        onComplete: () => {
          busy.current = false;
          ScrollTrigger.refresh();
        },
      });
      if (arriving.length) {
        gsap.fromTo(
          arriving,
          { opacity: 0, scale: 0.85, y: 24 },
          { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.6)", delay: 0.2, stagger: 0.06, clearProps: "transform" },
        );
      } else busy.current = false;
    },
    { dependencies: [filter], scope: gridRef },
  );

  // As deals arrive (first load, or an offer the admin adds later): float the new cards in a row at a time as they
  // scroll into view, and start the posters' sunbursts turning.
  useGSAP(
    () => {
      const fresh = cards().filter((card) => !revealed.current.has(card.dataset.id ?? ""));
      fresh.forEach((card) => revealed.current.add(card.dataset.id ?? ""));
      if (fresh.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const speed = revealSpeed();
        // Cards still hidden by the filter don't take part; the filter pops those in itself when it shows them.
        const visible = fresh.filter((card) => !card.hidden);
        gsap.set(visible, { y: RISE, opacity: 0 });
        ScrollTrigger.batch(visible, {
          start: "top 90%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, { y: 0, opacity: 1, duration: 0.8 / speed, ease: "power3.out", stagger: 0.1 / speed, clearProps: "transform,opacity" }),
        });
        fresh.forEach((card) => {
          gsap.to(card.querySelectorAll("[data-offers-spin]"), { rotation: 360, duration: 70, ease: "none", repeat: -1 });
        });
      });
      // The page grew: let every scroll trigger below re-measure.
      ScrollTrigger.refresh();
    },
    { dependencies: [idsKey], scope: gridRef },
  );

  return (
    <section id="deals" aria-labelledby="deals-heading" className="scroll-mt-20 bg-white pt-6 pb-20 sm:pt-10 sm:pb-24 lg:pb-28">
      <Container>
        <SectionHeading id="deals-heading" eyebrow="All the good stuff" heading={(highlight) => <>Discover Your {highlight("Deals")}</>} />

        <div data-reveal className="mt-8 sm:mt-10">
          <FilterBar filter={filter} onChange={choose} />
          {/* How many match, for screen readers only (announced as the filter changes). */}
          <p aria-live="polite" className="sr-only">
            {status === "success" ? dealCount(shown.length) : ""}
          </p>
        </div>

        {status === "pending" && <DealsSkeleton />}

        <div ref={gridRef} className="mt-6 grid gap-3 sm:grid-flow-dense sm:grid-cols-2 sm:gap-5 lg:mt-8 lg:grid-cols-4">
          {promotions.map((promotion, i) => (
            // The box is what the filter hides, moves and animates (`data-promo-card`); the card (or, on phones, the
            // compact coupon) fills it.
            <div
              key={promotion.id}
              data-promo-card
              data-id={promotion.id}
              data-index={i}
              hidden={!matchesFilter(promotion, filter)}
              className={cn("flex", LOOK_SPANS[promotion.look])}
            >
              {promotion.look === "banner" ? (
                <PromoCard promotion={promotion} className="w-full" />
              ) : (
                <>
                  <PromoRow promotion={promotion} onOpen={() => setDetailsId(promotion.id)} className="w-full sm:hidden" />
                  <PromoCard promotion={promotion} className="w-full max-sm:hidden" />
                </>
              )}
            </div>
          ))}
        </div>

        {status === "error" && promotions.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-brand-50 px-5 py-4 text-center text-slate-600 sm:flex-row sm:justify-center">
            <p>We couldn&apos;t load the deals just now.</p>
            <button
              type="button"
              onClick={onRetry}
              className={cn("cursor-pointer rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-snow transition-colors hover:bg-brand-700", focusRing, "focus-visible:outline-brand-600")}
            >
              Try again
            </button>
          </div>
        )}
        {status === "success" && shown.length === 0 && (
          <p className="mt-6 rounded-2xl bg-brand-50 px-5 py-4 text-center text-slate-600">No deals here right now. Check back soon!</p>
        )}
        {details && <DealSheet promotion={details} onClose={() => setDetailsId(null)} />}
      </Container>
    </section>
  );
}

/** Where each look sits in the grid: posters run two rows tall, wide tickets and banners two columns wide. */
const LOOK_SPANS: Record<Promotion["look"], string> = {
  poster: "sm:row-span-2",
  wide: "sm:col-span-2",
  banner: "sm:col-span-2",
  stamp: "",
};
