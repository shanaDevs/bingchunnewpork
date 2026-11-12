import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { resolveBranchStoreId } from '../middleware/auth';
import { resolveSettlementReceiptUrl } from '../middleware/upload';
import { deleteFromSpaces } from '../lib/spaces';
import {
  requireSettlementProofUpload,
  withUploadedProofCleanup,
} from '../lib/settlementProofUpload';
import { buildProofAccessResponse } from '../lib/settlementProofAccess';
import { ensureCommissionSettlementTable } from '../lib/settlementSchema';
import {
  listWithdrawalsUnsettledForDartCodes,
  groupAllUnsettledWithdrawalsByStoreId,
  withdrawalHasDartCodesSettlement,
} from '../lib/settlementWithdrawalQuery';
import {
  dartCodesReceivesLkrFromBreakdown,
  resolveStoredPlatformProviderReceivable,
} from '../lib/platformSettlementHelpers';
import { computeBreakdownForPeriod } from '../lib/walletService';
import { centsToDecimal, decimalFieldToCentsNumber, lkrToCents } from '../lib/moneyDecimal';
import type { Prisma, SettlementPaymentMethod } from '@prisma/client';
import {
  SETTLEMENT_PAYMENT_METHODS,
  settlementPaymentMethodLabel,
} from '../lib/settlementPaymentMethod';
import {
  accumulateCommissionBreakdownMultiMonth,
  accumulateSettlementBreakdown,
  buildPeriodBaseLookup,
  buildPeriodSlabInfoList,
  buildSlabInfo,
  serializeCommissionSlabsForApi,
  computeAllTimeCommission,
  emptyCommissionBreakdown,
  getEffectiveRate,
  getPeriodDateRange,
  normalizeStoredSettlementBreakdown,
  periodsInRange,
  sumBreakdownCommission,
  sumBreakdownConvenienceFee,
  sumBreakdownProviderFee,
  sumBreakdownOrderCount,
  sumCommissionableBase,
  computePendingDuesLkr,
  sumOrdersPlatformPaybackLkr,
  type CommissionChannel,
  type ChannelBreakdown,
  type ChannelSettlementRow,
  type SlabInfo,
  type CommissionSlab,
} from '../lib/commission';
import {
  enrichOrdersWithAddonPayments,
  fetchOrderAddonMap,
  orderCreatedAtFilter,
  summarizePlatformSalesLkr,
} from '../lib/walletRevenue';
import { getWalletSummary, getOrCreateWallet } from '../lib/walletService';
import { getCommissionSlabs, getConvenienceFeeRates } from '../lib/appSchema';
import { generateCommissionSettlementInvoice } from '../lib/withdrawalInvoice';
import { todayDateString } from '../lib/datetime';
import { payoutReviewDisplayRange } from '../lib/payoutReviewNames';
import {
  calendarMonthFromPeriodFrom,
  combinePlatformProviderReceivableLkr,
  formatCalendarMonthLabel,
  loadEnrichedApprovedUnsettledWithdrawals,
  sumSharedPromoPlatformLkrFromBreakdowns,
} from '../lib/readyToProcessSupport';
import {
  loadPlatformPayoutReceivableDetail,
  loadSettlementPlatformReceivableDetail,
} from '../lib/settlementPlatformReceivable';
import {
  fetchApprovedBranchPayoutWithdrawals,
  mapApprovedWithdrawalToBranchPayoutRow,
  mapApprovedWithdrawalToPlatformPayoutRow,
  mergeBranchPayoutHistoryRows,
  paginatePayoutHistoryRows,
  PAYMENT_HISTORY_PAYOUT_DEFAULT_LIMIT,
} from '../lib/paymentHistoryBranchPayouts';
import { paginationQuerySchema } from '../lib/httpSchemas';
import { platformProviderSettlementInvoiceApiPath } from '../lib/invoice/refs';
import {
  computeNetCommissionSettlementDebitCents,
  debitStoreWalletForCommissionSettlement,
} from '../lib/settlementWalletDebit';

const PROMOTION_PAYBACK_SELECT = {
  platformPaybackEligible: true,
  platformPaybackAmount: true,
  platformPaybackSettledAt: true,
  platformPaybackReversedAt: true,
} as const;

const querySchema = paginationQuerySchema.extend({
  storeId: z.string().min(1).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const previewQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  storeId: z.string().min(1).optional(),
});

const submitBodySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(SETTLEMENT_PAYMENT_METHODS),
  storeId: z.string().min(1).optional(),
  withdrawalId: z.string().uuid().optional(),
});

const bulkSettleBodySchema = z.object({
  paymentMethod: z.enum(SETTLEMENT_PAYMENT_METHODS),
  items: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'items must be valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(
          z.object({
            storeId: z.string().min(1),
            withdrawalId: z.string().uuid(),
          }),
        )
        .min(1),
    ),
});

const readyToProcessMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM');

const PAID_ORDER_SELECT = {
  id: true,
  subtotal: true,
  discount: true,
  loyaltyDiscount: true,
  convenientFee: true,
  deliveryFee: true,
  total: true,
  orderMode: true,
  paymentMethod: true,
  createdAt: true,
  promotionUsages: { select: PROMOTION_PAYBACK_SELECT },
} as const;

const COMMISSION_ORDER_SELECT = {
  storeId: true,
  subtotal: true,
  discount: true,
  loyaltyDiscount: true,
  orderMode: true,
  paymentMethod: true,
  createdAt: true,
} as const;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultCurrentMonthPeriod() {
  const to = todayDateString();
  const from = `${to.slice(0, 7)}-01`;
  return { from, to };
}

function parsePeriodQuery(from?: string, to?: string) {
  if (!from && !to) return defaultCurrentMonthPeriod();
  if (!from || !to) throw new AppError('Both from and to dates are required', 400);
  if (from > to) throw new AppError('Start date must be on or before end date', 400);
  const today = todayDateString();
  if (to > today) throw new AppError('End date cannot be in the future', 400);
  return { from, to };
}

function periodQueryToUtcBounds(from: string, to: string) {
  return {
    fromDate: new Date(`${from}T00:00:00.000Z`),
    toDate: new Date(`${to}T23:59:59.999Z`),
  };
}

const SETTLEMENT_PAYOUT_SELECT = {
  id: true,
  storeId: true,
  statementRef: true,
  createdAt: true,
  totalCommission: true,
  platformPaybackAmount: true,
  paymentMethod: true,
  receiptUrl: true,
  invoiceRef: true,
  invoiceUrl: true,
  status: true,
  periodFrom: true,
  periodTo: true,
  storeWithdrawalId: true,
  store: { select: { name: true } },
  storeWithdrawal: { select: { breakdown: true } },
} as const;

const SETTLEMENT_PLATFORM_PAYOUT_SELECT = {
  ...SETTLEMENT_PAYOUT_SELECT,
  storeWithdrawal: { select: { breakdown: true } },
} as const;

