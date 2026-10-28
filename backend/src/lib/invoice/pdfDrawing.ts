import fs from 'fs';
import path from 'path';
import type PDFKit from 'pdfkit';
import {
  DARTCODES_ISSUER,
  INVOICE_COLORS as C,
  INVOICE_CONTENT_TOP,
  INVOICE_SANS as SANS,
  INVOICE_SANS_BOLD as SANS_BOLD,
  INVOICE_SERIF as SERIF,
  PAID_GREEN,
  PAID_GREEN_LIGHT,
} from './constants';
import { formatLkr } from './format';
import type {
  FooterLayout,
  InvoicePageLayout,
  InvoicePromoLine,
  InvoicePromoSummary,
  LineTableColumn,
  LineTableRow,
  TotalLine,
} from './types';

export function brandLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'public', 'brand', 'logo.png'),
    path.join(__dirname, '..', '..', '..', '..', 'customer_mobile', 'assets', 'brand', 'logo.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function hr(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  color: string = C.line,
  weight = 0.75,
) {
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(weight).strokeColor(color).stroke();
  return y;
}

export function drawInvoicePageBackground(doc: PDFKit.PDFDocument, pageW: number, pageH: number): void {
  doc.rect(0, 0, pageW, pageH).fill(C.cream);
  doc.rect(0, 0, pageW, 3).fill(C.brand);
}

export function computeFooterLayout(
  pageH: number,
  payLineCount: number,
  contactLineCount: number,
): FooterLayout {
  const bottomAccentH = 3;
  const footerPad = 14;
  const autoTextH = 10;
  const gapBelowCols = 22;
  const colLineH = 14;
  const colHeadH = 16;
  const maxColLines = Math.max(payLineCount, contactLineCount);

  const autoTextY = pageH - bottomAccentH - footerPad - autoTextH;
  const colsBottomY = autoTextY - gapBelowCols;
  const colsStartY = colsBottomY - colHeadH - maxColLines * colLineH;
  const paymentTitleY = colsStartY - 28;
  const footerRuleY = paymentTitleY - 20;

  return {
    footerRuleY,
    paymentTitleY,
    colsStartY,
    autoTextY,
    bottomAccentH,
    colLineH,
    colHeadH,
  };
}

/** Move to a fresh page when the upcoming block would overlap the footer zone. */
export function ensureContentFits(
  doc: PDFKit.PDFDocument,
  y: number,
  neededHeight: number,
  pageBottom: number,
  pageW: number,
  pageH: number,
): number {
  if (y + neededHeight <= pageBottom) return y;
  doc.addPage();
  drawInvoicePageBackground(doc, pageW, pageH);
  return INVOICE_CONTENT_TOP;
}

function measureTotalsLineHeight(
  doc: PDFKit.PDFDocument,
  line: TotalLine,
  labelW: number,
  amountW: number,
): number {
  const fontSize = line.bold ? 11 : 9.5;
  const font = line.bold ? SANS_BOLD : SANS;

  doc.font(font).fontSize(fontSize);
  const labelH = doc.heightOfString(line.label, { width: labelW, align: 'right' });
  doc.font(font).fontSize(fontSize);
  const amountH = doc.heightOfString(line.amount, { width: amountW, align: 'right' });

  let h = Math.max(labelH, amountH, 14) + 6;
  if (line.hint) {
    doc.font(SANS).fontSize(7.5);
    h += doc.heightOfString(line.hint, { width: labelW, align: 'right' }) + 4;
  }
  return h;
}

export function estimateTotalsBlockHeight(
  doc: PDFKit.PDFDocument,
  lines: TotalLine[],
  blockW: number,
): number {
  const labelW = blockW * 0.62;
  const amountW = blockW - labelW;
  let total = 0;
  for (const line of lines) {
    if (line.skip) continue;
    if (line.separatorBefore) total += 10;
    total += measureTotalsLineHeight(doc, line, labelW, amountW);
  }
  return total;
}

