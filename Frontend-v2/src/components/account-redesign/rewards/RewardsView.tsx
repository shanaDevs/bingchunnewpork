"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Dices, Gift, LoaderCircle, Lock, LockOpen, Percent, Sparkles, Star, TimerOff, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { isCheckoutRedeemUnlocked, normalizeLoyaltySettings, type CustomerLoyaltyJourney, type CustomerLoyaltyJourneyStep, type CustomerLoyaltyJourneyStepKey } from "@/lib/loyalty";
import { fetchSpinEligibility, SPIN_ELIGIBILITY_QUERY_KEY } from "@/lib/spinEligibility";
import { useSpinStore } from "@/store/spinStore";
import { useLoyaltySummary } from "../accountData";
import { CountUp } from "../accountMotion";
import { card, focusRing, primaryButton } from "../accountUi";
import { lkr, PointsBar, tierLook, useHappyPoints } from "../rewardsParts";
import { EarnCard } from "./EarnCard";
import { JourneyGuideDialog } from "./JourneyGuideDialog";
import { PointsHistory } from "./PointsHistory";
import { RewardCards } from "./RewardCards";
import { panel, panelHeading, percentOf, Track, TrackStop } from "./rewardsUi";

/**
 * Rewards: the customer's Happy Points from the backend (GET /loyalty/summary), in the prototype's layout. The member
 * hero (level, balance, earning rate, what the points are worth at checkout, progress to the next level by spend);
 * the new-customer loyalty journey (the admin's three offers, each opening how it works) beside the membership
 * levels; the admin's rewards catalogue; the ways to earn (with the referral link) beside the points history. The
 * old /account/loyalty and /account/loyalty/history pages forward here.
 */
