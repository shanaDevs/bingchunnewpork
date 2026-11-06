import { prisma } from './prisma';
import { isOnlinePaymentMethod } from './orderPayment';
import { orderCreatedAtFilter } from './walletRevenue';
import {
  chartBucketKey,
  resolveChartBucketDateRange,
  type ChartRange,
} from './dashboardStatsDateRange';
import { dateStringInColombo } from './datetime';
import {
  BREAKDOWN_ORDER_SELECT,
  EMPTY_REFUND_PENALTY_PREFETCH,
  type BreakdownOrderRow,
  type RefundPenaltyPrefetch,
  computeBreakdownForPeriodOrders,
  computeBranchPayablesBreakdown,
  loadRefundPenaltyTotalsByChartBuckets,
  loadRefundPenaltyTotalsByStore,
} from './walletService';
import {
  analyticsCacheKey,
  invalidateAnalyticsCacheByPrefix,
  withAnalyticsCache,
  getAnalyticsCacheTtlMs,
} from './analyticsResponseCache';
import { getGatewayFeeRate } from './appSchema';
import { getDeliveryWalletNetByBucket, getDeliveryWalletSummary } from './deliveryWalletService';
import { ensureJasonLedgerSchema } from './jasonLedgerSchema';
import { decimalFieldToCentsNumber } from './moneyDecimal';
import { txnAmountCents } from './walletApiMoney';
import { promiseAllLimited } from '../utils/promiseAllLimited';
import { getPrismaFanOutLimit } from './prisma';

export type WalletAnalysisTrendPoint = {
  day: number;
  label: string;
  inflow: number;
  outflow: number;
};

export type WalletAnalysisBranchContribution = {
  branchId: string;
  label: string;
  amount: number;
  percent: number;
};

export type WalletAnalysisFlowPoint = {
  key: string;
  label: string;
  amount: number;
};

export type WalletAnalysisHealthSlice = {
  key: string;
  label: string;
  amount: number;
};

export type WalletAnalysisExcludedFees = {
  /** All-time customer delivery fees (excluded from available balance). */
  deliveryFee: number;
  /** All-time customer convenience fees (excluded from available balance). */
  convenienceFee: number;
};

export type WalletAnalysisResult = {
  month: string;
  storeId: string | null;
  from: string;
  to: string;
  tank: { balance: number; capacity: number };
  /** Pickup online + delivery online + all-time retained refunds (LKR). */
  onlineAvailableBalance: number;
  health: { percent: number; slices: WalletAnalysisHealthSlice[] };
  /** All-time fee totals for scoped branches (LKR). */
  excludedFees: WalletAnalysisExcludedFees;
  trend: WalletAnalysisTrendPoint[];
  branchContribution: WalletAnalysisBranchContribution[];
  incoming: WalletAnalysisFlowPoint[];
  outgoing: WalletAnalysisFlowPoint[];
};

export type TxnDirection = 'inflow' | 'outflow' | 'ignore';

/** Classify a wallet transaction for analysis inflow/outflow series. */
export function classifyWalletTxnDirection(
  type: string,
  amountCents: number,
): TxnDirection {
  if (type === 'ORDER_PAYMENT' || type === 'ORDER_ADDON_PAYMENT') {
    return amountCents !== 0 ? 'inflow' : 'ignore';
  }
  if (type === 'REFUND' || type === 'PAYOUT') {
    return amountCents !== 0 ? 'outflow' : 'ignore';
  }
  if (type === 'ADJUSTMENT') {
    if (amountCents > 0) return 'inflow';
    if (amountCents < 0) return 'outflow';
  }
  return 'ignore';
}

export function centsToLkr(cents: number): number {
  return Math.round(cents) / 100;
}

export function resolveMonthWindow(monthKey: string, today = new Date()): {
  from: string;
  to: string;
  year: number;
  month: number;
  lastDay: number;
} {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error('Invalid month key; expected YYYY-MM');
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || month < 1 || month > 12) {
    throw new Error('Invalid month key; expected YYYY-MM');
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = `${monthKey}-01`;
  const isCurrentMonth =
    today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month;
  const todayDay = today.getUTCDate();
  const endDay = isCurrentMonth ? Math.min(todayDay, lastDay) : lastDay;
  const to = `${monthKey}-${String(endDay).padStart(2, '0')}`;

  return { from, to, year, month, lastDay: endDay };
}

