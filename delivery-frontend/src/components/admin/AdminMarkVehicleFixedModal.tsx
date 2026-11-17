'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { adminFetch } from '@/lib/adminApi';
import { displayRideId } from '@/lib/deliveryDisplay';
import { formatDateTime } from '@/lib/datetime';

export type AdminVehicleBreakdownRow = {
  id: string;
  driverId: string;
  jobId: string;
  storeId: string;
  reportedAt: string;
  reportedLat: number;
  reportedLng: number;
  note?: string | null;
  driver?: { id: string; name: string; phone?: string | null; vehicleNumber?: string | null };
  job?: { id: string; rideCode?: string | null; title?: string | null };
};

type Props = {
  row: AdminVehicleBreakdownRow | null;
  storeId?: string;
  onClose: () => void;
  onFixed: () => void;
};

export default function AdminMarkVehicleFixedModal({ row, storeId, onClose, onFixed }: Props) {
  const [comment, setComment] = useState('');
  const trimmed = comment.trim();
  const valid = trimmed.length >= 3;

  const fixMutation = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
      return adminFetch(`/admin/drivers/${row.driverId}/vehicle-fixed${qs}`, {
        method: 'POST',
        body: JSON.stringify({ comment: trimmed }),
      });
    },
    onSuccess: () => {
      toast.success('Vehicle marked as fixed');
      onFixed();
      onClose();
      setComment('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not mark vehicle fixed');
    },
  });

  if (!row) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md space-y-4 p-5">
        <h3 className="text-lg font-semibold text-fg">Mark vehicle fixed</h3>
        <p className="text-sm text-muted">
          Rider: <span className="text-fg font-medium">{row.driver?.name ?? row.driverId}</span>
          {' · '}
          Ride {displayRideId(row.job?.rideCode, row.jobId)}
        </p>
        <p className="text-xs text-muted">Reported {formatDateTime(row.reportedAt)}</p>
        <label className="block text-sm text-muted">
          Comment <span className="text-orange-400">*</span>
          <textarea
            className="input mt-1 min-h-[88px] w-full resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            placeholder="e.g. Confirmed with rider by phone — bike repaired at roadside"
          />
        </label>
        {trimmed.length > 0 && trimmed.length < 3 ? (
          <p className="text-xs text-orange-400">At least 3 characters required.</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={fixMutation.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!valid || fixMutation.isPending}
            onClick={() => fixMutation.mutate()}
          >
            {fixMutation.isPending ? 'Saving…' : 'Mark fixed'}
          </button>
        </div>
      </div>
    </div>
  );
}