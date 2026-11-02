import crypto from 'crypto';
import { prisma } from './prisma';
import type { StoreWallet } from '@prisma/client';
import {
  commissionableSubtotal,
  computePlatformCommissionCents,
  getEffectiveRate,
  getSlabIndex,
  COMMISSION_SLABS,
  orderCommissionChannel,
  orderPlatformPayback,
  sumCommissionableBase,
  accumulateSettlementBreakdown,
  emptySettlementBreakdown,
  sumOnlinePaymentsCollectedFromBreakdown,
  type ChannelSettlementRow,
  type CommissionChannel,
} from './commission';
import {
  fetchSummarizedPaidOrderRevenue,
  orderCreatedAtFilter,
  periodActivePaidOrdersWhere,
} from './walletRevenue';
import { promiseAllLimited } from '../utils/promiseAllLimited';
import { getPrismaFanOutLimit } from './prisma';
import { ensureDeliveryPayoutSchema } from './deliveryPayoutSchema';
import { getDeliveryPayoutsSqlRef } from './deliveryPg';
import { ensurePlatformPaybackSchema } from './platformPaybackSchema';
import { getConvenienceFeeRates, getGatewayFeeRate } from './appSchema';
import { resolveBranchCancellationGatewayFeeLkr } from './refundPaymentStructure';
import {
  computeSharedPromoContribution,
  mergeSharedPromoIntoBreakdown,
  branchPayoutCentsFromWithdrawalBreakdown,
  resolveFinalPayoutAmountFromBreakdown,
} from './sharedPromoContribution';
import { attachPromoOwnershipTotals, loadPromoOwnershipTotalsForPeriod } from './promoOwnershipTotals';
import { Prisma } from '@prisma/client';
import { centsToDecimal, parseDecimalFromDb } from './moneyDecimal';
import {
  walletBalanceCents,
  walletTotalEarningsCents,
  walletTotalWithdrawnCents,
  withdrawalAmountCents,
} from './walletApiMoney';
import { decimalFieldToCentsNumber } from './moneyDecimal';
import { chartBucketKey, resolveChartBucketDateRange } from './dashboardStatsDateRange';

const EARNING_TYPES = ['ORDER_PAYMENT', 'ORDER_ADDON_PAYMENT'] as const;

const NET_ORDER_SELECT = {
  total: true,
  subtotal: true,
  deliveryFee: true,
  convenientFee: true,
  discount: true,
  loyaltyDiscount: true,
  orderMode: true,
  paymentMethod: true,
  createdAt: true,
  storeId: true,
  status: true,
  promotionUsages: {
    select: {
      ownership: true,
      platformShareAmount: true,
      platformPaybackEligible: true,
      platformPaybackAmount: true,
      platformPaybackSettledAt: true,
      platformPaybackReversedAt: true,
    },
  },
} as const;

export type WalletSummary = {
  storeId: string;
  currentBalance: number;
  /**
   * Gross ledger credits (ORDER_PAYMENT + ADJUSTMENT) before commission deductions.
   * @deprecated Prefer `grossLedgerCredits` — this field is pre-commission gross, not withdrawable net.
   */
  totalEarnings: number;
  /** Gross ledger credits (ORDER_PAYMENT + ADJUSTMENT) before commission deductions. */
  grossLedgerCredits: number;
  netTransferableEarnings: number;
  totalWithdrawn: number;
  pendingWithdrawalTotal: number;
  availableBalance: number;
};

export type BranchWalletPayablesBreakdown = {
  channelRevenueCents: {
    pickupCashIn: number;
    pickupOnlineIn: number;
    pickupCardIn: number;
    deliveryOnlineIn: number;
  };
  totalRevenueCents: number;
  platformCommissionCents: number;
  deliveryCommissionCents: number;
  gatewayFeeCents: number;
  /** Sum of branch payout amounts from paid 15-day cycles (cents). */
  branchReceivableCents: number;
  totalExpensesCents: number;
  allTimeAvailableBalanceCents: number;
};

export type BranchWalletDashboard = {
  allTimeEarnings: {
    pickupOnlineIn: number;
    deliveryOnlineIn: number;
    total: number;
  };
  allTimePayments: {
    toBranchCents: number;
    toPlatformCents: number;
    toDeliveryLkr: number;
  };
  liveEarningsCents: number;
  refundsLkr: number;
  payablesBreakdown?: BranchWalletPayablesBreakdown;
};

type DeliveryPayoutBreakdownBranch = {
  storeId?: string;
  netForDelivery?: number;
};

function branchNetForDeliveryFromPayoutBreakdown(
  breakdown: unknown,
  storeId: string,
): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  const branches = (breakdown as { branches?: DeliveryPayoutBreakdownBranch[] }).branches;
  if (!Array.isArray(branches)) return 0;
  return branches.reduce((sum, row) => {
    if (row.storeId !== storeId) return sum;
    return sum + Math.max(0, row.netForDelivery ?? 0);
  }, 0);
}

/** Gateway fee locked on an approved 15-day payout withdrawal (cents). */
export function gatewayFeeCentsFromWithdrawalBreakdown(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  const gatewayFee = (breakdown as Record<string, unknown>).gatewayFee;
  return typeof gatewayFee === 'number' && Number.isFinite(gatewayFee)
    ? Math.round(gatewayFee)
    : 0;
}

export type WalletDashboardPeriod = { from: string; to: string };

function periodCreatedAtFilter(period?: WalletDashboardPeriod) {
  return orderCreatedAtFilter(period?.from, period?.to);
}

function periodProcessedAtFilter(period?: WalletDashboardPeriod) {
  if (!period) return {};
  return {
    processedAt: {
      gte: new Date(`${period.from}T00:00:00.000Z`),
      lte: new Date(`${period.to}T23:59:59.999Z`),
    },
  };
}

async function computeBranchRefundsRetainedLkr(
  storeId: string,
  period?: WalletDashboardPeriod,
): Promise<number> {
  const agg = await prisma.refund.aggregate({
    where: {
      status: { in: ['COMPLETE', 'REJECTED'] },
      order: { storeId },
      ...periodProcessedAtFilter(period),
    },
    _sum: { notReturningSubtotal: true },
  });
  return agg._sum.notReturningSubtotal ?? 0;
}

async function computeGlobalRefundsRetainedLkr(period?: WalletDashboardPeriod): Promise<number> {
  const agg = await prisma.refund.aggregate({
    where: {
      status: { in: ['COMPLETE', 'REJECTED'] },
      ...periodProcessedAtFilter(period),
    },
    _sum: { notReturningSubtotal: true },
  });
  return agg._sum.notReturningSubtotal ?? 0;
}

async function fetchApprovedDeliveryPayoutBreakdowns(
  period?: WalletDashboardPeriod,
): Promise<Array<{ breakdown: unknown }>> {
  await ensureDeliveryPayoutSchema();
  if (period) {
    return prisma.$queryRawUnsafe<Array<{ breakdown: unknown }>>(
      `SELECT "breakdown" FROM ${getDeliveryPayoutsSqlRef()}
       WHERE status = 'APPROVED'
         AND "createdAt" >= $1::timestamp
         AND "createdAt" <= $2::timestamp`,
      new Date(`${period.from}T00:00:00.000Z`),
      new Date(`${period.to}T23:59:59.999Z`),
    );
  }
  return prisma.$queryRawUnsafe<Array<{ breakdown: unknown }>>(
    `SELECT "breakdown" FROM ${getDeliveryPayoutsSqlRef()} WHERE status = 'APPROVED'`,
  );
}

