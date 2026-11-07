'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shortBranchName } from '@/lib/branchName';

export type DeliveryAccessLogEntry = {
  id: string;
  storeId: string;
  branchName: string;
  action: string;
  changedBy: string;
  reason?: string | null;
  date: string;
  ordersAtChange: number;
  status: string;
};

type Props = {
  entries: DeliveryAccessLogEntry[];
  loading?: boolean;
  pageSize?: number;
};

const PAGE_SIZE = 10;

function statusBadgeClass(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') return 'bg-emerald-500/15 text-emerald-500';
  if (normalized === 'disabled') return 'bg-red-500/15 text-red-400';
  return 'bg-navy-light text-muted';
}

export default function DeliveryAccessHistoryLog({
  entries,
  loading,
  pageSize = PAGE_SIZE,
}: Props) {
  const rows = Array.isArray(entries) ? entries : [];
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const visibleRows = useMemo(() => {
    const start = safePage * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage, pageSize]);

  if (loading) {
    return (
      <div className="card flex min-h-[240px] items-center justify-center text-sm text-muted">
        Loading change history…
      </div>
    );
  }

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="border-b border-navy-border px-5 py-4">
        <h2 className="text-sm font-semibold text-fg">Change History</h2>
        <p className="mt-0.5 text-xs text-muted">Delivery access enable / disable audit log</p>
      </div>
      {rows.length === 0 ? (
        <div className="flex min-h-[220px] flex-1 items-center justify-center p-5 text-sm text-muted">
          No delivery access changes recorded yet
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy-border text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Action</th>
                  <th className="px-3 py-3 font-semibold">Changed By</th>
                  <th className="px-3 py-3 font-semibold">Reason</th>
                  <th className="px-3 py-3 font-semibold">Orders</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((entry) => (
                  <tr key={entry.id} className="border-b border-navy-border/60 last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-muted">
                      {format(new Date(entry.date), 'd MMM yyyy')}
                    </td>
                    <td className="px-3 py-3 font-medium text-fg">
                      {shortBranchName(entry.branchName)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          entry.action === 'ENABLED'
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-red-500/15 text-red-400'
                        }`}
                      >
                        {entry.action === 'ENABLED' ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td
                      className="max-w-[100px] truncate px-3 py-3 text-muted"
                      title={entry.changedBy}
                    >
                      {entry.changedBy}
                    </td>
                    <td
                      className="max-w-[140px] truncate px-3 py-3 text-muted"
                      title={entry.reason ?? undefined}
                    >
                      {entry.reason?.trim() ? entry.reason : '—'}
                    </td>
                    <td className="px-3 py-3 font-bold tabular-nums text-fg">
                      {entry.ordersAtChange}/mo
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(entry.status)}`}
                      >
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-navy-border/60 px-5 py-3">
            <p className="text-xs text-muted">
              Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, rows.length)} of{' '}
              {rows.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs"
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span className="text-xs font-medium text-muted">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
