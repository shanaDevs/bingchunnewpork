"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, Printer, ReceiptText, Share2 } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { homeFontVariables } from "@/components/home-redesign/fonts";
import { BottomNav } from "@/components/home-redesign/layout/BottomNav";
import { SiteHeader } from "@/components/home-redesign/layout/SiteHeader";
import { cn } from "@/components/home-redesign/lib/cn";
import { heroBackdropImage } from "@/components/home-redesign/sections/hero/hero.config";
import { api } from "@/lib/api";
import { getOrderTrackUrl, receiptWasOpenedFromApp } from "@/lib/orderLinks";
import { getStatusLabel } from "@/lib/orderStatus";
import { customerLabel, customerPhone, formatMoney, formatReceiptDate, getPaymentStatusLabel, PAYMENT_METHOD_LABELS } from "@/lib/receipt";
import type { Order } from "@/types";
import { focusRing, primaryButton } from "../accountUi";
import { ItemPhoto } from "./orderParts";

const BACK_FALLBACK = "/account/orders";

/**
 * The printable receipt for an order (/order/[n]/receipt), in the redesign's look with its own header and bottom bar:
 * Back (to wherever it was opened from in the app, else My Orders), the order number, Share (the phone's share sheet,
 * else the link copied) and Print. Printing gives only the receipt, black on white, 80 mm wide like a till slip
 * (theme.css, .bc-receipt). Guests open it from their order's page, so it doesn't need a sign-in: GET /orders/:id
 * answers as it did.
 */
export function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading, isError } = useQuery<Order>({
    queryKey: ["order", id, "receipt"],
    queryFn: () => api.get<Order>(`/orders/${id}`, true),
  });

  const back = () => (receiptWasOpenedFromApp() ? router.back() : router.push(BACK_FALLBACK));

  const share = async () => {
    if (order) await shareReceipt(order, window.location.href);
  };

  return (
    <div className={`home-redesign ${homeFontVariables} relative flex min-h-dvh flex-col bg-white antialiased`}>
      <div className="print:hidden">
        <SiteHeader />
      </div>
      {/* The homepage's blue behind the header, with the way back, the order number, Share and Print on it. */}
      <section className="bg-cover bg-center px-4 pt-28 pb-16 sm:pt-32 print:hidden" style={{ backgroundImage: heroBackdropImage }}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button type="button" onClick={back} aria-label="Back" className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-sm transition-colors hover:bg-brand-50", focusRing, "focus-visible:outline-white")}>
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display-condensed text-4xl leading-none text-snow uppercase">Receipt</h1>
            <p className="font-numeric truncate text-sm text-brand-100">{order ? `#${order.orderNumber}` : isLoading ? "Loading…" : ""}</p>
          </div>
          {order && (
            <>
              <button
                type="button"
                onClick={() => void share()}
                aria-label="Share receipt"
                className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-snow ring-1 ring-white/40 transition-colors ring-inset hover:bg-white/25", focusRing, "focus-visible:outline-white")}
              >
                <Share2 className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className={cn("inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-brand-700 shadow-lg shadow-brand-950/20 transition-colors hover:bg-brand-50", focusRing, "focus-visible:outline-white")}
              >
                <Printer className="size-4" aria-hidden="true" />
                Print
              </button>
            </>
          )}
        </div>
      </section>
      <main className="relative mx-auto -mt-10 w-full max-w-xl flex-1 px-4 pb-[calc(var(--bottom-nav-space,0px)+2rem)] print:mt-0">
        {isLoading ? (
          <p role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden="true" />
            Loading receipt…
          </p>
        ) : isError || !order ? (
          <div className="flex flex-col items-center rounded-[1.5rem] bg-white px-6 py-12 text-center ring-1 ring-brand-100">
            <ReceiptText className="size-10 text-brand-300" aria-hidden="true" />
            <p className="mt-3 text-lg font-bold text-brand-950">Receipt not found</p>
            <button type="button" onClick={() => router.push(BACK_FALLBACK)} className={cn(primaryButton, "mt-5")}>
              My Orders
            </button>
          </div>
        ) : (
          <ReceiptDocument order={order} />
        )}
      </main>
      <div className="print:hidden">
        <BottomNav />
      </div>
    </div>
  );
}

/** Share a receipt's link: the phone's share sheet, else the link copied. */
export async function shareReceipt(order: Order, url: string) {
  const text = `Bing Chun receipt — Order #${order.orderNumber} — ${order.total.toLocaleString()} LKR`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Bing Chun Receipt", text, url });
      return;
    } catch {
      /* closed the share sheet: copy instead */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Receipt link copied!");
  } catch {
    toast.error("Could not copy link");
  }
}

/**
 * The receipt itself, with what the old one had: the brand and a QR code to track the order; the receipt number and
 * date; how it was ordered, its status, how it's paid and whether it's paid; the branch, the customer, the delivery
 * address or pickup time; the items with their toppings, quantities and amounts; the totals with any promo and points;
 * and the thanks. Black on white when printed. Shown on the receipt page and in the receipt pop-up (ReceiptDialog).
 */
