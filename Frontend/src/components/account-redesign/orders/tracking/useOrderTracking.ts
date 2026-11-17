"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useOrderTrackSocket, type DeliveryCodePayload, type DeliveryStatePayload, type EtaUpdatePayload } from "@/hooks/useCustomerSocket";
import { api } from "@/lib/api";
import { invalidateCustomerOrderLists, patchOrderInQueryCache } from "@/lib/orderCache";
import { buildStatusTimestampMap, getTrackingStepIndex, getTrackingSteps, isNewCompletionStatus, isTrackingComplete } from "@/lib/orderStatus";
import { orderApiPath, rememberOrderTrackToken } from "@/lib/orderTrackSession";
import { openPayHereCheckout } from "@/lib/openPayHereCheckout";
import { openWebXPayCheckout } from "@/lib/openWebXPayCheckout";
import type { Order, OrderStatus } from "@/types";

/**
 * Everything the old live-tracking page (/order/[n]) did for an order, for the account's order details: the order
 * from GET /orders/:number (the same query key as that page, so the two stay in step), checked again on the old
 * page's schedule (every 8 to 30 seconds while it's under way or awaiting payment), and the order's live socket:
 * status changes, the pickup queue and time, "pickup in 5 minutes", the rider's delivery state, the live ETA and the
 * delivery code (kept for the session, with its toast once). When it's delivered or ready while open, the
 * celebration shows. Cancel (with the reason) and Pay Again (PayHere or WebXPay, whichever the admin has on) work as
 * they did. Coming back from a payment is still handled on /order/[n], where the payment pages return to.
 * `initial`: the order from My Orders, shown at once while the full order loads.
 */
