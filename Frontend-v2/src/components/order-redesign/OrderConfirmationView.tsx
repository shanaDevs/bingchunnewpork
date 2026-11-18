"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Home, LoaderCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { OrderTrackActions, OrderTrackDetails } from "@/components/account-redesign/orders/tracking/OrderTrackDetails";
import { useOrderTracking } from "@/components/account-redesign/orders/tracking/useOrderTracking";
import { CheckoutRedesignShell } from "@/components/checkout-redesign/CheckoutRedesignShell";
import { PageTitle } from "@/components/checkout-redesign/PageTop";
import { cn } from "@/components/home-redesign/lib/cn";
import { Container } from "@/components/home-redesign/ui/Container";
import { Confetti } from "@/components/spin-redesign/Confetti";
import { api } from "@/lib/api";
import { clearServerCart } from "@/lib/cartAuthSync";
import {
  claimPaymentReturn,
  readPayHereReturnParams,
} from "@/lib/payhereReturn";
import {
  clearOrderPaymentFlags,
  hasAwaitingPaymentFlag,
  hasPaidRedirectFlag,
  markPaidRedirect,
} from "@/lib/orderCelebration";
import { pollOrderPaymentStatus } from "@/lib/pollPaymentStatus";
import { playOrderConfirmedSound } from "@/lib/uiSounds";
import { useCartStore } from "@/store/cartStore";
import type { Order } from "@/types";
import { primaryButton, secondaryButton } from "@/components/account-redesign/accountUi";

/**
 * Post-checkout / public order tracking in the homepage-redesign look: SiteHeader, blue band, title, then the same
 * live track cards as My Orders. Keeps PayHere/WebXPay return handling that still lands on `/order/[id]`.
 */
export function OrderConfirmationView() {
  const { id } = useParams<{ id: string }>();
  const reference = typeof id === "string" ? id : "";
  const tracking = useOrderTracking(reference);
  const { order, isLoading, error } = tracking;
  const justConfirmed = useOrderPaymentReturn(reference, order);
  const firstName = (order?.user?.name || order?.guestName || "").trim().split(/\s+/)[0] ?? "";

  return (
    <CheckoutRedesignShell>
      <Container className="pt-6 pb-12 sm:pt-8 lg:pt-10 lg:pb-20">
        {!reference || (isLoading && !order) ? (
          <div className="flex min-h-96 items-center justify-center gap-3 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden="true" />
            Loading your order…
          </div>
        ) : !order ? (
          <NoOrder accessDenied={isAccessDenied(error)} />
        ) : (
          <>
            {justConfirmed && <Confetti />}
            {order.status === "CANCELLED" || tracking.cancelled ? (
              <PageTitle
                headline={
                  <>
                    Your order is <span className="relative isolate inline-block px-[0.1em] text-brand-700">
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.4em] -rotate-2 rounded-full bg-sun-300"
                      />
                      cancelled
                    </span>
                  </>
                }
                intro={firstName ? `Sorry, ${firstName}. Here's what happened with this order.` : "Here's what happened with this order."}
              />
            ) : (
              <PageTitle
                headline={
                  <>
                    Your happiness is{" "}
                    <span className="relative isolate inline-block px-[0.1em] text-brand-700">
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.4em] -rotate-2 rounded-full bg-sun-300"
                      />
                      on its way!
                    </span>
                  </>
                }
                intro={
                  firstName
                    ? `Thanks, ${firstName}! Here's everything in your order.`
                    : "Here's everything in your order."
                }
              />
            )}
            <OrderTrackDetails
              tracking={tracking}
              order={order}
              reference={reference}
              phoneBar="standalone"
              footer={<OrderTrackActions className="mt-2" />}
            />
          </>
        )}
      </Container>
    </CheckoutRedesignShell>
  );
}

function isAccessDenied(error: unknown) {
  return error instanceof Error && /track token|sign-in required|Forbidden|403/i.test(error.message);
}

