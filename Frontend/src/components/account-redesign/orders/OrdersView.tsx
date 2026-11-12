"use client";

import { ArrowLeft, Banknote, Bike, Check, ChevronDown, ChevronRight, Clock, CreditCard, Gift, Hash, House, LoaderCircle, MapPin, Receipt, ReceiptText, Search, Store, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { cancellationReasonLabel } from "@/lib/cancellationReasons";
import { formatRefundAmount } from "@/lib/orderCancel";
import type { Order, PaymentMethod } from "@/types";
import { itemOptionLine } from "@/lib/receipt";
import { useMyOrders } from "../accountData";
import { LiveOrderRow } from "../AccountHome";
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
  orderEtaMinutes,
  orderHref,
  PLACED_FORMAT,
  ReorderButton,
  STATUS_MASCOTS,
  statusHeadline,
  StepsRow,
  useAgainStatuses,
  itemsSummary,
  type AgainStatus,
} from "./orderParts";
import { ReceiptDialog } from "./ReceiptDialog";
import { DeliveredCelebration } from "./tracking/DeliveredCelebration";
import { PlatformRating, RiderRating } from "./tracking/RatingCards";
import { BranchCard, DeliveryCodeCard, LiveMapCard, PickupQrCard, ProgressCard, RiderCard } from "./tracking/TrackingCards";
import { CancelNotice, PaymentNotice, StatusHero } from "./tracking/TrackingStatus";
import { useOrderTracking, type OrderTracking } from "./tracking/useOrderTracking";

const sectionHeading = "font-display-condensed text-2xl leading-none text-brand-950 uppercase sm:text-3xl";
/** Phones: each month's heading over its orders, and the date on a row ("26 Oct, 3:40 pm"; the heading has the year). */
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: "long", year: "numeric", timeZone: "Asia/Colombo" };
const ROW_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Colombo" };
const PICKUP_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Colombo" };
const formatPlaced = formatWith(PLACED_FORMAT);

function isCompletedOrder(order: Order) {
  return order.status === "DELIVERED" || (order.orderMode === "TAKEAWAY" && order.status === "READY");
}

const DEFAULT_FILTER = {
  search: "",
  status: "ALL" as StatusFilter,
  mode: "ALL" as ModeFilter,
  range: "ALL" as RangeFilter,
  sort: "NEWEST" as SortFilter,
};

