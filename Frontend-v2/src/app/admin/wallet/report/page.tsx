'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';

import { getAdminSession, isSuperAdmin } from '@/lib/adminAuth';
import { formatMoney } from '@/lib/receipt';
import DashboardKpiCard from '@/components/admin/DashboardKpiCard';
import DateRangePicker from '@/components/admin/DateRangePicker';
import ReportSection, {
  ReportPagination,
  ReportTable,
  useColumnVisibility,
  useReportPagination,
} from '@/components/admin/reports/ReportSection';
import ReportBranchFilter from '@/components/admin/reports/ReportBranchFilter';
import WalletLedgerPreviewSheet from '@/components/admin/reports/WalletLedgerPreviewSheet';
import PayoutInlineBreakdown from '@/components/admin/reports/PayoutInlineBreakdown';
import {
  adminFetch,
  branchDisplayName,
  defaultReportMonthDateStrings,
  downloadCsv,
  formatDateShort,
  formatLkr,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoney, formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type LedgerRow = {
  date: string;
  referenceId: string;
  transactionType: string;
  branchName: string;
  debit: number;
  credit: number;
  orderCount: number | null;
  runningBalance: number;
  transactionId?: string;
  withdrawalId?: string;
};

type WalletOverviewResponse = {
  systemTotals?: {
    totalBalance?: number;
  };
};

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'reference', label: 'Reference' },
  { key: 'type', label: 'Type' },
  { key: 'branch', label: 'Branch' },
  { key: 'debit', label: 'Debit', align: 'right' as const },
  { key: 'credit', label: 'Credit', align: 'right' as const },
  { key: 'balance', label: 'Balance', align: 'right' as const },
];

function isPayoutRow(row: LedgerRow) {
  return row.transactionType === 'Branch Payout (Outflow)' && !!row.transactionId;
}

function formatTypeLabel(row: LedgerRow) {
  if (row.orderCount != null && row.orderCount > 0) {
    return `${row.transactionType} (${row.orderCount})`;
  }
  return row.transactionType;
}

function LedgerReportFooterTotal({
  label,
  amount,
  tone,
  showDashWhenZero = false,
}: {
  label: string;
  amount: number;
  tone: 'debit' | 'credit' | 'balance';
  showDashWhenZero?: boolean;
}) {
  const toneClass = {
    debit: 'text-rose-500',
    credit: 'text-emerald-500',
    balance: 'text-blue-500',
  }[tone];
  const showAmount = !showDashWhenZero || amount > 0;

  return (
    <div className="w-full min-w-[6rem] text-right">
      <div className="text-xs font-bold uppercase tracking-wide text-fg">{label}</div>
      {showAmount ? (
        <div className={`mt-1 text-lg font-extrabold whitespace-nowrap ${toneClass}`}>
          <span className="text-[10px] font-bold align-baseline text-muted opacity-90">LKR </span>
          {formatLkr(amount)}
        </div>
      ) : (
        <div className="mt-1 text-lg font-extrabold text-muted">—</div>
      )}
    </div>
  );
}

function LedgerReportBfAmount({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 font-extrabold text-brand">
      <span className="text-[10px] font-bold leading-none text-muted opacity-90">LKR</span>
      <span className="text-base leading-none">{formatLkr(amount)}</span>
    </span>
  );
}

