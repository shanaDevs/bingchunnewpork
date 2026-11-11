import type { Request } from 'express';
import type { JwtPayload } from '../middleware/auth';
import { Prisma, prisma, getPrismaFanOutLimit } from './prisma';
import { promiseAllLimited } from '../utils/promiseAllLimited';
import { AppError } from '../middleware/errorHandler';
import { ensurePlatformPaybackSchema } from './platformPaybackSchema';
import {
  orderCreatedAtFilter,
  mapWalletReportOrders,
  summarizeOrderRevenue,
  summarizeOrderRevenueFromGroups,
  walletReportOrderSelect,
  platformItemSalesLkr,
} from './walletRevenue';
import { buildPeriodChannelPreview, channelPreviewFromPeriodBreakdown } from './periodChannelPreview';
import {
  computePeriodBreakdownForPayout,
  resolveCycleContextsForWindows,
  resolveCycleContextForWindow,
  resolveSecondPayoutTableAllocationCents,
  payoutWindowKey,
  type PayoutWindowBounds,
} from './withdrawalPeriodNet';
import {
  secondPayoutPriorBeforeGatewayFeeCents,
  type PayoutCycleContext,
} from './payoutCycle';
import { computePeriodOrderAvailableCents } from './periodOrderAvailable';
import { invalidateWalletAnalysisCache } from './walletAnalysis';
import {
  computeBreakdownForPeriod,
  refreshSecondPayoutGatewayAndNet,
  computeBranchPayablesBreakdown,
  computeNetTransferableEarnings,
  enrichWalletRow,
  getBranchWalletDashboard,
  getSuperAdminWalletDashboard,
  getOrCreateWallet,
  getWalletSummary,
  type PeriodBreakdown,
} from './walletService';
import {
  getSlabIndex,
  sumBreakdownCommission,
  sumBreakdownOrderCount,
  sumBreakdownProviderFee,
} from './commission';
import {
  computeSharedPromoContribution,
  enrichSharedPromoForApi,
  mergeSharedPromoIntoBreakdown,
  resolveFinalPayoutAmountFromBreakdown,
} from './sharedPromoContribution';
import { attachPromoOwnershipTotals, loadPromoOwnershipTotalsForPeriod } from './promoOwnershipTotals';
import {
  buildInvoiceChannelSummary,
  buildInvoicePromoSummaryFromUsages,
  generateWithdrawalInvoice,
  parseInvoicePeriodBreakdown,
  type InvoicePromoSummary,
} from './withdrawalInvoice';
import { buildPayoutStatementFromBreakdown } from './invoice/payoutStatement';
import { getConvenienceFeeRates, getGatewayFeeRate } from './appSchema';
import {
  addDaysToDateStr,
  buildElapsedPayoutWindowsFromStart,
  listElapsedPayoutWindows,
  PAYOUT_PERIOD_DAYS,
  resolveOpenRollingPayoutWindow,
  resolvePayoutPeriod,
  resolvePayoutPeriodOptions,
  getNextPayoutStartDate,
} from './withdrawalService';
import { dayAfterUtcDateStr, toUtcDateStr } from './utcDateString';
import {
  analyticsCacheKey,
  invalidateAnalyticsCache,
  invalidateDashboardStatsCache,
  withAnalyticsCache,
} from './analyticsResponseCache';
import { resolveBranchStoreId } from '../middleware/auth';
import { payoutDraftInvoiceApiPath } from './payoutInReviewDraft';
import { ensureWithdrawalInReviewEnumReady } from './withdrawalSchema';
import { decimalFieldToCentsNumber } from './moneyDecimal';
import {
  serializeEnrichedWalletRow,
  serializeWalletSummary,
  serializeWithdrawal,
  walletBalanceCents,
  walletTotalWithdrawnCents,
  withdrawalAmountCents,
  txnAmountCents,
} from './walletApiMoney';
import type { StoreWallet, StoreWithdrawal } from '@prisma/client';
export function resolveStoreId(req: Request): string {
  return decodeURIComponent(req.params.storeId as string);
}

export async function assertStoreAccess(req: Request, storeId: string) {
  await resolveBranchStoreId(req);
  const user = req.user!;
  if (user.role !== 'SYSTEM_ADMIN' && user.storeId !== storeId) {
    throw new AppError('Forbidden', 403);
  }
}

export async function resolveScopedStoreId(req: Request, paramStoreId?: string): Promise<string | undefined> {
  await resolveBranchStoreId(req);
  const user = req.user!;
  if (user.role === 'SYSTEM_ADMIN') return paramStoreId;
  if (!user.storeId) throw new AppError('Branch not linked to your account', 403);
  if (paramStoreId && paramStoreId !== user.storeId) {
    throw new AppError('Forbidden', 403);
  }
  return user.storeId;
}

export const toDateStr = toUtcDateStr;
export const dayAfterDateStr = dayAfterUtcDateStr;

export function minFromDate(lastSettledAt: Date | null): string | null {
  if (!lastSettledAt) return null;
  return dayAfterDateStr(toDateStr(lastSettledAt));
}

export function parseSettlementRange(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new AppError('Invalid date format', 400);
  }
  if (from > to) {
    throw new AppError('Start date must be on or before end date', 400);
  }
  return { fromDate, toDate };
}

export async function loadInvoicePromoSummary(
  storeId: string,
  fromStr: string,
  toStr: string,
): Promise<{ promoSummary: InvoicePromoSummary | null; storePaybackEnabled: boolean }> {
  await ensurePlatformPaybackSchema();
  const { fromDate, toDate } = parseSettlementRange(fromStr, toStr);

  const [store, usages] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: { platformDiscountPaybackEnabled: true },
    }),
    prisma.promotionUsage.findMany({
      where: {
        storeId,
        order: {
          paymentStatus: 'PAID',
          status: { not: 'CANCELLED' },
          createdAt: { gte: fromDate, lte: toDate },
        },
      },
      select: {
        promoCode: true,
        ownership: true,
        totalDiscountAmount: true,
        platformShareAmount: true,
        branchShareAmount: true,
      },
    }),
  ]);

  const storePaybackEnabled = store?.platformDiscountPaybackEnabled ?? false;
  const centUsages = usages.map((u) => ({
    promoCode: u.promoCode,
    ownership: u.ownership,
    totalDiscountAmount: Math.round(u.totalDiscountAmount * 100),
    platformShareAmount: Math.round(u.platformShareAmount * 100),
    branchShareAmount: Math.round(u.branchShareAmount * 100),
  }));
  const promoSummary = buildInvoicePromoSummaryFromUsages(centUsages, storePaybackEnabled);
  return { promoSummary, storePaybackEnabled };
}

export function assertRangeAfterLastSettled(lastSettledAt: Date | null, from: string) {
  const minFrom = minFromDate(lastSettledAt);
  if (minFrom && from < minFrom) {
    throw new AppError(
      `Settlement range must start after the last settled date (${toDateStr(lastSettledAt!)})`,
      400,
    );
  }
}