export function RewardsView() {
  const { data, isLoading, isError, refetch, isFetching } = useLoyaltySummary();
  const journey = data?.journey?.active && data.journey.steps.length > 0 ? data.journey : null;

  if (isLoading) {
    return (
      <p role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
        <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden="true" />
        Loading your rewards…
      </p>
    );
  }

  if (isError && !data) {
    return (
      <div className={cn(card, "flex flex-col items-center px-6 py-10 text-center sm:py-14")}>
        <p className="text-lg font-bold text-brand-950">We couldn&apos;t load your rewards</p>
        <p className="mt-1 max-w-sm text-sm text-slate-600">Your points haven&apos;t changed. Check your connection and try again.</p>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className={cn(primaryButton, "mt-6")}>
          {isFetching && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          Try again
        </button>
      </div>
    );
  }

  return (
    // Roomy gaps between the main sections; the cards side by side within a section keep the closer gap.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 sm:gap-12">
      <MemberHero />
      <div data-motion-group className={cn("grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6", journey && "xl:grid-cols-2")}>
        {journey && <JourneyCard journey={journey} />}
        <MembershipCard />
      </div>
      <RewardCards />
      <div data-motion-group className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <EarnCard />
        <PointsHistory />
      </div>
    </div>
  );
}

/**
 * The member strip, in light ice blues so it sits quietly under the page's blue hero, one row from md: the level
 * reached over the balance, the earning rate and what the points do at checkout; how far the spend is from the next
 * level, Order to earn (and Use at checkout once the points can be used); the Happy Points coin at the right end.
 */
function MemberHero() {
  const { summary, balance, spend, tiers, current, currentIndex, next } = useHappyPoints();
  const settings = normalizeLoyaltySettings(summary?.settings);
  const lkrPerPoint = Math.max(1, Math.round(1 / settings.pointsPerLkr));
  const CurrentIcon = current ? tierLook(currentIndex, tiers.length).icon : Sparkles;
  const progressText = next ? `LKR ${lkr(next.minSpendLkr - spend)} to ${next.name}` : current ? `You've reached ${current.name}, our top level` : "";
  const percent = next ? percentOf(spend, next.minSpendLkr) : 100;

  // Points come off an order at checkout (1 point = redeemValue rupees), once the admin allows it and the customer has
  // earned the minimum in all.
  const redeemOn = settings.customerRedeemEnabled !== false && settings.checkoutRedeemEnabled !== false;
  const minToRedeem = settings.minPointsToRedeem ?? 0;
  const lifetime = summary?.lifetimePointsEarned ?? 0;
  const unlocked = summary?.checkoutRedeemUnlocked ?? isCheckoutRedeemUnlocked({ lifetimePointsEarned: lifetime, minPointsToRedeem: minToRedeem });
  const canUse = redeemOn && unlocked && balance > 0;
  const redeemText = !redeemOn
    ? "Using points at checkout is paused for now"
    : !unlocked
      ? `Earn ${lkr(minToRedeem)} points in all to use them at checkout (${lkr(Math.min(lifetime, minToRedeem))} so far)`
      : balance > 0
        ? `Worth LKR ${lkr(balance * settings.redeemValue)} off at checkout`
        : null;

  return (
    <section
      aria-labelledby="balance-heading"
      className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-brand-50 via-brand-100/80 to-brand-200/70 px-5 py-5 ring-1 ring-brand-200/70 sm:rounded-[2rem] sm:px-7"
    >
      {/* Decorative: soft white circles. */}
      <span aria-hidden="true" className="absolute -top-16 right-1/4 -z-10 size-44 rounded-full bg-white/45" />
      <span aria-hidden="true" className="absolute -right-10 -bottom-20 -z-10 size-52 rounded-full bg-white/35" />

      {/* Phones: the balance, the coin on its right, the progress below both. From md one row, the coin at the right end. */}
      <div className="flex flex-wrap items-center gap-5 md:flex-nowrap md:gap-7">
        <PointsCoin />
        <div className="min-w-0 flex-1 md:max-w-[17rem] md:flex-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-300 px-2.5 py-0.5 text-xs font-bold text-brand-950">
            <CurrentIcon className="size-3.5" aria-hidden="true" />
            {current ? `${current.name} member` : "New member"}
          </span>
          <h3 id="balance-heading" className="sr-only">
            Available balance
          </h3>
          <p className="mt-2.5 flex items-end gap-2 text-brand-950">
            <CountUp value={balance} className="font-numeric text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-6xl" />
            <span className="pb-1 text-base font-bold text-brand-600">pts</span>
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600">1 point per LKR {lkr(lkrPerPoint)} spent</p>
          {redeemText && <p className={cn("mt-1 text-xs font-semibold", canUse ? "text-emerald-700" : "text-slate-600")}>{redeemText}</p>}
        </div>

        <div className="min-w-0 basis-full max-md:order-2 md:basis-auto md:flex-1 md:border-l md:border-brand-200/80 md:pl-7">
          {progressText && (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-brand-950">{progressText}</span>
                <span className="font-numeric font-extrabold text-brand-600">{percent}%</span>
              </div>
              <PointsBar value={percent} goal={100} label={progressText} tone="ice" className="mt-2" />
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href="/menu"
              className={cn(
                "inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-snow shadow-lg shadow-brand-600/25 transition-[background-color,translate] hover:-translate-y-0.5 hover:bg-brand-700",
                focusRing,
              )}
            >
              Order to earn
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            {canUse && (
              <Link
                href="/checkout"
                className={cn("inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 transition-colors ring-inset hover:bg-brand-50", focusRing)}
              >
                Use at checkout
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The Happy Points coin: a white-and-blue rim round a sunny face with a star, turning gently, a light sweeping across. */
function PointsCoin() {
  return (
    <div aria-hidden="true" data-pop className="relative grid size-24 shrink-0 place-items-center max-md:order-1 max-md:mr-1 sm:size-28 md:order-last md:mr-2">
      <span className="absolute inset-3 rounded-full bg-sun-300/50 blur-xl" />
      {/* Tapioca pearls around it. */}
      {[
        "-top-1 left-2 size-2.5 bg-brand-950/80",
        "top-6 -right-2 size-2 bg-brand-950/70 [animation-delay:-2s]",
        "-bottom-1 right-5 size-3 bg-brand-950/80 [animation-delay:-1s]",
        "bottom-5 -left-2 size-2 bg-sun-400 [animation-delay:-3s]",
      ].map((className) => (
        <span key={className} className={cn("absolute animate-float rounded-full", className)} />
      ))}
      <div className="relative size-full animate-float">
        <div className="relative grid size-full animate-coin-tilt place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#ffffff,var(--color-brand-100)_45%,var(--color-brand-400))] shadow-[inset_0_-8px_16px_rgb(15_33_71/0.25),0_18px_30px_-14px_rgb(15_33_71/0.45)] ring-4 ring-white/70 motion-reduce:animate-none">
          <div className="grid size-[70%] place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff3b0,var(--color-sun-300)_45%,var(--color-sun-400))] shadow-[inset_0_-5px_10px_rgb(160_110_0/0.35),inset_0_4px_8px_rgb(255_255_255/0.6)] ring-2 ring-white/70">
            <Star className="size-[45%] fill-white text-snow drop-shadow-[0_2px_3px_rgb(160_110_0/0.45)]" />
          </div>
          <span className="absolute inset-0 overflow-hidden rounded-full">
            <span className="absolute -inset-y-4 left-0 w-1/4 rotate-12 animate-coin-shine bg-white/45 blur-md motion-reduce:hidden" />
          </span>
        </div>
      </div>
    </div>
  );
}

const OFFER_ICONS: Record<CustomerLoyaltyJourneyStepKey, LucideIcon> = { OFFER_1: Percent, OFFER_2: Gift, OFFER_3: Dices };

/** A journey stop's icon and colours by its status: done (green tick), open now (the offer's own icon), locked, expired or switched off. */
function stepLook(step: CustomerLoyaltyJourneyStep): { icon: LucideIcon; iconClass: string; chipClass: string } {
  switch (step.status) {
    case "completed":
      return { icon: Check, iconClass: "bg-emerald-50 text-emerald-600 ring-2 ring-emerald-400", chipClass: "bg-emerald-50 text-emerald-700" };
    case "current":
      return { icon: OFFER_ICONS[step.key], iconClass: "bg-white text-brand-600 ring-2 ring-brand-500 shadow-[0_0_0_6px_var(--color-brand-100)]", chipClass: "bg-brand-50 text-brand-700" };
    case "expired":
      return { icon: TimerOff, iconClass: "bg-slate-100 text-slate-400 ring-1 ring-slate-200", chipClass: "bg-slate-100 text-slate-500" };
    default:
      return { icon: Lock, iconClass: "bg-slate-100 text-slate-400 ring-1 ring-slate-200", chipClass: "bg-slate-100 text-slate-500" };
  }
}

/**
 * The current offer's next step in words: the orders still to go for Spin & Win while they're being counted, else the
 * backend's detail with the offer's name ("Come-back reward: 5d left", "Spin & win: Min LKR 1,500 on unlock order").
 */
function stepHint(step: CustomerLoyaltyJourneyStep) {
  if (step.key === "OFFER_3" && step.progress && step.statusLabel !== "Ready" && step.statusLabel !== "Need min order") {
    const left = Math.max(0, step.progress.required - step.progress.current);
    if (left > 0) return `${left} more ${left === 1 ? "order" : "orders"} to unlock ${step.title} (${step.progress.current}/${step.progress.required})`;
  }
  return step.detail ? `${step.title}: ${step.detail}` : step.title;
}

/**
 * The new-customer loyalty journey, as the backend reports it for this customer: the admin's three offers (a welcome
 * discount, a come-back reward, Spin & Win after enough orders) on a track, each with its status, opening how it
 * works. How far along (finished offers, and orders towards the third), the current offer's next step at the foot,
 * and Spin the wheel once the third is ready (else Order now).
 */
function JourneyCard({ journey }: { journey: CustomerLoyaltyJourney }) {
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);
  // Whether the wheel will actually let them spin (it may be cooling down), as the old rewards page checked.
  const { data: spin } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, "auth", "rewards-page"],
    queryFn: () => fetchSpinEligibility(true),
    staleTime: 30_000,
  });
  const [guideFor, setGuideFor] = useState<CustomerLoyaltyJourneyStepKey | null>(null);

  const enabled = journey.steps.filter((step) => step.status !== "disabled");
  const complete = enabled.every((step) => step.status === "completed" || step.status === "expired");
  // Only real progress: finished offers, and the orders counted towards the third. An offer that's merely open adds nothing.
  const score = enabled.reduce(
    (sum, step) =>
      sum + (step.status === "completed" || step.status === "expired" ? 1 : step.progress && step.progress.current > 0 ? Math.min(1, step.progress.current / Math.max(1, step.progress.required)) : 0),
    0,
  );
  const percent = enabled.length > 0 ? Math.min(100, Math.round((score / enabled.length) * 100)) : 0;
  const currentStep = journey.steps.find((step) => step.key === journey.currentStepKey) ?? journey.steps.find((step) => step.status === "current") ?? null;
  const offer3 = journey.steps.find((step) => step.key === "OFFER_3");
  const spinReady = offer3?.status === "current" && offer3.statusLabel === "Ready";
  const showSpin = spinReady && spin?.canSpin !== false;
  const nextStepText = currentStep ? stepHint(currentStep) : journey.headline;
  // The current offer can be used now (rather than still being worked towards).
  const openNow = currentStep?.status === "current" && (currentStep.statusLabel === "Available" || currentStep.statusLabel === "Ready");

  return (
    <section aria-labelledby="journey-heading" className={cn(panel, "relative isolate flex flex-col overflow-hidden")}>
      <span aria-hidden="true" className="absolute -top-16 -left-10 -z-10 size-48 rounded-full bg-brand-50" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="journey-heading" className={panelHeading}>
            Loyalty journey
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {complete ? "You've been through every offer" : journey.headline}
          </p>
        </div>
        <span className="font-numeric text-2xl font-extrabold text-brand-600">{percent}%</span>
      </div>

      <Track count={journey.steps.length} percent={percent} className="mt-6 mb-4">
        {journey.steps.map((step) => {
          const look = stepLook(step);
          return (
            <TrackStop
              key={step.key}
              icon={look.icon}
              iconClass={look.iconClass}
              title={step.title}
              titleClassName="max-sm:flex max-sm:min-h-10 max-sm:items-center max-sm:justify-center"
              chip={<span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", look.chipClass)}>{step.statusLabel}</span>}
              note={step.status === "disabled" ? undefined : step.description}
              onClick={() => setGuideFor(step.key)}
              label={`Offer ${step.stepNumber}: ${step.title}, ${step.statusLabel}. How it works`}
            />
          );
        })}
      </Track>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-brand-100 pt-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-950">
          {complete || openNow ? <LockOpen className="size-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <Lock className="size-4 shrink-0 text-slate-400" aria-hidden="true" />}
          {complete ? "Every offer done. Thanks for sticking with us!" : nextStepText}
        </p>
        {showSpin ? (
          <button type="button" onClick={() => requestOpenSpin()} className={cn("inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-snow transition-colors hover:bg-brand-700", focusRing)}>
            Spin the wheel
            <Dices className="size-4" aria-hidden="true" />
          </button>
        ) : (
          !complete && (
            <Link href="/menu" className={cn("inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:underline", focusRing)}>
              {currentStep?.key === "OFFER_3" ? "Order to unlock" : "Order now"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )
        )}
      </div>

      {guideFor && <JourneyGuideDialog journey={journey} focusKey={guideFor} onClose={() => setGuideFor(null)} />}
    </section>
  );
}

/**
 * The admin's membership levels by spend on a track filled as far as the spend reaches (between two levels, the
 * share of the way from one to the next), each in its own colour once reached (the current one marked "You"), with
 * its spend and its perk.
 */
function MembershipCard() {
  const { spend, tiers, current } = useHappyPoints();
  // Where the spend sits on the track: 0 at the first level, 100 at the last, in even steps between levels.
  const passed = tiers.reduce((count, tier) => (spend >= tier.minSpendLkr ? count + 1 : count), 0);
  const percent =
    tiers.length < 2
      ? passed > 0
        ? 100
        : 0
      : passed === 0
        ? 0
        : passed >= tiers.length
          ? 100
          : ((passed - 1 + (spend - tiers[passed - 1].minSpendLkr) / Math.max(1, tiers[passed].minSpendLkr - tiers[passed - 1].minSpendLkr)) / (tiers.length - 1)) * 100;

  return (
    <section aria-labelledby="membership-heading" className={cn(panel, "relative isolate overflow-hidden")}>
      <span aria-hidden="true" className="absolute -right-12 -bottom-16 -z-10 size-48 rounded-full bg-cream-50" />
      <h3 id="membership-heading" className={panelHeading}>
        Membership
      </h3>
      <p className="mt-1 text-sm text-slate-600">LKR {lkr(spend)} spent so far</p>

      <Track count={tiers.length} percent={percent} className="mt-6">
        {tiers.map((tier, index) => {
          const look = tierLook(index, tiers.length);
          const reached = spend >= tier.minSpendLkr;
          return (
            <TrackStop
              key={tier.id}
              icon={look.icon}
              iconClass={reached ? cn("ring-2", look.reached) : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"}
              badge={current?.id === tier.id ? "You" : undefined}
              title={tier.name}
              chip={<span className="font-numeric text-xs font-semibold text-slate-500">LKR {lkr(tier.minSpendLkr)}</span>}
              note={tier.perk || undefined}
            />
          );
        })}
      </Track>
    </section>
  );
}
