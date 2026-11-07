'use client';

import { useEffect, useState } from 'react';
import { Banknote, Loader2, MessageSquare, Store, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/receipt';
import { withAdminCredentials } from '@/lib/adminSession';
import type { WithdrawalRow } from './WalletWithdrawalTable';

type Props = {
  open: boolean;
  withdrawal: WithdrawalRow | null;
  branchName?: string;
  apiBase: string;
  onClose: () => void;
  onRejected: () => void | Promise<void>;
};

export default function WalletRejectWithdrawalModal({
  open,
  withdrawal,
  branchName,
  apiBase,
  onClose,
  onRejected,
}: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const branchLabel = branchName ?? withdrawal?.storeId ?? 'Branch';
  const requestedLkr = withdrawal ? withdrawal.amount / 100 : 0;

  useEffect(() => {
    if (!open) {
      setReason('');
      setSubmitting(false);
      setError('');
    }
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !submitting) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawal) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(
        `${apiBase}/admin/wallet/withdrawals/${withdrawal.id}/reject`,
        withAdminCredentials({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() || undefined }),
        }),
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Reject failed');

      toast.success('Withdrawal rejected');
      await onRejected();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'gap-0 overflow-hidden border border-[var(--color-navy-border)] p-0 shadow-2xl sm:max-w-md',
          'bg-[var(--color-navy-card,#1e293b)]',
        )}
        showCloseButton={!submitting}
      >
        <div
          className="h-1 bg-gradient-to-r from-red-500 via-red-400/70 to-transparent"
          aria-hidden
        />

        <form onSubmit={handleSubmit}>
          <div className="px-6 pb-2 pt-6">
            <div className="flex items-start gap-4">
              <div className="confirm-dialog__icon confirm-dialog__icon--danger flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                <XCircle size={22} strokeWidth={2.25} />
              </div>

              <div className="min-w-0 pt-0.5">
                <DialogTitle className="text-lg font-bold leading-snug text-[var(--color-text)]">
                  Reject payout
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  This request will be marked rejected.
                </DialogDescription>
              </div>
            </div>

            <div className="mt-5 grid gap-3 rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/35 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-subtle)] text-[var(--color-brand)]">
                  <Store size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Branch
                  </p>
                  <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                    {branchLabel}
                  </p>
                </div>
              </div>

              <div className="h-px bg-[var(--color-navy-border)]" />

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Banknote size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Amount
                  </p>
                  <p className="text-lg font-bold tabular-nums text-[var(--color-text)]">
                    {formatMoney(requestedLkr)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <label
                htmlFor="withdrawal-reject-reason"
                className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                <MessageSquare size={14} className="text-[var(--color-brand)]" />
                Reason
              </label>
              <textarea
                id="withdrawal-reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                maxLength={500}
                rows={3}
                placeholder="Optional"
                className="input-field w-full resize-none text-sm"
              />
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="mt-4 border-t border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/20 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="min-w-[96px]"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={submitting || !withdrawal}
              className="confirm-dialog__btn-danger inline-flex min-w-[112px] items-center justify-center gap-2 rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Rejecting…
                </>
              ) : (
                <>
                  <XCircle size={15} />
                  Reject
                </>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
