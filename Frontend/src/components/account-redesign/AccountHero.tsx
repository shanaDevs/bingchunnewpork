"use client";

import { ChevronLeft, ChevronRight, PencilLine, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, type ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { heroBackdropImage } from "@/components/home-redesign/sections/hero/hero.config";
import type { User } from "@/types";
import { CountUp, useTitleMotion } from "./accountMotion";
import { accountPhone, type NavId } from "./AccountShell";
import { focusRing, MarkerHighlight, MemberAvatar } from "./accountUi";
import { dayPartAt, firstName, GREETINGS, useNow } from "./colomboTime";
import { lkr, PointsBar, tierLook, useHappyPoints } from "./rewardsParts";

/** Each page's name in the hero, its highlighted word on the yellow marker. */
const TITLES: Record<NavId, ReactNode> = {
  overview: (
    <>
      Your Little <MarkerHighlight>Happy Place.</MarkerHighlight>
    </>
  ),
  orders: (
    <>
      My <MarkerHighlight>Orders</MarkerHighlight>
    </>
  ),
  addresses: (
    <>
      My <MarkerHighlight>Addresses</MarkerHighlight>
    </>
  ),
  rewards: (
    <>
      My <MarkerHighlight>Rewards</MarkerHighlight>
    </>
  ),
  notifications: (
    <>
      My <MarkerHighlight>Notifications</MarkerHighlight>
    </>
  ),
  help: (
    <>
      Help &amp; <MarkerHighlight>Support</MarkerHighlight>
    </>
  ),
};

/**
 * The short blue band at the top of every redesigned /account page, behind the header, with the current page's name
 * as the h1. From lg it has no background of its own and sits in the shell's right column: the shell's blue runs
 * behind it and down the navigation column (where the customer's member card is), and the white page panel below
 * melts into it (AccountShell). Below lg the band is blue itself and melts at its bottom edge into drips
 * (melt-edge). On tablets (md to lg) the customer (picture, name, number, Edit) sits above the name, and the
 * navigation pills follow on the white. On phones (below md) the band depends on the page: the Overview, the
 * account's home, shows the customer greeted for the time of day and their points (PhonePoints) instead of its
 * name (kept for screen readers); every other page is a slim bar, a back button (BackLink) beside its name.
 * `user` is null until the session is known, and nothing personal shows meanwhile. `onEdit` opens the details
 * pop-up (ProfileDialog). On each page the name rises in and its highlighter swipes in behind the word (useTitleMotion).
 */
export function AccountHero({ page, user, onEdit }: { page: NavId; user: User | null; onEdit: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const home = page === "overview";
  useTitleMotion(titleRef, page);

  return (
    // Above the panel below it, so the drips fall over the sidebar's top; from lg, above the icing's sprinkles too, which
    // scatter up behind the name.
    <section className="relative isolate z-10 shrink-0 pt-22 text-snow lg:z-30 lg:col-start-2 lg:row-start-1 lg:pt-18">
      {/* Below lg, the band's own backdrop, masked into drips at its bottom edge. */}
      <div aria-hidden="true" className="melt-edge absolute inset-0 -z-10 lg:hidden" style={{ backgroundImage: heroBackdropImage }} />
      {/* Below lg, the desktop icing's sprinkles and tip shines (icing-decor) on the band and its drips, behind the
          content. Fades in as the page opens. */}
      <div
        aria-hidden="true"
        className="icing-decor pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[calc(var(--icing-height)+var(--icing-sprinkle-reach))] transition-opacity delay-200 duration-700 lg:hidden starting:opacity-0"
      />

      {/* Container's width and gutters below lg; from lg, the panel's padding, and no room under the name: the icing's
          sprinkles sit behind it. */}
      <div
        className={cn(
          "relative mx-auto w-full max-w-site px-5 pt-1 pb-[calc(var(--melt-height)+1rem)] sm:px-8 lg:max-w-none lg:px-0 lg:pt-0 lg:pb-0",
          // Phones: room above the drips for the sprinkles to scatter in, clear of the card or the slim bar.
          home ? "max-md:pb-[calc(var(--melt-height)+2.125rem)]" : "max-md:pb-[calc(var(--melt-height)+1.625rem)]",
        )}
      >
        {/* Reserves its height while the account loads, so the band doesn't grow. On phones only the home has it. */}
        <div className={cn("mb-3 min-h-11 lg:hidden", !home && "max-md:hidden")}>{user && <Customer user={user} onEdit={onEdit} />}</div>
        {home && <div className="min-h-30 md:hidden">{user && !user.isDeleted && <PhonePoints />}</div>}

        <div className="flex items-center gap-3">
          {!home && (
            <Suspense fallback={<BackLink toOrders={false} />}>
              <BackLinkFromParams page={page} />
            </Suspense>
          )}
          {/* The homepage section headings' type ("Find Your Next Favourite"), in white on the blue, with their tilted
              highlighter behind the highlighted words. Smaller on phones' slim bar. */}
          <h1
            ref={titleRef}
            className={cn(
              "font-display relative z-10 min-w-0 text-[clamp(2.25rem,4vw,3rem)] leading-[1.1] font-semibold tracking-[-0.01em] uppercase [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em] lg:pr-12 lg:pl-10 lg:text-[clamp(2rem,3.2vw,2.625rem)]",
              home ? "max-md:sr-only" : "max-md:text-[1.875rem]",
            )}
          >
            {TITLES[page]}
          </h1>
        </div>
      </div>
    </section>
  );
}

/**
 * Below lg: the customer's picture, name and number, and a labelled Edit button. On phones (the account's home) the
 * name gives way to a greeting for the time of day in Sri Lanka, with their first name.
 */
function Customer({ user, onEdit }: { user: User; onEdit: () => void }) {
  const part = dayPartAt(useNow());
  const phone = accountPhone(user);
  return (
    <div className="flex items-center gap-2.5">
      <MemberAvatar className="size-11" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold">
          <span className="md:hidden">{GREETINGS[part](firstName(user.name))}</span>
          <span className="max-md:hidden">{user.name}</span>
        </p>
        <p className="font-numeric truncate text-xs font-medium text-brand-100">{phone ?? "No mobile number yet"}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit your details"
        title="Edit your details"
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-semibold ring-1 ring-white/30 transition-colors ring-inset hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <PencilLine className="size-3.5" aria-hidden="true" />
        Edit
      </button>
    </div>
  );
}

/**
 * Phones, the account's home: the customer's points on an ice-blue card (the desktop member card's), the level
 * reached and the spend still to go to the next on a bar, the whole card opening Rewards.
 */
function PhonePoints() {
  const { balance, spend, tiers, current, currentIndex, next } = useHappyPoints();
  const TierIcon = current ? tierLook(currentIndex, tiers.length).icon : Sparkles;
  const spendValue = spend ?? 0;
  const toNext = next && spend != null ? `LKR ${lkr(next.minSpendLkr - spendValue)} to ${next.name}` : null;

  return (
    <Link
      href="/account/rewards"
      className={cn(
        "relative block overflow-hidden rounded-3xl bg-linear-to-br from-brand-100 to-brand-200 p-4 text-brand-950 shadow-[0_14px_30px_-12px_rgb(15_33_71/0.55)] transition-[scale] active:scale-[0.98]",
        focusRing,
        "focus-visible:outline-white",
      )}
    >
      {/* Decorative: a soft glow in the corner. */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-white/40" />

      <div className="relative flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff3b0,var(--color-sun-300)_45%,var(--color-sun-400))] shadow-[inset_0_-3px_6px_rgb(160_110_0/0.3),inset_0_2px_4px_rgb(255_255_255/0.6)] ring-3 ring-white/70"
        >
          <Star className="size-5 fill-white text-snow drop-shadow-[0_1px_2px_rgb(160_110_0/0.45)]" />
        </span>
        <p className="flex min-w-0 flex-1 items-end gap-1.5">
          {balance != null ? (
            <CountUp value={balance} className="font-numeric text-[1.75rem] leading-none font-extrabold tracking-tight" />
          ) : (
            <span className="font-numeric text-[1.75rem] leading-none font-extrabold tracking-tight text-brand-400">…</span>
          )}
          <span className="pb-0.5 text-sm font-bold text-brand-600">pts</span>
        </p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sun-300 px-2.5 py-1 text-xs font-bold whitespace-nowrap">
          <TierIcon className="size-3.5" aria-hidden="true" />
          {current ? `${current.name} member` : "New member"}
        </span>
        <ChevronRight className="size-5 shrink-0 text-brand-700" aria-hidden="true" />
      </div>

      <div className="relative mt-3">
        {next && toNext && spend != null ? (
          <>
            <PointsBar value={spendValue} goal={next.minSpendLkr} label={toNext} tone="ice" className="h-2.5" />
            <p className="mt-1.5 text-xs font-semibold text-brand-800">{toNext}</p>
          </>
        ) : (
          <p className="text-xs font-semibold text-brand-800">{current ? `You've reached ${current.name}, our top level` : ""}</p>
        )}
      </div>
    </Link>
  );
}

/** One order's details (`?ref=`) go back to My Orders; every other page to the account's home. Reads search params, so inside Suspense. */
function BackLinkFromParams({ page }: { page: NavId }) {
  const reference = useSearchParams().get("ref");
  return <BackLink toOrders={page === "orders" && reference !== null} />;
}

/** Phones, every page but the home: the round back button on the slim bar. */
function BackLink({ toOrders }: { toOrders: boolean }) {
  const label = toOrders ? "Back to My Orders" : "Back to My Account";
  return (
    <Link
      href={toOrders ? "/account/orders" : "/account"}
      aria-label={label}
      title={label}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 transition-[background-color,scale] ring-inset hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-92 md:hidden"
    >
      <ChevronLeft className="size-5" aria-hidden="true" />
    </Link>
  );
}
