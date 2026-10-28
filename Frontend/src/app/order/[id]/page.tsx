'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, MapPin, Home, Receipt, CreditCard, Loader2, Truck, ShieldCheck, XCircle, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { markReceiptOpenedFrom } from '@/lib/orderLinks';
import { api } from '@/lib/api';
import { openPayHereCheckout } from '@/lib/openPayHereCheckout';
import { openWebXPayCheckout } from '@/lib/openWebXPayCheckout';
import type { Order, OrderStatus } from '@/types';
import toast from 'react-hot-toast';
import { claimPaymentReturn, readPayHereReturnParams } from '@/lib/payhereReturn';
import { pollOrderPaymentStatus } from '@/lib/pollPaymentStatus';
import {
  useOrderTrackSocket,
  type DeliveryCodePayload,
  type DeliveryStatePayload,
  type EtaUpdatePayload,
} from '@/hooks/useCustomerSocket';
import OrderQrCard from '@/components/order/OrderQrCard';
import OrderDeliveredCelebration from '@/components/order/OrderDeliveredCelebration';
import PlatformRatingCard from '@/components/order/PlatformRatingCard';
import RiderRatingCard from '@/components/order/RiderRatingCard';
import AnimatedBrandLogo from '@/components/ui/AnimatedBrandLogo';
import { playOrderConfirmedSound } from '@/lib/uiSounds';
import OrderTrackingProgress from '@/components/order/OrderTrackingProgress';
import AssignedDriverCard from '@/components/order/AssignedDriverCard';
import TakeawayPickupQueue from '@/components/order/TakeawayPickupQueue';
import OrderCancelCountdown from '@/components/order/OrderCancelCountdown';
import CancellationReasonDialog from '@/components/order/CancellationReasonDialog';
import {
  clearOrderPaymentFlags,
  hasAwaitingPaymentFlag,
  hasPaidRedirectFlag,
  markPaidRedirect,
} from '@/lib/orderCelebration';
import { useCartStore } from '@/store/cartStore';
import { clearServerCart } from '@/lib/cartAuthSync';
import { useAuthStore } from '@/store/authStore';
import {
  buildStatusTimestampMap,
  getTrackingStepIndex,
  getTrackingSteps,
  isNewCompletionStatus,
  isTrackingComplete,
  STATUS_LABELS,
} from '@/lib/orderStatus';
import { formatMoney, formatMoneyAmount, formatReceiptDate } from '@/lib/receipt';
import { invalidateCustomerOrderLists, patchOrderInQueryCache } from '@/lib/orderCache';

const LiveDeliveryMap = dynamic(() => import('@/components/order/LiveDeliveryMap'), {
  ssr: false,
  loading: () => (
    <div className="delivery-map-wrap flex items-center justify-center rounded-xl border border-navy-border" style={{ minHeight: 260 }}>
      <Loader2 size={20} className="animate-spin text-brand" />
    </div>
  ),
});

function getCancelledStatusMessage(order: Order): string {
  const isOnlinePayment = order.paymentMethod === 'PAYHERE' || order.paymentMethod === 'CARD';
  const paid = order.paymentStatus === 'PAID';
  const refund = order.refund;

  if (refund?.status === 'REJECTED') {
    return 'This refund was not approved. Contact the store if you have questions.';
  }
  if (refund?.status === 'COMPLETE') {
    const amount = refund.refundAmount ?? 0;
    if (amount > 0) {
      return `${formatMoney(amount)} has been refunded. It will be added to your original payment method in 2 to 3 days.`;
    }
    return 'No refund';
  }
  if (refund?.status === 'RECEIVED') {
    return 'Refund requested — we\u2019ll process it shortly.';
  }
  if (isOnlinePayment && paid) {
    return 'If you paid online, a refund will be processed separately.';
  }
  if (
    isOnlinePayment
    && order.paymentStatus !== 'PAID'
    && order.paymentStatus !== 'REFUNDED'
  ) {
    return 'No payment was taken for this order.';
  }
  return '';
}