export function padDailyTrend(
  endDay: number,
  byDay: Map<number, { inflowCents: number; outflowCents: number }>,
): WalletAnalysisTrendPoint[] {
  const points: WalletAnalysisTrendPoint[] = [];
  for (let day = 1; day <= endDay; day += 1) {
    const row = byDay.get(day) ?? { inflowCents: 0, outflowCents: 0 };
    points.push({
      day,
      label: String(day),
      inflow: centsToLkr(row.inflowCents),
      outflow: centsToLkr(row.outflowCents),
    });
  }
  return points;
}

export function computeHealthPercent(inflowLkr: number, outflowLkr: number): number {
  if (inflowLkr > 0) {
    return Math.min(100, Math.max(0, Math.round(((inflowLkr - outflowLkr) / inflowLkr) * 100)));
  }
  return outflowLkr > 0 ? 0 : 100;
}

export function buildBranchContributions(
  rows: { branchId: string; label: string; amountCents: number }[],
): WalletAnalysisBranchContribution[] {
  const positive = rows
    .filter((r) => r.amountCents > 0)
    .map((r) => ({ ...r, amount: centsToLkr(r.amountCents) }))
    .sort((a, b) => b.amount - a.amount);

  const total = positive.reduce((sum, r) => sum + r.amount, 0);
  return positive.map((r) => ({
    branchId: r.branchId,
    label: r.label,
    amount: r.amount,
    percent: total > 0 ? Math.round((r.amount / total) * 100) : 0,
  }));
}

function branchDisplayName(name: string): string {
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}

function nonZeroFlows(rows: WalletAnalysisFlowPoint[]): WalletAnalysisFlowPoint[] {
  return rows.filter((r) => r.amount > 0);
}

