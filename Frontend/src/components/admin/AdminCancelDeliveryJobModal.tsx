'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { adminApiJson } from '@/lib/adminApi';
import { confirmDialog } from '@/store/confirmStore';
import { displayRideId } from '@/lib/deliveryDisplay';
import type { DeliveryJobListItem } from '@/components/admin/AdminDeliveryJobsTable';

const MERIT_PRESETS = [
  { value: -5, label: '−5 Pre-pickup default' },
  { value: -2, label: '−2 Late delivery' },
  { value: -10, label: '−10 Serious violation' },
] as const;

type Props = {
  job: DeliveryJobListItem | null;
  storeId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function AdminCancelDeliveryJobModal({ job, storeId, open, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [applyMeritPenalty, setApplyMeritPenalty] = useState(false);
  const [meritDelta, setMeritDelta] = useState<number>(-5);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setReason('');
    setApplyMeritPenalty(false);
    setMeritDelta(-5);
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetForm();
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!job) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      toast.error('Enter a reason (at least 3 characters).');
      return;
    }

    const meritLine =
      applyMeritPenalty && job.driver
        ? ` Merit: ${meritDelta} points for ${job.driver.name}.`
        : '';

    const ok = await confirmDialog({
      title: 'Close this ride?',
      message: `This marks the delivery job as Cancelled and frees the rider to accept new jobs. Customer order statuses are not changed.${meritLine} Reason: ${trimmed}`,
      confirmLabel: 'Close ride',
      cancelLabel: 'Go back',
      variant: 'danger',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
      await adminApiJson(`/admin/delivery-jobs/${encodeURIComponent(job.id)}/cancel${qs}`, {
        method: 'POST',
        body: JSON.stringify({
          reason: trimmed,
          applyMeritPenalty: applyMeritPenalty && !!job.driver,
          ...(applyMeritPenalty && job.driver ? { meritDelta } : {}),
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-delivery-jobs-active'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-delivery-jobs-incomplete'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-delivery-jobs-completed'] }),
      ]);
      toast.success('Delivery ride closed — rider can claim new jobs.');
      resetForm();
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not close ride');
    } finally {
      setSubmitting(false);
    }
  }

  const rideLabel = job ? displayRideId(job.rideCode, job.id) : '';
  const riderLabel = job?.driver?.name ?? 'Unassigned';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close delivery ride</DialogTitle>
          <DialogDescription>
            Closes the job as <strong>Cancelled</strong> only — undelivered orders keep their current
            status. The rider can pick up new jobs after this.
          </DialogDescription>
        </DialogHeader>
        {job ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border border-navy-border bg-navy-light/30 px-3 py-2 text-sm">
              <p>
                <span className="text-muted">Ride:</span>{' '}
                <span className="font-mono font-semibold text-fg">{rideLabel}</span>
              </p>
              <p className="mt-1">
                <span className="text-muted">Rider:</span> <span className="text-fg">{riderLabel}</span>
              </p>
            </div>
            <div>
              <label htmlFor="admin-cancel-reason" className="mb-1 block text-xs font-semibold text-muted">
                Reason (required)
              </label>
              <textarea
                id="admin-cancel-reason"
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-navy-border bg-navy-light px-3 py-2 text-sm text-fg"
                placeholder="e.g. Rider abandoned run; releasing for new assignments"
              />
            </div>
            {job.driver ? (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={applyMeritPenalty}
                    onChange={(ev) => setApplyMeritPenalty(ev.target.checked)}
                    className="rounded border-navy-border"
                  />
                  Reduce rider merit points
                </label>
                {applyMeritPenalty ? (
                  <select
                    value={meritDelta}
                    onChange={(ev) => setMeritDelta(Number(ev.target.value))}
                    className="w-full rounded-lg border border-navy-border bg-navy-light px-3 py-2 text-sm text-fg"
                  >
                    {MERIT_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <button type="button" onClick={() => handleOpenChange(false)} className="btn-outline px-4 py-2 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-primary px-4 py-2 text-sm">
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Closing…
                  </span>
                ) : (
                  'Continue'
                )}
              </button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
