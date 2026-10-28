'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
import { formatPrintMoney, formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type SettlementRow = {
  id: string;
  branchName: string;
  cycleFrom: string;
  cycleTo: string;
  grossSales: number;
  lockedSlabRate: number;
  dartcodesCommission: number;
  convenienceFeesCollected: number;
  totalDartcodesRevenue: number;
};

const COLUMNS = [
  { key: 'branch', label: 'Branch' },
  { key: 'cycle', label: 'Cycle' },
  { key: 'sales', label: 'Branch Sales', align: 'right' as const },
  { key: 'rate', label: 'Slab %', align: 'right' as const },
  { key: 'commission', label: 'Commission', align: 'right' as const },
  { key: 'convenience', label: 'Conv. Fees', align: 'right' as const },
  { key: 'revenue', label: 'Dartcodes Rev.', align: 'right' as const },
];

export default function SlabRateReport({ lockedStoreId, lockedStoreName }: LockedStoreReportProps) {
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

  const { data, isFetching } = useQuery<{ settlements: SettlementRow[] }>({
    queryKey: ['report-slab-rate', queryUrl],
    queryFn: () => adminFetch(queryUrl),
    placeholderData: keepPreviousData,
  });

  const rows = data?.settlements ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  const totals = useMemo(() => ({
    cycles: rows.length,
    totalCommission: rows.reduce((s, r) => s + r.dartcodesCommission, 0),
    totalRevenue: rows.reduce((s, r) => s + r.totalDartcodesRevenue, 0),
  }), [rows]);

  const periodLabel = formatReportPeriodFromDates(from, to, 'All settlements');
  const pdfStats = [
    { label: 'Cycles', value: String(rows.length), tone: 'blue' as const },
    { label: 'Dartcodes Revenue', value: formatPrintMoney(totals.totalRevenue), tone: 'green' as const },
  ];
  const pdfColumns = COLUMNS.filter((c) => isVisible(c.key)).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((r) => ({
        key: r.id,
        cells: [
          isVisible('branch') ? branchDisplayName(r.branchName) : null,
          isVisible('cycle') ? `${formatDateShort(r.cycleFrom)} – ${formatDateShort(r.cycleTo)}` : null,
          isVisible('sales') ? formatPrintMoneyNoSymbol(r.grossSales) : null,
          isVisible('rate') ? `${r.lockedSlabRate}%` : null,
          isVisible('commission') ? formatPrintMoneyNoSymbol(r.dartcodesCommission) : null,
          isVisible('convenience') ? formatPrintMoneyNoSymbol(r.convenienceFeesCollected) : null,
          isVisible('revenue') ? formatPrintMoneyNoSymbol(r.totalDartcodesRevenue) : null,
        ].filter((c) => c != null) as string[],
      })),
    [rows, isVisible],
  );

  return (
    <>
    <ReportSection
      id="slab-rate"
      title="Dartcodes Earnings & Slab Rate Tracker"
      description="Commission and convenience fee earnings by settlement cycle."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && !data}
      empty={rows.length === 0}
      onPdfClick={() => setPreviewOpen(true)}
      pdfStats={pdfStats}
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
          'dartcodes-slab-tracker.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r) => [
            branchDisplayName(r.branchName),
            `${formatDateShort(r.cycleFrom)} – ${formatDateShort(r.cycleTo)}`,
            r.grossSales,
            r.lockedSlabRate,
            r.dartcodesCommission,
            r.convenienceFeesCollected,
            r.totalDartcodesRevenue,
          ]),
        )
      }
      pdfTitle="Dartcodes Earnings & Slab Rate Tracker"
      pdfReference={`DST-${Date.now()}`}
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
            <ReportFooterTotalCell label="Total Cycles" value={String(totals.cycles)} prefix="" toneClass="text-blue-500" />
            <ReportFooterTotalCell label="Total Commission" value={formatLkr(totals.totalCommission)} toneClass="text-rose-500" />
            <ReportFooterTotalCell label="Total Revenue" value={formatLkr(totals.totalRevenue)} toneClass="text-emerald-500" />
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
            {isVisible('sales') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.grossSales)}</td>}
            {isVisible('rate') && <td className="px-3 sm:px-4 py-3 text-right text-fg text-sm whitespace-nowrap">{row.lockedSlabRate}%</td>}
            {isVisible('commission') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.dartcodesCommission)}</td>}
            {isVisible('convenience') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.convenienceFeesCollected)}</td>}
            {isVisible('revenue') && <td className="px-3 sm:px-4 py-3 text-right text-brand font-semibold text-sm whitespace-nowrap">{formatLkr(row.totalDartcodesRevenue)}</td>}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="cycles" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Slab"
      reportTitle="Dartcodes Earnings & Slab Rate Tracker"
      reportDescription="Commission and convenience fee earnings by settlement cycle."
      scopeLabel={scopeLabel}
      periodLabel={periodLabel}
      statusLine={`Live Report · ${rows.length} cycle${rows.length === 1 ? '' : 's'}`}
      referencePrefix="DST"
      stats={pdfStats}
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={2}
      footerTotals={
        rows.length > 0
          ? [
              { label: 'Total Cycles', value: String(totals.cycles), tone: 'blue', prefix: '' },
              { label: 'Total Commission', value: formatLkr(totals.totalCommission), tone: 'rose' },
              { label: 'Total Revenue', value: formatLkr(totals.totalRevenue), tone: 'green' },
            ]
          : []
      }
      rowCountLabel="cycles"
    />
    </>
  );
}
