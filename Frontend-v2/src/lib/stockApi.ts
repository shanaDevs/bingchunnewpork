import { getApiBaseUrl } from '@/lib/apiBase';
import { adminBadgeClass } from '@/lib/adminBadges';
import { APP_LOCALE, formatDate, formatDateTime } from '@/lib/datetime';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx-js-style';

const API_BASE = getApiBaseUrl();

export type BatchType = 'RESET' | 'EMERGENCY';

export interface StockItem {
  productId: string;
  name: string;
  imageUrl?: string | null;
  basePrice: number;
  cost: number;
  tag?: string | null;
  category: { name: string; slug: string };
  isAvailable: boolean;
  weeklyBaseQty: number;
  weeklyRemainingQty: number;
  weeklyTargetQty: number;
  weeklyReceivedQty: number;
  onHandQty: number;
  onlineAvailableQty: number;
  counterAvailableQty: number;
  batchCount: number;
  totalBatchCount?: number;
  oldestBatchReceivedAt?: string | null;
  frozenBatchCount?: number;
  frozenQty?: number;
  isBranchDeactivated?: boolean;
  isLowStock: boolean;
  isOutOfStock: boolean;
  lowStockThreshold: number;
  onlineOutOfStockThreshold: number;
  outOfStockThreshold: number;
  stockPercent: number;
  isComingSoon?: boolean;
  isNewProduct?: boolean;
  productCreatedAt?: string;
}

export interface StockBatchRow {
  id: string;
  batchNumber: string;
  batchType?: BatchType;
  batchGroupId?: string | null;
  batchGroupNumber?: string | null;
  receivedQty: number;
  remainingQty: number;
  receivedAt: string;
  status: string;
  unitCost?: number | null;
  note?: string | null;
  product?: { id: string; name: string; imageUrl?: string | null };
}

export interface StockBatchGroupRow {
  id: string;
  batchNumber: string;
  resetDate: string;
  note?: string | null;
  createdAt: string;
  productCount: number;
  totalReceivedQty: number;
  createdBy?: { id: string; name: string } | null;
  batches: Array<{
    id: string;
    productId: string;
    productName: string;
    receivedQty: number;
    remainingQty: number;
    status: string;
  }>;
}

export interface StockResetPayload {
  storeId: string;
  resetDate: string;
  note?: string;
  items: Array<{ productId: string; qty: number }>;
}

export interface BulkRestockPayload {
  storeId: string;
  note?: string;
  items: Array<{ productId: string; weeklyTargetQty: number; qty: number }>;
}

export interface StockResponse {
  store: { id: string; name: string; city: string };
  items: StockItem[];
}

