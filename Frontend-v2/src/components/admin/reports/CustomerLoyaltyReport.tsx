'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import ReportSection, {
  ReportPagination,
  ReportTable,
  useColumnVisibility,
  useReportPagination,
} from '@/components/admin/reports/ReportSection';
import ReportBranchFilter, { useReportScopeLabel } from '@/components/admin/reports/ReportBranchFilter';
import AdminReportPreviewSheet from '@/components/admin/reports/AdminReportPreviewSheet';
import { Crown, UserPlus } from 'lucide-react';
import {
  adminFetch,
  downloadCsv,
  formatDateShort,
  formatLkr,
  formatReportPeriodFromDates,
  type LockedStoreReportProps,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type LoyaltyRow = {
  customerId: string;
  name: string;
  phone: string;
  registrationDate: string;
  customerType: 'NEW' | 'LOYAL';
  firstOrderDate: string;
  lastOrderDate: string;
  totalOrders: number;
  totalValue: number;
};

const LOYALTY_THRESHOLD_MIN = 2;
const LOYALTY_THRESHOLD_MAX = 9_999;

function clampLoyaltyThreshold(value: number) {
  if (!Number.isFinite(value)) return LOYALTY_THRESHOLD_MIN;
  return Math.min(LOYALTY_THRESHOLD_MAX, Math.max(LOYALTY_THRESHOLD_MIN, Math.floor(value)));
}

type CustomerLoyaltyPayload = {
  customers: LoyaltyRow[];
  summary: { total: number; newCount: number; loyalCount: number };
  loyaltyThreshold: number;
};

function parseLoyaltyThresholdInput(raw: string) {
  if (raw.trim() === '') return LOYALTY_THRESHOLD_MIN;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return clampLoyaltyThreshold(n);
}

function isCustomerLoyaltyPayload(value: unknown): value is CustomerLoyaltyPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.customers)) return false;
  const summary = record.summary;
  if (!summary || typeof summary !== 'object') return false;
  const s = summary as Record<string, unknown>;
  return typeof s.total === 'number' && typeof s.newCount === 'number' && typeof s.loyalCount === 'number';
}

async function fetchCustomerLoyaltyReport(queryUrl: string): Promise<CustomerLoyaltyPayload> {
  const payload = await adminFetch<unknown>(queryUrl);
  if (isCustomerLoyaltyPayload(payload)) {
    return payload;
  }
  const message =
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof (payload as { message?: unknown }).message === 'string'
      ? (payload as { message: string }).message
      : 'Failed to load customer loyalty report';
  throw new Error(message);
}

const COLUMNS = [
  { key: 'name', label: 'Customer Name / Phone' },
  { key: 'registration', label: 'Registration Date' },
  { key: 'type', label: 'Customer Type Tag' },
  { key: 'firstOrder', label: 'First Order Date' },
  { key: 'lastOrder', label: 'Last Order Date' },
  { key: 'orders', label: 'Total Lifespan Orders', align: 'right' as const },
  { key: 'value', label: 'Total Lifespan Value (LKR)', align: 'right' as const },
];

