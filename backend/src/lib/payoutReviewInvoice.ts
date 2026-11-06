import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import { buildStoredZip } from './zipStore';
import {
  formatPayoutReviewPeriodLabel,
  payoutReviewDisplayRange,
  payoutReviewDownloadFilename,
  payoutReviewOrdinalLabel,
  payoutReviewZipEntryPath,
  uniqueZipEntryPaths,
} from './payoutReviewNames';
import {
  buildNetPreviewResponseData,
  loadWithdrawalInvoicePeriodContext,
  resolveGatewayRatePctFromBreakdown,
} from './walletControllerSupport';
import { buildPayoutStatementFromBreakdown } from './invoice/payoutStatement';
import { renderWithdrawalInvoiceToBuffer } from './invoice/renderWithdrawalInvoice';
import type { GenerateWithdrawalInvoiceInput } from './invoice/types';

export type PayoutReviewPeriodRef = {
  storeId: string;
  periodFrom: string;
  periodTo: string;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function assertPayoutReviewPeriod(periodFrom: string, periodTo: string): void {
  if (!YMD.test(periodFrom) || !YMD.test(periodTo) || periodFrom > periodTo) {
    throw new AppError('Invalid payout period', 400);
  }
}

function periodDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function renderBranchPayoutReviewInvoice(input: {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
}): Promise<{ buffer: Buffer; filename: string; zipEntryPath: string }> {
  assertPayoutReviewPeriod(input.periodFrom, input.periodTo);

  const preview = await buildNetPreviewResponseData(input.storeId, input.periodFrom, input.periodTo);
  const periodFrom = periodDate(input.periodFrom);
  const periodTo = periodDate(input.periodTo);
  const invoiceContext = await loadWithdrawalInvoicePeriodContext(
    input.storeId,
    periodFrom,
    periodTo,
    preview,
  );

  const requestedCents = typeof preview.netAmount === 'number' ? preview.netAmount : 0;
  const paybackEnabled = preview.platformDiscountPaybackEnabled === true;
  const gatewayRatePct = await resolveGatewayRatePctFromBreakdown(preview);
  const cycleStage = typeof preview.cycleStage === 'string' ? preview.cycleStage : null;
  const cycleFrom = typeof preview.cycleFrom === 'string' ? preview.cycleFrom : null;
  const display = payoutReviewDisplayRange({
    from: input.periodFrom,
    to: input.periodTo,
    cycleStage,
    cycleFrom,
  });
  const periodLabel = `${formatPayoutReviewPeriodLabel(display.from, display.to)} · ${payoutReviewOrdinalLabel(cycleStage)}`;

  const invoiceInput: GenerateWithdrawalInvoiceInput = {
    storeId: input.storeId,
    withdrawalId: `review-${input.storeId}-${input.periodFrom}-${input.periodTo}`,
    storeName: input.storeName,
    branchBalanceCents: 0,
    requestedCents,
    balanceAfterCents: 0,
    netTransferableEarningsCents: 0,
    netTransferableEarningsAsOf: new Date(),
    remainingNetTransferableCents: 0,
    paymentMethod: 'BANK_TRANSFER',
    approvedAt: new Date(),
    periodBreakdown: invoiceContext.periodBreakdown,
    channelSummary: invoiceContext.channelSummary,
    periodFrom,
    periodTo,
    periodLabel,
    storeDiscountsCents: invoiceContext.storeDiscountsCents,
    promoSummary: invoiceContext.promoSummary,
    storePaybackEnabled: paybackEnabled,
    gatewayRatePct,
    payoutStatement: buildPayoutStatementFromBreakdown(preview, requestedCents, paybackEnabled),
  };

  const buffer = await renderWithdrawalInvoiceToBuffer(invoiceInput, {
    withdrawalBreakdown: preview,
    cycleStage,
    forReview: true,
    invoiceRef: `REVIEW-${input.periodFrom}-${input.periodTo}`,
  });

  return {
    buffer,
    filename: payoutReviewDownloadFilename(input.storeName, display.from, display.to, cycleStage),
    zipEntryPath: payoutReviewZipEntryPath(input.storeName, display.from, display.to, cycleStage),
  };
}

export async function renderBranchPayoutReviewZip(
  items: Array<PayoutReviewPeriodRef & { storeName: string }>,
): Promise<Buffer> {
  const ordered = [...items].sort(
    (a, b) =>
      a.storeName.localeCompare(b.storeName) ||
      a.periodFrom.localeCompare(b.periodFrom) ||
      a.periodTo.localeCompare(b.periodTo) ||
      a.storeId.localeCompare(b.storeId),
  );

  const rendered = [];
  for (const item of ordered) {
    rendered.push(await renderBranchPayoutReviewInvoice(item));
  }

  const paths = uniqueZipEntryPaths(rendered.map((file) => file.zipEntryPath));
  return buildStoredZip(
    rendered.map((file, index) => ({
      path: paths[index] ?? file.zipEntryPath,
      data: file.buffer,
    })),
  );
}

export async function loadReviewStoreNames(storeIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(storeIds)];
  const stores = await prisma.store.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(stores.map((store) => [store.id, store.name]));
}