function isCurrentMonthPeriod(from: string, to: string) {
  const current = defaultCurrentMonthPeriod();
  return from === current.from && to === current.to;
}

function sumBreakdownRevenue(
  breakdown: Record<CommissionChannel, ChannelBreakdown | ChannelSettlementRow>,
): number {
  return Object.values(breakdown).reduce((sum, row) => sum + row.revenueSubtotal, 0);
}

function slabInfoForPeriod(
  storeIds: string[],
  from: string,
  to: string,
  periodBaseLookup: Record<string, number>,
  periodSubtotal: number,
  slabs: readonly CommissionSlab[],
): { monthlyBase: number; effectiveRate: number; slabIndex: number; slabs: ReturnType<typeof serializeCommissionSlabsForApi> } {
  const periodKeys = periodsInRange(from, to);
  const serializedSlabs = serializeCommissionSlabsForApi(slabs);
  if (periodKeys.length === 1) {
    let periodBase = 0;
    for (const storeId of storeIds) {
      periodBase += periodBaseLookup[`${storeId}|${periodKeys[0]!}`] ?? 0;
    }
    const info = buildSlabInfo(periodBase, slabs);
    return {
      monthlyBase: info.monthlyBase,
      effectiveRate: info.effectiveRate,
      slabIndex: info.slabIndex,
      slabs: serializedSlabs,
    };
  }
  const info = buildSlabInfo(periodSubtotal, slabs);
  return {
    monthlyBase: info.monthlyBase,
    effectiveRate: info.effectiveRate,
    slabIndex: info.slabIndex,
    slabs: serializedSlabs,
  };
}

function parseSettlementRange(from: string, to: string) {
  if (from > to) throw new AppError('Start date must be on or before end date', 400);
  const today = toDateStr(new Date());
  if (from > today || to > today) throw new AppError('Settlement period cannot be in the future', 400);
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  return { fromDate, toDate };
}

async function resolveSingleStoreId(req: Request, explicitStoreId?: string): Promise<string> {
  const branchStoreId = await resolveBranchStoreId(req);
  if (branchStoreId) return branchStoreId;

  const storeId =
    explicitStoreId ??
    (typeof req.query.storeId === 'string' ? req.query.storeId : undefined) ??
    (typeof req.body?.storeId === 'string' ? req.body.storeId : undefined);

  if (!storeId) {
    throw new AppError('Select a branch (storeId) to process payment', 400);
  }

  const store = await prisma.store.findFirst({
    where: { id: storeId, isActive: true },
    select: { id: true },
  });
  if (!store) throw new AppError('Store not found', 404);
  return store.id;
}

const NO_PAYOUT_REQUEST_MESSAGE =
  'No branch payout request found. A payout request (PENDING or APPROVED) must exist before submitting a commission settlement.';

type LinkedWithdrawalForSettlement = {
  id: string;
  periodFrom: string;
  periodTo: string;
};

async function resolveLinkedWithdrawalRecord(
  storeId: string,
  withdrawalId: string,
  options?: { requireApproved?: boolean },
): Promise<LinkedWithdrawalForSettlement> {
  const withdrawal = await prisma.storeWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      storeId: true,
      status: true,
      periodFrom: true,
      periodTo: true,
      cycleStage: true,
    },
  });

  if (!withdrawal) throw new AppError('Withdrawal request not found', 404);
  if (withdrawal.storeId !== storeId) {
    throw new AppError('Withdrawal request does not belong to this branch', 400);
  }
  const allowedStatuses: string[] = options?.requireApproved
    ? ['APPROVED']
    : ['PENDING', 'APPROVED'];
  if (!allowedStatuses.includes(withdrawal.status)) {
    throw new AppError('Withdrawal request cannot be linked to settlement', 400);
  }
  if (await withdrawalHasDartCodesSettlement(withdrawalId)) {
    throw new AppError('This withdrawal request is already linked to a settlement', 400);
  }
  if (!withdrawal.periodFrom || !withdrawal.periodTo) {
    throw new AppError('Withdrawal payout period is not set', 400);
  }

  if (withdrawal.cycleStage === 'FIRST') {
    const pairedSecond = await prisma.storeWithdrawal.findFirst({
      where: {
        cycleStage: 'SECOND',
        cyclePairId: withdrawal.id,
        status: 'APPROVED',
      },
      select: { id: true },
    });
    if (!pairedSecond) {
      throw new AppError(
        'Platform provider payment becomes available only after the second 15-day payout in this cycle is completed.',
        400,
      );
    }
  }

  return {
    id: withdrawal.id,
    periodFrom: toDateStr(withdrawal.periodFrom),
    periodTo: toDateStr(withdrawal.periodTo),
  };
}

async function resolveLinkedWithdrawal(storeId: string, withdrawalId?: string): Promise<string> {
  if (withdrawalId) {
    const linked = await resolveLinkedWithdrawalRecord(storeId, withdrawalId);
    return linked.id;
  }

  const eligible = await listWithdrawalsUnsettledForDartCodes(storeId);
  if (eligible.length === 0) {
    throw new AppError(NO_PAYOUT_REQUEST_MESSAGE, 400);
  }

  return eligible[0]!.id;
}

async function resolveStoreIds(req: Request): Promise<string[]> {
  const branchStoreId = await resolveBranchStoreId(req);
  if (branchStoreId) return [branchStoreId];

  const { storeId } = querySchema.parse(req.query);
  if (storeId) {
    const store = await prisma.store.findFirst({
      where: { id: storeId, isActive: true },
      select: { id: true },
    });
    if (!store) throw new AppError('Store not found', 404);
    return [store.id];
  }

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  return stores.map((s) => s.id);
}

function rangesOverlap(
  aFrom: Date,
  aTo: Date,
  bFrom: Date,
  bTo: Date,
): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

async function hasOverlappingSettlement(
  storeId: string,
  fromDate: Date,
  toDate: Date,
): Promise<boolean> {
  const existing = await prisma.commissionSettlement.findMany({
    where: {
      storeId,
      status: { in: ['PENDING_VERIFICATION', 'VERIFIED'] },
    },
    select: { periodFrom: true, periodTo: true },
  });

  return existing.some((row) => rangesOverlap(fromDate, toDate, row.periodFrom, row.periodTo));
}

async function assertNoOverlappingSettlement(
  storeId: string,
  fromDate: Date,
  toDate: Date,
): Promise<void> {
  const existing = await prisma.commissionSettlement.findMany({
    where: {
      storeId,
      status: { in: ['PENDING_VERIFICATION', 'VERIFIED'] },
    },
    select: { periodFrom: true, periodTo: true, statementRef: true },
  });

  for (const row of existing) {
    if (rangesOverlap(fromDate, toDate, row.periodFrom, row.periodTo)) {
      throw new AppError(
        `Date range overlaps an existing settlement (${row.statementRef})`,
        400,
      );
    }
  }
}

