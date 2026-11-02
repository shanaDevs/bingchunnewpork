import type PDFKit from 'pdfkit';
import {
  WD_INVOICE_COLORS as C,
  WD_INVOICE_CONTENT_TOP,
  WD_INVOICE_FIXED_NOTES,
  WD_INVOICE_HEADER_H,
  WD_INVOICE_MARGIN_X,
  WD_INVOICE_PAGE2_HEADER_H,
  WD_INVOICE_PAGE2_ROW_H,
  WD_INVOICE_RADIUS,
  WD_INVOICE_ROW_H,
  WD_INVOICE_SECTION_GAP,
} from './constants';
import { WD_FONT, withdrawalMascotPath } from './fonts';
import type { InvoicePageLayout, WithdrawalTableRow } from './types';

export type WithdrawalFooterLayout = {
  footerRuleY: number;
  colsStartY: number;
};

export function drawWhitePage(doc: PDFKit.PDFDocument, pageW: number, pageH: number): void {
  doc.rect(0, 0, pageW, pageH).fill(C.bg);
}

const WD_INVOICE_FOOTER_COLS_H = 35;
const WD_INVOICE_NOTES_FOOTER_GAP = 18;

export function computeWithdrawalFooterLayout(pageH: number): WithdrawalFooterLayout {
  const colsStartY = pageH - 88;
  return {
    footerRuleY: colsStartY - 16,
    colsStartY,
  };
}

/** Place footer below notes when the default footer zone would overlap page-1 content. */
export function layoutFooterBelowNotes(
  pageH: number,
  notesBottomY: number,
): WithdrawalFooterLayout {
  const defaultLayout = computeWithdrawalFooterLayout(pageH);
  const minRuleY = notesBottomY + WD_INVOICE_NOTES_FOOTER_GAP;
  if (minRuleY <= defaultLayout.footerRuleY) {
    return defaultLayout;
  }
  return {
    footerRuleY: minRuleY,
    colsStartY: minRuleY + 16,
  };
}

export function measureNotesBlockHeight(doc: PDFKit.PDFDocument, contentW: number): number {
  const pad = 12;
  const textW = contentW - pad * 2;
  doc.font(WD_FONT.regular).fontSize(9);
  const textH = doc.heightOfString(WD_INVOICE_FIXED_NOTES, { width: textW });
  const boxH = textH + pad * 2;
  return 18 + boxH;
}

export function page1ContentOverflows(
  pageH: number,
  yBeforeSummaryTitle: number,
  summaryRows: WithdrawalTableRow[],
  summaryRowH: number,
  notesBlockH: number,
): boolean {
  const summaryTitleH = 18;
  const summaryTableH = measureTableHeight(summaryRows, summaryRowH);
  const notesStart =
    yBeforeSummaryTitle + summaryTitleH + summaryTableH + WD_INVOICE_SECTION_GAP;
  const notesEnd = notesStart + notesBlockH;
  const footer = layoutFooterBelowNotes(pageH, notesEnd);
  return footer.colsStartY + WD_INVOICE_FOOTER_COLS_H > pageH - 8;
}

export function resolvePage1SummaryRowH(
  pageH: number,
  yBeforeSummaryTitle: number,
  summaryRows: WithdrawalTableRow[],
  notesBlockH: number,
): number {
  const candidates = [WD_INVOICE_ROW_H, 28, WD_INVOICE_PAGE2_ROW_H];
  let rowH = WD_INVOICE_PAGE2_ROW_H;
  for (const candidate of candidates) {
    if (!page1ContentOverflows(pageH, yBeforeSummaryTitle, summaryRows, candidate, notesBlockH)) {
      rowH = candidate;
    }
  }
  return rowH;
}

function hr(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  color: string = C.border,
  weight = 0.6,
): number {
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(weight).strokeColor(color).stroke();
  return y;
}

export function drawSectionTitle(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
  compact = false,
): number {
  doc
    .fillColor(C.text)
    .font(WD_FONT.bold)
    .fontSize(compact ? 10 : 11)
    .text(title.toUpperCase(), x, y, { width: w, characterSpacing: 0.6, lineBreak: false });
  return y + (compact ? 14 : 18);
}

function rowHeight(row: WithdrawalTableRow, baseH: number): number {
  return row.hint ? baseH + 8 : baseH;
}

export function measureTableHeight(
  rows: WithdrawalTableRow[],
  rowH: number,
  headerH = WD_INVOICE_HEADER_H,
): number {
  return headerH + rows.reduce((sum, row) => sum + rowHeight(row, rowH), 0);
}

type TableKind = 'sales' | 'amount';

