'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import ReportSection, {
  ReportPagination,
  ReportTable,
  useColumnVisibility,
  useReportPagination,
} from '@/components/admin/reports/ReportSection';
import ReportBranchFilter from '@/components/admin/reports/ReportBranchFilter';
import AdminReportPreviewSheet from '@/components/admin/reports/AdminReportPreviewSheet';
import {
  branchDisplayName,
  downloadCsv,
  formatDateTime,
  formatReportPeriodFromDates,
  orderModeLabel,
  orderStatusLabel,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';
import { resolveCustomerDisplayName } from '@/lib/customerName';

type OrderRow = {
  id: string;
  orderNumber: string;
  createdAt: string;
  orderMode: string;
  status: string;
  paymentStatus?: string;
  guestName?: string | null;
  guestPhone?: string | null;
  store?: { name: string };
  user?: { name?: string; phone?: string } | null;
  items?: Array<{ productName: string; quantity: number }>;
  statusEvents?: Array<{ status: string; note?: string | null }>;
};

type OrdersResponse = {
  data?: OrderRow[];
  items?: OrderRow[];
  meta?: { total?: number };
};

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'RECEIVED', label: 'Pending' },
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'READY', label: 'Ready for Pickup' },
  { value: 'OUT_FOR_DELIVERY', label: 'Dispatched' },
  { value: 'DELIVERED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
] as const;

const COLUMNS = [
  { key: 'orderId', label: 'Order ID' },
  { key: 'datetime', label: 'Date & Time' },
  { key: 'branch', label: 'Branch Name' },
  { key: 'customer', label: 'Customer Name & Phone' },
  { key: 'type', label: 'Order Type' },
  { key: 'items', label: 'Items & Qty Summary' },
  { key: 'status', label: 'Order Status' },
  { key: 'reason', label: 'Cancellation/Refund Reason' },
];



function itemsSummary(items?: Array<{ productName: string; quantity: number }>) {
  if (!items?.length) return '—';
  return items.map((i) => `${i.productName} ×${i.quantity}`).join(', ');
}

