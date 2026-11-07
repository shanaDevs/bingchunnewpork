'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Loader2, ShieldCheck, Undo2, X, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { deliveryWalletFetch } from '@/lib/deliveryWalletApi';
import { useDeliveryWalletUnlockToken } from '@/components/admin/DeliveryWalletUnlockContext';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { confirmDialog } from '@/store/confirmStore';
import {
  parseDeliveryPayoutBreakdown,
  type DeliveryPayoutHistoryRow,
} from '@/lib/deliveryPayoutTypes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import DeliveryFeesByBranchBreakdown from '@/components/admin/DeliveryFeesByBranchBreakdown';
import AdminPinGateModal from '@/components/admin/AdminPinGateModal';
import { getApiBaseUrl } from '@/lib/apiBase';

type Props = {
  open: boolean;
  payout: DeliveryPayoutHistoryRow | null;
  onClose: () => void;
  onApproved?: () => void | Promise<void>;
  onRejected?: () => void | Promise<void>;
  /** History: snapshot only. Pending review: approve / reject with optional proof. */
  readOnly?: boolean;
};

function formatPeriod(from: string, to: string) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-LK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  return `${fmt(from)} – ${fmt(to)}`;
}

export default function DeliveryApprovePayoutModal({
  open,
  payout,
  onClose,
  onApproved,
  onRejected,
  readOnly = true,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [pinGateOpen, setPinGateOpen] = useState(false);
  const unlockToken = useDeliveryWalletUnlockToken();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setError('');
    setProofFile(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, submitting, onClose]);

  if (!portalReady) return null;

  const breakdown = payout ? parseDeliveryPayoutBreakdown(payout.breakdown) : null;
  const snapshotAmount = payout?.amount ?? breakdown?.netForDelivery ?? 0;
  const branches = breakdown?.branches ?? [];

  const submitApproval = async (verifiedPin: string) => {
    if (!payout) return;
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('password', verifiedPin);
      if (proofFile) form.append('proof', proofFile);
      await deliveryWalletFetch(`/admin/delivery-wallet/payouts/${payout.id}/approve`, unlockToken, {
        method: 'POST',
        body: form,
      });
      toast.success('Delivery payout approved');
      await onApproved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve payout');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinVerified = async (verifiedPin: string) => {
    if (!payout) return;
    const confirmed = await confirmDialog({
      title: 'Approve payout?',
      message: `Approve this delivery payout of ${formatMoney(snapshotAmount)} for ${formatPeriod(payout.periodFrom, payout.periodTo)}?`,
      confirmLabel: 'Approve',
      cancelLabel: 'Cancel',
      variant: 'default',
    });
    if (!confirmed) return;
    await submitApproval(verifiedPin);
  };

  const handleApprove = async () => {
    if (!payout) return;
    setPinGateOpen(true);
  };

  const handleReject = async () => {
    if (!payout) return;
    const confirmed = await confirmDialog({
      title: 'Reject payout?',
      message: `Reject this delivery payout of ${formatMoney(snapshotAmount)} for ${formatPeriod(payout.periodFrom, payout.periodTo)}? The period can be requested again.`,
      confirmLabel: 'Reject',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    setSubmitting(true);
    setError('');
    try {
      await deliveryWalletFetch(`/admin/delivery-wallet/payouts/${payout.id}/reject`, unlockToken, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast.success('Delivery payout rejected');
      await onRejected?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject payout');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <>
    <AnimatePresence>
      {open && payout && (
        <>
          <motion.div
            key="delivery-approve-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm"
            onClick={() => !submitting && onClose()}
            aria-hidden
          />

          <motion.div
            key="delivery-approve-panel"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 z-[10000] flex flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl sm:inset-8"
            role="dialog"
            aria-modal
            aria-labelledby="delivery-approve-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-start justify-between border-b border-navy-border bg-navy-light/50 px-6 py-4">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Delivery payout
                  </p>
                  <h2 id="delivery-approve-title" className="mt-1 text-xl font-bold text-white">
                    {readOnly ? 'Payout details' : 'Review payout'}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {formatPeriod(payout.periodFrom, payout.periodTo)}
                    {payout.status ? ` · ${payout.status}` : ''} · saved at payout time.
                  </p>
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
                <div className="rounded-xl border border-navy-border/80 bg-input-bg/25 px-4 py-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Net paid
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                    {formatMoney(snapshotAmount)}
                  </p>
                </div>

                {breakdown && (
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
                            Net for delivery = (Gross − {breakdown.platformFeePercent}% platform) −{' '}
                            {breakdown.gatewayFeePercent}% gateway
                          </PopoverContent>
                        </Popover>
                      </div>
                      <dl className="mt-3 space-y-2 border-t border-navy-border/60 pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <dt>Gross delivery fees</dt>
                          <dd className="font-semibold tabular-nums text-white">
                            {formatMoneyAmount(breakdown.grossDeliveryFee)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <dt className="pl-3">Active orders ({breakdown.orderCount})</dt>
                          <dd className="tabular-nums">{formatMoneyAmount(breakdown.fromActiveOrders)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <dt className="inline-flex items-center gap-1.5 pl-3">
                            <Undo2 size={12} />
                            Late-cancel retained ({breakdown.lateCancelCount})
                          </dt>
                          <dd className="tabular-nums">{formatMoneyAmount(breakdown.fromLateCancels)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-navy-border/40 pt-2">
                          <dt>− Platform fee ({breakdown.platformFeePercent}%)</dt>
                          <dd className="font-semibold tabular-nums text-red-300">
                            − {formatMoneyAmount(breakdown.platformFee)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>= After platform</dt>
                          <dd className="font-medium tabular-nums text-white">
                            {formatMoneyAmount(breakdown.afterPlatformFee)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>− Gateway fee ({breakdown.gatewayFeePercent}%)</dt>
                          <dd className="font-semibold tabular-nums text-red-300">
                            − {formatMoneyAmount(breakdown.gatewayFee)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-navy-border/60 pt-2">
                          <dt className="font-medium text-white">= Net for delivery</dt>
                          <dd className="text-base font-bold tabular-nums text-brand">
                            {formatMoney(breakdown.netForDelivery)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                )}

                {breakdown && (
                  <DeliveryFeesByBranchBreakdown
                    key={payout.id}
                    branches={branches}
                    grossDeliveryFee={breakdown.grossDeliveryFee}
                    platformFeePercent={breakdown.platformFeePercent}
                    gatewayFeePercent={breakdown.gatewayFeePercent}
                  />
                )}

                {payout.remarks?.trim() && (
                  <p className="mt-4 rounded-lg border border-navy-border px-3 py-2 text-xs text-muted">
                    {payout.remarks}
                  </p>
                )}

                {!readOnly && (
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
                    {proofFile && (
                      <p className="mt-2 text-xs text-white">{proofFile.name}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-navy-border bg-input-bg/20 px-6 py-4">
                {error && (
                  <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}
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
                      <>
                    <button
                      type="button"
                      onClick={() => void handleReject()}
                      disabled={submitting}
                      className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-[var(--radius-btn)] border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <XCircle size={15} />
                      )}
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApprove()}
                      disabled={submitting}
                      className="btn-primary inline-flex min-w-[140px] items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={15} />
                          Approve
                        </>
                      )}
                    </button>
                      </>
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
        description="Enter your admin password to approve this delivery payout."
      />
    </>,
    document.body,
  );
}