function roundLkr(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Prisma where for Jason ledger totals in a month window (optional branch scope). */
export function jasonLedgerPeriodWhere(
  type: 'INVESTMENT' | 'EXPENSE',
  from: string,
  to: string,
  storeId: string | null,
) {
  return {
    type,
    isActive: true,
    occurredAt: {
      gte: new Date(`${from}T00:00:00.000Z`),
      lte: new Date(`${to}T23:59:59.999Z`),
    },
    // Global (null storeId) rows count only for All Branches.
    ...(storeId ? { storeId } : {}),
  };
}

/** Canonical Incoming to wallet categories (zeros filtered by caller via nonZeroFlows). */
export function buildIncomingFlows(parts: {
  pickupOnlineLkr: number;
  deliveryOnlineLkr: number;
  convenienceLkr: number;
  deliveryFeeLkr: number;
  jasonInvestmentLkr: number;
}): WalletAnalysisFlowPoint[] {
  return nonZeroFlows([
    { key: 'pickup', label: 'Online pickup payments', amount: roundLkr(parts.pickupOnlineLkr) },
    { key: 'delivery', label: 'Delivery online orders', amount: roundLkr(parts.deliveryOnlineLkr) },
    {
      key: 'convenience',
      label: 'Customer convenience fees',
      amount: roundLkr(parts.convenienceLkr),
    },
    { key: 'deliveryFee', label: 'Delivery fees', amount: roundLkr(parts.deliveryFeeLkr) },
    {
      key: 'jasonInvestment',
      label: 'Jason investment',
      amount: roundLkr(parts.jasonInvestmentLkr),
    },
  ]);
}

/** Canonical Outgoing from wallet categories (zeros filtered by caller via nonZeroFlows). */
export function buildOutgoingFlows(parts: {
  deliveryPartnerLkr: number;
  platformCommissionLkr: number;
  paymentGatewayLkr: number;
  refundBankPenaltyLkr: number;
  jasonExpensesLkr: number;
}): WalletAnalysisFlowPoint[] {
  return nonZeroFlows([
    {
      key: 'partner',
      label: 'Delivery partner payment',
      amount: roundLkr(parts.deliveryPartnerLkr),
    },
    {
      key: 'platform',
      label: 'Platform provider commission',
      amount: roundLkr(parts.platformCommissionLkr),
    },
    {
      key: 'gateway',
      label: 'Payment gateway payments',
      amount: roundLkr(parts.paymentGatewayLkr),
    },
    {
      key: 'refundBankPenalty',
      label: 'Refund bank penalty payment',
      amount: roundLkr(parts.refundBankPenaltyLkr),
    },
    {
      key: 'jasonExpenses',
      label: 'Jason expenses',
      amount: roundLkr(parts.jasonExpensesLkr),
    },
  ]);
}

async function sumJasonLedgerCents(
  type: 'INVESTMENT' | 'EXPENSE',
  from: string,
  to: string,
  storeId: string | null,
): Promise<number> {
  await ensureJasonLedgerSchema();
  const agg = await prisma.jasonLedgerEntry.aggregate({
    _sum: { amount: true },
    where: jasonLedgerPeriodWhere(type, from, to, storeId),
  });
  return Math.max(0, decimalFieldToCentsNumber(agg._sum.amount));
}

/** Active Jason investments in a Date window, in LKR. Ledger amounts are stored in cents. */
export async function sumJasonInvestedLkrForRange(range: {
  gte: Date;
  lte: Date;
}): Promise<number> {
  const agg = await prisma.jasonLedgerEntry.aggregate({
    _sum: { amount: true },
    where: {
      type: 'INVESTMENT',
      isActive: true,
      occurredAt: { gte: range.gte, lte: range.lte },
    },
  });
  return centsToLkr(Math.max(0, decimalFieldToCentsNumber(agg._sum.amount)));
}

function sumCancelledByBranchCents(penaltyByStore: Map<string, RefundPenaltyPrefetch>): number {
  let total = 0;
  for (const penalty of penaltyByStore.values()) {
    total += penalty.cancelledByBranchGatewayFee;
  }
  return total;
}

async function loadOutgoingFlows(params: {
  from: string;
  to: string;
  storeId: string | null;
  storeIds: string[];
}): Promise<WalletAnalysisFlowPoint[]> {
  const { from, to, storeId, storeIds } = params;
  if (storeIds.length === 0) return [];

  const paidOrdersByStore = new Map<string, BreakdownOrderRow[]>();
  const allPaidOrders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      paymentStatus: 'PAID',
      status: { not: 'CANCELLED' },
      ...orderCreatedAtFilter(from, to),
    },
    select: BREAKDOWN_ORDER_SELECT,
  });
  for (const order of allPaidOrders) {
    const bucket = paidOrdersByStore.get(order.storeId) ?? [];
    bucket.push(order);
    paidOrdersByStore.set(order.storeId, bucket);
  }

  const activeStoreIds = [...paidOrdersByStore.keys()];

  const [penaltyByStore, deliverySummary, jasonExpenseCents, gatewayFeeRate] = await Promise.all([
    loadRefundPenaltyTotalsByStore(from, to),
    getDeliveryWalletSummary(from, to),
    sumJasonLedgerCents('EXPENSE', from, to, storeId),
    activeStoreIds.length > 0 ? getGatewayFeeRate() : Promise.resolve(0),
  ]);

  let commissionFeeCents = 0;
  let gatewayFeeCents = 0;
  if (activeStoreIds.length > 0) {
    const storeRows = await prisma.store.findMany({
      where: { id: { in: activeStoreIds } },
      select: { id: true, platformDiscountPaybackEnabled: true },
    });
    const paybackByStore = new Map(
      storeRows.map((row) => [row.id, row.platformDiscountPaybackEnabled ?? false]),
    );
    const breakdowns = await promiseAllLimited(
      getPrismaFanOutLimit(),
      activeStoreIds.map(
        (id) => () =>
          computeBreakdownForPeriodOrders(id, paidOrdersByStore.get(id) ?? [], from, to, {
            gatewayFeeRate,
            storePaybackEnabled: paybackByStore.get(id) ?? false,
            refundPenalty: penaltyByStore.get(id) ?? EMPTY_REFUND_PENALTY_PREFETCH,
          }),
      ),
    );
    commissionFeeCents = breakdowns.reduce((s, b) => s + (b.commissionFee ?? 0), 0);
    gatewayFeeCents = breakdowns.reduce((s, b) => s + (b.gatewayFee ?? 0), 0);
  }

  const refundBankPenaltyCents = sumCancelledByBranchCents(penaltyByStore);

  let deliveryPartnerLkr = deliverySummary.netForDelivery;
  if (storeId) {
    const branch = deliverySummary.branches.find((b) => b.storeId === storeId);
    deliveryPartnerLkr = branch?.netForDelivery ?? 0;
  }

  return buildOutgoingFlows({
    deliveryPartnerLkr,
    platformCommissionLkr: centsToLkr(commissionFeeCents),
    paymentGatewayLkr: centsToLkr(gatewayFeeCents),
    refundBankPenaltyLkr: centsToLkr(refundBankPenaltyCents),
    jasonExpensesLkr: centsToLkr(jasonExpenseCents),
  });
}

