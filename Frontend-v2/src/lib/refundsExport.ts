import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';
import { shortBranchName } from '@/lib/branchName';
import { cancellationReasonLabel } from '@/lib/cancellationReasons';
import { formatDateTime } from '@/lib/datetime';
import { getStatusLabel } from '@/lib/orderStatus';
import { refundTypeLabel } from '@/lib/refundRequestType';
import { refundStatusLabel, refundSubmittedByLabel } from '@/components/admin/RefundStatusBadge';
import type { OrderStatus } from '@/types';
import * as XLSX from 'xlsx-js-style';

const EXPORT_PAGE_SIZE = 100;

export type RefundExportRow = {
  id: string;
  customerName?: string | null;
  cancellationReason: string;
  customReasonText?: string | null;
  cancelledWithinWindow: boolean;
  salesTotal?: number | null;
  deliveryFee?: number | null;
  convenienceFee?: number | null;
  orderTotal?: number | null;
  refundPercentage?: number | null;
  refundAmount?: number | null;
  cancelledAtStatus?: string | null;
  status: string;
  submittedBy?: string | null;
  createdAt: string;
  order: {
    orderNumber: string;
    orderMode: string;
    total?: number | null;
    deliveryFee?: number | null;
    convenientFee?: number | null;
    discount?: number | null;
    loyaltyDiscount?: number | null;
    guestName?: string | null;
    store?: { id: string; name: string; city?: string | null } | null;
    user?: { id: string; name?: string | null; phone?: string | null } | null;
    statusEvents?: Array<{ status: string; createdAt: string }> | null;
  };
};

type PaginatedRefunds = {
  data: RefundExportRow[];
  meta: { total: number; page: number; limit: number; pages: number };
};

export type RefundExportFilters = {
  search?: string;
  storeId?: string;
  startDate?: string;
  endDate?: string;
};

export type RefundExportOptions = {
  refunds: RefundExportRow[];
  includeBranch: boolean;
  scopeLabel: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  filename: string;
};

const TABLE_BORDER = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
} as const;

const TITLE_STYLE = {
  font: { bold: true, sz: 14, color: { rgb: '0F172A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
} as const;

const SUBTITLE_STYLE = {
  font: { color: { rgb: '475569' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
} as const;

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: TABLE_BORDER,
} as const;

const TEXT_CELL_STYLE = {
  alignment: { vertical: 'center', wrapText: true },
  border: TABLE_BORDER,
} as const;

const NUMBER_CELL_STYLE = {
  alignment: { horizontal: 'right', vertical: 'center' },
  border: TABLE_BORDER,
} as const;

const SUMMARY_ROW_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
  border: TABLE_BORDER,
} as const;

function colLetter(col: number): string {
  return XLSX.utils.encode_col(col);
}

function cellRef(row: number, col: number): string {
  return `${colLetter(col)}${row + 1}`;
}

function setCellValue(sheet: XLSX.WorkSheet, row: number, col: number, value: string | number) {
  const ref = cellRef(row, col);
  if (value === '') {
    sheet[ref] = { t: 's', v: '' };
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    sheet[ref] = { t: 'n', v: value };
    return;
  }
  sheet[ref] = { t: 's', v: String(value) };
}

function applyCellStyle(
  sheet: XLSX.WorkSheet,
  row: number,
  col: number,
  style: Record<string, unknown>,
) {
  const ref = cellRef(row, col);
  if (!sheet[ref]) sheet[ref] = { t: 's', v: '' };
  sheet[ref].s = style;
}

function updateSheetRange(sheet: XLSX.WorkSheet, maxRow: number, maxCol: number) {
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: maxCol },
  });
}

export { shortBranchName } from '@/lib/branchName';

export function formatReason(refund: RefundExportRow): string {
  const base = cancellationReasonLabel(refund.cancellationReason);
  if (refund.cancellationReason === 'OTHER' && refund.customReasonText?.trim()) {
    return `${base}: ${refund.customReasonText.trim()}`;
  }
  return base;
}

export function customerDisplayName(refund: RefundExportRow): string {
  return refund.customerName || refund.order.user?.name || refund.order.guestName || 'Guest';
}

export { refundTypeLabel, refundRequestTypeOf } from '@/lib/refundRequestType';