export async function getUnsettledInRange(storeId: string, fromDate: Date, toDate: Date) {
  return prisma.walletTransaction.findMany({
    where: {
      storeId,
      type: 'ORDER_PAYMENT',
      settledAt: null,
      createdAt: { gte: fromDate, lte: toDate },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export function parseOptionalWalletPeriod(req: Request): { from: string; to: string } | undefined {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  if (!from || !to) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return undefined;
  if (from > to) return undefined;
  return { from, to };
}

export const FIXED_PAYOUT_PERIOD_DAYS = 15 as (typeof PAYOUT_PERIOD_DAYS)[number];

export function periodKey(from: string, to: string) {
  return `${from}|${to}`;
}

export function withdrawalPeriodDateStr(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return toDateStr(new Date(value));
  return toDateStr(value);
}

export function breakdownOrderCount(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  const count = (breakdown as { orderCount?: unknown }).orderCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

export const PAYOUT_PERIOD_LIST_SELECT = {
  id: true,
  storeId: true,
  amount: true,
  status: true,
  remarks: true,
  periodFrom: true,
  periodTo: true,
  rejectionReason: true,
  paymentMethod: true,
  proofUrl: true,
  checkNumber: true,
  checkDate: true,
  invoiceUrl: true,
  invoiceRef: true,
  reviewedAt: true,
  createdAt: true,
  isAdvance: true,
  breakdown: true,
  cycleStage: true,
  cyclePairId: true,
} as const;

/** Table-row summary: merged period net/orderCount without channel snapshot extras. */
export async function computeMergedPeriodSummary(
  storeId: string,
  from: string,
  to: string,
  cycleCtx?: PayoutCycleContext,
) {
  return computePeriodBreakdownForPayout(storeId, from, to, cycleCtx);
}

export const PAYOUT_PERIODS_CACHE_TTL_MS = 45_000;

export async function loadPayoutPeriodItems(storeId: string) {
  await ensureWithdrawalInReviewEnumReady();
  const [withdrawals, unpaidWindows] = await Promise.all([
    prisma.storeWithdrawal.findMany({
      where: {
        storeId,
        status: { in: ['PENDING', 'APPROVED', 'IN_REVIEW'] },
        periodFrom: { not: null },
        periodTo: { not: null },
      },
      orderBy: { periodTo: 'desc' },
      select: PAYOUT_PERIOD_LIST_SELECT,
    }),
    listElapsedPayoutWindows(storeId, FIXED_PAYOUT_PERIOD_DAYS),
  ]);

  const covered = new Set<string>();
  const items: Array<{
    key: string;
    periodFrom: string;
    periodTo: string;
    summaryThrough?: string;
    status: 'PAID' | 'PENDING' | 'IN_PROGRESS' | 'PAYMENT_PENDING';
    amountCents: number;
    orderCount: number;
    breakdown: unknown;
    withdrawal: (typeof withdrawals)[number] | null;
    draftInvoiceUrl?: string | null;
  }> = [];

  for (const withdrawal of withdrawals) {
    const periodFrom = withdrawalPeriodDateStr(withdrawal.periodFrom);
    const periodTo = withdrawalPeriodDateStr(withdrawal.periodTo);
    if (!periodFrom || !periodTo) continue;
    covered.add(periodKey(periodFrom, periodTo));
    const isInReview = withdrawal.status === 'IN_REVIEW';
    let breakdown: unknown = withdrawal.breakdown ?? null;
    if (withdrawal.cycleStage === 'SECOND' && breakdown && typeof breakdown === 'object') {
      const prior = await secondPayoutPriorBeforeGatewayFeeCents(storeId, withdrawal.cyclePairId);
      if (prior != null) {
        breakdown = refreshSecondPayoutGatewayAndNet({
          ...(breakdown as PeriodBreakdown),
          cycleStage: 'SECOND',
          priorOnlineWalletAmountCents: prior,
        });
      }
    }
    const withdrawalForRow =
      breakdown === withdrawal.breakdown ? withdrawal : { ...withdrawal, breakdown };
    items.push({
      key: `wd-${withdrawal.id}`,
      periodFrom,
      periodTo,
      status:
        withdrawal.status === 'APPROVED'
          ? 'PAID'
          : isInReview
            ? 'PAYMENT_PENDING'
            : 'PENDING',
      amountCents: withdrawalAmountCents(withdrawal),
      orderCount: breakdownOrderCount(breakdown),
      breakdown,
      withdrawal: withdrawalForRow,
      draftInvoiceUrl: isInReview
        ? withdrawal.invoiceUrl ?? payoutDraftInvoiceApiPath(withdrawal.id)
        : undefined,
    });
  }

  const uncoveredWindows = unpaidWindows.filter(
    (window) => !covered.has(periodKey(window.from, window.to)),
  );

  const openWindow = await resolveOpenRollingPayoutWindow(storeId, FIXED_PAYOUT_PERIOD_DAYS);
  let inProgressIdealTo: string | null = null;
  if (openWindow?.capped && openWindow.from <= openWindow.to) {
    inProgressIdealTo = addDaysToDateStr(openWindow.from, FIXED_PAYOUT_PERIOD_DAYS - 1);
  }

  const windowsForCycleContext: PayoutWindowBounds[] = uncoveredWindows.map((window) => ({
    from: window.from,
    to: window.to,
  }));
  if (openWindow && inProgressIdealTo) {
    const inProgressKey = periodKey(openWindow.from, inProgressIdealTo);
    const pendingKeysPreview = new Set(
      uncoveredWindows.map((w) => periodKey(w.from, w.to)),
    );
    if (!covered.has(inProgressKey) && !pendingKeysPreview.has(inProgressKey)) {
      windowsForCycleContext.push({ from: openWindow.from, to: inProgressIdealTo });
    }
  }

  const cycleContextsByWindow = await resolveCycleContextsForWindows(
    storeId,
    windowsForCycleContext,
  );

  const pendingWindows: Array<{
    key: string;
    periodFrom: string;
    periodTo: string;
    status: 'PENDING';
    amountCents: number;
    orderCount: number;
    breakdown: unknown;
    withdrawal: null;
  }> = [];

  for (const window of uncoveredWindows) {
    const cycleCtx =
      cycleContextsByWindow.get(payoutWindowKey(window.from, window.to)) ?? {
        cycleStage: 'FIRST' as const,
      };
    const merged = await computeMergedPeriodSummary(storeId, window.from, window.to, cycleCtx);
    if (merged.netAmount <= 0) continue;
    pendingWindows.push({
      key: `period-${window.from}-${window.to}`,
      periodFrom: window.from,
      periodTo: window.to,
      status: 'PENDING',
      amountCents: merged.netAmount,
      orderCount: merged.orderCount,
      breakdown: {
        cycleStage: merged.cycleStage ?? cycleCtx.cycleStage,
        cycleFrom: merged.cycleFrom ?? cycleCtx.cycleFrom,
        cycleTo: merged.cycleTo ?? cycleCtx.cycleTo ?? window.to,
      },
      withdrawal: null,
    });
  }

  items.push(...pendingWindows);

  if (openWindow?.capped && openWindow.from <= openWindow.to && inProgressIdealTo) {
    const inProgressKey = periodKey(openWindow.from, inProgressIdealTo);
    const pendingKeys = new Set(
      pendingWindows.map((w) => periodKey(w.periodFrom, w.periodTo)),
    );
    if (!covered.has(inProgressKey) && !pendingKeys.has(inProgressKey)) {
      const summaryThrough =
        openWindow.to < openWindow.from ? openWindow.from : openWindow.to;
      const cycleCtx =
        cycleContextsByWindow.get(payoutWindowKey(openWindow.from, inProgressIdealTo)) ?? {
          cycleStage: 'FIRST' as const,
        };
      const merged = await computeMergedPeriodSummary(
        storeId,
        openWindow.from,
        summaryThrough,
        cycleCtx,
      );
      // Visibility only — same summary helpers; show open cycle even when net is still zero.
      items.push({
        key: `period-in-progress-${openWindow.from}-${inProgressIdealTo}`,
        periodFrom: openWindow.from,
        periodTo: inProgressIdealTo,
        summaryThrough,
        status: 'IN_PROGRESS',
        amountCents: merged.netAmount,
        orderCount: merged.orderCount,
        breakdown: {
          cycleStage: merged.cycleStage ?? cycleCtx.cycleStage,
          cycleFrom: merged.cycleFrom ?? cycleCtx.cycleFrom,
          cycleTo: merged.cycleTo ?? cycleCtx.cycleTo ?? inProgressIdealTo,
        },
        withdrawal: null,
      });
    }
  }

  items.sort((a, b) => {
    if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
    if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
    return b.periodTo.localeCompare(a.periodTo) || b.periodFrom.localeCompare(a.periodFrom);
  });
  return items;
}

export function roundLkr(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function buildPayoutDetailData(transactionId: string) {
  const txn = await prisma.walletTransaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      storeId: true,
      type: true,
      amount: true,
      reference: true,
      createdAt: true,
    },
  });

  if (!txn) throw new AppError('Transaction not found', 404);
  if (txn.type !== 'PAYOUT') throw new AppError('Not a payout transaction', 400);

  const withdrawal = await prisma.storeWithdrawal.findFirst({
    where: { walletTransactionId: transactionId },
  });
  if (!withdrawal) throw new AppError('Payout withdrawal not found', 404);
  if (!withdrawal.periodFrom || !withdrawal.periodTo) {
    throw new AppError('Payout period is not available for this withdrawal', 400);
  }

  const fromStr = toDateStr(withdrawal.periodFrom);
  const toStr = toDateStr(withdrawal.periodTo);
  const periodEnd = new Date(`${toStr}T23:59:59.999Z`);

  let breakdown = parseInvoicePeriodBreakdown(withdrawal.breakdown);
  if (!breakdown) {
    const computed = await computeBreakdownForPeriod(txn.storeId, fromStr, toStr);
    breakdown = parseInvoicePeriodBreakdown(computed);
  }

  const [channelPreview, convenienceFeeRates, creditTxns, liveGatewayFeeRate] = await Promise.all([
    buildPeriodChannelPreview(txn.storeId, fromStr, toStr),
    getConvenienceFeeRates(),
    prisma.walletTransaction.findMany({
      where: {
        storeId: txn.storeId,
        type: { in: ['ORDER_PAYMENT', 'ORDER_ADDON_PAYMENT'] },
        amount: { gt: 0 },
        createdAt: {
          gte: withdrawal.periodFrom,
          lte: periodEnd,
        },
      },
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        orderId: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    getGatewayFeeRate(),
  ]);

  const channelSummary = buildInvoiceChannelSummary(channelPreview.breakdown);

  const orderIds = [
    ...new Set(
      creditTxns
        .map((creditTxn) => creditTxn.orderId)
        .filter((orderId): orderId is string => !!orderId),
    ),
  ];

  const orders =
    orderIds.length > 0
      ? await prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: {
            id: true,
            deliveryFee: true,
            convenientFee: true,
            subtotal: true,
            discount: true,
            loyaltyDiscount: true,
            total: true,
            orderMode: true,
            paymentMethod: true,
          },
        })
      : [];

  const orderById = new Map(orders.map((order) => [order.id, order]));

  const slabRatePct =
    channelPreview.slabInfo?.effectiveRate != null
      ? Math.round(channelPreview.slabInfo.effectiveRate * 1000) / 10
      : channelSummary.commissionRatePct;

  const dayKey = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  type DayBucket = {
    date: string;
    orderIds: Set<string>;
    orderTotal: number;
    deliveryFeeTotal: number;
  };

  const dailyMap = new Map<string, DayBucket>();

  for (const creditTxn of creditTxns) {
    const day = dayKey(creditTxn.createdAt);
    let bucket = dailyMap.get(day);
    if (!bucket) {
      bucket = {
        date: day,
        orderIds: new Set<string>(),
        orderTotal: 0,
        deliveryFeeTotal: 0,
      };
      dailyMap.set(day, bucket);
    }

    const walletLkr = txnAmountCents(creditTxn) / 100;
    const order = creditTxn.orderId ? orderById.get(creditTxn.orderId) : undefined;
    if (creditTxn.type === 'ORDER_ADDON_PAYMENT') {
      bucket.orderTotal += walletLkr;
      if (creditTxn.orderId) bucket.orderIds.add(creditTxn.orderId);
      continue;
    }

    if (order) {
      bucket.orderTotal += platformItemSalesLkr(order);
      bucket.deliveryFeeTotal += order.deliveryFee ?? 0;
    } else {
      bucket.orderTotal += walletLkr;
    }
    if (creditTxn.orderId) bucket.orderIds.add(creditTxn.orderId);
  }

  const periodCredits = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bucket) => ({
      date: bucket.date,
      orderCount: bucket.orderIds.size,
      orderTotal: roundLkr(bucket.orderTotal),
      deliveryFeeTotal: roundLkr(bucket.deliveryFeeTotal),
    }));

  const totalOrderCredits = breakdown
    ? roundLkr(breakdown.grossAmountCents / 100)
    : roundLkr(periodCredits.reduce((sum, row) => sum + row.orderTotal, 0));
  const totalDeliveryFee = breakdown
    ? roundLkr(breakdown.deliveryFeeCents / 100)
    : roundLkr(periodCredits.reduce((sum, row) => sum + row.deliveryFeeTotal, 0));
  const onlineWalletGross = breakdown
    ? roundLkr(breakdown.onlineWalletGrossCents / 100)
    : roundLkr(totalOrderCredits + totalDeliveryFee);
  const platformCommission = breakdown ? roundLkr(breakdown.commissionFeeCents / 100) : 0;
  const paymentGatewayFee = breakdown ? roundLkr(breakdown.gatewayFeeCents / 100) : 0;
  const customerConvenienceFee = breakdown ? roundLkr(breakdown.convenienceFeeCents / 100) : 0;
  const totalDeductions = roundLkr(
    platformCommission + paymentGatewayFee + customerConvenienceFee,
  );
  const netPayout = roundLkr(Math.abs(txnAmountCents(txn)) / 100);
  const grossSalesForCommission = breakdown
    ? roundLkr(breakdown.grossAmountCents / 100)
    : totalOrderCredits;
  const gatewayBase = breakdown ? roundLkr(breakdown.gatewayBaseCents / 100) : onlineWalletGross;
  const convenienceFeeBase = roundLkr(channelSummary.convenienceBaseCents / 100);
  const revenueSubtotal =
    channelSummary.commissionBaseCents > 0
      ? roundLkr(channelSummary.commissionBaseCents / 100)
      : grossSalesForCommission;

  const storedGatewayRatePct =
    withdrawal.breakdown &&
    typeof withdrawal.breakdown === 'object' &&
    typeof (withdrawal.breakdown as Record<string, unknown>).gatewayRatePct === 'number'
      ? ((withdrawal.breakdown as Record<string, unknown>).gatewayRatePct as number)
      : null;
  const gatewayRatePct =
    storedGatewayRatePct ?? Math.round(liveGatewayFeeRate * 1000) / 10;

  return {
    storeId: txn.storeId,
    transactionId: txn.id,
    withdrawalId: withdrawal.id,
    referenceId: txn.reference ?? `WD-${withdrawal.id.slice(0, 8)}`,
    amount: netPayout,
    periodFrom: withdrawal.periodFrom,
    periodTo: withdrawal.periodTo,
    periodLabel: `${fromStr} → ${toStr}`,
    paymentMethod: withdrawal.paymentMethod,
    hasProof: Boolean(withdrawal.proofUrl),
    proofUrl: null,
    invoiceRef: withdrawal.invoiceRef,
    invoiceUrl: withdrawal.invoiceUrl,
    remarks: withdrawal.remarks,
    isAdvance: withdrawal.isAdvance,
    orderCount:
      breakdown?.orderCount ?? periodCredits.reduce((sum, row) => sum + row.orderCount, 0),
    slabRatePct,
    gatewayRatePct,
    convenienceFeeRatePct: Math.round(convenienceFeeRates.delivery * 1000) / 10,
    // Canonical settlement fields
    revenueSubtotal,
    deliveryFee: totalDeliveryFee,
    onlinePaymentsCollected: onlineWalletGross,
    platformCommission,
    paymentGatewayFee,
    customerConvenienceFee,
    netPayout,
    // Basis helpers
    grossSalesForCommission,
    gatewayBase,
    convenienceFeeBase,
    // Legacy aliases
    periodCredits,
    totalOrderCredits,
    totalDeliveryFee,
    onlineWalletGross,
    totalDeductions,
  };
}

export type NetPreviewPeriodQuery = {
  from?: string;
  to?: string;
  periodDays?: number;
};

export async function resolveNetPreviewPeriodBounds(
  storeId: string,
  parsed: NetPreviewPeriodQuery,
): Promise<{ from: string; to: string }> {
  let from = parsed.from;
  let to = parsed.to;
  if (parsed.periodDays != null) {
    const resolved = await resolvePayoutPeriod(
      storeId,
      parsed.periodDays as (typeof PAYOUT_PERIOD_DAYS)[number],
    );
    from = resolved.from;
    to = resolved.to;
  }
  if (!from || !to) throw new AppError('from/to or periodDays is required', 400);
  if (from > to) throw new AppError('Start date must be on or before end date', 400);
  return { from, to };
}

export async function buildNetPreviewResponseData(storeId: string, from: string, to: string) {
  const loadStorePaybackFlag = () =>
    prisma.store.findUnique({
      where: { id: storeId },
      select: { platformDiscountPaybackEnabled: true },
    });

  const cycle = await resolveCycleContextForWindow(storeId, from, to);

  const [periodBreakdown, orderAvailable, storeRow] = await Promise.all([
    computePeriodBreakdownForPayout(storeId, from, to, cycle),
    computePeriodOrderAvailableCents(storeId, from, to, cycle),
    loadStorePaybackFlag().catch(async (err) => {
      const code = (err as { code?: string })?.code;
      if (code !== 'P2022') throw err;
      await ensurePlatformPaybackSchema();
      return loadStorePaybackFlag();
    }),
  ]);
  const channelPreview = channelPreviewFromPeriodBreakdown(periodBreakdown, from, to);
  const finalPayoutFields = enrichSharedPromoForApi(
    {
      sharedPromoTotalDiscount: periodBreakdown.sharedPromoTotalDiscount ?? 0,
      sharedPromoBranchContributionPct: periodBreakdown.sharedPromoBranchContributionPct ?? 0,
      sharedPromoBranchContributionAmount: periodBreakdown.sharedPromoBranchContributionAmount ?? 0,
      sharedPromoPlatformContributionPct: periodBreakdown.sharedPromoPlatformContributionPct ?? 0,
      sharedPromoPlatformContributionAmount:
        periodBreakdown.sharedPromoPlatformContributionAmount ?? 0,
      sharedPromoJasonContributionPct: periodBreakdown.sharedPromoJasonContributionPct ?? 0,
      sharedPromoJasonContributionAmount: periodBreakdown.sharedPromoJasonContributionAmount ?? 0,
    },
    periodBreakdown.netAmount,
  );

  const durationDays =
    Math.floor(
      (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1;

  const cycleLabel =
    periodBreakdown.cycleStage === 'SECOND'
      ? `Payout 2 · cycle ${periodBreakdown.cycleFrom ?? from} – ${to}`
      : 'Payout 1';

  const cycleStage = periodBreakdown.cycleStage ?? cycle.cycleStage;
  let tableAllocationConvenienceFee = periodBreakdown.convenienceFee;
  let tableAllocationDeliveryFee = periodBreakdown.deliveryFee;
  if (cycleStage === 'SECOND') {
    const cycleFrom = periodBreakdown.cycleFrom ?? cycle.cycleFrom ?? from;
    const cycleTo = periodBreakdown.cycleTo ?? to;
    const tableAlloc = await resolveSecondPayoutTableAllocationCents(
      storeId,
      cycleFrom,
      cycleTo,
    );
    tableAllocationConvenienceFee = tableAlloc.convenienceFee;
    tableAllocationDeliveryFee = tableAlloc.deliveryFee;
  }

  return {
    ...periodBreakdown,
    from,
    to,
    durationDays,
    cycleLabel,
    cycleStage,
    cycleFrom: periodBreakdown.cycleFrom ?? cycle.cycleFrom,
    cycleTo: periodBreakdown.cycleTo ?? to,
    payoutWindowFrom: periodBreakdown.payoutWindowFrom ?? from,
    payoutWindowTo: periodBreakdown.payoutWindowTo ?? to,
    tableAllocationConvenienceFee,
    tableAllocationDeliveryFee,
    priorOnlineWalletAmountLkr: (periodBreakdown.priorOnlineWalletAmountCents ?? 0) / 100,
    remainingOnlineWalletLkr: (periodBreakdown.remainingOnlineWalletCents ?? 0) / 100,
    platformDiscountPaybackEnabled: storeRow?.platformDiscountPaybackEnabled ?? false,
    totalSalesLkr: periodBreakdown.windowBase / 100,
    commissionRatePct: Math.round(periodBreakdown.commissionRate * 1000) / 10,
    tierLabel: periodBreakdown.tierLabel,
    commissionAmountLkr: periodBreakdown.commissionFee / 100,
    netAmountLkr: periodBreakdown.netAmount / 100,
    cancelledByBranchGatewayFeeLkr: periodBreakdown.cancelledByBranchGatewayFee / 100,
    cancelledByBranchOrderCount: periodBreakdown.cancelledByBranchOrderCount,
    customerLateCancelSubtotalLkr: periodBreakdown.customerLateCancelSubtotal / 100,
    customerLateCancelGatewayDeductionLkr: periodBreakdown.customerLateCancelGatewayDeduction / 100,
    customerLateCancelNetAmountLkr: periodBreakdown.customerLateCancelNetAmount / 100,
    rejectedRefundSubtotalLkr: periodBreakdown.rejectedRefundSubtotal / 100,
    rejectedRefundGatewayDeductionLkr: periodBreakdown.rejectedRefundGatewayDeduction / 100,
    rejectedRefundNetAmountLkr: periodBreakdown.rejectedRefundNetAmount / 100,
    channelPreview,
    orderAvailableFromOrdersLkr: orderAvailable.fromOrdersCents / 100,
    orderAvailableRemainingLkr: orderAvailable.remainingCents / 100,
    orderPayoutReservedLkr: orderAvailable.priorPayoutCents / 100,
    ...finalPayoutFields,
  };
}

export async function buildPayoutPeriodInfoData(storeId: string) {
  const nextStartDate = await getNextPayoutStartDate(storeId);
  const options = await resolvePayoutPeriodOptions(storeId);

  const optionsWithSharedPromo = await Promise.all(
    options.map(async (opt) => {
      const [sharedPromo, period] = await Promise.all([
        computeSharedPromoContribution(storeId, opt.from, opt.to),
        computeBreakdownForPeriod(storeId, opt.from, opt.to),
      ]);
      const breakdown = mergeSharedPromoIntoBreakdown(period, sharedPromo);
      return {
        ...opt,
        ...breakdown,
        ...enrichSharedPromoForApi(sharedPromo, breakdown.netAmount),
      };
    }),
  );

  return {
    nextStartDate,
    lockStartDate: nextStartDate != null,
    periodType: 'rolling' as const,
    options: optionsWithSharedPromo,
  };
}

function isValidYmdDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Calendar month-to-date (matches frontend `currentMonthPeriod`). */
export function defaultSuperAdminPayoutsDuePeriod(): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${pad(now.getDate())}` };
}

function inclusivePeriodDays(periodFrom: string, periodTo: string): number {
  const start = new Date(`${periodFrom}T00:00:00.000Z`).getTime();
  const end = new Date(`${periodTo}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

export type SuperAdminPayoutDueItem = {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  days: number;
  netAmountCents: number;
  orderCount: number;
  /** Period ledger snapshot for allocation columns (withdrawal JSON or computed period breakdown). */
  breakdown: unknown | null;
  /** Set when the due row is backed by a branch withdrawal (PENDING or IN_REVIEW). */
  withdrawalId?: string;
  /** Oldest unpaid window for this branch across the full due list. */
  isOldestUnpaid: boolean;
};

/** Max elapsed 15-day windows per branch in the Super Admin due queue (matches payout validation). */
export const PAYOUTS_DUE_UNPAID_WINDOW_MAX = 24;

type PayoutPeriodWithdrawalRow = {
  id: string;
  storeId: string;
  amount: unknown;
  status: string;
  periodFrom: Date | null;
  periodTo: Date | null;
  breakdown: unknown;
};

function nextPayoutStartFromWithdrawals(
  withdrawals: Array<{ periodTo: Date | null }>,
): string | null {
  let latest: Date | null = null;
  for (const withdrawal of withdrawals) {
    if (!withdrawal.periodTo) continue;
    if (!latest || withdrawal.periodTo > latest) latest = withdrawal.periodTo;
  }
  if (!latest) return null;
  return addDaysToDateStr(withdrawalPeriodDateStr(latest)!, 1);
}

/** Build due rows for one store from prefetched withdrawals (+ optional earliest order day). */
async function buildStorePayoutsDueRows(
  storeId: string,
  storeName: string,
  withdrawals: PayoutPeriodWithdrawalRow[],
  earliestPaidOrderDay: string | null,
): Promise<SuperAdminPayoutDueItem[]> {
  const covered = new Set<string>();
  const rows: SuperAdminPayoutDueItem[] = [];

  for (const withdrawal of withdrawals) {
    const periodFrom = withdrawalPeriodDateStr(withdrawal.periodFrom);
    const periodTo = withdrawalPeriodDateStr(withdrawal.periodTo);
    if (!periodFrom || !periodTo) continue;
    covered.add(periodKey(periodFrom, periodTo));
    if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'IN_REVIEW') continue;
    const netAmountCents = withdrawalAmountCents(withdrawal as never);
    if (netAmountCents <= 0) continue;
    rows.push({
      storeId,
      storeName,
      periodFrom,
      periodTo,
      days: inclusivePeriodDays(periodFrom, periodTo),
      netAmountCents,
      orderCount: breakdownOrderCount(withdrawal.breakdown),
      breakdown: withdrawal.breakdown ?? null,
      withdrawalId: withdrawal.id,
      isOldestUnpaid: false,
    });
  }

  const startFrom = nextPayoutStartFromWithdrawals(withdrawals) ?? earliestPaidOrderDay;
  const unpaidWindows = buildElapsedPayoutWindowsFromStart(
    startFrom,
    FIXED_PAYOUT_PERIOD_DAYS,
    PAYOUTS_DUE_UNPAID_WINDOW_MAX,
  ).filter((window) => !covered.has(periodKey(window.from, window.to)));

  const cycleContextsByWindow = await resolveCycleContextsForWindows(
    storeId,
    unpaidWindows.map((window) => ({ from: window.from, to: window.to })),
  );

  // Period breakdown is expensive — run a few at a time, not serially forever.
  const windowRows = await promiseAllLimited(
    Math.min(2, getPrismaFanOutLimit()),
    unpaidWindows.map(
      (window) => async (): Promise<SuperAdminPayoutDueItem | null> => {
        const cycleCtx =
          cycleContextsByWindow.get(payoutWindowKey(window.from, window.to)) ?? {
            cycleStage: 'FIRST' as const,
          };
        const merged = await computeMergedPeriodSummary(
          storeId,
          window.from,
          window.to,
          cycleCtx,
        );
        if (merged.netAmount <= 0) return null;
        return {
          storeId,
          storeName,
          periodFrom: window.from,
          periodTo: window.to,
          days: inclusivePeriodDays(window.from, window.to),
          netAmountCents: merged.netAmount,
          orderCount: merged.orderCount,
          breakdown: {
            cycleStage: merged.cycleStage ?? cycleCtx.cycleStage,
            cycleFrom: merged.cycleFrom ?? cycleCtx.cycleFrom,
            cycleTo: merged.cycleTo ?? cycleCtx.cycleTo ?? window.to,
          },
          isOldestUnpaid: false,
        };
      },
    ),
  );

  for (const row of windowRows) {
    if (row) rows.push(row);
  }
  rows.sort(
    (a, b) => a.periodFrom.localeCompare(b.periodFrom) || a.periodTo.localeCompare(b.periodTo),
  );
  return rows.map((row, index) => ({ ...row, isOldestUnpaid: index === 0 }));
}

/** Stores computed together so Prisma fan-out stays bounded. */
const PAYOUTS_DUE_STORE_CHUNK = 3;

const PAYOUTS_DUE_CACHE_TTL_MS = 60_000;

export const PAYOUTS_DUE_PAGE_SIZE = 10;

export type SuperAdminPayoutsDuePage = {
  items: SuperAdminPayoutDueItem[];
  total: number;
  allTotal: number;
  page: number;
  limit: number;
  pages: number;
};

function branchPayoutDueSearchHaystack(storeName: string): string {
  const raw = storeName.toLowerCase();
  const label = storeName.replace(/^Bing Chun\s*[-–]\s*/i, '').trim().toLowerCase();
  return `${raw}\n${label}`;
}

function matchesPayoutDueSearch(storeName: string, query: string): boolean {
  if (!query) return true;
  return branchPayoutDueSearchHaystack(storeName).includes(query);
}

async function buildPayoutsDueRowsForStores(
  slice: Array<{ id: string; name: string }>,
): Promise<SuperAdminPayoutDueItem[]> {
  if (slice.length === 0) return [];
  const storeIds = slice.map((store) => store.id);
  const allWithdrawals = await prisma.storeWithdrawal.findMany({
    where: {
      storeId: { in: storeIds },
      status: { in: ['PENDING', 'APPROVED', 'IN_REVIEW'] },
      periodFrom: { not: null },
      periodTo: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: PAYOUT_PERIOD_LIST_SELECT,
  });

  const withdrawalsByStore = new Map<string, PayoutPeriodWithdrawalRow[]>();
  for (const row of allWithdrawals) {
    const list = withdrawalsByStore.get(row.storeId) ?? [];
    list.push(row as PayoutPeriodWithdrawalRow);
    withdrawalsByStore.set(row.storeId, list);
  }

  const storesNeedingEarliest = storeIds.filter(
    (id) => (withdrawalsByStore.get(id)?.length ?? 0) === 0,
  );
  const earliestByStore = new Map<string, string>();
  if (storesNeedingEarliest.length > 0) {
    const earliestRows = await promiseAllLimited(
      getPrismaFanOutLimit(),
      storesNeedingEarliest.map(
        (storeId) => async () => {
          const earliest = await prisma.order.findFirst({
            where: { storeId, paymentStatus: 'PAID' },
            orderBy: { createdAt: 'asc' },
            select: { storeId: true, createdAt: true },
          });
          return earliest;
        },
      ),
    );
    for (const row of earliestRows) {
      if (!row) continue;
      const day = withdrawalPeriodDateStr(row.createdAt);
      if (day) earliestByStore.set(row.storeId, day);
    }
  }

  const perStoreRows = await promiseAllLimited(
    getPrismaFanOutLimit(),
    slice.map(
      (store) => () =>
        buildStorePayoutsDueRows(
          store.id,
          store.name,
          withdrawalsByStore.get(store.id) ?? [],
          earliestByStore.get(store.id) ?? null,
        ),
    ),
  );
  return perStoreRows.flat();
}

async function loadAllSuperAdminPayoutsDueItems(): Promise<SuperAdminPayoutDueItem[]> {
  const cacheKey = analyticsCacheKey(['wallet-payouts-due', 'all']);
  return withAnalyticsCache(cacheKey, async () => {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    stores.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (stores.length === 0) return [];

    const items: SuperAdminPayoutDueItem[] = [];
    for (let start = 0; start < stores.length; start += PAYOUTS_DUE_STORE_CHUNK) {
      const slice = stores.slice(start, start + PAYOUTS_DUE_STORE_CHUNK);
      items.push(...(await buildPayoutsDueRowsForStores(slice)));
    }
    items.sort(
      (a, b) =>
        a.periodFrom.localeCompare(b.periodFrom) ||
        a.periodTo.localeCompare(b.periodTo) ||
        a.storeName.localeCompare(b.storeName),
    );
    return items;
  }, PAYOUTS_DUE_CACHE_TTL_MS);
}

export async function listSuperAdminPayoutsDueItems(query?: {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  search?: string;
}): Promise<SuperAdminPayoutsDuePage> {
  await ensureWithdrawalInReviewEnumReady();
  const limit = Math.min(100, Math.max(1, query?.limit ?? PAYOUTS_DUE_PAGE_SIZE));
  const search = (query?.search ?? '').trim().toLowerCase();
  const all = await loadAllSuperAdminPayoutsDueItems();
  const filtered = search ? all.filter((item) => matchesPayoutDueSearch(item.storeName, search)) : all;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / limit) || 1);
  const page = Math.min(Math.max(1, query?.page ?? 1), pages);
  const start = (page - 1) * limit;
  return {
    items: filtered.slice(start, start + limit),
    total,
    allTotal: all.length,
    page,
    limit,
    pages,
  };
}

export type PeriodBranchReportRow = {
  storeId: string;
  storeName: string;
  totalIn: number;
  pickupOnlineIn: number;
  deliveryCardIn: number;
  totalOut: number;
  currentBalance: number;
};

async function loadPeriodBranchReportsForWallets(
  wallets: Array<
    Pick<StoreWallet, 'storeId' | 'balance'> & { store: { name: string } }
  >,
  from: string,
  to: string,
): Promise<PeriodBranchReportRow[]> {
  const storeIds = wallets.map((w) => w.storeId);
  if (storeIds.length === 0) return [];

  const dateFilter = orderCreatedAtFilter(from, to);
  const revenueGroups = await prisma.order.groupBy({
    by: ['storeId', 'orderMode', 'paymentMethod'],
    where: {
      storeId: { in: storeIds },
      paymentStatus: 'PAID',
      ...dateFilter,
    },
    _sum: { total: true },
  });

  const groupsByStore = new Map<
    string,
    { orderMode: string; paymentMethod: string; totalSum: number }[]
  >();
  for (const row of revenueGroups) {
    const list = groupsByStore.get(row.storeId) ?? [];
    list.push({
      orderMode: row.orderMode,
      paymentMethod: row.paymentMethod,
      totalSum: row._sum.total ?? 0,
    });
    groupsByStore.set(row.storeId, list);
  }

  const txnOutByStore = await prisma.walletTransaction.groupBy({
    by: ['storeId'],
    _sum: { amount: true },
    where: {
      storeId: { in: storeIds },
      type: { in: ['REFUND', 'PAYOUT'] } as const,
      ...dateFilter,
    },
  });
  const txnOutMap = new Map(
    txnOutByStore.map((row) => [
      row.storeId,
      Math.abs(decimalFieldToCentsNumber(row._sum.amount)),
    ]),
  );

  return wallets.map((wallet) => {
    const revenue = summarizeOrderRevenueFromGroups(groupsByStore.get(wallet.storeId) ?? []);
    return {
      storeId: wallet.storeId,
      storeName: wallet.store.name,
      totalIn: revenue.totalIn,
      pickupOnlineIn: revenue.pickupOnlineIn,
      deliveryCardIn: revenue.deliveryCardIn,
      totalOut: txnOutMap.get(wallet.storeId) ?? 0,
      currentBalance: walletBalanceCents(wallet),
    };
  });
}

export async function loadAdminWalletListPayload(
  user: JwtPayload,
  dashboardPeriod: { from: string; to: string } | undefined,
) {
  const isSuper = user.role === 'SYSTEM_ADMIN';
  const whereStore = isSuper ? {} : { id: user.storeId! };

  const stores = await prisma.store.findMany({
    where: whereStore,
    select: { id: true, name: true, city: true, isActive: true },
  });

  await promiseAllLimited(
    getPrismaFanOutLimit(),
    stores.map((s) => () => getOrCreateWallet(s.id)),
  );

  const wallets = await prisma.storeWallet.findMany({
    where: isSuper ? undefined : { storeId: user.storeId! },
    include: {
      store: { select: { id: true, name: true, city: true, isActive: true } },
    },
    orderBy: { balance: 'desc' },
  });

  const storeIds = wallets.map((w) => w.storeId);

  const [txnCounts, pendingByStore] = storeIds.length
    ? await Promise.all([
        prisma.walletTransaction.groupBy({
          by: ['storeId'],
          _count: { _all: true },
          where: { storeId: { in: storeIds } },
        }),
        prisma.storeWithdrawal.groupBy({
          by: ['storeId'],
          _sum: { amount: true },
          where: { storeId: { in: storeIds }, status: 'PENDING' },
        }),
      ])
    : [[], []];

  const txnCountMap = new Map(txnCounts.map((row) => [row.storeId, row._count._all]));
  const pendingMap = new Map(
    pendingByStore.map((row) => [row.storeId, decimalFieldToCentsNumber(row._sum.amount)]),
  );

  const netEarningsMap = new Map<string, number>();
  if (!isSuper && wallets.length === 1) {
    netEarningsMap.set(
      wallets[0].storeId,
      await computeNetTransferableEarnings(wallets[0].storeId),
    );
  }

  const allTimeAvailableByStore = new Map<string, number>();
  const allTimeOnlineWalletByStore = new Map<string, number>();
  if (storeIds.length > 0) {
    const rows: Array<{
      storeId: string;
      remainingCents: number;
      allTimeOnlineWalletCents: number;
    }> = await promiseAllLimited(
      getPrismaFanOutLimit(),
      storeIds.map(
        (id) => (): Promise<{
          storeId: string;
          remainingCents: number;
          allTimeOnlineWalletCents: number;
        }> =>
          computeBranchPayablesBreakdown(id).then((breakdown) => ({
            storeId: id,
            remainingCents: breakdown.allTimeAvailableBalanceCents,
            allTimeOnlineWalletCents: breakdown.allTimeOnlineWalletCents,
          })),
      ),
    );
    for (const row of rows) {
      allTimeAvailableByStore.set(row.storeId, row.remainingCents);
      allTimeOnlineWalletByStore.set(row.storeId, row.allTimeOnlineWalletCents);
    }
  }

  const walletsWithCounts = wallets.map((w) => {
    const pendingTotal = pendingMap.get(w.storeId) ?? 0;
    const netTransferableEarnings = netEarningsMap.get(w.storeId);
    const enriched = enrichWalletRow(w, pendingTotal, netTransferableEarnings);
    return serializeEnrichedWalletRow(w, {
      netTransferableEarnings: enriched.netTransferableEarnings,
      currentBalance: enriched.currentBalance,
      availableBalance: enriched.availableBalance,
      allTimeAvailableBalanceCents: allTimeAvailableByStore.get(w.storeId),
      allTimeOnlineWalletCents: allTimeOnlineWalletByStore.get(w.storeId),
      _count: { transactions: txnCountMap.get(w.storeId) ?? 0 },
    });
  });

  let systemTotals = null;
  if (isSuper) {
    const superStoreIds = wallets.map((w) => w.storeId);
    const [aggIn, aggOut] = await Promise.all([
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: {
          storeId: { in: superStoreIds },
          type: { in: ['ORDER_PAYMENT', 'ORDER_ADDON_PAYMENT'] },
        },
      }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: {
          storeId: { in: superStoreIds },
          type: { in: ['REFUND', 'PAYOUT'] },
        },
      }),
    ]);
    systemTotals = {
      totalIn: String(decimalFieldToCentsNumber(aggIn._sum.amount)),
      totalOut: String(Math.abs(decimalFieldToCentsNumber(aggOut._sum.amount))),
      totalBalance: String(
        wallets.reduce(
          (s, w) => s + (allTimeAvailableByStore.get(w.storeId) ?? walletBalanceCents(w)),
          0,
        ),
      ),
    };
  }

  const summary =
    !isSuper && wallets[0]
      ? serializeWalletSummary(await getWalletSummary(wallets[0].storeId))
      : null;

  const [dashboard, periodBranchReports] = await Promise.all([
    isSuper
      ? getSuperAdminWalletDashboard(dashboardPeriod)
      : wallets[0]
        ? getBranchWalletDashboard(wallets[0].storeId, dashboardPeriod)
        : Promise.resolve(null),
    dashboardPeriod && isSuper && wallets.length > 0
      ? loadPeriodBranchReportsForWallets(wallets, dashboardPeriod.from, dashboardPeriod.to)
      : Promise.resolve(null),
  ]);

  return {
    wallets: walletsWithCounts,
    systemTotals,
    summary,
    dashboard,
    periodBranchReports,
  };
}

