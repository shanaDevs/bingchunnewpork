import * as XLSX from 'xlsx-js-style';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';

export type PromoDiscountMoneyRow = {
  usageCount: number;
  totalDiscount: number;
  branchShare: number;
  platformShare: number;
  orderSales: number;
  discountPct: number;
};

export type PromoDiscountPromoLine = PromoDiscountMoneyRow & {
  promoCode: string;
  promoCodeId: string | null;
  title: string | null;
  ownership: string;
};

export type PromoDiscountBranchLine = PromoDiscountMoneyRow & {
  storeId: string;
  storeName: string;
  orderCount: number;
  grossSales: number;
};

export type PromoDiscountReportPayload = {
  from: string;
  to: string;
  totals: PromoDiscountMoneyRow & { orderCount: number; grossSales: number };
  byBranch: Array<PromoDiscountBranchLine & { promos: PromoDiscountPromoLine[] }>;
  byPromo: Array<PromoDiscountPromoLine & { branches: PromoDiscountBranchLine[] }>;
};

const TABLE_BORDER = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
} as const;

const TITLE_STYLE = {
  font: { bold: true, sz: 16, color: { rgb: '0F172A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
} as const;

const SUBTITLE_STYLE = {
  font: { sz: 11, color: { rgb: '475569' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
} as const;

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '1E3A8A' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: TABLE_BORDER,
} as const;

const TEXT_CELL_STYLE = {
  alignment: { vertical: 'center', wrapText: true },
  border: TABLE_BORDER,
} as const;

const DETAIL_TEXT_STYLE = {
  ...TEXT_CELL_STYLE,
  fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
} as const;

const NUMBER_CELL_STYLE = {
  alignment: { horizontal: 'right', vertical: 'center' },
  border: TABLE_BORDER,
  numFmt: '#,##0.00',
} as const;

const INT_CELL_STYLE = {
  alignment: { horizontal: 'right', vertical: 'center' },
  border: TABLE_BORDER,
  numFmt: '#,##0',
} as const;

const PCT_CELL_STYLE = {
  alignment: { horizontal: 'right', vertical: 'center' },
  border: TABLE_BORDER,
  numFmt: '0.00"%"',
} as const;

const SUMMARY_ROW_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
  border: TABLE_BORDER,
} as const;

const KPI_LABEL_STYLE = {
  font: { bold: true, color: { rgb: '334155' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
  alignment: { vertical: 'center' },
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

function ownershipLabel(ownership: string) {
  const value = (ownership ?? '').toUpperCase();
  if (value === 'BRANCH') return 'Branch';
  if (value === 'SHARED') return 'Shared';
  if (value === 'PLATFORM') return 'Platform';
  return ownership || '—';
}

function promoName(row: { title?: string | null; promoCode: string }) {
  return row.title?.trim() || row.promoCode;
}

const REPORT_SCOPE_LABEL =
  'Paid orders + unpaid pickup (cash at counter), excluding cancelled';

function applyHeaderTitle(
  sheet: XLSX.WorkSheet,
  lastCol: number,
  periodLabel: string,
) {
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];
  setCellValue(sheet, 0, 0, 'Bing Chung — Promotion analysis');
  applyCellStyle(sheet, 0, 0, TITLE_STYLE);
  setCellValue(sheet, 1, 0, `${periodLabel}  ·  ${REPORT_SCOPE_LABEL}`);
  applyCellStyle(sheet, 1, 0, SUBTITLE_STYLE);
  sheet['!rows'] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 8 }, { hpt: 22 }];
}

function freezeAndFilter(sheet: XLSX.WorkSheet, headerRow: number, lastDataRow: number, lastCol: number) {
  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: lastDataRow, c: lastCol },
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

function writeHeaderRow(sheet: XLSX.WorkSheet, headerRow: number, headers: string[]) {
  headers.forEach((header, col) => {
    setCellValue(sheet, headerRow, col, header);
    applyCellStyle(sheet, headerRow, col, HEADER_STYLE);
  });
}

function moneyStyle(isSummary: boolean, isDetail: boolean) {
  return {
    ...(isSummary ? SUMMARY_ROW_STYLE : isDetail ? { ...NUMBER_CELL_STYLE, fill: DETAIL_TEXT_STYLE.fill } : NUMBER_CELL_STYLE),
    alignment: NUMBER_CELL_STYLE.alignment,
    numFmt: NUMBER_CELL_STYLE.numFmt,
    border: TABLE_BORDER,
  };
}

function intStyle(isSummary: boolean, isDetail: boolean) {
  return {
    ...(isSummary ? SUMMARY_ROW_STYLE : isDetail ? { ...INT_CELL_STYLE, fill: DETAIL_TEXT_STYLE.fill } : INT_CELL_STYLE),
    alignment: INT_CELL_STYLE.alignment,
    numFmt: INT_CELL_STYLE.numFmt,
    border: TABLE_BORDER,
  };
}

function pctStyle(isSummary: boolean, isDetail: boolean) {
  return {
    ...(isSummary ? SUMMARY_ROW_STYLE : isDetail ? { ...PCT_CELL_STYLE, fill: DETAIL_TEXT_STYLE.fill } : PCT_CELL_STYLE),
    alignment: PCT_CELL_STYLE.alignment,
    numFmt: PCT_CELL_STYLE.numFmt,
    border: TABLE_BORDER,
  };
}

function buildSummarySheet(
  report: PromoDiscountReportPayload,
  periodLabel: string,
  generatedAt: string,
): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  const lastCol = 1;
  applyHeaderTitle(sheet, lastCol, periodLabel);
  setCellValue(sheet, 2, 0, '');

  const rows: Array<[string, string | number]> = [
    ['Generated', generatedAt],
    ['Period from', report.from],
    ['Period to', report.to],
    ['Report scope', REPORT_SCOPE_LABEL],
    ['Orders in scope', report.totals.orderCount],
    ['Gross sales (LKR)', report.totals.grossSales],
    ['Promo-attributed sales (LKR)', report.totals.orderSales],
    ['Discount applied (LKR)', report.totals.totalDiscount],
    ['Discount % of sales', report.totals.discountPct],
    ['Branch-funded discount (LKR)', report.totals.branchShare],
    ['Platform-funded discount (LKR)', report.totals.platformShare],
    ['Promo redemptions', report.totals.usageCount],
    ['Branches', report.byBranch.length],
    ['Promotions used', report.byPromo.length],
  ];

  const headerRow = 3;
  writeHeaderRow(sheet, headerRow, ['Metric', 'Value']);
  rows.forEach((row, index) => {
    const r = headerRow + 1 + index;
    setCellValue(sheet, r, 0, row[0]);
    setCellValue(sheet, r, 1, row[1]);
    applyCellStyle(sheet, r, 0, KPI_LABEL_STYLE);
    const numeric = typeof row[1] === 'number';
    const isPct = row[0].includes('%');
    const isMoney = row[0].includes('LKR');
    applyCellStyle(
      sheet,
      r,
      1,
      numeric
        ? isPct
          ? PCT_CELL_STYLE
          : isMoney
            ? NUMBER_CELL_STYLE
            : INT_CELL_STYLE
        : TEXT_CELL_STYLE,
    );
  });

  sheet['!cols'] = [{ wch: 36 }, { wch: 28 }];
  updateSheetRange(sheet, headerRow + rows.length, lastCol);
  return sheet;
}

function buildBranchSheet(report: PromoDiscountReportPayload, periodLabel: string): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  const headers = [
    'Type',
    'Name',
    'Code',
    'Owner',
    'Orders',
    'Sales (LKR)',
    'Discount (LKR)',
    'Discount %',
    'Branch share (LKR)',
    'Platform share (LKR)',
    'Promo uses',
  ];
  const lastCol = headers.length - 1;
  applyHeaderTitle(sheet, lastCol, periodLabel);
  const headerRow = 3;
  writeHeaderRow(sheet, headerRow, headers);

  let row = headerRow + 1;
  const moneyCols = new Set([5, 6, 8, 9]);
  const intCols = new Set([4, 10]);
  const pctCols = new Set([7]);

  function writeRow(values: Array<string | number>, isDetail: boolean, isSummary = false) {
    values.forEach((value, col) => {
      setCellValue(sheet, row, col, value);
      const style = isSummary
        ? {
            ...SUMMARY_ROW_STYLE,
            alignment: col === 0 || col === 1
              ? { vertical: 'center', wrapText: true }
              : { horizontal: 'right', vertical: 'center' },
            ...(moneyCols.has(col) ? { numFmt: '#,##0.00' } : {}),
            ...(intCols.has(col) ? { numFmt: '#,##0' } : {}),
            ...(pctCols.has(col) ? { numFmt: '0.00"%"' } : {}),
          }
        : moneyCols.has(col)
          ? moneyStyle(false, isDetail)
          : intCols.has(col)
            ? intStyle(false, isDetail)
            : pctCols.has(col)
              ? pctStyle(false, isDetail)
              : isDetail
                ? DETAIL_TEXT_STYLE
                : TEXT_CELL_STYLE;
      applyCellStyle(sheet, row, col, style);
    });
    row += 1;
  }

  for (const branch of report.byBranch) {
    writeRow(
      [
        'Branch',
        branchDisplayName(branch.storeName),
        '',
        '',
        branch.orderCount,
        branch.grossSales,
        branch.totalDiscount,
        branch.discountPct,
        branch.branchShare,
        branch.platformShare,
        branch.usageCount,
      ],
      false,
    );
    for (const promo of branch.promos) {
      writeRow(
        [
          'Promotion',
          `    ${promoName(promo)}`,
          promo.promoCode,
          ownershipLabel(promo.ownership),
          promo.usageCount,
          promo.orderSales,
          promo.totalDiscount,
          promo.discountPct,
          promo.branchShare,
          promo.platformShare,
          promo.usageCount,
        ],
        true,
      );
    }
  }

  const lastDataRow = row - 1;
  writeRow(
    [
      'Total',
      '',
      '',
      '',
      report.totals.orderCount,
      report.totals.grossSales,
      report.totals.totalDiscount,
      report.totals.discountPct,
      report.totals.branchShare,
      report.totals.platformShare,
      report.totals.usageCount,
    ],
    false,
    true,
  );

  freezeAndFilter(sheet, headerRow, Math.max(lastDataRow, headerRow), lastCol);
  sheet['!cols'] = [
    { wch: 12 },
    { wch: 32 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
  ];
  updateSheetRange(sheet, row - 1, lastCol);
  return sheet;
}

function buildPromoSheet(report: PromoDiscountReportPayload, periodLabel: string): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  const headers = [
    'Type',
    'Name',
    'Code',
    'Owner',
    'Uses',
    'Promo sales (LKR)',
    'Discount (LKR)',
    'Discount %',
    'Branch share (LKR)',
    'Platform share (LKR)',
  ];
  const lastCol = headers.length - 1;
  applyHeaderTitle(sheet, lastCol, periodLabel);
  const headerRow = 3;
  writeHeaderRow(sheet, headerRow, headers);

  let row = headerRow + 1;
  const moneyCols = new Set([5, 6, 8, 9]);
  const intCols = new Set([4]);
  const pctCols = new Set([7]);

  function writeRow(values: Array<string | number>, isDetail: boolean, isSummary = false) {
    values.forEach((value, col) => {
      setCellValue(sheet, row, col, value);
      const style = isSummary
        ? {
            ...SUMMARY_ROW_STYLE,
            alignment: col === 0 || col === 1
              ? { vertical: 'center', wrapText: true }
              : { horizontal: 'right', vertical: 'center' },
            ...(moneyCols.has(col) ? { numFmt: '#,##0.00' } : {}),
            ...(intCols.has(col) ? { numFmt: '#,##0' } : {}),
            ...(pctCols.has(col) ? { numFmt: '0.00"%"' } : {}),
          }
        : moneyCols.has(col)
          ? moneyStyle(false, isDetail)
          : intCols.has(col)
            ? intStyle(false, isDetail)
            : pctCols.has(col)
              ? pctStyle(false, isDetail)
              : isDetail
                ? DETAIL_TEXT_STYLE
                : TEXT_CELL_STYLE;
      applyCellStyle(sheet, row, col, style);
    });
    row += 1;
  }

  for (const promo of report.byPromo) {
    writeRow(
      [
        'Promotion',
        promoName(promo),
        promo.promoCode,
        ownershipLabel(promo.ownership),
        promo.usageCount,
        promo.orderSales,
        promo.totalDiscount,
        promo.discountPct,
        promo.branchShare,
        promo.platformShare,
      ],
      false,
    );
    for (const branch of promo.branches) {
      writeRow(
        [
          'Branch',
          `    ${branchDisplayName(branch.storeName)}`,
          '',
          '',
          branch.usageCount,
          branch.orderSales,
          branch.totalDiscount,
          branch.discountPct,
          branch.branchShare,
          branch.platformShare,
        ],
        true,
      );
    }
  }

  const lastDataRow = row - 1;
  writeRow(
    [
      'Total',
      '',
      '',
      '',
      report.totals.usageCount,
      report.totals.orderSales,
      report.totals.totalDiscount,
      report.totals.discountPct,
      report.totals.branchShare,
      report.totals.platformShare,
    ],
    false,
    true,
  );

  freezeAndFilter(sheet, headerRow, Math.max(lastDataRow, headerRow), lastCol);
  sheet['!cols'] = [
    { wch: 12 },
    { wch: 32 },
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 18 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
  ];
  updateSheetRange(sheet, row - 1, lastCol);
  return sheet;
}

export function exportPromoDiscountWorkbook(
  report: PromoDiscountReportPayload,
  periodLabel: string,
) {
  const generatedAt = new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(report, periodLabel, generatedAt), 'Summary');
  XLSX.utils.book_append_sheet(workbook, buildBranchSheet(report, periodLabel), 'By branch');
  XLSX.utils.book_append_sheet(workbook, buildPromoSheet(report, periodLabel), 'By promotion');
  XLSX.writeFile(workbook, `promo-analysis-${report.from}-to-${report.to}.xlsx`);
}
