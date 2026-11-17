'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bike, CheckCircle, FileText, ImageIcon, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { deliveryWalletFetch } from '@/lib/deliveryWalletApi';
import { useDeliveryWalletUnlockToken } from '@/components/admin/DeliveryWalletUnlockContext';
import { formatMoney } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { cn } from '@/lib/utils';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import { openAdminProtectedFile } from '@/lib/adminProtectedFile';
import {
  deliveryPayoutStatementFilename,
  downloadDeliveryPayoutStatement,
} from '@/lib/deliveryPayoutStatementDownload';
import {
  parseDeliveryPayoutBreakdown,
  type DeliveryPayoutHistoryRow,
} from '@/lib/deliveryPayoutTypes';

type Props = {
  onView: (row: DeliveryPayoutHistoryRow) => void;
};

type PayoutListResponse = {
  items: DeliveryPayoutHistoryRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

function paymentLabel(method: string | null | undefined): string {
  if (!method) return '—';
  if (method === 'BANK_TRANSFER') return 'Bank transfer';
  if (method === 'CASH') return 'Cash';
  if (method === 'CHECK') return 'Check';
  return method.replace(/_/g, ' ');
}

function formatPaidDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DeliveryPayoutsPaidPanel({ onView }: Props) {
  const unlockToken = useDeliveryWalletUnlockToken();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-wallet-payouts', 'APPROVED', page, pageSize, unlockToken],
    queryFn: () =>
      deliveryWalletFetch<PayoutListResponse>(
        `/admin/delivery-wallet/payouts?page=${page}&limit=${pageSize}&status=APPROVED`,
        unlockToken,
      ),
    enabled: Boolean(unlockToken),
  });

  const rows = data?.items ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, data?.pagination.pages ?? 1);
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, total);

  const firstBreakdown = rows.length > 0 ? parseDeliveryPayoutBreakdown(rows[0].breakdown) : null;
  const platformFeePercent = firstBreakdown?.platformFeePercent;
  const gatewayFeePercent = firstBreakdown?.gatewayFeePercent;

  async function openProof(row: DeliveryPayoutHistoryRow) {
    try {
      const access = await deliveryWalletFetch<{ url: string; legacyLocal?: boolean }>(
        `/admin/delivery-wallet/payouts/${encodeURIComponent(row.id)}/proof-url`,
        unlockToken,
      );
      if (access.legacyLocal) {
        await openAdminProtectedFile(access.url);
        return;
      }
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load payment proof');
    }
  }

  async function downloadReceipt(row: DeliveryPayoutHistoryRow) {
    setDownloadBusyId(row.id);
    try {
      await downloadDeliveryPayoutStatement(
        row.id,
        unlockToken,
        deliveryPayoutStatementFilename(row.periodFrom, row.periodTo),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the payout statement');
    } finally {
      setDownloadBusyId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)]">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]">
          <Loader2 size={18} className="animate-spin text-[var(--color-brand)]" />
          Loading paid delivery payouts…
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <CheckCircle size={28} />
          </div>
          <p className="text-base font-semibold text-[var(--color-text)]">No paid delivery payouts</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
            Paid 30-day delivery periods appear here after Super Admin payout.
          </p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Paid delivery payouts</h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {total} period{total === 1 ? '' : 's'} · 30-day cycle
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-3 py-2.5 font-semibold">Partner</th>
                  <th className="px-3 py-2.5 font-semibold">Period</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Gross</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    Platform fee
                    {typeof platformFeePercent === 'number' ? ` (${platformFeePercent}%)` : ''}
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    Gateway fee
                    {typeof gatewayFeePercent === 'number' ? ` (${gatewayFeePercent}%)` : ''}
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">Net paid</th>
                  <th className="px-3 py-2.5 font-semibold">Paid</th>
                  <th className="px-3 py-2.5 font-semibold">Payment</th>
                  <th className="px-3 py-2.5 font-semibold">Proof</th>
                  <th className="px-3 py-2.5 font-semibold">Receipt</th>
                  <th className="px-3 py-2.5 text-right font-semibold">View</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const summary = parseDeliveryPayoutBreakdown(row.breakdown);
                  const netPaid =
                    summary?.netForDelivery ?? row.amountLkr ?? row.amount;
                  return (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--color-navy-border)]/70 last:border-b-0 hover:bg-[var(--color-input-bg)]/40"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 font-medium text-[var(--color-text)]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/12 text-sky-500">
                          <Bike size={14} strokeWidth={2.25} />
                        </span>
                        Delivery Partner
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                      {formatBiweeklyPeriodLabel(row.periodFrom, row.periodTo)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
                      {typeof summary?.grossDeliveryFee === 'number'
                        ? formatMoney(summary.grossDeliveryFee)
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-muted)]">
                      {typeof summary?.platformFee === 'number'
                        ? formatMoney(summary.platformFee)
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-muted)]">
                      {typeof summary?.gatewayFee === 'number'
                        ? formatMoney(summary.gatewayFee)
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]">
                      {formatMoney(netPaid)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                      {formatPaidDate(row.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-[var(--color-text)]">
                      {paymentLabel(row.paymentMethod)}
                    </td>
                    <td className="px-3 py-3">
                      {row.hasProof ? (
                        <button
                          type="button"
                          onClick={() => void openProof(row)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand)] hover:underline"
                        >
                          <ImageIcon size={13} />
                          View
                        </button>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={downloadBusyId === row.id}
                        onClick={() => void downloadReceipt(row)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {downloadBusyId === row.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <FileText size={13} />
                        )}
                        View receipt
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onView(row)}
                        className={cn(
                          'inline-flex items-center rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
                          'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
                        )}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AdminTablePagination
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalItems={total}
            safePage={safePage}
            totalPages={totalPages}
            pageList={buildPageList(safePage, totalPages)}
            onPageChange={setPage}
            itemLabel="payouts"
            ariaLabel="Paid delivery payouts pagination"
            className="border-t border-[var(--color-navy-border)]"
          />
        </>
      )}
    </div>
  );
}
