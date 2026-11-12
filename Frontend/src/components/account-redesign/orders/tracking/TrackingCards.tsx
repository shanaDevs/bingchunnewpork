"use client";

import { Bike, Check, Clock, Download, Hash, House, LoaderCircle, MapPin, Phone, ShieldCheck, Truck, User } from "lucide-react";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import { useRef, type ReactNode } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { downloadPickupQrCardPng } from "@/lib/downloadQrCode";
import { getOrderTrackUrl } from "@/lib/orderLinks";
import type { Order } from "@/types";
import { card, focusRing, secondaryButton } from "../../accountUi";
import { useNow } from "../../colomboTime";
import type { OrderTracking } from "./useOrderTracking";

const LiveDeliveryMap = dynamic(() => import("@/components/order/LiveDeliveryMap"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-64 place-items-center rounded-2xl bg-brand-50">
      <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden="true" />
    </div>
  ),
});

const cardHeading = "font-display-condensed text-2xl leading-none text-brand-950 uppercase";

/** A card's heading with its icon. */
function CardTitle({ icon: Icon, children }: { icon: typeof Bike; children: ReactNode }) {
  return (
    <h3 className={cn(cardHeading, "flex items-center gap-2")}>
      <Icon className="size-5 text-brand-600" aria-hidden="true" />
      {children}
    </h3>
  );
}


/**
 * The pickup queue, while a pickup order is under way: the customer's number and the pickup time (with the minutes
 * left, updated every 30 seconds), a bar filling towards it, and what to do now. Live from the order's socket. Shown at
 * the top of the pickup's ProgressCard, with a dashed line under it.
 */