export function cancelledAtStatusOf(refund: RefundExportRow): OrderStatus | null {
  if (refund.cancelledAtStatus) return refund.cancelledAtStatus as OrderStatus;

  const events = [...(refund.order.statusEvents ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const cancelledIdx = events.findIndex((event) => event.status === 'CANCELLED');
  if (cancelledIdx < 0) return null;

  for (let i = cancelledIdx - 1; i >= 0; i--) {
    if (events[i].status !== 'CANCELLED') return events[i].status as OrderStatus;
  }

  return 'RECEIVED';
}

export function cancelledAtStatusLabel(refund: RefundExportRow): string | null {
  const status = cancelledAtStatusOf(refund);
  if (!status) return null;
  return getStatusLabel(status, refund.order.orderMode as 'DELIVERY' | 'TAKEAWAY');
}

async function adminFetch(endpoint: string): Promise<PaginatedRefunds> {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json as PaginatedRefunds;
}

export async function fetchAllRefundsForExport(filters: RefundExportFilters): Promise<RefundExportRow[]> {
  const all: RefundExportRow[] = [];
  let page = 1;
  let pages = 1;

  while (page <= pages) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(EXPORT_PAGE_SIZE),
    });
    if (filters.search) params.set('search', filters.search);
    if (filters.storeId) params.set('storeId', filters.storeId);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);

    const json = await adminFetch(`/refunds?${params}`);
    all.push(...(json.data ?? []));
    pages = Math.max(1, json.meta?.pages ?? 1);
    if ((json.data ?? []).length === 0) break;
    page += 1;
  }

  return all;
}

const MONEY_HEADERS = [
  'Total Paid',
  'Sales Total',
  'Points',
  'Discounts',
  'Convenience',
  'Delivery',
  'Refund %',
  'Refund Amount',
] as const;

function exportHeaders(includeBranch: boolean): string[] {
  return [
    'Order Number',
    'Customer',
    'Submitted By',
    'Received At',
    'Type',
    ...(includeBranch ? ['Branch'] : []),
    'Cancelled At',
    ...MONEY_HEADERS,
    'Reason',
    'Status',
  ];
}

function moneyValue(...values: Array<number | null | undefined>): number {
  for (const value of values) {
    if (value != null && Number.isFinite(value)) return value;
  }
  return 0;
}

function refundMoneyFields(refund: RefundExportRow) {
  return {
    totalPaid: moneyValue(refund.orderTotal, refund.order.total),
    salesTotal: moneyValue(refund.salesTotal),
    points: moneyValue(refund.order.loyaltyDiscount),
    discounts: moneyValue(refund.order.discount),
    convenience: moneyValue(refund.convenienceFee, refund.order.convenientFee),
    delivery: moneyValue(refund.deliveryFee, refund.order.deliveryFee),
    refundPercent: refund.refundPercentage,
    refundAmount: refund.refundAmount,
  };
}

function formatExportRow(refund: RefundExportRow, includeBranch: boolean): Array<string | number> {
  const money = refundMoneyFields(refund);
  const row: Array<string | number> = [
    refund.order.orderNumber,
    customerDisplayName(refund),
    refundSubmittedByLabel(refund.submittedBy),
    formatDateTime(refund.createdAt),
    refundTypeLabel(refund),
  ];
  if (includeBranch) {
    row.push(refund.order.store?.name ? shortBranchName(refund.order.store.name) : '');
  }
  row.push(
    cancelledAtStatusLabel(refund) ?? '',
    money.totalPaid,
    money.salesTotal,
    money.points,
    money.discounts,
    money.convenience,
    money.delivery,
    money.refundPercent != null ? money.refundPercent : '',
    money.refundAmount != null ? money.refundAmount : '',
    formatReason(refund),
    refundStatusLabel(refund.status),
  );
  return row;
}

function buildSubtitle(options: RefundExportOptions): string {
  const parts = [`Scope: ${options.scopeLabel}`, 'Statuses: All'];
  if (options.startDate || options.endDate) {
    const from = options.startDate ?? '…';
    const to = options.endDate ?? '…';
    parts.push(`Period: ${from === to ? from : `${from} – ${to}`}`);
  }
  if (options.search) parts.push(`Search: ${options.search}`);
  return parts.join('    ');
}

export function refundsExportFilename(startDate?: string, endDate?: string): string {
  if (startDate && endDate) return `refunds-all-statuses-${startDate}-to-${endDate}.xlsx`;
  if (startDate) return `refunds-all-statuses-${startDate}.xlsx`;
  if (endDate) return `refunds-all-statuses-to-${endDate}.xlsx`;
  return 'refunds-all-statuses.xlsx';
}