export function drawPaymentInfoFooter(
  doc: PDFKit.PDFDocument,
  layout: InvoicePageLayout,
  footer: FooterLayout,
  payLines: string[],
  contactLines: string[],
): void {
  const { pageW, pageH, marginX, contentW } = layout;

  hr(doc, marginX, footer.footerRuleY, contentW, C.line, 0.75);

  doc
    .fillColor(C.navy)
    .font(SERIF)
    .fontSize(14)
    .text('Payment Info', marginX, footer.paymentTitleY);

  const footColW = (contentW - 32) / 2;
  const footRightX = marginX + footColW + 32;

  doc
    .fillColor(C.text)
    .font(SANS_BOLD)
    .fontSize(9)
    .text('Settlement details', marginX, footer.colsStartY);
  doc.fillColor(C.text).font(SANS_BOLD).fontSize(9).text('Contact', footRightX, footer.colsStartY);

  let lineY = footer.colsStartY + footer.colHeadH;
  doc.font(SANS).fontSize(9).fillColor(C.textMuted);
  for (const line of payLines) {
    doc.text(line, marginX, lineY, { width: footColW, lineGap: 2 });
    lineY += footer.colLineH;
  }

  lineY = footer.colsStartY + footer.colHeadH;
  for (const line of contactLines) {
    doc.text(line, footRightX, lineY, { width: footColW, lineGap: 2 });
    lineY += footer.colLineH;
  }

  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(7.5)
    .text(
      'Generated automatically when this payout was approved.',
      marginX,
      footer.autoTextY,
      { width: contentW, align: 'center' },
    );

  doc.rect(0, pageH - footer.bottomAccentH, pageW, footer.bottomAccentH).fill(C.brand);
}

export function drawLineTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  columns: LineTableColumn[],
  rows: LineTableRow[],
): number {
  const headerH = 22;
  const defaultRowH = 24;
  const pad = 2;

  doc.fillColor(C.textMuted).font(SANS_BOLD).fontSize(7.5);
  let colX = x;
  for (const col of columns) {
    doc.text(col.title, colX, y + 4, { width: col.width, align: col.align, characterSpacing: 1.2 });
    colX += col.width;
  }
  y += headerH;
  y = hr(doc, x, y, w) + 10;

  for (const row of rows) {
    if (row.separatorBefore) {
      y = hr(doc, x, y, w, C.lineDark, 0.75) + 8;
    }
    const h = row.rowH ?? defaultRowH;
    colX = x;
    row.cells.forEach((cell, i) => {
      const col = columns[i]!;
      const isAmountCol = i === row.cells.length - 1;
      const isCalcCol = row.calcColIndex === i;
      let color: string = C.text;
      if (row.danger && isAmountCol) color = C.danger;
      else if (row.brand && isAmountCol) color = C.brandDark;
      else if (row.muted) color = C.textMuted;
      doc
        .fillColor(color)
        .font(row.bold ? SANS_BOLD : SANS)
        .fontSize(isCalcCol ? 7.5 : row.bold ? 10 : 9.5)
        .text(cell, colX, y + pad, { width: col.width, align: col.align, lineGap: 1 });
      colX += col.width;
    });
    y += h;
    y = hr(doc, x, y, w, C.line, 0.5) + 0;
  }

  return y + 6;
}

export function drawTotalsBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  blockW: number,
  lines: TotalLine[],
  opts?: { pageBottom?: number; pageW?: number; pageH?: number },
): number {
  const labelW = blockW * 0.62;
  const amountW = blockW - labelW;
  const pageBottom = opts?.pageBottom ?? doc.page.height;
  const pageW = opts?.pageW ?? doc.page.width;
  const pageH = opts?.pageH ?? doc.page.height;

  for (const line of lines) {
    if (line.skip) continue;

    const separatorH = line.separatorBefore ? 10 : 0;
    const rowH = measureTotalsLineHeight(doc, line, labelW, amountW);
    const blockH = separatorH + rowH;

    if (y + blockH > pageBottom) {
      doc.addPage();
      drawInvoicePageBackground(doc, pageW, pageH);
      y = INVOICE_CONTENT_TOP;
    }

    if (line.separatorBefore) {
      y = hr(doc, x, y, blockW, C.line, 0.75) + 8;
    }

    const amountColor = line.brand
      ? C.brandDark
      : line.danger
        ? C.danger
        : line.credit
          ? C.brandDark
          : C.text;
    const fontSize = line.bold ? 11 : 9.5;
    const font = line.bold ? SANS_BOLD : SANS;

    doc
      .fillColor(line.bold ? C.navy : C.textMuted)
      .font(font)
      .fontSize(fontSize)
      .text(line.label, x, y, { width: labelW, align: 'right' });
    doc
      .fillColor(amountColor)
      .font(font)
      .fontSize(fontSize)
      .text(line.amount, x + labelW, y, { width: amountW, align: 'right' });

    y += Math.max(
      doc.heightOfString(line.label, { width: labelW, align: 'right' }),
      doc.heightOfString(line.amount, { width: amountW, align: 'right' }),
      14,
    ) + 6;

    if (line.hint) {
      doc
        .fillColor(C.textMuted)
        .font(SANS)
        .fontSize(7.5)
        .text(line.hint, x, y - 2, { width: labelW, align: 'right' });
      y += doc.heightOfString(line.hint, { width: labelW, align: 'right' }) + 4;
    }
  }
  return y;
}