async function computeAllTimePlatformPaybackLkr(storeId: string): Promise<number> {
  const agg = await prisma.promotionUsage.aggregate({
    _sum: { platformPaybackAmount: true },
    where: {
      storeId,
      platformPaybackEligible: true,
      platformPaybackReversedAt: null,
      order: { paymentStatus: 'PAID', status: { not: 'CANCELLED' } },
    },
  });
  return decimalFieldToCentsNumber(agg._sum.platformPaybackAmount);
}

async function fetchSettlementNetRows(storeId: string) {
  return prisma.commissionSettlement.findMany({
    where: { storeId, status: { not: 'REJECTED' } },
    select: { totalCommission: true, platformPaybackAmount: true },
  });
}

async function computeStorePendingDues(storeId: string): Promise<number> {
  const [paidOrders, commissionSlabs] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, paymentStatus: 'PAID', status: { not: 'CANCELLED' } },
      select: COMMISSION_ORDER_SELECT,
    }),
    getCommissionSlabs(),
  ]);
  const periodBaseLookup = buildPeriodBaseLookup(
    paidOrders.map((order) => ({ ...order, storeId })),
  );
  const allTimeCommission = computeAllTimeCommission(paidOrders, periodBaseLookup, commissionSlabs);
  const allTimePayback = await computeAllTimePlatformPaybackLkr(storeId);
  const settlements = await fetchSettlementNetRows(storeId);
  return computePendingDuesLkr({
    allTimeCommission,
    allTimePayback,
    settlements: settlements.map((s) => ({
      totalCommission: decimalFieldToCentsNumber(s.totalCommission),
      platformPaybackAmount: decimalFieldToCentsNumber(s.platformPaybackAmount),
    })),
  });
}

/** Same math as computeStorePendingDues, batched to cut N round-trips. */
async function computeStorePendingDuesBatch(
  storeIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (storeIds.length === 0) return result;

  const [paidOrders, settlements, paybackRows, commissionSlabs] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId: { in: storeIds },
        paymentStatus: 'PAID',
        status: { not: 'CANCELLED' },
      },
      select: COMMISSION_ORDER_SELECT,
    }),
    prisma.commissionSettlement.findMany({
      where: { storeId: { in: storeIds }, status: { not: 'REJECTED' } },
      select: { storeId: true, totalCommission: true, platformPaybackAmount: true },
    }),
    prisma.promotionUsage.groupBy({
      by: ['storeId'],
      _sum: { platformPaybackAmount: true },
      where: {
        storeId: { in: storeIds },
        platformPaybackEligible: true,
        platformPaybackReversedAt: null,
        order: { paymentStatus: 'PAID', status: { not: 'CANCELLED' } },
      },
    }),
    getCommissionSlabs(),
  ]);

  const ordersByStore = new Map<string, typeof paidOrders>();
  for (const order of paidOrders) {
    const list = ordersByStore.get(order.storeId) ?? [];
    list.push(order);
    ordersByStore.set(order.storeId, list);
  }

  const settlementsByStore = new Map<
    string,
    Array<{ totalCommission: Prisma.Decimal; platformPaybackAmount: Prisma.Decimal | null }>
  >();
  for (const row of settlements) {
    const list = settlementsByStore.get(row.storeId) ?? [];
    list.push(row);
    settlementsByStore.set(row.storeId, list);
  }

  const paybackByStore = new Map(
    paybackRows.map((row) => [
      row.storeId,
      decimalFieldToCentsNumber(row._sum.platformPaybackAmount),
    ]),
  );

  for (const storeId of storeIds) {
    const storeOrders = ordersByStore.get(storeId) ?? [];
    const periodBaseLookup = buildPeriodBaseLookup(
      storeOrders.map((order) => ({ ...order, storeId })),
    );
    const allTimeCommission = computeAllTimeCommission(
      storeOrders,
      periodBaseLookup,
      commissionSlabs,
    );
    const allTimePayback = paybackByStore.get(storeId) ?? 0;
    const storeSettlements = settlementsByStore.get(storeId) ?? [];
    result.set(
      storeId,
      computePendingDuesLkr({
        allTimeCommission,
        allTimePayback,
        settlements: storeSettlements.map((s) => ({
          totalCommission: decimalFieldToCentsNumber(s.totalCommission),
          platformPaybackAmount: decimalFieldToCentsNumber(s.platformPaybackAmount),
        })),
      }),
    );
  }

  return result;
}

/** @deprecated use computeStorePendingDues */
async function getStorePendingDues(storeId: string): Promise<number> {
  return computeStorePendingDues(storeId);
}

async function createSettlementForStore(params: {
  storeId: string;
  from: string;
  to: string;
  paymentMethod: SettlementPaymentMethod;
  storeWithdrawalId: string;
  receiptUrl: string | null;
  submittedById?: string;
}) {
  const { fromDate, toDate } = parseSettlementRange(params.from, params.to);
  await assertNoOverlappingSettlement(params.storeId, fromDate, toDate);

  const orders = await fetchPaidOrdersInRange(params.storeId, params.from, params.to);
  if (orders.length === 0) {
    throw new AppError('No paid orders in the selected date range', 400);
  }

  const periodBaseLookup = await fetchPeriodBaseLookupForSettlement(
    params.storeId,
    params.from,
    params.to,
  );
  const [convenienceFeeRates, commissionSlabs] = await Promise.all([
    getConvenienceFeeRates(),
    getCommissionSlabs(),
  ]);
  const windowBase = periodBaseLookup[`${params.storeId}|window`] ?? sumCommissionableBase(orders);
  const breakdown = accumulateSettlementBreakdown(
    orders,
    windowBase,
    convenienceFeeRates,
    undefined,
    commissionSlabs,
  );
  const totalCommission = sumBreakdownCommission(breakdown);
  const totalProviderFee = sumBreakdownProviderFee(breakdown);
  const periodPlatformPayback = sumOrdersPlatformPaybackLkr(orders);
  const platformPaybackAmountCents = lkrToCents(periodPlatformPayback);

  const statementRef = await generateStatementRef();
  const now = new Date();
  const netCommissionCents = computeNetCommissionSettlementDebitCents(
    totalCommission,
    platformPaybackAmountCents,
  );

  await getOrCreateWallet(params.storeId);

  const settlement = await prisma.$transaction(async (tx) => {
    await debitStoreWalletForCommissionSettlement(tx, {
      storeId: params.storeId,
      netCommissionCents,
      statementRef,
      submittedById: params.submittedById,
      periodFrom: fromDate,
      periodTo: toDate,
    });

    return tx.commissionSettlement.create({
      data: {
        statementRef,
        storeId: params.storeId,
        periodFrom: fromDate,
        periodTo: toDate,
        status: 'VERIFIED',
        paymentMethod: params.paymentMethod,
        receiptUrl: params.receiptUrl,
        breakdown,
        totalCommission: centsToDecimal(lkrToCents(totalCommission)),
        totalProviderFee: centsToDecimal(lkrToCents(totalProviderFee)),
        platformPaybackAmount: centsToDecimal(platformPaybackAmountCents),
        storeWithdrawalId: params.storeWithdrawalId,
        submittedById: params.submittedById,
        verifiedById: params.submittedById,
        verifiedAt: now,
      },
      include: { store: { select: { name: true } } },
    });
  });

  const invoice = await generateCommissionSettlementInvoice({
    settlementId: settlement.id,
    statementRef: settlement.statementRef,
    storeId: params.storeId,
    storeName: settlement.store.name,
    periodFrom: fromDate,
    periodTo: toDate,
    breakdown,
    totalCommission,
    platformPaybackAmount: periodPlatformPayback,
    paymentMethod: params.paymentMethod,
    settledAt: settlement.createdAt,
  });

  const updated = await prisma.commissionSettlement.update({
    where: { id: settlement.id },
    data: {
      invoiceRef: invoice.invoiceRef,
      invoiceUrl: invoice.invoiceUrl,
      invoiceData: invoice.invoiceData as object,
    },
    include: { store: { select: { name: true } } },
  });

  return updated;
}

