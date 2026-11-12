"use client";

import { Crown, Gem, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/components/home-redesign/lib/cn";
import { LOYALTY_TIERS, type LoyaltyTier } from "@/lib/loyalty";
import { useAuthStore } from "@/store/authStore";
import { useLoyaltySummary } from "./accountData";

/** The membership levels' icons and colours once reached, lowest level first (the admin may rename the levels). */
const TIER_LOOKS: { icon: LucideIcon; reached: string }[] = [
  // A pearly white-blue.
  { icon: Star, reached: "bg-[radial-gradient(circle_at_35%_30%,#ffffff,var(--color-brand-100))] text-brand-700 ring-brand-300" },
  // Crystal cyan.
  { icon: Gem, reached: "bg-[radial-gradient(circle_at_35%_30%,#e0fbff,#67d4f5)] text-cyan-900 ring-cyan-400" },
  // Crown gold.
  { icon: Crown, reached: "bg-[radial-gradient(circle_at_35%_30%,#fff6cc,var(--color-sun-400))] text-amber-900 ring-amber-400" },
];

/** A level's look by its place in the list (the top one keeps the crown however many there are). */
export function tierLook(index: number, count: number) {
  return TIER_LOOKS[index === count - 1 ? TIER_LOOKS.length - 1 : Math.min(index, TIER_LOOKS.length - 2)];
}

/**
 * The customer's points and membership from the backend (GET /loyalty/summary): `balance` the points they have,
 * `spend` what their orders came to (the levels go by it), the admin's `tiers` lowest first, the level reached
 * (`current`, null before the first) and the next one (null at the top). Undefined while loading (no flashing zero).
 */
export function useHappyPoints() {
  const query = useLoyaltySummary();
  const summary = query.data;
  const userPoints = useAuthStore((s) => s.user?.loyaltyPoints);
  const tiers: LoyaltyTier[] = [...(summary?.tiers?.length ? summary.tiers : LOYALTY_TIERS)].sort((a, b) => a.minSpendLkr - b.minSpendLkr);
  const balance =
    summary?.points ?? (query.isLoading ? undefined : userPoints ?? 0);
  const spend = summary?.totalSpendLkr ?? (query.isLoading ? undefined : 0);
  const spendValue = spend ?? 0;
  const currentIndex = tiers.reduce((found, tier, index) => (spendValue >= tier.minSpendLkr ? index : found), -1);
  return {
    summary,
    isLoading: query.isLoading,
    balance,
    spend,
    tiers,
    currentIndex,
    current: currentIndex >= 0 ? tiers[currentIndex] : null,
    next: tiers[currentIndex + 1] ?? null,
  };
}

/**
 * A progress bar from 0 to `goal`, filled sunny yellow with a star riding its end. `tone`: on the cream or white
 * cards (`light`), on blue (`dark`), or on the light ice-blue member strip (`ice`). The visible numbers are beside it, so it is a labelled meter.
 */
export function PointsBar({ value, goal, label, tone = "light", className }: { value: number; goal: number; label: string; tone?: "light" | "dark" | "ice"; className?: string }) {
  const percent = goal > 0 ? Math.min(100, (value / goal) * 100) : 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(value, goal)}
      className={cn("relative h-3 rounded-full", tone === "dark" ? "bg-white/20" : tone === "ice" ? "bg-white/80 ring-1 ring-brand-200 ring-inset" : "bg-cream-200/70", className)}
    >
      <div
        className="h-full rounded-full bg-linear-to-r from-sun-300 to-sun-400 shadow-[0_0_12px_rgb(255_210_63/0.6)] transition-[width] duration-700 ease-out starting:w-0"
        style={{ width: `${percent}%` }}
      />
      <Star
        aria-hidden="true"
        className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 fill-sun-400 text-brand-950/70 drop-shadow transition-[left] duration-700 ease-out"
        style={{ left: `clamp(0.625rem, ${percent}%, calc(100% - 0.625rem))` }}
      />
    </div>
  );
}

export const lkr = (amount: number) => Math.round(amount).toLocaleString("en-US");
