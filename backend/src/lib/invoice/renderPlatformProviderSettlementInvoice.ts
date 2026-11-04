import PDFDocument from 'pdfkit';
import type { PlatformProviderReceivableLkr } from '@bingchun/settlement';
import {
  DARTCODES_ISSUER,
  INVOICE_COLORS as C,
  INVOICE_CONTENT_TOP,
  INVOICE_SANS as SANS,
  INVOICE_SANS_BOLD as SANS_BOLD,
  INVOICE_SERIF as SERIF,
} from './constants';
import { branchDisplayName, formatAmountOnly, formatLkr, formatSettlementPeriodLabel } from './format';
import { collectPdfBuffer } from './parsing';
import {
  brandLogoPath,
  drawInvoicePageBackground,
  drawPaidBadge,
  drawSectionHeading,
  drawTotalsBlock,
  hr,
} from './pdfDrawing';
import { platformProviderSettlementInvoiceRef } from './refs';
import type { TotalLine } from './types';

export type RenderPlatformProviderSettlementInvoiceInput = {
  settlementId: string;
  statementRef: string;
  storeName: string;
  periodFrom: Date;
  periodTo: Date;
  paymentMethod: string;
  settledAt: Date;
  receivableLkr: PlatformProviderReceivableLkr;
  paybackEnabled: boolean;
};

function lkrCents(lkr: number): number {
  return Math.round(lkr * 100);
}

const SECTION_AFTER = 20;
const BLOCK_AFTER = 10;

/** ASCII minus — Unicode minus (U+2212) does not render reliably in PDFKit Helvetica. */
function formatAdditionLkr(lkr: number): string {
  if (Math.abs(lkr) < 0.005) return '—';
  return formatAmountOnly(lkrCents(lkr));
}

function formatDeductionLkr(lkr: number): string {
  if (Math.abs(lkr) < 0.005) return '—';
  return `- ${formatAmountOnly(lkrCents(Math.abs(lkr)))}`;
}

function receivableLine(
  label: string,
  lkr: number,
  opts?: { deduction?: boolean; bold?: boolean },
): TotalLine {
  return {
    label,
    amount: opts?.deduction ? formatDeductionLkr(lkr) : formatAdditionLkr(lkr),
    bold: opts?.bold,
  };
}

/** Platform provider payment invoice (from locked branch payout snapshot). */
export async function renderPlatformProviderSettlementInvoiceToBuffer(
  input: RenderPlatformProviderSettlementInvoiceInput,
): Promise<Buffer> {
  const invoiceRef = platformProviderSettlementInvoiceRef(input.settlementId);
  const branchName = branchDisplayName(input.storeName);
  const r = input.receivableLkr;
  const sppcNotDeducted = !input.paybackEnabled && r.sharedPromoPlatformLkr > 0.001;
  const invoiceDateLabel = input.settledAt.toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const periodLabel = formatSettlementPeriodLabel(input.periodFrom, input.periodTo);
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
  doc.fillColor(C.text).font(SANS).fontSize(9.5).text('platform provider payment settlement', marginX, y);
  y += 14;
  doc
    .fillColor(C.textMuted)
    .font(SANS)
    .fontSize(9)
    .text(`Payout period  ${periodLabel}`, marginX, y);
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
    .text(`Payment method  ${input.paymentMethod}`, marginX, y);
  y += 32;

  doc.fillColor(C.navy).font(SERIF).fontSize(14).text('Platform provider receivable', marginX, y);
  y += 18;
  const subtitle =
    'From locked branch payout snapshot. Refund convenience fees are platform income and are not deducted from branch payout.';
  doc.fillColor(C.textMuted).font(SANS).fontSize(8.5).text(subtitle, marginX, y, {
    width: contentW,
    lineGap: 3,
  });
  y +=
    doc.heightOfString(subtitle, { width: contentW, lineGap: 3 }) + SECTION_AFTER;

  const totalsX = marginX;
  const totalsW = contentW;
  const detailX = marginX + 14;
  const detailW = contentW - 14;

  y = drawSectionHeading(doc, totalsX, y, totalsW, '1 · Net platform commission');
  y += 4;
  y = drawTotalsBlock(doc, detailX, y, detailW, [
    receivableLine('Branch commission', r.commissionFeeLkr),
    receivableLine('Platform discount payback', r.platformPaybackLkr, { deduction: true }),
    receivableLine('Loyalty discount deduction', r.loyaltyDiscountLkr, { deduction: true }),
    ...(sppcNotDeducted
      ? [
          receivableLine(
            'Shared promo platform contribution (not deducted)',
            r.sharedPromoPlatformLkr,
          ),
        ]
      : [
          receivableLine('Shared promo platform contribution', r.sharedPromoPlatformLkr, {
            deduction: true,
          }),
        ]),
    { ...receivableLine('Net platform commission', r.netPlatformCommissionLkr, { bold: true }), separatorBefore: true },
  ]);
  y += BLOCK_AFTER;

  y = drawSectionHeading(doc, totalsX, y, totalsW, '2 · Net platform earnings');
  y += 4;
  y = drawTotalsBlock(doc, detailX, y, detailW, [
    receivableLine('Completed refund convenience fee', r.completedRefundConvenienceFeeLkr),
    receivableLine('Rejected refund convenience fee', r.rejectedRefundConvenienceFeeLkr),
    { ...receivableLine('Net platform earnings', r.netPlatformEarningsLkr, { bold: true }), separatorBefore: true },
  ]);
  y += BLOCK_AFTER;

  y = drawSectionHeading(doc, totalsX, y, totalsW, '3 · Eligible platform provider amount');
  y += 4;
  y = drawTotalsBlock(doc, detailX, y, detailW, [
    receivableLine('Normal order convenience fee', r.normalConvenienceFeeLkr),
    {
      ...receivableLine('Eligible platform provider amount', r.eligibleProviderAmountLkr, {
        bold: true,
      }),
      separatorBefore: true,
    },
    {
      ...receivableLine(
        `Gateway deduction (${r.gatewayRatePct ?? 1.9}%)`,
        r.gatewayDeductionLkr,
        { deduction: true },
      ),
      separatorBefore: true,
    },
  ]);
  y += SECTION_AFTER;

  y = hr(doc, totalsX, y, totalsW, C.line, 0.75) + 14;
  y = drawTotalsBlock(doc, totalsX, y, totalsW, [
    {
      label: 'Total platform provider receivable',
      amount: formatLkr(lkrCents(r.totalPlatformProviderReceivableLkr)),
      bold: true,
      brand: true,
    },
    {
      label: 'Amount received',
      amount: formatLkr(lkrCents(r.totalPlatformProviderReceivableLkr)),
      bold: true,
      brand: true,
      separatorBefore: true,
    },
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
      'Platform provider payment invoice — generated from the approved branch payout snapshot when payment was processed.',
      marginX,
      footerRuleY + 48,
      { width: contentW, align: 'center' },
    );

  doc.rect(0, pageH - 8, pageW, 8).fill(C.brand);

  doc.end();
  return bufferPromise;
}