export interface StockAuditLog {
  id: string;
  productName: string;
  storeName: string;
  changeType: string;
  qtyBefore: number;
  qtyChange: number;
  qtyAfter: number;
  adminUserName?: string | null;
  orderNumber?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface StockLedgerDayBatch {
  id: string;
  batchNumber: string;
  batchType?: BatchType;
  batchGroupNumber?: string | null;
  status: string;
  receivedQty: number;
  remainingQty: number;
  unitCost: number | null;
  receivedAt: string;
  productId?: string;
  productName?: string;
}

export interface StockLedgerRow {
  date: string;
  openStock: number | null;
  stockValue: number | null;
  stockIn: number | null;
  stockOut: number | null;
  lkrIn: number | null;
  lkrOut: number | null;
  stockMargin: number;
  closingValue: number;
  lkrMargin: number | null;
  discountTotal?: number | null;
  batchNumbers?: string | null;
  batches?: StockLedgerDayBatch[];
}

export interface StockLedgerResponse {
  store: { id: string; name: string };
  product: { id: string; name: string; cost: number; basePrice: number };
  from: string;
  to: string;
  opening: { date: string; stock: number; value: number; lkrMargin: number | null };
  rows: StockLedgerRow[];
  broughtForward: { date: string; stock: number; value: number; lkrMargin: number | null };
}

export interface StockSettingsResult {
  productId: string;
  storeId: string;
  weeklyTargetQty: number;
  weeklyReceivedQty: number;
  lowStockThreshold: number;
  onlineOutOfStockThreshold: number;
}

export interface StockProductPricing {
  storeId: string;
  productId: string;
  productName: string;
  from: string;
  to: string;
  unitCost: number;
  sellingPrice: number;
  catalogUnitCost: number;
  catalogSellingPrice: number;
  batchesInRange: number;
  receivedQtyInRange: number;
}

export type StockLevelTab = 'new_products' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive';
export type StockMainTab = 'table' | 'movement' | 'batches';
export type StockMovementTab = 'all_products' | 'product_wise';

export function computeStockFlags(
  onHand: number,
  base: number,
  item?: Pick<StockItem, 'lowStockThreshold' | 'onlineOutOfStockThreshold' | 'onlineAvailableQty'>,
) {
  const low = item?.lowStockThreshold ?? 25;
  const oos = item?.onlineOutOfStockThreshold ?? 5;
  // onlineAvailableQty is already on-hand minus the OOS buffer (same as backend).
  const onlineAvailable = item?.onlineAvailableQty ?? Math.max(0, onHand - oos);
  const isOutOfStock = onlineAvailable <= 0;
  return {
    isLowStock: !isOutOfStock && onlineAvailable < low,
    isOutOfStock,
    stockPercent: base > 0 ? Math.round((onHand / base) * 100) : 0,
  };
}

export function needsRestockToActivate(item: StockItem): boolean {
  return !item.isAvailable && item.onHandQty <= item.onlineOutOfStockThreshold;
}

/** Default low-stock threshold used when an item does not provide one. */
export const LOW_STOCK_THRESHOLD = 25;

export function canActivateWithQty(qty: number, item?: Pick<StockItem, 'lowStockThreshold'>): boolean {
  const threshold = item?.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
  return qty > threshold;
}

export function suggestedActivationQty(item: StockItem): number {
  return Math.max(item.lowStockThreshold + 1, item.weeklyTargetQty || item.weeklyBaseQty || 30);
}

export function batchTypeLabel(batchType?: BatchType): string {
  switch (batchType) {
    case 'EMERGENCY':
      return 'Emergency';
    case 'RESET':
    default:
      return 'Reset';
  }
}

export function batchTypeBadgeClass(batchType?: BatchType, size: 'sm' | 'md' = 'sm'): string {
  switch (batchType) {
    case 'EMERGENCY':
      return adminBadgeClass('amber', size);
    case 'RESET':
    default:
      return adminBadgeClass('purple', size);
  }
}

export async function previewResetBatchNumber(storeId: string, resetDate: string): Promise<string> {
  const receivedAt = new Date(resetDate);
  receivedAt.setHours(12, 0, 0, 0);
  const res = await adminStockFetch<{ batchNumber: string }>(
    `/admin/stock/reset/preview?storeId=${storeId}&resetDate=${encodeURIComponent(receivedAt.toISOString())}`,
  );
  return res.batchNumber;
}

export async function submitStockReset(payload: StockResetPayload): Promise<{
  groupId: string;
  batchNumber: string;
  results: Array<{ productId: string; batchId: string; onHand: number }>;
}> {
  const resetDate = new Date(payload.resetDate);
  resetDate.setHours(12, 0, 0, 0);
  return adminStockFetch('/admin/stock/reset', {
    method: 'POST',
    body: JSON.stringify({
      storeId: payload.storeId,
      resetDate: resetDate.toISOString(),
      note: payload.note,
      items: payload.items,
    }),
  });
}

export async function submitBulkRestock(payload: BulkRestockPayload): Promise<{
  storeId: string;
  groupId: string;
  batchNumber: string;
  results: Array<{ productId: string; batchId: string; onHand: number }>;
}> {
  return adminStockFetch('/admin/stock/bulk-restock', {
    method: 'POST',
    body: JSON.stringify({
      storeId: payload.storeId,
      note: payload.note,
      items: payload.items,
    }),
  });
}

export async function fetchStockBatchGroups(storeId: string): Promise<StockBatchGroupRow[]> {
  const res = await adminStockFetch<{ groups: StockBatchGroupRow[] }>(
    `/admin/stock/reset-groups?storeId=${storeId}`,
  );
  return res.groups;
}

export function adminStockFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const json = await r.json();
    if (!r.ok) throw new Error(json.message || 'Request failed');
    return json.data as T;
  });
}