const DASHBOARD_OUTGOING_BUCKET_FANOUT = 6;

async function sumJasonExpenseCentsByBuckets(
  monthlyChart: ChartRange,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const buckets = new Map<string, number>();
  for (const key of monthlyChart.keys) {
    buckets.set(key, 0);
  }
  await ensureJasonLedgerSchema();
  const rows = await prisma.jasonLedgerEntry.findMany({
    where: jasonLedgerPeriodWhere('EXPENSE', from, to, null),
    select: { amount: true, occurredAt: true },
  });
  for (const row of rows) {
    const key = chartBucketKey(row.occurredAt, monthlyChart.granularity);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + decimalFieldToCentsNumber(row.amount));
  }
  return buckets;
}

async function outgoingFlowTotalForBucket(params: {
  ordersByStore: Map<string, BreakdownOrderRow[]>;
  from: string;
  to: string;
  gatewayFeeRate: number;
  paybackByStore: Map<string, boolean>;
  penaltyByStore: Map<string, RefundPenaltyPrefetch>;
  deliveryPartnerLkr: number;
  jasonExpenseCents: number;
}): Promise<number> {
  const {
    ordersByStore,
    from,
    to,
    gatewayFeeRate,
    paybackByStore,
    penaltyByStore,
    deliveryPartnerLkr,
    jasonExpenseCents,
  } = params;

  const activeStoreIds = [...ordersByStore.keys()].filter(
    (id) => (ordersByStore.get(id)?.length ?? 0) > 0,
  );

  let commissionFeeCents = 0;
  let gatewayFeeCents = 0;
  if (activeStoreIds.length > 0) {
    const breakdowns = await promiseAllLimited(
      getPrismaFanOutLimit(),
      activeStoreIds.map(
        (id) => () =>
          computeBreakdownForPeriodOrders(id, ordersByStore.get(id) ?? [], from, to, {
            gatewayFeeRate,
            storePaybackEnabled: paybackByStore.get(id) ?? false,
            refundPenalty: penaltyByStore.get(id) ?? EMPTY_REFUND_PENALTY_PREFETCH,
          }),
      ),
    );
    commissionFeeCents = breakdowns.reduce((s, b) => s + (b.commissionFee ?? 0), 0);
    gatewayFeeCents = breakdowns.reduce((s, b) => s + (b.gatewayFee ?? 0), 0);
  }

  const flows = buildOutgoingFlows({
    deliveryPartnerLkr,
    platformCommissionLkr: centsToLkr(commissionFeeCents),
    paymentGatewayLkr: centsToLkr(gatewayFeeCents),
    refundBankPenaltyLkr: centsToLkr(sumCancelledByBranchCents(penaltyByStore)),
    jasonExpensesLkr: centsToLkr(jasonExpenseCents),
  });
  return flows.reduce((sum, row) => sum + row.amount, 0);
}

/** One order load for the chart window; per-bucket outflow without re-querying orders. */
export async function getOutgoingTotalsByChartBuckets(
  monthlyChart: ChartRange,
): Promise<Map<string, number>> {
  const cacheKey = analyticsCacheKey([
    'dashboard-outgoing-bucket-totals',
    monthlyChart.gte.toISOString(),
    monthlyChart.lte.toISOString(),
    monthlyChart.granularity,
    monthlyChart.keys.join(','),
  ]);
  return withAnalyticsCache(
    cacheKey,
    () => computeOutgoingTotalsByChartBuckets(monthlyChart),
    getAnalyticsCacheTtlMs(),
  );
}