function buildBranchPayablesBreakdown(
  payablesRevenue: Awaited<ReturnType<typeof fetchSummarizedPaidOrderRevenue>>,
  platformCommissionCents: number,
  toDeliveryLkr: number,
  gatewayFeeCents: number,
  branchReceivableCents: number,
): BranchWalletPayablesBreakdown {
  const channels = payablesRevenue.commissionChannelRevenue.channelRevenueCents;
  const totalRevenueCents =
    channels.pickupCashIn +
    channels.pickupOnlineIn +
    channels.pickupCardIn +
    channels.deliveryOnlineIn;
  const deliveryCommissionCents = Math.round(toDeliveryLkr * 100);
  const totalExpensesCents =
    platformCommissionCents + gatewayFeeCents + deliveryCommissionCents;

  return {
    channelRevenueCents: { ...channels },
    totalRevenueCents,
    platformCommissionCents,
    deliveryCommissionCents,
    gatewayFeeCents,
    branchReceivableCents,
    totalExpensesCents,
    allTimeAvailableBalanceCents: totalRevenueCents - totalExpensesCents,
  };
}

export async function getBranchWalletDashboard(
  storeId: string,
  period?: WalletDashboardPeriod,
): Promise<BranchWalletDashboard> {
  const wallet = await getOrCreateWallet(storeId);
  const dateFilter = periodCreatedAtFilter(period);

  const [
    revenue,
    payablesRevenue,
    toBranchAgg,
    toPlatformAgg,
    approvedDeliveryPayouts,
    payablesToPlatformAgg,
    payablesDeliveryPayouts,
    paidPayoutWithdrawals,
    refundsLkr,
  ] = await Promise.all([
    fetchSummarizedPaidOrderRevenue({ storeId, ...dateFilter }),
    fetchSummarizedPaidOrderRevenue({ storeId }),
    prisma.storeWithdrawal.aggregate({
      _sum: { amount: true },
      where: { storeId, status: 'APPROVED', ...dateFilter },
    }),
    prisma.commissionSettlement.aggregate({
      _sum: { totalCommission: true },
      where: { storeId, status: 'VERIFIED', ...dateFilter },
    }),
    fetchApprovedDeliveryPayoutBreakdowns(period),
    prisma.commissionSettlement.aggregate({
      _sum: { totalCommission: true },
      where: { storeId, status: 'VERIFIED' },
    }),
    fetchApprovedDeliveryPayoutBreakdowns(),
    prisma.storeWithdrawal.findMany({
      where: {
        storeId,
        status: 'APPROVED',
        periodFrom: { not: null },
        periodTo: { not: null },
      },
      select: { breakdown: true, amount: true },
    }),
    computeBranchRefundsRetainedLkr(storeId),
  ]);

  const pickupOnlineIn = revenue.pickupOnlineIn;
  const deliveryOnlineIn = revenue.deliveryCardIn;

  const toDeliveryLkr = approvedDeliveryPayouts.reduce(
    (sum, row) => sum + branchNetForDeliveryFromPayoutBreakdown(row.breakdown, storeId),
    0,
  );

  const payablesToDeliveryLkr = payablesDeliveryPayouts.reduce(
    (sum, row) => sum + branchNetForDeliveryFromPayoutBreakdown(row.breakdown, storeId),
    0,
  );

  const paidPayoutGatewayFeeCents = paidPayoutWithdrawals.reduce(
    (sum, row) => sum + gatewayFeeCentsFromWithdrawalBreakdown(row.breakdown),
    0,
  );

  const paidBranchReceivableCents = paidPayoutWithdrawals.reduce(
    (sum, row) =>
      sum +
      branchPayoutCentsFromWithdrawalBreakdown(row.breakdown, withdrawalAmountCents(row)),
    0,
  );

  const payablesBreakdown = buildBranchPayablesBreakdown(
    payablesRevenue,
    decimalFieldToCentsNumber(payablesToPlatformAgg._sum.totalCommission),
    payablesToDeliveryLkr,
    paidPayoutGatewayFeeCents,
    paidBranchReceivableCents,
  );

  return {
    allTimeEarnings: {
      pickupOnlineIn,
      deliveryOnlineIn,
      total: pickupOnlineIn + deliveryOnlineIn,
    },
    allTimePayments: {
      toBranchCents: decimalFieldToCentsNumber(toBranchAgg._sum.amount),
      toPlatformCents: decimalFieldToCentsNumber(toPlatformAgg._sum.totalCommission),
      toDeliveryLkr,
    },
    liveEarningsCents: walletBalanceCents(wallet),
    refundsLkr,
    payablesBreakdown,
  };
}

export async function getSuperAdminWalletDashboard(
  period?: WalletDashboardPeriod,
): Promise<BranchWalletDashboard> {
  const dateFilter = periodCreatedAtFilter(period);

  const [
    revenue,
    approvedWithdrawals,
    toPlatformAgg,
    toDeliveryRows,
    liveEarningsAgg,
    refundsLkr,
    periodLiveAgg,
  ] = await Promise.all([
    fetchSummarizedPaidOrderRevenue({ ...dateFilter }),
    prisma.storeWithdrawal.findMany({
      where: { status: 'APPROVED', ...dateFilter },
      select: { amount: true, breakdown: true },
    }),
    prisma.commissionSettlement.aggregate({
      _sum: { totalCommission: true },
      where: { status: 'VERIFIED', ...dateFilter },
    }),
    (async () => {
      await ensureDeliveryPayoutSchema();
      if (period) {
        return prisma.$queryRawUnsafe<Array<{ sum: number | bigint }>>(
          `SELECT COALESCE(SUM("amount"), 0) AS sum FROM ${getDeliveryPayoutsSqlRef()}
           WHERE status = 'APPROVED'
             AND "createdAt" >= $1::timestamp
             AND "createdAt" <= $2::timestamp`,
          new Date(`${period.from}T00:00:00.000Z`),
          new Date(`${period.to}T23:59:59.999Z`),
        );
      }
      return prisma.$queryRawUnsafe<Array<{ sum: number | bigint }>>(
        `SELECT COALESCE(SUM("amount"), 0) AS sum FROM ${getDeliveryPayoutsSqlRef()} WHERE status = 'APPROVED'`,
      );
    })(),
    period
      ? Promise.resolve({ _sum: { balance: null as number | null } })
      : prisma.storeWallet.aggregate({ _sum: { balance: true } }),
    computeGlobalRefundsRetainedLkr(period),
    period
      ? prisma.walletTransaction.aggregate({
          _sum: { amount: true },
          where: { ...dateFilter },
        })
      : Promise.resolve(null),
  ]);

  const pickupOnlineIn = revenue.pickupOnlineIn;
  const deliveryOnlineIn = revenue.deliveryCardIn;

  const toBranchCents = approvedWithdrawals.reduce(
    (sum, w) =>
      sum + resolveFinalPayoutAmountFromBreakdown(w.breakdown, withdrawalAmountCents(w)),
    0,
  );

  return {
    allTimeEarnings: {
      pickupOnlineIn,
      deliveryOnlineIn,
      total: pickupOnlineIn + deliveryOnlineIn,
    },
    allTimePayments: {
      toBranchCents,
      toPlatformCents: decimalFieldToCentsNumber(toPlatformAgg._sum.totalCommission),
      toDeliveryLkr: Number(toDeliveryRows[0]?.sum ?? 0),
    },
    liveEarningsCents: period
      ? decimalFieldToCentsNumber(periodLiveAgg?._sum.amount)
      : decimalFieldToCentsNumber(liveEarningsAgg._sum.balance),
    refundsLkr,
  };
}

