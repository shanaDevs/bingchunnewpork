'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Loader2, X } from 'lucide-react';

import type { PendingWithdrawalForSettlement } from '@/components/admin/settlementTypes';
import { formatMoney } from '@/lib/receipt';

type Props = {
  open: boolean;
  onClose: () => void;
  storeId?: string;
  branchName?: string;
  onContinue: (withdrawal: PendingWithdrawalForSettlement) => void;
};

function formatPeriod(from: string | null, to: string | null) {
  if (!from || !to) return '—';
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-LK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  return `${fmt(from)} – ${fmt(to)}`;
}

function statusLabel(status: PendingWithdrawalForSettlement['status']) {
  switch (status) {
    case 'APPROVED':
      return 'Approved · DartCodes pending';
    case 'PENDING':
      return 'Pending approval';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function statusBadgeClass(status: PendingWithdrawalForSettlement['status']) {
  switch (status) {
    case 'APPROVED':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
    case 'PENDING':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
    case 'REJECTED':
      return 'border-red-500/40 bg-red-500/15 text-red-300';
    default:
      return 'border-[var(--color-navy-border)] bg-[var(--color-input-bg)] text-[var(--color-text-muted)]';
  }
}

export default function SettlementWithdrawalPickerModal({
  open,
  onClose,
  storeId,
  branchName,
  onContinue,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [withdrawals, setWithdrawals] = useState<PendingWithdrawalForSettlement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    if (!open) {
      setWithdrawals([]);
      setSelectedId(null);
      setError('');
      setLoading(false);
      return;
    }

    if (!storeId) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(
      `${getApiBaseUrl()}/admin/wallet/settlement-withdrawals?storeId=${encodeURIComponent(storeId)}`,
      { headers: adminAuthHeaders(), credentials: 'include' },
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to load withdrawals');
        if (cancelled) return;

        const items = (json.data ?? []) as PendingWithdrawalForSettlement[];
        setWithdrawals(items);
        setSelectedId(items[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load withdrawals');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, storeId]);

  const selectedWithdrawal = withdrawals.find((w) => w.id === selectedId) ?? null;

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
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Select payout request"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1201] flex items-center justify-center p-4 sm:p-6"
            onClick={onClose}
          >
            <div
              className="card flex max-h-[min(95vh,960px)] w-full max-w-5xl flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[var(--color-navy-border)] px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--color-text)]">
                    Select Payout Request
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {branchName
                      ? `Unsettled DartCodes commission requests for ${branchName}`
                      : 'Unsettled DartCodes commission requests for this branch'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text)]"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {error && (
                  <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {loading && (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]">
                    <Loader2 size={20} className="animate-spin" />
                    Loading withdrawals…
                  </div>
                )}

                {!loading && withdrawals.length === 0 && !error && (
                  <div className="rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 px-6 py-12 text-center">
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      No unsettled payout requests
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      All branch payout requests have already been settled with DartCodes, or none
                      are pending approval.
                    </p>
                  </div>
                )}

                {!loading && withdrawals.length > 0 && (
                  <>
                    <p className="mb-4 text-xs text-[var(--color-text-muted)]">
                      {withdrawals.length} unsettled request{withdrawals.length !== 1 ? 's' : ''}.
                      Select one to auto-fill the billing period in Process Payment.
                    </p>

                    <div className="overflow-hidden rounded-xl border border-[var(--color-navy-border)]">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--color-input-bg)]/50 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                          <tr>
                            <th className="px-4 py-3 w-10" />
                            <th className="px-4 py-3">Period</th>
                            <th className="px-4 py-3">Amount</th>
                            <th className="px-4 py-3">Payout status</th>
                            <th className="px-4 py-3">Requested</th>
                          </tr>
                        </thead>
                        <tbody>
                          {withdrawals.map((row) => {
                            const selected = selectedId === row.id;
                            return (
                              <tr
                                key={row.id}
                                className={[
                                  'cursor-pointer border-t border-[var(--color-navy-border)] transition-colors',
                                  selected
                                    ? 'bg-[var(--color-brand-subtle)]'
                                    : 'hover:bg-[var(--color-input-bg)]/40',
                                ].join(' ')}
                                onClick={() => setSelectedId(row.id)}
                              >
                                <td className="px-4 py-3">
                                  <input
                                    type="radio"
                                    name="settlement-withdrawal"
                                    checked={selected}
                                    onChange={() => setSelectedId(row.id)}
                                    className="accent-[var(--color-brand)]"
                                  />
                                </td>
                                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                                  {formatPeriod(row.periodFrom, row.periodTo)}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-[var(--color-text)]">
                                  {formatMoney(row.amountLkr)}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(row.status)}`}
                                  >
                                    {statusLabel(row.status)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                                  {new Date(row.createdAt).toLocaleDateString('en-LK', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {selectedWithdrawal && (
                      <div className="mt-4 rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand-subtle)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
                        Selected period{' '}
                        <span className="font-semibold text-[var(--color-text)]">
                          {formatPeriod(selectedWithdrawal.periodFrom, selectedWithdrawal.periodTo)}
                        </span>{' '}
                        · payout {formatMoney(selectedWithdrawal.amountLkr)}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[var(--color-navy-border)] px-6 py-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="payment-history-header__btn payment-history-header__btn--ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedWithdrawal}
                  onClick={() => {
                    if (selectedWithdrawal) {
                      onContinue(selectedWithdrawal);
                    }
                  }}
                  className="payment-history-header__btn payment-history-header__btn--primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  Continue to Process Payment
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
