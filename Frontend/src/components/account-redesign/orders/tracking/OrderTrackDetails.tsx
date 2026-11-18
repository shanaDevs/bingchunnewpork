"use client";

import { Banknote, Bike, Clock, CreditCard, Gift, House, MapPin, Receipt, Store } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import type { Order, PaymentMethod } from "@/types";
import { card, cardFrame, primaryButton, secondaryButton } from "../../accountUi";
import {
  DoneBadge,
  formatLkr,
  formatWith,
  isDelivery,
  ItemPhoto,
  PLACED_FORMAT,
  ReorderButton,
  useAgainStatuses,
  type AgainStatus,
} from "../orderParts";
import { ReceiptDialog } from "../ReceiptDialog";
import { DeliveredCelebration } from "./DeliveredCelebration";
import { PlatformRating, RiderRating } from "./RatingCards";
import { BranchCard, DeliveryCodeCard, LiveMapCard, PickupQrCard, ProgressCard, RiderCard } from "./TrackingCards";
import { CancelNotice, PaymentNotice, StatusHero } from "./TrackingStatus";
import type { OrderTracking } from "./useOrderTracking";

const PICKUP_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Colombo",
};
const formatPlaced = formatWith(PLACED_FORMAT);

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CARD: "Card",
  PAYHERE: "Paid online",
  CASH_AT_COUNTER: "Cash",
  LOYALTY_POINTS: "Loyalty points",
};

const sizeLabel = (size: string) =>
  size === "LARGE" ? "Large" : size === "REGULAR" ? "Regular" : size.charAt(0) + size.slice(1).toLowerCase();

/**
 * Live order details in the redesign look: status, cancel/pay, progress, QR/map/rider, receipt and reorder.
 * Used from My Orders (`?ref=`) and the public `/order/[id]` confirmation page.
 */
export function OrderTrackDetails({
  tracking,
  order,
  reference,
  header,
  footer,
  phoneBar = "account",
}: {
  tracking: OrderTracking;
  order: Order;
  reference: string;
  /** Optional chrome above the cards (e.g. Back to My Orders). */
  header?: ReactNode;
  /** Optional chrome under the receipt (e.g. Explore Menu / Home). */
  footer?: ReactNode;
  /** Where the floating phone reorder bar sits: account bottom nav vs standalone page. */
  phoneBar?: "account" | "standalone";
}) {
  const delivery = isDelivery(order);
  const status = tracking.status ?? order.status;
  const done = tracking.cancelled || tracking.complete;
  const address = [order.deliveryAddressLine ?? order.address?.addressLine, order.deliveryCity ?? order.address?.city]
    .filter(Boolean)
    .join(", ");
  const refresh = () => void tracking.refresh();

  return (
    <>
      {header}
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
              {delivery && tracking.deliveryCode && status !== "DELIVERED" && (
                <DeliveryCodeCard code={tracking.deliveryCode} />
              )}
              {delivery && (status === "READY" || status === "OUT_FOR_DELIVERY") && (
                <LiveMapCard tracking={tracking} order={order} reference={reference} />
              )}
              {delivery && order.assignedDriver && status !== "DELIVERED" && (
                <RiderCard driver={order.assignedDriver} />
              )}
              {delivery && <BranchCard order={order} delivery />}
            </div>
          </div>
        )}

        {tracking.complete &&
          (delivery ? (
            <RiderRating
              orderAccessId={reference}
              existing={order.riderRating}
              riderName={order.assignedDriver?.name}
              onSubmitted={refresh}
            />
          ) : (
            <PlatformRating orderAccessId={reference} existing={order.platformRating} onSubmitted={refresh} />
          ))}

        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6",
            done && "xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start",
          )}
        >
          <article aria-labelledby="order-reference" className={cn(cardFrame, "overflow-hidden")}>
            <div className="flex flex-wrap items-start justify-between gap-3 bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-cream-50))] px-5 py-5 sm:px-7">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.12em] text-slate-500 uppercase sm:text-xs">
                  Order number
                  {done && <DoneBadge order={{ ...order, status }} />}
                </p>
                <h2
                  id="order-reference"
                  className="font-numeric mt-1 text-2xl leading-none font-extrabold tracking-wider text-brand-950 sm:text-[2rem]"
                >
                  #{order.orderNumber}
                </h2>
                <p className="mt-1.5 text-sm text-slate-500">Placed {formatPlaced(order.createdAt)}</p>
              </div>
              <ReceiptButton order={order} className={cn(primaryButton, "px-5 py-2.5")} />
            </div>

            <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 sm:p-7">
              <Detail icon={delivery ? Bike : Store} label="Method">
                {delivery ? "Delivery" : "Pickup"}
              </Detail>
              <Detail icon={MapPin} label="Branch">
                {order.store?.name ?? "Bing Chun"}
              </Detail>
              {!delivery && (
                <Detail icon={Clock} label="Pickup time">
                  {order.scheduledPickupAt ? (
                    <time dateTime={order.scheduledPickupAt}>{formatWith(PICKUP_FORMAT)(order.scheduledPickupAt)}</time>
                  ) : (
                    "As soon as it's ready"
                  )}
                </Detail>
              )}
              {delivery && address && (
                <Detail icon={House} label="Deliver to">
                  {address}
                </Detail>
              )}
              <Detail
                icon={
                  order.paymentMethod === "CASH_AT_COUNTER"
                    ? Banknote
                    : order.paymentMethod === "LOYALTY_POINTS"
                      ? Gift
                      : CreditCard
                }
                label="Payment"
              >
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
                        × {item.quantity} · {sizeLabel(item.size)}
                        {item.toppings?.length > 0 && (
                          <> · {item.toppings.map((topping) => topping.toppingName).join(", ")}</>
                        )}
                      </p>
                    </div>
                    <p className="font-numeric shrink-0 text-sm font-bold text-brand-950 sm:text-base">
                      {formatLkr(item.totalPrice)}
                    </p>
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
                        {order.promoCode && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold tracking-wide text-emerald-700">
                            {order.promoCode}
                          </span>
                        )}
                      </>
                    }
                    value={`−${formatLkr(order.discount)}`}
                    valueClassName="text-emerald-600"
                  />
                )}
                {order.loyaltyDiscount > 0 && (
                  <Row label="Points used" value={`−${formatLkr(order.loyaltyDiscount)}`} valueClassName="text-emerald-600" />
                )}
                {delivery && (
                  <Row label="Delivery fee" value={order.deliveryFee > 0 ? formatLkr(order.deliveryFee) : "Free"} />
                )}
                {order.convenientFee > 0 && <Row label="Convenience fee" value={formatLkr(order.convenientFee)} />}
                <div className="mt-1 flex items-end justify-between gap-4 border-t-2 border-dashed border-brand-200 pt-3">
                  <dt className="font-semibold text-brand-950">Total</dt>
                  <dd className="font-numeric text-2xl leading-none font-extrabold text-brand-600">
                    {formatLkr(order.total)}
                  </dd>
                </div>
              </dl>
            </div>
          </article>

          {done && <OrderAgainPanel order={order} />}
        </div>

        {footer}
      </div>
      {done && (
        <>
          <div aria-hidden="true" className="h-20 md:hidden" />
          <PhoneReorderBar order={order} offset={phoneBar} />
        </>
      )}
      {tracking.celebrating && !tracking.cancelled && (
        <DeliveredCelebration orderNumber={order.orderNumber} delivery={delivery} onClose={tracking.endCelebration} />
      )}
    </>
  );
}

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