async function computeOutgoingTotalsByChartBuckets(
  monthlyChart: ChartRange,
): Promise<Map<string, number>> {
  const buckets = new Map<string, number>();
  const keySet = new Set(monthlyChart.keys);
  for (const key of monthlyChart.keys) {
    buckets.set(key, 0);
  }

  const wallets = await prisma.storeWallet.findMany({ select: { storeId: true } });
  const storeIds = wallets.map((w) => w.storeId);
  if (storeIds.length === 0) {
    return buckets;
  }

  const from = dateStringInColombo(monthlyChart.gte);
  const to = dateStringInColombo(monthlyChart.lte);

  const [allPaidOrders, gatewayFeeRate, deliveryNetByBucket, jasonByBucket, penaltyByBucket] =
    await Promise.all([
      prisma.order.findMany({
        where: {
          storeId: { in: storeIds },
          paymentStatus: 'PAID',
          status: { not: 'CANCELLED' },
          ...orderCreatedAtFilter(from, to),
        },
        select: BREAKDOWN_ORDER_SELECT,
      }),
      getGatewayFeeRate(),
      getDeliveryWalletNetByBucket(monthlyChart, from, to),
      sumJasonExpenseCentsByBuckets(monthlyChart, from, to),
      loadRefundPenaltyTotalsByChartBuckets(monthlyChart, from, to),
    ]);

  const ordersByBucketAndStore = new Map<string, Map<string, BreakdownOrderRow[]>>();
  const activeStoreIds = new Set<string>();
  for (const order of allPaidOrders) {
    const bucketKey = chartBucketKey(order.createdAt, monthlyChart.granularity);
    if (!keySet.has(bucketKey)) continue;
    const byStore = ordersByBucketAndStore.get(bucketKey) ?? new Map<string, BreakdownOrderRow[]>();
    const storeOrders = byStore.get(order.storeId) ?? [];
    storeOrders.push(order);
    byStore.set(order.storeId, storeOrders);
    ordersByBucketAndStore.set(bucketKey, byStore);
    activeStoreIds.add(order.storeId);
  }

  const paybackByStore = new Map<string, boolean>();
  if (activeStoreIds.size > 0) {
    const storeRows = await prisma.store.findMany({
      where: { id: { in: [...activeStoreIds] } },
      select: { id: true, platformDiscountPaybackEnabled: true },
    });
    for (const row of storeRows) {
      paybackByStore.set(row.id, row.platformDiscountPaybackEnabled ?? false);
    }
  }

  const rows = await promiseAllLimited(
    DASHBOARD_OUTGOING_BUCKET_FANOUT,
    monthlyChart.keys.map((key) => async () => {
      const { from: bucketFrom, to: bucketTo } = resolveChartBucketDateRange(
        key,
        monthlyChart.granularity,
        monthlyChart.lte,
      );
      const ordersByStore = ordersByBucketAndStore.get(key) ?? new Map<string, BreakdownOrderRow[]>();
      const total = await outgoingFlowTotalForBucket({
        ordersByStore,
        from: bucketFrom,
        to: bucketTo,
        gatewayFeeRate,
        paybackByStore,
        penaltyByStore: penaltyByBucket.get(key) ?? new Map(),
        deliveryPartnerLkr: deliveryNetByBucket.get(key) ?? 0,
        jasonExpenseCents: jasonByBucket.get(key) ?? 0,
      });
      return { key, total };
    }),
  );

  for (const { key, total } of rows) {
    buckets.set(key, total);
  }
  return buckets;
}

/** Canonical outgoing wallet methods for an arbitrary date range (YYYY-MM-DD). */
export async function getOutgoingFlowsForRange(params: {
  from: string;
  to: string;
  storeId?: string | null;
}): Promise<WalletAnalysisFlowPoint[]> {
  const storeId = params.storeId?.trim() || null;
  const wallets = await prisma.storeWallet.findMany({
    where: storeId ? { storeId } : undefined,
    select: { storeId: true },
  });
  return loadOutgoingFlows({
    from: params.from,
    to: params.to,
    storeId,
    storeIds: wallets.map((w) => w.storeId),
  });
}