export function parseSettlementCheckDate(
  paymentMethod: string,
  checkDate: string | undefined,
): Date | null {
  return paymentMethod === 'CHECK' && checkDate
    ? new Date(`${checkDate}T12:00:00.000Z`)
    : null;
}

export async function resolveGatewayRatePctFromBreakdown(breakdown: unknown): Promise<number> {
  const stored =
    breakdown &&
    typeof breakdown === 'object' &&
    typeof (breakdown as Record<string, unknown>).gatewayRatePct === 'number'
      ? ((breakdown as Record<string, unknown>).gatewayRatePct as number)
      : null;
  return stored ?? Math.round((await getGatewayFeeRate()) * 1000) / 10;
}

export async function loadWithdrawalInvoicePeriodContext(
  storeId: string,
  periodFrom: Date,
  periodTo: Date,
  storedBreakdown: unknown,
) {
  const fromStr = toDateStr(periodFrom);
  const toStr = toDateStr(periodTo);

  let periodBreakdown = parseInvoicePeriodBreakdown(storedBreakdown);
  if (!periodBreakdown) {
    const computed = await computeBreakdownForPeriod(storeId, fromStr, toStr);
    periodBreakdown = parseInvoicePeriodBreakdown(computed);
  }

  // Prefer channel snapshot locked on the withdrawal — avoid a third order scan
  // just to render the invoice after initiate-payout already computed it.
  const storedChannel =
    storedBreakdown &&
    typeof storedBreakdown === 'object' &&
    (storedBreakdown as { channelBreakdown?: Parameters<typeof buildInvoiceChannelSummary>[0] })
      .channelBreakdown;

  let channelSummary;
  let storeDiscountsCents = 0;
  if (storedChannel) {
    channelSummary = buildInvoiceChannelSummary(storedChannel);
    const storedDiscounts =
      storedBreakdown &&
      typeof storedBreakdown === 'object' &&
      typeof (storedBreakdown as { storeDiscountsTotal?: unknown }).storeDiscountsTotal === 'number'
        ? (storedBreakdown as { storeDiscountsTotal: number }).storeDiscountsTotal
        : null;
    storeDiscountsCents =
      storedDiscounts != null
        ? Math.round(storedDiscounts * 100)
        : Math.round(
            (
              ((storedBreakdown as { branchOwnedPromoDiscountTotal?: number })
                .branchOwnedPromoDiscountTotal ?? 0) +
              ((storedBreakdown as { platformOwnedPromoDiscountTotal?: number })
                .platformOwnedPromoDiscountTotal ?? 0) +
              ((storedBreakdown as { periodLoyaltyDiscountTotal?: number })
                .periodLoyaltyDiscountTotal ?? 0)
            ),
          );
  } else {
    const channelPreview = await buildPeriodChannelPreview(storeId, fromStr, toStr);
    channelSummary = buildInvoiceChannelSummary(channelPreview.breakdown);
    storeDiscountsCents = Math.round(channelPreview.storeDiscountsTotal * 100);
  }

  const promoData = await loadInvoicePromoSummary(storeId, fromStr, toStr);

  return {
    periodBreakdown,
    channelSummary,
    storeDiscountsCents,
    promoSummary: promoData.promoSummary,
    storePaybackEnabled: promoData.storePaybackEnabled,
  };
}

