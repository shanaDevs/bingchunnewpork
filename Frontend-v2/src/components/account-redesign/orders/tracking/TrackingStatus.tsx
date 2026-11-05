"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Clock, CreditCard, LoaderCircle, Timer, TriangleAlert, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { fetchActiveCancelReasons, OTHER_CANCEL_REASON_VALUE } from "@/lib/cancellationReasons";
import { formatCountdown, getCancelCardTitle, getCashCancelNotice, getFullRefundCancelNotice, getPartialRefundCancelNotice, isOnlinePaidOrder, secondsUntil } from "@/lib/orderCancel";
import { formatMoney, formatReceiptDate } from "@/lib/receipt";
import type { Order } from "@/types";
import { cardFrame, ErrorText, focusRing, primaryButton, secondaryButton } from "../../accountUi";
import { LiveBadge, OrderTypeBadge, STATUS_MASCOTS } from "../orderParts";
import type { OrderTracking } from "./useOrderTracking";

/**
 * What a cancelled order says about the money, as the old tracking page did: the refund's outcome when there is one,
 * else what happens to an online payment.
 */
function cancelledMoneyNote(order: Order): string {
  const online = order.paymentMethod === "PAYHERE" || order.paymentMethod === "CARD";
  const refund = order.refund;
  if (refund?.status === "REJECTED") return "This refund was not approved. Contact the store if you have questions.";
  if (refund?.status === "COMPLETE") {
    const amount = refund.refundAmount ?? 0;
    return amount > 0 ? `${formatMoney(amount)} has been refunded. It will be added to your original payment method in 2 to 3 days.` : "No refund";
  }
  if (refund?.status === "RECEIVED") return "Refund requested — we’ll process it shortly.";
  if (online && order.paymentStatus === "PAID") return "If you paid online, a refund will be processed separately.";
  if (online && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED") return "No payment was taken for this order.";
  return "";
}

/** The old tracking page's headline for where the order stands, payment first. */
function headline(tracking: OrderTracking, order: Order) {
  const online = order.paymentMethod === "PAYHERE" || order.paymentMethod === "CARD";
  if (tracking.cancelled) return "Order cancelled";
  if (tracking.awaitingPayment) return order.paymentStatus === "FAILED" ? "Payment failed" : "Awaiting payment";
  if (tracking.complete) return tracking.delivery ? "Delivered!" : "Ready for pickup!";
  return order.paymentStatus === "PAID" || !online ? "Order confirmed!" : "Order received";
}

/**
 * The order's status at the top of its details: the mascot for where it is, the headline, the order number, Live
 * and its type while under way, what's happening now (the current step) and the ETA (live from the kitchen and the
 * rider). A cancelled order: when it was cancelled, and what happens to the money.
 */
export function StatusHero({ tracking, order }: { tracking: OrderTracking; order: Order }) {
  const status = tracking.status ?? order.status;
  const step = tracking.steps[tracking.currentStep];
  const live = !tracking.cancelled && !tracking.complete;
  const cancelledAt = tracking.statusTimestamps.CANCELLED;
  const moneyNote = tracking.cancelled ? cancelledMoneyNote(order) : "";

  return (
    <section
      aria-labelledby="track-status"
      className={cn(
        cardFrame,
        "overflow-hidden p-5 sm:p-6",
        tracking.cancelled ? "bg-[linear-gradient(135deg,var(--color-rose-50),#ffffff)] ring-rose-200" : "bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-cream-50))]",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Image {...STATUS_MASCOTS[status]} alt="" data-pop sizes="96px" className="size-20 shrink-0 object-contain sm:size-24" />
          <div className="min-w-0">
            <h2 id="track-status" aria-live="polite" className={cn("font-display-condensed text-[1.75rem] leading-none uppercase sm:text-4xl", tracking.cancelled ? "text-rose-900" : "text-brand-950")}>
              {headline(tracking, order)}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {live && !tracking.awaitingPayment && <LiveBadge>Live</LiveBadge>}
              <OrderTypeBadge order={order} />
              <span className="font-numeric font-bold tracking-wide text-brand-950">#{order.orderNumber}</span>
            </p>
            {tracking.cancelled ? (
              <>
                {cancelledAt && <p className="font-numeric mt-2 text-xs text-slate-500">Cancelled {formatReceiptDate(cancelledAt)}</p>}
                {moneyNote && <p className="mt-1.5 max-w-xl text-sm text-slate-700">{moneyNote}</p>}
              </>
            ) : (
              step && !tracking.awaitingPayment && <p className="mt-2 text-sm text-slate-700">{step.desc}</p>
            )}
          </div>
        </div>
        {live && !tracking.awaitingPayment && tracking.etaMinutes != null && (
          <p className="flex items-center justify-between gap-4 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-brand-100 ring-inset sm:block sm:shrink-0 sm:text-center">
            <span className="flex items-center gap-1 text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">
              <Clock className="size-3.5" aria-hidden="true" />
              ETA
            </span>
            <span className="font-numeric block text-2xl leading-tight font-extrabold text-brand-950 sm:text-3xl">{tracking.etaMinutes} min</span>
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * An online payment that hasn't gone through: why (the gateway's reason, when it failed), that the store starts once
 * it's paid, and Pay Again for the total (PayHere or WebXPay, as the admin has set; it comes back to the order's page).
 */
export function PaymentNotice({ tracking, order }: { tracking: OrderTracking; order: Order }) {
  const failed = order.paymentStatus === "FAILED";
  const reason = order.paymentFailureReason;
  return (
    <section role="status" className="flex flex-col gap-4 rounded-[1.5rem] bg-amber-50 p-5 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <CreditCard className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-amber-950">{failed ? reason || "Your payment did not go through" : "Complete payment to confirm this order"}</p>
          <p className="mt-0.5 text-sm text-amber-900">
            {failed && reason ? "The store will start preparing your order once payment succeeds. You can try again below." : "The store will start preparing your order after payment is successful."}
          </p>
        </div>
      </div>
      <button type="button" onClick={() => void tracking.payAgain()} disabled={tracking.payingAgain} className={cn(primaryButton, "shrink-0")}>
        {tracking.payingAgain ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
        Pay again — {formatMoney(order.total)}
      </button>
    </section>
  );
}

/**
 * Cancelling during the full-refund window (the old page's countdown card): the time left, (for an online payment) the
 * full refund, and Cancel Order, which asks why and then to confirm (CancelOrderDialog). Once the window is over the
 * card goes (Pinee's call, 2026-11-04), though the backend would still take a cancel at a partial refund until the
 * order is collected or out for delivery; a cancel already being asked about when it runs out is let finish.
 */
export function CancelNotice({ tracking, order }: { tracking: OrderTracking; order: Order }) {
  const status = tracking.status ?? order.status;
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(order.cancelWindowEndsAt ?? null));
  const [asking, setAsking] = useState(false);
  const windowMinutes = order.cancelWindowMinutes ?? 10;
  const paidOnline = isOnlinePaidOrder(order);
  const fullNotice = getFullRefundCancelNotice(windowMinutes);
  const partialNotice = getPartialRefundCancelNotice({ status, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus });
  const cashNotice = getCashCancelNotice(status);

  useEffect(() => {
    if (!order.cancelWindowEndsAt) return;
    const tick = () => setSecondsLeft(secondsUntil(order.cancelWindowEndsAt));
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [order.cancelWindowEndsAt]);

  const fullTier = order.cancelRefundTier === "full" && Boolean(order.cancelWindowEndsAt) && secondsLeft > 0;
  const confirmLead = fullTier && paidOnline ? fullNotice.confirmLead : partialNotice ? partialNotice.confirmLead : cashNotice.confirmLead;
  const dialog = asking && <CancelOrderDialog orderNumber={order.orderNumber} confirmLead={confirmLead} onCancel={tracking.cancel} onClose={() => setAsking(false)} />;
  // The pop-up sits outside the card so it stays mounted (with what was typed) if the card goes while it's open.
  return (
    <>
      {fullTier && (
        <section className="flex flex-col gap-4 rounded-[1.5rem] bg-cream-50 p-5 ring-1 ring-cream-200 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-amber-700 ring-1 ring-cream-200">
              <Timer className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-brand-950">{getCancelCardTitle(status, true)}</p>
              <p className="mt-0.5 text-sm text-slate-700">
                <span className="font-numeric text-xl font-extrabold text-brand-950" role="timer">
                  {formatCountdown(secondsLeft)}
                </span>{" "}
                left to cancel
              </p>
              {paidOnline && <p className="mt-0.5 text-xs text-slate-600">{fullNotice.banner}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAsking(true)}
            disabled={tracking.cancelling}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 transition-colors ring-inset hover:bg-rose-50 disabled:cursor-wait",
              focusRing,
            )}
          >
            {tracking.cancelling && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            Cancel order
          </button>
        </section>
      )}
      {dialog}
    </>
  );
}

/**
 * Cancelling, in the account's pop-up: first why (the admin's reasons, GET /settings/cancel-reasons; "Other" asks for
 * a few words), then "Cancel #… ?" with what it means for the money, then the cancellation. Errors stay in the pop-up.
 */
function CancelOrderDialog({ orderNumber, confirmLead, onCancel, onClose }: { orderNumber: string; confirmLead: string; onCancel: (reason: string, customText?: string) => Promise<unknown>; onClose: () => void }) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);
  const [step, setStep] = useState<"reason" | "confirm">("reason");
  const [reason, setReason] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: reasons = [], isLoading } = useQuery({ queryKey: ["cancel-reasons"], queryFn: fetchActiveCancelReasons, staleTime: 60_000 });

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

  const next = () => {
    if (!reason) return setProblem("Please select a cancellation reason.");
    if (reason === OTHER_CANCEL_REASON_VALUE && !customText.trim()) return setProblem("Please tell us why you are cancelling.");
    setProblem(null);
    setStep("confirm");
  };

  const cancel = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onCancel(reason!, customText.trim() || undefined);
      onClose();
    } catch (err) {
      setBusy(false);
      setProblem(err instanceof Error ? err.message : "We couldn't cancel the order. Please try again.");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (!busy && pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      // bg-transparent! beats .home-redesign's own white background (unlayered CSS), so the dimmed backdrop shows.
      className="home-redesign m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent! p-0 backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex md:items-center md:p-4"
    >
      <div className="relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-white text-slate-900 shadow-2xl shadow-brand-950/30 transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0 md:max-h-[calc(100dvh-2rem)] md:max-w-md md:rounded-3xl">
        <header className="shrink-0 px-6 pt-6 pr-18">
          <h2 id={`${id}-title`} className="font-display text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.01em] text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em]">
            {step === "reason" ? "Why are you cancelling?" : "Cancel this order?"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className={cn("absolute top-5 right-5 grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100", focusRing)}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-6 pt-3 pb-6 max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {step === "reason" ? (
            <>
              <p className="text-sm text-slate-600">Select a reason below.</p>
              {isLoading ? (
                <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Loading reasons…
                </p>
              ) : (
                <div role="radiogroup" aria-label="Cancellation reason" className="mt-3 flex flex-col gap-2">
                  {reasons.map((option) => {
                    const chosen = reason === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        onClick={() => {
                          setReason(option.value);
                          setProblem(null);
                          if (option.value !== OTHER_CANCEL_REASON_VALUE) setCustomText("");
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors",
                          chosen ? "bg-brand-50 text-brand-950 ring-2 ring-brand-500" : "bg-white text-slate-700 ring-1 ring-brand-100 hover:bg-brand-50/60",
                          focusRing,
                        )}
                      >
                        <span className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-2", chosen ? "bg-brand-600 ring-brand-600" : "ring-slate-300")}>
                          {chosen && <span className="size-2 rounded-full bg-white" />}
                        </span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {reason === OTHER_CANCEL_REASON_VALUE && (
                <label className="mt-4 block">
                  <span className="text-sm font-semibold text-slate-700">Please specify</span>
                  <textarea
                    value={customText}
                    onChange={(event) => setCustomText(event.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Tell us more…"
                    className="mt-1.5 block w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-900 ring-1 ring-slate-200 outline-none ring-inset focus:bg-white focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="mt-1 block text-right text-xs text-slate-500">{customText.length}/500 characters</span>
                </label>
              )}
              <div aria-live="polite">{problem && <ErrorText>{problem}</ErrorText>}</div>
              <div className="mt-6 flex items-center gap-3">
                <button type="button" onClick={onClose} className={secondaryButton}>
                  Back
                </button>
                <button type="button" onClick={next} disabled={isLoading} className={cn(primaryButton, "flex-1")}>
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm leading-relaxed text-rose-900 ring-1 ring-rose-200 ring-inset">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden="true" />
                <span>
                  Cancel <span className="font-semibold">#{orderNumber}</span>? {confirmLead}
                </span>
              </p>
              <div aria-live="polite">{problem && <ErrorText>{problem}</ErrorText>}</div>
              <div className="mt-6 flex items-center gap-3">
                <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
                  Keep order
                </button>
                <button
                  type="button"
                  onClick={() => void cancel()}
                  disabled={busy}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-snow shadow-lg shadow-rose-600/25 transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:bg-rose-400",
                    focusRing,
                  )}
                >
                  {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CircleCheck className="size-4" aria-hidden="true" />}
                  Yes, cancel order
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
