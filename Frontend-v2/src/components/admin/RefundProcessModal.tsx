'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { getApiBaseUrl } from '@/lib/apiBase';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  Loader2,
  Package,
  Phone,
  User,
  X,
  CheckCircle2,
  XCircle,
  Ban,
  UserCircle2,
  Receipt,
  AlertCircle,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import toast from 'react-hot-toast';
import RefundStatusBadge, {
  RefundRequestTypeBadge,
  RefundSubmittedByBadge,
} from '@/components/admin/RefundStatusBadge';
import RefundOrderTimeline from '@/components/admin/RefundOrderTimeline';
import OrderCheckoutSummary from '@/components/admin/OrderCheckoutSummary';
import ProductImage from '@/components/ui/ProductImage';
import type { Refund } from '@/types';
import {
  cancellationReasonLabel,
  fetchActiveCancelReasons,
} from '@/lib/cancellationReasons';
import {
  formatMoney,
  formatReceiptDate,
  itemOptionLine,
} from '@/lib/receipt';
import { confirmDialog } from '@/store/confirmStore';
import { getAdminSession, isBranchAdmin, isSuperAdmin } from '@/lib/adminAuth';
import {
  GATEWAY_PENALTY_LKR,
  getStoredOrPreviewPaymentStructure,
} from '@/lib/refundPaymentStructure';

type Props = {
  refundId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
};

type ActionMode = 'idle' | 'complete' | 'reject';

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

