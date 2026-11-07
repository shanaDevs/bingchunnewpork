"use client";

import { ChevronRight, Gift, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/home-redesign/lib/cn";
import { CountUp } from "../accountMotion";
import { focusRing } from "../accountUi";
import { lkr, tierLook, useHappyPoints } from "../rewardsParts";
import { panel, SectionHeading } from "./todayParts";

/**
 * The customer's rewards at a glance, from the backend (GET /loyalty/summary, the same as the rewards page): the
 * balance and the level reached, the loyalty-journey offers unlocked and the rewards the balance has reached, then
 * the admin's membership levels with the spend to the next. See rewards opens the rewards page for the rest. Not on
 * phones, where the hero shows the points instead (AccountHero).
 */
export function RewardsSummary() {
  const { summary, isLoading, balance, spend, tiers, current, currentIndex, next } = useHappyPoints();
  const CurrentIcon = current ? tierLook(currentIndex, tiers.length).icon : Sparkles;
  const top = tiers[tiers.length - 1];
  const pointsPerLkr = summary?.settings?.pointsPerLkr;
  const lkrPerPoint = pointsPerLkr ? Math.round(1 / pointsPerLkr) : null;
  const journey = summary?.journey?.active ? summary.journey : null;
  const rewards = (summary?.redeemRewards ?? []).filter((reward) => reward.isActive !== false);
  const reached = rewards.filter((reward) => reward.cost <= balance).length;
  // Each stop is 1/n wide; the track runs from the first stop's centre to the last's.
  const inset = `${50 / Math.max(1, tiers.length)}%`;

  return (
    <section aria-labelledby="rewards-summary-heading" aria-busy={isLoading || undefined} className={cn(panel, "flex flex-col max-md:hidden")}>
      <SectionHeading
        id="rewards-summary-heading"
        title="Your Rewards"
        subtitle="Your Happy Points at a glance."
        aside={
          <Link href="/account/rewards" className={cn("inline-flex shrink-0 items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:underline", focusRing)}>
            See rewards
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      {/* The balance and the level reached. */}
      <div className="mt-5 flex items-center gap-4">
        <span
          aria-hidden="true"
          data-pop
          className="grid size-16 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff3b0,var(--color-sun-300)_45%,var(--color-sun-400))] shadow-[inset_0_-4px_8px_rgb(160_110_0/0.3),inset_0_3px_6px_rgb(255_255_255/0.6)] ring-4 ring-brand-100"
        >
          <Star className="size-7 fill-white text-snow drop-shadow-[0_1px_2px_rgb(160_110_0/0.45)]" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-300 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-brand-950">
            <CurrentIcon className="size-3.5" aria-hidden="true" />
            {current ? `${current.name} member` : "New member"}
          </span>
          <p className="mt-1.5 flex items-end gap-1.5 text-brand-950">
            <CountUp value={balance} className="font-numeric text-4xl leading-none font-extrabold tracking-tight" />
            <span className="pb-0.5 text-sm font-bold text-brand-600">pts</span>
          </p>
          {lkrPerPoint && <p className="mt-1 text-xs text-slate-500">1 point per LKR {lkr(lkrPerPoint)} spent</p>}
        </div>
      </div>

      {/* The journey's offers unlocked, and the rewards the balance has reached. */}
      {(journey || rewards.length > 0) && (
        <ul data-stagger className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {journey && (
            <SummaryStat icon={Gift} value={`${journey.steps.filter((step) => step.status !== "locked").length}/${journey.steps.length}`} label="Offers unlocked" />
          )}
          {rewards.length > 0 && <SummaryStat icon={Star} value={`${reached}/${rewards.length}`} label="Rewards reached" />}
        </ul>
      )}

      {/* Membership: the levels on a track filled as far as the spend reaches (each in its own colour once reached, the
          current one marked "You"), and the spend still to go to the next. */}
      {top && (
        <div className="mt-4 rounded-2xl bg-cream-50 px-4 pt-3 pb-3.5 ring-1 ring-cream-200">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-amber-700 uppercase">Membership</p>
            <p className="text-xs text-slate-500">LKR {lkr(spend)} spent so far</p>
          </div>
          <div className="relative mt-3">
            <div aria-hidden="true" className="absolute top-4.5 h-1.5 -translate-y-1/2 rounded-full bg-white" style={{ left: inset, right: inset }}>
              <div className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600" style={{ width: `${Math.min(100, (spend / top.minSpendLkr) * 100)}%` }} />
            </div>
            <ol data-stagger className="relative grid" style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}>
              {tiers.map((tier, index) => {
                const look = tierLook(index, tiers.length);
                const isReached = spend >= tier.minSpendLkr;
                return (
                  <li key={tier.id} className="flex flex-col items-center text-center">
                    <span className={cn("relative grid size-9 place-items-center rounded-full", isReached ? cn("ring-2", look.reached) : "bg-white text-slate-400 ring-1 ring-slate-200")}>
                      <look.icon className="size-4" aria-hidden="true" />
                      {current?.id === tier.id && (
                        <span className="absolute -top-2.5 -right-3 rounded-full bg-brand-950 px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-wide text-snow uppercase">You</span>
                      )}
                    </span>
                    <span className="mt-1.5 text-xs font-bold text-brand-950">{tier.name}</span>
                    <span className="font-numeric text-[0.6875rem] font-semibold text-slate-500">LKR {lkr(tier.minSpendLkr)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="mt-2.5 text-center text-xs font-semibold text-brand-950">
            {next ? `LKR ${lkr(next.minSpendLkr - spend)} to ${next.name}` : current ? `You've reached ${current.name}, our top level` : ""}
          </p>
        </div>
      )}
    </section>
  );
}

/** A small figure beside the balance, with its icon and what it counts. */
function SummaryStat({ icon: Icon, value, label }: { icon: typeof Gift; value: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <p className="leading-tight">
        <span className="font-numeric text-sm font-extrabold text-brand-950">{value}</span> <span className="text-xs text-slate-500">{label}</span>
      </p>
    </li>
  );
}
