"use client";

import { Check, ChevronLeft, ChevronRight, LockOpen, Star } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import type { LoyaltyRedeemReward } from "@/lib/loyalty";
import { focusRing } from "../accountUi";
import { lkr, PointsBar, useHappyPoints } from "../rewardsParts";
import { panelHeading } from "./rewardsUi";

/**
 * The admin's rewards catalogue (the summary's redeemRewards, the active ones, cheapest first) as a carousel: one row
 * that scrolls sideways and snaps to a card (swipe, trackpad, the arrow keys once it has focus, or the arrows by the
 * heading, which move a screenful and grey out at either end). Three cards in view from xl, two from sm, one on
 * phones. Shows what the balance reaches; there's no claim button, as the backend has no way to claim one (points
 * come off at checkout instead). Hidden when the admin has none.
 */
export function RewardCards() {
  const { summary, balance } = useHappyPoints();
  const rewards = (summary?.redeemRewards ?? [])
    .filter((reward) => reward.isActive !== false && reward.id && reward.title && Number.isFinite(reward.cost) && reward.cost >= 0)
    .sort((a, b) => a.cost - b.cost);
  const listRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => setEdges({ atStart: list.scrollLeft <= 1, atEnd: list.scrollLeft + list.clientWidth >= list.scrollWidth - 1 });
    // The observer also reports once straight away, which sets the first state.
    const resize = new ResizeObserver(update);
    resize.observe(list);
    list.addEventListener("scroll", update, { passive: true });
    return () => {
      resize.disconnect();
      list.removeEventListener("scroll", update);
    };
  }, [rewards.length]);

  if (rewards.length === 0) return null;

  const step = (direction: 1 | -1) => listRef.current?.scrollBy({ left: direction * listRef.current.clientWidth });
  const scrolls = !(edges.atStart && edges.atEnd);

  return (
    <section aria-labelledby="rewards-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="rewards-heading" className={panelHeading}>
            Rewards to unlock
          </h3>
          <p className="mt-1 text-sm text-slate-600">Save your points for a treat.</p>
        </div>
        {scrolls && (
          <div className="flex gap-2">
            <ArrowButton label="Previous rewards" disabled={edges.atStart} onClick={() => step(-1)}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </ArrowButton>
            <ArrowButton label="More rewards" disabled={edges.atEnd} onClick={() => step(1)}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </ArrowButton>
          </div>
        )}
      </div>
      {/* The padding (taken back by the negative margin) keeps the cards' rings from being clipped. */}
      <ul
        ref={listRef}
        data-stagger
        tabIndex={scrolls ? 0 : undefined}
        aria-labelledby="rewards-heading"
        className={cn(
          "-mx-2 -my-3 grid auto-cols-[100%] grid-flow-col gap-4 overflow-x-auto overscroll-x-contain rounded-[1.75rem] px-2 py-3 [scrollbar-width:none] snap-x snap-mandatory scroll-px-2 motion-safe:scroll-smooth sm:auto-cols-[calc((100%-1.25rem)/2)] sm:gap-5 xl:auto-cols-[calc((100%-2.5rem)/3)] [&::-webkit-scrollbar]:hidden",
          focusRing,
        )}
      >
        {rewards.map((reward) => (
          <RewardCard key={reward.id} reward={reward} balance={balance ?? 0} />
        ))}
      </ul>
    </section>
  );
}

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-10 place-items-center rounded-full bg-white text-brand-700 shadow-sm ring-1 ring-brand-200 transition-colors ring-inset hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white",
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A reward: its emoji on a bubbly stage (with the admin's tag, e.g. "Popular"), the name, description, the points it
 * takes, its own progress and, once the balance reaches it, "Reached". On phones a shorter card: the stage on the
 * left beside the text, the progress across below.
 */
function RewardCard({ reward, balance }: { reward: LoyaltyRedeemReward; balance: number }) {
  const reached = balance >= reward.cost;

  return (
    // The panel frame, its outline turned yellow once reached.
    <li
      className={cn(
        "flex snap-start flex-col rounded-[1.5rem] bg-white p-4 max-sm:grid max-sm:grid-cols-[6.5rem_minmax(0,1fr)] max-sm:content-start max-sm:gap-x-3.5",
        reached ? "ring-2 ring-sun-400" : "ring-1 ring-brand-100",
      )}
    >
      <div
        className={cn(
          "group relative isolate flex h-36 items-center justify-center overflow-hidden rounded-[1.125rem] max-sm:row-span-3 max-sm:h-full max-sm:min-h-26",
          reached ? "bg-[radial-gradient(circle_at_50%_75%,var(--color-sun-300),var(--color-cream-50)_70%)]" : "bg-[radial-gradient(circle_at_50%_75%,var(--color-brand-100),var(--color-brand-50)_70%)]",
        )}
      >
        {["top-4 left-5 size-3", "top-10 left-12 size-2 [animation-delay:-2s]", "top-6 right-16 size-2.5 [animation-delay:-1s]"].map((className) => (
          <span key={className} aria-hidden="true" className={cn("absolute -z-10 animate-float rounded-full bg-white/70", className)} />
        ))}
        {/* A soft shadow on the stage's floor, under the emoji. */}
        <span aria-hidden="true" className="absolute bottom-3.5 left-1/2 -z-10 h-3 w-20 -translate-x-1/2 rounded-full bg-brand-950/10 blur-sm" />
        <span
          aria-hidden="true"
          className="text-[4.5rem] leading-none drop-shadow-[0_8px_10px_rgb(15_33_71/0.18)] transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 max-sm:text-5xl"
        >
          {reward.emoji || "🎁"}
        </span>
        {reached && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-brand-950 px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.08em] text-snow uppercase max-sm:top-2 max-sm:left-2 max-sm:px-2 max-sm:py-0.5 max-sm:text-[0.625rem]">
            <LockOpen className="size-3" aria-hidden="true" />
            Reached
          </span>
        )}
        {reward.tag && !reached && (
          <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[0.6875rem] font-bold text-brand-700 ring-1 ring-brand-100 max-sm:top-2 max-sm:right-2 max-sm:px-2 max-sm:py-0.5 max-sm:text-[0.625rem]">
            {reward.tag}
          </span>
        )}
      </div>

      <h4 className="mt-3.5 text-base font-bold text-brand-950 max-sm:mt-0.5">{reward.title}</h4>
      <p className="mt-0.5 flex-1 text-sm text-slate-600 max-sm:text-[0.8125rem] max-sm:leading-snug">{reward.description}</p>
      <p className="mt-2 flex items-center gap-1.5 text-sm font-extrabold text-brand-600">
        <Star className="size-4 fill-brand-600" aria-hidden="true" />
        <span className="font-numeric">{lkr(reward.cost)} pts</span>
      </p>

      <PointsBar value={balance} goal={reward.cost} label={`${balance} of ${reward.cost} points towards ${reward.title}`} className="mt-3 max-sm:col-span-2" />
      {/* One fixed line, so "You have enough points" (with its tick) is no taller than "N more points". */}
      <p className="mt-2 flex h-5 items-center text-xs font-semibold max-sm:col-span-2">
        {reached ? (
          <span className="inline-flex items-center gap-1 text-brand-950">
            <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
            You have enough points
          </span>
        ) : (
          <span className="text-slate-600">
            {lkr(reward.cost - balance)} more {reward.cost - balance === 1 ? "point" : "points"}
          </span>
        )}
      </p>
    </li>
  );
}