export function qtyStatus(item: StockItem): { label: string; dot: string; text: string } {
  if (isBranchInactiveItem(item)) {
    return { label: 'Branch inactive', dot: 'bg-slate-400', text: 'text-slate-400' };
  }
  if (isNewProductItem(item)) {
    return { label: 'Coming soon', dot: 'bg-indigo-400', text: 'text-indigo-300' };
  }
  if (item.isOutOfStock) {
    return { label: 'Out of stock', dot: 'bg-red-500', text: 'text-red-500' };
  }
  if (item.isLowStock) {
    return { label: 'Low stock', dot: 'bg-amber-400', text: 'text-amber-500' };
  }
  return { label: 'In stock', dot: 'bg-emerald-500', text: 'text-emerald-500' };
}

export function isBestsellerTag(tag?: string | null): boolean {
  if (!tag) return false;
  const t = tag.toLowerCase();
  return t.includes('best') || t.includes('popular') || t.includes('signature');
}

export function isNewProductItem(item: StockItem): boolean {
  // Catalog seed uses isAvailable=false; only branch deactivation excludes New Products.
  if (isBranchInactiveItem(item)) return false;
  if (item.isNewProduct != null) return item.isNewProduct;
  return (
    item.onHandQty === 0 &&
    item.weeklyTargetQty === 0 &&
    item.weeklyReceivedQty === 0 &&
    (item.totalBatchCount ?? item.batchCount ?? 0) === 0
  );
}

export function isBranchInactiveItem(item: StockItem): boolean {
  return item.isBranchDeactivated === true || (item.frozenBatchCount ?? 0) > 0;
}

/** Low/out-of-stock online restock — emergency batch (online available below low-stock threshold). */
export function isEmergencyRestock(item: StockItem): boolean {
  if (isNewProductItem(item)) return false;
  if ((item.totalBatchCount ?? item.batchCount ?? 0) === 0) return false;
  const low = item.lowStockThreshold ?? 25;
  if (item.onlineAvailableQty < low) return true;
  if (item.weeklyTargetQty > 0 && item.onHandQty >= item.weeklyTargetQty) return true;
  return false;
}

/** @deprecated Use isEmergencyRestock */
export function isOutOfStockRestock(item: StockItem): boolean {
  return isEmergencyRestock(item);
}

/** First delivery or healthy in-stock replenishment below weekly target — reset batch (R-). */
export function canUseResetReceive(item: StockItem): boolean {
  if (isNewProductItem(item)) return true;
  if (isEmergencyRestock(item)) return false;
  if (item.weeklyTargetQty <= 0) return true;
  return item.onHandQty < item.weeklyTargetQty;
}

/** @deprecated Use canUseResetReceive */
export function canUseNormalReceive(item: StockItem): boolean {
  return canUseResetReceive(item);
}

/** Low/out-of-stock restock or at/above weekly target — emergency batch (E-). */
export function canUseEmergencyReceive(item: StockItem): boolean {
  return isEmergencyRestock(item);
}

export function canReceiveStock(item: StockItem): boolean {
  return canUseResetReceive(item) || canUseEmergencyReceive(item);
}

export function hasWeeklyTargetConfigured(item: StockItem): boolean {
  return item.weeklyTargetQty > 0;
}

export function canBranchAdminReceiveStock(item: StockItem): boolean {
  return canReceiveStock(item) && hasWeeklyTargetConfigured(item);
}

export function resolveReceiveBatchType(item: StockItem): Extract<BatchType, 'RESET' | 'EMERGENCY'> {
  return canUseEmergencyReceive(item) ? 'EMERGENCY' : 'RESET';
}

/** Max units allowed in a reset receive before hitting weekly target; null = no cap. */
export function maxResetReceiveQty(item: StockItem): number | null {
  if (isNewProductItem(item)) return null;
  if (item.weeklyTargetQty <= 0) return null;
  return Math.max(0, item.weeklyTargetQty - item.onHandQty);
}

/** @deprecated Use maxResetReceiveQty */
export function maxNormalReceiveQty(item: StockItem): number | null {
  return maxResetReceiveQty(item);
}

export function isOutOfStockTabItem(item: StockItem): boolean {
  return !isBranchInactiveItem(item) && !isNewProductItem(item) && item.isOutOfStock;
}

