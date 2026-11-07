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
import { parseWithdrawalInvoiceInput } from './invoice/parsing';
import type { GenerateWithdrawalInvoiceInput } from './invoice/types';
import { payoutDraftInvoiceApiPath } from './payoutInReviewDraft';
import { findInReviewWithdrawalForPeriod } from './withdrawalPayoutPeriod';
import { toUtcDateStr } from './utcDateString';

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

export { payoutDraftInvoiceApiPath, payoutDraftInvoiceApiPathByPeriod } from './payoutInReviewDraft';

/** Build the frozen draft invoice input (same as pre-payment PDF). */
export async function buildBranchPayoutDraftSnapshot(input: {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  withdrawalId: string;
}): Promise<{
  invoiceData: GenerateWithdrawalInvoiceInput;
  breakdownSnapshot: Record<string, unknown>;
  cycleStage: string | null;
  display: { from: string; to: string };
  periodFromYmd: string;
  periodToYmd: string;
}> {
  assertPayoutReviewPeriod(input.periodFrom, input.periodTo);
  const periodFromYmd = input.periodFrom.slice(0, 10);
  const periodToYmd = input.periodTo.slice(0, 10);

  const preview = await buildNetPreviewResponseData(input.storeId, periodFromYmd, periodToYmd);
  const periodFrom = periodDate(periodFromYmd);
  const periodTo = periodDate(periodToYmd);
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
    from: periodFromYmd,
    to: periodToYmd,
    cycleStage,
    cycleFrom,
  });
  const periodLabel = `${formatPayoutReviewPeriodLabel(display.from, display.to)} · ${payoutReviewOrdinalLabel(cycleStage)}`;

  const invoiceData: GenerateWithdrawalInvoiceInput = {
    storeId: input.storeId,
    withdrawalId: input.withdrawalId,
    storeName: input.storeName,
    branchBalanceCents: 0,
    requestedCents: requestedCents,
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

  return {
    invoiceData,
    breakdownSnapshot: preview as Record<string, unknown>,
    cycleStage,
    display,
    periodFromYmd,
    periodToYmd,
  };
}

async function loadWithdrawalDraftForRender(input: {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  withdrawalId?: string;
}): Promise<{
  invoiceInput: GenerateWithdrawalInvoiceInput;
  breakdownSnapshot: unknown;
  cycleStage: string | null;
  display: { from: string; to: string };
}> {
  const periodFromYmd = input.periodFrom.slice(0, 10);
  const periodToYmd = input.periodTo.slice(0, 10);

  const withdrawal = input.withdrawalId
    ? await prisma.storeWithdrawal.findFirst({
        where: {
          id: input.withdrawalId,
          storeId: input.storeId,
          status: 'IN_REVIEW',
        },
      })
    : await findInReviewWithdrawalForPeriod(input.storeId, periodFromYmd, periodToYmd);

  if (!withdrawal?.invoiceData) throw new AppError('Payout draft not found', 404);

  const invoiceInput = parseWithdrawalInvoiceInput(withdrawal.invoiceData);
  if (!invoiceInput) throw new AppError('Payout draft snapshot is invalid', 500);

  const breakdownSnapshot = withdrawal.breakdown ?? withdrawal.invoiceData;
  const cycleStage =
    withdrawal.breakdown && typeof withdrawal.breakdown === 'object' && 'cycleStage' in withdrawal.breakdown
      ? (withdrawal.breakdown as { cycleStage?: string }).cycleStage ?? null
      : null;
  const cycleFrom =
    withdrawal.breakdown && typeof withdrawal.breakdown === 'object' && 'cycleFrom' in withdrawal.breakdown
      ? (withdrawal.breakdown as { cycleFrom?: string }).cycleFrom ?? null
      : null;
  const display = payoutReviewDisplayRange({
    from: periodFromYmd,
    to: periodToYmd,
    cycleStage,
    cycleFrom,
  });
  return { invoiceInput, breakdownSnapshot, cycleStage, display };
}

export async function renderBranchPayoutReviewInvoice(input: {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  withdrawalId?: string;
}): Promise<{ buffer: Buffer; filename: string; zipEntryPath: string }> {
  const { invoiceInput, breakdownSnapshot, cycleStage, display } = await loadWithdrawalDraftForRender(
    input,
  );
  const periodFromYmd = input.periodFrom.slice(0, 10);
  const periodToYmd = input.periodTo.slice(0, 10);

  const buffer = await renderWithdrawalInvoiceToBuffer(invoiceInput, {
    withdrawalBreakdown: breakdownSnapshot,
    cycleStage,
    forReview: true,
    invoiceRef: `DRAFT-${periodFromYmd}-${periodToYmd}`,
  });

  return {
    buffer,
    filename: payoutReviewDownloadFilename(
      input.storeName,
      display.from,
      display.to,
      cycleStage === 'FIRST' || cycleStage === 'SECOND' ? cycleStage : undefined,
    ),
    zipEntryPath: payoutReviewZipEntryPath(
      input.storeName,
      display.from,
      display.to,
      cycleStage === 'FIRST' || cycleStage === 'SECOND' ? cycleStage : undefined,
    ),
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
    const withdrawalId =
      (await resolveInReviewWithdrawalId(item.storeId, item.periodFrom, item.periodTo)) ?? undefined;
    rendered.push(
      await renderBranchPayoutReviewInvoice({
        ...item,
        withdrawalId,
      }),
    );
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

export async function resolveInReviewWithdrawalId(
  storeId: string,
  periodFrom: string,
  periodTo: string,
): Promise<string | null> {
  const row = await findInReviewWithdrawalForPeriod(storeId, periodFrom, periodTo);
  return row?.id ?? null;
}