function orderCancelledAt(order: Refund['order']): string | null {
  const events = order?.statusEvents ?? [];
  const cancelled = [...events]
    .filter((event) => event.status === 'CANCELLED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return cancelled?.createdAt ?? null;
}

function computeRefundFromPercentage(salesTotal: number, percentage: number): number {
  return Math.round((salesTotal * percentage) / 100);
}

function isOnlinePaidOrder(order: {
  paymentMethod: string;
  paymentStatus: string;
}): boolean {
  return (
    (order.paymentMethod === 'PAYHERE' || order.paymentMethod === 'CARD')
    && order.paymentStatus === 'PAID'
  );
}

type BreakdownTag = 'refunded' | 'retained' | 'branchPenalty' | null;

function BreakdownRow({
  label,
  amount,
  tag = null,
  muted = false,
  strike = false,
  accent = false,
  danger = false,
  plus = false,
}: {
  label: ReactNode;
  amount: number;
  tag?: BreakdownTag;
  muted?: boolean;
  strike?: boolean;
  accent?: boolean;
  danger?: boolean;
  plus?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span
        className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 ${
          muted ? 'text-muted' : danger ? 'text-red-400' : 'text-fg'
        }`}
      >
        {plus && <span className="font-semibold text-red-400">+</span>}
        <span className="min-w-0 leading-snug">{label}</span>
        {tag === 'refunded' && (
          <span className="inline-flex shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
            Refunded
          </span>
        )}
        {tag === 'retained' && (
          <span className="inline-flex shrink-0 rounded-full border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-400">
            Not refunded
          </span>
        )}
        {tag === 'branchPenalty' && (
          <span className="inline-flex shrink-0 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-300">
            Branch bears
          </span>
        )}
      </span>
      <span
        className={`shrink-0 pt-0.5 font-medium tabular-nums ${
          strike
            ? 'text-muted line-through'
            : accent
              ? 'font-semibold text-brand'
              : danger
                ? 'font-semibold text-red-400'
                : muted
                  ? 'text-muted'
                  : 'text-fg'
        }`}
      >
        {formatMoney(amount)}
      </span>
    </div>
  );
}

function FullRefundBreakdownCard({
  refund,
  fullRefund,
  salesTotal,
  deliveryFee,
  convenienceFee,
  orderTotal,
  refundPercentage,
  calculatedRefundAmount,
  customerReceives,
  gatewayPenalty,
  isOnlinePaid,
}: {
  refund: Refund;
  fullRefund: boolean;
  salesTotal: number;
  deliveryFee: number;
  convenienceFee: number;
  orderTotal: number;
  refundPercentage: string;
  calculatedRefundAmount: number;
  customerReceives: number;
  gatewayPenalty: number;
  isOnlinePaid: boolean;
}) {
  const pct = fullRefund ? 100 : (refundPercentage === '—' ? null : Number.parseFloat(refundPercentage));
  const pctLabel = fullRefund ? '100' : (pct != null && !Number.isNaN(pct) ? String(pct) : '—');
  const feesRetained = deliveryFee + convenienceFee;
  const isCashierCancel = refund.submittedBy === 'BRANCH_ADMIN';
  const isRejected = refund.status === 'REJECTED';
  const rejectedStructure = isRejected && refund.order
    ? getStoredOrPreviewPaymentStructure(
        refund,
        { paymentMethod: refund.order.paymentMethod, orderMode: refund.order.orderMode },
        pct != null && !Number.isNaN(pct) ? pct : 0,
      )
    : null;
  const retainedSales = rejectedStructure?.notReturningSubtotal ?? salesTotal;
  const retainedDelivery = rejectedStructure?.nonRefundableDeliveryFee ?? deliveryFee;
  const retainedConvenience = rejectedStructure?.nonRefundableConvenienceFee ?? convenienceFee;

  return (
    <div className="rounded-xl border-2 border-brand/30 bg-brand/5 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        {isRejected ? 'Retained Breakdown' : 'Full Refund Breakdown'}
      </h3>

      <div className="space-y-2">
        {isRejected ? (
          <>
            <BreakdownRow label="Sales total" amount={retainedSales} tag="retained" />
            {retainedDelivery > 0 && (
              <BreakdownRow label="Delivery fee" amount={retainedDelivery} tag="retained" />
            )}
            {retainedConvenience > 0 && (
              <BreakdownRow label="Convenience fee" amount={retainedConvenience} tag="retained" />
            )}
          </>
        ) : fullRefund ? (
          <>
            <BreakdownRow label="Sales total" amount={salesTotal} tag="refunded" />
            <BreakdownRow label="Delivery fee" amount={deliveryFee} tag="refunded" />
            <BreakdownRow label="Convenience fee" amount={convenienceFee} tag="refunded" />
            <BreakdownRow label="Total paid by customer" amount={orderTotal} tag="refunded" />
          </>
        ) : (
          <>
            <BreakdownRow label="Sales total" amount={salesTotal} muted />
            <BreakdownRow
              label={`Sales total × ${pctLabel}%`}
              amount={calculatedRefundAmount}
              tag="refunded"
            />
            <BreakdownRow
              label="Delivery fee"
              amount={deliveryFee}
              tag="retained"
              strike={deliveryFee > 0}
              muted={deliveryFee > 0}
            />
            <BreakdownRow
              label="Convenience fee"
              amount={convenienceFee}
              tag="retained"
              strike={convenienceFee > 0}
              muted={convenienceFee > 0}
            />
            {feesRetained > 0 && (
              <BreakdownRow label="Fees retained" amount={feesRetained} muted />
            )}
          </>
        )}
        {isCashierCancel && gatewayPenalty > 0 && !isRejected && (
          <BreakdownRow
            label="Gateway penalty"
            amount={gatewayPenalty}
            tag="branchPenalty"
          />
        )}
      </div>

      <div className="mt-3 border-t border-brand/20 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Customer receives
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-brand">
          {formatMoney(isRejected ? 0 : customerReceives)}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted">
          {isRejected
            ? 'Refund rejected — customer receives nothing'
            : fullRefund
            ? 'Full refund of all paid amount'
            : `${pct}% of sales total — fees not included`}
        </p>

        {isOnlinePaid && !isRejected && (
          <div className="mt-3 space-y-2 rounded-lg border border-navy-border/80 bg-navy-card/60 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Payment gateway
            </p>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted">Refund sent via gateway</span>
              <span className="font-medium tabular-nums text-fg">{formatMoney(customerReceives)}</span>
            </div>
            {isCashierCancel && gatewayPenalty > 0 && (
              <>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-purple-300">Gateway penalty (branch bears)</span>
                  <span className="font-medium tabular-nums text-purple-300">
                    {formatMoney(gatewayPenalty)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-t border-dashed border-navy-border pt-2 text-sm">
                  <span className="font-medium text-fg">Total through gateway</span>
                  <span className="font-semibold tabular-nums text-brand">
                    {formatMoney(customerReceives + gatewayPenalty)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function isFullRefundScenario(refund: Refund): boolean {
  return (
    refund.submittedBy === 'BRANCH_ADMIN'
    || refund.cancelledWithinWindow
  );
}

async function fetchRefund(refundId: string): Promise<Refund> {
    const res = await fetch(`${getApiBaseUrl()}/refunds/${encodeURIComponent(refundId)}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Refund not found');
  return json.data as Refund;
}

async function updateRefundStatus(
  refundId: string,
  body: Record<string, unknown>,
): Promise<Refund> {
    const res = await fetch(`${getApiBaseUrl()}/refunds/${encodeURIComponent(refundId)}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Failed to update refund');
  return json.data as Refund;
}

export default function RefundProcessModal({ refundId, onClose, onUpdated }: Props) {
  const [refund, setRefund] = useState<Refund | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>('idle');
  const [adminNotes, setAdminNotes] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(true);

  const canMutateRefund = useMemo(() => isBranchAdmin(getAdminSession()), []);
  const isViewOnlySuperAdmin = useMemo(() => isSuperAdmin(getAdminSession()), []);

  const { data: cancelReasons = [] } = useQuery({
    queryKey: ['cancel-reasons'],
    queryFn: fetchActiveCancelReasons,
    staleTime: 60_000,
  });

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings-cancel-window'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/settings/app`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load settings');
      return json.data as { cancelWindowMinutes?: number };
    },
    staleTime: 5 * 60 * 1000,
  });

  const cancelWindowMinutes = appSettings?.cancelWindowMinutes ?? 10;

  const fullRefund = refund ? isFullRefundScenario(refund) : false;
  const order = refund?.order;

  const fixedRefundPercentage = refund?.refundPercentage
    ?? refund?.configuredStatusRefundPercentage
    ?? null;

  const calculatedRefundAmount = useMemo(() => {
    if (!refund) return 0;
    if (fullRefund) return refund.orderTotal;
    if (refund.refundAmount != null) return refund.refundAmount;
    if (fixedRefundPercentage == null) return 0;
    return computeRefundFromPercentage(refund.salesTotal, fixedRefundPercentage);
  }, [refund, fullRefund, fixedRefundPercentage]);
  const deliveryFee = refund?.deliveryFee ?? order?.deliveryFee ?? 0;
  const convenienceFee = refund?.convenienceFee ?? order?.convenientFee ?? 0;

  const previewRefundPercentageLabel = fullRefund
    ? '100'
    : (fixedRefundPercentage != null ? String(fixedRefundPercentage) : '—');

  const isCashierCancel = refund?.submittedBy === 'BRANCH_ADMIN';
  const isOnlinePaid = order ? isOnlinePaidOrder(order) : false;

  const gatewayPenalty = useMemo(() => {
    if (!refund) return 0;
    if (refund.additionalGatewayFee != null) return refund.additionalGatewayFee;
    if (isCashierCancel) return GATEWAY_PENALTY_LKR;
    return 0;
  }, [refund, isCashierCancel]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const resetActionForm = useCallback(() => {
    setActionMode('idle');
    setAdminNotes('');
  }, []);

  useEffect(() => {
    if (!refundId) {
      setRefund(null);
      setError(null);
      resetActionForm();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    resetActionForm();

    fetchRefund(refundId)
      .then((data) => {
        if (cancelled) return;
        setRefund(data);
        setAdminNotes(data.adminNotes ?? '');
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Failed to load refund');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refundId, resetActionForm]);

  const canProcess = refund?.status === 'RECEIVED';

  async function handleComplete() {
    if (!refund || actionLoading) return;

    const ok = await confirmDialog({
      title: 'Complete refund?',
      message: `Approve refund of ${formatMoney(calculatedRefundAmount)} for this order.`,
      confirmLabel: 'Complete refund',
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      const updated = await updateRefundStatus(refund.id, {
        status: 'COMPLETE',
        adminNotes: adminNotes.trim() || undefined,
      });
      setRefund(updated);
      resetActionForm();
      toast.success('Refund completed');
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete refund');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!refund || actionLoading) return;
    if (!adminNotes.trim()) {
      toast.error('Enter a rejection reason');
      return;
    }

    const ok = await confirmDialog({
      title: 'Reject refund?',
      message: 'The customer will not receive a refund for this request.',
      confirmLabel: 'Reject refund',
      variant: 'danger',
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      const updated = await updateRefundStatus(refund.id, {
        status: 'REJECTED',
        adminNotes: adminNotes.trim(),
      });
      setRefund(updated);
      resetActionForm();
      toast.success('Refund rejected');
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject refund');
    } finally {
      setActionLoading(false);
    }
  }

  if (!portalReady) return null;

  const customerName =
    refund?.customerName || order?.user?.name || order?.guestName || 'Guest';
  const customerPhone = order?.user?.phone || order?.guestPhone || null;
  const reasonText =
    refund?.cancellationReason === 'OTHER' && refund.customReasonText?.trim()
      ? `${cancellationReasonLabel(refund.cancellationReason, cancelReasons)}: ${refund.customReasonText.trim()}`
      : refund
        ? cancellationReasonLabel(refund.cancellationReason, cancelReasons)
        : '';
  const cancelledAt = orderCancelledAt(order);

  const scenarioLabel = refund?.submittedBy === 'BRANCH_ADMIN'
    ? 'Cashier cancellation — full refund (branch bears penalty)'
    : refund?.cancelledWithinWindow
      ? 'Customer cancelled within full-refund window — full refund'
      : 'Customer cancelled after full-refund window — partial refund on sales total';

  return createPortal(
    <AnimatePresence>
      {refundId && (
        <>
          <motion.div
            key="refund-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            key="refund-modal-container"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-8 z-[10000] overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl"
            role="dialog"
            aria-modal
            aria-label="Refund processing"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between border-b border-navy-border bg-navy-light/50 px-6 py-4">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Refund Processing
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="truncate font-mono text-xl font-bold text-fg">
                    {order?.orderNumber ?? 'Refund'}
                  </p>
                  {refund && <RefundStatusBadge status={refund.status} />}
                  {refund && (
                    <RefundRequestTypeBadge
                      refund={refund}
                      cancelWindowMinutes={cancelWindowMinutes}
                    />
                  )}
                </div>
              </div>
              {refund?.processedAt && (
                <div className="mr-2 shrink-0 pt-0.5 text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Processed
                  </p>
                  <p className="mt-1 text-sm tabular-nums text-fg">
                    {formatReceiptDate(refund.processedAt)}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex h-[calc(100%-5rem)]">
              <div
                className={`flex shrink-0 flex-col overflow-hidden border-r border-navy-border bg-navy-light/30 transition-all duration-300 ${
                  detailsOpen ? 'w-[420px]' : 'w-12'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="flex shrink-0 items-center gap-2 border-b border-navy-border px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:bg-navy-light hover:text-fg"
                  title={detailsOpen ? 'Hide order details' : 'Show order details'}
                >
                  {detailsOpen ? (
                    <>
                      <PanelLeftClose size={16} />
                      <span>Order Details</span>
                    </>
                  ) : (
                    <PanelLeftOpen size={16} />
                  )}
                </button>

                {detailsOpen && refund && !loading && (
                  <div className="flex-1 overflow-y-auto overscroll-contain p-4">
                    <div className="space-y-4">
                      <div className="rounded-xl border border-navy-border bg-navy-light/40 p-3">
                        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                          <User size={14} />
                          Order Info
                        </h3>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                          <InfoCell icon={Clock} label="Received">
                            {formatReceiptDate(refund.createdAt)}
                          </InfoCell>
                          {cancelledAt && (
                            <InfoCell icon={Ban} label="Cancelled">
                              {formatReceiptDate(cancelledAt)}
                            </InfoCell>
                          )}
                          <InfoCell icon={UserCircle2} label="Submitted by">
                            <RefundSubmittedByBadge submittedBy={refund.submittedBy} />
                          </InfoCell>
                          <InfoCell icon={User} label="Customer">
                            <span className="truncate">{customerName}</span>
                          </InfoCell>
                          {customerPhone && (
                            <InfoCell icon={Phone} label="Phone">
                              {customerPhone}
                            </InfoCell>
                          )}
                          {order?.store?.name && (
                            <InfoCell icon={Package} label="Branch">
                              {order.store.name}
                            </InfoCell>
                          )}
                        </div>
                      </div>

                      {order?.items && order.items.length > 0 && (
                        <div className="rounded-xl border border-navy-border bg-navy-light/40 p-3">
                          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                            <Receipt size={14} />
                            Items
                          </h3>
                          <div className="space-y-2">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-start gap-2">
                                <ProductImage
                                  name={item.productName}
                                  imageUrl={item.product?.imageUrl}
                                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-fg">{item.productName}</p>
                                  <p className="text-[11px] text-muted">
                                    {itemOptionLine(item)} · Qty {item.quantity}
                                  </p>
                                </div>
                                <p className="text-xs font-medium tabular-nums text-fg">
                                  {formatMoney(item.totalPrice)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {order && (
                        <OrderCheckoutSummary
                          subtotal={order.subtotal}
                          deliveryFee={order.deliveryFee}
                          convenientFee={order.convenientFee}
                          discount={order.discount}
                          loyaltyDiscount={order.loyaltyDiscount}
                          promoCode={order.promoCode}
                          total={order.total}
                          paymentMethod={order.paymentMethod}
                          paymentStatus={order.paymentStatus}
                          orderMode={order.orderMode}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto overscroll-contain p-6">
                  {loading && (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
                      <Loader2 size={32} className="animate-spin text-brand" />
                      <p className="text-sm">Loading refund details...</p>
                    </div>
                  )}

                  {error && !loading && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={16} />
                        {error}
                      </div>
                    </div>
                  )}

                  {refund && order && !loading && (
                    <div className="refund-process-layout">
                      <aside className="refund-process-layout__timeline">
                        <RefundOrderTimeline refund={refund} order={order} />
                      </aside>

                      <section className="refund-process-layout__details">
                        {isViewOnlySuperAdmin && (
                          <div className="rounded-xl border border-navy-border bg-navy-card/80 px-4 py-3 text-sm text-muted">
                            View only — branch admins process refunds.
                          </div>
                        )}

                        <div className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                            Refund scenario
                          </p>
                          <p className="mt-1.5 text-sm leading-snug text-fg">{scenarioLabel}</p>
                        </div>

                        <div className="rounded-xl border border-navy-border bg-navy-card px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                            Cancellation reason
                          </p>
                          <p className="mt-1.5 text-sm leading-snug text-fg">{reasonText}</p>
                        </div>

                        {refund.adminNotes && (
                          <div className="space-y-3">
                            <div className="rounded-xl border border-navy-border bg-navy-card p-4 text-sm">
                              <p className="text-xs text-muted">Admin notes</p>
                              <p className="mt-1 whitespace-pre-wrap text-fg">{refund.adminNotes}</p>
                            </div>
                          </div>
                        )}

                      </section>

                      <section className="refund-process-layout__breakdowns">
                        <FullRefundBreakdownCard
                          refund={refund}
                          fullRefund={fullRefund}
                          salesTotal={refund.salesTotal}
                          deliveryFee={deliveryFee}
                          convenienceFee={convenienceFee}
                          orderTotal={refund.orderTotal}
                          refundPercentage={previewRefundPercentageLabel}
                          calculatedRefundAmount={calculatedRefundAmount}
                          customerReceives={
                            refund.status === 'REJECTED'
                              ? 0
                              : refund.refundAmount ?? (canProcess ? calculatedRefundAmount : 0)
                          }
                          gatewayPenalty={gatewayPenalty}
                          isOnlinePaid={isOnlinePaid}
                        />
                      </section>
                    </div>
                  )}
                </div>

                {refund && canProcess && canMutateRefund && (
                  <div className="shrink-0 border-t border-navy-border bg-navy-card px-4 py-3">
                    {actionMode === 'idle' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setActionMode('reject')}
                          disabled={actionLoading}
                          className="confirm-dialog__btn-danger inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          <XCircle size={15} />
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionMode('complete')}
                          disabled={actionLoading}
                          className="btn-primary inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-50"
                        >
                          <CheckCircle2 size={15} />
                          Complete Refund
                        </button>
                      </div>
                    )}

                    {actionMode === 'complete' && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-fg">Complete Refund</p>
                        <label className="block text-xs text-muted">
                          Admin notes (optional)
                          <textarea
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            rows={2}
                            className="input-field mt-1 w-full resize-none"
                          />
                        </label>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={resetActionForm}
                            disabled={actionLoading}
                            className="btn-outline px-3.5 py-2 text-sm disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleComplete}
                            disabled={actionLoading}
                            className="btn-primary inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-50"
                          >
                            {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            Confirm Complete
                          </button>
                        </div>
                      </div>
                    )}

                    {actionMode === 'reject' && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-fg">Reject Refund</p>
                        <label className="block text-xs text-muted">
                          Rejection reason
                          <textarea
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            rows={3}
                            className="input-field mt-1 w-full resize-none"
                            placeholder="Explain why this refund is rejected"
                          />
                        </label>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={resetActionForm}
                            disabled={actionLoading}
                            className="btn-outline px-3.5 py-2 text-sm disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleReject}
                            disabled={actionLoading}
                            className="confirm-dialog__btn-danger inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
                          >
                            {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
