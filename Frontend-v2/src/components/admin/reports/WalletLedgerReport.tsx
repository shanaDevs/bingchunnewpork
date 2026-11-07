'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
  downloadCsv,
  formatDateShort,
  formatLkr,
  formatReportPeriodFromDates,
  type LockedStoreReportProps,
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

function isPayoutRow(row: LedgerRow) {
  return row.transactionType === 'Branch Payout (Outflow)' && !!row.transactionId;
}

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'reference', label: 'Reference' },
  { key: 'type', label: 'Type' },
  { key: 'branch', label: 'Branch' },
  { key: 'debit', label: 'Debit', align: 'right' as const },
  { key: 'credit', label: 'Credit', align: 'right' as const },
  { key: 'balance', label: 'Balance', align: 'right' as const },
];

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

export default function WalletLedgerReport({ lockedStoreId, lockedStoreName }: LockedStoreReportProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeId, setStoreId] = useState(lockedStoreId ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedTxnId, setExpandedTxnId] = useState<string | null>(null);
  const { visibleColumns, toggleColumn } = useColumnVisibility(COLUMNS.map((c) => c.key));

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

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: '300' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (storeId) params.set('storeId', storeId);
    return `/admin/reports/wallet-ledger?${params.toString()}`;
  }, [from, to, storeId]);

  const { data, isFetching } = useQuery<{ ledger: LedgerRow[]; closingBalance: number; broughtForward: number }>({
    queryKey: ['report-wallet-ledger', queryUrl],
    queryFn: () => adminFetch(queryUrl),
    placeholderData: keepPreviousData,
    enabled: !!storeId,
  });

  const rows = data?.ledger ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  useEffect(() => {
    setExpandedTxnId(null);
  }, [storeId, from, to, page]);

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

  const togglePayoutRow = (transactionId?: string) => {
    if (!transactionId) return;
    setExpandedTxnId((current) => (current === transactionId ? null : transactionId));
  };

  return (
    <>
      <ReportSection
        id="wallet-ledger"
        title="Virtual Wallet Ledger"
        description="Per-branch wallet statement with daily order credits, deductions, brought forward, and running balance."
        visibleColumns={effectiveVisibleColumns}
        onToggleColumn={toggleColumn}
        columnOptions={activeColumns.map((c) => ({ key: c.key, label: c.label }))}
        loading={!!storeId && isFetching && !data}
        empty={!!storeId && rows.length === 0}
        emptyMessage="No ledger rows for the selected branch and date range."
        disableActions={!storeId || rows.length === 0}
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
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <p className="text-xs text-muted mb-1">From</p>
              <input type="date" className="input-field text-sm py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-muted mb-1">To</p>
              <input type="date" className="input-field text-sm py-2" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {!lockedStoreId && (
              <ReportBranchFilter
                value={storeId}
                onChange={setStoreId}
                layout="stacked"
                placeholder="Select branch"
              />
            )}
          </div>
        }
        onExportCsv={() =>
          downloadCsv(
            'wallet-ledger.csv',
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
        pdfTitle="Virtual Wallet Ledger"
        pdfReference={`VWL-${Date.now()}`}
        pdfPeriodLabel={formatReportPeriodFromDates(from, to)}
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
        {!storeId ? (
          <div className="py-16 text-center text-muted">
            <p className="text-sm">Select a branch above to view its wallet ledger.</p>
          </div>
        ) : (
          <>
        <ReportTable
          columns={activeColumns}
          visibleColumns={effectiveVisibleColumns}
          footer={
            storeId ? (
              <tr>
                {(isVisibleCol('date') || isVisibleCol('reference') || isVisibleCol('type') || isVisibleCol('branch')) && (
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
                    <LedgerReportFooterTotal label="Total Debit" amount={totalOutflow} tone="debit" showDashWhenZero />
                  </td>
                )}
                {isVisibleCol('credit') && (
                  <td className="text-right align-top">
                    <LedgerReportFooterTotal label="Total Credit" amount={totalInflow} tone="credit" showDashWhenZero />
                  </td>
                )}
                {isVisibleCol('balance') && (
                  <td className="text-right align-top">
                    <LedgerReportFooterTotal label="Closing Balance" amount={data?.closingBalance ?? 0} tone="balance" />
                  </td>
                )}
              </tr>
            ) : undefined
          }
        >
          {showBroughtForward && page === 1 && (
            <tr className="border-y-2 border-blue-500/40 bg-blue-500/15">
              {isVisibleCol('date') && <td className="px-3 sm:px-4 py-3.5 text-fg text-sm font-semibold whitespace-nowrap">{formatDateShort(broughtForwardDate)}</td>}
              {isVisibleCol('reference') && <td className="px-3 sm:px-4 py-3.5 text-fg text-sm font-mono font-bold whitespace-nowrap">B/F</td>}
              {isVisibleCol('type') && <td className="px-3 sm:px-4 py-3.5 text-blue-200 text-sm font-bold">Brought Forward</td>}
              {isVisibleCol('branch') && <td className="px-3 sm:px-4 py-3.5 text-muted text-sm">—</td>}
              {isVisibleCol('debit') && <td className="px-3 sm:px-4 py-3.5 text-right text-sm whitespace-nowrap text-muted">—</td>}
              {isVisibleCol('credit') && <td className="px-3 sm:px-4 py-3.5 text-right text-sm whitespace-nowrap text-muted">—</td>}
              {isVisibleCol('balance') && (
                <td className="px-3 sm:px-4 py-3.5 text-right whitespace-nowrap">
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
                  {isVisibleCol('date') && <td className="px-3 sm:px-4 py-3 text-muted text-xs whitespace-nowrap">{formatDateShort(row.date)}</td>}
                  {isVisibleCol('reference') && <td className="px-3 sm:px-4 py-3 text-fg text-xs font-mono whitespace-nowrap">{row.referenceId}</td>}
                  {isVisibleCol('type') && (
                    <td className="px-3 sm:px-4 py-3 text-muted text-xs max-w-[10rem] sm:max-w-[14rem]">
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
                  {isVisibleCol('branch') && <td className="px-3 sm:px-4 py-3 text-muted text-xs max-w-[8rem] truncate" title={branchDisplayName(row.branchName)}>{branchDisplayName(row.branchName)}</td>}
                  {isVisibleCol('debit') && (
                    <td className="px-3 sm:px-4 py-3 text-right text-rose-300 text-xs whitespace-nowrap">
                      {row.debit > 0 ? formatLkr(row.debit) : '—'}
                    </td>
                  )}
                  {isVisibleCol('credit') && (
                    <td className="px-3 sm:px-4 py-3 text-right text-emerald-300 text-xs whitespace-nowrap">
                      {row.credit > 0 ? formatLkr(row.credit) : '—'}
                    </td>
                  )}
                  {isVisibleCol('balance') && (
                    <td className="px-3 sm:px-4 py-3 text-right text-brand font-semibold text-sm whitespace-nowrap">
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
        <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="ledger rows" />
          </>
        )}
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
        storeName={lockedStoreName}
        totalInflow={totalInflow}
        totalOutflow={totalOutflow}
        closingBalance={data?.closingBalance ?? 0}
        broughtForward={data?.broughtForward ?? 0}
        broughtForwardDate={broughtForwardDate}
        from={from}
        to={to}
      />
    </>
  );
}