export type PeriodBreakdown = {
  /** All channels — item subtotal after discounts (cents). */
  grossAmount: number;
  /** Commissionable total sales for the window (cents). */
  windowBase: number;
  /** Effective commission rate for the window (0–1). */
  commissionRate: number;
  /** Human-readable tier label. */
  tierLabel: string;
  /** PayHere order totals collected in the online payment wallet (cents). */
  onlineWalletGross: number;
  /** Pickup/delivery online revenue subtotals for branch net payout (cents). */
  onlinePaymentsCollected: number;
  deliveryFee: number;
  commissionFee: number;
  gatewayFee: number;
  gatewayBase: number;
  /** Gateway fee rate locked for this period (display percent, e.g. 1.9). */
  gatewayRatePct: number;
  /** Gateway fee rate locked for this period (raw decimal, e.g. 0.019). */
  gatewayRate: number;
  convenienceFee: number;
  netAmount: number;
  /** Promotional + loyalty discounts in period (cents). */
  periodDiscountsTotal: number;
  /** Loyalty-points redemption discounts only (cents). Subset of periodDiscountsTotal. */
  periodLoyaltyDiscountTotal: number;
  platformPaybackTotal: number;
  /** Branch commission minus discounts applied when payback enabled. */
  netPlatformEarning: number;
  periodDues: number;
  orderCount: number;
  /** Sum of branch-admin cancellation additionalGatewayFee in period (cents). */
  cancelledByBranchGatewayFee: number;
  /** Count of completed branch-admin cancellations with gateway fee in period. */
  cancelledByBranchOrderCount: number;
  /** Sum of notReturningSubtotal from eligible customer late-cancellations (cents). */
  customerLateCancelSubtotal: number;
  /** Gateway deduction on customer late-cancel non-returning subtotal (cents). */
  customerLateCancelGatewayDeduction: number;
  /** Net amount added to branch payout from customer late-cancellations (cents). */
  customerLateCancelNetAmount: number;
  /** Sum of nonRefundableConvenienceFee from eligible customer late-cancel refunds (cents). */
  refundConvenienceFee: number;
  /** Sum of nonRefundableDeliveryFee from eligible customer late-cancel refunds (cents). */
  refundDeliveryFee: number;
  /** Sum of notReturningSubtotal from rejected refunds not covered by late-cancel recovery (cents). */
  rejectedRefundSubtotal: number;
  /** Gateway deduction on rejected-refund non-returning subtotal (cents). */
  rejectedRefundGatewayDeduction: number;
  /** Net amount added to branch payout from rejected refunds (cents). */
  rejectedRefundNetAmount: number;
  /** Sum of nonRefundableConvenienceFee from rejected refunds not covered by late-cancel recovery (cents). */
  rejectedRefundConvenienceFee: number;
  /** Sum of nonRefundableDeliveryFee from rejected refunds not covered by late-cancel recovery (cents). */
  rejectedRefundDeliveryFee: number;
  /** Total discount from SHARED promotions in period (cents). */
  sharedPromoTotalDiscount: number;
  /** Blended branch share % for SHARED promotions in period. */
  sharedPromoBranchContributionPct: number;
  /** Branch share of SHARED promotion discounts in period (cents). */
  sharedPromoBranchContributionAmount: number;
  /** Blended platform share % for SHARED promotions in period. */
  sharedPromoPlatformContributionPct: number;
  /** Platform share of SHARED promotion discounts — Branch+Platform only (cents). */
  sharedPromoPlatformContributionAmount: number;
  /** Blended Jason share % for SHARED promotions in period. */
  sharedPromoJasonContributionPct: number;
  /** Jason share of SHARED promotion discounts — Branch+Jason only (cents). */
  sharedPromoJasonContributionAmount: number;
  /** Branch wallet request + Jason shared-promo top-up (cents). */
  finalPayoutAmount: number;
  /** BRANCH-ownership promotion discounts in period (cents). Display snapshot only. */
  branchOwnedPromoDiscountTotal?: number;
  /** PLATFORM-ownership promotion discounts in period (cents). Display snapshot only. */
  platformOwnedPromoDiscountTotal?: number;
  /**
   * Channel settlement rows from the same order scan as this period breakdown.
   * Reuse for payout validation / net-preview — do not re-scan orders.
   */
  channelBreakdown: Record<CommissionChannel, ChannelSettlementRow>;
};

const EMPTY_SHARED_PROMO_BREAKDOWN_FIELDS = {
  sharedPromoTotalDiscount: 0,
  sharedPromoBranchContributionPct: 0,
  sharedPromoBranchContributionAmount: 0,
  sharedPromoPlatformContributionPct: 0,
  sharedPromoPlatformContributionAmount: 0,
  sharedPromoJasonContributionPct: 0,
  sharedPromoJasonContributionAmount: 0,
  finalPayoutAmount: 0,
} as const;

function branchInitiatedRefundWhere(
  storeId: string,
  from?: string,
  to?: string,
): Prisma.RefundWhereInput {
  const processedAtRange =
    from || to
      ? {
          ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
        }
      : undefined;

  return {
    status: 'COMPLETE',
    processedAt: processedAtRange ?? { not: null },
    OR: [
      {
        submittedBy: 'BRANCH_ADMIN',
        order: { storeId },
      },
      {
        order: {
          storeId,
          AND: [
            { cancelledBy: { not: null } },
            { cancelledBy: { not: 'customer' } },
          ],
        },
      },
    ],
  };
}

const BRANCH_CANCELLATION_REFUND_SELECT = {
  submittedBy: true,
  additionalGatewayFee: true,
  order: {
    select: {
      cancelledBy: true,
      orderNumber: true,
      storeId: true,
    },
  },
} as const;

function sumBranchCancellationGatewayFeeCents(
  refunds: Array<{
    submittedBy: string;
    additionalGatewayFee: number | null;
    order: { cancelledBy: string | null };
  }>,
): { cancelledByBranchGatewayFee: number; cancelledByBranchOrderCount: number } {
  let cancelledByBranchGatewayFee = 0;
  let cancelledByBranchOrderCount = 0;

  for (const refund of refunds) {
    const feeLkr = resolveBranchCancellationGatewayFeeLkr(refund);
    if (feeLkr <= 0) continue;
    cancelledByBranchGatewayFee += Math.round(feeLkr * 100);
    cancelledByBranchOrderCount += 1;
  }

  return { cancelledByBranchGatewayFee, cancelledByBranchOrderCount };
}

export async function computeCancelledByBranchGatewayFee(
  storeId: string,
  from?: string,
  to?: string,
): Promise<{ cancelledByBranchGatewayFee: number; cancelledByBranchOrderCount: number }> {
  if (!from && !to) {
    return { cancelledByBranchGatewayFee: 0, cancelledByBranchOrderCount: 0 };
  }

  const refunds = await prisma.refund.findMany({
    where: branchInitiatedRefundWhere(storeId, from, to),
    select: BRANCH_CANCELLATION_REFUND_SELECT,
  });

  return sumBranchCancellationGatewayFeeCents(refunds);
}

function customerLateCancelRefundWhere(
  storeId: string,
  from?: string,
  to?: string,
): Prisma.RefundWhereInput {
  const processedAtRange =
    from || to
      ? {
          ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
        }
      : undefined;

  return {
    status: { in: ['COMPLETE', 'REJECTED'] },
    processedAt: processedAtRange ?? { not: null },
    cancelledWithinWindow: false,
    submittedBy: 'CUSTOMER',
    notReturningSubtotal: { gt: 0 },
    order: {
      storeId,
      ...orderCreatedAtFilter(from, to),
    },
  };
}

function refundConvenienceFeeWhere(
  storeId: string,
  from?: string,
  to?: string,
): Prisma.RefundWhereInput {
  const processedAtRange =
    from || to
      ? {
          ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
        }
      : undefined;

  return {
    status: { in: ['COMPLETE', 'REJECTED'] },
    processedAt: processedAtRange ?? { not: null },
    cancelledWithinWindow: false,
    submittedBy: 'CUSTOMER',
    nonRefundableConvenienceFee: { gt: 0 },
    order: {
      storeId,
      ...orderCreatedAtFilter(from, to),
    },
  };
}

function refundDeliveryFeeWhere(
  storeId: string,
  from?: string,
  to?: string,
): Prisma.RefundWhereInput {
  const processedAtRange =
    from || to
      ? {
          ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
        }
      : undefined;

  return {
    status: { in: ['COMPLETE', 'REJECTED'] },
    processedAt: processedAtRange ?? { not: null },
    cancelledWithinWindow: false,
    submittedBy: 'CUSTOMER',
    nonRefundableDeliveryFee: { gt: 0 },
    order: {
      storeId,
      ...orderCreatedAtFilter(from, to),
    },
  };
}

