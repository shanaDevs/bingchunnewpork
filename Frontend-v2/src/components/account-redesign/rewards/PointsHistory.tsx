"use client";

import { Minus, Plus, Store, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { extractOrderNumberFromNote, formatTransactionLabel, getLoyaltyTransactionKind, type LoyaltyTransaction, type LoyaltyTransactionKind } from "@/lib/loyalty";
import { BrowseMenuLink, focusRing } from "../accountUi";
import { formatWith, orderHref, PLACED_FORMAT } from "../orders/orderParts";
import { lkr, useHappyPoints } from "../rewardsParts";
import { panel, panelHeading } from "./rewardsUi";

const formatPlaced = formatWith(PLACED_FORMAT);

type Filter = "all" | "earn" | "redeem";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "earn", label: "Earned" },
  { value: "redeem", label: "Used" },
];

const KIND_LOOK: Record<LoyaltyTransactionKind, { icon: LucideIcon; tile: string; points: string }> = {
  earn: { icon: Plus, tile: "bg-emerald-50 text-emerald-600", points: "text-emerald-600" },
  redeem: { icon: Minus, tile: "bg-rose-50 text-rose-600", points: "text-rose-600" },
  other: { icon: Plus, tile: "bg-brand-50 text-brand-600", points: "text-brand-700" },
};

/** What a line was: the backend records EARN for an order's points and REDEEM for points taken off one at checkout. */
const lineText = (type: string) => {
  const kind = type.toUpperCase();
  return kind === "EARN" ? "Points earned" : kind === "REDEEM" ? "Used at checkout" : formatTransactionLabel(type.toLowerCase());
};

/**
 * Every points line from the backend (the summary's transactions, newest first, up to its last 200): the order it
 * came from (opens its details in My Orders), when, and the points earned or used at checkout; All / Earned / Used
 * filters, and the totals of each. Its own anchor (#history), where the old points history page now lands.
 */
export function PointsHistory() {
  const { summary } = useHappyPoints();
  const transactions = summary?.transactions ?? [];
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? transactions : transactions.filter((txn) => getLoyaltyTransactionKind(txn) === filter);
  const earned = transactions.filter((txn) => txn.points > 0).reduce((sum, txn) => sum + txn.points, 0);
  const used = transactions.filter((txn) => txn.points < 0).reduce((sum, txn) => sum - txn.points, 0);

  return (
    <section id="history" aria-labelledby="history-heading" className={cn(panel, "flex scroll-mt-24 flex-col")}>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h3 id="history-heading" className={panelHeading}>
          Points history
        </h3>
        {transactions.length > 0 && (
          <p className="text-xs font-semibold text-slate-500">
            <span className="text-emerald-700">{lkr(earned)} earned</span> · <span className="text-rose-700">{lkr(used)} used</span>
          </p>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-100 px-4 py-8 text-center">
          <Store className="size-8 text-brand-300" aria-hidden="true" />
          <p className="mt-3 text-base font-bold text-brand-950">No points yet</p>
          <p className="mt-1 max-w-sm text-sm text-slate-600">Place an order while logged in and your points will show up here.</p>
          <BrowseMenuLink className="mt-4" />
        </div>
      ) : (
        <>
          <div role="group" aria-label="Show" className="mt-3 flex gap-1.5">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={cn(
                  "h-8 rounded-full px-3.5 text-xs font-semibold transition-colors",
                  filter === item.value ? "bg-brand-600 text-snow" : "bg-brand-50 text-brand-700 hover:bg-brand-100",
                  focusRing,
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-500">{filter === "earn" ? "No points earned yet." : "You haven't used any points yet."}</p>
          ) : (
            // Scrolls inside the card past a few lines, so it sits level with the ways to earn.
            <ul data-stagger className="mt-2 flex max-h-80 flex-col divide-y divide-brand-100 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {shown.map((txn) => (
                <HistoryLine key={txn.id} txn={txn} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function HistoryLine({ txn }: { txn: LoyaltyTransaction }) {
  const kind = getLoyaltyTransactionKind(txn);
  const look = KIND_LOOK[kind];
  const orderNumber = extractOrderNumberFromNote(txn.note);
  const what = lineText(txn.type);

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", look.tile)}>
        <look.icon className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {orderNumber ? (
          <Link href={orderHref({ orderNumber })} className={cn("font-numeric rounded text-sm font-bold wrap-break-word text-brand-950 hover:underline", focusRing)}>
            Order {orderNumber}
          </Link>
        ) : (
          <p className="text-sm font-bold wrap-break-word text-brand-950">{txn.note || what}</p>
        )}
        <p className="text-xs text-slate-500">
          {what} · <time dateTime={txn.createdAt}>{formatPlaced(txn.createdAt)}</time>
        </p>
      </div>
      <p className={cn("font-numeric shrink-0 text-base font-extrabold", look.points)}>
        {txn.points > 0 ? "+" : txn.points < 0 ? "−" : ""}
        {lkr(Math.abs(txn.points))}
      </p>
    </li>
  );
}
