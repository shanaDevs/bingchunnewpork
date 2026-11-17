import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';
import { shortBranchName } from '@/lib/branchName';
import { resolveCustomerDisplayName } from '@/lib/customerName';
import { formatDateTime } from '@/lib/datetime';
import { formatOrderChannel, type OrderChannel } from '@/lib/orderChannel';
import { getStatusLabel } from '@/lib/orderStatus';
import { formatOrderPaymentMethodLabel } from '@/lib/paymentMethodLabels';
import { isOrderPaid } from '@/lib/receipt';
import type { OrderStatus, PaymentMethod } from '@/types';
import * as XLSX from 'xlsx-js-style';

const EXPORT_PAGE_SIZE = 100;
const DEFAULT_STATUS_FILTER = 'active';
const DELIVERY_ACTIVE_EXCLUDE = 'DELIVERED,OUT_FOR_DELIVERY';

export type AllOrdersExportOrder = {
  orderNumber: string;
  orderMode: string;
  status: string;
  total: number;
  discount?: number;
  loyaltyDiscount?: number;
  deliveryFee?: number;
  convenientFee?: number;
  createdAt: string;
  paymentMethod: string;
  paymentStatus: string;
  channel?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  items?: Array<{ productName: string; quantity: number }>;
  store?: { name?: string } | null;
  user?: { name?: string; phone?: string } | null;
  refund?: { status: string } | null;
};

export type AllOrdersExportFilters = {
  archiveView: 'delivered' | 'cancelled' | null;
  activeTab: 'pickup' | 'delivery';
  modeFilter: '' | 'TAKEAWAY' | 'DELIVERY';
  statusFilter: string;
  debouncedSearch?: string;
  sortDir: 'desc' | 'asc';
  storeId?: string;
  channelFilter?: '' | OrderChannel;
  processedById?: string;
  startDate?: string;
  endDate?: string;
};

type PaginatedOrders = {
  data: AllOrdersExportOrder[];
  meta: { total: number; page: number; limit: number; pages: number };
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
  font: { bold: true, color: { rgb: '0F172A' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'E2E8F0' } },
  border: TABLE_BORDER,
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
} as const;

const TEXT_CELL_STYLE = {
  border: TABLE_BORDER,
  alignment: { vertical: 'top', wrapText: true },
} as const;

const NUMBER_CELL_STYLE = {
  border: TABLE_BORDER,
  alignment: { horizontal: 'right', vertical: 'top' },
  numFmt: '#,##0.00',
} as const;

function activeExcludeStatus(mode: '' | 'TAKEAWAY' | 'DELIVERY'): string {
  return mode === 'DELIVERY' ? DELIVERY_ACTIVE_EXCLUDE : 'DELIVERED';
}

function buildListParams(filters: AllOrdersExportFilters, page: number): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(EXPORT_PAGE_SIZE),
    sortDir: filters.sortDir,
  });
  if (filters.archiveView === 'delivered') {
    params.set('status', 'DELIVERED');
  } else if (filters.archiveView === 'cancelled') {
    params.set('status', 'CANCELLED');
  } else {
    if (filters.modeFilter) params.set('orderMode', filters.modeFilter);
    if (filters.statusFilter && filters.statusFilter !== DEFAULT_STATUS_FILTER) {
      params.set('status', filters.statusFilter);
    } else if (filters.statusFilter === DEFAULT_STATUS_FILTER && !filters.debouncedSearch) {
      params.set('excludeStatus', activeExcludeStatus(filters.modeFilter));
    }
    if (filters.activeTab === 'delivery') params.set('hideUnassignedReady', 'true');
  }
  if (filters.debouncedSearch) params.set('search', filters.debouncedSearch);
  if (filters.storeId) params.set('storeId', filters.storeId);
  if (filters.channelFilter) params.set('channel', filters.channelFilter);
  if (filters.processedById) params.set('processedById', filters.processedById);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  return params;
}

async function adminFetch(endpoint: string): Promise<PaginatedOrders> {
  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json as PaginatedOrders;
}

export async function fetchAllOrdersForExport(filters: AllOrdersExportFilters): Promise<AllOrdersExportOrder[]> {
  const all: AllOrdersExportOrder[] = [];
  let page = 1;
  let pages = 1;

  while (page <= pages) {
    const params = buildListParams(filters, page);
    const json = await adminFetch(`/orders?${params}`);
    all.push(...(json.data ?? []));
    pages = Math.max(1, json.meta?.pages ?? 1);
    if ((json.data ?? []).length === 0) break;
    page += 1;
  }

  return all;
}

function paymentStatusLabel(order: AllOrdersExportOrder): string {
  const payment = {
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod as PaymentMethod,
  };
  if (isOrderPaid(payment)) return 'Paid';
  if (order.paymentStatus === 'FAILED') return 'Failed';
  return 'Unpaid';
}

