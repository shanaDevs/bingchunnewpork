'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CalendarRange, Loader2, Upload, X } from 'lucide-react';

import ChannelSettlementCard from '@/components/admin/ChannelSettlementCard';
import {
  SETTLEMENT_CHANNELS,
  SETTLEMENT_PAYMENT_METHOD_OPTIONS,
  type PendingWithdrawalForSettlement,
  type SettlementPaymentMethodKey,
  type SettlementPreview,
  type SettlementStatement,
} from '@/components/admin/settlementTypes';
import { formatMoney } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';

type Props = {
  open: boolean;
  onClose: () => void;
  storeId?: string;
  selectedWithdrawal?: PendingWithdrawalForSettlement | null;
  onSubmitted: (statement: SettlementStatement) => void;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

function isValidRange(from: string, to: string): boolean {
  return !!from && !!to && from <= to && to <= todayStr();
}

export default function ProcessPaymentModal({
  open,
  onClose,
  storeId,
  selectedWithdrawal,
  onSubmitted,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<PendingWithdrawalForSettlement | null>(
    null,
  );
  const [pendingLoading, setPendingLoading] = useState(false);
  const [showWithdrawalBanner, setShowWithdrawalBanner] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<SettlementPaymentMethodKey | ''>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const onCloseRef = useRef(onClose);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, submitting]);

  useEffect(() => {
    if (!open) {
      setDateFrom('');
      setDateTo('');
      setPreview(null);
      setPendingWithdrawal(null);
      setPendingLoading(false);
      setShowWithdrawalBanner(true);
      setPaymentMethod('');
      setReceiptFile(null);
      setError('');
      setSubmitting(false);
      return;
    }

    if (selectedWithdrawal) {
      setPendingWithdrawal(selectedWithdrawal);
      setPendingLoading(false);
      if (selectedWithdrawal.periodFrom && selectedWithdrawal.periodTo) {
        setDateFrom(selectedWithdrawal.periodFrom);
        setDateTo(selectedWithdrawal.periodTo);
      }
    }
  }, [open, selectedWithdrawal]);

  useEffect(() => {
    if (!open || !storeId || selectedWithdrawal) {
      if (selectedWithdrawal) return;
      setPendingWithdrawal(null);
      return;
    }

    let cancelled = false;
    setPendingLoading(true);

        fetch(
      `${getApiBaseUrl()}/admin/wallet/pending-withdrawal?storeId=${encodeURIComponent(storeId)}`,
      { headers: adminAuthHeaders(), credentials: 'include' },
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to load payout request');
        if (cancelled) return;

        const data = json.data as PendingWithdrawalForSettlement | null;
        setPendingWithdrawal(data);

        if (data?.periodFrom && data?.periodTo) {
          setDateFrom(data.periodFrom);
          setDateTo(data.periodTo);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPendingWithdrawal(null);
          setError(err instanceof Error ? err.message : 'Failed to load payout request');
        }
      })
      .finally(() => {
        if (!cancelled) setPendingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, storeId, selectedWithdrawal]);

  const loadPreview = useCallback(
    async (from: string, to: string) => {
      setPreviewLoading(true);
      setError('');
      try {
                const qs = new URLSearchParams({ from, to });
        if (storeId) qs.set('storeId', storeId);
        const res = await fetch(
          `${getApiBaseUrl()}/admin/payment-history/settlement-preview?${qs}`,
          { headers: adminAuthHeaders(), credentials: 'include' },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to load preview');
        setPreview(json.data as SettlementPreview);
      } catch (e: unknown) {
        setPreview(null);
        setError(e instanceof Error ? e.message : 'Failed to load preview');
      } finally {
        setPreviewLoading(false);
      }
    },
    [storeId],
  );

  useEffect(() => {
    if (!open) return;
    if (!isValidRange(dateFrom, dateTo)) {
      setPreview(null);
      return;
    }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      loadPreview(dateFrom, dateTo);
    }, 350);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [dateFrom, dateTo, open, loadPreview]);

  const rangeReady = isValidRange(dateFrom, dateTo);

  const canSubmit =
    !!pendingWithdrawal &&
    !!preview &&
    preview.totalOwed > 0 &&
    !!paymentMethod &&
    !!receiptFile &&
    !submitting &&
    !previewLoading &&
    !pendingLoading &&
    rangeReady;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rangeReady || !paymentMethod || !receiptFile || !preview) return;

    setSubmitting(true);
    setError('');
    try {
            const form = new FormData();
      if (storeId) form.append('storeId', storeId);
      form.append('from', dateFrom);
      form.append('to', dateTo);
      form.append('paymentMethod', paymentMethod);
      form.append('receipt', receiptFile);
      if (pendingWithdrawal?.id) form.append('withdrawalId', pendingWithdrawal.id);

      const res = await fetch(`${getApiBaseUrl()}/admin/payment-history/settlement`, {
        method: 'POST',
        headers: adminAuthHeaders(), credentials: 'include',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to submit settlement');
      onSubmitted(json.data as SettlementStatement);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit settlement');
    } finally {
      setSubmitting(false);
    }
  }

  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200] bg-black/55 backdrop-blur-sm"
            onClick={() => !submitting && onClose()}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Process payment settlement"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1201] flex items-center justify-center p-4 sm:p-6"
            onClick={() => !submitting && onClose()}
          >
            <div
              className="card flex max-h-[min(95vh,960px)] w-full max-w-5xl flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[var(--color-navy-border)] px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--color-text)]">Process Payment</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Pay DartCodes commission for the branch payout period
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  {error && (
                    <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {pendingLoading && (
                    <div className="mb-5 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                      <Loader2 size={16} className="animate-spin" />
                      Loading payout request…
                    </div>
                  )}

                  {!pendingLoading && !pendingWithdrawal && (
                    <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
                      <p className="font-semibold">Payout request required</p>
                      <p className="mt-1 text-xs">
                        No approved or pending payout request was found for this branch. The branch
                        admin must first submit a payout request before a commission settlement can be
                        processed.
                      </p>
                    </div>
                  )}

                  {!pendingLoading &&
                    showWithdrawalBanner &&
                    pendingWithdrawal?.periodFrom &&
                    pendingWithdrawal?.periodTo && (
                      <div className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 px-4 py-3">
                        <CalendarRange size={16} className="mt-0.5 shrink-0 text-[var(--color-brand)]" />
                        <p className="min-w-0 flex-1 text-sm text-[var(--color-text)]">
                          {formatBiweeklyPeriodLabel(
                            pendingWithdrawal.periodFrom,
                            pendingWithdrawal.periodTo,
                          )}{' '}
                          · Branch requested {formatMoney(pendingWithdrawal.amountLkr)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowWithdrawalBanner(false)}
                          className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-input-bg)]"
                          aria-label="Dismiss"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                  <div className="mb-6 rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <CalendarRange size={16} className="text-[var(--color-brand)]" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                        Billing period
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="settlement-date-from"
                          className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]"
                        >
                          Start date
                        </label>
                        <input
                          id="settlement-date-from"
                          type="date"
                          value={dateFrom}
                          max={dateTo || todayStr()}
                          onChange={(e) => setDateFrom(e.target.value)}
                          disabled={submitting || pendingLoading}
                          className="input-field w-full text-sm"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="settlement-date-to"
                          className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]"
                        >
                          End date
                        </label>
                        <input
                          id="settlement-date-to"
                          type="date"
                          value={dateTo}
                          min={dateFrom || undefined}
                          max={todayStr()}
                          onChange={(e) => setDateTo(e.target.value)}
                          disabled={submitting || pendingLoading}
                          className="input-field w-full text-sm"
                        />
                      </div>
                    </div>
                    {dateFrom && dateTo && dateFrom > dateTo && (
                      <p className="mt-2 text-xs text-red-400">
                        Start date must be on or before end date.
                      </p>
                    )}
                  </div>

                  {previewLoading && (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                      <Loader2 size={20} className="animate-spin" />
                      Calculating breakdown…
                    </div>
                  )}

                  {!previewLoading && preview && (
                    <>
                      <div className="mb-4 grid gap-4 sm:grid-cols-2">
                        {SETTLEMENT_CHANNELS.map(({ key, label }) => {
                          const row = preview.breakdown[key];
                          const isOnline = key === 'pickupOnline' || key === 'deliveryOnline';
                          return (
                            <ChannelSettlementCard
                              key={key}
                              label={label}
                              row={row}
                              isOnline={isOnline}
                              isDeliveryOnline={key === 'deliveryOnline'}
                              showGatewayFees={false}
                            />
                          );
                        })}
                      </div>

                      <div className="mb-4 grid gap-3 rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 p-4 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Total orders
                          </p>
                          <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">
                            {preview.orderCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            DartCodes commission
                          </p>
                          <p className="mt-1 text-2xl font-bold text-[var(--color-brand)]">
                            {formatMoney(preview.totalCommission)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Payment gateway fees
                          </p>
                          <p className="mt-1 text-2xl font-bold text-amber-400">
                            {formatMoney(preview.totalProviderFee)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                            Audit only — not owed to DartCodes
                          </p>
                        </div>
                      </div>

                      <p className="mb-5 text-xs leading-relaxed text-[var(--color-text-muted)]">
                        Payment gateway fees are paid directly to the provider and are not included in
                        the amount owed to DartCodes.
                      </p>

                      <div className="mb-6 rounded-xl border border-[var(--color-brand)]/40 bg-[var(--color-brand-subtle)] px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand)]">
                          Total owed to DartCodes
                        </p>
                        <p className="mt-1 text-3xl font-bold text-[var(--color-text)]">
                          {formatMoney(preview.totalOwed)}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="settlement-payment-method"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                          >
                            Payment method
                          </label>
                          <select
                            id="settlement-payment-method"
                            value={paymentMethod}
                            onChange={(e) =>
                              setPaymentMethod(e.target.value as SettlementPaymentMethodKey | '')
                            }
                            disabled={submitting}
                            className="input-field w-full text-sm"
                          >
                            <option value="">Select method…</option>
                            {SETTLEMENT_PAYMENT_METHOD_OPTIONS.map(({ value, label }) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="settlement-receipt"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                          >
                            Payment slip / receipt proof
                          </label>
                          <label
                            htmlFor="settlement-receipt"
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--color-navy-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-brand)]"
                          >
                            <Upload size={16} className="shrink-0 text-[var(--color-brand)]" />
                            <span className="truncate">
                              {receiptFile ? receiptFile.name : 'Upload image or PDF (max 5 MB)'}
                            </span>
                            <input
                              id="settlement-receipt"
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              className="sr-only"
                              disabled={submitting}
                              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  {!previewLoading && rangeReady && !preview && !error && (
                    <p className="py-8 text-center text-sm text-muted">
                      No commission due for this period.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-[var(--color-navy-border)] px-6 py-5">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="payment-history-header__btn payment-history-header__btn--ghost"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="payment-history-header__btn payment-history-header__btn--primary disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      'Submit Settlement'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