/**
 * Rejected refunds whose retained amounts go to branch / delivery / platform via
 * computeRejectedRefundPayout (not customerLateCancelRecovery).
 *
 * Included:
 * - Customer within-window rejected cancellation (CUSTOMER + cancelledWithinWindow)
 * - Branch-admin rejected refund (submittedBy BRANCH_ADMIN)
 *
 * Excluded: customer late-cancels (CUSTOMER + cancelledWithinWindow false) — those
 * use customerLateCancelRefundWhere instead.
 */
function rejectedRefundPayoutWhere(
  storeId: string,
  from?: string,
  to?: string,
): Prisma.RefundWhereInput {
  const processedAtRange =
    from || to
      ? {
          ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
        }
      : undefined;

  return {
    status: 'REJECTED',
    processedAt: processedAtRange ?? { not: null },
    NOT: {
      AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
    },
    order: {
      storeId,
      status: 'CANCELLED',
      ...orderCreatedAtFilter(from, to),
    },
  };
}

function rejectedRefundSubtotalWhere(
  storeId: string,
  from?: string,
  to?: string,
): Prisma.RefundWhereInput {
  return {
    ...rejectedRefundPayoutWhere(storeId, from, to),
    notReturningSubtotal: { gt: 0 },
  };
}

function rejectedRefundConvenienceFeeWhere(
  storeId: string,
  from?: string,
  to?: string,
): Prisma.RefundWhereInput {
  return {
    ...rejectedRefundPayoutWhere(storeId, from, to),
    nonRefundableConvenienceFee: { gt: 0 },
  };
}

function rejectedRefundDeliveryFeeWhere(
  storeId: string,
  from?: string,
  to?: string,
): Prisma.RefundWhereInput {
  return {
    ...rejectedRefundPayoutWhere(storeId, from, to),
    nonRefundableDeliveryFee: { gt: 0 },
  };
}

export async function computeCustomerLateCancelRecovery(
  storeId: string,
  from?: string,
  to?: string,
  gatewayFeeRate?: number,
): Promise<{
  customerLateCancelSubtotal: number;
  customerLateCancelGatewayDeduction: number;
  customerLateCancelNetAmount: number;
  refundConvenienceFee: number;
  refundDeliveryFee: number;
}> {
  const zero = {
    customerLateCancelSubtotal: 0,
    customerLateCancelGatewayDeduction: 0,
    customerLateCancelNetAmount: 0,
    refundConvenienceFee: 0,
    refundDeliveryFee: 0,
  };
  if (!from && !to) return zero;

  const rate = gatewayFeeRate ?? (await getGatewayFeeRate());
  const subtotalRefunds = await prisma.refund.findMany({
    where: customerLateCancelRefundWhere(storeId, from, to),
    select: { notReturningSubtotal: true },
  });
  const convenienceFeeRefunds = await prisma.refund.findMany({
    where: refundConvenienceFeeWhere(storeId, from, to),
    select: { nonRefundableConvenienceFee: true },
  });
  const deliveryFeeRefunds = await prisma.refund.findMany({
    where: refundDeliveryFeeWhere(storeId, from, to),
    select: { nonRefundableDeliveryFee: true },
  });

  let subtotalCents = 0;
  for (const refund of subtotalRefunds) {
    const lkr = refund.notReturningSubtotal ?? 0;
    if (lkr > 0) subtotalCents += Math.round(lkr * 100);
  }

  let refundConvenienceFeeCents = 0;
  for (const refund of convenienceFeeRefunds) {
    const lkr = refund.nonRefundableConvenienceFee ?? 0;
    if (lkr > 0) refundConvenienceFeeCents += Math.round(lkr * 100);
  }

  let refundDeliveryFeeCents = 0;
  for (const refund of deliveryFeeRefunds) {
    const lkr = refund.nonRefundableDeliveryFee ?? 0;
    if (lkr > 0) refundDeliveryFeeCents += Math.round(lkr * 100);
  }

  const gatewayDeductionCents = Math.round(subtotalCents * rate);
  const netAmountCents = subtotalCents - gatewayDeductionCents;

  return {
    customerLateCancelSubtotal: subtotalCents,
    customerLateCancelGatewayDeduction: gatewayDeductionCents,
    customerLateCancelNetAmount: netAmountCents,
    refundConvenienceFee: refundConvenienceFeeCents,
    refundDeliveryFee: refundDeliveryFeeCents,
  };
}

export async function computeRejectedRefundPayout(
  storeId: string,
  from?: string,
  to?: string,
  gatewayFeeRate?: number,
): Promise<{
  rejectedRefundSubtotal: number;
  rejectedRefundGatewayDeduction: number;
  rejectedRefundNetAmount: number;
  rejectedRefundConvenienceFee: number;
  rejectedRefundDeliveryFee: number;
}> {
  const zero = {
    rejectedRefundSubtotal: 0,
    rejectedRefundGatewayDeduction: 0,
    rejectedRefundNetAmount: 0,
    rejectedRefundConvenienceFee: 0,
    rejectedRefundDeliveryFee: 0,
  };
  if (!from && !to) return zero;

  const rate = gatewayFeeRate ?? (await getGatewayFeeRate());
  const subtotalRefunds = await prisma.refund.findMany({
    where: rejectedRefundSubtotalWhere(storeId, from, to),
    select: { notReturningSubtotal: true },
  });
  const convenienceFeeRefunds = await prisma.refund.findMany({
    where: rejectedRefundConvenienceFeeWhere(storeId, from, to),
    select: { nonRefundableConvenienceFee: true },
  });
  const deliveryFeeRefunds = await prisma.refund.findMany({
    where: rejectedRefundDeliveryFeeWhere(storeId, from, to),
    select: { nonRefundableDeliveryFee: true },
  });

  let subtotalCents = 0;
  for (const refund of subtotalRefunds) {
    const lkr = refund.notReturningSubtotal ?? 0;
    if (lkr > 0) subtotalCents += Math.round(lkr * 100);
  }

  let rejectedRefundConvenienceFeeCents = 0;
  for (const refund of convenienceFeeRefunds) {
    const lkr = refund.nonRefundableConvenienceFee ?? 0;
    if (lkr > 0) rejectedRefundConvenienceFeeCents += Math.round(lkr * 100);
  }

  let rejectedRefundDeliveryFeeCents = 0;
  for (const refund of deliveryFeeRefunds) {
    const lkr = refund.nonRefundableDeliveryFee ?? 0;
    if (lkr > 0) rejectedRefundDeliveryFeeCents += Math.round(lkr * 100);
  }

  const gatewayDeductionCents = Math.round(subtotalCents * rate);
  const netAmountCents = subtotalCents - gatewayDeductionCents;

  return {
    rejectedRefundSubtotal: subtotalCents,
    rejectedRefundGatewayDeduction: gatewayDeductionCents,
    rejectedRefundNetAmount: netAmountCents,
    rejectedRefundConvenienceFee: rejectedRefundConvenienceFeeCents,
    rejectedRefundDeliveryFee: rejectedRefundDeliveryFeeCents,
  };
}

export async function listCancelledByBranchRefundsForPeriod(
  storeId: string,
  from?: string,
  to?: string,
) {
  if (!from && !to) return [];

  const refunds = await prisma.refund.findMany({
    where: branchInitiatedRefundWhere(storeId, from, to),
    select: {
      id: true,
      orderId: true,
      submittedBy: true,
      additionalGatewayFee: true,
      paidAt: true,
      processedAt: true,
      updatedAt: true,
      processedByAdminId: true,
      order: {
        select: {
          orderNumber: true,
          storeId: true,
          cancelledBy: true,
        },
      },
    },
    orderBy: [{ processedAt: 'asc' }],
  });

  return refunds.filter((refund) => resolveBranchCancellationGatewayFeeLkr(refund) > 0);
}