export function useOrderTracking(reference: string, initial?: Order) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [liveStatus, setLiveStatus] = useState<OrderStatus | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [liveQueue, setLiveQueue] = useState<{ queuePosition?: number; scheduledPickupAt?: string } | null>(null);
  const [liveEtaMinutes, setLiveEtaMinutes] = useState<number | null>(null);
  const [deliveryState, setDeliveryState] = useState<string | null>(null);
  const [socketCode, setSocketCode] = useState<string | null>(() => readStoredCode(reference));
  /** Whether the order's socket is connected, for the checking schedule. */
  const socketConnected = useRef(false);
  const [payingAgain, setPayingAgain] = useState(false);
  const modeRef = useRef<Order["orderMode"] | undefined>(initial?.orderMode);
  const statusRef = useRef<OrderStatus | null>(initial?.status ?? null);
  const celebratedRef = useRef(false);
  const codeToastedRef = useRef<string | null>(null);

  const query = useQuery<Order>({
    queryKey: ["order", reference],
    queryFn: async () => {
      const data = await api.get<Order>(orderApiPath(reference), true);
      if (data?.orderNumber && data.trackToken) rememberOrderTrackToken(data.orderNumber, data.trackToken);
      return data;
    },
    placeholderData: initial,
    refetchInterval: (current) => {
      const data = current.state.data;
      if (data && (data.status === "DELIVERED" || data.status === "CANCELLED")) return false;
      if (data && (data.paymentMethod === "PAYHERE" || data.paymentMethod === "CARD") && data.paymentStatus === "PENDING") return 8000;
      // Keep checking during a delivery even with the socket on: events can be missed through proxies or reconnects.
      if (data?.orderMode === "DELIVERY") return socketConnected.current ? 10_000 : 8_000;
      if (socketConnected.current) return false;
      return data?.orderMode === "TAKEAWAY" ? 15_000 : 30_000;
    },
  });
  const order = query.data;

  useEffect(() => {
    if (!order) return;
    modeRef.current = order.orderMode;
    statusRef.current = order.status;
  }, [order]);

  const endCelebration = useCallback(() => setCelebrating(false), []);
  const celebrate = useCallback(() => {
    if (celebratedRef.current) return;
    celebratedRef.current = true;
    setCelebrating(true);
  }, []);

  const onLiveStatus = useCallback(
    (data: { status: OrderStatus }) => {
      setLiveStatus((previous) => {
        if (previous === data.status) return previous;
        void queryClient.invalidateQueries({ queryKey: ["order", reference] });
        const before = (previous ?? statusRef.current ?? "RECEIVED") as OrderStatus;
        if (modeRef.current && isNewCompletionStatus(data.status, before, modeRef.current === "DELIVERY")) celebrate();
        return data.status;
      });
    },
    [queryClient, reference, celebrate],
  );

  const onPickupSoon = useCallback((data: { title?: string; message?: string }) => {
    toast(data.message || data.title || "Pickup in 5 minutes!", { icon: "⏰", duration: 6000 });
  }, []);

  const onQueueUpdate = useCallback((data: { queuePosition?: number; scheduledPickupAt?: string }) => setLiveQueue(data), []);
  const onDeliveryState = useCallback((data: DeliveryStatePayload) => setDeliveryState(data.state), []);
  const onEtaUpdate = useCallback((data: EtaUpdatePayload) => {
    if (typeof data.estimatedMinutes === "number") setLiveEtaMinutes(data.estimatedMinutes);
  }, []);

  // The code is only pushed once, so it's kept for the session until the order is done; its toast shows once.
  const onDeliveryCode = useCallback(
    (data: DeliveryCodePayload) => {
      if (!data.code) return;
      setSocketCode(data.code);
      storeCode(reference, data.code);
      if (codeToastedRef.current === data.code) return;
      try {
        const toastKey = `bc-delivery-code-toast-${reference}`;
        if (sessionStorage.getItem(toastKey) === data.code) return;
        sessionStorage.setItem(toastKey, data.code);
      } catch {
        /* storage unavailable */
      }
      codeToastedRef.current = data.code;
      toast(`Your delivery code is ${data.code}`, { icon: "🔐", duration: 8000 });
    },
    [reference],
  );

  const connected = useOrderTrackSocket([reference, order?.id, order?.orderNumber], onLiveStatus, onQueueUpdate, onPickupSoon, onDeliveryState, onEtaUpdate, onDeliveryCode, reference);
  useEffect(() => {
    socketConnected.current = connected;
  }, [connected]);

  // The code from the order itself, kept for the session too.
  useEffect(() => {
    if (order?.deliveryCode) storeCode(reference, order.deliveryCode, order.id);
  }, [order?.deliveryCode, order?.id, reference]);

  // The app's own "order complete" event (from the notification socket), as on the old page.
  useEffect(() => {
    if (!order) return;
    const onComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ orderNumber?: string; orderId?: string; status: OrderStatus }>).detail;
      if (detail.orderNumber !== reference && detail.orderNumber !== order.orderNumber && detail.orderId !== order.id) return;
      if (isNewCompletionStatus(detail.status, liveStatus ?? order.status, order.orderMode === "DELIVERY")) {
        celebrate();
        setLiveStatus(detail.status);
      }
    };
    window.addEventListener("bc-order-complete", onComplete);
    return () => window.removeEventListener("bc-order-complete", onComplete);
  }, [order, liveStatus, reference, celebrate]);

  const cancelMutation = useMutation({
    mutationFn: ({ reason, customText }: { reason: string; customText?: string }) =>
      api.post(`/orders/${encodeURIComponent(reference)}/cancel`, { cancellationReason: reason, customReasonText: customText }, true),
    onSuccess: () => {
      setLiveStatus("CANCELLED");
      patchOrderInQueryCache(queryClient, [reference, order?.id, order?.orderNumber], { orderId: order?.id, orderNumber: order?.orderNumber ?? reference, status: "CANCELLED" });
      void queryClient.invalidateQueries({ queryKey: ["order", reference] });
      invalidateCustomerOrderLists(queryClient);
      toast.success("Order cancelled");
    },
  });

  const isOnline = order?.paymentMethod === "PAYHERE" || order?.paymentMethod === "CARD";
  const { data: paymentConfig } = useQuery({
    queryKey: ["payment-methods", order?.orderMode, order?.subtotal],
    queryFn: () => api.get<{ activeOnlineGateway?: "PAYHERE" | "WEBXPAY" }>(`/settings/payment-methods?orderMode=${order!.orderMode}&orderSubtotal=${order!.subtotal}`),
    enabled: Boolean(order && isOnline),
    staleTime: 30_000,
  });

  const gateway = paymentConfig?.activeOnlineGateway ?? "PAYHERE";
  const payAgain = useCallback(async () => {
    if (!order) return;
    setPayingAgain(true);
    try {
      const options = { orderNumber: order.orderNumber, trackToken: order.trackToken ?? reference, router };
      if (gateway === "WEBXPAY") await openWebXPayCheckout(options);
      else await openPayHereCheckout(options);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open payment");
    } finally {
      setPayingAgain(false);
    }
  }, [order, reference, router, gateway]);

  const statusTimestamps = useMemo(() => {
    if (!order) return {} as Partial<Record<string, string>>;
    const map: Partial<Record<string, string>> = { ...buildStatusTimestampMap(order.statusEvents, order.createdAt) };
    if (order.deliveryPickedUpAt) map.PICKUP = order.deliveryPickedUpAt;
    else if (order.assignedDriver && order.deliveryPhase === "TO_OUTLET" && map.READY) map.PICKUP = map.READY;
    return map;
  }, [order]);

  const status: OrderStatus | undefined = liveStatus ?? order?.status;
  const delivery = order?.orderMode === "DELIVERY";
  const steps = getTrackingSteps(delivery);
  const currentStep = order && status ? getTrackingStepIndex(steps, status, { deliveryPhase: order.deliveryPhase, deliveryPickedUp: order.deliveryPickedUp, hasAssignedDriver: Boolean(order.assignedDriver) }) : 0;
  const cancelled = status === "CANCELLED";
  const complete = status ? isTrackingComplete(status, delivery) : false;
  const awaitingPayment = Boolean(order && isOnline && order.paymentStatus !== "PAID" && !cancelled);

  return {
    order,
    isLoading: query.isLoading,
    error: query.error,
    status,
    delivery,
    steps,
    currentStep,
    statusTimestamps,
    cancelled,
    complete,
    awaitingPayment,
    canCancel: Boolean(order?.canCancel) && !cancelled && !awaitingPayment,
    queuePosition: liveQueue?.queuePosition ?? order?.queuePosition,
    scheduledPickupAt: liveQueue?.scheduledPickupAt ?? order?.scheduledPickupAt,
    etaMinutes: liveEtaMinutes ?? order?.estimatedMinutes,
    onEtaUpdate,
    deliveryState,
    deliveryCode: order?.deliveryCode ?? socketCode,
    celebrating,
    endCelebration,
    cancel: (reason: string, customText?: string) => cancelMutation.mutateAsync({ reason, customText }),
    cancelling: cancelMutation.isPending,
    payAgain,
    payingAgain,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["order", reference] }),
  };
}

export type OrderTracking = ReturnType<typeof useOrderTracking>;

function readStoredCode(reference: string) {
  try {
    return typeof window === "undefined" ? null : sessionStorage.getItem(`bc-delivery-code-${reference}`);
  } catch {
    return null;
  }
}

function storeCode(reference: string, code: string, orderId?: string) {
  try {
    sessionStorage.setItem(`bc-delivery-code-${reference}`, code);
    if (orderId && orderId !== reference) sessionStorage.setItem(`bc-delivery-code-${orderId}`, code);
  } catch {
    /* storage unavailable */
  }
}
