'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';

type ReportTab = 'summary' | 'audit' | 'adjustments';

interface ReportItem {
  productId: string;
  name: string;
  category: { name: string };
  weeklyBaseQty: number;
  weeklyRemainingQty: number;
  sold: number;
  remaining: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  lowStockHits: Array<{ createdAt: string; qtyAfter: number }>;
  depletionHits: Array<{ createdAt: string; qtyAfter: number }>;
  restockHistory: Array<{
    createdAt: string;
    qtyChange: number;
    note?: string | null;
    adminUserId?: string | null;
    adminUserName?: string | null;
  }>;
}

interface AuditLog {
  id: string;
  productName: string;
  storeName: string;
  changeType: string;
  qtyBefore: number;
  qtyChange: number;
  qtyAfter: number;
  adminUserName?: string | null;
  orderNumber?: string | null;
  note?: string | null;
  createdAt: string;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function StockReportsPanel({ storeId }: { storeId: string }) {
  const [tab, setTab] = useState<ReportTab>('summary');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const reportQuery = useQuery({
    queryKey: ['admin-stock-report', storeId, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ storeId });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return adminFetch<{ store: { name: string }; items: ReportItem[] }>(`/admin/stock/report?${params}`);
    },
    enabled: Boolean(storeId),
  });

  const auditQuery = useQuery({
    queryKey: ['admin-stock-audit', storeId, from, to, tab],
    queryFn: () => {
      const params = new URLSearchParams({ storeId, limit: '200' });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (tab === 'adjustments') params.set('changeType', 'MANUAL_ADJUSTMENT');
      return adminFetch<{ logs: AuditLog[] }>(`/admin/stock/audit-logs?${params}`);
    },
    enabled: Boolean(storeId && tab !== 'summary'),
  });

  const items = reportQuery.data?.items ?? [];
  const auditLogs = auditQuery.data?.logs ?? [];

  const lowStockProducts = useMemo(
    () => items.filter((i) => i.lowStockHits.length > 0 || i.isLowStock),
    [items],
  );

  const restockEvents = useMemo(
    () =>
      items
        .flatMap((item) =>
          item.restockHistory.map((entry) => ({
            ...entry,
            productId: item.productId,
            productName: item.name,
          })),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50),
    [items],
  );

  function exportSummaryCsv() {
    downloadCsv('weekly-stock-summary.csv', [
      ['Product', 'Category', 'Weekly Base', 'Sold', 'Remaining', 'Low Stock', 'Out of Stock'],
      ...items.map((i) => [
        i.name,
        i.category.name,
        i.weeklyBaseQty,
        i.sold,
        i.remaining,
        i.isLowStock ? 'Yes' : 'No',
        i.isOutOfStock ? 'Yes' : 'No',
      ]),
    ]);
    toast.success('Summary exported');
  }

  function exportAuditCsv() {
    downloadCsv(`stock-audit-${tab}.csv`, [
      ['Date', 'Product', 'Branch', 'Type', 'Before', 'Change', 'After', 'User', 'Order', 'Note'],
      ...auditLogs.map((l) => [
        new Date(l.createdAt).toLocaleString(),
        l.productName,
        l.storeName,
        l.changeType,
        l.qtyBefore,
        l.qtyChange,
        l.qtyAfter,
        l.adminUserName ?? '',
        l.orderNumber ?? '',
        l.note ?? '',
      ]),
    ]);
    toast.success('Audit log exported');
  }

  if (!storeId) {
    return <p className="text-muted">Select a branch to view stock reports.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-muted text-sm">
            Weekly summary, depletion logs, and manual adjustment audit trail
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2 shrink-0"
          onClick={tab === 'summary' ? exportSummaryCsv : exportAuditCsv}
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="date" className="input-field max-w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input-field max-w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="flex gap-2">
        {([
          ['summary', 'Weekly Summary', FileText],
          ['audit', 'All Audit Logs', History],
          ['adjustments', 'Manual Adjustments', History],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === key ? 'bg-brand text-white' : 'bg-navy-light text-muted hover:text-fg'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-border text-left text-muted">
                    <th className="p-3 font-medium">Product</th>
                    <th className="p-3 font-medium">Base</th>
                    <th className="p-3 font-medium">Sold</th>
                    <th className="p-3 font-medium">Remaining</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportQuery.isLoading ? (
                    <tr><td colSpan={5} className="p-4 text-muted">Loading…</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-muted">No data</td></tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.productId} className="border-b border-navy-border/60">
                        <td className="p-3">
                          <p className="font-medium text-fg">{item.name}</p>
                          <p className="text-xs text-muted">{item.category.name}</p>
                        </td>
                        <td className="p-3">{item.weeklyBaseQty}</td>
                        <td className="p-3">{item.sold}</td>
                        <td className="p-3 font-semibold">{item.remaining}</td>
                        <td className="p-3">
                          {item.isOutOfStock ? (
                            <span className="text-xs font-semibold text-red-400">Out of stock</span>
                          ) : item.isLowStock ? (
                            <span className="text-xs font-semibold text-amber-400">Low stock</span>
                          ) : (
                            <span className="text-xs font-semibold text-green-400">OK</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {restockEvents.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold text-fg mb-3">Restock history</h2>
              <ul className="space-y-2 text-sm">
                {restockEvents.map((entry) => (
                  <li
                    key={`${entry.productId}-${entry.createdAt}-${entry.qtyChange}`}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-navy-border/40 pb-2"
                  >
                    <span className="text-muted whitespace-nowrap text-xs">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                    <span className="font-medium text-fg">{entry.productName}</span>
                    <span className="text-green-400 font-semibold">+{entry.qtyChange}</span>
                    {entry.adminUserName && (
                      <span className="text-muted text-xs">by {entry.adminUserName}</span>
                    )}
                    {entry.note && <span className="text-muted text-xs w-full">{entry.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lowStockProducts.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold text-fg mb-3">Low Stock & Depletion Events</h2>
              <div className="space-y-2 text-sm">
                {lowStockProducts.map((item) => (
                  <div key={item.productId} className="border-b border-navy-border/40 pb-2">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted">
                      Low stock hits: {item.lowStockHits.length} · Depletion hits: {item.depletionHits.length}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab !== 'summary' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-border text-left text-muted">
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Change</th>
                  <th className="p-3 font-medium">After</th>
                  <th className="p-3 font-medium">User / Note</th>
                </tr>
              </thead>
              <tbody>
                {auditQuery.isLoading ? (
                  <tr><td colSpan={6} className="p-4 text-muted">Loading…</td></tr>
                ) : auditLogs.length === 0 ? (
                  <tr><td colSpan={6} className="p-4 text-muted">No audit logs</td></tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-navy-border/60">
                      <td className="p-3 text-muted whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="p-3">{log.productName}</td>
                      <td className="p-3">{log.changeType.replace(/_/g, ' ')}</td>
                      <td className="p-3">{log.qtyChange > 0 ? `+${log.qtyChange}` : log.qtyChange}</td>
                      <td className="p-3">{log.qtyAfter}</td>
                      <td className="p-3 text-muted text-xs">
                        {log.adminUserName && <span>{log.adminUserName}</span>}
                        {log.orderNumber && <span> · Order {log.orderNumber}</span>}
                        {log.note && <p className="mt-0.5">{log.note}</p>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
