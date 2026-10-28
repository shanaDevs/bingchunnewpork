'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';
import { formatMoney } from '@/lib/receipt';
import type { SettlementPreview } from '@/components/admin/PlatformEarningsMonthDetail';

type Props = {
  open: boolean;
  onClose: () => void;
  calendarMonth: string | null;
  onSettled: () => void;
};

function formatMonthLabel(calendarMonth: string) {
  const [year, month] = calendarMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-LK', {
    month: 'long',
    year: 'numeric',
  });
}

function formatPeriod(from: string | null, to: string | null) {
  if (!from || !to) return 'Period unavailable';
  const fromDate = new Date(from).toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
  });
  const toDate = new Date(to).toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${fromDate} – ${toDate}`;
}

function centsToMoney(cents: number) {
  return formatMoney(cents / 100);
}

async function fetchSettlementPreview(calendarMonth: string): Promise<SettlementPreview> {
  const res = await fetch(`${getApiBaseUrl()}/admin/platform-earnings/${calendarMonth}/preview`, {
    headers: adminAuthHeaders(), credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to load settlement preview');
  return json.data ?? json;
}

function PreviewBranchSection({
  branch,
}: {
  branch: SettlementPreview['branches'][number];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-navy-border/70 bg-navy/30">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-sm font-medium text-white">{branch.branchLabel} Branch</span>
          <span className="text-xs text-muted">({branch.payoutCount})</span>
        </div>
        <span className="text-sm font-semibold text-brand tabular-nums">
          {centsToMoney(branch.totalEarned)}
        </span>
      </button>
      {expanded && (
        <div className="divide-y divide-navy-border border-t border-navy-border">
          {branch.items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-white">{item.payoutLabel}</p>
                <p className="text-xs text-muted">{formatPeriod(item.periodFrom, item.periodTo)}</p>
                {item.carriedForward && item.calendarMonth && (
                  <p className="mt-0.5 text-[10px] text-amber-300">
                    Carried from {formatMonthLabel(item.calendarMonth)}
                  </p>
                )}
              </div>
              <p className="shrink-0 text-sm tabular-nums text-fg">{centsToMoney(item.totalEarned)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlatformSettleModal({
  open,
  onClose,
  calendarMonth,
  onSettled,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const onCloseRef = useRef(onClose);

  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
  } = useQuery({
    queryKey: ['platform-earnings-settle-preview', calendarMonth],
    queryFn: () => fetchSettlementPreview(calendarMonth!),
    enabled: open && !!calendarMonth,
  });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setNotes('');
    setError('');
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

  async function handleConfirm() {
    if (!calendarMonth) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/admin/platform-earnings/${calendarMonth}/settle`,
        {
          method: 'POST',
          headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({ notes: notes.trim() || undefined }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || 'Failed to settle month');
      }
      onSettled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to settle month');
    } finally {
      setSubmitting(false);
    }
  }

  if (!portalReady) return null;

  const monthLabel = calendarMonth ? formatMonthLabel(calendarMonth) : '';
  const loadError =
    previewError instanceof Error ? previewError.message : previewError ? String(previewError) : '';

  return createPortal(
    <AnimatePresence>
      {open && calendarMonth && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close settlement preview"
            onClick={() => !submitting && onClose()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-settle-title"
            className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-navy-border bg-navy-light shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-navy-border bg-navy-light px-5 py-4">
              <div>
                <h2 id="platform-settle-title" className="text-lg font-bold text-white">
                  Confirm Monthly Settlement
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Review {monthLabel} platform earnings before marking as settled / withdrawn.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              {previewLoading ? (
                <div className="flex items-center justify-center py-12 text-muted">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading settlement preview…
                </div>
              ) : loadError ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {loadError}
                </div>
              ) : preview ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-navy-border bg-navy/60 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted">Commission</p>
                      <p className="mt-1 font-semibold text-white tabular-nums">
                        {centsToMoney(preview.totals.totalCommission)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-navy-border bg-navy/60 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted">Convenience</p>
                      <p className="mt-1 font-semibold text-white tabular-nums">
                        {centsToMoney(preview.totals.totalConvenienceFee)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-brand/30 bg-brand/10 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-brand">Total to Settle</p>
                      <p className="mt-1 font-semibold text-white tabular-nums">
                        {centsToMoney(preview.totals.totalEarned)}
                      </p>
                    </div>
                  </div>

                  {preview.carriedForwardItems.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                      <p className="font-medium">
                        {preview.carriedForwardItems.length} payout
                        {preview.carriedForwardItems.length === 1 ? '' : 's'} carried forward from earlier
                        months
                      </p>
                      <p className="mt-1 text-xs text-amber-200/80">
                        Total carried:{' '}
                        {centsToMoney(
                          preview.carriedForwardItems.reduce((sum, item) => sum + item.totalEarned, 0),
                        )}
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl border border-navy-border bg-navy/40">
                    <div className="border-b border-navy-border px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        By branch ({preview.branches.length}) · {preview.items.length} payout
                        {preview.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                      {preview.branches.map((branch) => (
                        <PreviewBranchSection key={branch.storeId} branch={branch} />
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              <div>
                <label htmlFor="settle-notes" className="mb-1.5 block text-xs font-medium text-muted">
                  Settlement notes (optional)
                </label>
                <textarea
                  id="settle-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Transferred to DartCodes operating account on 31 Jul"
                  className="w-full rounded-xl border border-navy-border bg-navy px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-brand focus:outline-none"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-navy-border pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-xl border border-navy-border px-4 py-2 text-sm text-muted hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting || previewLoading || !preview || preview.items.length === 0}
                  className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Settling…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Confirm Settlement
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
