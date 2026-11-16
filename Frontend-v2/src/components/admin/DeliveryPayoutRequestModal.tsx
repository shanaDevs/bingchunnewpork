'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownCircle, CalendarRange, Check, Info, Loader2, Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { deliveryWalletFetch } from '@/lib/deliveryWalletApi';
import { useDeliveryWalletUnlockToken } from '@/components/admin/DeliveryWalletUnlockContext';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import {
  addDaysToDateStr,
  formatBiweeklyPeriodLabel,
  type PayoutPeriodPreset,
} from '@/lib/biweeklyPeriods';

/** Delivery payouts use the same fixed 15-day cycle as branch payouts. */
const DELIVERY_PAYOUT_PERIOD_DAYS: PayoutPeriodPreset = 15;
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import DeliveryFeesByBranchBreakdown from '@/components/admin/DeliveryFeesByBranchBreakdown';
import AdminPinGateModal from '@/components/admin/AdminPinGateModal';
import { getApiBaseUrl } from '@/lib/apiBase';

export type DeliveryWalletBranch = {
  storeId: string;
  storeName: string;
  fromActiveOrders: number;
  fromLateCancels: number;
  grossDeliveryFee: number;
  orderCount: number;
  lateCancelCount: number;
  platformFee: number;
  afterPlatformFee: number;
  gatewayFee: number;
  netForDelivery: number;
};

export type DeliveryWalletSummary = {
  grossDeliveryFee: number;
  fromActiveOrders: number;
  fromLateCancels: number;
  platformFeePercent: number;
  platformFee: number;
  afterPlatformFee: number;
  gatewayFeePercent: number;
  gatewayFee: number;
  netForDelivery: number;
  orderCount: number;
  lateCancelCount: number;
  branches: DeliveryWalletBranch[];
};

export type DeliveryPayoutRequestRow = {
  id: string;
  amount: number;
  amountLkr?: number;
  status: string;
  remarks: string | null;
  periodFrom: string;
  periodTo: string;
  requestedById?: string;
  breakdown?: DeliveryWalletSummary | null;
  createdAt: string;
};

export function parseDeliveryPayoutBreakdown(value: unknown): DeliveryWalletSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DeliveryWalletSummary>;
  if (typeof raw.netForDelivery !== 'number') return null;
  return raw as DeliveryWalletSummary;
}

export type DeliveryPayoutPeriodOption = {
  days: PayoutPeriodPreset;
  from: string;
  to: string;
  capped: boolean;
};

export type DeliveryCurrentPayoutCycle = {
  from: string;
  cycleTo: string;
  through: string;
  days: number;
};

export type DeliveryPayoutPreview = {
  today: string;
  maxEndDate: string;
  nextPeriodStart: string | null;
  liveFrom?: string | null;
  liveTo?: string | null;
  liveAfterApproved?: boolean;
  currentPayoutCycle?: DeliveryCurrentPayoutCycle | null;
  options: DeliveryPayoutPeriodOption[];
  periodDays: number | null;
  from: string | null;
  to: string | null;
  capped: boolean;
  rangeValid: boolean;
  rangeError: string | null;
  canSubmit: boolean;
  summary: DeliveryWalletSummary | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
};

function adminFetch(path: string, unlockToken: string, options?: RequestInit) {
  return deliveryWalletFetch(path, unlockToken, options);
}

