"use client";

import { useQueries } from "@tanstack/react-query";
import { Bike, Check, ChefHat, House, PackageCheck, ReceiptText, RotateCcw, Store, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { api, ApiError } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import type { Order, OrderItem, OrderStatus } from "@/types";
import { ACTIVE_STATUSES } from "../accountData";
import { focusRing, primaryButton } from "../accountUi";

/** When an order was placed, in Sri Lankan time: "25 Oct 2026, 3:45 pm". */
export const PLACED_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Colombo" };
export const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Colombo" };
export const formatWith = (options: Intl.DateTimeFormatOptions) => (value: string | number | Date) => new Intl.DateTimeFormat("en-GB", options).format(new Date(value));

/** "LKR 1,090" (cents only when there are any). */
export const formatLkr = (amount: number) => `LKR ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** The order's details view, inside My Orders. */
export const orderHref = (order: Pick<Order, "orderNumber">) => `/account/orders?ref=${encodeURIComponent(order.orderNumber)}`;
/** The real-time tracking page (map, rider, cancel) and the printable receipt, as before. */
export const receiptHref = (order: Pick<Order, "orderNumber">) => `/order/${encodeURIComponent(order.orderNumber)}/receipt`;

export const isLive = (order: Order) => ACTIVE_STATUSES.includes(order.status);
export const isDelivery = (order: Order) => order.orderMode === "DELIVERY";

const CHEERING = { src: "/images/mascot-hover.png", width: 463, height: 594 };

/** The mascot for each step an order can be at. */
export const STATUS_MASCOTS: Record<OrderStatus, { src: string; width: number; height: number }> = {
  RECEIVED: CHEERING,
  PREPARING: CHEERING,
  READY: { src: "/images/mascots/takeaway.png", width: 500, height: 500 },
  OUT_FOR_DELIVERY: { src: "/images/mascots/delivery-rider.png", width: 500, height: 500 },
  DELIVERED: CHEERING,
  CANCELLED: { src: "/images/mascots/sad-stitch-empty-cup.png", width: 500, height: 500 },
};

/** The steps of an order, in order: delivery goes on the road after Ready; pickup ends at Ready (collected at the counter). */
export function orderSteps(order: Order): { status: OrderStatus; label: string; icon: LucideIcon }[] {
  const steps: { status: OrderStatus; label: string; icon: LucideIcon }[] = [
    { status: "RECEIVED", label: "Received", icon: ReceiptText },
    { status: "PREPARING", label: "Preparing", icon: ChefHat },
    { status: "READY", label: isDelivery(order) ? "Ready" : "Ready for pickup", icon: PackageCheck },
  ];
  if (isDelivery(order)) {
    steps.push({ status: "OUT_FOR_DELIVERY", label: "On the way", icon: Bike }, { status: "DELIVERED", label: "Delivered", icon: House });
  }
  return steps;
}

/** Where the order is, in words: "Preparing your order". */
export function statusHeadline(order: Order) {
  switch (order.status) {
    case "RECEIVED":
      return "Order received";
    case "PREPARING":
      return "Preparing your order";
    case "READY":
      return isDelivery(order) ? "Ready, waiting for a rider" : "Ready for pickup";
    case "OUT_FOR_DELIVERY":
      return "On the way to you";
    case "DELIVERED":
      return isDelivery(order) ? "Delivered" : "Collected";
    case "CANCELLED":
      return "Cancelled";
  }
}

/** Kitchen ETA in minutes from the backend only (no clock time derived from placement). */
export function orderEtaMinutes(order: Order): number | null {
  const minutes = order.estimatedMinutes;
  return typeof minutes === "number" && minutes > 0 ? minutes : null;
}

/** Pickup or Delivery, with its icon. */
export function OrderTypeBadge({ order }: { order: Order }) {
  const Icon = isDelivery(order) ? Bike : Store;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-100 ring-inset">
      <Icon className="size-3.5" aria-hidden="true" />
      {isDelivery(order) ? "Delivery" : "Pickup"}
    </span>
  );
}

/** "Cancelled", or "Delivered"/"Collected" for a finished order. */
export function DoneBadge({ order }: { order: Order }) {
  if (order.status === "CANCELLED") return <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">Cancelled</span>;
  return <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset">{statusHeadline(order)}</span>;
}

/** An order under way: a pulsing dot and `children` ("Live"). `compact` for list rows. */
export function LiveBadge({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-brand-600 font-semibold text-snow", compact ? "px-2 py-0.5 text-[0.6875rem] font-bold" : "px-2.5 py-1 text-xs")}>
      <span aria-hidden="true" className="relative flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-white motion-reduce:hidden" />
        <span className="relative size-1.5 rounded-full bg-white" />
      </span>
      {children}
    </span>
  );
}

/** The items as one line: "Mango Pomelo Sago × 2, Grape Bobo Tea". */
export const itemsSummary = (order: Order) => (order.items ?? []).map((item) => `${item.productName}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`).join(", ");

/** A product photo from the menu (the backend's image), or a cup when it has none. */
export function ItemPhoto({ item, className, grey }: { item: Pick<OrderItem, "product">; className?: string; grey?: boolean }) {
  const src = item.product?.imageUrl;
  return src ? (
    // The menu's photos come from the backend's storage, as on the menu itself.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" className={cn("object-contain", grey && "opacity-60 grayscale", className)} />
  ) : (
    <span aria-hidden="true" className={cn("grid place-items-center text-xl", grey && "opacity-60 grayscale", className)}>
      🧋
    </span>
  );
}

/** Up to `max` product photos in a row, then "+N". */
export function OrderThumbs({ order, max = 4, className }: { order: Order; max?: number; className?: string }) {
  const items = order.items ?? [];
  const extra = items.length - max;
  return (
    <div aria-hidden="true" className={cn("flex items-center -space-x-2", className)}>
      {items.slice(0, max).map((item) => (
        <span key={item.id} className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 ring-2 ring-white">
          <ItemPhoto item={item} className="size-10" />
        </span>
      ))}
      {extra > 0 && <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-xs font-bold text-brand-800 ring-2 ring-white">+{extra}</span>}
    </div>
  );
}

/** The steps in a row: done ones ticked, the current one ringed (and pulsing while the order is live). */
export function StepsRow({ order, className }: { order: Order; className?: string }) {
  const steps = orderSteps(order);
  const current = Math.max(0, steps.findIndex((step) => step.status === order.status));
  return (
    <ol aria-label="Order progress" className={cn("flex items-start", className)}>
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "next";
        const Icon = step.icon;
        return (
          <li key={step.status} className="relative flex flex-1 flex-col items-center text-center">
            {/* The line from the step before. */}
            {index > 0 && <span aria-hidden="true" className={cn("absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2", index <= current ? "bg-brand-600" : "bg-brand-200/70")} />}
            <span
              className={cn(
                "relative z-10 grid size-8 place-items-center rounded-full",
                state === "done" && "bg-brand-600 text-snow",
                state === "current" && "bg-white text-brand-600 ring-2 ring-brand-600",
                state === "next" && "bg-white/70 text-slate-400 ring-1 ring-brand-100",
              )}
            >
              {state === "current" && isLive(order) && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-brand-400/30 motion-reduce:hidden" />}
              {state === "done" ? <Check className="size-4" strokeWidth={2.75} aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
            </span>
            {/* Names from sm: they don't fit across a phone, and the heading already says where it is. */}
            <span className={cn("sr-only px-0.5 text-xs leading-tight font-semibold sm:not-sr-only sm:mt-1.5", state === "next" ? "text-slate-400" : "text-brand-950")}>
              {step.label}
              {state === "current" && <span className="sr-only"> (now)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** How each item of an order stands on the menu today (GET /menu/products/:id): orderable, sold out, or gone from the menu. */
export type AgainStatus = "ready" | "soldOut" | "removed" | "checking";

export function useAgainStatuses(order: Order): AgainStatus[] {
  const results = useQueries({
    queries: (order.items ?? []).map((item) => ({
      queryKey: ["menu-product", item.productId],
      queryFn: () => api.get<{ isAvailable: boolean }>(`/menu/products/${item.productId}`),
      staleTime: 60_000,
      retry: false,
    })),
  });
  return results.map((result) => (result.isPending ? "checking" : result.isError ? "removed" : result.data?.isAvailable ? "ready" : "soldOut"));
}

/**
 * Reorder, as the old My Orders page did it: switches the cart to the order's type, then for each item asks the menu
 * for the product (GET /menu/products/:id) and, if it's available, adds it with the same size and quantity (toppings
 * aren't copied); then opens the cart, or says nothing could be added.
 */
export function useReorder() {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const setOrderMode = useCartStore((s) => s.setOrderMode);
  const [busy, setBusy] = useState(false);

  const reorder = async (order: Order) => {
    if (busy) return;
    setBusy(true);
    setOrderMode(order.orderMode);
    let added = 0;
    for (const item of order.items ?? []) {
      try {
        const product = await api.get<{ isAvailable: boolean } & Record<string, unknown>>(`/menu/products/${item.productId}`);
        if (!product.isAvailable) continue;
        const result = addItem({
          product: product as never,
          size: item.size as never,
          sugarLevel: item.sugarLevel ?? null,
          iceLevel: item.iceLevel ?? null,
          toppings: [],
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
        if (result?.ok !== false) added++;
      } catch (err) {
        // Gone from the menu: skipped, as before.
        if (!(err instanceof ApiError)) console.warn("Reorder: could not check", item.productId, err);
      }
    }
    setBusy(false);
    if (added > 0) {
      toast.success(`${added} item${added > 1 ? "s" : ""} added to your cup! 🧋`);
      router.push("/cart");
    } else {
      toast.error("No items available for reorder");
    }
  };

  return { reorder, busy };
}

const compactButton = cn(
  "inline-flex h-8 items-center gap-1 rounded-full bg-brand-50 px-3 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 transition-[background-color,scale] ring-inset active:scale-95 active:bg-brand-100 disabled:cursor-wait disabled:opacity-60",
  focusRing,
);

/** Reorder (useReorder). `compact`: a small pale pill, for the rows of the phones' order list. */
export function ReorderButton({ order, compact = false, disabled = false, className }: { order: Order; compact?: boolean; disabled?: boolean; className?: string }) {
  const { reorder, busy } = useReorder();
  return (
    <button type="button" onClick={() => void reorder(order)} disabled={busy || disabled} aria-busy={busy || undefined} className={cn(compact ? compactButton : primaryButton, className)}>
      <RotateCcw className={cn(compact ? "size-3.5" : "size-4", busy && "animate-spin [animation-direction:reverse]")} aria-hidden="true" />
      {busy ? "Adding…" : "Reorder"}
    </button>
  );
}