async function generateStatementRef(): Promise<string> {
  const datePart = toDateStr(new Date()).replace(/-/g, '');
  for (let i = 0; i < 10; i++) {
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    const ref = `BC-STL-${datePart}-${suffix}`;
    const exists = await prisma.commissionSettlement.findUnique({
      where: { statementRef: ref },
      select: { id: true },
    });
    if (!exists) return ref;
  }
  throw new AppError('Could not generate statement reference', 500);
}

function formatSettlementPreview(
  from: string,
  to: string,
  breakdown: Record<CommissionChannel, ChannelSettlementRow>,
  windowBase: number,
  slabs: readonly CommissionSlab[],
  orders?: Array<{
    id?: string;
    total: number;
    orderMode: string;
    paymentMethod: string;
    subtotal?: number;
    discount?: number;
    loyaltyDiscount?: number;
    deliveryFee?: number;
    convenientFee?: number;
    addonAmountLkr?: number;
    addonPaymentMethod?: string;
  }>,
) {
  const totalCommission = sumBreakdownCommission(breakdown);
  const totalProviderFee = sumBreakdownProviderFee(breakdown);
  const slabInfo = buildSlabInfo(windowBase, slabs);
  const serializedSlabs = serializeCommissionSlabsForApi(slabs);

  return {
    period: { from, to },
    breakdown,
    totalCommission,
    totalProviderFee,
    totalOwed: totalCommission,
    orderCount: sumBreakdownOrderCount(breakdown),
    platformSales: orders ? summarizePlatformSalesLkr(orders) : undefined,
    slabInfo: {
      monthlyBase: slabInfo.monthlyBase,
      effectiveRate: slabInfo.effectiveRate,
      slabIndex: slabInfo.slabIndex,
      slabs: serializedSlabs,
    },
    monthlySlabInfo: [
      {
        month: `${from} – ${to}`,
        monthlyBase: slabInfo.monthlyBase,
        effectiveRate: slabInfo.effectiveRate,
        slabIndex: slabInfo.slabIndex,
        slabs: serializedSlabs,
      },
    ],
  };
}

async function fetchPaidOrdersInRange(storeId: string, from: string, to: string) {
  parseSettlementRange(from, to);
  return prisma.order.findMany({
    where: {
      storeId,
      paymentStatus: 'PAID',
      status: { not: 'CANCELLED' },
      ...orderCreatedAtFilter(from, to),
    },
    select: PAID_ORDER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

async function fetchPeriodBaseLookupForSettlement(
  storeId: string,
  from: string,
  to: string,
): Promise<Record<string, number>> {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      paymentStatus: 'PAID',
      status: { not: 'CANCELLED' },
      ...orderCreatedAtFilter(from, to),
    },
    select: COMMISSION_ORDER_SELECT,
  });
  const windowBase = sumCommissionableBase(orders);
  return { [`${storeId}|window`]: windowBase };
}

function serializeSettlementReceiptFields(
  receiptUrl: string | null | undefined,
  storeId: string,
): { hasReceipt: boolean; receiptUrl: string | null } {
  const resolved = resolveSettlementReceiptUrl(receiptUrl, storeId);
  if (!resolved?.trim()) {
    return { hasReceipt: false, receiptUrl: null };
  }
  if (/^https?:\/\//i.test(resolved)) {
    return { hasReceipt: true, receiptUrl: null };
  }
  return { hasReceipt: true, receiptUrl: resolved };
}

type SettlementPayoutRow = {
  id: string;
  storeId: string;
  statementRef: string;
  createdAt: Date;
  totalCommission: Prisma.Decimal;
  platformPaybackAmount?: Prisma.Decimal | null;
  paymentMethod: string;
  receiptUrl: string | null;
  invoiceRef?: string | null;
  invoiceUrl?: string | null;
  status: string;
  periodFrom: Date;
  periodTo: Date;
  storeWithdrawalId?: string | null;
  store: { name: string };
  storeWithdrawal?: { breakdown: unknown } | null;
};

function displayedSettlementPeriod(settlement: SettlementPayoutRow): { from: string; to: string } {
  const from = toDateStr(settlement.periodFrom);
  const to = toDateStr(settlement.periodTo);
  const breakdown = settlement.storeWithdrawal?.breakdown;
  const cycle =
    breakdown && typeof breakdown === 'object'
      ? (breakdown as { cycleStage?: string | null; cycleFrom?: string | null })
      : null;
  return payoutReviewDisplayRange({
    from,
    to,
    cycleStage: cycle?.cycleStage,
    cycleFrom: cycle?.cycleFrom,
  });
}

function mapSettlementToPayout(
  settlement: SettlementPayoutRow,
  advanceByWithdrawalId?: Map<string, boolean>,
) {
  const methodLabel = settlementPaymentMethodLabel(settlement.paymentMethod);
  const storeWithdrawalId = settlement.storeWithdrawalId ?? undefined;
  const isAdvance = storeWithdrawalId
    ? (advanceByWithdrawalId?.get(storeWithdrawalId) ?? false)
    : false;
  const paybackLkr = decimalFieldToCentsNumber(settlement.platformPaybackAmount) / 100;
  const grossCommissionLkr = decimalFieldToCentsNumber(settlement.totalCommission) / 100;
  const netAmountLkr = grossCommissionLkr - paybackLkr;
  const receipt = serializeSettlementReceiptFields(settlement.receiptUrl, settlement.storeId);
  const period = displayedSettlementPeriod(settlement);

  return {
    id: settlement.id,
    payoutSource: 'commissionSettlement' as const,
    statementRef: settlement.statementRef,
    paidAt: settlement.createdAt.toISOString(),
    amount: netAmountLkr,
    grossCommission: grossCommissionLkr,
    platformPaybackAmount: paybackLkr,
    netPlatformEarning: netAmountLkr,
    platformOwesBranch: netAmountLkr < 0,
    paymentMethod: methodLabel,
    hasReceipt: receipt.hasReceipt,
    receiptUrl: receipt.receiptUrl,
    invoiceRef: settlement.invoiceRef ?? undefined,
    invoiceUrl: settlement.invoiceUrl ?? undefined,
    status: settlement.status,
    periodFrom: period.from,
    periodTo: period.to,
    storeWithdrawalId,
    isAdvance,
    storeName: settlement.store.name,
  };
}

