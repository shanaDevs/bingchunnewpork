import crypto from 'crypto';
import { type Prisma } from '@prisma/client';
import { centsToDecimal, decimalFieldToCentsNumber } from './moneyDecimal';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import { ensurePlatformEarningsSchema } from './platformEarningsSchema';
import { computeBreakdownForPeriod, type PeriodBreakdown } from './walletService';
import { resolveStoredPlatformProviderReceivable } from './platformSettlementHelpers';

type PrismaTx = Prisma.TransactionClient;

export function toCalendarMonth(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function extractAmountsFromBreakdown(breakdown: unknown): {
  commissionAmount: number;
  convenienceFeeAmount: number;
  platformPaybackAmount: number;
  sharedPromoContributionAmount: number;
  loyaltyDiscountAmount: number;
} {
  const b = breakdown as Partial<PeriodBreakdown> | null;
  return {
    commissionAmount: typeof b?.commissionFee === 'number' ? b.commissionFee : 0,
    convenienceFeeAmount: typeof b?.convenienceFee === 'number' ? b.convenienceFee : 0,
    platformPaybackAmount: typeof b?.platformPaybackTotal === 'number' ? b.platformPaybackTotal : 0,
    sharedPromoContributionAmount:
      typeof b?.sharedPromoPlatformContributionAmount === 'number'
        ? b.sharedPromoPlatformContributionAmount
        : 0,
    loyaltyDiscountAmount:
      typeof b?.periodLoyaltyDiscountTotal === 'number' ? b.periodLoyaltyDiscountTotal : 0,
  };
}

function hasBreakdownAmounts(breakdown: unknown): boolean {
  const b = breakdown as Partial<PeriodBreakdown> | null;
  return typeof b?.commissionFee === 'number' || typeof b?.convenienceFee === 'number';
}

export type CreditPlatformEarningInput = {
  storeWithdrawalId: string;
  storeId: string;
  breakdown: unknown;
  periodFrom: Date | null;
  periodTo: Date | null;
  approvedAt: Date;
};

export async function creditPlatformEarning(
  input: CreditPlatformEarningInput,
  tx?: PrismaTx,
) {
  // Schema DDL must run outside interactive transactions (avoids P2028 timeout).
  if (!tx) {
    await ensurePlatformEarningsSchema();
  }
  const db = tx ?? prisma;
  const { storeWithdrawalId, storeId, periodFrom, periodTo, approvedAt } = input;
  let effectiveBreakdown = input.breakdown;

  if (!hasBreakdownAmounts(effectiveBreakdown) && periodFrom && periodTo) {
    effectiveBreakdown = await computeBreakdownForPeriod(
      storeId,
      toDateStr(periodFrom),
      toDateStr(periodTo),
    );
  }

  const { commissionAmount, convenienceFeeAmount, platformPaybackAmount, sharedPromoContributionAmount, loyaltyDiscountAmount } =
    extractAmountsFromBreakdown(effectiveBreakdown);
  const platformProviderReceivable = await resolveStoredPlatformProviderReceivable(effectiveBreakdown);
  const totalEarned = platformProviderReceivable.totalPlatformProviderReceivableCents;
  const calendarMonth = toCalendarMonth(approvedAt);
  const amountFields = {
    commissionAmount,
    convenienceFeeAmount,
    platformPaybackAmount,
    sharedPromoContributionAmount,
    loyaltyDiscountAmount,
    netPlatformCommissionAmount: platformProviderReceivable.netPlatformCommissionCents,
    completedRefundConvenienceAmount: platformProviderReceivable.completedRefundConvenienceFeeCents,
    rejectedRefundConvenienceAmount: platformProviderReceivable.rejectedRefundConvenienceFeeCents,
    netPlatformEarningsAmount: platformProviderReceivable.netPlatformEarningsCents,
    eligibleProviderAmount: platformProviderReceivable.eligibleProviderAmountCents,
    gatewayDeductionAmount: platformProviderReceivable.gatewayDeductionCents,
    totalEarned,
  };
  const decimalAmounts = Object.fromEntries(
    Object.entries(amountFields).map(([k, v]) => [k, centsToDecimal(v)]),
  ) as Record<keyof typeof amountFields, ReturnType<typeof centsToDecimal>>;

  return db.platformEarning.upsert({
    where: { storeWithdrawalId },
    create: {
      id: crypto.randomUUID(),
      storeWithdrawalId,
      storeId,
      periodFrom,
      periodTo,
      calendarMonth,
      ...decimalAmounts,
      breakdown: (effectiveBreakdown ?? {}) as object,
      approvedAt,
      settlementId: null,
    },
    update: {
      ...decimalAmounts,
      breakdown: (effectiveBreakdown ?? {}) as object,
      calendarMonth,
      approvedAt,
    },
  });
}

export type MonthlyEarningsStatus = 'OPEN' | 'SETTLED' | 'SETTLED_WITH_PENDING';

export type MonthlyEarningsSummaryRow = {
  calendarMonth: string;
  totalCommission: number;
  totalConvenienceFee: number;
  totalEarned: number;
  payoutCount: number;
  pendingCount: number;
  pendingEarned: number;
  status: MonthlyEarningsStatus;
  settledAt: string | null;
  notes: string | null;
  canSettle: boolean;
};

export type PlatformPosition = {
  lifetimeEarned: number;
  availableToSettle: number;
  settledWithdrawn: number;
  totalPayoutsTracked: number;
};

export type MonthlyEarningsSummaryResponse = {
  months: MonthlyEarningsSummaryRow[];
  platformPosition: PlatformPosition;
};

export async function getMonthlyEarningsSummary(): Promise<MonthlyEarningsSummaryResponse> {
  await ensurePlatformEarningsSchema();

  const [grouped, settlements, pendingGroupedRaw, lifetimeAgg, unsettledAgg, settledAgg] =
    await Promise.all([
      prisma.platformEarning.groupBy({
        by: ['calendarMonth'],
        _sum: {
          commissionAmount: true,
          convenienceFeeAmount: true,
          totalEarned: true,
        },
        _count: { id: true },
        orderBy: { calendarMonth: 'desc' },
      }),
      prisma.platformMonthlySettlement.findMany(),
      prisma.platformEarning.groupBy({
        by: ['calendarMonth'],
        where: { settlementId: null } as Prisma.PlatformEarningWhereInput,
        _sum: { totalEarned: true },
        _count: { id: true },
      }),
      prisma.platformEarning.aggregate({
        _sum: { totalEarned: true },
        _count: { id: true },
      }),
      prisma.platformEarning.aggregate({
        where: { settlementId: null } as Prisma.PlatformEarningWhereInput,
        _sum: { totalEarned: true },
      }),
      prisma.platformEarning.aggregate({
        where: { settlementId: { not: null } } as Prisma.PlatformEarningWhereInput,
        _sum: { totalEarned: true },
      }),
    ]);

  const pendingGrouped = pendingGroupedRaw as PendingGroupRow[];

  const settlementMap = new Map(settlements.map((s) => [s.calendarMonth, s]));
  const pendingMap = new Map(pendingGrouped.map((p) => [p.calendarMonth, p]));

  const unsettledUpToMonth = new Map<string, number>();
  const sortedMonthsAsc = [...grouped].sort((a, b) =>
    a.calendarMonth.localeCompare(b.calendarMonth),
  );
  let runningUnsettled = 0;
  for (const row of sortedMonthsAsc) {
    runningUnsettled += pendingMap.get(row.calendarMonth)?._count.id ?? 0;
    unsettledUpToMonth.set(row.calendarMonth, runningUnsettled);
  }

  const months = grouped.map((row) => {
    const settlement = settlementMap.get(row.calendarMonth);
    const pending = pendingMap.get(row.calendarMonth);
    const pendingCount = pending?._count.id ?? 0;
    const pendingEarned = decimalFieldToCentsNumber(pending?._sum.totalEarned);
    const hasSettlement = settlement?.status === 'SETTLED';

    let status: MonthlyEarningsStatus = 'OPEN';
    if (hasSettlement && pendingCount > 0) {
      status = 'SETTLED_WITH_PENDING';
    } else if (hasSettlement) {
      status = 'SETTLED';
    }

    const unsettledUpTo = unsettledUpToMonth.get(row.calendarMonth) ?? 0;

    return {
      calendarMonth: row.calendarMonth,
      totalCommission: decimalFieldToCentsNumber(row._sum.commissionAmount),
      totalConvenienceFee: decimalFieldToCentsNumber(row._sum.convenienceFeeAmount),
      totalEarned: decimalFieldToCentsNumber(row._sum.totalEarned),
      payoutCount: row._count.id,
      pendingCount,
      pendingEarned,
      status,
      settledAt: settlement?.settledAt?.toISOString() ?? null,
      notes: settlement?.notes ?? null,
      canSettle: unsettledUpTo > 0 && !hasSettlement,
    };
  });

  return {
    months,
    platformPosition: {
      lifetimeEarned: decimalFieldToCentsNumber(lifetimeAgg._sum.totalEarned),
      availableToSettle: decimalFieldToCentsNumber(unsettledAgg._sum.totalEarned),
      settledWithdrawn: decimalFieldToCentsNumber(settledAgg._sum.totalEarned),
      totalPayoutsTracked: lifetimeAgg._count.id,
    },
  };
}

export type MonthlyEarningsLineItem = {
  id: string;
  storeId: string;
  storeName: string;
  storeWithdrawalId: string;
  payoutLabel: string;
  payoutSequence: number;
  periodFrom: string | null;
  periodTo: string | null;
  commissionAmount: number;
  convenienceFeeAmount: number;
  platformPaybackAmount: number;
  totalEarned: number;
  approvedAt: string;
  breakdown: unknown;
  calendarMonth: string;
  settlementStatus: 'unsettled' | 'settled';
  carriedForward: boolean;
};

export type BranchEarningsGroup = {
  storeId: string;
  storeName: string;
  branchLabel: string;
  payoutCount: number;
  commissionAmount: number;
  convenienceFeeAmount: number;
  totalEarned: number;
  items: MonthlyEarningsLineItem[];
};

export type MonthlyEarningsBreakdown = {
  calendarMonth: string;
  items: MonthlyEarningsLineItem[];
  branches: BranchEarningsGroup[];
  totals: {
    totalCommission: number;
    totalConvenienceFee: number;
    totalEarned: number;
    payoutCount: number;
  };
  settlement: {
    status: MonthlyEarningsStatus;
    settledAt: string | null;
    notes: string | null;
  };
};

function formatBranchLabel(storeName: string): string {
  return storeName.replace(/^Bing Chun\s*-\s*/i, '').trim() || storeName;
}

type EarningWithStore = {
  id: string;
  storeId: string;
  storeWithdrawalId: string;
  periodFrom: Date | null;
  periodTo: Date | null;
  calendarMonth: string;
  commissionAmount: Prisma.Decimal;
  convenienceFeeAmount: Prisma.Decimal;
  platformPaybackAmount: Prisma.Decimal;
  totalEarned: Prisma.Decimal;
  approvedAt: Date;
  breakdown: unknown;
  settlementId?: string | null;
  store: { id: string; name: string };
};

type PendingGroupRow = {
  calendarMonth: string;
  _sum: { totalEarned: Prisma.Decimal | null };
  _count: { id: number };
};

function buildLineItemsFromEarnings(
  earnings: EarningWithStore[],
  targetMonth: string,
): MonthlyEarningsLineItem[] {
  const storePayoutIndex = new Map<string, number>();

  return earnings.map((earning) => {
    const sequence = (storePayoutIndex.get(earning.storeId) ?? 0) + 1;
    storePayoutIndex.set(earning.storeId, sequence);
    const branchLabel = formatBranchLabel(earning.store.name);

    return {
      id: earning.id,
      storeId: earning.storeId,
      storeName: earning.store.name,
      storeWithdrawalId: earning.storeWithdrawalId,
      payoutLabel: `${branchLabel} Branch — Payout #${sequence}`,
      payoutSequence: sequence,
      periodFrom: earning.periodFrom?.toISOString() ?? null,
      periodTo: earning.periodTo?.toISOString() ?? null,
      commissionAmount: decimalFieldToCentsNumber(earning.commissionAmount),
      convenienceFeeAmount: decimalFieldToCentsNumber(earning.convenienceFeeAmount),
      platformPaybackAmount: decimalFieldToCentsNumber(earning.platformPaybackAmount),
      totalEarned: decimalFieldToCentsNumber(earning.totalEarned),
      approvedAt: earning.approvedAt.toISOString(),
      breakdown: earning.breakdown,
      calendarMonth: earning.calendarMonth,
      settlementStatus: earning.settlementId ? 'settled' : 'unsettled',
      carriedForward: earning.calendarMonth < targetMonth,
    };
  });
}

function buildBranchGroups(items: MonthlyEarningsLineItem[]): BranchEarningsGroup[] {
  const branchMap = new Map<string, BranchEarningsGroup>();

  for (const item of items) {
    const branchLabel = formatBranchLabel(item.storeName);
    const existing = branchMap.get(item.storeId);
    if (existing) {
      existing.payoutCount += 1;
      existing.commissionAmount += item.commissionAmount;
      existing.convenienceFeeAmount += item.convenienceFeeAmount;
      existing.totalEarned += item.totalEarned;
      existing.items.push(item);
    } else {
      branchMap.set(item.storeId, {
        storeId: item.storeId,
        storeName: item.storeName,
        branchLabel,
        payoutCount: 1,
        commissionAmount: item.commissionAmount,
        convenienceFeeAmount: item.convenienceFeeAmount,
        totalEarned: item.totalEarned,
        items: [item],
      });
    }
  }

  return Array.from(branchMap.values());
}

function deriveMonthStatus(
  settlement: { status: string; settledAt: Date | null; notes: string | null } | null | undefined,
  pendingCount: number,
): MonthlyEarningsStatus {
  const hasSettlement = settlement?.status === 'SETTLED';
  if (hasSettlement && pendingCount > 0) return 'SETTLED_WITH_PENDING';
  if (hasSettlement) return 'SETTLED';
  return 'OPEN';
}

export async function getMonthlyEarningsBreakdown(
  calendarMonth: string,
): Promise<MonthlyEarningsBreakdown> {
  await ensurePlatformEarningsSchema();

  const [earnings, settlement, pendingCount] = await Promise.all([
    prisma.platformEarning.findMany({
      where: { calendarMonth },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ storeId: 'asc' }, { approvedAt: 'asc' }],
    }),
    prisma.platformMonthlySettlement.findUnique({ where: { calendarMonth } }),
    prisma.platformEarning.count({
      where: { calendarMonth, settlementId: null } as Prisma.PlatformEarningWhereInput,
    }),
  ]);

  const items = buildLineItemsFromEarnings(earnings as EarningWithStore[], calendarMonth);
  const branches = buildBranchGroups(items);

  const totals = {
    totalCommission: items.reduce((sum, item) => sum + item.commissionAmount, 0),
    totalConvenienceFee: items.reduce((sum, item) => sum + item.convenienceFeeAmount, 0),
    totalEarned: items.reduce((sum, item) => sum + item.totalEarned, 0),
    payoutCount: items.length,
  };

  return {
    calendarMonth,
    items,
    branches,
    totals,
    settlement: {
      status: deriveMonthStatus(settlement, pendingCount),
      settledAt: settlement?.settledAt?.toISOString() ?? null,
      notes: settlement?.notes ?? null,
    },
  };
}