function itemsText(order: AllOrdersExportOrder): string {
  return (order.items ?? [])
    .map((item) => `${item.productName} × ${item.quantity}`)
  .join('\n');
}

function discountTotal(order: AllOrdersExportOrder): number {
  return (order.discount ?? 0) + (order.loyaltyDiscount ?? 0);
}

const EXPORT_HEADERS = [
  'Order ID',
  'Branch',
  'Ordered Time',
  'Channel',
  'Items (qty each)',
  'Total (LKR)',
  'Discount (LKR)',
  'Convenience Fee (LKR)',
  'Delivery Fee (LKR)',
  'Customer Name',
  'Mobile Number',
  'Payment Method',
  'Payment Status',
  'Order Status',
] as const;

const MONEY_COLS = new Set([5, 6, 7, 8]);

function formatExportRow(order: AllOrdersExportOrder): Array<string | number> {
  const phone = order.guestPhone?.trim() || order.user?.phone?.trim() || '';
  return [
    order.orderNumber,
    order.store?.name ? shortBranchName(order.store.name) : '',
    formatDateTime(order.createdAt),
    formatOrderChannel(order.channel),
    itemsText(order),
    order.total ?? 0,
    discountTotal(order),
    order.convenientFee ?? 0,
    order.deliveryFee ?? 0,
    resolveCustomerDisplayName({
      guestName: order.guestName,
      userName: order.user?.name,
      phone,
      fallback: '—',
    }),
    phone,
    formatOrderPaymentMethodLabel(order.paymentMethod),
    paymentStatusLabel(order),
    getStatusLabel(order.status as OrderStatus, order.orderMode as 'DELIVERY' | 'TAKEAWAY'),
  ];
}

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

function applyCellStyle(sheet: XLSX.WorkSheet, row: number, col: number, style: Record<string, unknown>) {
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

export function allOrdersExportFilename(startDate?: string, endDate?: string): string {
  if (startDate && endDate) return `all-orders-${startDate}-to-${endDate}.xlsx`;
  if (startDate) return `all-orders-from-${startDate}.xlsx`;
  if (endDate) return `all-orders-to-${endDate}.xlsx`;
  return 'all-orders.xlsx';
}

export type AllOrdersExportOptions = {
  orders: AllOrdersExportOrder[];
  scopeLabel: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  filename: string;
};

function buildSubtitle(options: AllOrdersExportOptions): string {
  const parts = [`Scope: ${options.scopeLabel}`, `Orders: ${options.orders.length}`];
  if (options.startDate || options.endDate) {
    const from = options.startDate ?? '…';
    const to = options.endDate ?? '…';
    parts.push(`Period: ${from === to ? from : `${from} – ${to}`}`);
  }
  if (options.search) parts.push(`Search: ${options.search}`);
  return parts.join('    ');
}

export function exportAllOrdersExcel(options: AllOrdersExportOptions) {
  const headers = [...EXPORT_HEADERS];
  const titleRow = 0;
  const subtitleRow = 1;
  const headerRow = 3;
  const dataStartRow = headerRow + 1;
  const lastDataRow = dataStartRow + Math.max(options.orders.length, 1) - 1;

  const sheet = XLSX.utils.aoa_to_sheet([]);
  setCellValue(sheet, titleRow, 0, 'All Orders');
  applyCellStyle(sheet, titleRow, 0, TITLE_STYLE);
  sheet['!merges'] = [
    { s: { r: titleRow, c: 0 }, e: { r: titleRow, c: headers.length - 1 } },
    { s: { r: subtitleRow, c: 0 }, e: { r: subtitleRow, c: headers.length - 1 } },
  ];
  setCellValue(sheet, subtitleRow, 0, buildSubtitle(options));
  applyCellStyle(sheet, subtitleRow, 0, SUBTITLE_STYLE);

  headers.forEach((header, col) => setCellValue(sheet, headerRow, col, header));

  options.orders.forEach((order, index) => {
    const targetRow = dataStartRow + index;
    formatExportRow(order).forEach((value, col) => setCellValue(sheet, targetRow, col, value));
  });

  for (let row = headerRow; row <= lastDataRow; row += 1) {
    for (let col = 0; col < headers.length; col += 1) {
      const style =
        row === headerRow
          ? HEADER_STYLE
          : MONEY_COLS.has(col)
            ? NUMBER_CELL_STYLE
            : TEXT_CELL_STYLE;
      applyCellStyle(sheet, row, col, style);
    }
  }

  sheet['!cols'] = headers.map((header, col) => ({
    wch:
      col === 4
        ? 36
        : col === 1 || col === 9
          ? 18
          : Math.min(28, Math.max(12, header.length + 2)),
  }));
  sheet['!rows'] = [{ hpt: 22 }, { hpt: 28 }];

  updateSheetRange(sheet, lastDataRow, headers.length - 1);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Orders');
  XLSX.writeFile(workbook, options.filename);
}