function readOrderListFilters(params: URLSearchParams) {
  const status = params.get("status");
  const mode = params.get("mode");
  const range = params.get("range");
  const sort = params.get("sort");
  return {
    search: params.get("q") ?? DEFAULT_FILTER.search,
    status: STATUS_FILTERS.some((option) => option.value === status) ? (status as StatusFilter) : DEFAULT_FILTER.status,
    mode: MODE_FILTERS.some((option) => option.value === mode) ? (mode as ModeFilter) : DEFAULT_FILTER.mode,
    range: RANGE_FILTERS.some((option) => option.value === range) ? (range as RangeFilter) : DEFAULT_FILTER.range,
    sort: SORT_FILTERS.some((option) => option.value === sort) ? (sort as SortFilter) : DEFAULT_FILTER.sort,
  };
}
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

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CARD: "Card",
  PAYHERE: "Paid online",
  CASH_AT_COUNTER: "Cash",
  LOYALTY_POINTS: "Loyalty points",
};

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = readOrderListFilters(searchParams);
  const [search, setSearch] = useState(initial.search);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [mode, setMode] = useState<ModeFilter>(initial.mode);
  const [range, setRange] = useState<RangeFilter>(initial.range);
  const [sort, setSort] = useState<SortFilter>(initial.sort);
  // When the time filter last changed: the cutoff counts back from then.
  const [rangeFrom, setRangeFrom] = useState(() => (initial.range === "ALL" ? 0 : Date.now()));

  const syncUrl = useCallback(
    (next: typeof DEFAULT_FILTER) => {
      const params = new URLSearchParams(searchParams.toString());
      const ref = params.get("ref");
      const celebrate = params.get("celebrate");
      const order = params.get("order");
      const query = new URLSearchParams();
      if (ref) query.set("ref", ref);
      if (celebrate) query.set("celebrate", celebrate);
      if (order) query.set("order", order);
      const trimmed = next.search.trim();
      if (trimmed) query.set("q", trimmed);
      if (next.status !== "ALL") query.set("status", next.status);
      if (next.mode !== "ALL") query.set("mode", next.mode);
      if (next.range !== "ALL") query.set("range", next.range);
      if (next.sort !== "NEWEST") query.set("sort", next.sort);
      const qs = query.toString();
      router.replace(qs ? `/account/orders?${qs}` : "/account/orders", { scroll: false });
    },
    [router, searchParams],
  );

  const patchFilters = useCallback(
    (patch: Partial<typeof DEFAULT_FILTER>) => {
      const next = { search, status, mode, range, sort, ...patch };
      if (patch.search !== undefined) setSearch(patch.search);
      if (patch.status !== undefined) setStatus(patch.status);
      if (patch.mode !== undefined) setMode(patch.mode);
      if (patch.range !== undefined) setRange(patch.range);
      if (patch.sort !== undefined) setSort(patch.sort);
      syncUrl(next);
    },
    [search, status, mode, range, sort, syncUrl],
  );

  const orders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const days = RANGE_FILTERS.find((option) => option.value === range)?.days;
    const cutoff = days ? rangeFrom - days * 24 * 60 * 60 * 1000 : null;
    const next = all.filter((order) => {
      if (status === "ACTIVE" && !isLive(order)) return false;
      if (status === "DELIVERED" && !isCompletedOrder(order)) return false;
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
      else if (isCompletedOrder(order)) result.DELIVERED++;
      else if (order.status === "CANCELLED") result.CANCELLED++;
    }
    return result;
  }, [all]);

  const active = search.trim() !== "" || status !== "ALL" || mode !== "ALL" || range !== "ALL" || sort !== "NEWEST";
  const clear = () => {
    setRangeFrom(0);
    patchFilters(DEFAULT_FILTER);
  };

  return {
    orders,
    counts,
    active,
    clear,
    search,
    setSearch: (value: string) => patchFilters({ search: value }),
    status,
    setStatus: (value: StatusFilter) => patchFilters({ status: value }),
    mode,
    setMode: (value: ModeFilter) => patchFilters({ mode: value }),
    range,
    setRange: (value: RangeFilter) => {
      setRangeFrom(Date.now());
      patchFilters({ range: value });
    },
    sort,
    setSort: (value: SortFilter) => patchFilters({ sort: value }),
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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left: align === "end" ? rect.right : rect.left,
      transform: align === "end" ? "translateX(-100%)" : undefined,
      minWidth: Math.max(rect.width, 176),
      zIndex: 60,
    });
  }, [open, align, value]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
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
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            onKeyDown={onListKey}
            style={menuStyle}
            className="rounded-2xl bg-white p-1.5 shadow-xl shadow-brand-950/15 ring-1 ring-brand-100 outline-none transition-[opacity,translate] duration-150 starting:-translate-y-1 starting:opacity-0"
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
          </ul>,
          document.body,
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
  const etaMinutes = orderEtaMinutes(order);
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
          {etaMinutes != null && <EtaBox order={order} minutes={etaMinutes} />}
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