export default function OrderLifecycleReport() {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]['value']>('ALL');
  const [orderMode, setOrderMode] = useState<'ALL' | 'TAKEAWAY' | 'DELIVERY'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeId, setStoreId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: '1',
      limit: '100',
      sortDir: 'desc',
    });
    if (status === 'REFUNDED') {
      params.set('paymentStatus', 'REFUNDED');
    } else if (status !== 'ALL') {
      params.set('status', status);
    }
    if (orderMode !== 'ALL') params.set('orderMode', orderMode);
    if (from) params.set('startDate', from);
    if (to) params.set('endDate', to);
    if (storeId) params.set('storeId', storeId);
    return `/orders?${params.toString()}`;
  }, [status, orderMode, from, to, storeId]);

  const { data, isFetching } = useQuery<OrdersResponse | OrderRow[]>({
    queryKey: ['report-order-lifecycle', queryUrl],
    queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}${queryUrl}`, {
        headers: adminAuthHeaders(),
        credentials: 'include',
      }).then((r) => r.json());
      return res;
    },
    placeholderData: keepPreviousData,
  });

  const rows: OrderRow[] = Array.isArray(data)
    ? data
    : Array.isArray((data as OrdersResponse)?.data)
      ? ((data as OrdersResponse).data as OrderRow[])
      : Array.isArray((data as OrdersResponse)?.items)
        ? ((data as OrdersResponse).items as OrderRow[])
        : [];

  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  const periodLabel = formatReportPeriodFromDates(from, to, 'Recent orders');
  const filterLabel = `${status} · ${orderMode}`;
  const pdfColumns = COLUMNS.filter((c) => isVisible(c.key)).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((r) => {
        const cancelNote =
          r.statusEvents?.find((e) => e.status === 'CANCELLED')?.note ||
          (r.paymentStatus === 'REFUNDED' ? 'Refunded' : '—');
        return {
          key: r.id,
          cells: [
            isVisible('orderId') ? r.orderNumber : null,
            isVisible('datetime') ? formatDateTime(r.createdAt) : null,
            isVisible('branch') ? branchDisplayName(r.store?.name) : null,
            isVisible('customer')
              ? `${resolveCustomerDisplayName({ guestName: r.guestName, userName: r.user?.name, phone: r.user?.phone ?? r.guestPhone, fallback: '—' })} / ${r.user?.phone ?? r.guestPhone ?? '—'}`
              : null,
            isVisible('type') ? orderModeLabel(r.orderMode) : null,
            isVisible('items') ? itemsSummary(r.items) : null,
            isVisible('status') ? orderStatusLabel(r.status) : null,
            isVisible('reason') ? cancelNote : null,
          ].filter((c) => c != null) as string[],
        };
      }),
    [rows, isVisible],
  );

  return (
    <>
    <ReportSection
      id="order-lifecycle"
      title="Order Lifecycle & Status Log"
      description="Full order trail with status and cancellation/refund context."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && rows.length === 0}
      empty={rows.length === 0}
      onPdfClick={() => setPreviewOpen(true)}
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
          </div>
          <ReportBranchFilter value={storeId} onChange={setStoreId} />
          <div className="flex items-center gap-2">
            <label htmlFor="status" className="text-[11px] font-medium text-muted uppercase tracking-wider">Status</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="orderCategory" className="text-[11px] font-medium text-muted uppercase tracking-wider">Channel</label>
            <select
              id="orderCategory"
              value={orderMode}
              onChange={(e) => setOrderMode(e.target.value as any)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="TAKEAWAY">Pickup</option>
              <option value="DELIVERY">Delivery</option>
            </select>
          </div>
        </div>
      }
      onExportCsv={() =>
        downloadCsv(
          'order-lifecycle.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r) => {
            const cancelNote =
              r.statusEvents?.find((e) => e.status === 'CANCELLED')?.note ||
              (r.paymentStatus === 'REFUNDED' ? 'Refunded' : '');
            return [
              r.orderNumber,
              formatDateTime(r.createdAt),
              branchDisplayName(r.store?.name),
              `${resolveCustomerDisplayName({ guestName: r.guestName, userName: r.user?.name, phone: r.user?.phone ?? r.guestPhone, fallback: '—' })} / ${r.user?.phone ?? r.guestPhone ?? '—'}`,
              orderModeLabel(r.orderMode),
              itemsSummary(r.items),
              orderStatusLabel(r.status),
              cancelNote || '—',
            ];
          }),
        )
      }
      pdfTitle="Order Lifecycle & Status Log"
      pdfReference={`OLS-${Date.now()}`}
      pdfPeriodLabel={periodLabel}
      pdfFilterLabel={filterLabel}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
    >
      <ReportTable
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        footer={rows.length > 0 ? (
          <tr>
            <td colSpan={COLUMNS.filter((c) => visibleColumns[c.key] !== false).length - 1} className="border-t-[3px] border-blue-900/60" />
            <ReportFooterTotalCell label="Total Orders" value={String(rows.length)} prefix="" toneClass="text-blue-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row) => {
          const cancelNote =
            row.statusEvents?.find((e) => e.status === 'CANCELLED')?.note ||
            (row.paymentStatus === 'REFUNDED' ? 'Refunded' : '—');
          return (
            <tr key={row.id} className="border-b border-navy-border hover:bg-navy-light/20">
              {isVisible('orderId') && <td className="px-4 py-3 text-fg text-xs font-mono whitespace-nowrap">{row.orderNumber}</td>}
              {isVisible('datetime') && <td className="px-4 py-3 text-muted text-xs whitespace-nowrap min-w-[140px]">{formatDateTime(row.createdAt)}</td>}
              {isVisible('branch') && <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{branchDisplayName(row.store?.name)}</td>}
              {isVisible('customer') && (
                <td className="px-4 py-3 min-w-[180px]">
                  <p className="text-fg text-sm whitespace-nowrap">
                    {resolveCustomerDisplayName({
                      guestName: row.guestName,
                      userName: row.user?.name,
                      phone: row.user?.phone ?? row.guestPhone,
                      fallback: '—',
                    })}
                  </p>
                  <p className="text-muted text-xs whitespace-nowrap">{row.user?.phone ?? row.guestPhone ?? '—'}</p>
                </td>
              )}
              {isVisible('type') && <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{orderModeLabel(row.orderMode)}</td>}
              {isVisible('items') && <td className="px-4 py-3 text-muted text-xs min-w-[200px] max-w-[280px]">{itemsSummary(row.items)}</td>}
              {isVisible('status') && <td className="px-4 py-3 text-fg text-xs whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold tracking-wide ${
                  row.status === 'DELIVERED' || row.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                  row.status === 'CANCELLED' || row.status === 'REFUNDED' ? 'bg-red-500/15 text-red-600 dark:text-red-400' :
                  row.status === 'OUT_FOR_DELIVERY' || row.status === 'READY' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                  'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}>
                  {orderStatusLabel(row.status)}
                </span>
              </td>}
              {isVisible('reason') && <td className="px-4 py-3 text-muted text-xs min-w-[150px]">{cancelNote}</td>}
            </tr>
          );
        })}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="orders" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Orders"
      reportTitle="Order Lifecycle & Status Log"
      reportDescription="Full order trail with status and cancellation/refund context."
      scopeLabel={storeId ? 'Selected Branch' : 'All Branches'}
      periodLabel={periodLabel}
      filterLabel={filterLabel}
      statusLine={`Live Report · ${rows.length} order${rows.length === 1 ? '' : 's'}`}
      referencePrefix="OLS"
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={8}
      footerTotals={
        rows.length > 0
          ? [{ label: 'Total Orders', value: String(rows.length), tone: 'blue', prefix: '' }]
          : []
      }
      rowCountLabel="orders"
    />
    </>
  );
}
