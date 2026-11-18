import PDFDocument from 'pdfkit';
import type PDFKit from 'pdfkit';
import type { SettlementPaymentMethodKey } from '../settlementPaymentMethod';
import {
  DARTCODES_ISSUER,
  INVOICE_COLORS as C,
  INVOICE_CONTENT_TOP,
  INVOICE_SANS as SANS,
  INVOICE_SANS_BOLD as SANS_BOLD,
  INVOICE_SERIF as SERIF,
} from './constants';
import { formatInvoiceDate, formatSettlementPeriodLabel, paymentMethodLabel } from './format';
import type { DeliveryWalletSummary } from '../deliveryWalletService';
import { collectPdfBuffer } from './parsing';
import {
  brandLogoPath,
  drawInvoicePageBackground,
  drawLineTable,
  ensureContentFits,
  hr,
} from './pdfDrawing';
import type { LineTableColumn, LineTableRow } from './types';

const BRANCH_ROW_H = 18;
const PAGE_FOOTER_MARGIN = 52;

function drawTableColumnHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  columns: LineTableColumn[],
): number {
  doc.fillColor(C.textMuted).font(SANS_BOLD).fontSize(7.5);
  let colX = x;
  for (const col of columns) {
    doc.text(col.title, colX, y + 4, { width: col.width, align: col.align, characterSpacing: 1.2 });
    colX += col.width;
  }
  let nextY = y + 22;
  nextY = hr(doc, x, nextY, columns.reduce((sum, c) => sum + c.width, 0)) + 10;
  return nextY;
}

function drawPaginatedLineTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  columns: LineTableColumn[],
  rows: LineTableRow[],
  pageW: number,
  pageH: number,
): number {
  const pageBottom = pageH - PAGE_FOOTER_MARGIN;
  let tableY = drawTableColumnHeader(doc, x, y, columns);

  for (const row of rows) {
    const beforeFit = tableY;
    tableY = ensureContentFits(doc, tableY, BRANCH_ROW_H + 6, pageBottom, pageW, pageH);
    if (tableY !== beforeFit) {
      tableY = drawTableColumnHeader(doc, x, tableY, columns);
    }

    let colX = x;
    row.cells.forEach((cell, i) => {
      const col = columns[i]!;
      const isAmountCol = i === row.cells.length - 1;
      let color: string = C.text;
      if (row.muted) color = C.textMuted;
      else if (row.brand && isAmountCol) color = C.brandDark;
      doc
        .fillColor(color)
        .font(row.bold ? SANS_BOLD : SANS)
        .fontSize(row.bold ? 10 : 9)
        .text(cell, colX, tableY + 2, { width: col.width, align: col.align, lineGap: 0 });
      colX += col.width;
    });
    tableY += BRANCH_ROW_H;
    tableY = hr(doc, x, tableY, w, C.line, 0.5);
  }

  return tableY + 6;
}

export type DeliveryPayoutStatementInput = {
  payoutId: string;
  status: string;
  statusLabel: string;
  periodFrom: Date;
  periodTo: Date;
  paidAt: Date;
  amountLkr: number;
  paymentMethod: string | null;
  checkNumber?: string | null;
  checkDate?: Date | null;
  summary: DeliveryWalletSummary;
};