export type SettlementPreview = {
  calendarMonth: string;
  currentMonthItems: MonthlyEarningsLineItem[];
  carriedForwardItems: MonthlyEarningsLineItem[];
  items: MonthlyEarningsLineItem[];
  branches: BranchEarningsGroup[];
  totals: {
    totalCommission: number;
    totalConvenienceFee: number;
    totalEarned: number;
    payoutCount: number;
  };
};

export async function getSettlementPreview(calendarMonth: string): Promise<SettlementPreview> {
  await ensurePlatformEarningsSchema();

  const earnings = await prisma.platformEarning.findMany({
    where: {
      settlementId: null,
      calendarMonth: { lte: calendarMonth },
    } as Prisma.PlatformEarningWhereInput,
    include: { store: { select: { id: true, name: true } } },
    orderBy: [{ calendarMonth: 'asc' }, { storeId: 'asc' }, { approvedAt: 'asc' }],
  });

  const items = buildLineItemsFromEarnings(earnings as EarningWithStore[], calendarMonth);
  const currentMonthItems = items.filter((item) => item.calendarMonth === calendarMonth);
  const carriedForwardItems = items.filter((item) => item.carriedForward);
  const branches = buildBranchGroups(items);

  const totals = {
    totalCommission: items.reduce((sum, item) => sum + item.commissionAmount, 0),
    totalConvenienceFee: items.reduce((sum, item) => sum + item.convenienceFeeAmount, 0),
    totalEarned: items.reduce((sum, item) => sum + item.totalEarned, 0),
    payoutCount: items.length,
  };

  return {
    calendarMonth,
    currentMonthItems,
    carriedForwardItems,
    items,
    branches,
    totals,
  };
}