export async function getOrCreateWallet(storeId: string): Promise<StoreWallet> {
  return prisma.storeWallet.upsert({
    where: { storeId },
    create: {
      id: crypto.randomUUID(),
      storeId,
      balance: centsToDecimal(0),
      totalEarnings: centsToDecimal(0),
      totalWithdrawn: centsToDecimal(0),
    },
    update: {},
  });
}

export async function computeEarningsFromLedger(storeId: string): Promise<number> {
  const txns = await prisma.walletTransaction.findMany({
    where: { storeId },
    select: { type: true, amount: true },
  });

  let earnings = new Prisma.Decimal(0);
  for (const txn of txns) {
    const amt = parseDecimalFromDb(txn.amount);
    if (
      (EARNING_TYPES.includes(txn.type as (typeof EARNING_TYPES)[number]) && amt.greaterThan(0)) ||
      (txn.type === 'ADJUSTMENT' && amt.greaterThan(0))
    ) {
      earnings = earnings.plus(amt);
    }
  }
  return Number(earnings.toFixed(0));
}

export async function computeWithdrawnFromLedger(storeId: string): Promise<number> {
  const agg = await prisma.walletTransaction.aggregate({
    _sum: { amount: true },
    where: { storeId, type: 'PAYOUT' },
  });
  const sum = parseDecimalFromDb(agg._sum.amount);
  return Number(sum.abs().toFixed(0));
}

/**
 * Period payout breakdown for all paid orders (all four channels).
 * Display: gross/commission/delivery/convenience across all channels.
 * Online payments collected: pickup online + delivery online revenue subtotals.
 * Gateway fee: branch revenue (online payments collected) × configured gateway rate.
 * periodDiscountsTotal reports all order discounts for display.
 * When payback enabled: net platform earning = commission − platform payback − loyalty;
 * cancelled/refunded orders must not contribute loyaltyDiscount or commission.
 * Amounts returned in cents.
 */
export type BreakdownOrderRow = {
  total: number;
  subtotal: number;
  deliveryFee: number | null;
  convenientFee: number | null;
  discount: number | null;
  loyaltyDiscount: number | null;
  orderMode: string;
  paymentMethod: string;
  createdAt: Date;
  storeId: string;
  status: string;
  promotionUsages: Array<{
    ownership: string | null;
    platformShareAmount: number | null;
    platformPaybackEligible: boolean | null;
    platformPaybackAmount: number | null;
    platformPaybackSettledAt: Date | null;
    platformPaybackReversedAt: Date | null;
  }>;
};

export const BREAKDOWN_ORDER_SELECT = NET_ORDER_SELECT;

export async function computeBreakdownForPeriod(
  storeId: string,
  from?: string,
  to?: string,
): Promise<PeriodBreakdown> {
  const loadOrders = () =>
    prisma.order.findMany({
      where: periodActivePaidOrdersWhere(storeId, from, to),
      select: NET_ORDER_SELECT,
    });

  let paidOrders;
  try {
    paidOrders = await loadOrders();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== 'P2022') throw err;
    await ensurePlatformPaybackSchema();
    paidOrders = await loadOrders();
  }

  return computeBreakdownForPeriodOrders(storeId, paidOrders, from, to);
}

export type RefundPenaltyPrefetch = {
  cancelledByBranchGatewayFee: number;
  cancelledByBranchOrderCount: number;
  customerLateCancelSubtotal: number;
  customerLateCancelGatewayDeduction: number;
  customerLateCancelNetAmount: number;
  refundConvenienceFee: number;
  refundDeliveryFee: number;
  rejectedRefundSubtotal: number;
  rejectedRefundGatewayDeduction: number;
  rejectedRefundNetAmount: number;
  rejectedRefundConvenienceFee: number;
  rejectedRefundDeliveryFee: number;
};

export const EMPTY_REFUND_PENALTY_PREFETCH: RefundPenaltyPrefetch = {
  cancelledByBranchGatewayFee: 0,
  cancelledByBranchOrderCount: 0,
  customerLateCancelSubtotal: 0,
  customerLateCancelGatewayDeduction: 0,
  customerLateCancelNetAmount: 0,
  refundConvenienceFee: 0,
  refundDeliveryFee: 0,
  rejectedRefundSubtotal: 0,
  rejectedRefundGatewayDeduction: 0,
  rejectedRefundNetAmount: 0,
  rejectedRefundConvenienceFee: 0,
  rejectedRefundDeliveryFee: 0,
};

export type BreakdownPrefetch = {
  gatewayFeeRate?: number;
  storePaybackEnabled?: boolean;
  refundPenalty?: RefundPenaltyPrefetch;
};

function refundProcessedAtRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  };
}

function emptyPenalty(): RefundPenaltyPrefetch {
  return { ...EMPTY_REFUND_PENALTY_PREFETCH };
}

function addLateCancelIntoPenalty(
  penalty: RefundPenaltyPrefetch,
  notReturningSubtotalLkr: number,
  convenienceFeeLkr: number,
  deliveryFeeLkr: number,
  rate: number,
) {
  const subtotalCents = notReturningSubtotalLkr > 0 ? Math.round(notReturningSubtotalLkr * 100) : 0;
  penalty.customerLateCancelSubtotal += subtotalCents;
  const gatewayDeductionCents = Math.round(subtotalCents * rate);
  penalty.customerLateCancelGatewayDeduction += gatewayDeductionCents;
  penalty.customerLateCancelNetAmount += subtotalCents - gatewayDeductionCents;
  if (convenienceFeeLkr > 0) {
    penalty.refundConvenienceFee += Math.round(convenienceFeeLkr * 100);
  }
  if (deliveryFeeLkr > 0) {
    penalty.refundDeliveryFee += Math.round(deliveryFeeLkr * 100);
  }
}

function addRejectedIntoPenalty(
  penalty: RefundPenaltyPrefetch,
  notReturningSubtotalLkr: number,
  convenienceFeeLkr: number,
  deliveryFeeLkr: number,
  rate: number,
) {
  const subtotalCents = notReturningSubtotalLkr > 0 ? Math.round(notReturningSubtotalLkr * 100) : 0;
  penalty.rejectedRefundSubtotal += subtotalCents;
  const gatewayDeductionCents = Math.round(subtotalCents * rate);
  penalty.rejectedRefundGatewayDeduction += gatewayDeductionCents;
  penalty.rejectedRefundNetAmount += subtotalCents - gatewayDeductionCents;
  if (convenienceFeeLkr > 0) {
    penalty.rejectedRefundConvenienceFee += Math.round(convenienceFeeLkr * 100);
  }
  if (deliveryFeeLkr > 0) {
    penalty.rejectedRefundDeliveryFee += Math.round(deliveryFeeLkr * 100);
  }
}

function penaltyForStore(map: Map<string, RefundPenaltyPrefetch>, storeId: string) {
  const existing = map.get(storeId);
  if (existing) return existing;
  const created = emptyPenalty();
  map.set(storeId, created);
  return created;
}