function formatLkrAmount(lkr: number): string {
  return lkr.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function renderDeliveryPayoutStatementToBuffer(
  input: DeliveryPayoutStatementInput,
): Promise<Buffer> {
  const summary = input.summary;
  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  const bufferPromise = collectPdfBuffer(doc);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const marginX = 56;
  const contentW = pageW - marginX * 2;

  drawInvoicePageBackground(doc, pageW, pageH);

  let y = INVOICE_CONTENT_TOP;
  const logoPath = brandLogoPath();
  const logoSize = 36;
  if (logoPath) {
    doc.image(logoPath, marginX, y, { width: logoSize, height: logoSize });
  }

  const issuerTextX = logoPath ? marginX + logoSize + 12 : marginX;
  doc.fillColor(C.navy).font(SANS_BOLD).fontSize(14).text(DARTCODES_ISSUER.name, issuerTextX, y + 2);
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(8)
    .text(DARTCODES_ISSUER.tagline, issuerTextX, y + 20, { characterSpacing: 0.3 });

  const titleX = marginX + contentW * 0.48;
  const titleW = contentW * 0.52;
  doc.fillColor(C.navy).font(SERIF).fontSize(26).text('Delivery payout', titleX, y - 2, {
    width: titleW,
    align: 'right',
  });
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(9)
    .text(`Statement ref  DP-${input.payoutId.slice(0, 8).toUpperCase()}`, titleX, y + 36, {
      width: titleW,
      align: 'right',
    });

  y += 72;

  const periodLabel = formatSettlementPeriodLabel(input.periodFrom, input.periodTo);
  const paidLabel = input.paidAt.toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const methodLabel = input.paymentMethod
    ? paymentMethodLabel(input.paymentMethod as SettlementPaymentMethodKey)
    : '—';

  doc.fillColor(C.textMuted).font(SANS_BOLD).fontSize(7.5).text('DELIVERY PARTNER', marginX, y, {
    characterSpacing: 1.4,
  });
  y += 16;
  doc.fillColor(C.navy).font(SANS_BOLD).fontSize(11).text('Delivery Partner', marginX, y);
  y += 16;
  doc.fillColor(C.textMuted).font(SANS).fontSize(9.5).text(`Period  ${periodLabel}`, marginX, y);
  y += 14;
  doc.text(`Recorded  ${paidLabel}`, marginX, y);
  y += 14;
  doc.text(`Status  ${input.statusLabel}`, marginX, y);
  y += 14;
  doc.text(`Payment method  ${methodLabel}`, marginX, y);
  if (input.paymentMethod === 'CHECK') {
    y += 14;
    doc.text(`Cheque number  ${input.checkNumber?.trim() || '—'}`, marginX, y);
    const checkDateLabel = input.checkDate ? formatInvoiceDate(input.checkDate) : null;
    if (checkDateLabel) {
      y += 14;
      doc.text(`Cheque date  ${checkDateLabel}`, marginX, y);
    }
  }
  y += 22;

  doc.fillColor(C.navy).font(SERIF).fontSize(14).text('Summary', marginX, y);
  y += 20;

  const summaryRows: LineTableRow[] = [
    {
      cells: ['Gross delivery fees', `LKR ${formatLkrAmount(summary.grossDeliveryFee)}`],
    },
    {
      cells: [
        `Platform fee (${summary.platformFeePercent}%)`,
        `LKR ${formatLkrAmount(summary.platformFee)}`,
      ],
    },
    {
      cells: [
        `Payment gateway fee (${summary.gatewayFeePercent}%)`,
        `LKR ${formatLkrAmount(summary.gatewayFee)}`,
      ],
    },
    {
      cells: ['Net for delivery', `LKR ${formatLkrAmount(summary.netForDelivery)}`],
      bold: true,
      brand: true,
    },
    {
      cells: ['Payout amount', `LKR ${formatLkrAmount(input.amountLkr)}`],
      bold: true,
    },
  ];

  const summaryCols: LineTableColumn[] = [
    { title: 'Line', width: contentW * 0.62, align: 'left' },
    { title: 'Amount', width: contentW * 0.38, align: 'right' },
  ];

  y = drawLineTable(doc, marginX, y, contentW, summaryCols, summaryRows) + 18;

  doc.fillColor(C.navy).font(SERIF).fontSize(14).text('By branch', marginX, y);
  y += 20;

  const branchCols: LineTableColumn[] = [
    { title: 'Branch', width: contentW * 0.28, align: 'left' },
    { title: 'Orders', width: contentW * 0.1, align: 'right' },
    { title: 'Gross', width: contentW * 0.14, align: 'right' },
    { title: 'Platform', width: contentW * 0.14, align: 'right' },
    { title: 'Gateway', width: contentW * 0.14, align: 'right' },
    { title: 'Net', width: contentW * 0.2, align: 'right' },
  ];

  const branches = summary.branches ?? [];
  const branchRows: LineTableRow[] =
    branches.length > 0
      ? branches.map((b) => ({
          cells: [
            b.storeName,
            String(b.orderCount),
            formatLkrAmount(b.grossDeliveryFee),
            formatLkrAmount(b.platformFee),
            formatLkrAmount(b.gatewayFee),
            formatLkrAmount(b.netForDelivery),
          ],
        }))
      : [
          {
            cells: ['No branch activity', '—', '—', '—', '—', '—'],
            muted: true,
          },
        ];

  y = drawPaginatedLineTable(doc, marginX, y, contentW, branchCols, branchRows, pageW, pageH);

  y = ensureContentFits(doc, y, 28, pageH - PAGE_FOOTER_MARGIN, pageW, pageH);
  y += 8;
  y = hr(doc, marginX, y, contentW, C.line, 0.5);
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(8)
    .text(
      `${summary.orderCount} orders · ${summary.lateCancelCount} late cancels · Generated for records`,
      marginX,
      y + 8,
      { width: contentW },
    );

  doc.end();
  return bufferPromise;
}