export function ReceiptDocument({ order }: { order: Order }) {
  const delivery = order.orderMode === "DELIVERY";
  const name = customerLabel(order);
  const phone = customerPhone(order);
  const chip = "rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 print:bg-transparent print:px-0 print:text-black print:ring-0";

  return (
    <article id="order-receipt" className="bc-receipt overflow-hidden rounded-[1.5rem] bg-white text-slate-900 shadow-[0_24px_60px_-34px_rgb(15_33_71/0.5)] ring-1 ring-brand-100 print:rounded-none print:text-[11px] print:text-black print:shadow-none print:ring-0">
      <header className="flex items-start justify-between gap-4 bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-cream-50))] px-5 py-5 print:bg-none print:px-0 print:py-2">
        <div className="flex items-center gap-3">
          <span className="relative size-11 shrink-0">
            <Image src="/brand/logo.avif" alt="Bing Chun" fill sizes="44px" className="object-contain" />
          </span>
          <div>
            <p className="font-display-condensed text-2xl leading-none text-brand-950 uppercase print:text-black">Bing Chun</p>
            <p className="text-xs text-slate-500 print:text-black">Bubble Tea · Sri Lanka</p>
          </div>
        </div>
        <div className="flex flex-col items-center" title="Scan to view order">
          <span className="rounded-lg bg-white p-1.5 ring-1 ring-brand-100 print:p-0 print:ring-0">
            <QRCodeSVG value={getOrderTrackUrl(order.orderNumber)} size={56} level="M" />
          </span>
          <span className="mt-1 text-[0.625rem] font-semibold text-slate-500 print:text-black">Scan to track</span>
        </div>
      </header>

      <div className="border-b-2 border-dashed border-brand-100 px-5 py-4 print:border-black print:px-0">
        <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-slate-500 uppercase print:text-black">Receipt</p>
        <p className="font-numeric text-2xl font-extrabold tracking-wide text-brand-950 print:text-black">#{order.orderNumber}</p>
        <p className="font-numeric text-sm text-slate-500 print:text-black">{formatReceiptDate(order.createdAt)}</p>
        <p className="mt-2.5 flex flex-wrap gap-1.5 print:gap-x-2">
          <span className={chip}>{delivery ? "Delivery" : "Takeaway"}</span>
          <span className={chip}>{getStatusLabel(order.status, order.orderMode)}</span>
          <span className={chip}>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
          <span className={chip}>{getPaymentStatusLabel(order)}</span>
        </p>
      </div>

      <dl className="flex flex-col gap-1.5 border-b-2 border-dashed border-brand-100 px-5 py-4 text-sm print:border-black print:px-0 print:text-[11px]">
        <ReceiptLine label="Store">
          {order.store.name} — {order.store.addressLine}
        </ReceiptLine>
        {name && (
          <ReceiptLine label="Customer">
            {name}
            {phone ? ` · ${phone}` : ""}
          </ReceiptLine>
        )}
        {!name && phone && <ReceiptLine label="Phone">{phone}</ReceiptLine>}
        {delivery && order.address && (
          <ReceiptLine label="Deliver to">
            {order.address.addressLine}
            {order.address.city ? `, ${order.address.city}` : ""}
          </ReceiptLine>
        )}
        {!delivery && order.pickupTime && <ReceiptLine label="Pickup">{order.pickupTime}</ReceiptLine>}
      </dl>

      <div className="px-5 py-4 print:px-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase print:text-black">
          <span>Item</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Amount</span>
        </div>
        <ul className="mt-2 flex flex-col divide-y divide-brand-100 print:divide-black/30">
          {order.items.map((item) => (
            <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 py-2.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-50 print:hidden">
                  <ItemPhoto item={item} className="size-9" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold wrap-break-word text-brand-950 print:text-[11px] print:text-black">{item.productName}</span>
                  {item.toppings?.length > 0 && <span className="block text-xs text-slate-500 print:text-black">+ {item.toppings.map((topping) => topping.toppingName).join(", ")}</span>}
                </span>
              </span>
              <span className="font-numeric text-center text-sm print:text-[11px]">{item.quantity}</span>
              <span className="font-numeric text-right text-sm font-semibold whitespace-nowrap print:text-[11px]">{formatMoney(item.totalPrice)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 flex flex-col gap-1.5 rounded-2xl bg-brand-50 p-4 text-sm ring-1 ring-brand-100 ring-inset print:rounded-none print:bg-transparent print:p-0 print:pt-2 print:text-[11px] print:ring-0">
          <TotalLine label="Subtotal" value={formatMoney(order.subtotal)} />
          {order.deliveryFee > 0 && <TotalLine label="Delivery" value={formatMoney(order.deliveryFee)} />}
          {(order.convenientFee ?? 0) > 0 && <TotalLine label="Convenience fee" value={formatMoney(order.convenientFee)} />}
          {order.discount > 0 && <TotalLine label={`Promo${order.promoCode ? ` (${order.promoCode})` : ""}`} value={`−${formatMoney(order.discount)}`} discount />}
          {order.loyaltyDiscount > 0 && <TotalLine label="Loyalty" value={`−${formatMoney(order.loyaltyDiscount)}`} discount />}
          <div className="mt-1 flex items-end justify-between gap-4 border-t-2 border-dashed border-brand-200 pt-2.5 print:border-black">
            <dt className="font-bold text-brand-950 print:text-black">Total</dt>
            <dd className="font-numeric text-xl font-extrabold text-brand-600 print:text-sm print:text-black">{formatMoney(order.total)}</dd>
          </div>
        </dl>
      </div>

      {/* A <p>, not a <footer>: the site's print styles hide every footer. */}
      <p className="border-t-2 border-dashed border-brand-100 px-5 py-4 text-center text-xs text-slate-500 print:border-black print:px-0 print:text-black">Thank you for choosing Bing Chun! 🧋 · bingchun.lk</p>
    </article>
  );
}

function ReceiptLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-semibold text-brand-950 print:text-black">{label}:</dt>
      <dd className="min-w-0 text-slate-700 print:text-black">{children}</dd>
    </div>
  );
}

function TotalLine({ label, value, discount = false }: { label: string; value: string; discount?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-600 print:text-black">{label}</dt>
      <dd className={cn("font-numeric font-bold", discount ? "text-emerald-600 print:text-black" : "text-brand-950 print:text-black")}>{value}</dd>
    </div>
  );
}
