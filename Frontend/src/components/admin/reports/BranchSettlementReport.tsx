'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react';
import ReportSection, {
  ReportPagination,
  ReportTable,
  useColumnVisibility,
  useReportPagination,
} from '@/components/admin/reports/ReportSection';
import ReportBranchFilter, { useReportScopeLabel } from '@/components/admin/reports/ReportBranchFilter';
import AdminReportPreviewSheet from '@/components/admin/reports/AdminReportPreviewSheet';
import {
  adminFetch,
  branchDisplayName,
  downloadCsv,
  formatDateShort,
  formatLkr,
  formatReportPeriodFromDates,
  type LockedStoreReportProps,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type SettlementRow = {
  id: string;
  branchName: string;
  cycleFrom: string;
  cycleTo: string;
  grossSales: number;
  totalDeliveryFees: number;
  payhereFees: number;
  dartcodesCommission: number;
  netBranchShare: number;
  offlineCollected: number;
  finalPayoutAmount: number;
  payoutStatus: string;
};

const COLUMNS = [
  { key: 'branch', label: 'Branch' },
  { key: 'cycle', label: 'Cycle' },
  { key: 'gross', label: 'Gross Sales', align: 'right' as const },
  { key: 'delivery', label: 'Delivery Fees', align: 'right' as const },
  { key: 'payhere', label: 'Online Payment Fees', align: 'right' as const },
  { key: 'commission', label: 'Commission', align: 'right' as const },
  { key: 'net', label: 'Net Share', align: 'right' as const },
  { key: 'offline', label: 'Offline Collected', align: 'right' as const },
  { key: 'payout', label: 'Final Payout', align: 'right' as const },
  { key: 'status', label: 'Status' },
];

export default function BranchSettlementReport({ lockedStoreId, lockedStoreName }: LockedStoreReportProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeId, setStoreId] = useState(lockedStoreId ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));
  const scopeLabel = useReportScopeLabel(storeId, lockedStoreName);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (storeId) params.set('storeId', storeId);
    const qs = params.toString();
    return `/admin/reports/settlements${qs ? `?${qs}` : ''}`;
  }, [from, to, storeId]);

  const { data, isFetching, isError, error } = useQuery<{ settlements: SettlementRow[] }>({
    queryKey: ['report-branch-settlement', queryUrl],
    queryFn: async () => {
      const payload = await adminFetch<{ settlements?: SettlementRow[]; message?: string }>(queryUrl);
      if (!payload || !Array.isArray(payload.settlements)) {
        throw new Error(payload?.message || 'Failed to load settlement sheet');
      }
      return { settlements: payload.settlements };
    },
    placeholderData: keepPreviousData,
  });

  const rows = data?.settlements ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  const totals = useMemo(() => ({
    grossSales: rows.reduce((s, r) => s + r.grossSales, 0),
    commission: rows.reduce((s, r) => s + r.dartcodesCommission, 0),
    payout: rows.reduce((s, r) => s + r.finalPayoutAmount, 0),
  }), [rows]);

  const periodLabel = formatReportPeriodFromDates(from, to, 'All settlements');
  const pdfColumns = COLUMNS.filter((c) => isVisible(c.key)).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((r) => ({
        key: r.id,
        cells: [
          isVisible('branch') ? branchDisplayName(r.branchName) : null,
          isVisible('cycle') ? `${formatDateShort(r.cycleFrom)} – ${formatDateShort(r.cycleTo)}` : null,
          isVisible('gross') ? formatPrintMoneyNoSymbol(r.grossSales) : null,
          isVisible('delivery') ? formatPrintMoneyNoSymbol(r.totalDeliveryFees) : null,
          isVisible('payhere') ? formatPrintMoneyNoSymbol(r.payhereFees) : null,
          isVisible('commission') ? formatPrintMoneyNoSymbol(r.dartcodesCommission) : null,
          isVisible('net') ? formatPrintMoneyNoSymbol(r.netBranchShare) : null,
          isVisible('offline') ? formatPrintMoneyNoSymbol(r.offlineCollected) : null,
          isVisible('payout') ? formatPrintMoneyNoSymbol(r.finalPayoutAmount) : null,
          isVisible('status') ? r.payoutStatus : null,
        ].filter((c) => c != null) as string[],
      })),
    [rows, isVisible],
  );

  return (
    <>
    <ReportSection
      id="branch-settlement"
      title="Branch Payout Settlement Sheet"
      description="Main payout sheet with deductions and final branch share."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && !data}
      empty={rows.length === 0}
      emptyMessage={
        isError
          ? error instanceof Error
            ? error.message
            : 'Failed to load settlement sheet'
          : 'No payout settlements for the selected branch and date range.'
      }
      onPdfClick={() => setPreviewOpen(true)}
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
            <ReportBranchFilter value={storeId} onChange={setStoreId} layout="stacked" />
          )}
        </div>
      }
      onExportCsv={() =>
        downloadCsv(
          'branch-settlement-sheet.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r) => [
            branchDisplayName(r.branchName),
            `${formatDateShort(r.cycleFrom)} – ${formatDateShort(r.cycleTo)}`,
            r.grossSales,
            r.totalDeliveryFees,
            r.payhereFees,
            r.dartcodesCommission,
            r.netBranchShare,
            r.offlineCollected,
            r.finalPayoutAmount,
            r.payoutStatus,
          ]),
        )
      }
      pdfTitle="Branch Payout Settlement Sheet"
      pdfReference={`BSS-${Date.now()}`}
      pdfPeriodLabel={periodLabel}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
      alignRightFromColumn={2}
    >
      <ReportTable
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        footer={rows.length > 0 ? (
          <tr>
            <td colSpan={COLUMNS.filter((c) => visibleColumns[c.key] !== false).length - 3} className="border-t-[3px] border-blue-900/60" />
            <ReportFooterTotalCell label="Total Gross Sales" value={formatLkr(totals.grossSales)} toneClass="text-emerald-500" />
            <ReportFooterTotalCell label="Total Commission" value={formatLkr(totals.commission)} toneClass="text-rose-500" />
            <ReportFooterTotalCell label="Total Payout" value={formatLkr(totals.payout)} toneClass="text-emerald-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row) => (
          <tr key={row.id} className="border-b border-navy-border hover:bg-navy-light/20">
            {isVisible('branch') && (
              <td className="px-3 sm:px-4 py-3 text-fg text-sm max-w-[8rem] truncate" title={branchDisplayName(row.branchName)}>
                {branchDisplayName(row.branchName)}
              </td>
            )}
            {isVisible('cycle') && (
              <td className="px-3 sm:px-4 py-3 text-muted text-xs whitespace-nowrap">
                {formatDateShort(row.cycleFrom)} – {formatDateShort(row.cycleTo)}
              </td>
            )}
            {isVisible('gross') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.grossSales)}</td>}
            {isVisible('delivery') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.totalDeliveryFees)}</td>}
            {isVisible('payhere') && <td className="px-3 sm:px-4 py-3 text-right text-rose-300 text-xs whitespace-nowrap">{formatLkr(row.payhereFees)}</td>}
            {isVisible('commission') && <td className="px-3 sm:px-4 py-3 text-right text-rose-300 text-xs whitespace-nowrap">{formatLkr(row.dartcodesCommission)}</td>}
            {isVisible('net') && <td className="px-3 sm:px-4 py-3 text-right text-fg text-sm whitespace-nowrap">{formatLkr(row.netBranchShare)}</td>}
            {isVisible('offline') && <td className="px-3 sm:px-4 py-3 text-right text-rose-300 text-xs whitespace-nowrap">{formatLkr(row.offlineCollected)}</td>}
            {isVisible('payout') && <td className="px-3 sm:px-4 py-3 text-right text-brand font-semibold text-sm whitespace-nowrap">{formatLkr(row.finalPayoutAmount)}</td>}
            {isVisible('status') && (
              <td className="px-3 sm:px-4 py-3">
                {(() => {
                  const s = row.payoutStatus.toUpperCase();
                  let badgeClass = 'admin-status-badge admin-status-badge--neutral';
                  let StatusIcon = Clock;
                  
                  if (s === 'PAID' || s === 'SETTLED' || s === 'COMPLETED') {
                    badgeClass = 'admin-status-badge admin-status-badge--green';
                    StatusIcon = CheckCircle2;
                  } else if (s === 'PENDING' || s === 'UNPAID' || s === 'PAYMENT_PENDING') {
                    badgeClass = 'admin-status-badge admin-status-badge--amber';
                    StatusIcon = Clock;
                  } else if (s === 'PROCESSING' || s === 'IN_PROGRESS' || s === 'IN_REVIEW') {
                    badgeClass = 'admin-status-badge admin-status-badge--blue';
                    StatusIcon = Loader2;
                  } else if (s === 'FAILED' || s === 'REJECTED' || s === 'CANCELLED') {
                    badgeClass = 'admin-status-badge admin-status-badge--red';
                    StatusIcon = AlertCircle;
                  }

                  return (
                    <span className={`${badgeClass} gap-1.5`}>
                      <StatusIcon size={12} strokeWidth={2.5} />
                      {row.payoutStatus}
                    </span>
                  );
                })()}
              </td>
            )}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="settlements" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Settlement"
      reportTitle="Branch Payout Settlement Sheet"
      reportDescription="Main payout sheet with deductions and final branch share."
      scopeLabel={scopeLabel}
      periodLabel={periodLabel}
      statusLine={`Live Report · ${rows.length} settlement${rows.length === 1 ? '' : 's'}`}
      referencePrefix="BSS"
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={2}
      footerTotals={
        rows.length > 0
          ? [
              { label: 'Total Gross Sales', value: formatLkr(totals.grossSales), tone: 'green' },
              { label: 'Total Commission', value: formatLkr(totals.commission), tone: 'rose' },
              { label: 'Total Payout', value: formatLkr(totals.payout), tone: 'green' },
            ]
          : []
      }
      rowCountLabel="settlements"
    />
    </>
  );
}