/** One window-wide load of refund penalties, grouped by store. Replaces 7 queries per store. */
export async function loadRefundPenaltyTotalsByStore(
  from: string,
  to: string,
  gatewayFeeRate?: number,
): Promise<Map<string, RefundPenaltyPrefetch>> {
  const byStore = new Map<string, RefundPenaltyPrefetch>();
  const processedAt = refundProcessedAtRange(from, to) ?? { not: null };
  const orderCreated = orderCreatedAtFilter(from, to);
  const rate = gatewayFeeRate ?? (await getGatewayFeeRate());

  const [branchRefunds, lateCancelRefunds, rejectedRefunds] = await Promise.all([
    prisma.refund.findMany({
      where: {
        status: 'COMPLETE',
        processedAt,
        OR: [
          { submittedBy: 'BRANCH_ADMIN' },
          {
            order: {
              AND: [{ cancelledBy: { not: null } }, { cancelledBy: { not: 'customer' } }],
            },
          },
        ],
      },
      select: {
        submittedBy: true,
        additionalGatewayFee: true,
        order: { select: { storeId: true, cancelledBy: true } },
      },
    }),
    prisma.refund.findMany({
      where: {
        status: { in: ['COMPLETE', 'REJECTED'] },
        processedAt,
        cancelledWithinWindow: false,
        submittedBy: 'CUSTOMER',
        order: { ...orderCreated },
      },
      select: {
        notReturningSubtotal: true,
        nonRefundableConvenienceFee: true,
        nonRefundableDeliveryFee: true,
        order: { select: { storeId: true } },
      },
    }),
    prisma.refund.findMany({
      where: {
        status: 'REJECTED',
        processedAt,
        NOT: {
          AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
        },
        order: {
          status: 'CANCELLED',
          ...orderCreated,
        },
      },
      select: {
        notReturningSubtotal: true,
        nonRefundableConvenienceFee: true,
        nonRefundableDeliveryFee: true,
        order: { select: { storeId: true } },
      },
    }),
  ]);

  for (const refund of branchRefunds) {
    const feeLkr = resolveBranchCancellationGatewayFeeLkr(refund);
    if (feeLkr <= 0) continue;
    const penalty = penaltyForStore(byStore, refund.order.storeId);
    penalty.cancelledByBranchGatewayFee += Math.round(feeLkr * 100);
    penalty.cancelledByBranchOrderCount += 1;
  }

  for (const refund of lateCancelRefunds) {
    const penalty = penaltyForStore(byStore, refund.order.storeId);
    addLateCancelIntoPenalty(
      penalty,
      refund.notReturningSubtotal ?? 0,
      refund.nonRefundableConvenienceFee ?? 0,
      refund.nonRefundableDeliveryFee ?? 0,
      rate,
    );
  }

  for (const refund of rejectedRefunds) {
    const penalty = penaltyForStore(byStore, refund.order.storeId);
    addRejectedIntoPenalty(
      penalty,
      refund.notReturningSubtotal ?? 0,
      refund.nonRefundableConvenienceFee ?? 0,
      refund.nonRefundableDeliveryFee ?? 0,
      rate,
    );
  }

  return byStore;
}

/** Same window-wide refund load, split into chart buckets by processedAt. */
export async function loadRefundPenaltyTotalsByChartBuckets(
  monthlyChart: {
    keys: string[];
    granularity: 'day' | 'month';
    gte: Date;
    lte: Date;
  },
  from: string,
  to: string,
  gatewayFeeRate?: number,
): Promise<Map<string, Map<string, RefundPenaltyPrefetch>>> {
  const byBucket = new Map<string, Map<string, RefundPenaltyPrefetch>>();
  for (const key of monthlyChart.keys) {
    byBucket.set(key, new Map());
  }

  const processedAt = refundProcessedAtRange(from, to) ?? { not: null };
  const orderCreated = orderCreatedAtFilter(from, to);
  const rate = gatewayFeeRate ?? (await getGatewayFeeRate());

  const [branchRefunds, lateCancelRefunds, rejectedRefunds] = await Promise.all([
    prisma.refund.findMany({
      where: {
        status: 'COMPLETE',
        processedAt,
        OR: [
          { submittedBy: 'BRANCH_ADMIN' },
          {
            order: {
              AND: [{ cancelledBy: { not: null } }, { cancelledBy: { not: 'customer' } }],
            },
          },
        ],
      },
      select: {
        submittedBy: true,
        additionalGatewayFee: true,
        processedAt: true,
        order: { select: { storeId: true, cancelledBy: true, createdAt: true } },
      },
    }),
    prisma.refund.findMany({
      where: {
        status: { in: ['COMPLETE', 'REJECTED'] },
        processedAt,
        cancelledWithinWindow: false,
        submittedBy: 'CUSTOMER',
        order: { ...orderCreated },
      },
      select: {
        notReturningSubtotal: true,
        nonRefundableConvenienceFee: true,
        nonRefundableDeliveryFee: true,
        processedAt: true,
        order: { select: { storeId: true, createdAt: true } },
      },
    }),
    prisma.refund.findMany({
      where: {
        status: 'REJECTED',
        processedAt,
        NOT: {
          AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
        },
        order: {
          status: 'CANCELLED',
          ...orderCreated,
        },
      },
      select: {
        notReturningSubtotal: true,
        nonRefundableConvenienceFee: true,
        nonRefundableDeliveryFee: true,
        processedAt: true,
        order: { select: { storeId: true, createdAt: true } },
      },
    }),
  ]);

  const bucketRangeByKey = new Map(
    monthlyChart.keys.map((key) => [
      key,
      resolveChartBucketDateRange(key, monthlyChart.granularity, monthlyChart.lte),
    ]),
  );

  function inBucketRange(date: Date, range: { from: string; to: string }) {
    const gte = new Date(`${range.from}T00:00:00.000Z`);
    const lte = new Date(`${range.to}T23:59:59.999Z`);
    return date >= gte && date <= lte;
  }

  function bucketForProcessedAt(processed: Date | null): string | null {
    if (!processed) return null;
    const key = chartBucketKey(processed, monthlyChart.granularity);
    const range = bucketRangeByKey.get(key);
    if (!range || !inBucketRange(processed, range)) return null;
    return key;
  }

  function bucketForProcessedAndOrderCreated(
    processed: Date | null,
    orderCreatedAt: Date,
  ): string | null {
    const key = bucketForProcessedAt(processed);
    if (!key) return null;
    const range = bucketRangeByKey.get(key);
    if (!range || !inBucketRange(orderCreatedAt, range)) return null;
    return key;
  }

  for (const refund of branchRefunds) {
    const key = bucketForProcessedAt(refund.processedAt);
    if (!key) continue;
    const feeLkr = resolveBranchCancellationGatewayFeeLkr(refund);
    if (feeLkr <= 0) continue;
    const penalty = penaltyForStore(byBucket.get(key)!, refund.order.storeId);
    penalty.cancelledByBranchGatewayFee += Math.round(feeLkr * 100);
    penalty.cancelledByBranchOrderCount += 1;
  }

  for (const refund of lateCancelRefunds) {
    const key = bucketForProcessedAndOrderCreated(refund.processedAt, refund.order.createdAt);
    if (!key) continue;
    const penalty = penaltyForStore(byBucket.get(key)!, refund.order.storeId);
    addLateCancelIntoPenalty(
      penalty,
      refund.notReturningSubtotal ?? 0,
      refund.nonRefundableConvenienceFee ?? 0,
      refund.nonRefundableDeliveryFee ?? 0,
      rate,
    );
  }

  for (const refund of rejectedRefunds) {
    const key = bucketForProcessedAndOrderCreated(refund.processedAt, refund.order.createdAt);
    if (!key) continue;
    const penalty = penaltyForStore(byBucket.get(key)!, refund.order.storeId);
    addRejectedIntoPenalty(
      penalty,
      refund.notReturningSubtotal ?? 0,
      refund.nonRefundableConvenienceFee ?? 0,
      refund.nonRefundableDeliveryFee ?? 0,
      rate,
    );
  }

  return byBucket;
}