function PhoneReorderBar({ order, offset }: { order: Order; offset: "account" | "standalone" }) {
  const statuses = useAgainStatuses(order);
  const ready = statuses.filter((status) => status === "ready").length;
  const bottom =
    offset === "account"
      ? "bottom-[calc(var(--bottom-nav-space)+0.5rem)]"
      : "bottom-[max(1rem,env(safe-area-inset-bottom))]";
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-30 px-3 transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] min-[400px]:px-4 md:hidden print:hidden starting:translate-y-[150%] starting:opacity-0",
        bottom,
      )}
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-full bg-white/95 p-1.5 pl-5 shadow-lg shadow-brand-950/15 ring-1 ring-brand-100 backdrop-blur-md ring-inset">
        <p className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[0.6875rem] font-semibold tracking-[0.08em] text-slate-500 uppercase">
            Order again
          </span>
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
      <p className="mt-1.5 text-sm text-slate-600">
        What&apos;s still on the menu goes in your bag, same size and quantity. Your bag shows today&apos;s prices.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, index) => {
          const status = statuses[index] ?? "checking";
          const off = status === "soldOut" || status === "removed";
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-cream-200 ring-inset",
                off && "opacity-75",
              )}
            >
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 ring-1 ring-brand-100 ring-inset">
                <ItemPhoto item={item} grey={off} className="size-11" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-semibold wrap-break-word text-brand-950",
                    off && "line-through decoration-slate-400",
                  )}
                >
                  {item.productName}
                </p>
                <p className="text-xs text-slate-500">
                  × {item.quantity} · {sizeLabel(item.size)}
                </p>
                {status !== "ready" ? (
                  <p className={cn("text-xs font-medium", status === "checking" ? "text-slate-500" : "text-rose-700")}>
                    {AGAIN_NOTES[status]}
                  </p>
                ) : (
                  item.toppings?.length > 0 && (
                    <p className="text-xs font-medium text-amber-700">Toppings aren&apos;t added again</p>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ReorderButton order={order} disabled={ready === 0} className="mt-4 w-full max-md:hidden" />
      {!checking && ready === 0 && (
        <p className="mt-2 text-center text-xs font-medium text-rose-700">
          Nothing from this order is available right now.
        </p>
      )}
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

/** Explore Menu + Back to Home, as on the homepage redesign confirmation. */
export function OrderTrackActions({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 print:hidden", className)}>
      <Link
        href="/menu"
        className={cn(primaryButton, "justify-center py-3.5 text-base shadow-lg shadow-brand-600/25")}
      >
        Explore Menu
      </Link>
      <Link href="/" className={cn(secondaryButton, "justify-center py-3.5 text-base")}>
        Back to Home
      </Link>
    </div>
  );
}