export function matchesStockLevelTab(item: StockItem, tab: StockLevelTab): boolean {
  if (tab === 'inactive') return isBranchInactiveItem(item);
  if (isBranchInactiveItem(item)) return false;
  if (tab === 'new_products') return isNewProductItem(item);
  if (tab === 'in_stock') return !isNewProductItem(item) && !item.isLowStock && !item.isOutOfStock;
  if (tab === 'low_stock') return !isNewProductItem(item) && item.isLowStock && !item.isOutOfStock;
  return isOutOfStockTabItem(item);
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportStockCsv(items: StockItem[], storeName: string) {
  downloadCsv(`branch-stock-${storeName.replace(/\s+/g, '-').toLowerCase()}.csv`, [
    ['Product', 'Category', 'Price (LKR)', 'Weekly Target', 'Received This Week', 'On Hand', 'Status', 'Active'],
    ...items.map((i) => [
      i.name,
      i.category.name,
      i.basePrice,
      i.weeklyTargetQty,
      i.weeklyReceivedQty,
      i.onHandQty,
      qtyStatus(i).label,
      i.isAvailable ? 'Active' : 'Inactive',
    ]),
  ]);
  toast.success('Stock exported');
}

export function exportAuditCsv(filename: string, logs: StockAuditLog[]) {
  downloadCsv(filename, [
    ['Date', 'Product', 'Branch', 'Type', 'Before', 'Change', 'After', 'User', 'Order', 'Note'],
    ...logs.map((l) => [
      formatDateTime(l.createdAt),
      l.productName,
      l.storeName,
      l.changeType,
      l.qtyBefore,
      l.qtyChange,
      l.qtyAfter,
      l.adminUserName ?? '',
      l.orderNumber ?? '',
      l.note ?? '',
    ]),
  ]);
  toast.success(`Exported ${logs.length} movement record(s)`);
}

export async function fetchMovementLedger(params: {
  storeId: string;
  from: string;
  to: string;
  productId?: string;
}): Promise<StockLedgerResponse> {
  const qs = new URLSearchParams({
    storeId: params.storeId,
    from: params.from,
    to: params.to,
  });
  if (params.productId) qs.set('productId', params.productId);
  return adminStockFetch<StockLedgerResponse>(`/admin/stock/movement-ledger?${qs.toString()}`);
}

export async function fetchAllAuditLogs(params: {
  storeId: string;
  from: string;
  to: string;
  productId?: string;
}): Promise<StockAuditLog[]> {
  const limit = 200;
  let page = 1;
  const all: StockAuditLog[] = [];

  while (true) {
    const qs = new URLSearchParams({
      storeId: params.storeId,
      from: params.from,
      to: params.to,
      limit: String(limit),
      page: String(page),
    });
    if (params.productId) qs.set('productId', params.productId);

    const res = await adminStockFetch<{
      logs: StockAuditLog[];
      pagination: { totalPages: number };
    }>(`/admin/stock/audit-logs?${qs.toString()}`);

    all.push(...res.logs);
    if (page >= res.pagination.totalPages) break;
    page += 1;
  }

  return all;
}

function formatCsvDate(isoDate: string): string {
  return formatDate(`${isoDate}T12:00:00`);
}

function formatLedgerBranchName(name: string): string {
  return name.replace('Bing Chun - ', '');
}

function formatLedgerQty(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString(APP_LOCALE, { maximumFractionDigits: 0 });
}

const LEDGER_TABLE_BORDER = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
} as const;

const LEDGER_TITLE_STYLE = {
  font: { bold: true, sz: 14, color: { rgb: '0F172A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
} as const;

const LEDGER_SUBTITLE_STYLE = {
  font: { color: { rgb: '475569' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
} as const;

const LEDGER_HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: LEDGER_TABLE_BORDER,
} as const;

const LEDGER_TEXT_CELL_STYLE = {
  alignment: { vertical: 'center', wrapText: true },
  border: LEDGER_TABLE_BORDER,
} as const;

const LEDGER_NUMBER_CELL_STYLE = {
  alignment: { horizontal: 'right', vertical: 'center' },
  border: LEDGER_TABLE_BORDER,
} as const;

const LEDGER_SUMMARY_ROW_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
  border: LEDGER_TABLE_BORDER,
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

function styleLedgerTableSheet(
  sheet: XLSX.WorkSheet,
  headerRow: number,
  lastRow: number,
  summaryRows: number[],
) {
  const numericColumns = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  for (let row = headerRow; row <= lastRow; row += 1) {
    for (let col = 0; col < LEDGER_EXPORT_HEADERS.length; col += 1) {
      const isHeader = row === headerRow;
      const isSummary = summaryRows.includes(row);
      const style = isHeader
        ? LEDGER_HEADER_STYLE
        : isSummary
          ? {
              ...LEDGER_SUMMARY_ROW_STYLE,
              alignment: numericColumns.has(col)
                ? { horizontal: 'right', vertical: 'center' }
                : { vertical: 'center', wrapText: true },
            }
          : numericColumns.has(col)
            ? LEDGER_NUMBER_CELL_STYLE
            : LEDGER_TEXT_CELL_STYLE;
      applyCellStyle(sheet, row, col, style);
    }
  }

  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: lastRow, c: LEDGER_EXPORT_HEADERS.length - 1 },
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
}

function updateSheetRange(sheet: XLSX.WorkSheet, maxRow: number, maxCol: number) {
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: maxCol },
  });
}

