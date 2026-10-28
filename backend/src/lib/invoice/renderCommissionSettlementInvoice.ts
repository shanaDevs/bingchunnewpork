import PDFDocument from 'pdfkit';
import { sumBreakdownConvenienceFee } from '../commission';
import { settlementPaymentMethodLabel } from '../settlementPaymentMethod';
import {
  DARTCODES_ISSUER,
  INVOICE_CHANNEL_LABELS,
  INVOICE_CHANNEL_ORDER,
  INVOICE_COLORS as C,
  INVOICE_CONTENT_TOP,
  INVOICE_SANS as SANS,
  INVOICE_SANS_BOLD as SANS_BOLD,
  INVOICE_SERIF as SERIF,
} from './constants';
import { buildInvoiceChannelSummary } from './dataBuilders';
import {
  branchDisplayName,
  formatAmountOnly,
  formatLkr,
  formatSettlementPeriodLabel,
} from './format';
import { collectPdfBuffer } from './parsing';
import {
  brandLogoPath,
  drawInvoicePageBackground,
  drawLineTable,
  drawPaidBadge,
  drawTotalsBlock,
  hr,
} from './pdfDrawing';
import type { GenerateCommissionSettlementInvoiceInput, LineTableRow } from './types';
import { commissionSettlementInvoiceRef } from './refs';

