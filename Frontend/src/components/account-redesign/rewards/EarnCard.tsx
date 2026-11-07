"use client";

import { Check, Copy, Share2, ShoppingBag, Sparkles, UsersRound } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { formatReferralCode, normalizeLoyaltySettings } from "@/lib/loyalty";
import { useSignedInAccount } from "../AccountShell";
import { smallButton } from "../accountUi";
import { lkr, useHappyPoints } from "../rewardsParts";
import { panel, panelHeading } from "./rewardsUi";

/**
 * The ways to earn: orders (the admin's minimum and rate), then the admin's upcoming offers (e.g. a seasonal drop or
 * the birthday bonus), and at the foot the customer's referral link to share (the old rewards page's), which opens
 * the sign-in page with their code.
 */
export function EarnCard() {
  const { summary } = useHappyPoints();
  const settings = normalizeLoyaltySettings(summary?.settings);
  const lkrPerPoint = Math.max(1, Math.round(1 / settings.pointsPerLkr));
  const offers = (summary?.upcomingOffers ?? []).filter((offer) => offer.isActive !== false && offer.id && offer.title);

  return (
    <section aria-labelledby="earn-heading" className={cn(panel, "flex flex-col")}>
      <div className="flex items-center justify-between gap-3">
        <h3 id="earn-heading" className={panelHeading}>
          Earn
        </h3>
        <Sparkles className="size-6 text-brand-500" aria-hidden="true" />
      </div>
      <ul data-stagger className="mt-4 flex flex-col divide-y divide-brand-100">
        <EarnRow
          art={<ShoppingBag className="size-5" aria-hidden="true" />}
          title="Orders"
          sub={`Min LKR ${lkr(settings.minOrderToEarn)}`}
          value={`1 point per LKR ${lkr(lkrPerPoint)} spent`}
        />
        {offers.map((offer) => (
          <EarnRow
            key={offer.id}
            art={
              <span aria-hidden="true" className="text-2xl leading-none">
                {offer.emoji || "✨"}
              </span>
            }
            tile="bg-sun-300/40"
            title={offer.title}
            sub={offer.description}
            value={offer.date}
          />
        ))}
      </ul>
      <ReferralLink />
    </section>
  );
}

function EarnRow({ art, tile = "bg-brand-50 text-brand-600", title, sub, value }: { art: ReactNode; tile?: string; title: string; sub?: string; value?: string }) {
  return (
    <li className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
      <span className={cn("grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl", tile)}>{art}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-brand-950">{title}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {value && <p className="max-w-[45%] shrink-0 text-right text-xs font-bold text-brand-600 sm:text-sm">{value}</p>}
    </li>
  );
}

/** Nothing to subscribe to: whether the browser can share doesn't change. */
const noSubscribe = () => () => {};

/**
 * The customer's referral code (formatReferralCode, which the backend reads back when a friend signs in with it) and
 * Copy link / Share for the sign-in link carrying it (/account/login?ref=CODE; the login page passes it on with the
 * code request). Share only where the browser can (mostly phones).
 */
function ReferralLink() {
  const { user } = useSignedInAccount();
  const code = formatReferralCode(user.id, user.name);
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === "function", () => false);
  const link = () => `${window.location.origin}/account/login?ref=${encodeURIComponent(code)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link());
      setCopied(true);
      toast.success("Referral link copied.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy the link. Your code is " + code + ".");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: "Bing Chun", text: "Join me on Bing Chun with my link:", url: link() });
    } catch {
      // Closed the share sheet: nothing to do.
    }
  };

  return (
    <div className="mt-5 rounded-2xl bg-cream-50 p-4 ring-1 ring-cream-200 ring-inset">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-600 ring-1 ring-cream-200">
          <UsersRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-brand-950">Invite friends</p>
          <p className="text-xs text-slate-600">Share your link. Friends who sign up with it are linked to your account.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code aria-label="Your referral code" className="font-numeric mr-auto rounded-lg bg-white px-3 py-1.5 text-sm font-extrabold tracking-[0.12em] text-brand-950 ring-1 ring-cream-200">
          {code}
        </code>
        <button type="button" onClick={() => void copy()} className={cn(smallButton, "bg-white ring-1 ring-cream-200 ring-inset")}>
          {copied ? <Check className="size-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" onClick={() => void share()} className={cn(smallButton, "bg-white ring-1 ring-cream-200 ring-inset")}>
            <Share2 className="size-3.5" aria-hidden="true" />
            Share
          </button>
        )}
      </div>
    </div>
  );
}