export function drawSectionHeading(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
): number {
  doc.fillColor(C.navy).font(SANS_BOLD).fontSize(8).text(title.toUpperCase(), x, y, {
    width: w,
    characterSpacing: 1,
  });
  return y + 16;
}

export function drawPaidBadge(doc: PDFKit.PDFDocument, x: number, y: number): void {
  const badgeW = 78;
  const badgeH = 30;
  doc.roundedRect(x, y, badgeW, badgeH, 5).fill(PAID_GREEN_LIGHT);
  doc.roundedRect(x, y, badgeW, badgeH, 5).lineWidth(2.25).strokeColor(PAID_GREEN).stroke();
  doc
    .fillColor(PAID_GREEN)
    .font(SANS_BOLD)
    .fontSize(15)
    .text('PAID', x, y + 8, { width: badgeW, align: 'center', characterSpacing: 3 });
}

function ownershipLabel(ownership: InvoicePromoLine['ownership']): string {
  if (ownership === 'BRANCH') return 'Branch';
  if (ownership === 'SHARED') return 'Shared';
  return 'Platform';
}

export function drawPromoDiscountSection(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  promoSummary: InvoicePromoSummary,
  storePaybackEnabled: boolean,
): number {
  y = drawSectionHeading(doc, x, y, w, 'Promotions & Discounts');
  y += 2;

  const colCode = w * 0.28;
  const colFunded = w * 0.18;
  const colDiscount = w * 0.27;
  const colPayback = w - colCode - colFunded - colDiscount;

  const tableRows: LineTableRow[] = promoSummary.lines.map((line) => {
    const paybackCents =
      storePaybackEnabled && line.ownership === 'PLATFORM' ? line.platformShareAmount : 0;
    return {
      cells: [
        line.promoCode,
        ownershipLabel(line.ownership),
        formatLkr(line.totalDiscountAmount),
        paybackCents > 0 ? formatLkr(paybackCents) : '—',
      ],
      rowH: 26,
    };
  });

  if (promoSummary.platformTotalCents > 0) {
    tableRows.push({
      cells: [
        'Platform-funded total',
        'Platform',
        formatLkr(promoSummary.platformTotalCents),
        promoSummary.platformPaybackCents > 0 ? formatLkr(promoSummary.platformPaybackCents) : '—',
      ],
      bold: true,
      separatorBefore: true,
      rowH: 26,
    });
  }
  if (promoSummary.branchTotalCents > 0) {
    tableRows.push({
      cells: ['Branch-funded total', 'Branch', formatLkr(promoSummary.branchTotalCents), '—'],
      bold: true,
      rowH: 26,
    });
  }
  if (promoSummary.sharedTotalCents > 0) {
    tableRows.push({
      cells: ['Shared total', 'Shared', formatLkr(promoSummary.sharedTotalCents), '—'],
      bold: true,
      rowH: 26,
    });
  }

  y = drawLineTable(doc, x, y, w, [
    { title: 'PROMO CODE', width: colCode, align: 'left' },
    { title: 'FUNDED BY', width: colFunded, align: 'left' },
    { title: 'DISCOUNT', width: colDiscount, align: 'right' },
    { title: 'PAYBACK', width: colPayback, align: 'right' },
  ], tableRows);

  if (promoSummary.platformPaybackCents > 0) {
    doc
      .fillColor(C.brandDark)
      .font(SANS)
      .fontSize(8)
      .text(
        'Note: Platform discount payback is credited back to the branch payout.',
        x,
        y + 4,
        { width: w },
      );
    y += 18;
  }

  return y + 12;
}