export default function CustomerLoyaltyReport({ lockedStoreId, lockedStoreName }: LockedStoreReportProps) {
  const [customerType, setCustomerType] = useState<'ALL' | 'NEW' | 'LOYAL'>('ALL');
  const [loyaltyThreshold, setLoyaltyThreshold] = useState(LOYALTY_THRESHOLD_MIN);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeId, setStoreId] = useState(lockedStoreId ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));
  const scopeLabel = useReportScopeLabel(storeId, lockedStoreName);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({
      customerType,
      loyaltyThreshold: String(loyaltyThreshold),
      limit: '100',
    });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (storeId) params.set('storeId', storeId);
    return `/admin/reports/customer-loyalty?${params.toString()}`;
  }, [customerType, loyaltyThreshold, from, to, storeId]);

  const { data, isFetching, isError, error, isFetched, isSuccess } = useQuery<CustomerLoyaltyPayload>({
    queryKey: ['report-customer-loyalty', queryUrl],
    queryFn: () => fetchCustomerLoyaltyReport(queryUrl),
    placeholderData: keepPreviousData,
  });

  const lastEmptyToastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isError) return;
    const message = error instanceof Error ? error.message : 'Failed to load customer loyalty report';
    toast.error(message);
  }, [isError, error]);

  useEffect(() => {
    if (!isSuccess || !data) return;
    if (data.customers.length > 0) {
      lastEmptyToastKey.current = null;
      return;
    }
    if (lastEmptyToastKey.current === queryUrl) return;
    lastEmptyToastKey.current = queryUrl;
    toast(`No customers match threshold ${loyaltyThreshold}+ for the selected filters.`, {
      icon: 'ℹ️',
    });
  }, [isSuccess, data, queryUrl, loyaltyThreshold]);

  const rows = data?.customers ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  const totals = useMemo(() => ({
    totalCustomers: rows.length,
    totalOrders: rows.reduce((s, r) => s + r.totalOrders, 0),
    totalValue: rows.reduce((s, r) => s + r.totalValue, 0),
  }), [rows]);

  const periodLabel = formatReportPeriodFromDates(from, to);
  const filterLabel = `Type ${customerType} · Threshold ${loyaltyThreshold}+`;
  const pdfStats = [
    { label: 'Customers', value: String(data?.summary?.total ?? 0), tone: 'blue' as const },
    { label: 'New', value: String(data?.summary?.newCount ?? 0), tone: 'teal' as const },
    { label: 'Loyal', value: String(data?.summary?.loyalCount ?? 0), tone: 'green' as const },
  ];
  const pdfColumns = COLUMNS.filter((c) => isVisible(c.key)).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((r) => ({
        key: r.customerId,
        cells: [
          isVisible('name') ? `${r.name} / ${r.phone}` : null,
          isVisible('registration') ? formatDateShort(r.registrationDate) : null,
          isVisible('type') ? r.customerType : null,
          isVisible('firstOrder') ? formatDateShort(r.firstOrderDate) : null,
          isVisible('lastOrder') ? formatDateShort(r.lastOrderDate) : null,
          isVisible('orders') ? String(r.totalOrders) : null,
          isVisible('value') ? formatPrintMoneyNoSymbol(r.totalValue) : null,
        ].filter((c) => c != null) as string[],
      })),
    [rows, isVisible],
  );

  return (
    <>
    <ReportSection
      id="customer-loyalty"
      title="Customer Loyalty & Retention Report"
      description="Compare new vs returning customers using a configurable loyalty threshold."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && !data}
      empty={isFetched && rows.length === 0}
      emptyMessage={
        isError
          ? error instanceof Error
            ? error.message
            : 'Failed to load customer loyalty report'
          : 'No customers match the selected filters.'
      }
      onPdfClick={() => setPreviewOpen(true)}
      pdfStats={pdfStats}
      controls={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-wrap gap-3 items-end border-r border-navy-border/50 pr-4">
            <div className="flex items-center gap-2">
              <label htmlFor="fromDate" className="text-[11px] font-medium text-muted uppercase tracking-wider">From</label>
              <input type="date" id="fromDate" className="input-field text-sm px-2 py-1 h-[32px] rounded-lg" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="toDate" className="text-[11px] font-medium text-muted uppercase tracking-wider">To</label>
              <input type="date" id="toDate" className="input-field text-sm px-2 py-1 h-[32px] rounded-lg" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="threshold" className="text-[11px] font-medium text-muted uppercase tracking-wider">Loyalty Threshold</label>
              <input
                type="number"
                id="threshold"
                min={LOYALTY_THRESHOLD_MIN}
                max={LOYALTY_THRESHOLD_MAX}
                step={1}
                className="input-field text-sm px-2 py-1 h-[32px] rounded-lg w-20"
                value={loyaltyThreshold}
                onChange={(e) => {
                  const next = parseLoyaltyThresholdInput(e.target.value);
                  if (next != null) setLoyaltyThreshold(next);
                }}
                onBlur={(e) => {
                  const next = parseLoyaltyThresholdInput(e.target.value);
                  setLoyaltyThreshold(next ?? LOYALTY_THRESHOLD_MIN);
                }}
              />
            </div>
          </div>
          {!lockedStoreId && <ReportBranchFilter value={storeId} onChange={setStoreId} />}
          <div className="flex items-center gap-2">
            <label htmlFor="customerType" className="text-[11px] font-medium text-muted uppercase tracking-wider">Type</label>
            <select
              id="customerType"
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value as any)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="NEW">New Customers Only</option>
              <option value="LOYAL">Loyal (Returning) Only</option>
            </select>
          </div>
        </div>
      }
      onExportCsv={() =>
        downloadCsv(
          'customer-loyalty.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r) => [
            `${r.name} / ${r.phone}`,
            formatDateShort(r.registrationDate),
            r.customerType,
            formatDateShort(r.firstOrderDate),
            formatDateShort(r.lastOrderDate),
            r.totalOrders,
            r.totalValue,
          ]),
        )
      }
      pdfTitle="Customer Loyalty & Retention Report"
      pdfReference={`CLR-${Date.now()}`}
      pdfPeriodLabel={periodLabel}
      pdfFilterLabel={filterLabel}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
      alignRightFromColumn={5}
    >
      <ReportTable
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        footer={rows.length > 0 ? (
          <tr>
            <td colSpan={COLUMNS.filter((c) => visibleColumns[c.key] !== false).length - 3} className="border-t-[3px] border-blue-900/60" />
            <ReportFooterTotalCell label="Total Customers" value={String(totals.totalCustomers)} prefix="" toneClass="text-blue-500" />
            <ReportFooterTotalCell label="Total Orders" value={String(totals.totalOrders)} prefix="" toneClass="text-blue-500" />
            <ReportFooterTotalCell label="Total Value" value={formatLkr(totals.totalValue)} toneClass="text-emerald-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row) => (
          <tr key={row.customerId} className="border-b border-navy-border hover:bg-navy-light/20">
            {isVisible('name') && (
              <td className="px-4 py-3">
                <p className="text-fg text-sm">{row.name}</p>
                <p className="text-muted text-xs">{row.phone}</p>
              </td>
            )}
            {isVisible('registration') && (
              <td className="px-4 py-3 text-muted text-xs">{formatDateShort(row.registrationDate)}</td>
            )}
            {isVisible('type') && (
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                    row.customerType === 'LOYAL'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}
                >
                  {row.customerType === 'LOYAL' ? <Crown size={12} /> : <UserPlus size={12} />}
                  {row.customerType === 'LOYAL' ? 'Loyal' : 'New'}
                </span>
              </td>
            )}
            {isVisible('firstOrder') && (
              <td className="px-4 py-3 text-muted text-xs">{formatDateShort(row.firstOrderDate)}</td>
            )}
            {isVisible('lastOrder') && (
              <td className="px-4 py-3 text-muted text-xs">{formatDateShort(row.lastOrderDate)}</td>
            )}
            {isVisible('orders') && (
              <td className="px-4 py-3 text-right text-fg text-sm">{row.totalOrders}</td>
            )}
            {isVisible('value') && (
              <td className="px-4 py-3 text-right text-brand font-semibold text-sm">
                {formatLkr(row.totalValue)}
              </td>
            )}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="customers" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Loyalty"
      reportTitle="Customer Loyalty & Retention Report"
      reportDescription="Compare new vs returning customers using a configurable loyalty threshold."
      scopeLabel={scopeLabel}
      periodLabel={periodLabel}
      filterLabel={filterLabel}
      statusLine={`Live Report · ${rows.length} customer${rows.length === 1 ? '' : 's'}`}
      referencePrefix="CLR"
      stats={pdfStats}
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={5}
      footerTotals={
        rows.length > 0
          ? [
              { label: 'Total Customers', value: String(totals.totalCustomers), tone: 'blue', prefix: '' },
              { label: 'Total Orders', value: String(totals.totalOrders), tone: 'blue', prefix: '' },
              { label: 'Total Value', value: formatLkr(totals.totalValue), tone: 'green' },
            ]
          : []
      }
      rowCountLabel="customers"
    />
    </>
  );
}