export async function computeBreakdownForPeriodOrders(
  storeId: string,
  paidOrders: BreakdownOrderRow[],
  from?: string,
  to?: string,
  prefetch?: BreakdownPrefetch,
): Promise<PeriodBreakdown> {
  let storePaybackEnabled = prefetch?.storePaybackEnabled ?? false;
  if (prefetch?.storePaybackEnabled === undefined) {
    const loadStorePaybackFlag = () =>
      prisma.store.findUnique({
        where: { id: storeId },
        select: { platformDiscountPaybackEnabled: true },
      });

    try {
      const storeRow = await loadStorePaybackFlag();
      storePaybackEnabled = storeRow?.platformDiscountPaybackEnabled ?? false;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'P2022') throw err;
      await ensurePlatformPaybackSchema();
      const storeRow = await loadStorePaybackFlag();
      storePaybackEnabled = storeRow?.platformDiscountPaybackEnabled ?? false;
    }
  }

  const gatewayFeeRate = prefetch?.gatewayFeeRate ?? (await getGatewayFeeRate());
  const gatewayRatePct = Math.round(gatewayFeeRate * 1000) / 10;
  const prefetchedPenalty = prefetch?.refundPenalty;
  const branchCancellationFees = prefetchedPenalty
    ? {
        cancelledByBranchGatewayFee: prefetchedPenalty.cancelledByBranchGatewayFee,
        cancelledByBranchOrderCount: prefetchedPenalty.cancelledByBranchOrderCount,
      }
    : await computeCancelledByBranchGatewayFee(storeId, from, to);
  const customerLateCancelRecovery = prefetchedPenalty
    ? {
        customerLateCancelSubtotal: prefetchedPenalty.customerLateCancelSubtotal,
        customerLateCancelGatewayDeduction: prefetchedPenalty.customerLateCancelGatewayDeduction,
        customerLateCancelNetAmount: prefetchedPenalty.customerLateCancelNetAmount,
        refundConvenienceFee: prefetchedPenalty.refundConvenienceFee,
        refundDeliveryFee: prefetchedPenalty.refundDeliveryFee,
      }
    : await computeCustomerLateCancelRecovery(storeId, from, to, gatewayFeeRate);
  const rejectedRefundPayout = prefetchedPenalty
    ? {
        rejectedRefundSubtotal: prefetchedPenalty.rejectedRefundSubtotal,
        rejectedRefundGatewayDeduction: prefetchedPenalty.rejectedRefundGatewayDeduction,
        rejectedRefundNetAmount: prefetchedPenalty.rejectedRefundNetAmount,
        rejectedRefundConvenienceFee: prefetchedPenalty.rejectedRefundConvenienceFee,
        rejectedRefundDeliveryFee: prefetchedPenalty.rejectedRefundDeliveryFee,
      }
    : await computeRejectedRefundPayout(storeId, from, to, gatewayFeeRate);

  if (paidOrders.length === 0) {
    const signedNet =
      -branchCancellationFees.cancelledByBranchGatewayFee +
      customerLateCancelRecovery.customerLateCancelNetAmount +
      rejectedRefundPayout.rejectedRefundNetAmount;
    return {
      grossAmount: 0,
      windowBase: 0,
      commissionRate: COMMISSION_SLABS[0].rate,
      tierLabel: COMMISSION_SLABS[0].label,
      onlineWalletGross: 0,
      onlinePaymentsCollected: 0,
      deliveryFee: 0,
      commissionFee: 0,
      gatewayFee: 0,
      gatewayBase: 0,
      gatewayRatePct,
      gatewayRate: gatewayFeeRate,
      convenienceFee: 0,
      netAmount: Math.max(0, signedNet),
      periodDiscountsTotal: 0,
      periodLoyaltyDiscountTotal: 0,
      platformPaybackTotal: 0,
      netPlatformEarning: 0,
      periodDues: Math.max(0, -signedNet),
      orderCount: 0,
      cancelledByBranchGatewayFee: branchCancellationFees.cancelledByBranchGatewayFee,
      cancelledByBranchOrderCount: branchCancellationFees.cancelledByBranchOrderCount,
      customerLateCancelSubtotal: customerLateCancelRecovery.customerLateCancelSubtotal,
      customerLateCancelGatewayDeduction:
        customerLateCancelRecovery.customerLateCancelGatewayDeduction,
      customerLateCancelNetAmount: customerLateCancelRecovery.customerLateCancelNetAmount,
      refundConvenienceFee: customerLateCancelRecovery.refundConvenienceFee,
      refundDeliveryFee: customerLateCancelRecovery.refundDeliveryFee,
      rejectedRefundSubtotal: rejectedRefundPayout.rejectedRefundSubtotal,
      rejectedRefundGatewayDeduction: rejectedRefundPayout.rejectedRefundGatewayDeduction,
      rejectedRefundNetAmount: rejectedRefundPayout.rejectedRefundNetAmount,
      rejectedRefundConvenienceFee: rejectedRefundPayout.rejectedRefundConvenienceFee,
      rejectedRefundDeliveryFee: rejectedRefundPayout.rejectedRefundDeliveryFee,
      channelBreakdown: emptySettlementBreakdown(gatewayFeeRate),
      ...EMPTY_SHARED_PROMO_BREAKDOWN_FIELDS,
    };
  }

  const windowBase = sumCommissionableBase(paidOrders);
  const commissionRate = getEffectiveRate(windowBase);
  const tierLabel = COMMISSION_SLABS[getSlabIndex(windowBase)].label;

  let grossAmount = 0;
  let onlineWalletGross = 0;
  let deliveryFee = 0;
  let commissionFee = 0;
  let convenienceFee = 0;
  let platformPaybackTotal = 0;
  let periodDiscountsTotal = 0;
  let periodLoyaltyDiscountTotal = 0;

  for (const order of paidOrders) {
    const channel = orderCommissionChannel(order.orderMode, order.paymentMethod);
    if (!channel) continue;

    periodDiscountsTotal += Math.round(
      ((order.discount ?? 0) + (order.loyaltyDiscount ?? 0)) * 100,
    );
    periodLoyaltyDiscountTotal += Math.round((order.loyaltyDiscount ?? 0) * 100);

    const base = commissionableSubtotal(order);
    const commissionCents = computePlatformCommissionCents(base, windowBase);
    const paybackLkr = storePaybackEnabled
      ? orderPlatformPayback(order, { storePaybackEnabled: true })
      : 0;
    const paybackCents = Math.round(paybackLkr * 100);
    // Stored DB convenientFee only — do not recalculate from rates.
    const convenienceLkr = order.convenientFee ?? 0;
    const convenientFeeCents = Math.round(convenienceLkr * 100);
    const grossCents = Math.round(base * 100);

    grossAmount += grossCents;
    if (channel === 'deliveryOnline') {
      deliveryFee += Math.round((order.deliveryFee ?? 0) * 100);
    }
    commissionFee += commissionCents;
    convenienceFee += convenientFeeCents;
    platformPaybackTotal += paybackCents;

    // Item revenue only. Delivery Online includes card and loyalty as well as PayHere.
    if (channel === 'pickupOnline' || channel === 'deliveryOnline') {
      onlineWalletGross += grossCents;
    }
  }

  // Gateway fee on branch revenue only (excl. convenience and delivery — settled separately).
  const gatewayBase = onlineWalletGross;
  const gatewayFee = Math.round(gatewayBase * gatewayFeeRate);

  const convenienceFeeRates = await getConvenienceFeeRates();
  const channelBreakdown = accumulateSettlementBreakdown(
    paidOrders,
    windowBase,
    convenienceFeeRates,
    gatewayFeeRate,
  );
  const onlinePaymentsCollected = Math.round(
    sumOnlinePaymentsCollectedFromBreakdown(channelBreakdown) * 100,
  );

  const netPlatformEarning = storePaybackEnabled
    ? commissionFee - platformPaybackTotal - periodLoyaltyDiscountTotal
    : commissionFee - periodLoyaltyDiscountTotal;
  const signedNet = onlinePaymentsCollected - netPlatformEarning - gatewayFee;
  const signedNetAfterBranchCancellations =
    signedNet -
    branchCancellationFees.cancelledByBranchGatewayFee +
    customerLateCancelRecovery.customerLateCancelNetAmount +
    rejectedRefundPayout.rejectedRefundNetAmount;
  const netAmount = Math.max(0, signedNetAfterBranchCancellations);
  const periodDues = Math.max(0, -signedNetAfterBranchCancellations);

  const payoutOrderCount = paidOrders.filter(
    (order) => orderCommissionChannel(order.orderMode, order.paymentMethod) != null,
  ).length;

  return {
    grossAmount,
    windowBase: Math.round(windowBase * 100),
    commissionRate,
    tierLabel,
    onlineWalletGross,
    onlinePaymentsCollected,
    deliveryFee,
    commissionFee,
    gatewayFee,
    gatewayBase,
    gatewayRatePct,
    gatewayRate: gatewayFeeRate,
    convenienceFee,
    netAmount,
    periodDiscountsTotal,
    periodLoyaltyDiscountTotal,
    platformPaybackTotal,
    netPlatformEarning,
    periodDues,
    orderCount: payoutOrderCount,
    cancelledByBranchGatewayFee: branchCancellationFees.cancelledByBranchGatewayFee,
    cancelledByBranchOrderCount: branchCancellationFees.cancelledByBranchOrderCount,
    customerLateCancelSubtotal: customerLateCancelRecovery.customerLateCancelSubtotal,
    customerLateCancelGatewayDeduction:
      customerLateCancelRecovery.customerLateCancelGatewayDeduction,
    customerLateCancelNetAmount: customerLateCancelRecovery.customerLateCancelNetAmount,
    refundConvenienceFee: customerLateCancelRecovery.refundConvenienceFee,
    refundDeliveryFee: customerLateCancelRecovery.refundDeliveryFee,
    rejectedRefundSubtotal: rejectedRefundPayout.rejectedRefundSubtotal,
    rejectedRefundGatewayDeduction: rejectedRefundPayout.rejectedRefundGatewayDeduction,
    rejectedRefundNetAmount: rejectedRefundPayout.rejectedRefundNetAmount,
    rejectedRefundConvenienceFee: rejectedRefundPayout.rejectedRefundConvenienceFee,
    rejectedRefundDeliveryFee: rejectedRefundPayout.rejectedRefundDeliveryFee,
    channelBreakdown,
    ...EMPTY_SHARED_PROMO_BREAKDOWN_FIELDS,
  };
}