export default function WalletFullReportPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const monthDefaults = defaultReportMonthDateStrings();
  const [from, setFrom] = useState(monthDefaults.from);
  const [to, setTo] = useState(monthDefaults.to);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [storeId, setStoreId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedTxnId, setExpandedTxnId] = useState<string | null>(null);
  const { visibleColumns, toggleColumn } = useColumnVisibility(COLUMNS.map((c) => c.key));

  useEffect(() => {
    const session = getAdminSession();
    if (!session) {
      router.replace('/admin/login');
      return;
    }
    if (!isSuperAdmin(session)) {
      router.replace('/admin');
      return;
    }
    setAuthorized(true);
  }, [router]);

  const {
    data: walletData,
    isFetching: walletLoading,
    refetch: refetchWallet,
  } = useQuery<WalletOverviewResponse>({
    queryKey: ['wallet-full-report-balance'],
    queryFn: () => adminFetch('/admin/wallet'),
    enabled: authorized,
  });

  const onlineWalletBalanceCents = walletData?.systemTotals?.totalBalance ?? 0;

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: '500' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (storeId) params.set('storeId', storeId);
    return `/admin/reports/wallet-ledger?${params.toString()}`;
  }, [from, to, storeId]);

  const {
    data,
    isFetching,
    refetch: refetchLedger,
  } = useQuery<{ ledger: LedgerRow[]; closingBalance: number; broughtForward: number }>({
    queryKey: ['wallet-full-report-ledger', queryUrl],
    queryFn: () => adminFetch(queryUrl),
    placeholderData: keepPreviousData,
    enabled: authorized,
  });

  const rows = data?.ledger ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  useEffect(() => {
    setExpandedTxnId(null);
  }, [storeId, from, to, page]);

  const activeColumns = useMemo(
    () => (storeId ? COLUMNS.filter((c) => c.key !== 'branch') : COLUMNS),
    [storeId],
  );

  const effectiveVisibleColumns = useMemo<Record<string, boolean>>(
    () => ({
      ...visibleColumns,
      ...(storeId ? { branch: false } : {}),
    }),
    [visibleColumns, storeId],
  );

  const totalInflow = useMemo(
    () => rows.reduce((sum, r) => sum + r.credit, 0),
    [rows],
  );
  const totalOutflow = useMemo(
    () => rows.reduce((sum, r) => sum + r.debit, 0),
    [rows],
  );

  const broughtForwardDate = useMemo(() => {
    if (!from) return '';
    const d = new Date(from);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0]!;
  }, [from]);

  const showBroughtForward = !!(storeId && from && data);
  const isVisibleCol = (key: string) => effectiveVisibleColumns[key] !== false;
  const visibleColumnCount = activeColumns.filter((column) => isVisibleCol(column.key)).length;

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      setFrom(format(range.from, 'yyyy-MM-dd'));
      setTo(format(range.to, 'yyyy-MM-dd'));
      return;
    }
    if (!range?.from) {
      setFrom('');
      setTo('');
    }
  };

  const handleDateRangeClear = () => {
    setDateRange(undefined);
    setFrom('');
    setTo('');
  };

  const handleRefresh = () => {
    void refetchWallet();
    void refetchLedger();
  };

  const togglePayoutRow = (transactionId?: string) => {
    if (!transactionId) return;
    setExpandedTxnId((current) => (current === transactionId ? null : transactionId));
  };

  if (!authorized) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Checking access…
      </div>
    );
  }

  return (
    <div className="admin-dashboard mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/admin/wallet"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            <ArrowLeft size={14} />
            Back to wallet
          </Link>
          <h1 className="flex items-center gap-2.5 text-[22px] font-bold text-fg">
            <Wallet size={22} className="text-[var(--color-brand,#307ef2)]" />
            Full Wallet Ledger
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            System-wide online wallet balance and all branch wallet transactions
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={walletLoading || isFetching}
          className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--color-navy-border,#334155)] bg-transparent px-3.5 py-2 text-[13px] text-muted transition-opacity disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={walletLoading || isFetching ? 'animate-spin' : undefined}
          />
          Refresh
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardKpiCard
          label="Online Wallet Balance"
          value={formatMoney(onlineWalletBalanceCents / 100)}
          icon={Wallet}
          tone="blue"
          loading={walletLoading && !walletData}
        />
      </div>

      <ReportSection
        id="wallet-full-ledger"
        title="Virtual Wallet Ledger"
        description="All-branch wallet statement with daily order credits, deductions, and running balance. Filter by date or branch optionally."
        visibleColumns={effectiveVisibleColumns}
        onToggleColumn={toggleColumn}
        columnOptions={activeColumns.map((c) => ({ key: c.key, label: c.label }))}
        loading={isFetching && !data}
        empty={rows.length === 0}
        emptyMessage="No ledger rows for the selected filters."
        disableActions={rows.length === 0}
        onPdfClick={() => setPreviewOpen(true)}
        pdfStats={[
          {
            label: 'Total Inflow (Credits)',
            value: formatPrintMoney(totalInflow),
            tone: 'teal',
          },
          {
            label: 'Total Outflow (Debits)',
            value: formatPrintMoney(totalOutflow),
            tone: 'yellow',
          },
          {
            label: 'Closing Balance',
            value: formatPrintMoney(data?.closingBalance ?? 0),
            tone: 'green',
          },
        ]}
        controls={
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-xs text-muted">Date range</p>
              <DateRangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                onClear={handleDateRangeClear}
                showClear={!!(from || to)}
              />
            </div>
            <ReportBranchFilter
              value={storeId}
              onChange={setStoreId}
              layout="stacked"
              placeholder="All branches"
            />
          </div>
        }
        onExportCsv={() =>
          downloadCsv(
            'wallet-full-ledger.csv',
            activeColumns.map((c) => c.label),
            rows.map((r) => [
              formatDateShort(r.date),
              r.referenceId,
              formatTypeLabel(r),
              ...(storeId ? [] : [branchDisplayName(r.branchName)]),
              r.debit,
              r.credit,
              r.runningBalance,
            ]),
          )
        }
        pdfTitle="Full Wallet Ledger"
        pdfReference={`FWL-${Date.now()}`}
        pdfPeriodLabel={from || to ? `${from || '…'} → ${to || '…'}` : 'All time'}
        pdfColumns={activeColumns.filter((c) => isVisibleCol(c.key)).map((c) => c.label)}
        pdfRows={rows.slice(0, 200).map((r, i) => ({
          key: `${r.referenceId}-${i}`,
          cells: [
            isVisibleCol('date') ? formatDateShort(r.date) : null,
            isVisibleCol('reference') ? r.referenceId : null,
            isVisibleCol('type') ? formatTypeLabel(r) : null,
            isVisibleCol('branch') ? branchDisplayName(r.branchName) : null,
            isVisibleCol('debit') ? (r.debit > 0 ? formatPrintMoneyNoSymbol(r.debit) : '—') : null,
            isVisibleCol('credit') ? (r.credit > 0 ? formatPrintMoneyNoSymbol(r.credit) : '—') : null,
            isVisibleCol('balance') ? formatPrintMoneyNoSymbol(r.runningBalance) : null,
          ].filter((c) => c != null) as string[],
        }))}
        alignRightFromColumn={storeId ? 3 : 4}
      >
        <ReportTable
          columns={activeColumns}
          visibleColumns={effectiveVisibleColumns}
          footer={
            <tr>
              {(isVisibleCol('date') ||
                isVisibleCol('reference') ||
                isVisibleCol('type') ||
                isVisibleCol('branch')) && (
                <td
                  colSpan={
                    Number(isVisibleCol('date')) +
                    Number(isVisibleCol('reference')) +
                    Number(isVisibleCol('type')) +
                    Number(isVisibleCol('branch'))
                  }
                />
              )}
              {isVisibleCol('debit') && (
                <td className="text-right align-top">
                  <LedgerReportFooterTotal
                    label="Total Debit"
                    amount={totalOutflow}
                    tone="debit"
                    showDashWhenZero
                  />
                </td>
              )}
              {isVisibleCol('credit') && (
                <td className="text-right align-top">
                  <LedgerReportFooterTotal
                    label="Total Credit"
                    amount={totalInflow}
                    tone="credit"
                    showDashWhenZero
                  />
                </td>
              )}
              {isVisibleCol('balance') && (
                <td className="text-right align-top">
                  <LedgerReportFooterTotal
                    label="Closing Balance"
                    amount={data?.closingBalance ?? 0}
                    tone="balance"
                  />
                </td>
              )}
            </tr>
          }
        >
          {showBroughtForward && page === 1 && (
            <tr className="border-y-2 border-blue-500/40 bg-blue-500/15">
              {isVisibleCol('date') && (
                <td className="whitespace-nowrap px-3 py-3.5 text-sm font-semibold text-fg sm:px-4">
                  {formatDateShort(broughtForwardDate)}
                </td>
              )}
              {isVisibleCol('reference') && (
                <td className="whitespace-nowrap px-3 py-3.5 font-mono text-sm font-bold text-fg sm:px-4">
                  B/F
                </td>
              )}
              {isVisibleCol('type') && (
                <td className="px-3 py-3.5 text-sm font-bold text-blue-200 sm:px-4">
                  Brought Forward
                </td>
              )}
              {isVisibleCol('branch') && (
                <td className="px-3 py-3.5 text-sm text-muted sm:px-4">—</td>
              )}
              {isVisibleCol('debit') && (
                <td className="whitespace-nowrap px-3 py-3.5 text-right text-sm text-muted sm:px-4">
                  —
                </td>
              )}
              {isVisibleCol('credit') && (
                <td className="whitespace-nowrap px-3 py-3.5 text-right text-sm text-muted sm:px-4">
                  —
                </td>
              )}
              {isVisibleCol('balance') && (
                <td className="whitespace-nowrap px-3 py-3.5 text-right sm:px-4">
                  <LedgerReportBfAmount amount={data.broughtForward} />
                </td>
              )}
            </tr>
          )}

          {pagedRows.map((row, index) => {
            const payoutRow = isPayoutRow(row);
            const expanded = payoutRow && expandedTxnId === row.transactionId;

            return (
              <Fragment key={`${row.referenceId}-${index}`}>
                <tr
                  className={`border-b border-navy-border ${
                    payoutRow
                      ? 'cursor-pointer hover:bg-navy-light/30'
                      : 'hover:bg-navy-light/20'
                  } ${expanded ? 'bg-navy-light/25' : ''}`}
                  onClick={payoutRow ? () => togglePayoutRow(row.transactionId) : undefined}
                  onKeyDown={
                    payoutRow
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            togglePayoutRow(row.transactionId);
                          }
                        }
                      : undefined
                  }
                  tabIndex={payoutRow ? 0 : undefined}
                  aria-expanded={payoutRow ? expanded : undefined}
                >
                  {isVisibleCol('date') && (
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted sm:px-4">
                      {formatDateShort(row.date)}
                    </td>
                  )}
                  {isVisibleCol('reference') && (
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-fg sm:px-4">
                      {row.referenceId}
                    </td>
                  )}
                  {isVisibleCol('type') && (
                    <td className="max-w-[10rem] px-3 py-3 text-xs text-muted sm:max-w-[14rem] sm:px-4">
                      <span className="inline-flex items-start gap-1.5" title={formatTypeLabel(row)}>
                        {payoutRow && (
                          <span className="mt-0.5 shrink-0 text-brand">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        )}
                        <span className="line-clamp-2">{formatTypeLabel(row)}</span>
                      </span>
                    </td>
                  )}
                  {isVisibleCol('branch') && (
                    <td
                      className="max-w-[8rem] truncate px-3 py-3 text-xs text-muted sm:px-4"
                      title={branchDisplayName(row.branchName)}
                    >
                      {branchDisplayName(row.branchName)}
                    </td>
                  )}
                  {isVisibleCol('debit') && (
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-rose-300 sm:px-4">
                      {row.debit > 0 ? formatLkr(row.debit) : '—'}
                    </td>
                  )}
                  {isVisibleCol('credit') && (
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-emerald-300 sm:px-4">
                      {row.credit > 0 ? formatLkr(row.credit) : '—'}
                    </td>
                  )}
                  {isVisibleCol('balance') && (
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold text-brand sm:px-4">
                      {formatLkr(row.runningBalance)}
                    </td>
                  )}
                </tr>
                {payoutRow && (
                  <PayoutInlineBreakdown
                    transactionId={row.transactionId}
                    open={expanded}
                    colSpan={visibleColumnCount}
                  />
                )}
              </Fragment>
            );
          })}
        </ReportTable>
        <ReportPagination
          page={page}
          totalItems={totalItems}
          onPageChange={setPage}
          label="ledger rows"
        />
      </ReportSection>

      <WalletLedgerPreviewSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        rows={rows.map((r) => ({
          date: r.date,
          referenceId: r.referenceId,
          transactionType: r.transactionType,
          branchName: r.branchName,
          debit: r.debit,
          credit: r.credit,
          orderCount: r.orderCount,
          runningBalance: r.runningBalance,
          transactionId: r.transactionId,
        }))}
        storeId={storeId}
        totalInflow={totalInflow}
        totalOutflow={totalOutflow}
        closingBalance={data?.closingBalance ?? 0}
        broughtForward={data?.broughtForward ?? 0}
        broughtForwardDate={broughtForwardDate}
        from={from}
        to={to}
      />
    </div>
  );
}