function PickupQueue({ tracking }: { tracking: OrderTracking }) {
  const { queuePosition, scheduledPickupAt, status } = tracking;
  const now = useNow(30_000);
  const left = scheduledPickupAt ? Math.max(0, Math.ceil((new Date(scheduledPickupAt).getTime() - now.getTime()) / 60_000)) : null;

  if (!queuePosition && !scheduledPickupAt) return null;
  const ready = status === "READY";
  const estimate =
    tracking.etaMinutes != null && tracking.etaMinutes > 0 ? tracking.etaMinutes : left != null ? left : null;
  const percent = scheduledPickupAt && left != null && estimate != null
    ? Math.min(100, Math.max(5, 100 - (left / Math.max(estimate, 1)) * 100))
    : ready
      ? 100
      : estimate != null
        ? 40
        : 0;

  return (
    <div aria-labelledby="pickup-queue" role="group" className="mb-5 border-b-2 border-dashed border-brand-100 pb-5">
      <h3 id="pickup-queue" className="font-display-condensed text-xl leading-none text-brand-950 uppercase">
        Pickup queue
      </h3>
      {/* Compact tiles: the icon beside a small label over the value. */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {queuePosition != null && (
          <p className="flex items-center gap-2.5 rounded-xl bg-brand-50 px-3 py-2 ring-1 ring-brand-100 ring-inset">
            <Hash className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[0.625rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">Your number</span>
              <span className="font-numeric block text-lg leading-tight font-extrabold text-brand-600">{queuePosition}</span>
            </span>
          </p>
        )}
        {scheduledPickupAt && (
          <p className="flex items-center gap-2.5 rounded-xl bg-brand-50 px-3 py-2 ring-1 ring-brand-100 ring-inset">
            <Clock className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[0.625rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">Pick up at</span>
              <span className="font-numeric block text-lg leading-tight font-extrabold text-brand-950">
                {formatTime(scheduledPickupAt)}
                {left != null && !ready && <span className="ml-1.5 text-xs font-medium text-slate-500">~{left} min</span>}
              </span>
            </span>
          </p>
        )}
      </div>
      <div role="progressbar" aria-label="Pickup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="mt-3 h-1.5 rounded-full bg-brand-50 ring-1 ring-brand-100 ring-inset">
        <div className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600 transition-[width] duration-700" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 text-center text-xs font-medium text-slate-600">
        {ready ? "Your order is ready — please collect at the counter!" : left != null && left <= 5 ? "Almost ready — head to the store soon!" : "We will notify you 5 minutes before pickup"}
      </p>
    </div>
  );
}

/**
 * The steps of the order, as the old tracking page showed them: how far along it is (%), the current step and what's
 * happening, then every step down a line, each done one ticked with the time it happened, the current one pulsing.
 * Delivery orders have the rider's pickup step; pickup orders end at Ready. A pickup order also shows its queue
 * (number and pickup time) above, and its branch below.
 */
export function ProgressCard({ tracking, order }: { tracking: OrderTracking; order: Order }) {
  const { steps, currentStep, complete, statusTimestamps, delivery } = tracking;
  const last = steps.length - 1;
  const percent = complete ? 100 : Math.max(0, Math.min(100, (currentStep / last) * 100));
  const active = steps[currentStep] ?? steps[0];
  const activeAt = statusTimestamps[active.status];

  return (
    <section aria-labelledby="track-progress" className={card}>
      {!delivery && <PickupQueue tracking={tracking} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="track-progress" className={cardHeading}>
            {delivery ? "Track your order" : "Track your pickup"}
          </h3>
          <p className="mt-2 text-sm font-bold text-brand-950">{active.label}</p>
          <p className="text-sm text-slate-600">{active.desc}</p>
          {activeAt && <p className="font-numeric mt-0.5 text-xs text-slate-500">Updated {formatDateTime(activeAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
        </div>
        <p className="shrink-0 text-right">
          <span className="font-numeric block text-3xl leading-none font-extrabold text-brand-600">{Math.round(percent)}%</span>
          <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">complete</span>
        </p>
      </div>

      <ol className="relative mt-6 flex flex-col gap-5">
        {/* The line behind the steps, filled as far as the order has got. */}
        <span aria-hidden="true" className="absolute top-5 bottom-5 left-5 w-0.5 -translate-x-1/2 bg-brand-100" />
        <span aria-hidden="true" className="absolute top-5 left-5 w-0.5 -translate-x-1/2 bg-brand-600 transition-[height] duration-1000" style={{ height: `calc((100% - 2.5rem) * ${percent / 100})` }} />
        {steps.map((step, index) => {
          const done = complete || index < currentStep;
          const current = !complete && index === currentStep;
          const at = statusTimestamps[step.status];
          const Icon = step.icon;
          return (
            <li key={step.status} aria-current={current ? "step" : undefined} className="relative flex items-start gap-4">
              <span
                className={cn(
                  "relative grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-500",
                  done ? "bg-brand-600 text-snow" : current ? "bg-white text-brand-600 ring-2 ring-brand-500" : "bg-white text-slate-400 ring-1 ring-slate-200",
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
                {current && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-brand-400/30 motion-reduce:hidden" />}
              </span>
              <div className="min-w-0 flex-1 pt-2">
                <div className="flex items-start justify-between gap-3">
                  <p className={cn("text-sm font-bold", done || current ? "text-brand-950" : "text-slate-400")}>{step.label}</p>
                  {at && (done || current) && (
                    <time dateTime={at} className="font-numeric shrink-0 text-xs whitespace-nowrap text-slate-500">
                      {formatDateTime(at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </time>
                  )}
                </div>
                {current && <p className="mt-0.5 text-xs font-medium text-brand-700">{step.desc}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {!delivery && order.store && (
        <p className="mt-6 flex items-start gap-3 border-t border-dashed border-brand-100 pt-4">
          <MapPin className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-bold text-brand-950">{order.store.name}</span>
            <span className="block text-sm text-slate-600">{order.store.addressLine}</span>
          </span>
        </p>
      )}
    </section>
  );
}

/**
 * Show at Counter, for pickup orders: the token number, a QR code that opens the order's page (no sign-in needed),
 * the order number, and Download QR code (a card image, as before).
 */
export function PickupQrCard({ order, tokenNumber }: { order: Order; tokenNumber?: number | null }) {
  const qrRef = useRef<HTMLDivElement>(null);

  const download = async () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return toast.error("QR code not ready");
    try {
      await downloadPickupQrCardPng(svg, { filename: `bingchun-pickup-${order.orderNumber}.png`, orderNumber: order.orderNumber, tokenNumber });
      toast.success("QR code downloaded");
    } catch {
      toast.error("Could not download QR code");
    }
  };

  return (
    <section aria-labelledby="pickup-qr" className={cn(card, "flex flex-col items-center text-center")}>
      <h3 id="pickup-qr" className={cardHeading}>
        Show at counter
      </h3>
      {tokenNumber != null && <p className="font-numeric mt-2 text-lg font-extrabold text-brand-600">Token #{tokenNumber}</p>}
      <div ref={qrRef} className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-brand-100">
        <QRCodeSVG value={getOrderTrackUrl(order.orderNumber)} size={180} level="H" imageSettings={{ src: "/images/mascot-hover.png", height: 44, width: 44, excavate: true }} />
      </div>
      <p className="font-numeric mt-3 text-lg font-extrabold tracking-wide text-brand-950">{order.orderNumber}</p>
      <p className="mt-1 text-sm text-slate-600">Scan to open order details — no login needed</p>
      <p className="text-xs text-slate-500">Or show this screen when collecting your order</p>
      <button type="button" onClick={() => void download()} className={cn(secondaryButton, "mt-4 px-5 py-2.5")}>
        <Download className="size-4" aria-hidden="true" />
        Download QR code
      </button>
    </section>
  );
}

/** The branch it's from (name and address), and for delivery where it's going. */
export function BranchCard({ order, delivery }: { order: Order; delivery: boolean }) {
  const address = order.deliveryAddressLine ?? order.address?.addressLine;
  return (
    <section aria-label="Branch and address" className={cn(card, "flex flex-col gap-4")}>
      <p className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">{delivery ? "From" : "Pick up at"}</span>
          <span className="block font-bold text-brand-950">{order.store?.name ?? "Bing Chun"}</span>
          {order.store?.addressLine && <span className="block text-sm text-slate-600">{order.store.addressLine}</span>}
        </span>
      </p>
      {delivery && address && (
        <p className="flex items-start gap-3 border-t border-dashed border-brand-100 pt-4">
          <House className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">Delivery to</span>
            <span className="block text-sm font-semibold text-brand-950">{address}</span>
          </span>
        </p>
      )}
    </section>
  );
}

/** The code the rider needs to finish the delivery, until it's delivered. */
export function DeliveryCodeCard({ code }: { code: string }) {
  return (
    <section aria-labelledby="delivery-code" className={cn(card, "ring-2 ring-brand-300")}>
      <CardTitle icon={ShieldCheck}>
        <span id="delivery-code">Your delivery code</span>
      </CardTitle>
      <p className="mt-1 text-sm text-slate-600">Give this code to the rider when your order arrives.</p>
      <p className="font-numeric mt-3 text-center text-4xl font-extrabold tracking-[0.4em] text-brand-600">{code}</p>
    </section>
  );
}

/**
 * The rider on the map once the order is ready or on its way (the app's live delivery map: the branch, the address
 * and the rider moving in real time, with its own full-screen view), and the rider's delivery state under it.
 */
export function LiveMapCard({ tracking, order, reference }: { tracking: OrderTracking; order: Order; reference: string }) {
  const status = tracking.status ?? order.status;
  if (typeof order.deliveryLat !== "number" || typeof order.deliveryLng !== "number") return null;
  return (
    <section aria-labelledby="live-map" className={card}>
      <CardTitle icon={Truck}>
        <span id="live-map">{order.deliveryPhase === "TO_OUTLET" ? "Rider to store" : "Live driver location"}</span>
      </CardTitle>
      <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-brand-100">
        <LiveDeliveryMap
          orderId={order.id}
          trackToken={reference}
          orderNumber={order.orderNumber}
          store={{ lat: order.store.lat, lng: order.store.lng, name: order.store.name }}
          destination={{ lat: order.deliveryLat, lng: order.deliveryLng, addressLine: order.deliveryAddressLine ?? order.address?.addressLine }}
          deliveryPhase={order.deliveryPhase ?? (status === "OUT_FOR_DELIVERY" ? "TO_CUSTOMER" : "TO_OUTLET")}
          initialDriver={order.driverLocation ? { lat: order.driverLocation.lat, lng: order.driverLocation.lng } : null}
          onEtaUpdate={tracking.onEtaUpdate}
        />
      </div>
      {tracking.deliveryState && <p className="mt-2 text-center text-xs font-medium text-slate-500">Status: {tracking.deliveryState.replaceAll("_", " ").toLowerCase()}</p>}
    </section>
  );
}

/** The rider: photo, name, vehicle (colour, type, number) and a tap-to-call number. */
export function RiderCard({ driver }: { driver: NonNullable<Order["assignedDriver"]> }) {
  const vehicle = [driver.vehicleColor, driver.vehicleType, driver.vehicleNumber]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" · ");
  return (
    <section aria-labelledby="your-rider" className={card}>
      <CardTitle icon={Bike}>
        <span id="your-rider">Your rider</span>
      </CardTitle>
      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          {driver.profilePhotoUrl ? (
            // The rider's photo comes from the backend's storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={driver.profilePhotoUrl} alt="" className="size-full object-cover" />
          ) : (
            <User className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-brand-950">{driver.name}</p>
          <p className="text-sm text-slate-600">{vehicle || "Vehicle details coming soon"}</p>
        </div>
        {driver.phone && (
          <a href={`tel:${driver.phone}`} aria-label={`Call ${driver.name}, ${driver.phone}`} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-snow hover:bg-brand-700", focusRing)}>
            <Phone className="size-4" aria-hidden="true" />
            Call
          </a>
        )}
      </div>
      {driver.phone && <p className="font-numeric mt-2 text-sm text-slate-500">{driver.phone}</p>}
    </section>
  );
}
