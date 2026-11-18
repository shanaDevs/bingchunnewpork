'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Building2, Download, FileCheck, FileText, ImageIcon, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import DeliveryApprovePayoutModal from '@/components/admin/DeliveryApprovePayoutModal';
import DeliveryWalletPinOverlay from '@/components/admin/DeliveryWalletPinOverlay';
import { DeliveryWalletUnlockProvider } from '@/components/admin/DeliveryWalletUnlockContext';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import { openAdminProtectedFile } from '@/lib/adminProtectedFile';
import { deliveryWalletFetch, unlockDeliveryWallet } from '@/lib/deliveryWalletApi';
import {
  DELIVERY_PAYOUT_STATEMENT_ZIP_MAX,
  deliveryPayoutStatementFilename,
  downloadDeliveryPayoutStatement,
  downloadDeliveryPayoutStatementZip,
} from '@/lib/deliveryPayoutStatementDownload';
import {
  parseDeliveryPayoutBreakdown,
  type DeliveryPayoutHistoryRow,
} from '@/lib/deliveryPayoutTypes';
import { buildPageList } from '@/lib/pagination';
import { formatPayoutPeriodDate } from '@/lib/datetime';
import { formatMoney } from '@/lib/receipt';

type Props = {
  onBack: () => void;
};

type PayoutListResponse = {
  items: DeliveryPayoutHistoryRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

const HISTORY_PAGE_SIZE = 25;

const PAYMENT_METHOD_META: Record<
  string,
  { label: string; icon: LucideIcon; chipClass: string; iconClass: string }
> = {
  BANK_TRANSFER: {
    label: 'Bank transfer',
    icon: Building2,
    chipClass: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
    iconClass: 'text-sky-400',
  },
  CASH: {
    label: 'Cash',
    icon: Banknote,
    chipClass: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
    iconClass: 'text-emerald-400',
  },
  CHECK: {
    label: 'Check',
    icon: FileCheck,
    chipClass: 'bg-amber-500/10 text-amber-200 ring-amber-500/20',
    iconClass: 'text-amber-400',
  },
};

function statusLabel(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'Paid';
    case 'PENDING':
      return 'Pending';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'admin-status-badge--green';
    case 'PENDING':
      return 'admin-status-badge--amber';
    case 'REJECTED':
      return 'admin-status-badge--red';
    default:
      return 'admin-status-badge--neutral';
  }
}

function formatPeriodDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function payoutStatementAvailable(row: DeliveryPayoutHistoryRow): boolean {
  if (row.status === 'APPROVED') return true;
  if (row.status === 'PENDING' && parseDeliveryPayoutBreakdown(row.breakdown)) return true;
  return false;
}