type WithdrawalInvoiceFinalizeInput = {
  storeId: string;
  storeName: string;
  updated: StoreWithdrawal;
  paymentMethod: 'BANK_TRANSFER' | 'CASH' | 'CHECK';
  balanceBefore: number;
  totalWithdrawnBefore: number;
  netTransferableEarnings: number;
};

export async function finalizeWithdrawalWithInvoice(input: WithdrawalInvoiceFinalizeInput) {
  const {
    storeId,
    storeName,
    updated,
    paymentMethod,
    balanceBefore,
    totalWithdrawnBefore,
    netTransferableEarnings,
  } = input;

  let periodBreakdown: ReturnType<typeof parseInvoicePeriodBreakdown> = null;
  let channelSummary = null;
  let storeDiscountsCents = 0;
  let promoSummary: InvoicePromoSummary | null = null;
  let storePaybackEnabled = false;

  if (updated.periodFrom && updated.periodTo) {
    const ctx = await loadWithdrawalInvoicePeriodContext(
      storeId,
      updated.periodFrom,
      updated.periodTo,
      updated.breakdown,
    );
    periodBreakdown = ctx.periodBreakdown;
    channelSummary = ctx.channelSummary;
    storeDiscountsCents = ctx.storeDiscountsCents;
    promoSummary = ctx.promoSummary;
    storePaybackEnabled = ctx.storePaybackEnabled;
  }

  const gatewayRatePct = await resolveGatewayRatePctFromBreakdown(updated.breakdown);
  const approvedAt = updated.reviewedAt ?? new Date();
  const paymentCents = resolveFinalPayoutAmountFromBreakdown(
    updated.breakdown,
    withdrawalAmountCents(updated),
  );
  const withdrawnCents = withdrawalAmountCents(updated);
  const remainingNetTransferable = Math.max(
    0,
    netTransferableEarnings - totalWithdrawnBefore - withdrawnCents,
  );

  const invoicePayload = await generateWithdrawalInvoice({
    storeId,
    withdrawalId: updated.id,
    storeName,
    branchBalanceCents: balanceBefore,
    requestedCents: paymentCents,
    balanceAfterCents: balanceBefore - withdrawnCents,
    netTransferableEarningsCents: netTransferableEarnings,
    netTransferableEarningsAsOf: approvedAt,
    remainingNetTransferableCents: remainingNetTransferable,
    paymentMethod,
    approvedAt,
    remarks: updated.remarks,
    checkNumber: updated.checkNumber,
    checkDate: updated.checkDate,
    periodBreakdown,
    channelSummary,
    periodFrom: updated.periodFrom,
    periodTo: updated.periodTo,
    storeDiscountsCents,
    promoSummary,
    storePaybackEnabled,
    gatewayRatePct,
    payoutStatement: buildPayoutStatementFromBreakdown(
      updated.breakdown,
      paymentCents,
      storePaybackEnabled,
    ),
  });
  const invoiceDataJson = JSON.parse(
    JSON.stringify(invoicePayload.invoiceData),
  ) as object;

  try {
    const finalized = await prisma.storeWithdrawal.update({
      where: { id: updated.id },
      data: {
        invoiceRef: invoicePayload.invoiceRef,
        invoiceUrl: invoicePayload.invoiceUrl,
        invoiceData: invoiceDataJson,
      },
    });
    invalidateAnalyticsCache(analyticsCacheKey(['wallet-payout-periods', storeId]));
    invalidateWalletAnalysisCache();
    invalidateDashboardStatsCache();
    return finalized;
  } catch (err) {
    // Payout already succeeded; invoice metadata is best-effort. Don't fail the HTTP request.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      invalidateAnalyticsCache(analyticsCacheKey(['wallet-payout-periods', storeId]));
      invalidateWalletAnalysisCache();
      invalidateDashboardStatsCache();
      return updated;
    }
    throw err;
  }
}

