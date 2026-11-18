"use client";

import { ArrowLeft, Bike, Check, ChevronDown, ChevronRight, Clock, Hash, House, LoaderCircle, Receipt, ReceiptText, Search, Store, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import type { Order } from "@/types";
import { useMyOrders } from "../accountData";
import { LiveOrderRow } from "../AccountHome";
import { useNow } from "../colomboTime";
import { BrowseMenuLink, card, cardFrame, focusRing, primaryButton, secondaryButton } from "../accountUi";
import {
  DoneBadge,
  formatLkr,
  formatWith,
  isDelivery,
  isLive,
  ItemPhoto,
  LiveBadge,
  OrderThumbs,
  OrderTypeBadge,
  orderEta,
  orderHref,
  PLACED_FORMAT,
  ReorderButton,
  STATUS_MASCOTS,
  statusHeadline,
  StepsRow,
  TIME_FORMAT,
  itemsSummary,
} from "./orderParts";
import { ReceiptDialog } from "./ReceiptDialog";
import { OrderTrackDetails } from "./tracking/OrderTrackDetails";
import { useOrderTracking } from "./tracking/useOrderTracking";

const sectionHeading = "font-display-condensed text-2xl leading-none text-brand-950 uppercase sm:text-3xl";
/** Phones: each month's heading over its orders, and the date on a row ("26 Oct, 3:40 pm"; the heading has the year). */
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: "long", year: "numeric", timeZone: "Asia/Colombo" };
const ROW_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Colombo" };
const formatPlaced = formatWith(PLACED_FORMAT);
const formatTime = formatWith(TIME_FORMAT);
/** "2026-10": the month in Sri Lanka an order was placed in. */
const colomboMonth = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 7);

/** The filters the old My Orders page had, kept: status, type, time and sort, plus a search. */
type StatusFilter = "ALL" | "ACTIVE" | "DELIVERED" | "CANCELLED";
type ModeFilter = "ALL" | "DELIVERY" | "TAKEAWAY";
type RangeFilter = "ALL" | "7D" | "30D" | "90D";
type SortFilter = "NEWEST" | "OLDEST" | "TOTAL";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "DELIVERED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];
const MODE_FILTERS: { value: ModeFilter; label: string }[] = [
  { value: "ALL", label: "All types" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "TAKEAWAY", label: "Pickup" },
];
const RANGE_FILTERS: { value: RangeFilter; label: string; days?: number }[] = [
  { value: "ALL", label: "All time" },
  { value: "7D", label: "Last 7 days", days: 7 },
  { value: "30D", label: "Last 30 days", days: 30 },
  { value: "90D", label: "Last 3 months", days: 90 },
];
const SORT_FILTERS: { value: SortFilter; label: string }[] = [
  { value: "NEWEST", label: "Newest" },
  { value: "OLDEST", label: "Oldest" },
  { value: "TOTAL", label: "Highest total" },
];

/**
 * My Orders: the customer's orders from the backend (GET /orders/my, the latest 50), newest first. Orders still under
 * way come first, under "Happening now", then the rest under "Past orders", with the old page's search and filters
 * above them. `?ref=<order number>` opens one order's details, live, with everything the old tracking page had (pay
 * again, cancel, the queue, the steps, the QR code, the map and rider, the delivery code, ratings) and its receipt
 * and Order again. The printable receipt opens in a pop-up (ReceiptDialog; /order/…/receipt is still its own page for shared links); the public tracking page (/order/…)
 * stays for guests and for coming back from checkout and payment.
 * Phones get their own, shorter list (PhoneOrders); the cards are from md up. Inside Suspense: it reads search params.
 */
export function OrdersView() {
  return (
    <Suspense fallback={null}>
      <Orders />
    </Suspense>
  );
}

