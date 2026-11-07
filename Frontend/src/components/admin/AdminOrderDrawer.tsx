'use client';

import { adminApiFetch, adminFetch } from '@/lib/adminApi';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import {
  X,
  Loader2,
  MapPin,
  ExternalLink,
  Receipt,
  Package,
  Clock,
  User,
  Phone,
  CheckCircle,
  Pencil,
  XCircle,
  Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminOrderEditModal from '@/components/admin/AdminOrderEditModal';
import CounterPaymentForm, {
  counterPaymentValid,
  toApiPaymentMethod,
  type CounterPaymentMethod,
} from '@/components/admin/CounterPaymentForm';
import type { Order } from '@/types';
import { getOrderEditMode, orderBalanceDue, orderEditLockedMessage, orderTotalLabel, type OrderEditMode } from '@/lib/orderEdit';
import { getStatusLabel } from '@/lib/orderStatus';
import { formatOrderDiscountSuffix } from '@/lib/orderDiscountLabel';
import {
  customerLabel,
  customerPhone,
  formatMoney,
  formatReceiptDate,
  itemOptionLine,
  PAYMENT_METHOD_LABELS,
  getPaymentStatusLabel,
  isOrderPaid,
} from '@/lib/receipt';
import { formatOrderChannel } from '@/lib/orderChannel';
import OrderChannelBadge from '@/components/admin/OrderChannelBadge';
import { playOrderConfirmedSound } from '@/lib/uiSounds';
import {
  adminBadgeClass,
  PAYMENT_METHOD_BADGE,
  paymentStatusBadgeVariant,
} from '@/lib/adminBadges';
import ProductImage from '@/components/ui/ProductImage';
import { formatScheduledLabel } from '@/lib/orderSchedule';
import AdminOrderCancelCountdown from '@/components/admin/AdminOrderCancelCountdown';
import { isCustomerCancelWindowActive, secondsUntil } from '@/lib/orderCancel';
import {
  isCupStickerPrintingEnabled,
  tryPrintCupStickersForOrder,
  printCupStickersForOrder,
} from '@/lib/cupStickerPrint';

type CancelReasonValue = 'OUT_OF_STOCK' | 'CUSTOMER_REQUEST' | 'PAYMENT_OR_SYSTEM_ISSUE';

const CANCEL_REASON_OPTIONS: { value: CancelReasonValue; label: string }[] = [
  { value: 'OUT_OF_STOCK', label: 'Item Out of Stock / Unavailable' },
  { value: 'CUSTOMER_REQUEST', label: 'Customer Requested Cancellation' },
  { value: 'PAYMENT_OR_SYSTEM_ISSUE', label: 'Payment or System Issue / Duplicate Order' },
];

type Props = {
  orderKey: string | null;
  onClose: () => void;
  onViewReceipt?: (orderNumber: string) => void;
  onComplete?: () => void;
  /** Hide edit, confirm, and receipt actions — details only */
  readOnly?: boolean;
  /** Render as a centered modal instead of a side drawer */
  asModal?: boolean;
};

async function fetchOrder(orderKey: string): Promise<Order> {
  return adminApiFetch<Order>(`/orders/${encodeURIComponent(orderKey)}`);
}

type ConversationMessage = {
  id: string;
  direction: string;
  messageType: string;
  bodyText: string | null;
  createdAt: string;
};

async function fetchOrderConversation(orderKey: string): Promise<{
  channel: string;
  channelMeta?: { username?: string | null; phone?: string | null };
  messages: ConversationMessage[];
}> {
  return adminApiFetch(`/orders/${encodeURIComponent(orderKey)}/conversation`);
}

function drawerBadgeClass(variant: Parameters<typeof adminBadgeClass>[0]): string {
  return adminBadgeClass(variant, 'md');
}

const rejectButtonClassName =
  'confirm-dialog__btn-danger flex min-h-[2.875rem] shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold touch-manipulation disabled:opacity-50';

function InfoCell({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon size={15} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <div className="font-medium text-fg">{children}</div>
      </div>
    </div>
  );
}

export default function AdminOrderDrawer({ orderKey, onClose, onViewReceipt, onComplete, readOnly = false, asModal = false }: Props) {
  const qc = useQueryClient();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<{
    channel: string;
    channelMeta?: { username?: string | null; phone?: string | null };
    messages: ConversationMessage[];
  } | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [counterPaymentMethod, setCounterPaymentMethod] = useState<CounterPaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [cancelStep, setCancelStep] = useState<'idle' | 'selecting'>('idle');
  const [selectedCancelReason, setSelectedCancelReason] = useState<CancelReasonValue | null>(null);
  const [otherReasonModalOpen, setOtherReasonModalOpen] = useState(false);
  const [otherReasonText, setOtherReasonText] = useState('');
  const [cancelWindowSecondsLeft, setCancelWindowSecondsLeft] = useState(0);
  const [stickerPrinting, setStickerPrinting] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const contentTlRef = useRef<gsap.core.Timeline | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const resetRevealStyles = useCallback(() => {
    if (!panelRef.current) return;
    gsap.set(
      panelRef.current.querySelectorAll('.order-drawer-reveal, .order-drawer-header-reveal'),
      { opacity: 1, y: 0, clearProps: 'transform,opacity' },
    );
  }, []);

  const killContentTimeline = useCallback(() => {
    contentTlRef.current?.kill();
    contentTlRef.current = null;
    resetRevealStyles();
  }, [resetRevealStyles]);

  const buildContentTimeline = useCallback(() => {
    if (!panelRef.current) return;

    killContentTimeline();
    const tl = gsap.timeline();
    contentTlRef.current = tl;

    const headers = panelRef.current.querySelectorAll('.order-drawer-header-reveal');
    const targets = panelRef.current.querySelectorAll('.order-drawer-reveal');

    if (headers.length > 0) {
      tl.fromTo(
        headers,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', stagger: 0.05 },
        0,
      );
    }

    if (targets.length > 0) {
      tl.fromTo(
        targets,
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          ease: 'power2.out',
          stagger: 0.06,
          clearProps: 'transform,opacity',
        },
        headers.length > 0 ? 0.08 : 0,
      );
    }
  }, [killContentTimeline]);

  useEffect(() => {
    if (!orderKey) {
      setOrder(null);
      setConversation(null);
      setError(null);
      setEditOpen(false);
      setCounterPaymentMethod('CASH');
      setCashReceived('');
      setCancelStep('idle');
      setSelectedCancelReason(null);
      setOtherReasonModalOpen(false);
      setOtherReasonText('');
      killContentTimeline();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setOrder(null);
    setConversation(null);
    setCancelStep('idle');
    setSelectedCancelReason(null);
    setOtherReasonModalOpen(false);
    setOtherReasonText('');

    fetchOrder(orderKey)
      .then(async (data) => {
        if (cancelled) return;
        setOrder(data);
        if (data.channel === 'WHATSAPP' || data.channel === 'TELEGRAM') {
          try {
            const conv = await fetchOrderConversation(orderKey);
            if (!cancelled) setConversation(conv);
          } catch {
            if (!cancelled) setConversation(null);
          }
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setOrder(null);
          setError(e instanceof Error ? e.message : 'Failed to load order');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderKey, killContentTimeline]);

  useEffect(() => {
    if (!order?.cancelWindowEndsAt) {
      setCancelWindowSecondsLeft(0);
      return;
    }
    const tick = () => setCancelWindowSecondsLeft(secondsUntil(order.cancelWindowEndsAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order?.cancelWindowEndsAt]);

  useEffect(() => {
    if (!orderKey || loading) return;
    const id = requestAnimationFrame(() => buildContentTimeline());
    return () => cancelAnimationFrame(id);
  }, [orderKey, loading, order, error, buildContentTimeline]);

  useEffect(() => {
    if (!orderKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [orderKey]);

  const isDelivery = order?.orderMode === 'DELIVERY';
  const name = order ? customerLabel(order) : null;
  const phone = order ? customerPhone(order) : null;
  const deliveryLine = order?.address?.addressLine ?? order?.deliveryAddressLine ?? null;
  const deliveryCity = order?.address?.city ?? order?.deliveryCity ?? null;
  const deliveryLat = order?.deliveryLat ?? null;
  const deliveryLng = order?.deliveryLng ?? null;
  const orderPaid = order ? isOrderPaid(order) : false;
  const customerCancelWindowActive = order
    ? isCustomerCancelWindowActive(order, cancelWindowSecondsLeft)
    : false;
  const balanceDue = order ? orderBalanceDue(order) : 0;
  const prepaidAmount = order?.prepaidAmount ?? 0;
  const canConfirmPickup = Boolean(
    order &&
    order.orderMode === 'TAKEAWAY' &&
    order.status === 'READY',
  );
  const orderEditMode: OrderEditMode | null = order ? getOrderEditMode(order) : null;
  const editLockedMessage = order ? orderEditLockedMessage(order) : null;
  const amountDue = !orderPaid ? (order?.total ?? 0) : balanceDue;
  const needsCounterPayment = canConfirmPickup && amountDue > 0;
  const counterPaymentReady = !needsCounterPayment
    || counterPaymentValid(counterPaymentMethod, cashReceived, amountDue);

  async function printStickersForCurrentOrder(source: 'accept' | 'manual') {
    if (!order || stickerPrinting) return;
    setStickerPrinting(true);
    try {
      if (source === 'accept') {
        await tryPrintCupStickersForOrder(order);
      } else {
        await printCupStickersForOrder(order);
      }
      const cups = order.items.reduce((n, it) => n + Math.max(1, it.quantity), 0);
      toast.success(`Printed ${cups} cup sticker${cups === 1 ? '' : 's'}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Cup sticker print failed');
    } finally {
      setStickerPrinting(false);
    }
  }

  async function updateStatus(
    newStatus: string,
    options?: { closeOnSuccess?: boolean; cancelReason?: CancelReasonValue; note?: string },
  ) {
    if (!order || statusLoading) return;
    setStatusLoading(true);
    try {
      await adminFetch(`/orders/${order.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: newStatus,
          ...(options?.cancelReason ? { cancelReason: options.cancelReason } : {}),
          ...(options?.note ? { note: options.note } : {}),
        }),
      });
      setOrder((prev) => (prev ? { ...prev, status: newStatus as Order['status'] } : prev));
      setCancelStep('idle');
      setSelectedCancelReason(null);
      setOtherReasonModalOpen(false);
      setOtherReasonText('');
      toast.success(`Order #${order.orderNumber} updated`);
      if (newStatus === 'PREPARING' && isCupStickerPrintingEnabled()) {
        // Print after accept succeeds; do not roll back status if the printer fails.
        void printStickersForCurrentOrder('accept');
      }
      if (newStatus === 'CANCELLED') {
        qc.invalidateQueries({ queryKey: ['admin-delivery-jobs-active'] });
        qc.invalidateQueries({ queryKey: ['admin-delivery-jobs-completed'] });
      }
      if (newStatus === 'READY') {
        qc.invalidateQueries({ queryKey: ['admin-delivery-pending-orders'] });
      }
      onComplete?.();
      if (options?.closeOnSuccess) {
        onClose();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setStatusLoading(false);
    }
  }

  function startCancelFlow() {
    if (!order || statusLoading) return;
    setCancelStep('selecting');
    setSelectedCancelReason(null);
    setOtherReasonModalOpen(false);
    setOtherReasonText('');
  }

  async function confirmCancel() {
    if (!order || statusLoading || !selectedCancelReason) return;
    await updateStatus('CANCELLED', { closeOnSuccess: true, cancelReason: selectedCancelReason });
  }

  function openOtherReasonModal() {
    setOtherReasonText('');
    setOtherReasonModalOpen(true);
  }

  async function confirmCancelWithOtherReason() {
    const trimmed = otherReasonText.trim();
    if (!trimmed) {
      toast.error('Please enter a reason');
      return;
    }
    await updateStatus('CANCELLED', { closeOnSuccess: true, note: trimmed });
  }

  async function confirmPickup() {
    if (!order || pickupLoading) return;

    const collectPayment = !orderPaid;
    const collectBalance = orderPaid && balanceDue > 0;

    if (needsCounterPayment && !counterPaymentValid(counterPaymentMethod, cashReceived, amountDue)) {
      toast.error('Enter a valid cash amount or select card payment');
      return;
    }

    setPickupLoading(true);
    playOrderConfirmedSound();

    try {
            const body: Record<string, unknown> = { collectPayment, collectBalance };
      if (needsCounterPayment) {
        body.paymentMethod = toApiPaymentMethod(counterPaymentMethod);
        if (counterPaymentMethod === 'CASH') {
          body.cashReceivedAmount = Math.round(parseFloat(cashReceived) || 0);
        }
      }

      const json = await adminFetch(`/orders/${order.id}/complete-takeaway`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const updated = json.data as Order;
      setOrder((prev) => {
        if (!prev) return updated;
        return {
          ...prev,
          ...updated,
          store: updated.store ?? prev.store,
          items: updated.items ?? prev.items,
          statusEvents: updated.statusEvents ?? prev.statusEvents,
          user: updated.user ?? prev.user,
          address: updated.address ?? prev.address,
        };
      });

      toast.success(
        collectPayment
          ? `#${order.orderNumber} picked up · marked paid`
          : collectBalance
            ? `#${order.orderNumber} picked up · collected ${formatMoney(balanceDue)}`
            : `#${order.orderNumber} picked up · already paid online`,
      );
      onComplete?.();
      // Match Accept / Complete status actions — dismiss the order modal after pickup.
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not complete pickup');
    } finally {
      setPickupLoading(false);
    }
  }

  if (!portalReady) return null;

  const panelClassName = asModal
    ? 'flex w-full max-w-2xl max-h-[90dvh] flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl'
    : 'flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden border-l border-navy-border bg-navy-card shadow-2xl';

  const orderDiscountSuffix =
    order && order.discount > 0
      ? formatOrderDiscountSuffix({
          promoCode: order.promoCode,
          subtotal: order.subtotal,
          discount: order.discount,
        })
      : null;

  const panelContent = (
    <>
      <div className="flex shrink-0 items-start justify-between border-b border-navy-border px-5 py-4">
        <div className="order-drawer-header-reveal min-w-0 flex-1 pr-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Order details</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="truncate font-mono text-lg font-bold text-fg">
              {order ? order.orderNumber : orderKey}
            </p>
            {order && (
              <>
                <span className={drawerBadgeClass(PAYMENT_METHOD_BADGE[order.paymentMethod] ?? 'neutral')}>
                  {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
                </span>
                <span className={drawerBadgeClass(paymentStatusBadgeVariant(order))}>
                  {getPaymentStatusLabel(order)}
                </span>
                <OrderChannelBadge channel={order.channel} />
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="order-drawer-header-reveal shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {loading && (
            <div className="order-drawer-reveal flex flex-col items-center justify-center gap-3 py-16 text-muted">
              <Loader2 size={28} className="animate-spin text-brand" />
              <p className="text-sm">Loading order…</p>
            </div>
          )}

          {error && !loading && (
            <div className="order-drawer-reveal rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {order && !loading && (
            <div className="space-y-4">
              <div className="order-drawer-reveal grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-navy-border bg-navy-light/40 p-3 text-sm">
              <InfoCell icon={Clock} label="Placed">
                {formatReceiptDate(order.createdAt)}
              </InfoCell>
              {name ? (
                <InfoCell icon={User} label="Customer">
                  <span className="truncate">{name}</span>
                </InfoCell>
              ) : (
                <div />
              )}
              {phone ? (
                <InfoCell icon={Phone} label="Phone">
                  {phone}
                </InfoCell>
              ) : (
                <div />
              )}
              {order.processedByName ? (
                <InfoCell icon={User} label="Processed by">
                  <span className="truncate">{order.processedByName}</span>
                </InfoCell>
              ) : null}
              {(order.channel === 'WHATSAPP' || order.channel === 'TELEGRAM') && (
                <InfoCell icon={Phone} label={order.channel === 'TELEGRAM' ? 'Telegram' : 'WhatsApp'}>
                  {order.channel === 'TELEGRAM'
                    ? conversation?.channelMeta?.username || 'Linked account'
                    : conversation?.channelMeta?.phone || phone || '—'}
                </InfoCell>
              )}
              {!isDelivery && (order.pickupTime || order.scheduledPickupAt) ? (
                <InfoCell icon={Package} label="Pickup time">
                  {order.pickupTime && !/^In \d+ minutes?$/.test(order.pickupTime) && order.pickupTime !== 'As soon as ready'
                    ? order.pickupTime
                    : order.scheduledPickupAt
                      ? formatScheduledLabel(order.scheduledPickupAt)
                      : order.pickupTime}
                </InfoCell>
              ) : isDelivery && deliveryLine ? (
                <InfoCell icon={MapPin} label="Deliver to">
                  <span className="break-words">
                    {deliveryLine}
                    {deliveryCity ? `, ${deliveryCity}` : ''}
                  </span>
                  {deliveryLat != null && deliveryLng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${deliveryLat},${deliveryLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-brand hover:underline"
                    >
                      Open map <ExternalLink size={10} />
                    </a>
                  )}
                </InfoCell>
              ) : (
                <div />
              )}
            </div>

            <AdminOrderCancelCountdown order={order} />

            <div className="order-drawer-reveal">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Items</h3>
                {orderEditMode && !readOnly && (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand-subtle touch-manipulation"
                  >
                    <Pencil size={12} />
                    {orderEditMode === 'add_only' ? 'Add items' : 'Edit order'}
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-xl border border-navy-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-navy-border bg-navy-light/60">
                      <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-muted">Item</th>
                      <th className="px-2.5 py-1.5 text-center text-xs font-semibold text-muted">Qty</th>
                      <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-muted">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id} className="border-b border-navy-border/60 last:border-0">
                        <td className="px-2.5 py-2 align-top">
                          <div className="flex gap-2.5">
                            <ProductImage
                              name={item.productName}
                              imageUrl={item.product?.imageUrl}
                              contain
                              className="h-11 w-11 shrink-0 rounded-lg bg-brand-subtle/30 p-0.5"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-fg">{item.productName}</p>
                              <p className="text-xs text-muted">{itemOptionLine(item)}</p>
                              {item.toppings?.length > 0 && (
                                <p className="text-xs text-muted">
                                  + {item.toppings.map((t) => t.toppingName).join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-center text-muted">{item.quantity}</td>
                        <td className="px-2.5 py-2 text-right font-semibold text-fg whitespace-nowrap">
                          {formatMoney(item.totalPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="order-drawer-reveal rounded-xl border border-navy-border bg-navy-light/40 p-3 text-sm">
                <div className="flex justify-between py-1 text-fg">
                  <span>Items subtotal</span>
                  <span className="tabular-nums">{formatMoney(order.subtotal)}</span>
                </div>
                {(order.convenientFee ?? 0) > 0 && (
                  <div className="flex justify-between gap-2 py-1 text-muted">
                    <span className="text-xs">
                      Convenience fee
                      <span className="ml-1 text-[10px] opacity-80">(excl. commission)</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatMoney(order.convenientFee)}</span>
                  </div>
                )}
                {order.deliveryFee > 0 && (
                  <div className="flex justify-between gap-2 py-1 text-muted">
                    <span className="text-xs">
                      Delivery fee
                      <span className="ml-1 text-[10px] opacity-80">(excl. commission)</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatMoney(order.deliveryFee)}</span>
                  </div>
                )}
                {order.discount > 0 && (
                  <div className="flex justify-between py-1 text-green-400">
                    <span>
                      Discount{orderDiscountSuffix ? ` (${orderDiscountSuffix})` : ''}
                    </span>
                    <span className="tabular-nums">-{formatMoney(order.discount)}</span>
                  </div>
                )}
                {order.loyaltyDiscount > 0 && (
                  <div className="flex justify-between py-1 text-green-400">
                    <span>Loyalty discount</span>
                    <span className="tabular-nums">-{formatMoney(order.loyaltyDiscount)}</span>
                  </div>
                )}
                <div className="mt-2 space-y-1.5 border-t border-navy-border pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">{orderTotalLabel(order)}</span>
                    <span className="text-lg font-bold text-brand tabular-nums">
                      {formatMoney(order.total)}
                    </span>
                  </div>
                  {orderPaid && prepaidAmount > 0 && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted">Paid</span>
                      <span className="text-muted tabular-nums">{formatMoney(prepaidAmount)}</span>
                    </div>
                  )}
                  {orderPaid && balanceDue > 0 && (
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                      <span className="text-fg">Balance due at counter</span>
                      <span className="text-fg tabular-nums">{formatMoney(balanceDue)}</span>
                    </div>
                  )}
                </div>
              </div>

              {(order.statusEvents?.length ?? 0) > 0 && (
                <div className="order-drawer-reveal rounded-xl border border-navy-border bg-navy-light/40 p-3 text-sm">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                    Activity
                  </h3>
                  <ol className="space-y-2">
                    {order.statusEvents.map((event) => (
                      <li key={event.id} className="text-xs text-fg">
                        <span className="font-semibold">
                          {getStatusLabel(event.status, order.orderMode)}
                        </span>
                        {event.actorName ? (
                          <span className="text-muted"> by {event.actorName}</span>
                        ) : null}
                        {event.note ? (
                          <p className="mt-0.5 text-muted">{event.note}</p>
                        ) : null}
                        <p className="mt-0.5 text-[10px] text-muted">
                          {formatReceiptDate(event.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {conversation && conversation.messages.length > 0 && (
                <div className="order-drawer-reveal rounded-xl border border-navy-border bg-navy-light/40 p-3 text-sm">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                    {formatOrderChannel(order.channel)} conversation
                  </h3>
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {conversation.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-lg px-2.5 py-1.5 text-xs ${
                          m.direction === 'INBOUND'
                            ? 'bg-navy-card text-fg'
                            : 'bg-brand-subtle/40 text-muted'
                        }`}
                      >
                        <p className="mb-0.5 font-semibold text-[10px] uppercase tracking-wide text-muted">
                          {m.direction === 'INBOUND' ? 'Customer' : 'Bot'}
                        </p>
                        <p className="whitespace-pre-wrap">{m.bodyText || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
        </div>
      </div>

      {order && !loading && readOnly && (
        <div className="order-drawer-footer order-drawer-reveal shrink-0 border-t border-navy-border bg-navy-card px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => onViewReceipt?.(order.orderNumber)}
            className="btn-outline flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold touch-manipulation"
          >
            <Receipt size={15} />
            View receipt
          </button>
        </div>
      )}

      {order && !loading && !readOnly && (
        <div className="order-drawer-footer order-drawer-reveal shrink-0 border-t border-navy-border bg-navy-card px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {order.status === 'RECEIVED' && cancelStep === 'selecting' && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-fg">Cancel order</p>
                <p className="mt-1 text-xs text-muted">Select a reason. This action cannot be undone.</p>
              </div>
              <div className="space-y-2">
                {CANCEL_REASON_OPTIONS.map((option) => {
                  const selected = selectedCancelReason === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        selected
                          ? 'border-rose-500/60 bg-rose-500/10'
                          : 'border-navy-border bg-navy-light/20 hover:bg-navy-light/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cancel-reason"
                        value={option.value}
                        checked={selected}
                        onChange={() => setSelectedCancelReason(option.value)}
                        className="mt-0.5 shrink-0 accent-rose-500"
                      />
                      <span className="text-sm text-fg">{option.label}</span>
                    </label>
                  );
                })}
                <button
                  type="button"
                  onClick={openOtherReasonModal}
                  className="flex w-full cursor-pointer items-start gap-3 rounded-lg border border-navy-border bg-navy-light/20 px-3 py-2.5 text-left transition-colors hover:bg-navy-light/40"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-navy-border" aria-hidden />
                  <span className="text-sm text-fg">Other</span>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={statusLoading || !selectedCancelReason}
                  onClick={() => void confirmCancel()}
                  className="confirm-dialog__btn-danger flex min-h-[2.875rem] flex-1 items-center justify-center gap-2 rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-bold touch-manipulation disabled:opacity-50"
                >
                  {statusLoading ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                  Confirm cancellation
                </button>
                <button
                  type="button"
                  disabled={statusLoading}
                  onClick={() => {
                    setCancelStep('idle');
                    setSelectedCancelReason(null);
                    setOtherReasonModalOpen(false);
                    setOtherReasonText('');
                  }}
                  className="btn-outline flex min-h-[2.875rem] items-center justify-center px-4 py-2.5 text-sm font-semibold touch-manipulation disabled:opacity-50"
                >
                  Go back
                </button>
              </div>
            </div>
          )}

          {order.status === 'RECEIVED' && cancelStep === 'idle' && !customerCancelWindowActive && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={statusLoading}
                onClick={() => void updateStatus('PREPARING', { closeOnSuccess: true })}
                className="btn-primary flex min-h-[2.875rem] flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold touch-manipulation disabled:opacity-50"
              >
                {statusLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                Accept
              </button>
              <button
                type="button"
                disabled={statusLoading}
                onClick={startCancelFlow}
                className={rejectButtonClassName}
              >
                <XCircle size={16} />
                Reject
              </button>
            </div>
          )}

          {order.status === 'PREPARING' && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={statusLoading}
                onClick={() => void updateStatus('READY', { closeOnSuccess: true })}
                className="btn-primary flex min-h-[2.875rem] flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold touch-manipulation disabled:opacity-50"
              >
                {statusLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                Complete
              </button>
            </div>
          )}

          {!isDelivery && order.status === 'READY' && (
            <>
              {needsCounterPayment && (
                <div className="mb-2.5">
                  <CounterPaymentForm
                    amountDue={amountDue}
                    paymentMethod={counterPaymentMethod}
                    cashReceived={cashReceived}
                    onPaymentMethodChange={setCounterPaymentMethod}
                    onCashReceivedChange={setCashReceived}
                    drawer
                  />
                </div>
              )}

              {!needsCounterPayment && orderPaid && (
                <p className="mb-2.5 text-center text-[11px] leading-relaxed text-muted">
                  Customer paid online — confirm when they collect.
                </p>
              )}

              <div className="flex gap-2">
                {!needsCounterPayment && (
                  <button
                    type="button"
                    onClick={() => onViewReceipt?.(order.orderNumber)}
                    className="btn-outline flex min-h-[2.875rem] shrink-0 items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold touch-manipulation"
                  >
                    <Receipt size={15} />
                    Receipt
                  </button>
                )}
                <button
                  type="button"
                  disabled={pickupLoading || !counterPaymentReady}
                  onClick={() => void confirmPickup()}
                  className="btn-primary flex min-h-[2.875rem] flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold touch-manipulation disabled:opacity-50"
                >
                  {pickupLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <CheckCircle size={18} />
                  )}
                  {!orderPaid
                    ? 'Confirm pickup & paid'
                    : balanceDue > 0
                      ? `Confirm pickup & collect ${formatMoney(balanceDue)}`
                      : 'Confirm pickup'}
                </button>
              </div>
            </>
          )}

          {!isDelivery && (order.status === 'DELIVERED' || order.status === 'CANCELLED') && (
            <div className="space-y-2">
              {order.status === 'DELIVERED' && (
                <p className="text-center text-[11px] leading-relaxed text-green-400">
                  Order confirmed — payment complete.
                </p>
              )}
              <button
                type="button"
                onClick={() => onViewReceipt?.(order.orderNumber)}
                className="btn-outline flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold touch-manipulation"
              >
                <Receipt size={15} />
                View receipt
              </button>
            </div>
          )}

          {isDelivery && order.status === 'READY' && (
            <>
              <p className="mb-2.5 text-center text-[11px] leading-relaxed text-muted">
                Order is ready — assign a rider from the classification table below.
              </p>
              <button
                type="button"
                onClick={() => onViewReceipt?.(order.orderNumber)}
                className="btn-outline flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold touch-manipulation"
              >
                <Receipt size={15} />
                View receipt
              </button>
            </>
          )}

          {isDelivery && (order.status === 'OUT_FOR_DELIVERY' || order.status === 'DELIVERED' || order.status === 'CANCELLED') && (
            <button
              type="button"
              onClick={() => onViewReceipt?.(order.orderNumber)}
              className="btn-outline flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold touch-manipulation"
            >
              <Receipt size={15} />
              View receipt
            </button>
          )}

          {order.status !== 'CANCELLED' && (order.items?.length ?? 0) > 0 && cancelStep === 'idle' && (
            <button
              type="button"
              disabled={stickerPrinting || statusLoading || pickupLoading}
              onClick={() => void printStickersForCurrentOrder('manual')}
              className="btn-outline mt-2 flex min-h-[2.875rem] w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold touch-manipulation disabled:opacity-50"
            >
              {stickerPrinting ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
              Print cup stickers
            </button>
          )}
        </div>
      )}
    </>
  );

  return createPortal(
    <AnimatePresence>
      {orderKey && (
        <>
          {otherReasonModalOpen && (
            <>
              <div
                className="fixed inset-0 z-[1200] bg-black/50 backdrop-blur-sm"
                onClick={() => {
                  if (!statusLoading) {
                    setOtherReasonModalOpen(false);
                    setOtherReasonText('');
                  }
                }}
                aria-hidden
              />
              <div className="fixed inset-0 z-[1201] flex items-center justify-center p-4 pointer-events-none">
                <div
                  className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl"
                  role="dialog"
                  aria-modal
                  aria-labelledby="cancel-other-reason-title"
                >
                  <div className="h-1 bg-gradient-to-r from-red-500 via-red-400/70 to-transparent" aria-hidden />
                  <div className="px-5 pb-5 pt-5">
                    <div className="flex items-start gap-3">
                      <div className="confirm-dialog__icon confirm-dialog__icon--danger flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                        <XCircle size={20} strokeWidth={2.25} />
                      </div>
                      <div className="min-w-0">
                        <h2 id="cancel-other-reason-title" className="text-lg font-bold text-fg">
                          Other reason
                        </h2>
                        <p className="mt-1 text-sm text-muted">
                          Enter the cancellation reason below.
                        </p>
                      </div>
                    </div>
                    <textarea
                      value={otherReasonText}
                      onChange={(e) => setOtherReasonText(e.target.value)}
                      placeholder="Describe why this order is being cancelled…"
                      rows={4}
                      autoFocus
                      disabled={statusLoading}
                      className="input-field mt-4 w-full resize-none text-sm"
                    />
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={statusLoading || !otherReasonText.trim()}
                        onClick={() => void confirmCancelWithOtherReason()}
                        className="confirm-dialog__btn-danger flex min-h-[2.875rem] flex-1 items-center justify-center gap-2 rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-bold touch-manipulation disabled:opacity-50"
                      >
                        {statusLoading ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                        Confirm cancellation
                      </button>
                      <button
                        type="button"
                        disabled={statusLoading}
                        onClick={() => {
                          setOtherReasonModalOpen(false);
                          setOtherReasonText('');
                        }}
                        className="btn-outline flex min-h-[2.875rem] items-center justify-center px-4 py-2.5 text-sm font-semibold touch-manipulation disabled:opacity-50"
                      >
                        Go back
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <AdminOrderEditModal
            open={editOpen}
            order={order}
            mode={orderEditMode === 'add_only' ? 'add_only' : 'full'}
            onClose={() => setEditOpen(false)}
            onSaved={(updated) => {
              setOrder(updated);
              onComplete?.();
            }}
          />
          <motion.div
            key="order-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          {asModal ? (
            <motion.div
              key="order-modal-shell"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[1101] flex items-center justify-center p-4 pointer-events-none"
            >
              <motion.div
                key="order-modal-panel"
                ref={panelRef}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={`pointer-events-auto ${panelClassName}`}
                role="dialog"
                aria-modal
                aria-label="Order details"
              >
                {panelContent}
              </motion.div>
            </motion.div>
          ) : (
            <motion.aside
              key="order-drawer-panel"
              ref={panelRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={`fixed right-0 top-0 z-[1101] ${panelClassName}`}
              role="dialog"
              aria-modal
              aria-label="Order details"
            >
              {panelContent}
            </motion.aside>
          )}
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