/** Dashboard-only: cached outgoing flows (batched order load per request). */
export async function getOutgoingFlowsForDashboard(params: {
  from: string;
  to: string;
}): Promise<WalletAnalysisFlowPoint[]> {
  const cacheKey = analyticsCacheKey([
    'dashboard-outgoing-flows',
    params.from,
    params.to,
  ]);
  return withAnalyticsCache(
    cacheKey,
    () => getOutgoingFlowsForRange({ from: params.from, to: params.to }),
    getAnalyticsCacheTtlMs(),
  );
}

/**
 * Super-admin wallet analysis for a calendar month (optional branch scope).
 * Amounts in the result are LKR major units.
 */
export async function getWalletAnalysis(params: {
  monthKey: string;
  storeId?: string | null;
}): Promise<WalletAnalysisResult> {
  const storeId = params.storeId?.trim() || null;
  const cacheKey = analyticsCacheKey(['wallet-analysis', params.monthKey, storeId]);
  return withAnalyticsCache(
    cacheKey,
    () => computeWalletAnalysis(params),
    getAnalyticsCacheTtlMs(),
  );
}

/** Call after branch payout approve/initiate so System Wallet “All-Time Available Balance” refreshes. */
export function invalidateWalletAnalysisCache(): void {
  invalidateAnalyticsCacheByPrefix(analyticsCacheKey(['wallet-analysis']));
}

