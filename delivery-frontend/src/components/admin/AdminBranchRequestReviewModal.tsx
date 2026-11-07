'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { adminBadgeClass, type AdminBadgeVariant } from '@/lib/adminBadges';
import { formatDateTime } from '@/lib/datetime';
import { formatBranchName } from '@/lib/deliveryDisplay';
import { cn } from '@/lib/utils';

export type AdminDriverBranchRequest = {
  id: string;
  driverId: string;
  type: string;
  toStoreId: string;
  toStoreName?: string | null;
  fromStoreId?: string | null;
  fromStoreName?: string | null;
  reason?: string | null;
  status: string;
  reviewNote?: string | null;
  createdAt: string;
  driver?: { name?: string } | null;
};

/** Admin rejection text shown to riders when status is REJECTED. */
export function branchRequestRejectionReason(
  row: Pick<AdminDriverBranchRequest, 'status' | 'reviewNote'>,
): string | null {
  if (row.status !== 'REJECTED') return null;
  const note = row.reviewNote?.trim();
  return note || null;
}

export function branchRequestTypeLabel(type: string): string {
  switch (type) {
    case 'ADD_BRANCH':
      return 'Add branch';
    case 'CHANGE_BRANCH':
      return 'Change home';
    case 'REMOVE_BRANCH':
      return 'Remove branch';
    default:
      return type;
  }
}

export function branchRequestStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    default:
      return status;
  }
}

export function branchRequestStatusVariant(status: string): AdminBadgeVariant {
  switch (status) {
    case 'PENDING':
      return 'yellow';
    case 'APPROVED':
      return 'green';
    case 'REJECTED':
      return 'red';
    default:
      return 'neutral';
  }
}

function namedBranch(name?: string | null, id?: string | null): string {
  const formatted = formatBranchName(name);
  if (formatted !== '—') return formatted;
  return id?.trim() || '—';
}

/** Plain-language request line plus optional home/from context. */
export function branchRequestCopy(
  row: Pick<
    AdminDriverBranchRequest,
    'type' | 'toStoreId' | 'toStoreName' | 'fromStoreId' | 'fromStoreName'
  >,
): { summary: string; extra: string | null } {
  const target = namedBranch(row.toStoreName, row.toStoreId);
  const home = namedBranch(row.fromStoreName, row.fromStoreId);
  const homeLine = home !== '—' ? home : null;
  switch (row.type) {
    case 'ADD_BRANCH':
      return { summary: `Add ${target}`, extra: homeLine ? `Home: ${homeLine}` : null };
    case 'CHANGE_BRANCH':
      return { summary: `Change home to ${target}`, extra: homeLine ? `From ${homeLine}` : null };
    case 'REMOVE_BRANCH':
      return { summary: `Remove ${target}`, extra: homeLine ? `Home: ${homeLine}` : null };
    default:
      return { summary: target, extra: homeLine ? `Home: ${homeLine}` : null };
  }
}

type Props = {
  request: AdminDriverBranchRequest | null;
  canReview: boolean;
  submitting: boolean;
  onClose: () => void;
  onReview: (status: 'APPROVED' | 'REJECTED', reviewNote?: string) => void;
};

export default function AdminBranchRequestReviewModal({
  request,
  canReview,
  submitting,
  onClose,
  onReview,
}: Props) {
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote('');
  }, [request?.id]);

  const pending = request?.status === 'PENDING';
  const showActions = Boolean(request && canReview && pending);

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent
        className={cn(
          'gap-0 overflow-hidden border border-navy-border p-0 shadow-2xl sm:max-w-md',
          'bg-[var(--color-navy-card,#1e293b)]',
        )}
        showCloseButton={!submitting}
      >
        <div className="px-6 pb-5 pt-6">
          <DialogTitle className="text-lg font-bold text-fg">Branch request</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">
            {pending
              ? 'Review this rider request before approving or rejecting.'
              : 'This request has already been reviewed.'}
          </DialogDescription>

          {request && (
            <dl className="mt-4 space-y-0 rounded-xl border border-navy-border bg-navy-light/30 px-4">
              <DetailRow label="Driver" value={request.driver?.name ?? request.driverId} />
              <DetailRow label="Type" value={branchRequestTypeLabel(request.type)} />
              <DetailRow label="Request" value={branchRequestCopy(request).summary} />
              {namedBranch(request.fromStoreName, request.fromStoreId) !== '—' && (
                <DetailRow
                  label="Current home"
                  value={namedBranch(request.fromStoreName, request.fromStoreId)}
                />
              )}
              <DetailRow label="Driver reason" value={request.reason?.trim() || '—'} />
              <DetailRow label="Requested" value={formatDateTime(request.createdAt)} />
              <DetailRow
                label="Status"
                value={
                  <span className={adminBadgeClass(branchRequestStatusVariant(request.status))}>
                    {branchRequestStatusLabel(request.status)}
                  </span>
                }
              />
              {!pending && request.status === 'REJECTED' && (
                <DetailRow
                  label="Rejection reason"
                  value={branchRequestRejectionReason(request) || '—'}
                />
              )}
              {!pending && request.status === 'APPROVED' && request.reviewNote?.trim() && (
                <DetailRow label="Review note" value={request.reviewNote.trim()} />
              )}
            </dl>
          )}

          {showActions && (
            <div className="mt-4">
              <label htmlFor="branch-request-review-note" className="mb-1.5 block text-xs text-muted">
                Rejection reason (optional)
              </label>
              <textarea
                id="branch-request-review-note"
                value={note}
                onChange={(e) => { if (e.target.value.length <= 500) setNote(e.target.value); }}
                disabled={submitting}
                rows={3}
                maxLength={500}
                placeholder="Shown to the rider if you reject"
                className="input-field w-full resize-none text-sm"
              />
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-outline px-3 py-1.5 text-sm" onClick={onClose} disabled={submitting}>
              Close
            </button>
            {showActions && (
              <>
                <button
                  type="button"
                  className="btn-outline px-3 py-1.5 text-sm"
                  disabled={submitting}
                  onClick={() => onReview('REJECTED', note.trim() || undefined)}
                >
                  {submitting ? <Loader2 size={14} className="inline animate-spin" /> : 'Reject'}
                </button>
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-sm"
                  disabled={submitting}
                  onClick={() => onReview('APPROVED')}
                >
                  Approve
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-navy-border/60 py-2.5 last:border-0">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}
