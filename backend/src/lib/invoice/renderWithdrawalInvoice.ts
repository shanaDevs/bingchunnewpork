import PDFDocument from 'pdfkit';
import { WD_INVOICE_MARGIN_X } from './constants';
import {
  buildInvoiceSummaryRows,
  buildPage2PayoutSections,
  buildPlatformSalesRows,
} from './dataBuilders';
import { registerWithdrawalFonts } from './fonts';
import {
  branchDisplayName,
  formatInvoiceDate,
  formatInvoicePeriodLabel,
  paymentMethodLabel,
} from './format';
import { collectPdfBuffer } from './parsing';
import { resolvePayoutStatement } from './payoutStatement';
import { withdrawalInvoiceRef } from './refs';
import type { GenerateWithdrawalInvoiceInput, InvoicePageLayout } from './types';
import {
  computeWithdrawalFooterLayout,
  drawBilledTo,
  drawNotesBlock,
  drawPage1Header,
  drawPage2Pill,
  drawSectionTitle,
  drawWhitePage,
  drawWithdrawalFooter,
  drawWithdrawalTable,
  WD_LAYOUT,
} from './withdrawalPdfDrawing';

function paymentFooterLines(input: GenerateWithdrawalInvoiceInput, checkDateLabel: string | null): string[] {
  const lines = [
    `Method      : ${paymentMethodLabel(input.paymentMethod)}`,
    'Virtual wallet : Branch wallet payout',
  ];
  if (input.paymentMethod === 'CHECK') {
    lines.push(`Check no. ${input.checkNumber?.trim() || '—'}`);
    if (checkDateLabel) lines.push(`Check date ${checkDateLabel}`);
  }
  return lines;
}

function statusLabel(input: GenerateWithdrawalInvoiceInput): string {
  return `Paid  \u2022  ${paymentMethodLabel(input.paymentMethod)}`;
}

/** Render the 2-page WD-INV payout invoice from stored input. */
export async function renderWithdrawalInvoiceToBuffer(
  input: GenerateWithdrawalInvoiceInput,
): Promise<Buffer> {
  const invoiceRef = withdrawalInvoiceRef(input.withdrawalId);
  const branchName = branchDisplayName(input.storeName);
  const dateLabel = formatInvoiceDate(input.approvedAt);
  const checkDateLabel = input.checkDate ? formatInvoiceDate(input.checkDate) : null;
  const periodLabel =
    input.periodFrom && input.periodTo
      ? formatInvoicePeriodLabel(input.periodFrom, input.periodTo)
      : input.periodLabel ?? null;

  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  registerWithdrawalFonts(doc);
  const bufferPromise = collectPdfBuffer(doc);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const marginX = WD_INVOICE_MARGIN_X;
  const contentW = pageW - marginX * 2;
  const layout: InvoicePageLayout = { pageW, pageH, marginX, contentW };
  const footer = computeWithdrawalFooterLayout(pageH);
  const payLines = paymentFooterLines(input, checkDateLabel);

  drawWhitePage(doc, pageW, pageH);
  let y = WD_LAYOUT.contentTop;

  y = drawPage1Header(doc, layout, y, { dateLabel, invoiceRef });
  y = drawBilledTo(doc, layout, y, {
    branchName,
    periodLabel,
    statusLabel: statusLabel(input),
  });

  y = drawSectionTitle(doc, marginX, y, contentW, 'Platform sales');
  y = drawWithdrawalTable(
    doc,
    marginX,
    y,
    contentW,
    buildPlatformSalesRows(input.channelSummary),
    'sales',
    WD_LAYOUT.rowH,
  );
  y += WD_LAYOUT.sectionGap;

  y = drawSectionTitle(doc, marginX, y, contentW, 'Invoice summary');
  y = drawWithdrawalTable(
    doc,
    marginX,
    y,
    contentW,
    buildInvoiceSummaryRows(input),
    'amount',
    WD_LAYOUT.rowH,
  );
  y += WD_LAYOUT.sectionGap;

  drawNotesBlock(doc, layout, y);
  drawWithdrawalFooter(doc, layout, footer, payLines);

  doc.addPage();
  drawWhitePage(doc, pageW, pageH);
  y = WD_LAYOUT.contentTop - 6;
  y = drawPage2Pill(doc, layout, y);

  const statement = resolvePayoutStatement(input);
  const sections = buildPage2PayoutSections(statement);
  for (const section of sections) {
    y = drawSectionTitle(doc, marginX, y, contentW, section.title, true);
    y = drawWithdrawalTable(
      doc,
      marginX,
      y,
      contentW,
      section.rows,
      'amount',
      WD_LAYOUT.page2RowH,
      WD_LAYOUT.page2HeaderH,
    );
    y += 10;
  }

  drawWithdrawalFooter(doc, layout, footer, payLines);

  doc.end();
  return bufferPromise;
}