/** Render commission settlement invoice PDF on demand from stored input. */
export async function renderCommissionSettlementInvoiceToBuffer(
  input: GenerateCommissionSettlementInvoiceInput,
): Promise<Buffer> {
  const invoiceRef = commissionSettlementInvoiceRef(input.settlementId);
  const branchName = branchDisplayName(input.storeName);
  const invoiceDateLabel = input.settledAt.toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const periodLabel = formatSettlementPeriodLabel(input.periodFrom, input.periodTo);
  const channelSummary = buildInvoiceChannelSummary(input.breakdown);
  const totalCommissionCents = Math.round(input.totalCommission * 100);
  const platformPaybackCents = Math.round((input.platformPaybackAmount ?? 0) * 100);
  const netPlatformEarningCents = totalCommissionCents - platformPaybackCents;
  const totalConvenienceCents = Math.round(sumBreakdownConvenienceFee(input.breakdown) * 100);
  const totalDueCents = netPlatformEarningCents + totalConvenienceCents;
  const platformOwesBranch = totalDueCents < 0;
  const methodLabel = settlementPaymentMethodLabel(String(input.paymentMethod));
  const logoPath = brandLogoPath();

  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  const bufferPromise = collectPdfBuffer(doc);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const marginX = 56;
  const contentW = pageW - marginX * 2;

  drawInvoicePageBackground(doc, pageW, pageH);

  let y = INVOICE_CONTENT_TOP;

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
  doc.text(DARTCODES_ISSUER.email, issuerTextX, y + 32, { characterSpacing: 0.2 });
  doc.text(DARTCODES_ISSUER.web, issuerTextX, y + 44, { characterSpacing: 0.2 });

  const titleX = marginX + contentW * 0.52;
  const titleW = contentW * 0.48;
  doc.fillColor(C.navy).font(SERIF).fontSize(34).text('Invoice', titleX, y - 2, {
    width: titleW,
    align: 'right',
  });

  drawPaidBadge(doc, titleX + titleW - 78, y + 42);

  doc
    .fillColor(C.textMuted)
    .font(SANS_BOLD)
    .fontSize(8)
    .text('INVOICE DATE', titleX, y + 80, { width: titleW, align: 'right', characterSpacing: 1.1 });
  doc
    .fillColor(C.text)
    .font(SANS)
    .fontSize(9.5)
    .text(invoiceDateLabel, titleX, y + 92, { width: titleW, align: 'right' });
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(9)
    .text(`Invoice No.  ${invoiceRef}`, titleX, y + 108, { width: titleW, align: 'right' });

  y += 128;

  doc.fillColor(C.textMuted).font(SANS_BOLD).fontSize(7.5).text('BILLED TO', marginX, y, {
    characterSpacing: 1.4,
  });
  y += 16;
  doc.fillColor(C.navy).font(SANS_BOLD).fontSize(11).text(`${branchName} Branch`, marginX, y);
  y += 16;
  doc.fillColor(C.text).font(SANS).fontSize(9.5).text('service provider commission settlement', marginX, y);
  y += 14;
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(9)
    .text(`Statement period  ${periodLabel}`, marginX, y);
  y += 14;
  doc
    .fillColor(C.brand)
    .font(SANS_BOLD)
    .fontSize(9)
    .text(`Statement ref  ${input.statementRef}`, marginX, y);
  y += 14;
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(9)
    .text(`Payment method  ${methodLabel}`, marginX, y);
  y += 24;

  doc.fillColor(C.navy).font(SERIF).fontSize(14).text('Commission by channel', marginX, y);
  y += 22;

  const tableRows: LineTableRow[] = INVOICE_CHANNEL_ORDER.map((key) => {
    const row = input.breakdown[key];
    if (row.orderCount <= 0) return null;
    const convenienceCents = Math.round(row.convenientFeeTotal * 100);
    return {
      cells: [
        INVOICE_CHANNEL_LABELS[key],
        String(row.orderCount),
        formatAmountOnly(Math.round(row.revenueSubtotal * 100)),
        formatAmountOnly(Math.round(row.commission * 100)),
        convenienceCents > 0 ? formatAmountOnly(convenienceCents) : '—',
      ],
    };
  }).filter((r): r is LineTableRow => r != null);

  if (tableRows.length === 0) {
    tableRows.push({
      cells: ['No channel activity', '—', '—', '—', '—'],
      muted: true,
    });
  }

  y = drawLineTable(
    doc,
    marginX,
    y,
    contentW,
    [
      { title: 'CHANNEL', width: contentW * 0.28, align: 'left' },
      { title: 'ORDERS', width: contentW * 0.1, align: 'center' },
      { title: 'GROSS SALES', width: contentW * 0.2, align: 'right' },
      { title: 'COMMISSION', width: contentW * 0.2, align: 'right' },
      { title: 'CONVENIENCE FEE', width: contentW * 0.22, align: 'right' },
    ],
    tableRows,
  );

  y += 12;
  const totalsX = marginX + contentW * 0.48;
  const totalsW = contentW * 0.52;
  y = drawTotalsBlock(doc, totalsX, y, totalsW, [
    { label: 'Total orders', amount: String(channelSummary.totalOrders) },
    { label: 'Gross commission', amount: formatAmountOnly(totalCommissionCents) },
    ...(platformPaybackCents > 0
      ? [{ label: 'Platform discount payback', amount: `−${formatAmountOnly(platformPaybackCents)}`, credit: true }]
      : []),
    {
      label: 'Net platform earning',
      amount: formatAmountOnly(netPlatformEarningCents),
      bold: netPlatformEarningCents < 0,
      danger: netPlatformEarningCents < 0,
    },
    ...(totalConvenienceCents > 0
      ? [{ label: 'Total convenience fee', amount: formatAmountOnly(totalConvenienceCents) }]
      : []),
    {
      label: platformOwesBranch ? 'Platform owes branch' : 'Amount due from branch',
      amount: formatLkr(Math.abs(totalDueCents)),
      bold: true,
      brand: !platformOwesBranch,
      credit: platformOwesBranch,
    },
    ...(!platformOwesBranch
      ? [{ label: 'Amount received', amount: formatLkr(totalDueCents), bold: true, credit: true }]
      : []),
  ]);

  const footerRuleY = pageH - 132;
  hr(doc, marginX, footerRuleY, contentW, C.line, 0.75);
  doc.fillColor(C.navy).font(SANS_BOLD).fontSize(9).text(DARTCODES_ISSUER.name, marginX, footerRuleY + 14);
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(8)
    .text(`${DARTCODES_ISSUER.email}  ·  ${DARTCODES_ISSUER.web}`, marginX, footerRuleY + 28);
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(7.5)
    .text(
      'Commission settlement invoice — generated when payment was processed and verified.',
      marginX,
      footerRuleY + 48,
      { width: contentW, align: 'center' },
    );

  doc.rect(0, pageH - 8, pageW, 8).fill(C.brand);

  doc.end();
  return bufferPromise;
}