export function drawWithdrawalTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  rows: WithdrawalTableRow[],
  kind: TableKind,
  rowH = WD_INVOICE_ROW_H,
  headerH = WD_INVOICE_HEADER_H,
): number {
  const tableH = measureTableHeight(rows, rowH, headerH);
  const descW = kind === 'sales' ? w * 0.5 : w * 0.68;
  const ordersW = kind === 'sales' ? w * 0.18 : 0;
  const amountW = w - descW - ordersW;
  const padX = 12;

  doc.save();
  doc.roundedRect(x, y, w, tableH, WD_INVOICE_RADIUS).lineWidth(0.7).strokeColor(C.border).stroke();
  doc.restore();

  doc.save();
  doc.roundedRect(x, y, w, headerH, WD_INVOICE_RADIUS).fill(C.headerFill);
  doc.rect(x, y + headerH - 4, w, 4).fill(C.headerFill);
  doc.restore();

  const headerTextY = y + Math.max(4, (headerH - 8) / 2);
  doc.fillColor(C.text).font(WD_FONT.semibold).fontSize(headerH < 24 ? 7 : 8);
  doc.text('DESCRIPTION', x + padX, headerTextY, {
    width: descW - padX,
    characterSpacing: 0.8,
    lineBreak: false,
  });
  if (kind === 'sales') {
    doc.text('ORDERS', x + descW, headerTextY, {
      width: ordersW,
      align: 'center',
      characterSpacing: 0.8,
      lineBreak: false,
    });
  }
  doc.text(kind === 'sales' ? 'GROSS SALES' : 'AMOUNT', x + descW + ordersW, headerTextY, {
    width: amountW - padX,
    align: 'right',
    characterSpacing: 0.8,
    lineBreak: false,
  });

  let rowY = y + headerH;
  rows.forEach((row, index) => {
    const h = rowHeight(row, rowH);
    const isLast = index === rows.length - 1;
    if (row.highlight) {
      if (isLast) {
        doc.save();
        doc.rect(x, rowY, w, h - WD_INVOICE_RADIUS).fill(C.totalFill);
        doc
          .roundedRect(x, rowY + h - WD_INVOICE_RADIUS * 2, w, WD_INVOICE_RADIUS * 2, WD_INVOICE_RADIUS)
          .fill(C.totalFill);
        doc.restore();
      } else {
        doc.rect(x, rowY, w, h).fill(C.totalFill);
      }
    }

    const textY = rowY + (row.hint ? 6 : (h - 10) / 2);
    const font = row.bold ? WD_FONT.bold : WD_FONT.regular;
    const amountFont = row.bold ? WD_FONT.bold : WD_FONT.medium;
    const color = row.muted ? C.textSecondary : C.text;

    doc.fillColor(color).font(font).fontSize(row.bold ? 10 : 9.5);
    doc.text(row.label, x + padX, textY, { width: descW - padX, lineBreak: false });
    if (row.hint) {
      doc
        .fillColor(C.textSecondary)
        .font(WD_FONT.regular)
        .fontSize(7.5)
        .text(row.hint, x + padX, textY + 12, { width: descW - padX, lineBreak: false });
    }
    if (kind === 'sales' && row.orders != null) {
      doc
        .fillColor(color)
        .font(row.bold ? WD_FONT.bold : WD_FONT.regular)
        .fontSize(row.bold ? 10 : 9.5)
        .text(row.orders, x + descW, textY, { width: ordersW, align: 'center' });
    }
    doc
      .fillColor(C.text)
      .font(amountFont)
      .fontSize(row.bold ? 10 : 9.5)
      .text(row.amount, x + descW + ordersW, textY, { width: amountW - padX, align: 'right' });

    if (!isLast) {
      hr(doc, x, rowY + h, w, C.border, 0.45);
    }
    rowY += h;
  });

  return y + tableH;
}

export function drawPage1Header(
  doc: PDFKit.PDFDocument,
  layout: InvoicePageLayout,
  y: number,
  opts: { dateLabel: string; invoiceRef: string },
): number {
  const { marginX, contentW } = layout;
  const mascotPath = withdrawalMascotPath();
  const logoSize = 44;

  if (mascotPath) {
    doc.image(mascotPath, marginX, y, { width: logoSize, height: logoSize, fit: [logoSize, logoSize] });
  }

  const brandX = mascotPath ? marginX + logoSize + 10 : marginX;
  doc.fillColor(C.text).font(WD_FONT.bold).fontSize(12).text('Bing Chun Delivery', brandX, y + 8);
  doc
    .fillColor(C.textSecondary)
    .font(WD_FONT.regular)
    .fontSize(8)
    .text('Sri Lanka', brandX, y + 26, { characterSpacing: 0.3 });

  const titleW = contentW * 0.46;
  const titleX = marginX + contentW - titleW;
  doc.fillColor(C.text).font(WD_FONT.bold).fontSize(32).text('INVOICE', titleX, y - 2, {
    width: titleW,
    align: 'right',
  });
  doc
    .fillColor(C.textSecondary)
    .font(WD_FONT.regular)
    .fontSize(8.5)
    .text(`Date : ${opts.dateLabel}`, titleX, y + 36, { width: titleW, align: 'right' });
  doc.text(`Invoice No. : ${opts.invoiceRef}`, titleX, y + 48, { width: titleW, align: 'right' });

  return y + 64;
}