export async function settleMonth(calendarMonth: string, adminId: string, notes?: string) {
  await ensurePlatformEarningsSchema();

  const existing = await prisma.platformMonthlySettlement.findUnique({ where: { calendarMonth } });
  if (existing?.status === 'SETTLED') {
    throw new AppError('This month has already been settled', 400);
  }

  const preview = await getSettlementPreview(calendarMonth);
  if (preview.items.length === 0) {
    throw new AppError('No platform earnings found for this month', 404);
  }

  const earningIds = preview.items.map((item) => item.id);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const settlement = await tx.platformMonthlySettlement.upsert({
      where: { calendarMonth },
      create: {
        id: crypto.randomUUID(),
        calendarMonth,
        totalCommission: centsToDecimal(preview.totals.totalCommission),
        totalConvenienceFee: centsToDecimal(preview.totals.totalConvenienceFee),
        totalEarned: centsToDecimal(preview.totals.totalEarned),
        status: 'SETTLED',
        settledAt: now,
        settledByAdminId: adminId,
        notes: notes?.trim() || null,
      },
      update: {
        totalCommission: centsToDecimal(preview.totals.totalCommission),
        totalConvenienceFee: centsToDecimal(preview.totals.totalConvenienceFee),
        totalEarned: centsToDecimal(preview.totals.totalEarned),
        status: 'SETTLED',
        settledAt: now,
        settledByAdminId: adminId,
        notes: notes?.trim() || null,
      },
    });

    await tx.platformEarning.updateMany({
      where: { id: { in: earningIds } },
      data: { settlementId: settlement.id } as Prisma.PlatformEarningUpdateManyMutationInput,
    });

    return settlement;
  });
}
