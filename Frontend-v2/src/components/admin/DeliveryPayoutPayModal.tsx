'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Loader2, ShieldCheck, Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { deliveryWalletFetch } from '@/lib/deliveryWalletApi';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useDeliveryWalletUnlockToken } from '@/components/admin/DeliveryWalletUnlockContext';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { confirmDialog } from '@/store/confirmStore';
import type { DeliveryPayoutDueRow, DeliveryWalletSummary } from '@/lib/deliveryPayoutTypes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import DeliveryFeesByBranchBreakdown from '@/components/admin/DeliveryFeesByBranchBreakdown';
import AdminPinGateModal from '@/components/admin/AdminPinGateModal';
import { cn } from '@/lib/utils';

type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CHECK' | '';

const DELIVERY_PAYOUT_PAYMENT_OPTIONS: { value: Exclude<PaymentMethod, ''>; label: string }[] = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHECK', label: 'Check' },
];

type Props = {
  open: boolean;
  due: DeliveryPayoutDueRow | null;
  onClose: () => void;
  onCompleted?: () => void | Promise<void>;
  readOnly?: boolean;
};

export default function DeliveryPayoutPayModal({
  open,
  due,
  onClose,
  onCompleted,
  readOnly = false,
}: Props) {
  const unlockToken = useDeliveryWalletUnlockToken();
  const [portalReady, setPortalReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [remarks, setRemarks] = useState('');
  const [pinGateOpen, setPinGateOpen] = useState(false);

  const from = due?.periodFrom;
  const to = due?.periodTo;

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['delivery-wallet-period', from, to],
    queryFn: () =>
      deliveryWalletFetch(
        `/admin/delivery-wallet?from=${encodeURIComponent(from!)}&to=${encodeURIComponent(to!)}`,
        unlockToken,
      ) as Promise<DeliveryWalletSummary>,
    enabled: open && Boolean(from && to),
  });

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setError('');
    setPaymentMethod('');
    setCheckNumber('');
    setCheckDate('');
    setProofFile(null);
    setRemarks('');
    setPinGateOpen(false);
  }, [open, due?.periodFrom, due?.periodTo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting && !pinGateOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, submitting, pinGateOpen, onClose]);

  if (!portalReady || !due) return null;

  const branches = summary?.branches ?? [];
  const netAmount = summary?.netForDelivery ?? due.netForDelivery;
  const isCheck = paymentMethod === 'CHECK';
  const checkValid = !isCheck || (checkNumber.trim().length > 0 && !!checkDate);
  const canPay =
    !readOnly &&
    due.payable &&
    !!paymentMethod &&
    checkValid &&
    !!proofFile &&
    !submitting &&
    !summaryLoading &&
    netAmount > 0;

  const periodLabel = formatBiweeklyPeriodLabel(due.periodFrom, due.periodTo);

  const submitPayout = async (verifiedPin: string) => {
    if (!proofFile || !paymentMethod) return;
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('periodFrom', due.periodFrom);
      form.append('paymentMethod', paymentMethod);
      form.append('password', verifiedPin);
      if (remarks.trim()) form.append('remarks', remarks.trim());
      form.append('proof', proofFile);
      if (isCheck) {
        form.append('checkNumber', checkNumber.trim());
        form.append('checkDate', checkDate);
      }

      await deliveryWalletFetch('/admin/delivery-wallet/payouts', unlockToken, {
        method: 'POST',
        body: form,
      });
      toast.success('Delivery payout completed');
      await onCompleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pay delivery payout');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinVerified = async (verifiedPin: string) => {
    const confirmed = await confirmDialog({
      title: 'Pay delivery payout?',
      message: `Pay ${formatMoney(netAmount)} for ${periodLabel}?`,
      confirmLabel: 'Yes, pay',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    await submitPayout(verifiedPin);
  };

  const handlePayClick = () => {
    if (!canPay) return;
    setPinGateOpen(true);
  };

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="delivery-pay-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm"
              onClick={() => !submitting && !pinGateOpen && onClose()}
              aria-hidden
            />
            <motion.div
              key="delivery-pay-panel"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="fixed inset-4 z-[10000] flex flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl sm:inset-8"
              role="dialog"
              aria-modal
              aria-labelledby="delivery-pay-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-start justify-between border-b border-navy-border bg-navy-light/50 px-6 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Delivery payout
                    </p>
                    <h2 id="delivery-pay-title" className="mt-1 text-xl font-bold text-white">
                      {readOnly ? 'Period preview' : 'Review & pay delivery payout'}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {periodLabel} · {due.days} days
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="shrink-0 rounded-lg p-2 text-muted hover:bg-navy-light hover:text-white disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  {summaryLoading && (
                    <div className="flex items-center justify-center gap-2 py-12 text-muted">
                      <Loader2 size={20} className="animate-spin text-brand" />
                      Loading calculation…
                    </div>
                  )}

                  {summary && (
                    <>
                      <div className="rounded-xl border border-navy-border/80 bg-input-bg/25 px-4 py-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                          Net for delivery
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                          {formatMoney(netAmount)}
                        </p>
                      </div>

                      <div className="mt-4 rounded-xl border border-navy-border/80 bg-input-bg/25 px-4 py-3.5 text-sm text-muted">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white">Payout calculation</p>
                          <Popover>
                            <PopoverTrigger
                              type="button"
                              className="inline-flex rounded-lg p-1 text-brand hover:bg-navy-light/60"
                              aria-label="Show payout formula"
                            >
                              <Info size={16} />
                            </PopoverTrigger>
                            <PopoverContent
                              className="z-[10050] max-w-sm font-mono text-xs"
                              positionerClassName="z-[10050]"
                              side="bottom"
                              align="start"
                              sideOffset={6}
                            >
                              Net = (Gross − {summary.platformFeePercent}% platform) −{' '}
                              {summary.gatewayFeePercent}% gateway
                            </PopoverContent>
                          </Popover>
                        </div>
                        <dl className="mt-3 space-y-2 border-t border-navy-border/60 pt-3">
                          <div className="flex justify-between gap-3">
                            <dt>Gross delivery fees</dt>
                            <dd className="font-semibold tabular-nums text-white">
                              {formatMoneyAmount(summary.grossDeliveryFee)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3 text-xs">
                            <dt className="pl-3">Active orders ({summary.orderCount})</dt>
                            <dd className="tabular-nums">{formatMoneyAmount(summary.fromActiveOrders)}</dd>
                          </div>
                          <div className="flex justify-between gap-3 text-xs">
                            <dt className="inline-flex items-center gap-1.5 pl-3">
                              <Undo2 size={12} />
                              Late-cancel retained ({summary.lateCancelCount})
                            </dt>
                            <dd className="tabular-nums">{formatMoneyAmount(summary.fromLateCancels)}</dd>
                          </div>
                          <div className="flex justify-between gap-3 border-t border-navy-border/40 pt-2">
                            <dt>− Platform ({summary.platformFeePercent}%)</dt>
                            <dd className="tabular-nums text-red-300">
                              − {formatMoneyAmount(summary.platformFee)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt>− Gateway ({summary.gatewayFeePercent}%)</dt>
                            <dd className="tabular-nums text-red-300">
                              − {formatMoneyAmount(summary.gatewayFee)}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <DeliveryFeesByBranchBreakdown
                        branches={branches}
                        grossDeliveryFee={summary.grossDeliveryFee}
                        platformFeePercent={summary.platformFeePercent}
                        gatewayFeePercent={summary.gatewayFeePercent}
                      />
                    </>
                  )}

                  {!readOnly && summary && (
                    <div className="delivery-payout-payment-fields mt-4 space-y-4 rounded-xl border border-navy-border/80 bg-input-bg/25 px-4 py-3.5">
                      <div>
                        <p
                          id="delivery-pay-method-label"
                          className="text-sm font-medium text-white"
                        >
                          Payment method
                        </p>
                        <div
                          className="mt-2 flex flex-wrap gap-2"
                          role="radiogroup"
                          aria-labelledby="delivery-pay-method-label"
                        >
                          {DELIVERY_PAYOUT_PAYMENT_OPTIONS.map(({ value, label }) => {
                            const selected = paymentMethod === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled={submitting}
                                onClick={() => {
                                  setPaymentMethod(value);
                                  if (value !== 'CHECK') {
                                    setCheckNumber('');
                                    setCheckDate('');
                                  }
                                }}
                                className={cn(
                                  'min-w-[7.5rem] flex-1 rounded-[var(--radius-btn)] border px-3 py-2.5 text-sm font-semibold transition-colors',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-card)]',
                                  selected
                                    ? 'border-brand bg-brand text-white shadow-sm'
                                    : 'border-navy-border bg-[var(--color-navy-card)] text-[var(--color-text)] hover:border-brand/60 hover:bg-brand/10',
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {isCheck && (
                        <>
                          <div>
                            <label htmlFor="delivery-pay-check-num" className="text-sm text-white">
                              Check number
                            </label>
                            <input
                              id="delivery-pay-check-num"
                              className="input-field mt-2 w-full text-sm"
                              value={checkNumber}
                              onChange={(e) => setCheckNumber(e.target.value)}
                              disabled={submitting}
                            />
                          </div>
                          <div>
                            <label htmlFor="delivery-pay-check-date" className="text-sm text-white">
                              Check date
                            </label>
                            <input
                              id="delivery-pay-check-date"
                              type="date"
                              className="input-field mt-2 w-full text-sm"
                              value={checkDate}
                              onChange={(e) => setCheckDate(e.target.value)}
                              disabled={submitting}
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label htmlFor="delivery-pay-proof" className="text-sm font-medium text-white">
                          Payment proof (required)
                        </label>
                        <input
                          id="delivery-pay-proof"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                          disabled={submitting}
                          onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                        />
                      </div>

                      <div>
                        <label htmlFor="delivery-pay-remarks" className="text-sm text-muted">
                          Remarks (optional)
                        </label>
                        <textarea
                          id="delivery-pay-remarks"
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                          maxLength={500}
                          rows={2}
                          className="input-field mt-2 w-full resize-none text-sm"
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  )}

                  {error && (
                    <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      {error}
                    </p>
                  )}
                </div>

                <div className="shrink-0 border-t border-navy-border bg-input-bg/20 px-6 py-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={submitting}
                      className="rounded-[var(--radius-btn)] border border-navy-border px-4 py-2.5 text-sm font-semibold text-muted hover:text-white disabled:opacity-50"
                    >
                      {readOnly ? 'Close' : 'Cancel'}
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={handlePayClick}
                        disabled={!canPay}
                        className="btn-primary inline-flex min-w-[140px] items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <ShieldCheck size={15} />
                        )}
                        Pay payout
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AdminPinGateModal
        open={pinGateOpen}
        onClose={() => !submitting && setPinGateOpen(false)}
        onVerified={(pin) => void handlePinVerified(pin)}
        apiBase={getApiBaseUrl()}
        busy={submitting}
        elevated
        titleId="delivery-pay-pin-title"
        inputId="delivery-pay-pin"
        description="Enter your admin password to pay this delivery payout."
      />
    </>,
    document.body,
  );
}