function styleBatchDetailSheet(sheet: XLSX.WorkSheet, headerRow: number, lastRow: number, colCount: number) {
  const numericStart = colCount === 8 ? 4 : 3;

  for (let row = headerRow; row <= lastRow; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const isHeader = row === headerRow;
      const isNumeric = col >= numericStart && col <= numericStart + 2;
      applyCellStyle(
        sheet,
        row,
        col,
        isHeader
          ? LEDGER_HEADER_STYLE
          : isNumeric
            ? LEDGER_NUMBER_CELL_STYLE
            : LEDGER_TEXT_CELL_STYLE,
      );
    }
  }

  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: lastRow, c: colCount - 1 },
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
}

function formatLedgerBatchCell(row: StockLedgerRow): string {
  const batches = row.batches ?? [];
  if (batches.length === 1) {
    return `${batches[0].batchNumber} (${batches[0].receivedQty.toLocaleString(APP_LOCALE)} units received)`;
  }
  if (batches.length > 1) {
    const receivedTotal = batches.reduce((sum, batch) => sum + batch.receivedQty, 0);
    return `${batches.length} batches (${receivedTotal.toLocaleString(APP_LOCALE)} units received)`;
  }
  if (row.batchNumbers) {
    const parts = row.batchNumbers.split(', ').filter(Boolean);
    if (parts.length === 1) return parts[0];
    if (parts.length > 1) return `${parts.length} batches`;
  }
  return '—';
}

function formatLedgerPeriod(from: string, to: string): string {
  const fromLabel = formatCsvDate(from);
  const toLabel = formatCsvDate(to);
  return fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
}

const LEDGER_EXPORT_HEADERS = [
  'Date',
  'Open Stock',
  'Stock Value (LKR)',
  'Stock In',
  'Stock Out',
  'LKR In',
  'LKR Out',
  'Stock Margin',
  'LKR Margin',
  'Discount (LKR)',
  'Batch Number',
] as const;

function buildLedgerExportRows(ledger: StockLedgerResponse): (string | number)[][] {
  const emptyMovement = ['—', '—', '—', '—'] as const;

  const openingRow: (string | number)[] = [
    `Opening Balance (${formatCsvDate(ledger.opening.date)})`,
    formatLedgerQty(ledger.opening.stock),
    formatLedgerQty(ledger.opening.value),
    ...emptyMovement,
    '—',
    formatLedgerQty(ledger.opening.lkrMargin),
    '—',
    '—',
  ];

  const dayRows = ledger.rows.map((row) => [
    formatCsvDate(row.date),
    formatLedgerQty(row.openStock),
    formatLedgerQty(row.stockValue),
    formatLedgerQty(row.stockIn),
    formatLedgerQty(row.stockOut),
    formatLedgerQty(row.lkrIn),
    formatLedgerQty(row.lkrOut),
    formatLedgerQty(row.stockMargin),
    formatLedgerQty(row.lkrMargin),
    formatLedgerQty(row.discountTotal),
    formatLedgerBatchCell(row),
  ]);

  const broughtForwardRow: (string | number)[] = [
    `Brought Forward (${formatCsvDate(ledger.broughtForward.date)})`,
    formatLedgerQty(ledger.broughtForward.stock),
    formatLedgerQty(ledger.broughtForward.value),
    ...emptyMovement,
    formatLedgerQty(ledger.broughtForward.stock),
    formatLedgerQty(ledger.broughtForward.lkrMargin),
    '—',
    '—',
  ];

  return [openingRow, ...dayRows, broughtForwardRow];
}

