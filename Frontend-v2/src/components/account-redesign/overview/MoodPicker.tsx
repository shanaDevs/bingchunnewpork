"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import type { Product } from "@/types";
import { useCascadeOnChange } from "../accountMotion";
import { focusRing } from "../accountUi";
import type { DayPart } from "../colomboTime";
import { MoodCard } from "./MoodCard";
import { MOOD_FOR, MOOD_PICKS, MOODS, moodPool, type MoodId } from "./moods";
import { useLiveMenu } from "./liveData";
import { SpinButton, SurprisePanel } from "./SurpriseMe";
import { SectionHeading } from "./todayParts";
import { useProductDrawer } from "./useProductDrawer";

/** Each mood's colours: its icon's circle, and the tile once chosen. */
const MOOD_LOOKS: Record<MoodId, { icon: string; chosen: string }> = {
  hotDay: { icon: "bg-sun-300 text-amber-800", chosen: "bg-amber-50 ring-2 ring-amber-400" },
  sweetTooth: { icon: "bg-pink-100 text-pink-700", chosen: "bg-pink-50 ring-2 ring-pink-400" },
  lightFruity: { icon: "bg-lime-100 text-lime-700", chosen: "bg-lime-50 ring-2 ring-lime-500" },
  treatMyself: { icon: "bg-violet-100 text-violet-700", chosen: "bg-violet-50 ring-2 ring-violet-400" },
};

/**
 * "What's your mood?": four moods (Hot day, Sweet tooth, Light & fruity, Treat myself), the one that suits the time
 * of day chosen first, and the chosen mood's picks from the live menu (overview/moods), as cards that open the menu's
 * add-to-bag drawer. Surprise me (beside the heading) opens a panel that shuffles through everything suiting the
 * mood and lands on one at random. The menu is checked again every minute (liveData), so the admin's changes show.
 * On phones the moods are a row of chips and the picks a row of cards, two in view, both swiped sideways.
 * `titleId`: in the phones' mood sheet (AccountHome's MoodSheet), the id of the sheet's title, which stands in for
 * the heading here; only the line under it and Surprise me show. `onOrder`: the sheet's own way to order (it closes
 * itself first, as the drawer can't open over it); otherwise the picker opens the drawer itself.
 */
export function MoodPicker({ part, titleId, className, onOrder }: { part: DayPart; titleId?: string; className?: string; onOrder?: (product: Product) => void }) {
  const [mood, setMood] = useState<MoodId>(MOOD_FOR[part]);
  // Surprise me: 0 while its panel is closed, else how many spins so far.
  const [spins, setSpins] = useState(0);
  const { data: menu, isLoading } = useLiveMenu();
  const { open, drawer } = useProductDrawer();
  const order = onOrder ?? open;
  const pool = useMemo(() => moodPool(mood, menu ?? []), [mood, menu]);
  const picks = pool.slice(0, MOOD_PICKS);
  const picksRef = useRef<HTMLUListElement>(null);
  // A new mood's picks cascade in.
  useCascadeOnChange(picksRef, ":scope > li", mood);
  const spinButton = <SpinButton label="Surprise me" onSpin={() => setSpins((count) => count + 1)} disabled={spins > 0 || pool.length === 0} className="shrink-0" />;
  const subtitle = "Pick one and we'll suggest something from the menu.";

  return (
    <section aria-labelledby={titleId ?? "moods-heading"} className={className}>
      {titleId ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-600">{subtitle}</p>
          {spinButton}
        </div>
      ) : (
        <SectionHeading id="moods-heading" title="What's Your Mood?" subtitle={subtitle} aside={spinButton} />
      )}

      <div
        role="group"
        aria-label="Moods"
        data-stagger
        className="mt-5 grid grid-cols-2 gap-3 max-md:-mx-5 max-md:mt-4 max-md:flex max-md:gap-2 max-md:overflow-x-auto max-md:px-5 max-md:py-1 max-md:[scrollbar-width:none] max-md:sm:-mx-8 max-md:sm:px-8 lg:grid-cols-4 max-md:[&::-webkit-scrollbar]:hidden"
      >
        {MOODS.map(({ id, name, text, icon: Icon }) => {
          const chosen = id === mood;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={chosen}
              onClick={() => {
                setMood(id);
                // A surprise belongs to its mood: close it when the mood changes.
                setSpins(0);
              }}
              className={cn(
                "flex items-center gap-3 rounded-2xl p-3 text-left transition-[background-color,box-shadow,translate] max-md:shrink-0 max-md:gap-2 max-md:rounded-full max-md:py-1.5 max-md:pr-4 max-md:pl-1.5",
                chosen ? MOOD_LOOKS[id].chosen : "bg-white ring-1 ring-brand-100 hover:-translate-y-0.5 hover:bg-brand-50/50",
                focusRing,
              )}
            >
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-full max-md:size-8", MOOD_LOOKS[id].icon)}>
                <Icon className="size-5 max-md:size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold whitespace-nowrap text-brand-950">{name}</span>
                <span className="block text-xs text-slate-500 max-md:hidden">{text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {spins > 0 && pool.length > 0 && (
        <SurprisePanel pool={pool} tint={MOOD_LOOKS[mood].chosen} spinKey={spins} onSpin={() => setSpins((count) => count + 1)} onClose={() => setSpins(0)} onOrder={order} />
      )}

      {!isLoading && pool.length === 0 && (
        <p className="mt-5 rounded-2xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate-600 ring-1 ring-brand-100">
          {menu ? "Nothing for this mood at your branch right now. Try another mood!" : "We couldn't load the menu. Your picks will show here as soon as we can reach it."}
        </p>
      )}

      <ul
        ref={picksRef}
        aria-live="polite"
        data-stagger
        className="mt-5 grid grid-cols-2 gap-4 max-md:-mx-5 max-md:mt-3 max-md:flex max-md:snap-x max-md:snap-mandatory max-md:scroll-px-5 max-md:gap-3 max-md:overflow-x-auto max-md:px-5 max-md:py-2 max-md:[scrollbar-width:none] max-md:sm:-mx-8 max-md:sm:scroll-px-8 max-md:sm:px-8 lg:grid-cols-4 max-md:[&::-webkit-scrollbar]:hidden"
      >
        {isLoading
          ? [0, 1, 2, 3].map((index) => (
              <li key={index} aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-brand-50 max-md:w-[46%] max-md:shrink-0 sm:h-72 xl:h-80" />
            ))
          : picks.map((product) => (
              <li key={product.id} className="grid max-md:w-[46%] max-md:shrink-0 max-md:snap-start">
                <MoodCard product={product} onOrder={() => order(product)} />
              </li>
            ))}
      </ul>
      {drawer}
    </section>
  );
}