function Orders() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reference = searchParams.get("ref");
  const { data: orders = [], isLoading, isError, refetch } = useMyOrders();
  const filters = useOrderFilters(orders);
  const celebrated = useRef(false);

  // Kept from the old page: after checkout (?celebrate=1), go to the new order's tracking, or say it was placed.
  useEffect(() => {
    if (celebrated.current || searchParams.get("celebrate") !== "1") return;
    celebrated.current = true;
    const orderNumber = searchParams.get("order");
    if (orderNumber) {
      router.replace(`/order/${encodeURIComponent(orderNumber)}`);
      return;
    }
    toast.success("Order placed successfully!", { duration: 4000 });
    router.replace("/account/orders", { scroll: false });
  }, [searchParams, router]);

  if (reference !== null) return <OrderDetailsLoader key={reference} reference={reference} orders={orders} listLoading={isLoading} />;

  if (isLoading) return <Loading text="Loading your orders…" />;

  if (isError) {
    return (
      <EmptyCard icon={ReceiptText} title="We couldn't load your orders" text="Check your connection and try again.">
        <button type="button" onClick={() => void refetch()} className={cn(primaryButton, "mt-6")}>
          Try again
        </button>
      </EmptyCard>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyCard icon={ReceiptText} title="No orders yet" text="Your orders will show up here once you've placed one.">
        <BrowseMenuLink className="mt-6" />
      </EmptyCard>
    );
  }

  const live = filters.orders.filter(isLive);
  const past = filters.orders.filter((order) => !isLive(order));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:gap-8">
      <OrderFilters filters={filters} />
      {filters.orders.length === 0 ? (
        <EmptyCard icon={Search} title="No orders match" text="Try another search, or clear the filters.">
          <button type="button" onClick={filters.clear} className={cn(secondaryButton, "mt-6")}>
            Clear filters
          </button>
        </EmptyCard>
      ) : (
        <>
          <PhoneOrders live={live} past={past} />
          {live.length === 0 ? (
            <OrderList orders={past} className="max-md:hidden" />
          ) : (
            <div className="grid gap-8 max-md:hidden sm:gap-10">
              <section aria-labelledby="live-orders">
                <h2 id="live-orders" className={sectionHeading}>
                  Happening now
                </h2>
                <ul data-stagger className="mt-4 grid gap-4 sm:gap-5">
                  {live.map((order) => (
                    <LiveOrderCard key={order.id} order={order} />
                  ))}
                </ul>
              </section>
              {past.length > 0 && (
                <section aria-labelledby="past-orders">
                  <h2 id="past-orders" className={sectionHeading}>
                    Past orders
                  </h2>
                  <OrderList orders={past} className="mt-4" />
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The old page's filtering and sorting, unchanged; `orders` is the result. */
function useOrderFilters(all: Order[]) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [mode, setMode] = useState<ModeFilter>("ALL");
  const [range, setRange] = useState<RangeFilter>("ALL");
  const [sort, setSort] = useState<SortFilter>("NEWEST");
  // When the time filter last changed: the cutoff counts back from then.
  const [rangeFrom, setRangeFrom] = useState(0);

  const orders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const days = RANGE_FILTERS.find((option) => option.value === range)?.days;
    const cutoff = days ? rangeFrom - days * 24 * 60 * 60 * 1000 : null;
    const next = all.filter((order) => {
      if (status === "ACTIVE" && !isLive(order)) return false;
      if (status === "DELIVERED" && order.status !== "DELIVERED") return false;
      if (status === "CANCELLED" && order.status !== "CANCELLED") return false;
      if (mode !== "ALL" && order.orderMode !== mode) return false;
      if (cutoff && new Date(order.createdAt).getTime() < cutoff) return false;
      if (query) {
        const found =
          order.orderNumber.toLowerCase().includes(query) ||
          order.items?.some((item) => item.productName?.toLowerCase().includes(query)) ||
          order.store?.name?.toLowerCase().includes(query);
        if (!found) return false;
      }
      return true;
    });
    next.sort((a, b) => {
      if (sort === "OLDEST") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "TOTAL") return b.total - a.total;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return next;
  }, [all, search, status, mode, range, rangeFrom, sort]);

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { ALL: all.length, ACTIVE: 0, DELIVERED: 0, CANCELLED: 0 };
    for (const order of all) {
      if (isLive(order)) result.ACTIVE++;
      else if (order.status === "DELIVERED") result.DELIVERED++;
      else if (order.status === "CANCELLED") result.CANCELLED++;
    }
    return result;
  }, [all]);

  const active = search.trim() !== "" || status !== "ALL" || mode !== "ALL" || range !== "ALL" || sort !== "NEWEST";
  const clear = () => {
    setSearch("");
    setStatus("ALL");
    setMode("ALL");
    setRange("ALL");
    setSort("NEWEST");
  };

  return {
    orders,
    counts,
    active,
    clear,
    search,
    setSearch,
    status,
    setStatus,
    mode,
    setMode,
    range,
    setRange: (value: RangeFilter) => {
      setRange(value);
      setRangeFrom(Date.now());
    },
    sort,
    setSort,
  };
}

/**
 * A filter picker in the redesign's look, in place of a native <select> (whose list the browser draws): a pill with
 * the choice and a chevron, opening a rounded list with the chosen one ticked. A listbox for the keyboard: arrows,
 * Home/End, Enter or Space to choose, Escape or Tab to close; a press anywhere else closes it too.
 */
function FilterSelect<T extends string>({ label, value, options, onChange, align = "start" }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; align?: "start" | "end" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const show = () => {
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const choose = (option: { value: T }) => {
    onChange(option.value);
    close();
  };

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: active === last ? 0 : active + 1, ArrowUp: active === 0 ? last : active - 1, Home: 0, End: last };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
        className={cn(
          "inline-flex h-10 items-center gap-1.5 rounded-full bg-white pr-3 pl-4 text-sm font-semibold whitespace-nowrap text-brand-800 ring-1 ring-brand-100 transition-colors ring-inset hover:bg-brand-50",
          open && "bg-brand-50 ring-brand-300",
          focusRing,
        )}
      >
        {current.label}
        <ChevronDown className={cn("size-4 text-brand-600 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          className={cn(
            "absolute top-full z-30 mt-2 min-w-44 rounded-2xl bg-white p-1.5 shadow-xl shadow-brand-950/15 ring-1 ring-brand-100 outline-none transition-[opacity,translate] duration-150 starting:-translate-y-1 starting:opacity-0",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {options.map((option, index) => {
            const chosen = option.value === value;
            return (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={chosen}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(option)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
                  index === active && "bg-brand-50",
                  chosen ? "text-brand-700" : "text-slate-700",
                )}
              >
                {option.label}
                {chosen && <Check className="size-4 shrink-0 text-brand-600" strokeWidth={3} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Search, the status chips (with how many of each) and the type, time and sort pickers; Clear once any is set. */
function OrderFilters({ filters }: { filters: ReturnType<typeof useOrderFilters> }) {
  return (
    <section aria-label="Find an order" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">Search your orders</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => filters.setSearch(event.target.value)}
            placeholder="Order number, drink or branch"
            className="h-11 w-full rounded-full bg-slate-50/70 pr-4 pl-10 text-sm font-medium text-brand-950 ring-1 ring-slate-200 outline-none ring-inset placeholder:font-normal placeholder:text-slate-400 hover:ring-slate-300 focus:bg-white focus:shadow-[0_0_0_4px_rgb(48_121_234/0.14)] focus:ring-brand-500"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Order type" value={filters.mode} options={MODE_FILTERS} onChange={filters.setMode} />
          <FilterSelect label="Time" value={filters.range} options={RANGE_FILTERS} onChange={filters.setRange} />
          <FilterSelect label="Sort by" value={filters.sort} options={SORT_FILTERS} onChange={filters.setSort} align="end" />
        </div>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] max-md:-mx-5 max-md:px-5 max-md:sm:-mx-8 max-md:sm:px-8 [&::-webkit-scrollbar]:hidden">
        {STATUS_FILTERS.map((option) => {
          const chosen = filters.status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={chosen}
              onClick={() => filters.setStatus(option.value)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                chosen ? "bg-brand-600 text-snow shadow-md shadow-brand-600/25" : "bg-brand-50 text-brand-800 hover:bg-brand-100",
                focusRing,
              )}
            >
              {option.label}
              <span className={cn("font-numeric rounded-full px-1.5 text-xs", chosen ? "bg-white/20" : "bg-white text-brand-600")}>{filters.counts[option.value]}</span>
            </button>
          );
        })}
        {filters.active && (
          <button type="button" onClick={filters.clear} className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-slate-500 hover:text-brand-950", focusRing)}>
            <X className="size-4" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>
    </section>
  );
}

function OrderList({ orders, className }: { orders: Order[]; className?: string }) {
  return (
    <ul data-stagger className={cn("grid gap-4 sm:gap-5", className)}>
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </ul>
  );
}

/**
 * Phones: the orders under way first (the account home's compact card), then the others month by month, each
 * month's orders as rows on one card (PhoneOrderRow).
 */
function PhoneOrders({ live, past }: { live: Order[]; past: Order[] }) {
  const months = new Map<string, Order[]>();
  for (const order of past) {
    const month = colomboMonth(order.createdAt);
    months.set(month, [...(months.get(month) ?? []), order]);
  }
  const groupHeading = "px-1 text-xs font-bold tracking-[0.14em] text-slate-500 uppercase";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:hidden">
      {live.length > 0 && (
        <section aria-labelledby="phone-live-orders">
          <h2 id="phone-live-orders" className={groupHeading}>
            Happening now
          </h2>
          <ul data-stagger className="mt-2.5 grid gap-3">
            {live.map((order) => (
              <LiveOrderRow key={order.id} order={order} />
            ))}
          </ul>
        </section>
      )}
      {[...months].map(([month, orders]) => (
        <section key={month} aria-labelledby={`month-${month}`}>
          <h2 id={`month-${month}`} className={groupHeading}>
            {formatWith(MONTH_FORMAT)(orders[0].createdAt)}
          </h2>
          <ul data-stagger className={cn(cardFrame, "mt-2.5 divide-y divide-brand-100 overflow-hidden")}>
            {orders.map((order) => (
              <PhoneOrderRow key={order.id} order={order} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Phones: one order as a row, the whole row opening its details: the first item's photo (+N for the rest), the
 * order number, when and how (and Cancelled, if it was), the total and a small Reorder.
 */
function PhoneOrderRow({ order }: { order: Order }) {
  const first = order.items?.[0];
  const extra = (order.items?.length ?? 0) - 1;
  const TypeIcon = isDelivery(order) ? Bike : Store;
  const cancelled = order.status === "CANCELLED";

  return (
    <li className="relative flex items-center gap-3 px-3.5 py-3 transition-colors has-[a:active]:bg-brand-50">
      <span aria-hidden="true" className="relative flex size-13 shrink-0 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100 ring-inset">
        {first && <ItemPhoto item={first} grey={cancelled} className="size-11" />}
        {extra > 0 && <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-brand-600 px-1.5 text-[0.625rem] leading-4 font-bold text-snow ring-2 ring-white">+{extra}</span>}
      </span>
      <div className="min-w-0 flex-1">
        {/* The link covers the whole row (Reorder sits above it). */}
        <Link
          href={orderHref(order)}
          aria-label={`View details: order ${order.orderNumber}`}
          className="font-numeric block truncate text-[0.9375rem] font-extrabold tracking-wide text-brand-950 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand-600"
        >
          #{order.orderNumber}
        </Link>
        <p className="mt-0.5 flex items-center gap-1 text-xs whitespace-nowrap text-slate-500">
          <time dateTime={order.createdAt}>{formatWith(ROW_FORMAT)(order.createdAt)}</time>
          <span aria-hidden="true">·</span>
          <TypeIcon className="size-3 shrink-0" aria-hidden="true" />
          {isDelivery(order) ? "Delivery" : "Pickup"}
        </p>
        {/* On a line of its own: the date's line has no room left for it. */}
        {cancelled && <p className="mt-0.5 text-xs font-semibold text-rose-600">Cancelled</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="font-numeric text-sm font-extrabold text-brand-600">{formatLkr(order.total)}</span>
        <ReorderButton order={order} compact className="relative z-10" />
      </div>
    </li>
  );
}

/**
 * An order under way: the mascot and where it is, when it should be ready or arrive (the kitchen's estimate), the
 * steps in a row (names from sm), the queue position or the delivery address, the items and total, and Track order
 * (its details, which link on to the live tracking). Follows the backend: My Orders refetches every 30 seconds while
 * an order is under way.
 */
function LiveOrderCard({ order }: { order: Order }) {
  const eta = orderEta(order);
  const titleId = `live-${order.id}`;

  return (
    <li aria-labelledby={titleId} className={cn(cardFrame, "overflow-hidden")}>
      <div className="bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-cream-50))] p-5 sm:p-6 lg:py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Image {...STATUS_MASCOTS[order.status]} alt="" data-pop sizes="96px" className="size-20 shrink-0 object-contain sm:size-24 lg:size-18" />
            <div className="min-w-0">
              <h3 id={titleId} aria-live="polite" className="font-display-condensed text-[1.75rem] leading-none text-brand-950 uppercase sm:text-4xl lg:text-[2rem]">
                {statusHeadline(order)}
              </h3>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-slate-500">
                <LiveBadge>Live</LiveBadge>
                <OrderTypeBadge order={order} />
                <span>
                  <span className="font-numeric font-bold tracking-wide text-brand-950">#{order.orderNumber}</span> · <time dateTime={order.createdAt}>{formatPlaced(order.createdAt)}</time>
                </span>
              </p>
            </div>
          </div>
          {eta && <EtaBox order={order} eta={eta} />}
        </div>
        <StepsRow order={order} className="mt-5 lg:mt-3" />
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:py-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-center">
        <OrderFact order={order} />
        <div className="flex items-center gap-3 rounded-2xl bg-brand-50/60 p-3 ring-1 ring-brand-100 ring-inset">
          <OrderThumbs order={order} max={3} />
          <p className="line-clamp-2 min-w-0 flex-1 text-sm text-slate-700">{itemsSummary(order)}</p>
          <p className="font-numeric shrink-0 text-base font-extrabold text-brand-600">{formatLkr(order.total)}</p>
        </div>
        <div className="sm:col-span-2 xl:col-span-1">
          <Link href={orderHref(order)} className={cn(primaryButton, "w-full sm:w-auto xl:whitespace-nowrap")}>
            Track order
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}

/** "Ready by 3:45 PM" (pickup) or "Arriving by" (delivery), from the kitchen's estimate, with how long that is from now. */
function EtaBox({ order, eta }: { order: Order; eta: Date }) {
  const now = useNow();
  const minutesLeft = Math.ceil((eta.getTime() - now.getTime()) / 60_000);
  return (
    <p className="flex items-center justify-between gap-4 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-brand-100 ring-inset sm:block sm:shrink-0 sm:text-center lg:py-2">
      <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase sm:block">{isDelivery(order) ? "Arriving by" : "Ready by"}</span>
      <span className="block text-right sm:text-center">
        <span className="font-numeric block text-2xl leading-tight font-extrabold text-brand-950 sm:text-3xl">{formatTime(eta)}</span>
        <span className="block text-xs text-slate-500">{minutesLeft > 0 ? `in about ${minutesLeft} min` : "any moment now"}</span>
      </span>
    </p>
  );
}

/** The live order's handy fact: the delivery code to give the rider, the place in the pickup queue, or where it's going. */
function OrderFact({ order }: { order: Order }) {
  const box = "flex items-center gap-3 rounded-2xl bg-brand-50/60 p-3 ring-1 ring-brand-100 ring-inset";
  const icon = "grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand-600 ring-1 ring-brand-100 ring-inset";
  if (isDelivery(order) && order.deliveryCode) {
    return (
      <div className={box}>
        <span className={icon}>
          <Hash className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-display-condensed text-2xl leading-none tracking-wider text-brand-600">{order.deliveryCode}</p>
          <p className="mt-0.5 text-xs text-slate-600">Give this code to your rider</p>
        </div>
      </div>
    );
  }
  if (!isDelivery(order) && order.queuePosition) {
    return (
      <div className={box}>
        <span className={icon}>
          <Hash className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-display-condensed text-2xl leading-none text-brand-600">No. {order.queuePosition} in the queue</p>
          <p className="mt-0.5 text-xs text-slate-600">Pick up at {order.store?.name}</p>
        </div>
      </div>
    );
  }
  const where = isDelivery(order) ? [order.deliveryAddressLine ?? order.address?.addressLine, order.deliveryCity ?? order.address?.city].filter(Boolean).join(", ") : order.store?.name;
  return (
    <div className={box}>
      <span className={icon}>{isDelivery(order) ? <House className="size-5" aria-hidden="true" /> : <Store className="size-5" aria-hidden="true" />}</span>
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">{isDelivery(order) ? "Delivering to" : "Pick up at"}</p>
        <p className="truncate text-sm font-bold text-brand-950">{where || "Bing Chun"}</p>
      </div>
    </div>
  );
}

/** One order in the list: number, type, date and branch, the items, the total, View details, Receipt and Reorder. */
function OrderCard({ order }: { order: Order }) {
  const titleId = `order-${order.id}`;
  return (
    <li aria-labelledby={titleId} className={cn(card, "p-5 sm:p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span id={titleId} className="font-numeric text-lg font-extrabold tracking-wide text-brand-950">
              #{order.orderNumber}
            </span>
            <OrderTypeBadge order={order} />
            <DoneBadge order={order} />
          </p>
          <p className="mt-1 text-sm text-slate-500">
            <time dateTime={order.createdAt}>{formatPlaced(order.createdAt)}</time> · {order.store?.name ?? "Bing Chun"}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">Total</span>
          <span className="font-numeric text-xl font-extrabold text-brand-600">{formatLkr(order.total)}</span>
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-50/60 p-3 ring-1 ring-brand-100 ring-inset">
        <OrderThumbs order={order} />
        <p className="line-clamp-2 min-w-0 flex-1 text-sm text-slate-700">{itemsSummary(order)}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={orderHref(order)} className={secondaryButton}>
          View details
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
        <ReceiptButton order={order} className={secondaryButton} />
        <ReorderButton order={order} />
      </div>
    </li>
  );
}

/** The Receipt button: opens the order's receipt in a pop-up over the page (ReceiptDialog). */
function ReceiptButton({ order, className }: { order: Order; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        <Receipt className="size-4" aria-hidden="true" />
        Receipt
      </button>
      {open && <ReceiptDialog orderNumber={order.orderNumber} onClose={() => setOpen(false)} />}
    </>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <p role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
      <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden="true" />
      {text}
    </p>
  );
}

function EmptyCard({ icon: Icon, title, text, children }: { icon: typeof ReceiptText; title: string; text: string; children?: ReactNode }) {
  return (
    <div className={cn(card, "flex flex-col items-center px-6 py-10 text-center sm:py-14")}>
      <span className="grid size-16 place-items-center rounded-[1.25rem] bg-brand-50 text-brand-600">
        <Icon className="size-8" aria-hidden="true" />
      </span>
      <p className="mt-4 text-lg font-bold text-brand-950">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{text}</p>
      {children}
    </div>
  );
}

/** Not on phones, where the hero's back button goes back to My Orders from an order (AccountHero). */
function BackToOrders() {
  return (
    <Link href="/account/orders" className={cn("mb-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-50 pr-4 pl-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 max-md:hidden", focusRing)}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to My Orders
    </Link>
  );
}

/**
 * The order for `?ref=`, live (useOrderTracking: GET /orders/:number, which only gives the customer their own orders,
 * with the order's socket); shown at once from My Orders while it loads when it's one of the latest 50.
 */
function OrderDetailsLoader({ reference, orders, listLoading }: { reference: string; orders: Order[]; listLoading: boolean }) {
  const tracking = useOrderTracking(
    reference,
    orders.find((order) => order.orderNumber === reference),
  );
  if (tracking.order) {
    return (
      <OrderTrackDetails
        tracking={tracking}
        order={tracking.order}
        reference={reference}
        header={<BackToOrders />}
        phoneBar="account"
      />
    );
  }
  if (listLoading || tracking.isLoading) return <Loading text="Loading your order…" />;
  return (
    <>
      <BackToOrders />
      <EmptyCard
        icon={ReceiptText}
        title={tracking.error ? "We couldn't find that order" : "Order not found"}
        text="It may have been placed as a guest or from another account. Guest orders can be tracked from the link in their confirmation."
      />
    </>
  );
}
