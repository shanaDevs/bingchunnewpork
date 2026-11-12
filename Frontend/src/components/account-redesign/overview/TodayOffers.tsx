"use client";

import { CalendarClock, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { openOrderModal } from "@/components/order/SiteOrderPrompt";
import { PROMOTION_MASCOTS, toPromotion, type Promotion } from "@/components/offers-redesign/promotion";
import { applyHomeOfferToCart } from "@/lib/applyHomeOffer";
import { isSpinLinkedPromo, type PromotionRules } from "@/lib/promotionTypes";
import type { PromoCode } from "@/types";
import { focusRing } from "../accountUi";
import { atMinute, colomboDay, colomboMinute, TIME_FORMAT } from "../colomboTime";
import { formatLkr } from "../orders/orderParts";
import { useLivePromos } from "./liveData";
import { panel, SectionHeading } from "./todayParts";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The most tiles shown; the rest are on the Offers page. */
const MAX_TILES = 6;

/** When an offer works today, in Sri Lanka time: now, later today, already over for today, or not today at all. */
type When = { state: "now" } | { state: "later"; from: number } | { state: "over" } | { state: "otherDay"; days: string[] };

const toMinute = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};

/**
 * The admin's day and time rules for an offer, read as the backend's checkout does (passesScheduleRules): Weekend
 * and Every Friday offers, the days of the week picked, and a start and end time (an end before the start runs
 * overnight).
 */
function whenToday(promo: PromoCode, now: Date): When {
  const kind = (promo.promotionKind ?? "").toUpperCase();
  const rules = (promo.promotionRules ?? {}) as PromotionRules;
  const days = kind === "WEEKEND" ? ["Sat", "Sun"] : kind === "EVERY_FRIDAY" ? ["Fri"] : rules.daysOfWeek?.length ? rules.daysOfWeek : null;
  if (days && !days.includes(DAY_NAMES[colomboDay(now)])) return { state: "otherDay", days };

  const start = rules.timeStart ? toMinute(rules.timeStart) : null;
  const end = rules.timeEnd ? toMinute(rules.timeEnd) : null;
  if (start === null || end === null) return { state: "now" };
  const minute = colomboMinute(now);
  if (start <= end) {
    if (minute < start) return { state: "later", from: start };
    return minute <= end ? { state: "now" } : { state: "over" };
  }
  // Overnight: on from the start until the end the next morning.
  return minute >= start || minute <= end ? { state: "now" } : { state: "later", from: start };
}

const ORDER: Record<When["state"], number> = { now: 0, later: 1, over: 2, otherDay: 3 };

/**
 * Today's offers, live: the admin's offers for the customer's branch (the Offers page's own list, GET /promos, so
 * inactive, unstarted and expired ones are already out, and Spin & Win prizes stay with the wheel), those working now
 * first, then those starting later today (with the time), then the ones over for today or for other days, greyed.
 * Each opens the Offers page, where it's used. Checked again every minute (liveData), so the admin's changes show.
 */
export function TodayOffers({ now }: { now: Date }) {
  const { data, isLoading, isError } = useLivePromos();
  const offers = useMemo(
    () =>
      (data ?? [])
        .filter((promo) => !isSpinLinkedPromo(promo))
        .map((promo, index) => ({ promotion: toPromotion(promo, index, now), when: whenToday(promo, now) }))
        .sort((a, b) => ORDER[a.when.state] - ORDER[b.when.state]),
    [data, now],
  );
  const today = offers.filter(({ when }) => when.state === "now" || when.state === "later").length;

  return (
    <section aria-labelledby="offers-heading" aria-busy={isLoading || undefined} className={cn(panel, "flex flex-col")}>
      <SectionHeading
        id="offers-heading"
        title="Today's Offers"
        subtitle="Live from our offers, for your branch."
        aside={data ? <p className="font-numeric shrink-0 text-sm font-extrabold text-brand-600">{today} today</p> : undefined}
      />

      {isLoading ? (
        <ul aria-hidden="true" className="mt-5 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <li key={index} className="h-[4.75rem] animate-pulse rounded-2xl bg-brand-50/70" />
          ))}
        </ul>
      ) : offers.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate-600 ring-1 ring-brand-100">
          {isError ? "We couldn't load today's offers. They'll show here as soon as we can reach them." : "No offers running right now. Check back soon!"}
        </p>
      ) : (
        <ul data-stagger className="mt-5 grid gap-3 sm:grid-cols-2">
          {offers.slice(0, MAX_TILES).map(({ promotion, when }) => (
            <OfferTile key={promotion.id} promotion={promotion} when={when} />
          ))}
        </ul>
      )}

      <Link href="/promotions" className={cn("mt-auto inline-flex items-center gap-1 self-start rounded pt-4 text-sm font-semibold text-brand-700 hover:underline", focusRing)}>
        {offers.length > MAX_TILES ? `See all ${offers.length} offers` : "See all offers"}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