function NoOrder({ accessDenied }: { accessDenied: boolean }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center rounded-[2.5rem] bg-cream-50 px-6 pt-8 pb-10 text-center ring-1 ring-cream-200 ring-inset sm:px-12">
      <Image
        src="/images/mascots/thinking.png"
        alt=""
        width={500}
        height={500}
        sizes="176px"
        className="size-36 origin-bottom sm:size-44"
      />
      <h2 className="mt-2 font-display-condensed text-[clamp(2rem,5vw,2.75rem)] leading-[0.95] text-brand-950 uppercase">
        {accessDenied ? "Sign in to view this order" : "Order not found"}
      </h2>
      <p className="mt-3 max-w-md text-base text-slate-600">
        {accessDenied
          ? "Use the link from your confirmation SMS or email, or sign in with the account that placed the order."
          : "It may have been placed as a guest or from another account. Guest orders can be tracked from the link in their confirmation."}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/menu" className={cn(primaryButton, "px-7 py-3.5 text-base shadow-lg shadow-brand-600/25")}>
          Explore Menu
        </Link>
        <Link href="/" className={cn(secondaryButton, "px-7 py-3.5 text-base")}>
          <Home className="size-4" aria-hidden="true" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}

/**
 * PayHere/WebXPay return + cart clear + confirm sound. Same behaviour as the old `/order/[id]` page; the track UI
 * itself comes from useOrderTracking.
 */