async function computeWalletAnalysis(params: {
  monthKey: string;
  storeId?: string | null;
}): Promise<WalletAnalysisResult> {
  const storeId = params.storeId?.trim() || null;
  const { from, to, lastDay } = resolveMonthWindow(params.monthKey);
  const dateFilter = orderCreatedAtFilter(from, to);

  const wallets = await prisma.storeWallet.findMany({
    where: storeId ? { storeId } : undefined,
    include: { store: { select: { id: true, name: true } } },
  });
  const storeIds = wallets.map((w) => w.storeId);

  const paidOrdersFeeWhere = {
    storeId: { in: storeIds },
    paymentStatus: 'PAID' as const,
    status: { not: 'CANCELLED' as const },
  };

  const [payablesBreakdowns, allTimeFeeAgg] = await Promise.all([
    storeIds.length > 0
      ? promiseAllLimited(
          getPrismaFanOutLimit(),
          storeIds.map((id) => () => computeBranchPayablesBreakdown(id)),
        )
      : Promise.resolve([]),
    storeIds.length > 0
      ? prisma.order.aggregate({
          where: paidOrdersFeeWhere,
          _sum: { deliveryFee: true, convenientFee: true },
        })
      : Promise.resolve({ _sum: { deliveryFee: null, convenientFee: null } }),
  ]);

  const excludedFees: WalletAnalysisExcludedFees = {
    deliveryFee: roundLkr(allTimeFeeAgg._sum.deliveryFee ?? 0),
    convenienceFee: roundLkr(allTimeFeeAgg._sum.convenientFee ?? 0),
  };

  const balanceCents = payablesBreakdowns.reduce(
    (sum, breakdown) => sum + breakdown.allTimeAvailableBalanceCents,
    0,
  );
  const onlineAvailableBalance = roundLkr(centsToLkr(balanceCents));

  if (storeIds.length === 0) {
    const emptyTrend = padDailyTrend(lastDay, new Map());
    return {
      month: params.monthKey,
      storeId,
      from,
      to,
      tank: { balance: 0, capacity: 0 },
      onlineAvailableBalance: 0,
      health: {
        percent: 100,
        slices: [
          { key: 'inflow', label: 'Inflow', amount: 0 },
          { key: 'outflow', label: 'Outflow', amount: 0 },
        ],
      },
      excludedFees,
      trend: emptyTrend,
      branchContribution: [],
      incoming: [],
      outgoing: [],
    };
  }

  const txnWhere = {
    storeId: { in: storeIds },
    ...dateFilter,
  };

  const [
    txns,
    creditByStore,
    onlineOrders,
    jasonInvestmentCents,
    outgoing,
  ] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: txnWhere,
      select: { type: true, amount: true, createdAt: true },
    }),
    prisma.walletTransaction.groupBy({
      by: ['storeId'],
      _sum: { amount: true },
      where: {
        storeId: { in: storeIds },
        type: { in: ['ORDER_PAYMENT', 'ORDER_ADDON_PAYMENT'] },
        ...dateFilter,
      },
    }),
    prisma.order.findMany({
      where: {
        storeId: { in: storeIds },
        paymentStatus: 'PAID',
        status: { not: 'CANCELLED' },
        paymentMethod: { in: ['CARD', 'PAYHERE'] },
        ...dateFilter,
      },
      select: {
        orderMode: true,
        paymentMethod: true,
        total: true,
        deliveryFee: true,
        convenientFee: true,
        subtotal: true,
        discount: true,
        loyaltyDiscount: true,
      },
    }),
    sumJasonLedgerCents('INVESTMENT', from, to, storeId),
    loadOutgoingFlows({ from, to, storeId, storeIds }),
  ]);

  const seriesByDay = new Map<number, { inflowCents: number; outflowCents: number }>();
  let periodInflowCents = 0;
  let periodOutflowCents = 0;

  for (const txn of txns) {
    const amountCents = txnAmountCents(txn);
    const direction = classifyWalletTxnDirection(txn.type, amountCents);
    if (direction === 'ignore') continue;
    const abs = Math.abs(amountCents);
    if (direction === 'inflow') periodInflowCents += abs;
    else periodOutflowCents += abs;

    const ymd = txn.createdAt.toISOString().slice(0, 10);
    if (ymd < from || ymd > to) continue;
    const day = Number(ymd.slice(8, 10));
    if (day < 1 || day > lastDay) continue;
    const bucket = seriesByDay.get(day) ?? { inflowCents: 0, outflowCents: 0 };
    if (direction === 'inflow') bucket.inflowCents += abs;
    else bucket.outflowCents += abs;
    seriesByDay.set(day, bucket);
  }

  const trend = padDailyTrend(lastDay, seriesByDay);
  const periodInflowLkr = centsToLkr(periodInflowCents);
  const outgoingTotalLkr = outgoing.reduce((sum, row) => sum + row.amount, 0);

  const creditMap = new Map(
    creditByStore.map((r) => [r.storeId, decimalFieldToCentsNumber(r._sum.amount)]),
  );
  const contributionRows = wallets.map((w) => ({
    branchId: w.storeId,
    label: branchDisplayName(w.store.name),
    amountCents: Math.max(0, creditMap.get(w.storeId) ?? 0),
  }));
  const branchContribution = buildBranchContributions(contributionRows);

  // Incoming: online PAID order channel split (LKR on orders) + Jason investment
  let pickupOnlineLkr = 0;
  let deliveryOnlineLkr = 0;
  let convenienceLkr = 0;
  let deliveryFeeLkr = 0;
  for (const order of onlineOrders) {
    if (!isOnlinePaymentMethod(order.paymentMethod as any)) continue;
    const conv = order.convenientFee ?? 0;
    const deliv = order.deliveryFee ?? 0;
    convenienceLkr += conv;
    if (order.orderMode === 'DELIVERY') {
      deliveryFeeLkr += deliv;
      deliveryOnlineLkr += Math.max(0, order.total - conv - deliv);
    } else if (order.orderMode === 'TAKEAWAY') {
      pickupOnlineLkr += Math.max(0, order.total - conv);
    }
  }

  const incoming = buildIncomingFlows({
    pickupOnlineLkr,
    deliveryOnlineLkr,
    convenienceLkr,
    deliveryFeeLkr,
    jasonInvestmentLkr: centsToLkr(jasonInvestmentCents),
  });

  const balanceLkr = centsToLkr(balanceCents);
  // Capacity: current wallet balance vs this month's inflow ceiling (whichever is larger).
  const capacityLkr = Math.max(balanceLkr, periodInflowLkr);

  const healthPercent = computeHealthPercent(periodInflowLkr, outgoingTotalLkr);

  return {
    month: params.monthKey,
    storeId,
    from,
    to,
    tank: { balance: balanceLkr, capacity: capacityLkr },
    onlineAvailableBalance,
    health: {
      percent: healthPercent,
      slices: [
        { key: 'inflow', label: 'Inflow', amount: periodInflowLkr },
        { key: 'outflow', label: 'Outflow', amount: outgoingTotalLkr },
      ],
    },
    excludedFees,
    trend,
    branchContribution,
    incoming,
    outgoing,
  };
}