async function mapSettlementToPlatformPayout(
  settlement: SettlementPayoutRow & {
    storeWithdrawal?: { breakdown: unknown } | null;
  },
  advanceByWithdrawalId?: Map<string, boolean>,
) {
  if (!settlement.storeWithdrawalId || !settlement.storeWithdrawal) {
    return null;
  }
  const receivable = await resolveStoredPlatformProviderReceivable(
    settlement.storeWithdrawal.breakdown,
  );
  const platformReceivable = dartCodesReceivesLkrFromBreakdown(receivable);
  const base = mapSettlementToPayout(settlement, advanceByWithdrawalId);
  return {
    ...base,
    amount: platformReceivable,
    platformReceivable,
    platformInvoiceUrl: platformProviderSettlementInvoiceApiPath(settlement.id),
    platformReceivableSettlementId: settlement.id,
  };
}

function mapSettlementStatement(
  settlement: {
    id: string;
    statementRef: string;
    storeId: string;
    periodFrom: Date;
    periodTo: Date;
    status: string;
    paymentMethod: string;
    receiptUrl: string | null;
    invoiceRef?: string | null;
    invoiceUrl?: string | null;
    breakdown: unknown;
    totalCommission: Prisma.Decimal;
    totalProviderFee: Prisma.Decimal;
    platformPaybackAmount?: Prisma.Decimal | null;
    storeWithdrawalId?: string | null;
    createdAt: Date;
    store: { name: string };
  },
) {
  const methodLabel = settlementPaymentMethodLabel(settlement.paymentMethod);
  const receipt = serializeSettlementReceiptFields(settlement.receiptUrl, settlement.storeId);
  return {
    id: settlement.id,
    statementRef: settlement.statementRef,
    storeId: settlement.storeId,
    storeName: settlement.store.name,
    storeWithdrawalId: settlement.storeWithdrawalId ?? undefined,
    period: {
      from: toDateStr(settlement.periodFrom),
      to: toDateStr(settlement.periodTo),
    },
    status: settlement.status,
    paymentMethod: methodLabel,
    hasReceipt: receipt.hasReceipt,
    receiptUrl: receipt.receiptUrl,
    invoiceRef: settlement.invoiceRef ?? undefined,
    invoiceUrl: settlement.invoiceUrl ?? undefined,
    breakdown: normalizeStoredSettlementBreakdown(settlement.breakdown),
    totalCommission: decimalFieldToCentsNumber(settlement.totalCommission) / 100,
    totalProviderFee: decimalFieldToCentsNumber(settlement.totalProviderFee) / 100,
    platformPaybackAmount:
      decimalFieldToCentsNumber(settlement.platformPaybackAmount ?? 0) / 100,
    totalOwed: decimalFieldToCentsNumber(settlement.totalCommission) / 100,
    submittedAt: settlement.createdAt.toISOString(),
  };
}

