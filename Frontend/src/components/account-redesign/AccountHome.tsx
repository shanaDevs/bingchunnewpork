"use client";

import { ChevronRight, Smile, X, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import type { Order, Product } from "@/types";
import { ACTIVE_STATUSES, useAddresses, useMyOrders } from "./accountData";
import { accountNav, useSignedInAccount } from "./AccountShell";
import { focusRing } from "./accountUi";
import { dayPartAt, useNow, type DayPart } from "./colomboTime";
import { LiveBadge, orderHref, STATUS_MASCOTS, statusHeadline } from "./orders/orderParts";
import { MoodPicker } from "./overview/MoodPicker";
import { useProductDrawer } from "./overview/useProductDrawer";
import { useHappyPoints } from "./rewardsParts";

/**
 * The account's home on phones (below md), in place of the Overview's "Today" sections: the orders under way, the
 * other account pages as a list (with the mood picker, in a sheet), and Log Out under it. Tablets and desktop have
 * the shell's navigation instead, so all of it is hidden from md.
 */

/** Each order still under way (GET /orders/my), as a card opening its tracking page; nothing when there are none. */
export function PhoneLiveOrders() {
  const { data: orders = [] } = useMyOrders();
  const live = orders.filter((order) => ACTIVE_STATUSES.includes(order.status));
  if (live.length === 0) return null;

  return (
    <section aria-label="Happening now" className="md:hidden">
      <ul data-stagger className="grid gap-3">
        {live.map((order) => (
          <LiveOrderRow key={order.id} order={order} />
        ))}
      </ul>
    </section>
  );
}

/** One order under way: the mascot for its step, Live, the step, and the order's number and branch; opens its details. Also My Orders' on phones. */
export function LiveOrderRow({ order }: { order: Order }) {
  return (
    <li>
      <Link
        href={orderHref(order)}
        aria-label={`Track order ${order.orderNumber}`}
        className={cn(
          "flex items-center gap-3 rounded-3xl bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-cream-50))] p-3 pr-4 shadow-[0_18px_40px_-28px_rgb(15_33_71/0.55)] ring-1 ring-brand-100 transition-[scale] active:scale-[0.98]",
          focusRing,
        )}
      >
        <Image {...STATUS_MASCOTS[order.status]} alt="" data-pop sizes="64px" className="size-16 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <LiveBadge compact>Live</LiveBadge>
          <p aria-live="polite" className="mt-1.5 font-display-condensed text-xl leading-none text-brand-950 uppercase">
            {statusHeadline(order)}
          </p>
          <p className="mt-1 truncate text-xs text-slate-600">
            <span className="font-numeric font-bold text-brand-950">#{order.orderNumber}</span> · {order.store?.name}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * The account's other pages as one list, app-style: each its icon on a tile, its name, a figure where there is one
 * (how many orders, addresses saved, the points balance) and a chevron. After Rewards, "Find my mood drink" opens
 * the Overview's mood picker in a sheet (MoodSheet), starting on the mood that suits the time of day.
 */
export function PhoneAccountMenu() {
  const { data: orders } = useMyOrders();
  const { data: addresses } = useAddresses();
  const { balance, summary } = useHappyPoints();
  const part = dayPartAt(useNow());
  const [moodOpen, setMoodOpen] = useState(false);
  // Ordering from the mood sheet: the sheet closes first (the drawer can't open over a modal sheet), then the drawer.
  const { open: openProduct, drawer } = useProductDrawer();
  const count = (n: number | undefined, one: string, many: string) => (n === undefined ? undefined : n === 0 ? "None yet" : `${n} ${n === 1 ? one : many}`);
  const figures: Partial<Record<(typeof accountNav)[number]["id"], string>> = {
    orders: count(orders?.length, "order", "orders"),
    addresses: count(addresses?.length, "saved", "saved"),
    rewards: summary && balance != null ? `${balance.toLocaleString("en-US")} pts` : undefined,
  };
  const rowClass = cn("flex min-h-15 w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors active:bg-brand-50", focusRing, "focus-visible:-outline-offset-2");

  return (
    <nav aria-label="Account" className="md:hidden">
      <ul data-stagger className="divide-y divide-brand-100 overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-34px_rgb(15_33_71/0.5)] ring-1 ring-brand-100">
        {accountNav
          .filter(({ id }) => id !== "overview")
          .flatMap(({ id, label, href, icon }) => {
            const page = (
              <li key={id}>
                <Link href={href} className={rowClass}>
                  <MenuRow icon={icon} label={label} figure={figures[id]} />
                </Link>
              </li>
            );
            if (id !== "rewards") return [page];
            return [
              page,
              <li key="mood">
                <button type="button" onClick={() => setMoodOpen(true)} aria-haspopup="dialog" className={rowClass}>
                  <MenuRow icon={Smile} label="Find my mood drink" />
                </button>
              </li>,
            ];
          })}
      </ul>
      {moodOpen && (
        <MoodSheet
          part={part}
          onClose={() => setMoodOpen(false)}
          onOrder={(product) => {
            setMoodOpen(false);
            openProduct(product);
          }}
        />
      )}
      {drawer}
    </nav>
  );
}

/** One row's content: the icon on its tile, the name, the figure (if any) and the chevron. */
function MenuRow({ icon: Icon, label, figure }: { icon: LucideIcon; label: string; figure?: ReactNode }) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-brand-950">{label}</span>
      {figure && <span className="font-numeric shrink-0 text-sm font-semibold text-slate-500">{figure}</span>}
      <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
    </>
  );
}

/**
 * The mood picker (moods, Surprise me, the picks) in a sheet up from the bottom: a native modal <dialog> like the
 * profile pop-up (the page behind is inert; Escape, the close button or a tap outside closes it). The sheet's title
 * is the picker's heading.
 */
function MoodSheet({ part, onClose, onOrder }: { part: DayPart; onClose: () => void; onOrder: (product: Product) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    unmounting.current = false;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      unmounting.current = true;
      dialog.close();
      document.documentElement.style.removeProperty("overflow");
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="mood-sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A close the browser forces (e.g. repeated Escape) still leaves the sheet; skip the one from unmounting.
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Only a press and release both outside the sheet; a swipe through the picks ending outside doesn't close.
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent p-0 backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex"
    >
      <div className="relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-white text-slate-900 shadow-2xl shadow-brand-950/30 transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0">
        <header className="shrink-0 px-5 pt-6 pr-18 sm:px-8">
          <h2
            id="mood-sheet-title"
            className="font-display text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.01em] text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em]"
          >
            What&apos;s Your Mood?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn("absolute top-5 right-5 grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100", focusRing)}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>
        {/* The gutters match the page's (px-5, sm:px-8), which the picker's swipe rows reach out over. Clear of the iPhone home indicator. */}
        <div className="min-h-0 overflow-y-auto px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">
          <MoodPicker part={part} titleId="mood-sheet-title" onOrder={onOrder} />
        </div>
      </div>
    </dialog>
  );
}

/** Log Out, right under the list on the account's home. */
export function PhoneLogOut() {
  const { logOut } = useSignedInAccount();
  return (
    <button
      type="button"
      onClick={logOut}
      className={cn(
        "flex h-12 w-full items-center justify-center rounded-full bg-rose-50 text-[0.9375rem] font-semibold text-rose-700 ring-1 ring-rose-100 transition-[background-color,scale] ring-inset active:scale-[0.98] active:bg-rose-100 md:hidden",
        focusRing,
      )}
    >
      Log Out
    </button>
  );
}