function buildLedgerBatchDetailRows(
  ledger: StockLedgerResponse,
  showProduct: boolean,
): (string | number)[][] {
  const headers = [
    'Date',
    'Batch Number',
    ...(showProduct ? ['Product'] : []),
    'Status',
    'Received (units)',
    'Unit Cost (LKR)',
    'Remaining (units)',
    'Received Time',
  ];

  const rows: (string | number)[][] = [headers];

  for (const row of ledger.rows) {
    for (const batch of row.batches ?? []) {
      rows.push([
        formatCsvDate(row.date),
        batch.batchNumber,
        ...(showProduct ? [batch.productName ?? '—'] : []),
        batch.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        formatLedgerQty(batch.receivedQty),
        formatLedgerQty(batch.unitCost ?? ledger.product.cost),
        formatLedgerQty(batch.remainingQty),
        formatDateTime(batch.receivedAt, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).replace(',', ' ·'),
      ]);
    }
  }

  return rows;
}

export function exportLedgerExcel(filename: string, ledger: StockLedgerResponse) {
  const showProduct = ledger.product.id === 'all';
  const branchLabel = formatLedgerBranchName(ledger.store.name);
  const periodLabel = formatLedgerPeriod(ledger.from, ledger.to);
  const ledgerRows = buildLedgerExportRows(ledger);

  const titleRow = 0;
  const subtitleRow = 1;
  const headerRow = 3;
  const dataStartRow = headerRow + 1;
  const openingRow = dataStartRow;
  const dayStartRow = openingRow + 1;
  const broughtForwardRow = dayStartRow + ledger.rows.length;
  const lastRow = broughtForwardRow;

  const sheet = XLSX.utils.aoa_to_sheet([]);

  setCellValue(sheet, titleRow, 0, 'Branch Stock Ledger');
  applyCellStyle(sheet, titleRow, 0, LEDGER_TITLE_STYLE);
  sheet['!merges'] = [
    { s: { r: titleRow, c: 0 }, e: { r: titleRow, c: LEDGER_EXPORT_HEADERS.length - 1 } },
    { s: { r: subtitleRow, c: 0 }, e: { r: subtitleRow, c: LEDGER_EXPORT_HEADERS.length - 1 } },
  ];

  setCellValue(
    sheet,
    subtitleRow,
    0,
    `Branch: ${branchLabel}    Product: ${ledger.product.name}    Period: ${periodLabel}`,
  );
  applyCellStyle(sheet, subtitleRow, 0, LEDGER_SUBTITLE_STYLE);

  LEDGER_EXPORT_HEADERS.forEach((header, col) => {
    setCellValue(sheet, headerRow, col, header);
  });

  ledgerRows.forEach((row, index) => {
    const targetRow = dataStartRow + index;
    row.forEach((value, col) => {
      setCellValue(sheet, targetRow, col, value);
    });
  });

  styleLedgerTableSheet(sheet, headerRow, lastRow, [openingRow, broughtForwardRow]);
  updateSheetRange(sheet, lastRow, LEDGER_EXPORT_HEADERS.length - 1);

  sheet['!cols'] = [
    { wch: 30 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 42 },
  ];
  sheet['!rows'] = [{ hpt: 24 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ledger');

  const batchDetailRows = buildLedgerBatchDetailRows(ledger, showProduct);
  if (batchDetailRows.length > 1) {
    const batchHeaderRow = 0;
    const batchLastRow = batchDetailRows.length - 1;
    const batchColCount = batchDetailRows[0].length;
    const batchSheet = XLSX.utils.aoa_to_sheet([]);

    batchDetailRows.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        setCellValue(batchSheet, rowIndex, colIndex, value);
      });
    });

    styleBatchDetailSheet(batchSheet, batchHeaderRow, batchLastRow, batchColCount);
    updateSheetRange(batchSheet, batchLastRow, batchColCount - 1);
    batchSheet['!cols'] = [
      { wch: 14 },
      { wch: 24 },
      ...(showProduct ? [{ wch: 28 }] : []),
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
    ];
    batchSheet['!rows'] = [{ hpt: 28 }];
    XLSX.utils.book_append_sheet(workbook, batchSheet, 'Batch Details');
  }

  const outputName = filename.endsWith('.xlsx') ? filename : `${filename.replace(/\.csv$/i, '')}.xlsx`;
  XLSX.writeFile(workbook, outputName);
  toast.success(`Exported ${ledger.rows.length} day(s) for ${periodLabel}`);
}

/** @deprecated Use exportLedgerExcel */
export function exportLedgerCsv(filename: string, ledger: StockLedgerResponse) {
  exportLedgerExcel(filename, ledger);
}