/** How the offer is used, in a few words: the minimum order, its code, or that the bag applies it. */
function requirement(promotion: Promotion) {
  if (promotion.minOrderValue > 0) return `Min order ${formatLkr(promotion.minOrderValue)}`;
  if (promotion.redeem.type === "code") return `Code ${promotion.redeem.code}`;
  if (promotion.redeem.type === "auto") return "Applies in your bag";
  return "Add it from Offers";
}

const timeAt = (minute: number) => new Intl.DateTimeFormat("en-US", TIME_FORMAT).format(atMinute(minute));

/** One offer: its picture, the big figure, what it's on and when, and a way to it on the Offers page; greyed when not on today. */
function OfferTile({ promotion, when }: { promotion: Promotion; when: When }) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const greyed = when.state === "over" || when.state === "otherDay";
  const art = promotion.art.type === "images" ? promotion.art.images[0] : PROMOTION_MASCOTS[promotion.art.mascot].src;
  const canQuickApply = when.state === "now";

  const quickApply = async () => {
    if (applying || !canQuickApply) return;
    const { redeem, offer, banner } = promotion;
    if (!banner && redeem.type === "code") {
      router.push(`/checkout?promo=${encodeURIComponent(redeem.code)}`);
      return;
    }
    if (!banner && redeem.type === "auto") {
      router.push("/cart");
      return;
    }
    const hasProducts = offer.productIds.length > 0;
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
    <li className={cn("flex items-center gap-3 rounded-2xl p-2.5 pr-3 ring-1", greyed ? "bg-slate-50 ring-slate-200" : "bg-brand-50/60 ring-brand-100")}>
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
        {/* The offer's product photo (backend storage) or the Offers page's mascot. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} alt="" loading="lazy" decoding="async" className={cn("h-12 w-auto object-contain", greyed && "opacity-50 grayscale")} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5">
          <span className={cn("font-numeric text-lg leading-none font-extrabold", greyed ? "text-slate-500" : "text-brand-700")}>{promotion.headline}</span>
          {promotion.suffix && (
            <span className={cn("text-[0.6875rem] font-extrabold tracking-[0.08em] uppercase", greyed ? "text-slate-500" : "text-brand-700")}>{promotion.suffix}</span>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm font-bold text-brand-950">{promotion.title}</p>
        {when.state === "otherDay" ? (
          <p className="mt-0.5 flex items-start gap-1 text-xs leading-snug font-semibold text-slate-500">
            <CalendarClock className="mt-px size-3 shrink-0" aria-hidden="true" />
            <span>Not today: {when.days.join(", ")} only</span>
          </p>
        ) : when.state === "over" ? (
          <p className="mt-0.5 flex items-start gap-1 text-xs leading-snug font-semibold text-slate-500">
            <Clock className="mt-px size-3 shrink-0" aria-hidden="true" />
            <span>Over for today</span>
          </p>
        ) : when.state === "later" ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            <Clock className="size-3" aria-hidden="true" />
            From {timeAt(when.from)} today
          </p>
        ) : (
          <p className="mt-0.5 truncate text-xs text-slate-500">{requirement(promotion)}</p>
        )}
      </div>
      {canQuickApply ? (
        <button
          type="button"
          disabled={applying}
          onClick={quickApply}
          aria-label={`Apply offer: ${promotion.title}`}
          className={cn(
            "shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-snow transition-colors hover:bg-brand-700 disabled:opacity-70",
            focusRing,
          )}
        >
          {applying ? "…" : "Apply"}
        </button>
      ) : (
        <Link
          href={`/promotions#promo-${promotion.id}`}
          aria-label={`See the offer: ${promotion.title}`}
          className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-white text-brand-700 ring-1 ring-brand-200 transition-colors hover:bg-brand-600 hover:text-snow", focusRing)}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}
