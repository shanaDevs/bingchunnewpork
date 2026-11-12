'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { getAdminSession, isSuperAdmin } from '@/lib/adminAuth';
import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  walletSecurityAuditLabel,
  walletSecurityAuditScope,
} from '@/lib/walletSecurityAuditLabels';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';

type AuditRow = {
  id: string;
  event: string;
  outcome: string;
  actorId: string | null;
  actorRole: string | null;
  storeId: string | null;
  storeName: string | null;
  amountCents: number | null;
  withdrawalId: string | null;
  payoutId: string | null;
  clientIp: string | null;
  reason: string | null;
  reference: string | null;
  orderNumber: string | null;
  createdAt: string;
};

const PAGE_SIZE = 50;

function formatBranch(row: AuditRow): string {
  if (row.storeName) return branchDisplayName(row.storeName);
  if (row.storeId) return row.storeId;
  return '—';
}

function formatReference(row: AuditRow): string {
  const parts: string[] = [];
  if (row.withdrawalId) parts.push(`withdrawal ${row.withdrawalId.slice(0, 8)}`);
  if (row.payoutId) parts.push(`payout ${row.payoutId.slice(0, 8)}`);
  if (row.orderNumber) parts.push(`order ${row.orderNumber}`);
  if (row.reference) parts.push(row.reference);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export default function WalletSecurityAuditPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(pageNum),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`${getApiBaseUrl()}/admin/wallet/security-audit-logs?${qs}`, {
        credentials: 'include',
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load audit log');
      setRows(json.data?.rows ?? []);
      setTotal(json.data?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const session = getAdminSession();
    if (!session) {
      router.replace('/admin/login');
      return;
    }
    if (!isSuperAdmin(session) && session.role !== 'DELIVERY_ADMIN') {
      router.replace('/admin/wallet');
      return;
    }
    void load(page);
  }, [load, page, router]);

  return (
    <div className="admin-panel p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/wallet" className="text-muted hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Shield className="w-5 h-5 text-pink" />
        <h1 className="text-xl font-semibold">System wallet security audit</h1>
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-elevated)] text-left">
                <tr>
                  <th className="p-2 whitespace-nowrap">Time</th>
                  <th className="p-2 whitespace-nowrap">Scope</th>
                  <th className="p-2 whitespace-nowrap">Branch</th>
                  <th className="p-2 whitespace-nowrap">Operation</th>
                  <th className="p-2">Outcome</th>
                  <th className="p-2">Actor</th>
                  <th className="p-2 text-right whitespace-nowrap">Amount (cents)</th>
                  <th className="p-2">Reference</th>
                  <th className="p-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-4 text-muted text-center">
                      No events yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--color-border)]">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="p-2 whitespace-nowrap text-xs">
                        {walletSecurityAuditScope(row.event)}
                      </td>
                      <td
                        className="p-2 max-w-[12rem] truncate text-xs"
                        title={formatBranch(row)}
                      >
                        {formatBranch(row)}
                      </td>
                      <td className="p-2 text-xs">{walletSecurityAuditLabel(row.event)}</td>
                      <td className="p-2">{row.outcome}</td>
                      <td className="p-2 text-xs">
                        {row.actorRole ?? '—'}
                        {row.actorId ? ` · ${row.actorId.slice(0, 8)}` : ''}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {row.amountCents ?? '—'}
                      </td>
                      <td className="p-2 max-w-[14rem] truncate text-xs" title={formatReference(row)}>
                        {formatReference(row)}
                      </td>
                      <td className="p-2 max-w-xs truncate">{row.reason ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>
                Page {page} of {totalPages} · {total.toLocaleString()} events
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[var(--color-border)] p-2 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-[var(--color-border)] p-2 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