/** Kitchen ETA in minutes when the backend provides one (no invented clock time). */
function EtaBox({ order, minutes }: { order: Order; minutes: number }) {
  return (
    <p className="flex items-center justify-between gap-4 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-brand-100 ring-inset sm:block sm:shrink-0 sm:text-center lg:py-2">
      <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase sm:block">{isDelivery(order) ? "Delivery ETA" : "Ready in about"}</span>
      <span className="font-numeric block text-right text-2xl leading-tight font-extrabold text-brand-950 sm:text-center sm:text-3xl">{minutes} min</span>
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
  if (tracking.order) return <OrderDetails tracking={tracking} order={tracking.order} reference={reference} />;
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

/**
 * One order, with everything the old tracking page had, in the account's look. First where it stands (StatusHero:
 * the headline, Live, the current step and the ETA; a cancelled order says when and what happens to the money), then
 * Pay again for an unpaid online payment and Cancel while the store allows it. Then the tracking: the pickup queue,
 * the steps with their times and the branch; the rider on the live map and the rider's details; the QR code to show
 * at the counter for pickups; the branch, the address and the delivery code for deliveries. Once it's delivered or
 * ready, rating the rider (delivery) or Bing Chun (pickup). Then the receipt as placed (what was paid), with the
 * printable receipt; beside it, once it's done, Order again. While it's open,
 * a delivery or pickup becoming ready shows the celebration. On phones, Reorder floats above the bottom bar once it's
 * done (PhoneReorderBar).
 */
function OrderDetails({ tracking, order, reference }: { tracking: OrderTracking; order: Order; reference: string }) {
  const delivery = isDelivery(order);
  const status = tracking.status ?? order.status;
  const done = tracking.cancelled || tracking.complete;
  const address = [order.deliveryAddressLine ?? order.address?.addressLine, order.deliveryCity ?? order.address?.city].filter(Boolean).join(", ");
  const refresh = () => void tracking.refresh();

  return (
    <>
      <BackToOrders />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6">
        <StatusHero tracking={tracking} order={order} />
        {tracking.awaitingPayment && <PaymentNotice tracking={tracking} order={order} />}
        {tracking.canCancel && <CancelNotice tracking={tracking} order={order} />}

        {tracking.cancelled ? (
          <BranchCard order={order} delivery={delivery} />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6 xl:grid-cols-2 xl:items-start">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6">
              <ProgressCard tracking={tracking} order={order} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6">
              {!delivery && <PickupQrCard order={order} tokenNumber={tracking.queuePosition} />}
              {delivery && tracking.deliveryCode && status !== "DELIVERED" && <DeliveryCodeCard code={tracking.deliveryCode} />}
              {delivery && (status === "READY" || status === "OUT_FOR_DELIVERY") && <LiveMapCard tracking={tracking} order={order} reference={reference} />}
              {delivery && order.assignedDriver && status !== "DELIVERED" && <RiderCard driver={order.assignedDriver} />}
              {delivery && <BranchCard order={order} delivery />}
            </div>
          </div>
        )}

        {tracking.complete &&
          (delivery ? (
            <RiderRating orderAccessId={reference} existing={order.riderRating} riderName={order.assignedDriver?.name} onSubmitted={refresh} />
          ) : (
            <PlatformRating orderAccessId={reference} existing={order.platformRating} onSubmitted={refresh} />
          ))}

        <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6", done && "xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start")}>
          <article aria-labelledby="order-reference" className={cn(cardFrame, "overflow-hidden")}>
            <div className="flex flex-wrap items-start justify-between gap-3 bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-cream-50))] px-5 py-5 sm:px-7">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.12em] text-slate-500 uppercase sm:text-xs">
                  Order number
                  {done && <DoneBadge order={{ ...order, status }} />}
                </p>
                <h2 id="order-reference" className="font-numeric mt-1 text-2xl leading-none font-extrabold tracking-wider text-brand-950 sm:text-[2rem]">
                  #{order.orderNumber}
                </h2>
                <p className="mt-1.5 text-sm text-slate-500">Placed {formatPlaced(order.createdAt)}</p>
              </div>
              <ReceiptButton order={order} className={cn(primaryButton, "px-5 py-2.5")} />
            </div>

            <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 sm:p-7">
              {tracking.cancelled && (
                <>
                  {order.refund?.cancellationReason && (
                    <Detail icon={X} label="Cancel reason">
                      {cancellationReasonLabel(order.refund.cancellationReason)}
                      {order.refund.cancellationReason === "OTHER" && order.refund.customReasonText
                        ? `: ${order.refund.customReasonText}`
                        : ""}
                    </Detail>
                  )}
                  {order.cancelledBy && (
                    <Detail icon={Store} label="Cancelled by">
                      {order.cancelledBy === "customer" ? "You" : order.cancelledBy}
                    </Detail>
                  )}
                  {order.refund && (
                    <Detail icon={Receipt} label="Refund">
                      {order.refund.status === "COMPLETE"
                        ? `Processed${order.refund.refundAmount != null ? ` — ${formatRefundAmount(order.refund.refundAmount)}` : ""}`
                        : order.refund.status === "RECEIVED"
                          ? "Requested — processing"
                          : order.refund.status === "REJECTED"
                            ? "Not approved"
                            : order.refund.status}
                    </Detail>
                  )}
                </>
              )}
              <Detail icon={delivery ? Bike : Store} label="Method">
                {delivery ? "Delivery" : "Pickup"}
              </Detail>
              <Detail icon={MapPin} label="Branch">
                {order.store?.name ?? "Bing Chun"}
              </Detail>
              {!delivery && (
                <Detail icon={Clock} label="Pickup time">
                  {order.scheduledPickupAt ? <time dateTime={order.scheduledPickupAt}>{formatWith(PICKUP_FORMAT)(order.scheduledPickupAt)}</time> : "As soon as it's ready"}
                </Detail>
              )}
              {delivery && address && (
                <Detail icon={House} label="Deliver to">
                  {address}
                </Detail>
              )}
              <Detail icon={order.paymentMethod === "CASH_AT_COUNTER" ? Banknote : order.paymentMethod === "LOYALTY_POINTS" ? Gift : CreditCard} label="Payment">
                {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
              </Detail>
            </dl>

            <div className="border-t-2 border-dashed border-brand-100 p-5 sm:p-7">
              <h3 className="font-display-condensed text-2xl leading-none text-brand-950 uppercase">Items</h3>
              <ul data-stagger className="mt-3 flex flex-col divide-y divide-brand-100">
                {(order.items ?? []).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-3">
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 ring-1 ring-brand-100 ring-inset">
                      <ItemPhoto item={item} className="size-11" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-brand-950 sm:text-base">{item.productName}</p>
                      <p className="text-xs text-slate-500 sm:text-sm">
                        × {item.quantity} · {itemOptionLine(item)}
                        {item.toppings?.length > 0 && <> · {item.toppings.map((topping) => topping.toppingName).join(", ")}</>}
                      </p>
                    </div>
                    <p className="font-numeric shrink-0 text-sm font-bold text-brand-950 sm:text-base">{formatLkr(item.totalPrice)}</p>
                  </li>
                ))}
              </ul>

              <dl className="mt-3 flex flex-col gap-2 rounded-2xl bg-brand-50 p-4 text-sm ring-1 ring-brand-100 ring-inset sm:text-base">
                <Row label="Subtotal" value={formatLkr(order.subtotal)} />
                {order.discount > 0 && (
                  <Row
                    label={
                      <>
                        Discount
                        {order.promoCode && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold tracking-wide text-emerald-700">{order.promoCode}</span>}
                      </>
                    }
                    value={`−${formatLkr(order.discount)}`}
                    valueClassName="text-emerald-600"
                  />
                )}
                {order.loyaltyDiscount > 0 && <Row label="Points used" value={`−${formatLkr(order.loyaltyDiscount)}`} valueClassName="text-emerald-600" />}
                {delivery && <Row label="Delivery fee" value={order.deliveryFee > 0 ? formatLkr(order.deliveryFee) : "Free"} />}
                {order.convenientFee > 0 && <Row label="Convenience fee" value={formatLkr(order.convenientFee)} />}
                <div className="mt-1 flex items-end justify-between gap-4 border-t-2 border-dashed border-brand-200 pt-3">
                  <dt className="font-semibold text-brand-950">Total</dt>
                  <dd className="font-numeric text-2xl leading-none font-extrabold text-brand-600">{formatLkr(order.total)}</dd>
                </div>
              </dl>
            </div>
          </article>

          {done && <OrderAgainPanel order={order} />}
        </div>

      </div>
      {done && (
        <>
          {/* Room at the foot for the floating bar. */}
          <div aria-hidden="true" className="h-20 md:hidden" />
          <PhoneReorderBar order={order} />
        </>
      )}
      {tracking.celebrating && !tracking.cancelled && <DeliveredCelebration orderNumber={order.orderNumber} delivery={delivery} onClose={tracking.endCelebration} />}
    </>
  );
}

/** Phones: Reorder, on a white pill floating above the bottom bar (clear of its raised Order Now button), sliding up as the page opens. */
function PhoneReorderBar({ order }: { order: Order }) {
  const statuses = useAgainStatuses(order);
  const ready = statuses.filter((status) => status === "ready").length;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-space)+0.5rem)] z-30 px-3 transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] min-[400px]:px-4 md:hidden print:hidden starting:translate-y-[150%] starting:opacity-0">
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-full bg-white/95 p-1.5 pl-5 shadow-lg shadow-brand-950/15 ring-1 ring-brand-100 backdrop-blur-md ring-inset">
        <p className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[0.6875rem] font-semibold tracking-[0.08em] text-slate-500 uppercase">Order again</span>
          <span className="text-sm font-bold text-brand-950">
            {ready} of {statuses.length} item{statuses.length === 1 ? "" : "s"} available
          </span>
        </p>
        <ReorderButton order={order} disabled={ready === 0} className="shrink-0" />
      </div>
    </div>
  );
}