export function exportRefundsExcel(options: RefundExportOptions) {
  const headers = exportHeaders(options.includeBranch);
  const cancelledAtCol = options.includeBranch ? 6 : 5;
  const moneyStartCol = cancelledAtCol + 1;
  const refundPercentCol = moneyStartCol + 6;
  const refundAmountCol = moneyStartCol + 7;
  const numericColumns = new Set([
    moneyStartCol,
    moneyStartCol + 1,
    moneyStartCol + 2,
    moneyStartCol + 3,
    moneyStartCol + 4,
    moneyStartCol + 5,
    refundPercentCol,
    refundAmountCol,
  ]);

  const titleRow = 0;
  const subtitleRow = 1;
  const headerRow = 3;
  const dataStartRow = headerRow + 1;
  const lastDataRow = dataStartRow + Math.max(options.refunds.length, 1) - 1;
  const summaryRow = lastDataRow + 1;

  const sheet = XLSX.utils.aoa_to_sheet([]);

  setCellValue(sheet, titleRow, 0, 'Refund Requests');
  applyCellStyle(sheet, titleRow, 0, TITLE_STYLE);
  sheet['!merges'] = [
    { s: { r: titleRow, c: 0 }, e: { r: titleRow, c: headers.length - 1 } },
    { s: { r: subtitleRow, c: 0 }, e: { r: subtitleRow, c: headers.length - 1 } },
  ];

  setCellValue(sheet, subtitleRow, 0, buildSubtitle(options));
  applyCellStyle(sheet, subtitleRow, 0, SUBTITLE_STYLE);

  headers.forEach((header, col) => {
    setCellValue(sheet, headerRow, col, header);
  });

  const received = options.refunds.filter((r) => r.status === 'RECEIVED').length;
  const complete = options.refunds.filter((r) => r.status === 'COMPLETE' || r.status === 'PAID').length;
  const rejected = options.refunds.filter((r) => r.status === 'REJECTED').length;
  const moneyTotals = options.refunds.reduce(
    (acc, refund) => {
      const money = refundMoneyFields(refund);
      acc.totalPaid += money.totalPaid;
      acc.salesTotal += money.salesTotal;
      acc.points += money.points;
      acc.discounts += money.discounts;
      acc.convenience += money.convenience;
      acc.delivery += money.delivery;
      acc.refundAmount += money.refundAmount ?? 0;
      return acc;
    },
    { totalPaid: 0, salesTotal: 0, points: 0, discounts: 0, convenience: 0, delivery: 0, refundAmount: 0 },
  );

  options.refunds.forEach((refund, index) => {
    const targetRow = dataStartRow + index;
    formatExportRow(refund, options.includeBranch).forEach((value, col) => {
      setCellValue(sheet, targetRow, col, value);
    });
  });

  const summary: Array<string | number> = headers.map(() => '');
  summary[0] = `Total ${options.refunds.length}  ·  Received ${received}  ·  Complete ${complete}  ·  Rejected ${rejected}`;
  summary[moneyStartCol] = moneyTotals.totalPaid;
  summary[moneyStartCol + 1] = moneyTotals.salesTotal;
  summary[moneyStartCol + 2] = moneyTotals.points;
  summary[moneyStartCol + 3] = moneyTotals.discounts;
  summary[moneyStartCol + 4] = moneyTotals.convenience;
  summary[moneyStartCol + 5] = moneyTotals.delivery;
  summary[refundAmountCol] = moneyTotals.refundAmount;
  summary.forEach((value, col) => {
    setCellValue(sheet, summaryRow, col, value);
  });

  for (let row = headerRow; row <= summaryRow; row += 1) {
    for (let col = 0; col < headers.length; col += 1) {
      const isHeader = row === headerRow;
      const isSummary = row === summaryRow;
      const style = isHeader
        ? HEADER_STYLE
        : isSummary
          ? {
              ...SUMMARY_ROW_STYLE,
              alignment: numericColumns.has(col)
                ? { horizontal: 'right', vertical: 'center' }
                : { vertical: 'center', wrapText: true },
            }
          : numericColumns.has(col)
            ? NUMBER_CELL_STYLE
            : TEXT_CELL_STYLE;
      applyCellStyle(sheet, row, col, style);
    }
  }

  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: lastDataRow, c: headers.length - 1 },
    }),
  };
  sheet['!views'] = [
    {
      state: 'frozen',
      ySplit: headerRow + 1,
      topLeftCell: cellRef(headerRow + 1, 0),
      activeCell: cellRef(headerRow + 1, 0),
    },
  ];

  updateSheetRange(sheet, summaryRow, headers.length - 1);

  const identityCols = options.includeBranch
    ? [{ wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 16 }]
    : [{ wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
  sheet['!cols'] = [
    ...identityCols,
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 36 },
    { wch: 12 },
  ];
  sheet['!rows'] = [{ hpt: 24 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Refunds');
  XLSX.writeFile(workbook, options.filename);
}