export async function buildWalletReportPayload(
  user: JwtPayload,
  resolvedStoreId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  const dateFilter = orderCreatedAtFilter(from, to);

  const wallets = await prisma.storeWallet.findMany({
    where: resolvedStoreId ? { storeId: resolvedStoreId as string } : undefined,
    include: { store: { select: { id: true, name: true, city: true } } },
  });

  const storeIds = wallets.map((w) => w.storeId);

  const paidOrderWhere = {
    storeId: { in: storeIds },
    paymentStatus: 'PAID' as const,
    ...dateFilter,
  };

  const [revenueGroups, txnOutByStore, txnByStoreAndType, reportOrders, systemOut] = storeIds.length
    ? await Promise.all([
        prisma.order.groupBy({
          by: ['storeId', 'orderMode', 'paymentMethod'],
          where: paidOrderWhere,
          _sum: { total: true },
        }),
        prisma.walletTransaction.groupBy({
          by: ['storeId'],
          _sum: { amount: true },
          where: {
            storeId: { in: storeIds },
            type: { in: ['REFUND', 'PAYOUT'] } as any,
            ...dateFilter,
          },
        }),
        prisma.walletTransaction.groupBy({
          by: ['storeId', 'type'],
          _sum: { amount: true },
          where: { storeId: { in: storeIds }, ...dateFilter },
        }),
        prisma.order.findMany({
          where: paidOrderWhere,
          select: walletReportOrderSelect,
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        prisma.walletTransaction.aggregate({
          _sum: { amount: true },
          where: {
            storeId: { in: storeIds },
            type: { in: ['REFUND', 'PAYOUT'] } as any,
            ...dateFilter,
          },
        }),
      ])
    : [[], [], [], [], { _sum: { amount: null } }];

  const groupsByStore = new Map<
    string,
    { orderMode: string; paymentMethod: string; totalSum: number }[]
  >();
  for (const row of revenueGroups) {
    const list = groupsByStore.get(row.storeId) ?? [];
    list.push({
      orderMode: row.orderMode,
      paymentMethod: row.paymentMethod,
      totalSum: row._sum.total ?? 0,
    });
    groupsByStore.set(row.storeId, list);
  }

  const txnOutMap = new Map(
    txnOutByStore.map((row) => [
      row.storeId,
      Math.abs(decimalFieldToCentsNumber(row._sum.amount)),
    ]),
  );

  const byTypeMap = new Map<string, { type: string; total: number }[]>();
  for (const row of txnByStoreAndType) {
    const entry = {
      type: row.type,
      total: Math.abs(decimalFieldToCentsNumber(row._sum.amount)),
    };
    const list = byTypeMap.get(row.storeId);
    if (list) list.push(entry);
    else byTypeMap.set(row.storeId, [entry]);
  }

  const branchReports = wallets.map((wallet) => {
    const revenue = summarizeOrderRevenueFromGroups(groupsByStore.get(wallet.storeId) ?? []);

    return {
      storeId: wallet.storeId,
      storeName: wallet.store.name,
      storeCity: wallet.store.city,
      currentBalance: walletBalanceCents(wallet),
      ...revenue,
      totalOut: txnOutMap.get(wallet.storeId) ?? 0,
      byType: byTypeMap.get(wallet.storeId) ?? [],
    };
  });

  const systemRevenue = summarizeOrderRevenueFromGroups(
    revenueGroups.map((row) => ({
      orderMode: row.orderMode,
      paymentMethod: row.paymentMethod,
      totalSum: row._sum.total ?? 0,
    })),
  );

  const trendFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const trendTo = to ? new Date(to + 'T23:59:59Z') : new Date();

  let trendRaw: { day: string; total: bigint; type: string }[] = [];
  try {
    if (resolvedStoreId) {
      trendRaw = await prisma.$queryRaw<{ day: string; total: bigint; type: string }[]>`
        SELECT DATE("createdAt") as day, SUM(amount) as total, type
        FROM wallet_transactions
        WHERE "createdAt" BETWEEN ${trendFrom} AND ${trendTo}
          AND "storeId" = ${resolvedStoreId}
        GROUP BY DATE("createdAt"), type
        ORDER BY day ASC
      `;
    } else {
      trendRaw = await prisma.$queryRaw<{ day: string; total: bigint; type: string }[]>`
        SELECT DATE("createdAt") as day, SUM(amount) as total, type
        FROM wallet_transactions
        WHERE "createdAt" BETWEEN ${trendFrom} AND ${trendTo}
        GROUP BY DATE("createdAt"), type
        ORDER BY day ASC
      `;
    }
  } catch {
    trendRaw = [];
  }

  const trend = trendRaw.map((r) => ({
    day: r.day,
    total: Math.abs(typeof r.total === 'bigint' ? Number(r.total) : r.total),
    type: r.type,
  }));

  const periodSummary =
    user.role === 'SYSTEM_ADMIN'
      ? {
          ...systemRevenue,
          totalOut: Math.abs(decimalFieldToCentsNumber(systemOut._sum.amount)),
          netBalance: wallets.reduce((s, w) => s + walletBalanceCents(w), 0),
        }
      : null;

  return {
    branchReports,
    periodSummary,
    systemTotals: periodSummary,
    orders: mapWalletReportOrders(reportOrders),
    trend,
  };
}