export async function getPaymentHistory(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCommissionSettlementTable();

    const {
      from: queryFrom,
      to: queryTo,
      page: payoutHistoryPage,
      limit: payoutHistoryLimit,
    } = querySchema.parse(req.query);
    const { from, to } = parsePeriodQuery(queryFrom, queryTo);
    const viewingCurrentMonth = isCurrentMonthPeriod(from, to);

    const storeIds = await resolveStoreIds(req);
    const commissionSlabs = await getCommissionSlabs();
    const serializedSlabs = serializeCommissionSlabsForApi(commissionSlabs);
    if (storeIds.length === 0) {
      return res.json({
        success: true,
        data: {
          pendingDues: 0,
          totalSettled: 0,
          thisMonthCommission: 0,
          currentMonthBase: 0,
          currentMonthRate: getEffectiveRate(0, commissionSlabs),
          breakdown: emptyCommissionBreakdown(),
          monthlyBreakdown: emptyCommissionBreakdown(),
          slabInfo: {
            monthlyBase: 0,
            effectiveRate: getEffectiveRate(0, commissionSlabs),
            slabIndex: 0,
            slabs: serializedSlabs,
          },
          period: { from, to, isCurrentMonth: viewingCurrentMonth },
          payouts: [],
          platformPayouts: [],
          payoutsPagination: {
            page: payoutHistoryPage,
            limit: payoutHistoryLimit,
            total: 0,
            pages: 1,
          },
          platformPayoutsPagination: {
            page: payoutHistoryPage,
            limit: payoutHistoryLimit,
            total: 0,
            pages: 1,
          },
        },
      });
    }

    const { fromDate, toDate } = periodQueryToUtcBounds(from, to);
    const includePlatformPayoutHistory = req.user?.role === 'SYSTEM_ADMIN';

    const [paidOrders, periodSettlements, allTimeSettlementRows, approvedWithdrawals] =
      await Promise.all([
      prisma.order.findMany({
        where: { storeId: { in: storeIds }, paymentStatus: 'PAID' },
        select: COMMISSION_ORDER_SELECT,
      }),
      prisma.commissionSettlement.findMany({
        where: {
          storeId: { in: storeIds },
          periodFrom: { lte: toDate },
          periodTo: { gte: fromDate },
        },
        orderBy: { createdAt: 'desc' },
        select: includePlatformPayoutHistory
          ? SETTLEMENT_PLATFORM_PAYOUT_SELECT
          : SETTLEMENT_PAYOUT_SELECT,
      }),
      prisma.commissionSettlement.findMany({
        where: { storeId: { in: storeIds }, status: { not: 'REJECTED' } },
        select: { totalCommission: true, platformPaybackAmount: true },
      }),
      fetchApprovedBranchPayoutWithdrawals(storeIds, fromDate, toDate),
    ]);

    const settlements = periodSettlements;

    const linkedWithdrawalIds = settlements
      .map((s) => s.storeWithdrawalId)
      .filter((id): id is string => !!id);

    const linkedWithdrawals =
      linkedWithdrawalIds.length > 0
        ? await prisma.storeWithdrawal.findMany({
            where: { id: { in: linkedWithdrawalIds } },
            select: { id: true, isAdvance: true },
          })
        : [];

    const advanceByWithdrawalId = new Map(
      linkedWithdrawals.map((w) => [w.id, w.isAdvance]),
    );

    const periodBaseLookup = buildPeriodBaseLookup(paidOrders);
    const breakdown = accumulateCommissionBreakdownMultiMonth(
      paidOrders,
      periodBaseLookup,
      commissionSlabs,
    );
    const allTimeCommission = computeAllTimeCommission(
      paidOrders,
      periodBaseLookup,
      commissionSlabs,
    );

    const periodOrders = paidOrders.filter((o) => {
      const d = toDateStr(new Date(o.createdAt));
      return d >= from && d <= to;
    });

    const periodBreakdown = accumulateCommissionBreakdownMultiMonth(
      periodOrders,
      periodBaseLookup,
      commissionSlabs,
    );
    const periodCommission = sumBreakdownCommission(periodBreakdown);
    const periodSubtotal = sumBreakdownRevenue(periodBreakdown);
    const slabInfo = slabInfoForPeriod(
      storeIds,
      from,
      to,
      periodBaseLookup,
      periodSubtotal,
      commissionSlabs,
    );

    const totalSettled =
      allTimeSettlementRows.reduce(
        (sum, s) => sum + decimalFieldToCentsNumber(s.totalCommission),
        0,
      ) / 100;
    const allTimePayback = await Promise.all(
      storeIds.map((id) => computeAllTimePlatformPaybackLkr(id)),
    ).then((rows) => rows.reduce((sum, v) => sum + v, 0));

    const pendingDues =
      storeIds.length === 1
        ? await computeStorePendingDues(storeIds[0]!)
        : computePendingDuesLkr({
            allTimeCommission,
            allTimePayback,
            settlements: allTimeSettlementRows.map((s) => ({
              totalCommission: decimalFieldToCentsNumber(s.totalCommission),
              platformPaybackAmount: decimalFieldToCentsNumber(s.platformPaybackAmount),
            })),
          });

    const settlementPayouts = settlements.map((s) => mapSettlementToPayout(s, advanceByWithdrawalId));
    const linkedSettlementWithdrawalIds = new Set(
      settlements
        .map((s) => s.storeWithdrawalId)
        .filter((id): id is string => !!id),
    );
    const withdrawalBranchPayouts = approvedWithdrawals.map(mapApprovedWithdrawalToBranchPayoutRow);
    const mergedBranchPayouts = mergeBranchPayoutHistoryRows(
      settlementPayouts,
      withdrawalBranchPayouts,
      linkedSettlementWithdrawalIds,
    );

    const mergedPlatformPayouts = includePlatformPayoutHistory
      ? mergeBranchPayoutHistoryRows(
          (
            await Promise.all(
              settlements.map((s) => mapSettlementToPlatformPayout(s, advanceByWithdrawalId)),
            )
          ).filter((row): row is NonNullable<typeof row> => row != null),
          (
            await Promise.all(
              approvedWithdrawals.map((w) => mapApprovedWithdrawalToPlatformPayoutRow(w)),
            )
          ).filter((row): row is NonNullable<typeof row> => row != null),
          linkedSettlementWithdrawalIds,
        )
      : [];

    const historyLimit = payoutHistoryLimit || PAYMENT_HISTORY_PAYOUT_DEFAULT_LIMIT;
    const { items: payouts, pagination: payoutsPagination } = paginatePayoutHistoryRows(
      mergedBranchPayouts,
      payoutHistoryPage,
      historyLimit,
    );
    const { items: platformPayouts, pagination: platformPayoutsPagination } =
      paginatePayoutHistoryRows(mergedPlatformPayouts, payoutHistoryPage, historyLimit);

    res.json({
      success: true,
      data: {
        pendingDues,
        totalSettled,
        thisMonthCommission: periodCommission,
        currentMonthBase: periodSubtotal,
        currentMonthRate: slabInfo.effectiveRate,
        breakdown,
        monthlyBreakdown: periodBreakdown,
        slabInfo,
        period: { from, to, isCurrentMonth: viewingCurrentMonth },
        payouts,
        platformPayouts,
        payoutsPagination,
        platformPayoutsPagination,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getSettlementPreview(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCommissionSettlementTable();

    const { from, to, storeId: queryStoreId } = previewQuerySchema.parse(req.query);
    const storeId = await resolveSingleStoreId(req, queryStoreId);

    const orders = await fetchPaidOrdersInRange(storeId, from, to);
    const periodBaseLookup = await fetchPeriodBaseLookupForSettlement(storeId, from, to);
    const [convenienceFeeRates, commissionSlabs] = await Promise.all([
      getConvenienceFeeRates(),
      getCommissionSlabs(),
    ]);
    const windowBase = periodBaseLookup[`${storeId}|window`] ?? sumCommissionableBase(orders);
    const breakdown = accumulateSettlementBreakdown(
      orders,
      windowBase,
      convenienceFeeRates,
      undefined,
      commissionSlabs,
    );
    const addonMap = await fetchOrderAddonMap(orders.map((order) => order.id));
    const enrichedOrders = enrichOrdersWithAddonPayments(orders, addonMap);

    res.json({
      success: true,
      data: formatSettlementPreview(from, to, breakdown, windowBase, commissionSlabs, enrichedOrders),
    });
  } catch (err) {
    next(err);
  }
}

export async function submitSettlement(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCommissionSettlementTable();

    const data = submitBodySchema.parse(req.body);
    const storeId = await resolveSingleStoreId(req);
    const storeWithdrawalId = await resolveLinkedWithdrawal(storeId, data.withdrawalId);

    const previewOrders = await fetchPaidOrdersInRange(storeId, data.from, data.to);
    if (previewOrders.length === 0) {
      throw new AppError('No paid orders in the selected date range', 400);
    }

    const receiptUrl = await requireSettlementProofUpload(
      req.file,
      storeId,
      'Payment receipt proof is required',
    );

    const settlement = await withUploadedProofCleanup(receiptUrl, () =>
      createSettlementForStore({
        storeId,
        from: data.from,
        to: data.to,
        paymentMethod: data.paymentMethod,
        storeWithdrawalId,
        receiptUrl,
        submittedById: req.user?.sub,
      }),
    );

    const orders = await fetchPaidOrdersInRange(storeId, data.from, data.to);
    const periodBaseLookup = await fetchPeriodBaseLookupForSettlement(storeId, data.from, data.to);
    const [convenienceFeeRates, commissionSlabs] = await Promise.all([
      getConvenienceFeeRates(),
      getCommissionSlabs(),
    ]);
    const windowBase = periodBaseLookup[`${storeId}|window`] ?? sumCommissionableBase(orders);
    const breakdown = accumulateSettlementBreakdown(
      orders,
      windowBase,
      convenienceFeeRates,
      undefined,
      commissionSlabs,
    );
    const addonMap = await fetchOrderAddonMap(orders.map((order) => order.id));
    const enrichedOrders = enrichOrdersWithAddonPayments(orders, addonMap);

    res.status(201).json({
      success: true,
      data: {
        ...mapSettlementStatement(settlement),
        ...formatSettlementPreview(
          data.from,
          data.to,
          breakdown,
          windowBase,
          commissionSlabs,
          enrichedOrders,
        ),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listPendingAllHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCommissionSettlementTable();

    const user = req.user;
    if (user?.role !== 'SYSTEM_ADMIN') {
      throw new AppError('Forbidden', 403);
    }

    const { from, to } = previewQuerySchema.parse(req.query);
    parseSettlementRange(from, to);

    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);
    const storeIds = stores.map((store) => store.id);

    const walletSummariesPromise = Promise.all(
      storeIds.map((storeId) => getWalletSummary(storeId)),
    );

    const [unsettledByStore, overlappingSettlements, periodOrders, convenienceFeeRates, commissionSlabs] =
      await Promise.all([
        groupAllUnsettledWithdrawalsByStoreId(),
        prisma.commissionSettlement.findMany({
          where: {
            status: { in: ['PENDING_VERIFICATION', 'VERIFIED'] },
            periodFrom: { lte: toDate },
            periodTo: { gte: fromDate },
          },
          select: { storeId: true },
        }),
        storeIds.length > 0
          ? prisma.order.findMany({
              where: {
                storeId: { in: storeIds },
                paymentStatus: 'PAID',
                status: { not: 'CANCELLED' },
                ...orderCreatedAtFilter(from, to),
              },
              select: { ...PAID_ORDER_SELECT, storeId: true },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),
        getConvenienceFeeRates(),
        getCommissionSlabs(),
      ]);

    const overlappingStoreIds = new Set(overlappingSettlements.map((row) => row.storeId));

    const ordersByStore = new Map<string, typeof periodOrders>();
    for (const order of periodOrders) {
      const list = ordersByStore.get(order.storeId) ?? [];
      list.push(order);
      ordersByStore.set(order.storeId, list);
    }

    // Include stores with unsettled PENDING/APPROVED withdrawals even when they have
    // zero paid orders in the selected period (so Ready/Pending can surface them).
    const candidateStores = stores.filter(
      (store) =>
        (ordersByStore.get(store.id)?.length ?? 0) > 0 ||
        (unsettledByStore.get(store.id)?.length ?? 0) > 0,
    );
    const candidateStoreIds = candidateStores.map((store) => store.id);

    const [walletSummaries, pendingDuesByStore, items] = await Promise.all([
      walletSummariesPromise,
      computeStorePendingDuesBatch(candidateStoreIds),
      Promise.all(
        candidateStores.map(async (store) => {
          const orders = ordersByStore.get(store.id) ?? [];

          // Same window base as fetchPeriodBaseLookupForSettlement, without a second orders query.
          const windowBase = sumCommissionableBase(orders);
          const breakdown = accumulateSettlementBreakdown(
            orders,
            windowBase,
            convenienceFeeRates,
            undefined,
            commissionSlabs,
          );
          const periodCommission = sumBreakdownCommission(breakdown);
          const periodConvenienceFee = sumBreakdownConvenienceFee(breakdown);
          const periodPlatformPayback = sumOrdersPlatformPaybackLkr(orders);
          const netPlatformEarning = periodCommission - periodPlatformPayback;

          const withdrawals = unsettledByStore.get(store.id) ?? [];
          const enrichedWithdrawals = await Promise.all(
            withdrawals.map(async (w) => {
              const platformProviderReceivable = w.breakdown
                ? await resolveStoredPlatformProviderReceivable(w.breakdown)
                : null;
              return {
                id: w.id,
                amount: w.amount,
                amountLkr: w.amountLkr,
                finalPayoutAmount: w.finalPayoutAmount,
                finalPayoutAmountLkr: w.finalPayoutAmountLkr,
                periodFrom: w.periodFrom,
                periodTo: w.periodTo,
                status: w.status,
                breakdown: w.breakdown,
                remarks: w.remarks,
                isAdvance: w.isAdvance,
                createdAt: w.createdAt,
                platformProviderReceivable,
                dartCodesReceives: platformProviderReceivable
                  ? dartCodesReceivesLkrFromBreakdown(platformProviderReceivable)
                  : w.amountLkr,
              };
            }),
          );

          let dartCodesReceives: number;
          let periodPlatformProviderReceivable: Awaited<
            ReturnType<typeof resolveStoredPlatformProviderReceivable>
          > | null = null;
          if (enrichedWithdrawals.length > 0) {
            dartCodesReceives = enrichedWithdrawals.reduce(
              (sum, w) => sum + w.dartCodesReceives,
              0,
            );
          } else {
            const periodBreakdown = await computeBreakdownForPeriod(store.id, from, to);
            periodPlatformProviderReceivable =
              await resolveStoredPlatformProviderReceivable(periodBreakdown);
            dartCodesReceives = dartCodesReceivesLkrFromBreakdown(periodPlatformProviderReceivable);
          }

          const platformOwesBranch = netPlatformEarning < 0;
          const platformOwesAmount = Math.max(0, periodPlatformPayback - periodCommission);

          return {
            storeId: store.id,
            storeName: store.name,
            periodCommission,
            periodPlatformPayback,
            periodConvenienceFee,
            netPlatformEarning,
            dartCodesReceives,
            platformOwesBranch,
            platformOwesAmount,
            orderCount: sumBreakdownOrderCount(breakdown),
            hasOverlap: overlappingStoreIds.has(store.id),
            requiresPayout: withdrawals.length === 0,
            platformProviderReceivable: periodPlatformProviderReceivable,
            unsettledWithdrawals: enrichedWithdrawals,
          };
        }),
      ),
    ]);

    const availableWalletByStore = new Map(
      walletSummaries.map((summary) => [summary.storeId, summary.availableBalance]),
    );
    const totalWalletRemaining =
      walletSummaries.reduce((sum, summary) => sum + summary.availableBalance, 0) / 100;

    const data = items.map((item) => ({
      ...item,
      pendingDues: pendingDuesByStore.get(item.storeId) ?? 0,
      walletRemaining: (availableWalletByStore.get(item.storeId) ?? 0) / 100,
    }));

    res.json({
      success: true,
      data,
      summary: {
        totalWalletRemaining,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listReadyToProcessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCommissionSettlementTable();

    const user = req.user;
    if (user?.role !== 'SYSTEM_ADMIN') {
      throw new AppError('Forbidden', 403);
    }

    const withdrawals = await loadEnrichedApprovedUnsettledWithdrawals();
    const monthMap = new Map<
      string,
      { totalReceivable: number; branchIds: Set<string>; payoutCount: number }
    >();

    for (const w of withdrawals) {
      const month = calendarMonthFromPeriodFrom(w.periodFrom);
      if (!month) continue;
      const entry = monthMap.get(month) ?? {
        totalReceivable: 0,
        branchIds: new Set<string>(),
        payoutCount: 0,
      };
      entry.totalReceivable += w.dartCodesReceives;
      entry.branchIds.add(w.storeId);
      entry.payoutCount += 1;
      monthMap.set(month, entry);
    }

    const months = [...monthMap.entries()]
      .map(([month, stats]) => ({
        month,
        label: formatCalendarMonthLabel(month),
        totalReceivable: Math.round(stats.totalReceivable * 100) / 100,
        branchCount: stats.branchIds.size,
        payoutCount: stats.payoutCount,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    res.json({ success: true, data: months });
  } catch (err) {
    next(err);
  }
}

export async function getReadyToProcessMonthHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await ensureCommissionSettlementTable();

    const user = req.user;
    if (user?.role !== 'SYSTEM_ADMIN') {
      throw new AppError('Forbidden', 403);
    }

    const calendarMonth = readyToProcessMonthSchema.parse(req.params.month);
    const withdrawals = await loadEnrichedApprovedUnsettledWithdrawals();
    const inMonth = withdrawals.filter(
      (w) => calendarMonthFromPeriodFrom(w.periodFrom) === calendarMonth,
    );

    const byBranch = new Map<
      string,
      {
        storeId: string;
        storeName: string;
        periods: typeof inMonth;
      }
    >();

    for (const w of inMonth) {
      const existing = byBranch.get(w.storeId);
      if (existing) {
        existing.periods.push(w);
      } else {
        byBranch.set(w.storeId, {
          storeId: w.storeId,
          storeName: w.storeName,
          periods: [w],
        });
      }
    }

    const storeIds = [...byBranch.keys()];
    const paybackRows =
      storeIds.length > 0
        ? await prisma.store.findMany({
            where: { id: { in: storeIds } },
            select: { id: true, platformDiscountPaybackEnabled: true },
          })
        : [];
    const paybackEnabledByStoreId = new Map(
      paybackRows.map((s) => [s.id, s.platformDiscountPaybackEnabled]),
    );

    const branches = [...byBranch.values()]
      .map((group) => {
        const periodLkrs = group.periods.map((p) => p.platformProviderReceivable.lkr);
        const breakdowns = group.periods.map((p) => p.breakdown);
        const combinedLkr = combinePlatformProviderReceivableLkr(periodLkrs, breakdowns);
        const totalReceivable = combinedLkr.totalPlatformProviderReceivableLkr;
        const sharedPromoPlatformLkr = sumSharedPromoPlatformLkrFromBreakdowns(breakdowns);
        const platformDiscountPaybackEnabled =
          paybackEnabledByStoreId.get(group.storeId) ?? false;

        return {
          storeId: group.storeId,
          storeName: group.storeName,
          totalReceivable,
          platformDiscountPaybackEnabled,
          sharedPromoPlatformLkr,
          platformProviderReceivable: { lkr: combinedLkr },
          periods: group.periods.map((p) => ({
            withdrawalId: p.id,
            periodFrom: p.periodFrom,
            periodTo: p.periodTo,
            dartCodesReceives: p.dartCodesReceives,
            platformProviderReceivable: { lkr: p.platformProviderReceivable.lkr },
          })),
        };
      })
      .sort((a, b) => a.storeName.localeCompare(b.storeName));

    const totalReceivable = branches.reduce((sum, b) => sum + b.totalReceivable, 0);

    res.json({
      success: true,
      data: {
        month: calendarMonth,
        label: formatCalendarMonthLabel(calendarMonth),
        totalReceivable: Math.round(totalReceivable * 100) / 100,
        branches,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function bulkSettleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCommissionSettlementTable();

    const user = req.user;
    if (user?.role !== 'SYSTEM_ADMIN') {
      throw new AppError('Forbidden', 403);
    }

    const data = bulkSettleBodySchema.parse(req.body);

    // One shared Spaces proof for the bulk payment (same document for all branches).
    const sharedReceiptUrl = await requireSettlementProofUpload(
      req.file,
      'platform-bulk',
      'Payment receipt proof is required',
    );

    const results: Array<{
      storeId: string;
      withdrawalId: string;
      storeName: string;
      success: boolean;
      statementRef?: string;
      settlementId?: string;
      invoiceUrl?: string;
      error?: string;
    }> = [];

    let anySuccess = false;
    for (const item of data.items) {
      const store = await prisma.store.findFirst({
        where: { id: item.storeId, isActive: true },
        select: { id: true, name: true },
      });

      if (!store) {
        results.push({
          storeId: item.storeId,
          withdrawalId: item.withdrawalId,
          storeName: item.storeId,
          success: false,
          error: 'Store not found',
        });
        continue;
      }

      try {
        const linked = await resolveLinkedWithdrawalRecord(store.id, item.withdrawalId, {
          requireApproved: true,
        });
        const settlement = await createSettlementForStore({
          storeId: store.id,
          from: linked.periodFrom,
          to: linked.periodTo,
          paymentMethod: data.paymentMethod,
          storeWithdrawalId: linked.id,
          receiptUrl: sharedReceiptUrl,
          submittedById: user.sub,
        });
        anySuccess = true;

        results.push({
          storeId: store.id,
          withdrawalId: item.withdrawalId,
          storeName: store.name,
          success: true,
          statementRef: settlement.statementRef,
          settlementId: settlement.id,
          invoiceUrl: settlement.invoiceUrl ?? undefined,
        });
      } catch (err) {
        results.push({
          storeId: store.id,
          withdrawalId: item.withdrawalId,
          storeName: store.name,
          success: false,
          error: err instanceof AppError ? err.message : 'Settlement failed',
        });
      }
    }

    if (!anySuccess) {
      await deleteFromSpaces(sharedReceiptUrl);
    }

    res.status(201).json({ success: true, data: { results } });
  } catch (err) {
    next(err);
  }
}

export async function getSettlementPlatformReceivable(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await ensureCommissionSettlementTable();

    const id = z.string().uuid().parse(req.params.id);
    const storeIds = await resolveStoreIds(req);

    const data = await loadPlatformPayoutReceivableDetail(id, storeIds);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSettlement(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCommissionSettlementTable();

    const id = z.string().uuid().parse(req.params.id);
    const storeIds = await resolveStoreIds(req);

    const settlement = await prisma.commissionSettlement.findFirst({
      where: {
        id,
        ...(storeIds.length === 1 ? { storeId: storeIds[0] } : { storeId: { in: storeIds } }),
      },
      include: { store: { select: { name: true } } },
    });

    if (!settlement) throw new AppError('Settlement not found', 404);

    res.json({
      success: true,
      data: mapSettlementStatement(settlement),
    });
  } catch (err) {
    next(err);
  }
}

export async function getSettlementReceiptUrl(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCommissionSettlementTable();

    const id = z.string().uuid().parse(req.params.id);
    const storeIds = await resolveStoreIds(req);

    const settlement = await prisma.commissionSettlement.findFirst({
      where: {
        id,
        ...(storeIds.length === 1 ? { storeId: storeIds[0] } : { storeId: { in: storeIds } }),
      },
      select: { id: true, storeId: true, receiptUrl: true },
    });

    if (!settlement) {
      const storeScope =
        storeIds.length === 1 ? { storeId: storeIds[0] } : { storeId: { in: storeIds } };
      const withdrawal = await prisma.storeWithdrawal.findFirst({
        where: { id, ...storeScope },
        select: { proofUrl: true },
      });
      if (!withdrawal) throw new AppError('Settlement not found', 404);
      const access = await buildProofAccessResponse(withdrawal.proofUrl);
      res.json({ success: true, data: access });
      return;
    }

    const resolved = resolveSettlementReceiptUrl(settlement.receiptUrl, settlement.storeId);
    const access = await buildProofAccessResponse(resolved);
    res.json({ success: true, data: access });
  } catch (err) {
    next(err);
  }
}