export default function DeliveryPayoutRequestModal({ open, onClose, onSubmitted }: Props) {
  const unlockToken = useDeliveryWalletUnlockToken();
  const [portalReady, setPortalReady] = useState(false);
  const periodDays: PayoutPeriodPreset = DELIVERY_PAYOUT_PERIOD_DAYS;
  const [remarks, setRemarks] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pinGateOpen, setPinGateOpen] = useState(false);
  const onCloseRef = useRef(onClose);

  const { data: periodInfo, isFetching: periodInfoLoading } = useQuery({
    queryKey: ['delivery-payout-preview-info'],
    queryFn: () =>
      adminFetch('/admin/delivery-wallet/payout-preview', unlockToken) as Promise<DeliveryPayoutPreview>,
    enabled: open,
  });

  const periodOptions = periodInfo?.options ?? [];
  const selectedOption =
    periodDays != null ? periodOptions.find((opt) => opt.days === periodDays) ?? null : null;

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['delivery-payout-preview', periodDays],
    queryFn: () =>
      adminFetch(
        `/admin/delivery-wallet/payout-preview?periodDays=${periodDays}`,
        unlockToken,
      ) as Promise<DeliveryPayoutPreview>,
    enabled: open && periodDays != null,
  });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setReviewed(false);
      setShowConfirm(false);
      setError('');
      setProofFile(null);
      setRemarks('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        if (showConfirm) {
          setShowConfirm(false);
          setError('');
        } else {
          onCloseRef.current();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, submitting, showConfirm]);

  const summary = preview?.summary;
  const branches = summary?.branches ?? [];
  const periodIncomplete = selectedOption?.capped ?? false;
  const periodCompleteEndDate = useMemo(() => {
    if (!selectedOption || !periodIncomplete) return null;
    return addDaysToDateStr(selectedOption.from, selectedOption.days - 1);
  }, [selectedOption, periodIncomplete]);

  const canRequest =
    Boolean(preview?.canSubmit) &&
    periodDays != null &&
    !periodIncomplete &&
    !submitting &&
    !previewLoading &&
    !periodInfoLoading;

  const periodLabel =
    selectedOption != null
      ? `${formatBiweeklyPeriodLabel(selectedOption.from, selectedOption.to)} · ${selectedOption.days} days`
      : '';

  const handleRequestClick = () => {
    if (!canRequest || !reviewed) return;
    setError('');
    setShowConfirm(true);
  };

  const submitPayout = async (verifiedPin: string) => {
    if (!canRequest || !showConfirm || !reviewed) return;
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('periodDays', String(periodDays));
      form.append('password', verifiedPin);
      const trimmedRemarks = remarks.trim();
      if (trimmedRemarks) form.append('remarks', trimmedRemarks);
      if (proofFile) form.append('proof', proofFile);
      await adminFetch('/admin/delivery-wallet/payouts', unlockToken, {
        method: 'POST',
        body: form,
      });
      toast.success('Delivery payout recorded as paid');
      await onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pay delivery payout');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinVerified = async (verifiedPin: string) => {
    await submitPayout(verifiedPin);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRequest || !showConfirm || !reviewed) return;
    setPinGateOpen(true);
  };

  if (!portalReady) return null;

  return createPortal(
    <>
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="delivery-payout-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm"
            onClick={() => !submitting && onClose()}
            aria-hidden
          />

          <motion.div
            key="delivery-payout-panel"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 z-[10000] flex flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl sm:inset-8"
            role="dialog"
            aria-modal
            aria-labelledby="delivery-payout-title"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-start justify-between border-b border-navy-border bg-navy-light/50 px-6 py-4">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Delivery payout
                  </p>
                  <h2 id="delivery-payout-title" className="mt-1 text-xl font-bold text-white">
                    Pay delivery payout
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Fixed 15-day cycle. Payment slip is optional and can be uploaded later. Amounts are
                    saved on submit and will not change later.
                  </p>
                  {periodInfo && !periodInfo.nextPeriodStart && periodOptions.length > 0 && (
                    <p className="mt-1 text-xs text-brand">
                      First payout starts from the first delivery order.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-white disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Payout period
                </p>
                <div className="grid gap-4 sm:grid-cols-1">
                  {selectedOption && (
                    <div className="relative flex flex-col justify-center rounded-lg border border-brand bg-brand/15 p-4 text-left">
                      <div className="flex items-center gap-3">
                        <CalendarRange size={20} className="text-brand" />
                        <div>
                          <p className="text-[15px] font-bold text-white">
                            {selectedOption.days} Days
                          </p>
                          <p className="mt-0.5 text-[12px] font-medium text-muted">
                            {formatBiweeklyPeriodLabel(selectedOption.from, selectedOption.to)}
                          </p>
                        </div>
                      </div>
                      <div className="absolute right-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-white">
                        <Check size={14} strokeWidth={3} />
                      </div>
                      {selectedOption.capped && (
                        <p className="mt-2 text-[11px] font-medium text-amber-400">
                          Period not complete yet
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {periodInfoLoading && periodOptions.length === 0 && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                    <Loader2 size={16} className="animate-spin text-brand" />
                    Loading period options…
                  </div>
                )}
                {periodIncomplete && periodCompleteEndDate && (
                  <p className="mt-2 text-[13px] font-medium text-amber-400">
                    The full {periodDays}-day period is not complete yet. You can pay after{' '}
                    {periodCompleteEndDate}.
                  </p>
                )}

                {summary && preview?.rangeValid && (
                  <div className="mt-4 rounded-xl border border-navy-border/80 bg-input-bg/25 px-4 py-3.5">
                    <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted">
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
                            Net for delivery = (Gross − {summary.platformFeePercent}% platform) −{' '}
                            {summary.gatewayFeePercent}% gateway
                          </PopoverContent>
                        </Popover>
                      </div>
                      <dl className="mt-3 space-y-2 border-t border-navy-border/60 pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <dt>Gross delivery fees</dt>
                          <dd className="font-semibold tabular-nums text-white">
                            {formatMoneyAmount(summary.grossDeliveryFee)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <dt className="pl-3">Active orders ({summary.orderCount})</dt>
                          <dd className="tabular-nums">{formatMoneyAmount(summary.fromActiveOrders)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <dt className="inline-flex items-center gap-1.5 pl-3">
                            <Undo2 size={12} />
                            Late-cancel retained ({summary.lateCancelCount})
                          </dt>
                          <dd className="tabular-nums">{formatMoneyAmount(summary.fromLateCancels)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-navy-border/40 pt-2">
                          <dt>− Platform fee ({summary.platformFeePercent}%)</dt>
                          <dd className="font-semibold tabular-nums text-red-300">
                            − {formatMoneyAmount(summary.platformFee)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>= After platform</dt>
                          <dd className="font-medium tabular-nums text-white">
                            {formatMoneyAmount(summary.afterPlatformFee)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>− Gateway fee ({summary.gatewayFeePercent}%)</dt>
                          <dd className="font-semibold tabular-nums text-red-300">
                            − {formatMoneyAmount(summary.gatewayFee)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-navy-border/60 pt-2">
                          <dt className="font-medium text-white">= Net for delivery</dt>
                          <dd className="text-base font-bold tabular-nums text-brand">
                            {formatMoney(summary.netForDelivery)}
                          </dd>
                        </div>
                      </dl>
                      {summary.netForDelivery <= 0 && (
                        <p className="mt-3 text-xs text-amber-300">No delivery amount in this period.</p>
                      )}
                    </div>
                  </div>
                )}

                {previewLoading && periodDays != null && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
                    <Loader2 size={28} className="animate-spin text-brand" />
                    <p className="text-sm">Calculating net amount…</p>
                  </div>
                )}

                {preview?.rangeError && (
                  <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {preview.rangeError}
                  </p>
                )}

                {!previewLoading && summary && preview?.rangeValid && (
                  <DeliveryFeesByBranchBreakdown
                    key={periodDays ?? 'none'}
                    branches={branches}
                    grossDeliveryFee={summary.grossDeliveryFee}
                    platformFeePercent={summary.platformFeePercent}
                    gatewayFeePercent={summary.gatewayFeePercent}
                  />
                )}
              </div>

              <div className="shrink-0 border-t border-navy-border bg-input-bg/20 px-6 py-4">
                {showConfirm ? (
                  <>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      Confirm delivery payout
                    </p>
                    <p className="text-sm text-white">
                      Period: <span className="font-medium">{periodLabel}</span>
                    </p>
                    {summary && (
                      <p className="mt-1 text-sm text-muted">
                        Net for delivery:{' '}
                        <span className="font-semibold text-brand">{formatMoney(summary.netForDelivery)}</span>
                      </p>
                    )}
                    <div className="mt-4 rounded-xl border border-navy-border/80 bg-input-bg/25 px-4 py-3.5">
                      <label htmlFor="delivery-payout-proof" className="text-sm font-medium text-white">
                        Payment proof (optional)
                      </label>
                      <p className="mt-1 text-xs text-muted">JPEG, PNG, WebP, or PDF slip / receipt.</p>
                      <input
                        id="delivery-payout-proof"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                        disabled={submitting}
                        onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                      />
                      {proofFile && <p className="mt-2 text-xs text-white">{proofFile.name}</p>}
                    </div>
                    <label
                      htmlFor="delivery-payout-remarks"
                      className="mb-2 mt-4 block text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      Remarks
                    </label>
                    <textarea
                      id="delivery-payout-remarks"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      disabled={submitting}
                      maxLength={500}
                      rows={2}
                      placeholder="Optional"
                      className="input-field mb-4 w-full resize-none text-sm"
                    />
                    {error && (
                      <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                        {error}
                      </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowConfirm(false);
                          setError('');
                        }}
                        disabled={submitting}
                        className="rounded-[var(--radius-btn)] border border-navy-border px-4 py-2.5 text-sm font-semibold text-muted hover:text-white disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={!canRequest}
                        className="btn-primary inline-flex min-w-[140px] items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <ArrowDownCircle size={15} />
                            Confirm payout
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    {periodDays != null && (
                      <label
                        htmlFor="delivery-payout-reviewed"
                        className="flex cursor-pointer items-center gap-3"
                      >
                        <input
                          id="delivery-payout-reviewed"
                          type="checkbox"
                          checked={reviewed}
                          onChange={(e) => setReviewed(e.target.checked)}
                          disabled={submitting}
                          className="h-5 w-5 shrink-0 rounded border-navy-border bg-navy-light text-brand focus:ring-brand checked:bg-brand disabled:opacity-50"
                        />
                        <span className="text-sm font-semibold text-white">
                          I have reviewed the payout calculation.
                        </span>
                      </label>
                    )}
                    <div className="flex flex-wrap justify-end gap-2 sm:ml-auto">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="rounded-[var(--radius-btn)] border border-navy-border px-4 py-2.5 text-sm font-semibold text-muted hover:text-white disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleRequestClick}
                        disabled={!canRequest || !reviewed}
                        className="btn-primary inline-flex min-w-[140px] items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        <ArrowDownCircle size={15} />
                        Pay delivery
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
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
        description="Enter your admin password to record this delivery payout."
      />
    </>,
    document.body,
  );
}