const AGAIN_NOTES: Record<Exclude<AgainStatus, "ready">, string> = {
  checking: "Checking the menu…",
  soldOut: "Not available right now",
  removed: "No longer on the menu",
};

/**
 * Order again, beside the receipt from xl: each item and how it stands on the menu today (available, sold out, or
 * gone), and Reorder (not on phones, where it floats above the bottom bar). Reorder adds the available ones with
 * the same size and quantity; toppings aren't copied over, as before.
 */
function OrderAgainPanel({ order }: { order: Order }) {
  const statuses = useAgainStatuses(order);
  const items = order.items ?? [];
  const ready = statuses.filter((status) => status === "ready").length;
  const checking = statuses.includes("checking");

  return (
    <section aria-labelledby="order-again" className={cn(card, "bg-cream-50 ring-cream-200 xl:sticky xl:top-24")}>
      <h3 id="order-again" className="font-display-condensed text-2xl leading-none text-brand-950 uppercase">
        Order again
      </h3>
      <p className="mt-1.5 text-sm text-slate-600">What&apos;s still on the menu goes in your bag, same size and quantity. Your bag shows today&apos;s prices.</p>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, index) => {
          const status = statuses[index] ?? "checking";
          const off = status === "soldOut" || status === "removed";
          return (
            <li key={item.id} className={cn("flex items-center gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-cream-200 ring-inset", off && "opacity-75")}>
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 ring-1 ring-brand-100 ring-inset">
                <ItemPhoto item={item} grey={off} className="size-11" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold wrap-break-word text-brand-950", off && "line-through decoration-slate-400")}>{item.productName}</p>
                <p className="text-xs text-slate-500">
                  × {item.quantity} · {itemOptionLine(item)}
                </p>
                {status !== "ready" ? (
                  <p className={cn("text-xs font-medium", status === "checking" ? "text-slate-500" : "text-rose-700")}>{AGAIN_NOTES[status]}</p>
                ) : (
                  item.toppings?.length > 0 && <p className="text-xs font-medium text-amber-700">Toppings aren&apos;t added again</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ReorderButton order={order} disabled={ready === 0} className="mt-4 w-full max-md:hidden" />
      {!checking && ready === 0 && <p className="mt-2 text-center text-xs font-medium text-rose-700">Nothing from this order is available right now.</p>}
    </section>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof Store; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">{label}</dt>
        <dd className="mt-0.5 text-base leading-snug font-semibold wrap-break-word text-brand-950">{children}</dd>
      </div>
    </div>
  );
}

function Row({ label, value, valueClassName }: { label: ReactNode; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex flex-wrap items-center gap-1.5 text-slate-600">{label}</dt>
      <dd className={cn("font-numeric text-right font-bold text-brand-950", valueClassName)}>{value}</dd>
    </div>
  );
}