function useOrderPaymentReturn(id: string, order: Order | undefined) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const completeOrder = useCartStore((s) => s.completeOrder);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [paymentState, setPaymentState] = useState<"idle" | "confirming" | "paid" | "failed" | "pending">("idle");
  const cartClearedRef = useRef(false);
  const confirmSoundPlayedRef = useRef(false);

  useEffect(() => {
    if (!order || order.paymentStatus !== "PAID" || cartClearedRef.current) return;
    cartClearedRef.current = true;
    completeOrder();
    void clearServerCart();
  }, [order?.paymentStatus, order?.orderNumber, completeOrder]);

  useEffect(() => {
    if (!order || order.status === "CANCELLED" || !id) return;
    const currentOrder = order;

    const params = new URLSearchParams(window.location.search);
    const paidFromQuery = params.get("paid") === "1";
    const paymentFailed = params.get("payment") === "failed";
    const paymentPending = params.get("payment") === "pending";
    const failureReasonFromQuery = params.get("reason");
    const payhereParams = readPayHereReturnParams(params);
    const awaitingPayment = hasAwaitingPaymentFlag(currentOrder.orderNumber);
    const paidFromRedirect = paidFromQuery || hasPaidRedirectFlag(currentOrder.orderNumber);
    const isOnline = currentOrder.paymentMethod === "PAYHERE" || currentOrder.paymentMethod === "CARD";

    if (paidFromQuery) markPaidRedirect(currentOrder.orderNumber);

    const shouldCleanUrl = paidFromQuery || paymentFailed || paymentPending || Boolean(payhereParams);
    if (shouldCleanUrl) {
      router.replace(`/order/${encodeURIComponent(id)}`, { scroll: false });
    }

    const shouldHandlePayment =
      paidFromRedirect ||
      paymentFailed ||
      paymentPending ||
      (isOnline && currentOrder.paymentStatus === "PAID" && awaitingPayment) ||
      (isOnline && currentOrder.paymentStatus !== "PAID" && awaitingPayment) ||
      (isOnline && currentOrder.paymentStatus !== "PAID" && Boolean(payhereParams?.md5sig));

    if (!shouldHandlePayment) return;
    if (!claimPaymentReturn(currentOrder.orderNumber)) return;

    async function fetchFreshOrder() {
      const { orderApiPath } = await import("@/lib/orderTrackSession");
      return queryClient.fetchQuery({
        queryKey: ["order", id],
        queryFn: () => api.get<Order>(orderApiPath(id), true),
        staleTime: 0,
      });
    }

    async function celebrateOrder(showPaymentToast = false) {
      clearOrderPaymentFlags();
      completeOrder();
      await clearServerCart();
      setJustConfirmed(true);
      setPaymentState("paid");
      if (!confirmSoundPlayedRef.current) {
        confirmSoundPlayedRef.current = true;
        playOrderConfirmedSound();
      }
      if (showPaymentToast) toast.success("Payment successful — your order is confirmed!");
    }

    async function handlePaymentResult() {
      if (paidFromRedirect) {
        setPaymentState("confirming");
        let fresh = await fetchFreshOrder();

        if (fresh.paymentStatus !== "PAID") {
          try {
            await api.post(
              `/orders/${encodeURIComponent(currentOrder.orderNumber)}/confirm-payhere-popup`,
              { trackToken: id },
              true,
            );
            fresh = await fetchFreshOrder();
          } catch {
            /* fall through to poll */
          }
        }

        if (fresh.paymentStatus !== "PAID") {
          const polled = await pollOrderPaymentStatus(currentOrder.orderNumber, {
            maxAttempts: 4,
            intervalMs: 1000,
          });
          if (polled === "PAID") fresh = await fetchFreshOrder();
          else if (polled === "FAILED") {
            setPaymentState("failed");
            clearOrderPaymentFlags();
            toast.error("Payment failed. You can try again below.");
            return;
          }
        }

        await queryClient.invalidateQueries({ queryKey: ["order", id] });
        if (fresh.paymentStatus === "PAID") {
          await celebrateOrder(true);
          return;
        }
        setPaymentState("failed");
        toast.error("Payment could not be confirmed. Please try Pay Again.");
        return;
      }

      if (isOnline && currentOrder.paymentStatus === "PAID" && awaitingPayment) {
        await celebrateOrder(true);
        return;
      }

      if (isOnline && currentOrder.paymentStatus !== "PAID" && awaitingPayment) {
        setPaymentState("confirming");
        try {
          await api.post(
            `/orders/${encodeURIComponent(currentOrder.orderNumber)}/confirm-payhere-popup`,
            { trackToken: id },
            true,
          );
          await queryClient.invalidateQueries({ queryKey: ["order", id] });
          const fresh = await fetchFreshOrder();
          if (fresh.paymentStatus === "PAID") {
            await celebrateOrder(true);
            return;
          }
        } catch {
          /* handled below */
        }
        setPaymentState("failed");
        toast.error("Payment could not be confirmed. Please try Pay Again.");
        return;
      }

      if (paymentFailed) {
        clearOrderPaymentFlags();
        const reason = failureReasonFromQuery || currentOrder.paymentFailureReason || undefined;
        const checkoutUrl = reason
          ? `/checkout?payment=failed&reason=${encodeURIComponent(reason)}`
          : "/checkout?payment=failed";
        router.replace(checkoutUrl);
        return;
      }

      if (paymentPending) {
        setPaymentState("pending");
        return;
      }

      if (isOnline && currentOrder.paymentStatus !== "PAID" && payhereParams?.md5sig) {
        setPaymentState("confirming");
        try {
          const confirmed = await api.post<Pick<Order, "paymentStatus">>(
            `/orders/${encodeURIComponent(currentOrder.orderNumber)}/confirm-payment`,
            { ...payhereParams, trackToken: id },
            true,
          );
          await queryClient.invalidateQueries({ queryKey: ["order", id] });
          if (confirmed.paymentStatus === "PAID") {
            await celebrateOrder(true);
            return;
          }
          if (confirmed.paymentStatus === "FAILED") {
            setPaymentState("failed");
            toast.error("Payment failed. You can try again below.");
            return;
          }
          setPaymentState("pending");
        } catch (err) {
          setPaymentState("pending");
          toast.error(err instanceof Error ? err.message : "Could not verify payment");
        }
      }
    }

    void handlePaymentResult();
  }, [order?.orderNumber, order?.paymentStatus, order?.paymentMethod, order?.status, id, router, completeOrder, queryClient]);

  useEffect(() => {
    if (!order || order.paymentStatus !== "PAID") return;
    if (paymentState === "confirming" || paymentState === "pending") {
      setPaymentState("paid");
      setJustConfirmed(true);
    }
  }, [order?.paymentStatus, paymentState]);

  // Cash / already-paid landings: celebrate once when the page opens soon after checkout.
  useEffect(() => {
    if (!order || order.status === "CANCELLED") return;
    const isOnline = order.paymentMethod === "PAYHERE" || order.paymentMethod === "CARD";
    if (isOnline && order.paymentStatus !== "PAID") return;
    if (confirmSoundPlayedRef.current) return;
    const placedAt = new Date(order.createdAt).getTime();
    if (!Number.isFinite(placedAt) || Date.now() - placedAt > 10 * 60_000) return;
    if (sessionStorage.getItem(`bc-order-confirmed-sound-${order.orderNumber}`)) return;
    try {
      sessionStorage.setItem(`bc-order-confirmed-sound-${order.orderNumber}`, "1");
    } catch {
      /* ignore */
    }
    confirmSoundPlayedRef.current = true;
    playOrderConfirmedSound();
    setJustConfirmed(true);
  }, [order?.orderNumber, order?.paymentStatus, order?.paymentMethod, order?.status, order?.createdAt]);

  return justConfirmed;
}