function PaymentCell({ row }: { row: DeliveryPayoutHistoryRow }) {
  if (row.status !== 'APPROVED' || !row.paymentMethod) {
    return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
  }
  const meta = PAYMENT_METHOD_META[row.paymentMethod];
  if (!meta) {
    return <span className="text-xs text-[var(--color-text-muted)]">{row.paymentMethod}</span>;
  }
  const MethodIcon = meta.icon;
  return (
    <div className="min-w-0">
      <span
        className={`inline-flex w-fit max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.chipClass}`}
      >
        <MethodIcon size={13} className={meta.iconClass} />
        {meta.label}
      </span>
      {row.paymentMethod === 'CHECK' && (row.checkNumber?.trim() || row.checkDate) && (
        <p className="mt-1 max-w-[140px] text-[10px] leading-snug text-[var(--color-text-muted)]">
          {row.checkNumber?.trim() && <>#{row.checkNumber.trim()}</>}
          {row.checkNumber?.trim() && row.checkDate && ' · '}
          {row.checkDate && formatPeriodDate(row.checkDate)}
        </p>
      )}
    </div>
  );
}

async function fetchDeliveryPayouts(
  unlockToken: string,
  page: number,
  limit: number,
): Promise<PayoutListResponse> {
  return deliveryWalletFetch<PayoutListResponse>(
    `/admin/delivery-wallet/payouts?page=${page}&limit=${limit}`,
    unlockToken,
  );
}

async function fetchAllDeliveryPayoutRows(unlockToken: string): Promise<DeliveryPayoutHistoryRow[]> {
  const limit = 50;
  const first = await fetchDeliveryPayouts(unlockToken, 1, limit);
  const rows = [...first.items];
  for (let page = 2; page <= first.pagination.pages; page += 1) {
    const next = await fetchDeliveryPayouts(unlockToken, page, limit);
    rows.push(...next.items);
  }
  return rows;
}

export default function DeliveryPayoutHistoryPanel({ onBack }: Props) {
  const [unlockToken, setUnlockToken] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(HISTORY_PAGE_SIZE);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [reviewRow, setReviewRow] = useState<DeliveryPayoutHistoryRow | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['delivery-wallet-payouts', 'history', page, pageSize, unlockToken],
    queryFn: () => fetchDeliveryPayouts(unlockToken, page, pageSize),
    enabled: Boolean(unlockToken),
    retry: false,
  });

  const sessionExpired =
    Boolean(unlockToken) && error instanceof Error && /pin required/i.test(error.message);

  async function submitUnlock() {
    const value = pin.trim();
    if (!value || pinSubmitting) return;
    setPinSubmitting(true);
    setPinError('');
    try {
      const token = await unlockDeliveryWallet(value);
      setUnlockToken(token);
      setPin('');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setPinSubmitting(false);
    }
  }

  if (!unlockToken || sessionExpired) {
    return (
      <DeliveryWalletPinOverlay
        password={pin}
        showPassword={showPin}
        error={pinError}
        submitting={pinSubmitting}
        title="Enter admin password"
        description="Unlock delivery wallet data to view paid delivery payouts."
        onPasswordChange={(value) => {
          setPin(value);
          setPinError('');
        }}
        onToggleShow={() => setShowPin((value) => !value)}
        onSubmit={() => void submitUnlock()}
        onBack={onBack}
      />
    );
  }

  const rows = data?.items ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, data?.pagination.pages ?? 1);
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, total);

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
    if (!payoutStatementAvailable(row)) return;
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

  async function downloadAllApproved() {
    setDownloadingAll(true);
    try {
      const allRows = await fetchAllDeliveryPayoutRows(unlockToken);
      const approved = allRows.filter((row) => row.status === 'APPROVED');
      if (approved.length === 0) {
        toast.error('No paid payouts to download.');
        return;
      }
      if (approved.length > DELIVERY_PAYOUT_STATEMENT_ZIP_MAX) {
        toast.error(
          `Download all is limited to ${DELIVERY_PAYOUT_STATEMENT_ZIP_MAX} payouts. Contact support if you need more.`,
        );
        return;
      }
      await downloadDeliveryPayoutStatementZip(
        approved.map((row) => row.id),
        unlockToken,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download payout statements');
    } finally {
      setDownloadingAll(false);
    }
  }

  return (
    <DeliveryWalletUnlockProvider token={unlockToken}>
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-[var(--color-navy-border)] px-4 py-3">
          <button
            type="button"
            disabled={downloadingAll || isLoading}
            onClick={() => void downloadAllApproved()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloadingAll ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Download all
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]">
          <Loader2 size={18} className="animate-spin text-[var(--color-brand)]" />
          Loading payouts…
        </div>
      )}

      {!isLoading && isError && (
        <div className="px-5 py-16 text-center text-sm text-[var(--color-text-muted)]">
          Could not load delivery payouts.
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="px-5 py-16 text-center text-sm text-[var(--color-text-muted)]">
          No delivery payouts yet.
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-navy-border)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="!bg-transparent px-4 py-3 font-medium">Period</th>
                <th className="!bg-transparent px-4 py-3 font-medium">Net amount</th>
                <th className="!bg-transparent px-4 py-3 font-medium">Status</th>
                <th className="!bg-transparent px-4 py-3 font-medium">Paid</th>
                <th className="!bg-transparent px-4 py-3 font-medium">Payment</th>
                <th className="!bg-transparent px-4 py-3 font-medium">Proof</th>
                <th className="!bg-transparent px-4 py-3 font-medium">Receipt</th>
                <th className="!bg-transparent px-4 py-3 font-medium">Remarks</th>
                <th className="!bg-transparent px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--color-navy-border)]/60 last:border-0"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text)]">
                    {formatPayoutPeriodDate(row.periodFrom)} – {formatPayoutPeriodDate(row.periodTo)}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-[var(--color-text)]">
                    {formatMoney(row.amountLkr ?? row.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`admin-status-badge ${statusBadgeClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                    {formatPeriodDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentCell row={row} />
                  </td>
                  <td className="px-4 py-3">
                    {row.status === 'APPROVED' && row.hasProof ? (
                      <button
                        type="button"
                        onClick={() => void openProof(row)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand)] hover:underline"
                      >
                        <ImageIcon size={13} />
                        View
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {payoutStatementAvailable(row) ? (
                      <button
                        type="button"
                        disabled={downloadBusyId === row.id}
                        onClick={() => void downloadReceipt(row)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {downloadBusyId === row.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <FileText size={13} />
                        )}
                        View receipt
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-[var(--color-text-muted)]">
                    {row.remarks?.trim() || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setReviewRow(row)}
                      className="inline-flex items-center rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
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
          ariaLabel="Payout history pagination"
          className="border-t border-[var(--color-navy-border)]"
        />
      )}

      {reviewRow && (
        <DeliveryApprovePayoutModal
          open
          payout={reviewRow}
          readOnly
          onClose={() => setReviewRow(null)}
        />
      )}
    </DeliveryWalletUnlockProvider>
  );
}