function OrderStoreAddressCard({ order, isDelivery }: { order: Order; isDelivery: boolean }) {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <MapPin size={18} className="text-brand mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-fg">{order.store.name}</p>
          <p className="text-soft text-sm">{order.store.addressLine}</p>
        </div>
      </div>
      {isDelivery && order.address && (
        <div className="flex items-start gap-3 mt-3 pt-3 border-t border-navy-border">
          <Home size={18} className="text-brand mt-0.5 shrink-0" />
          <div>
            <p className="text-soft text-xs">Delivery to</p>
            <p className="text-fg text-sm">{order.address.addressLine}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderItemsSummary({ order }: { order: Order }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-fg mb-3">Order Items</h3>
      <div className="space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm gap-2">
            <span className="text-soft flex-1">{item.productName} × {item.quantity}</span>
            <span className="text-fg tabular-nums shrink-0">{formatMoneyAmount(item.totalPrice)}</span>
          </div>
        ))}
        <div className="border-t border-navy-border pt-2 mt-2 space-y-1.5">
          {order.deliveryFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-soft">Delivery fee</span>
              <span className="tabular-nums">{formatMoneyAmount(order.deliveryFee)}</span>
            </div>
          )}
          {(order.convenientFee ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-soft">Convenience fee</span>
              <span className="tabular-nums">{formatMoneyAmount(order.convenientFee)}</span>
            </div>
          )}
          {order.discount > 0 && (
            <div className="flex justify-between text-sm text-green-400">
              <span>Discount</span>
              <span className="tabular-nums">−{formatMoneyAmount(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold pt-1 border-t border-navy-border">
            <span>Total</span>
            <span className="text-brand tabular-nums">{formatMoney(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderPageActions({
  orderNumber,
  className = 'mt-6',
}: {
  orderNumber: string;
  className?: string;
}) {
  return (
    <div className={`order-page__actions grid grid-cols-3 gap-2 sm:gap-3 ${className}`}>
      <Link
        href={`/order/${orderNumber}/receipt`}
        onClick={() => markReceiptOpenedFrom()}
        className="btn-primary py-3 px-2 text-xs sm:text-sm justify-center flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 min-w-0"
      >
        <Receipt size={16} className="shrink-0" />
        <span className="truncate">Receipt</span>
      </Link>
      <Link
        href="/"
        className="btn-outline py-3 px-2 text-xs sm:text-sm justify-center flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 min-w-0"
      >
        <Home size={16} className="shrink-0" />
        <span className="truncate">Home</span>
      </Link>
      <Link
        href="/account/orders"
        className="btn-outline py-3 px-2 text-xs sm:text-sm justify-center flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 min-w-0"
      >
        <ClipboardList size={16} className="shrink-0" />
        <span className="truncate">Orders</span>
      </Link>
    </div>
  );
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [liveStatus, setLiveStatus] = useState<OrderStatus | null>(null);
  const [showDeliveredCelebration, setShowDeliveredCelebration] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [paymentState, setPaymentState] = useState<'idle' | 'confirming' | 'paid' | 'failed' | 'pending'>('idle');
  const [paymentFailureReason, setPaymentFailureReason] = useState<string | null>(null);
  const [payingAgain, setPayingAgain] = useState(false);
  const [liveQueue, setLiveQueue] = useState<{
    queuePosition?: number;
    scheduledPickupAt?: string;
  } | null>(null);
  const [liveEtaMinutes, setLiveEtaMinutes] = useState<number | null>(null);
  const [deliveryState, setDeliveryState] = useState<string | null>(null);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const completeOrder = useCartStore((s) => s.completeOrder);
  const orderModeRef = useRef<'DELIVERY' | 'TAKEAWAY' | undefined>(undefined);
  const orderStatusRef = useRef<OrderStatus | null>(null);
  const completionCelebratedRef = useRef(false);
  const confirmSoundPlayedRef = useRef(false);
  const cartClearedRef = useRef(false);
  const deliveryCodeToastedRef = useRef<string | null>(null);
  const closeDeliveredCelebration = useCallback(() => setShowDeliveredCelebration(false), []);

  const onLiveStatus = useCallback(
    (data: { status: OrderStatus; orderNumber?: string; note?: string }) => {
      setLiveStatus((prev) => {
        if (prev === data.status) return prev;

        void queryClient.invalidateQueries({ queryKey: ['order', id] });

        const isDelivery = orderModeRef.current === 'DELIVERY';
        const previousStatus = (prev ?? orderStatusRef.current ?? 'RECEIVED') as OrderStatus;
        const isCompletion = isNewCompletionStatus(data.status, previousStatus, isDelivery);

        if (orderModeRef.current && isCompletion && !completionCelebratedRef.current) {
          completionCelebratedRef.current = true;
          setShowDeliveredCelebration(true);
        } else if (!isAuthenticated) {
          toast(STATUS_LABELS[data.status] || 'Order updated', { duration: 4000 });
        }

        return data.status;
      });
    },
    [isAuthenticated, queryClient, id]
  );

  const onPickupSoon = useCallback((data: { title?: string; message?: string }) => {
    toast(data.message || data.title || 'Pickup in 5 minutes!', { icon: '⏰', duration: 6000 });
  }, []);

  const onQueueUpdate = useCallback(
    (data: { queuePosition?: number; scheduledPickupAt?: string }) => {
      setLiveQueue(data);
    },
    []
  );

  const onDeliveryState = useCallback((data: DeliveryStatePayload) => {
    setDeliveryState(data.state);
  }, []);

  const onEtaUpdate = useCallback((data: EtaUpdatePayload) => {
    if (typeof data.estimatedMinutes === 'number') setLiveEtaMinutes(data.estimatedMinutes);
  }, []);

  // The code is only pushed once, so keep it across reloads until the order is done.
  const onDeliveryCode = useCallback(
    (data: DeliveryCodePayload) => {
      if (!data.code) return;
      setDeliveryCode(data.code);
      try {
        sessionStorage.setItem(`bc-delivery-code-${id}`, data.code);
      } catch {
        /* storage unavailable */
      }
      if (deliveryCodeToastedRef.current === data.code) return;
      try {
        const toastKey = `bc-delivery-code-toast-${id}`;
        if (sessionStorage.getItem(toastKey) === data.code) return;
        sessionStorage.setItem(toastKey, data.code);
      } catch {
        /* storage unavailable */
      }
      deliveryCodeToastedRef.current = data.code;
      toast(`Your delivery code is ${data.code}`, { icon: '🔐', duration: 8000 });
    },
    [id]
  );

  const { data: order, isLoading, error: orderError } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const { orderApiPath, rememberOrderTrackToken } = await import('@/lib/orderTrackSession');
      // When the path is already the track token, remember it under orderNumber after load.
      const data = await api.get<Order>(orderApiPath(id), true);
      if (data?.orderNumber && data.trackToken) {
        rememberOrderTrackToken(data.orderNumber, data.trackToken);
      } else if (data?.orderNumber && id !== data.orderNumber) {
        // Path was track token (stripped from public payload) — remember path as token.
        rememberOrderTrackToken(data.orderNumber, id);
      }
      return data;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (paymentState === 'confirming') return false;
      if (data && (data.status === 'DELIVERED' || data.status === 'CANCELLED')) return false;
      if (
        data &&
        (data.paymentMethod === 'PAYHERE' || data.paymentMethod === 'CARD') &&
        data.paymentStatus === 'PENDING'
      ) {
        return 8000;
      }
      // Keep polling during active delivery even when the socket is connected — events can be
      // missed through proxies or brief reconnects.
      if (data?.orderMode === 'DELIVERY') {
        return socketConnected ? 10_000 : 8_000;
      }
      if (socketConnected) return false;
      return data?.orderMode === 'TAKEAWAY' ? 15_000 : 30_000;
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: ({ reason, customText }: { reason: string; customText?: string }) => 
      api.post(`/orders/${id}/cancel`, {
        cancellationReason: reason,
        customReasonText: customText,
      }, true),
    onSuccess: () => {
      setLiveStatus('CANCELLED');
      patchOrderInQueryCache(queryClient, [id, order?.id, order?.orderNumber], {
        orderId: order?.id,
        orderNumber: order?.orderNumber ?? (typeof id === 'string' ? id : undefined),
        status: 'CANCELLED',
      });
      void queryClient.invalidateQueries({ queryKey: ['order', id] });
      invalidateCustomerOrderLists(queryClient);
      toast.success('Order cancelled');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: paymentConfig } = useQuery({
    queryKey: ['payment-methods', order?.orderMode, order?.subtotal],
    queryFn: () =>
      api.get<{ activeOnlineGateway?: 'PAYHERE' | 'WEBXPAY' }>(
        `/settings/payment-methods?orderMode=${order!.orderMode}&orderSubtotal=${order!.subtotal}`,
      ),
    enabled: Boolean(order && (order.paymentMethod === 'PAYHERE' || order.paymentMethod === 'CARD')),
    staleTime: 30_000,
  });

  const activeOnlineGateway = paymentConfig?.activeOnlineGateway ?? 'PAYHERE';
  const paymentGatewayLabel = 'online payment';

  const trackSocketConnected = useOrderTrackSocket(
    [id, order?.id, order?.orderNumber],
    onLiveStatus,
    onQueueUpdate,
    onPickupSoon,
    onDeliveryState,
    onEtaUpdate,
    onDeliveryCode,
    id,
  );

  useEffect(() => {
    setSocketConnected(trackSocketConnected);
  }, [trackSocketConnected]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`bc-delivery-code-${id}`);
      if (stored) setDeliveryCode(stored);
    } catch {
      /* storage unavailable */
    }
  }, [id]);

  useEffect(() => {
    if (!order?.deliveryCode) return;
    setDeliveryCode(order.deliveryCode);
    try {
      sessionStorage.setItem(`bc-delivery-code-${id}`, order.deliveryCode);
      if (order.id && order.id !== id) {
        sessionStorage.setItem(`bc-delivery-code-${order.id}`, order.deliveryCode);
      }
    } catch {
      /* storage unavailable */
    }
  }, [order?.deliveryCode, order?.id, id]);

  const handlePayAgain = useCallback(async () => {
    if (!order) return;
    setPayingAgain(true);
    try {
      if (activeOnlineGateway === 'WEBXPAY') {
        await openWebXPayCheckout({
          orderNumber: order.orderNumber,
          trackToken: order.trackToken ?? id,
          router,
        });
      } else {
        await openPayHereCheckout({
          orderNumber: order.orderNumber,
          trackToken: order.trackToken ?? id,
          router,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open payment');
    } finally {
      setPayingAgain(false);
    }
  }, [order, router, activeOnlineGateway]);

  useEffect(() => {
    if (order?.paymentFailureReason) {
      setPaymentFailureReason(order.paymentFailureReason);
    }
  }, [order?.paymentFailureReason]);

  useEffect(() => {
    if (!order) return;
    orderModeRef.current = order.orderMode;
    orderStatusRef.current = order.status;
  }, [order]);

  useEffect(() => {
    if (!id || !order) return;

    const onComplete = (e: Event) => {
      const detail = (e as CustomEvent<{ orderNumber?: string; orderId?: string; status: OrderStatus }>).detail;
      const matches =
        detail.orderNumber === id ||
        detail.orderNumber === order.orderNumber ||
        detail.orderId === order.id;
      if (!matches) return;

      const isDelivery = order.orderMode === 'DELIVERY';
      const previous = liveStatus ?? order.status;
      if (
        !completionCelebratedRef.current &&
        isNewCompletionStatus(detail.status, previous, isDelivery)
      ) {
        completionCelebratedRef.current = true;
        setShowDeliveredCelebration(true);
        setLiveStatus(detail.status);
      }
    };

    window.addEventListener('bc-order-complete', onComplete);
    return () => window.removeEventListener('bc-order-complete', onComplete);
  }, [id, order, liveStatus]);

  useEffect(() => {
    if (!order || order.paymentStatus !== 'PAID' || cartClearedRef.current) return;
    cartClearedRef.current = true;
    completeOrder();
    void clearServerCart();
  }, [order?.paymentStatus, order?.orderNumber, completeOrder]);

  useEffect(() => {
    if (!order || order.status === 'CANCELLED') return;
    const currentOrder = order;

    const params = new URLSearchParams(window.location.search);
    const paidFromQuery = params.get('paid') === '1';
    const paymentFailed = params.get('payment') === 'failed';
    const paymentPending = params.get('payment') === 'pending';
    const failureReasonFromQuery = params.get('reason');
    const payhereParams = readPayHereReturnParams(params);
    const awaitingPayment = hasAwaitingPaymentFlag(currentOrder.orderNumber);
    const paidFromRedirect =
      paidFromQuery || hasPaidRedirectFlag(currentOrder.orderNumber);
    const isOnline =
      currentOrder.paymentMethod === 'PAYHERE' || currentOrder.paymentMethod === 'CARD';

    if (paidFromQuery) {
      markPaidRedirect(currentOrder.orderNumber);
    }

    if (failureReasonFromQuery) {
      setPaymentFailureReason(failureReasonFromQuery);
    }

    const shouldCleanUrl =
      paidFromQuery || paymentFailed || paymentPending || Boolean(payhereParams);
    if (shouldCleanUrl) {
      // Keep the same path segment (track token or order number). Swapping a
      // track-token URL for the public order number drops guest access and
      // shows "Order not found" after PayHere/WebXPay return.
      router.replace(`/order/${encodeURIComponent(id)}`, { scroll: false });
    }

    const shouldHandlePayment =
      paidFromRedirect ||
      paymentFailed ||
      paymentPending ||
      (isOnline && currentOrder.paymentStatus === 'PAID' && awaitingPayment) ||
      (isOnline && currentOrder.paymentStatus !== 'PAID' && awaitingPayment) ||
      (isOnline && currentOrder.paymentStatus !== 'PAID' && Boolean(payhereParams?.md5sig));

    if (!shouldHandlePayment) return;
    if (!claimPaymentReturn(currentOrder.orderNumber)) return;

    async function fetchFreshOrder() {
      const { orderApiPath } = await import('@/lib/orderTrackSession');
      return queryClient.fetchQuery({
        queryKey: ['order', id],
        queryFn: () => api.get<Order>(orderApiPath(id), true),
        staleTime: 0,
      });
    }

    async function celebrateOrder(showPaymentToast = false) {
      clearOrderPaymentFlags();
      completeOrder();
      await clearServerCart();
      setJustConfirmed(true);
      setPaymentState('paid');
      if (!confirmSoundPlayedRef.current) {
        confirmSoundPlayedRef.current = true;
        playOrderConfirmedSound();
      }
      if (showPaymentToast) {
        toast.success('Payment successful — your order is confirmed!');
      }
    }

    async function handlePaymentResult() {
      if (paidFromRedirect) {
        setPaymentState('confirming');
        let fresh = await fetchFreshOrder();

        if (fresh.paymentStatus !== 'PAID') {
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

        if (fresh.paymentStatus !== 'PAID') {
          const polled = await pollOrderPaymentStatus(currentOrder.orderNumber, {
            maxAttempts: 4,
            intervalMs: 1000,
          });
          if (polled === 'PAID') {
            fresh = await fetchFreshOrder();
          } else if (polled === 'FAILED') {
            setPaymentState('failed');
            clearOrderPaymentFlags();
            toast.error('Payment failed. You can try again below.');
            return;
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['order', id] });

        if (fresh.paymentStatus === 'PAID') {
          await celebrateOrder(true);
          return;
        }

        setPaymentState('failed');
        toast.error('Payment could not be confirmed. Please try Pay Again.');
        return;
      }

      if (isOnline && currentOrder.paymentStatus === 'PAID' && awaitingPayment) {
        await celebrateOrder(true);
        return;
      }

      if (isOnline && currentOrder.paymentStatus !== 'PAID' && awaitingPayment) {
        setPaymentState('confirming');
        try {
          await api.post(
            `/orders/${encodeURIComponent(currentOrder.orderNumber)}/confirm-payhere-popup`,
            { trackToken: id },
            true,
          );
          await queryClient.invalidateQueries({ queryKey: ['order', id] });
          const fresh = await fetchFreshOrder();
          if (fresh.paymentStatus === 'PAID') {
            await celebrateOrder(true);
            return;
          }
        } catch {
          /* handled below */
        }
        setPaymentState('failed');
        toast.error('Payment could not be confirmed. Please try Pay Again.');
        return;
      }

      if (paymentFailed) {
        clearOrderPaymentFlags();
        const reason = failureReasonFromQuery || currentOrder.paymentFailureReason || undefined;
        const checkoutUrl = reason
          ? `/checkout?payment=failed&reason=${encodeURIComponent(reason)}`
          : '/checkout?payment=failed';
        router.replace(checkoutUrl);
        return;
      }

      if (paymentPending) {
        setPaymentState('pending');
        return;
      }

      // Legacy fallback: PayHere redirected to frontend with signed params (old return URLs).
      if (isOnline && currentOrder.paymentStatus !== 'PAID' && payhereParams?.md5sig) {
        setPaymentState('confirming');
        try {
          const confirmed = await api.post<Pick<Order, 'paymentStatus'>>(
            `/orders/${encodeURIComponent(currentOrder.orderNumber)}/confirm-payment`,
            { ...payhereParams, trackToken: id },
            true,
          );
          await queryClient.invalidateQueries({ queryKey: ['order', id] });
          if (confirmed.paymentStatus === 'PAID') {
            await celebrateOrder(true);
            return;
          }
          if (confirmed.paymentStatus === 'FAILED') {
            setPaymentState('failed');
            toast.error('Payment failed. You can try again below.');
            return;
          }
          setPaymentState('pending');
        } catch (err) {
          setPaymentState('pending');
          toast.error(err instanceof Error ? err.message : 'Could not verify payment');
        }
      }
    }

    void handlePaymentResult();
  }, [order?.orderNumber, order?.paymentStatus, order?.paymentMethod, order?.status, id, router, completeOrder, queryClient]);

  useEffect(() => {
    if (!order || order.paymentStatus !== 'PAID') return;
    if (paymentState === 'confirming' || paymentState === 'pending') {
      setPaymentState('paid');
      setJustConfirmed(true);
    }
  }, [order?.paymentStatus, paymentState]);

  const statusTimestamps = useMemo(() => {
    if (!order) return {} as Partial<Record<string, string>>;
    const map: Partial<Record<string, string>> = {
      ...buildStatusTimestampMap(order.statusEvents, order.createdAt),
    };
    if (order.deliveryPickedUpAt) {
      map.PICKUP = order.deliveryPickedUpAt;
    } else if (order.assignedDriver && order.deliveryPhase === 'TO_OUTLET' && map.READY) {
      map.PICKUP = map.READY;
    }
    return map;
  }, [
    order?.statusEvents,
    order?.createdAt,
    order?.deliveryPickedUpAt,
    order?.assignedDriver,
    order?.deliveryPhase,
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce flex justify-center">
            <AnimatedBrandLogo size={64} repeat={false} />
          </div>
          <p className="text-muted">Loading your order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    const accessDenied =
      orderError instanceof Error &&
      /track token|sign-in required|Forbidden|403/i.test(orderError.message);
    return (
      <div className="min-h-screen flex items-center justify-center text-center">
        <div>
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {accessDenied ? 'Sign in to view this order' : 'Order not found'}
          </h2>
          {accessDenied ? (
            <p className="text-muted text-sm mb-4 max-w-sm mx-auto">
              Use the link from your confirmation SMS/email, or sign in with the account that placed the order.
            </p>
          ) : null}
          <Link href="/" className="btn-primary px-6 py-3 mt-4 inline-flex">Go Home</Link>
        </div>
      </div>
    );
  }

  const currentStatus = liveStatus || order.status;
  const isDelivery = order.orderMode === 'DELIVERY';
  const steps = getTrackingSteps(isDelivery);
  const currentStep = getTrackingStepIndex(steps, currentStatus, {
    deliveryPhase: order.deliveryPhase,
    deliveryPickedUp: order.deliveryPickedUp,
    hasAssignedDriver: Boolean(order.assignedDriver),
  });
  const isCancelled = currentStatus === 'CANCELLED';
  const isComplete = isTrackingComplete(currentStatus, isDelivery);
  const isOnlinePayment = order.paymentMethod === 'PAYHERE' || order.paymentMethod === 'CARD';
  const awaitingPayment =
    isOnlinePayment && order.paymentStatus !== 'PAID' && !isCancelled;
  const isConfirmingPayment = paymentState === 'confirming';
  const displayedFailureReason =
    paymentFailureReason || order.paymentFailureReason || null;
  const showCustomerCancel =
    !isCancelled &&
    !awaitingPayment &&
    (!isConfirmingPayment || order.paymentStatus === 'PAID') &&
    order.canCancel;
  const cancelledStatusMessage = isCancelled ? getCancelledStatusMessage(order) : '';
  const showEta = !isCancelled && !isComplete;

  return (
    <>
      <OrderDeliveredCelebration
        open={showDeliveredCelebration && !isCancelled}
        orderNumber={order.orderNumber}
        isDelivery={isDelivery}
        onClose={closeDeliveredCelebration}
      />
    <div className={isCancelled ? 'max-w-xl mx-auto px-4 sm:px-6 py-6' : 'max-w-6xl mx-auto px-4 sm:px-6 py-8'}>
      {isCancelled ? (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
            <div className="mb-4 flex justify-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 ring-4 ring-rose-500/20"
                aria-hidden
              >
                <XCircle size={36} className="text-rose-500" strokeWidth={2} />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-fg mb-1">Order Cancelled</h1>
            <p className="text-soft text-sm">Order #{order.orderNumber}</p>
            {statusTimestamps.CANCELLED && (
              <p className="text-soft text-xs mt-2 tabular-nums">
                Cancelled {formatReceiptDate(statusTimestamps.CANCELLED)}
              </p>
            )}
            {cancelledStatusMessage && (
              <p className="text-soft text-sm mt-3 max-w-sm mx-auto">{cancelledStatusMessage}</p>
            )}
          </motion.div>

          <div className="space-y-4">
            <OrderStoreAddressCard order={order} isDelivery={isDelivery} />
            <OrderItemsSummary order={order} />
            <OrderPageActions orderNumber={order.orderNumber} className="mt-4" />
          </div>
        </>
      ) : (
        <>
      {/* Success header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        {!showDeliveredCelebration && (
          <div className="mb-4 flex justify-center">
            {isComplete ? (
              <span className="text-7xl" aria-hidden>{isDelivery ? '🏆' : '🎊'}</span>
            ) : (
              <AnimatedBrandLogo size={76} repeat={justConfirmed || !isComplete} />
            )}
          </div>
        )}
        {showDeliveredCelebration && <div className="h-4 mb-2" aria-hidden />}
        <h1 className="text-2xl font-bold text-white mb-1">
          {isConfirmingPayment
            ? 'Confirming Payment…'
            : awaitingPayment
              ? order.paymentStatus === 'FAILED'
                ? 'Payment Failed'
                : 'Awaiting Payment'
              : isComplete
                ? isDelivery
                  ? 'Delivered!'
                  : 'Ready for Pickup!'
                : justConfirmed || order.paymentStatus === 'PAID' || !isOnlinePayment
                  ? 'Order Confirmed!'
                  : 'Order Received'}
        </h1>
        <p className="text-muted text-sm">Order #{order.orderNumber}</p>
        {showEta && (
          <div className="flex items-center justify-center mt-3 text-sm">
            <span className="flex items-center gap-1 text-muted">
              <Clock size={13} /> ETA {liveEtaMinutes ?? order.estimatedMinutes} min
            </span>
          </div>
        )}
      </motion.div>

      {awaitingPayment && (
        <div className="mb-6 card p-4 border border-amber-500/30 bg-amber-500/10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-fg text-sm">
                {isConfirmingPayment
                  ? 'Confirming your payment…'
                  : order.paymentStatus === 'FAILED'
                    ? displayedFailureReason || 'Your payment did not go through'
                    : 'Complete payment to confirm this order'}
              </p>
              <p className="text-xs text-muted mt-1">
                {isConfirmingPayment
                  ? `Please wait while we verify ${paymentGatewayLabel}. This usually takes a few seconds.`
                  : order.paymentStatus === 'FAILED' && displayedFailureReason
                    ? 'The store will start preparing your order once payment succeeds. You can try again below.'
                    : 'The store will start preparing your order after payment is successful.'}
              </p>
            </div>
            {!isConfirmingPayment && (
              <button
                type="button"
                onClick={() => void handlePayAgain()}
                disabled={payingAgain}
                className="btn-primary px-4 py-2.5 text-sm inline-flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
              >
                {payingAgain ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                Pay Again — {formatMoneyAmount(order.total)}
              </button>
            )}
            {isConfirmingPayment && (
              <Loader2 size={22} className="animate-spin text-brand shrink-0 self-center" />
            )}
          </div>
        </div>
      )}

      {showCustomerCancel && (
        <OrderCancelCountdown
          orderNumber={order.orderNumber}
          status={currentStatus}
          cancelWindowEndsAt={order.cancelWindowEndsAt}
          cancelRefundTier={order.cancelRefundTier}
          cancelWindowMinutes={order.cancelWindowMinutes ?? 10}
          paymentMethod={order.paymentMethod}
          paymentStatus={order.paymentStatus}
          onCancel={async (reason, customText) => {
            await cancelOrderMutation.mutateAsync({ reason, customText });
          }}
          isCancelling={cancelOrderMutation.isPending}
        />
      )}

      <div className="grid lg:grid-cols-2 gap-5 lg:gap-6 items-start">
        {/* Left column — tracking & queue */}
        <div className="space-y-5 min-w-0">
      {!isDelivery && (
        <TakeawayPickupQueue
          queuePosition={liveQueue?.queuePosition ?? order.queuePosition}
          scheduledPickupAt={liveQueue?.scheduledPickupAt ?? order.scheduledPickupAt}
          estimatedMinutes={order.estimatedMinutes}
          status={currentStatus}
        />
      )}

      {/* Status tracker */}
      <div className="card p-6">
          <h3 className="font-semibold text-white mb-4">
            {isDelivery ? 'Track Your Order' : 'Track Your Pickup'}
          </h3>

          <OrderTrackingProgress
            steps={steps}
            currentStep={currentStep}
            currentStatus={currentStatus}
            isDelivery={isDelivery}
            statusTimestamps={statusTimestamps}
          />

          <div className="relative mt-8 pt-2 border-t border-navy-border">
            {/* Progress line */}
            <div className="absolute left-5 top-5 bottom-5 w-0.5" style={{ background: 'var(--color-navy-border)' }} />
            <div
              className="absolute left-5 top-5 w-0.5 transition-all duration-1000"
              style={{
                background: '#307ef2',
                height: `${Math.max(0, (currentStep / (steps.length - 1)) * 100)}%`,
              }}
            />

            <div className="space-y-6">
              {steps.map((step, i) => {
                const isDone = isComplete || i < currentStep;
                const isCurrent = !isComplete && i === currentStep;
                const changedAt = statusTimestamps[step.status];
                return (
                  <motion.div
                    key={step.status}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-4 relative pl-12"
                  >
                    <div className={`absolute left-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isDone ? 'bg-brand' : 'bg-navy-card border border-navy-border'
                    }`}>
                      <step.icon size={16} className={isDone ? 'text-white' : 'text-muted'} />
                    </div>
                    <div className="flex-1 pb-2 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`font-medium text-sm ${isDone || isCurrent ? 'text-white' : 'text-muted'}`}>
                          {step.label}
                        </p>
                        {changedAt && (isDone || isCurrent) && (
                          <time
                            dateTime={changedAt}
                            className="shrink-0 text-[11px] text-muted tabular-nums whitespace-nowrap"
                          >
                            {formatReceiptDate(changedAt)}
                          </time>
                        )}
                      </div>
                      {isCurrent && (
                        <p className="text-xs mt-0.5 text-brand">{step.desc}</p>
                      )}
                    </div>
                    {isCurrent && (
                      <div className="absolute -left-1 top-0 w-12 h-12 rounded-full animate-ping opacity-20 bg-brand" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {!isDelivery && (
            <div className="flex items-start gap-3 mt-6 pt-5 border-t border-navy-border">
              <MapPin size={18} className="text-brand mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-white">{order.store.name}</p>
                <p className="text-muted text-sm">{order.store.addressLine}</p>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Right column — QR, store, items */}
        <div className="space-y-5 min-w-0">
      {/* QR code for takeaway */}
      {!isDelivery && (
        <OrderQrCard
          orderNumber={order.orderNumber}
          tokenNumber={liveQueue?.queuePosition ?? order.queuePosition}
        />
      )}

      {/* Store / delivery info (delivery orders only — pickup branch shown in tracker) */}
      {isDelivery && (
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-brand mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-white">{order.store.name}</p>
              <p className="text-muted text-sm">{order.store.addressLine}</p>
            </div>
          </div>
          {order.address && (
            <div className="flex items-start gap-3 mt-3 pt-3 border-t border-navy-border">
              <Home size={18} className="text-brand mt-0.5 shrink-0" />
              <div>
                <p className="text-muted text-xs">Delivery to</p>
                <p className="text-white text-sm">{order.address.addressLine}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delivery code — the rider cannot close the order without it */}
      {isDelivery && deliveryCode && currentStatus !== 'DELIVERED' && (
        <div className="card p-5 border border-brand/40">
          <h3 className="font-semibold text-white mb-1 flex items-center gap-2">
            <ShieldCheck size={16} className="text-brand" />
            Your delivery code
          </h3>
          <p className="text-muted text-sm">Give this code to the rider when your order arrives.</p>
          <p className="mt-3 text-center text-3xl font-bold tracking-[0.4em] text-brand">
            {deliveryCode}
          </p>
        </div>
      )}

      {/* Live tracking map — once a rider is assigned or the run has started */}
      {isDelivery &&
        (currentStatus === 'READY' || currentStatus === 'OUT_FOR_DELIVERY') &&
        typeof order.deliveryLat === 'number' &&
        typeof order.deliveryLng === 'number' && (
          <div className="card p-5">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Truck size={16} className="text-brand" />
              {order.deliveryPhase === 'TO_OUTLET' ? 'Rider to store' : 'Live driver location'}
            </h3>
            <LiveDeliveryMap
              orderId={order.id}
              trackToken={id}
              orderNumber={order.orderNumber}
              store={{ lat: order.store.lat, lng: order.store.lng, name: order.store.name }}
              destination={{
                lat: order.deliveryLat,
                lng: order.deliveryLng,
                addressLine: order.deliveryAddressLine ?? order.address?.addressLine,
              }}
              deliveryPhase={order.deliveryPhase ?? (currentStatus === 'OUT_FOR_DELIVERY' ? 'TO_CUSTOMER' : 'TO_OUTLET')}
              initialDriver={
                order.driverLocation
                  ? { lat: order.driverLocation.lat, lng: order.driverLocation.lng }
                  : null
              }
              onEtaUpdate={onEtaUpdate}
            />
            {deliveryState && (
              <p className="text-xs text-muted mt-2 text-center">Status: {deliveryState.replaceAll('_', ' ')}</p>
            )}
          </div>
        )}

      {isDelivery && order.assignedDriver && currentStatus !== 'DELIVERED' && (
        <AssignedDriverCard driver={order.assignedDriver} />
      )}

      <OrderItemsSummary order={order} />
        </div>
      </div>

      {/* Ratings */}
      {isComplete && isDelivery && (
        <RiderRatingCard
          orderAccessId={id}
          existingRating={order.riderRating}
          riderName={order.assignedDriver?.name ?? null}
          onSubmitted={() => {
            void queryClient.invalidateQueries({ queryKey: ['order', id] });
          }}
        />
      )}
      {isComplete && !isDelivery && (
        <PlatformRatingCard
          orderAccessId={id}
          existingRating={order.platformRating}
          onSubmitted={() => {
            void queryClient.invalidateQueries({ queryKey: ['order', id] });
          }}
        />
      )}
      <OrderPageActions orderNumber={order.orderNumber} />
        </>
      )}
    </div>
    <CancellationReasonDialog />
    </>
  );
}