export async function computeNetTransferableEarnings(
  storeId: string,
  from?: string,
  to?: string,
): Promise<number> {
  const [breakdown, sharedPromo, promoOwnership] = await Promise.all([
    computeBreakdownForPeriod(storeId, from, to),
    computeSharedPromoContribution(storeId, from, to),
    from && to
      ? loadPromoOwnershipTotalsForPeriod(storeId, from, to)
      : Promise.resolve({
          branchOwnedPromoDiscountTotal: 0,
          platformOwnedPromoDiscountTotal: 0,
        }),
  ]);
  return attachPromoOwnershipTotals(
    mergeSharedPromoIntoBreakdown(breakdown, sharedPromo),
    promoOwnership,
  ).netAmount;
}

export async function getPendingWithdrawalTotal(storeId: string): Promise<number> {
  const agg = await prisma.storeWithdrawal.aggregate({
    _sum: { amount: true },
    where: { storeId, status: 'PENDING' },
  });
  const sum = parseDecimalFromDb(agg._sum.amount);
  return Number(sum.toFixed(0));
}

export async function refreshWalletCaches(storeId: string): Promise<StoreWallet> {
  const [balance, totalEarnings, totalWithdrawn] = await Promise.all([
    recalculateBalanceFromLedger(storeId),
    computeEarningsFromLedger(storeId),
    computeWithdrawnFromLedger(storeId),
  ]);

  return prisma.storeWallet.upsert({
    where: { storeId },
    create: {
      id: crypto.randomUUID(),
      storeId,
      balance: centsToDecimal(balance),
      totalEarnings: centsToDecimal(totalEarnings),
      totalWithdrawn: centsToDecimal(totalWithdrawn),
    },
    update: {
      balance: centsToDecimal(balance),
      totalEarnings: centsToDecimal(totalEarnings),
      totalWithdrawn: centsToDecimal(totalWithdrawn),
    },
  });
}

function sumLedgerAndWarnOnDrift(
  txns: Array<{ id: string; amount: Prisma.Decimal; balanceAfter: Prisma.Decimal }>,
): number {
  let balance = new Prisma.Decimal(0);
  for (const txn of txns) {
    balance = balance.plus(parseDecimalFromDb(txn.amount));
    const stored = parseDecimalFromDb(txn.balanceAfter);
    if (!stored.equals(balance)) {
      console.warn(
        `[wallet-audit] balanceAfter mismatch on tx ${txn.id}: stored=${stored.toFixed()} computed=${balance.toFixed()}`,
      );
    }
  }
  return Number(balance.toFixed(0));
}

async function recalculateBalanceFromLedger(storeId: string): Promise<number> {
  const txns = await prisma.walletTransaction.findMany({
    where: { storeId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, amount: true, balanceAfter: true },
  });
  return sumLedgerAndWarnOnDrift(txns);
}

export async function getWalletSummary(storeId: string): Promise<WalletSummary> {
  const wallet = await getOrCreateWallet(storeId);
  const [pendingWithdrawalTotal, netTransferableEarnings] = await Promise.all([
    getPendingWithdrawalTotal(storeId),
    computeNetTransferableEarnings(storeId),
  ]);

  const totalWithdrawn = walletTotalWithdrawnCents(wallet);
  const remainingNet = Math.max(0, netTransferableEarnings - totalWithdrawn);

  return {
    storeId,
    currentBalance: walletBalanceCents(wallet),
    totalEarnings: walletTotalEarningsCents(wallet),
    grossLedgerCredits: walletTotalEarningsCents(wallet),
    netTransferableEarnings,
    totalWithdrawn,
    pendingWithdrawalTotal,
    availableBalance: Math.max(0, remainingNet - pendingWithdrawalTotal),
  };
}

export function enrichWalletRow<T extends StoreWallet>(
  wallet: T,
  pendingWithdrawalTotal: number,
  netTransferableEarnings?: number,
) {
  const totalEarnings = walletTotalEarningsCents(wallet);
  const totalWithdrawn = walletTotalWithdrawnCents(wallet);
  const net = netTransferableEarnings ?? totalEarnings;
  const remainingNet = Math.max(0, net - totalWithdrawn);
  return {
    ...wallet,
    netTransferableEarnings: net,
    currentBalance: walletBalanceCents(wallet),
    availableBalance: Math.max(0, remainingNet - pendingWithdrawalTotal),
  };
}

/** Total remaining payable to branches (available balance after withdrawals & pending requests). */
export async function computeBranchPayablesSummary(storeId?: string): Promise<{
  totalRemaining: number;
  branchesWithPayable: number;
}> {
  if (!storeId) {
    return computeBranchPayablesSummaryFast();
  }
  const summaries = await promiseAllLimited(getPrismaFanOutLimit(), [
    () => getWalletSummary(storeId),
  ]);
  return {
    totalRemaining: summaries.reduce((sum, summary) => sum + summary.availableBalance, 0),
    branchesWithPayable: summaries.filter((summary) => summary.availableBalance > 0).length,
  };
}

/** Super-admin dashboard KPI: wallet balance minus pending withdrawals (approximate net payable). */
export async function computeBranchPayablesSummaryFast(): Promise<{
  totalRemaining: number;
  branchesWithPayable: number;
}> {
  const [wallets, pendingRows] = await Promise.all([
    prisma.storeWallet.findMany({
      where: { store: { isActive: true } },
      select: { storeId: true, balance: true },
    }),
    prisma.storeWithdrawal.groupBy({
      by: ['storeId'],
      where: { status: 'PENDING', store: { isActive: true } },
      _sum: { amount: true },
    }),
  ]);

  const pendingByStore = new Map(
    pendingRows.map((row) => [row.storeId, decimalFieldToCentsNumber(row._sum.amount)]),
  );

  let totalRemaining = 0;
  let branchesWithPayable = 0;
  for (const wallet of wallets) {
    const balanceCents = walletBalanceCents(wallet);
    const pendingCents = pendingByStore.get(wallet.storeId) ?? 0;
    const available = Math.max(0, balanceCents - pendingCents);
    totalRemaining += available;
    if (available > 0) branchesWithPayable += 1;
  }

  return { totalRemaining, branchesWithPayable };
}