export function drawBilledTo(
  doc: PDFKit.PDFDocument,
  layout: InvoicePageLayout,
  y: number,
  opts: { branchName: string; periodLabel: string | null; statusLabel: string },
): number {
  const { marginX, contentW } = layout;
  doc
    .fillColor(C.textSecondary)
    .font(WD_FONT.semibold)
    .fontSize(7.5)
    .text('BILLED TO', marginX, y, { characterSpacing: 1.4 });
  y += 16;
  doc.fillColor(C.text).font(WD_FONT.bold).fontSize(16).text(`${opts.branchName} Branch`, marginX, y);
  y += 20;
  if (opts.periodLabel) {
    doc
      .fillColor(C.textSecondary)
      .font(WD_FONT.regular)
      .fontSize(9)
      .text(`Statement period  ${opts.periodLabel}`, marginX, y);
    y += 14;
  }
  doc
    .fillColor(C.text)
    .font(WD_FONT.semibold)
    .fontSize(9.5)
    .text(`Status: ${opts.statusLabel}`, marginX, y);
  y += 18;
  hr(doc, marginX, y, contentW, C.border, 0.7);
  return y + 22;
}

export function drawNotesBlock(
  doc: PDFKit.PDFDocument,
  layout: InvoicePageLayout,
  y: number,
): number {
  const { marginX, contentW } = layout;
  y = drawSectionTitle(doc, marginX, y, contentW, 'Notes');
  const pad = 12;
  const textW = contentW - pad * 2;
  doc.font(WD_FONT.regular).fontSize(9);
  const textH = doc.heightOfString(WD_INVOICE_FIXED_NOTES, { width: textW });
  const boxH = textH + pad * 2;
  doc.save();
  doc.roundedRect(marginX, y, contentW, boxH, WD_INVOICE_RADIUS).fill(C.noteFill);
  doc.restore();
  doc
    .fillColor(C.text)
    .font(WD_FONT.regular)
    .fontSize(9)
    .text(WD_INVOICE_FIXED_NOTES, marginX + pad, y + pad, { width: textW });
  return y + boxH;
}

export function drawPage2Pill(doc: PDFKit.PDFDocument, layout: InvoicePageLayout, y: number): number {
  const { marginX, contentW } = layout;
  const label = 'Page 2 of 2';
  const pillW = 72;
  const pillH = 18;
  const pillX = marginX + contentW - pillW;
  doc.save();
  doc.roundedRect(pillX, y, pillW, pillH, 9).fill(C.headerFill);
  doc.restore();
  doc
    .fillColor(C.text)
    .font(WD_FONT.medium)
    .fontSize(8)
    .text(label, pillX, y + 4, { width: pillW, align: 'center' });
  return y + 28;
}

export function drawWithdrawalFooter(
  doc: PDFKit.PDFDocument,
  layout: InvoicePageLayout,
  footer: WithdrawalFooterLayout,
  paymentLines: string[],
): void {
  const { marginX, contentW } = layout;
  hr(doc, marginX, footer.footerRuleY, contentW, C.border, 0.7);

  const colGap = 16;
  const colW = (contentW - colGap * 2) / 3;
  const col2X = marginX + colW + colGap;
  const col3X = col2X + colW + colGap;
  let y = footer.colsStartY;

  doc.fillColor(C.text).font(WD_FONT.semibold).fontSize(7).text('BING CHUN DELIVERY', marginX, y, {
    width: colW,
    characterSpacing: 0.6,
  });
  doc
    .fillColor(C.text)
    .font(WD_FONT.semibold)
    .fontSize(7)
    .text('PAYMENT INFORMATION', col2X, y, { width: colW, characterSpacing: 0.6 });
  y += 12;

  doc.fillColor(C.textSecondary).font(WD_FONT.regular).fontSize(7.5);
  doc.text('Head Office  ·  Sri Lanka', marginX, y, { width: colW });
  doc.text('support@bingchun.lk', marginX, y + 11, { width: colW });

  let payY = y;
  for (const line of paymentLines) {
    doc.text(line, col2X, payY, { width: colW });
    payY += 11;
  }

  doc.fillColor(C.textSecondary).font(WD_FONT.regular).fontSize(7.5);
  doc.text('For any questions, please contact us at', col3X, y, { width: colW });
  doc.fillColor(C.text).font(WD_FONT.medium).fontSize(7.5).text('support@bingchun.lk', col3X, y + 11, {
    width: colW,
  });
}

export const WD_LAYOUT = {
  marginX: WD_INVOICE_MARGIN_X,
  contentTop: WD_INVOICE_CONTENT_TOP,
  sectionGap: WD_INVOICE_SECTION_GAP,
  rowH: WD_INVOICE_ROW_H,
  page2RowH: WD_INVOICE_PAGE2_ROW_H,
  page2HeaderH: WD_INVOICE_PAGE2_HEADER_H,
};
