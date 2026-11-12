import {
  computePlatformProviderReceivableLkr,
  computePlatformProviderReceivableLkrFromBreakdownCents,
  type PlatformProviderReceivableLkr,
} from '@bingchun/settlement';
import { parseSharedPromoFromBreakdown } from './sharedPromoContribution';
import { prisma } from './prisma';
import {
  dartCodesReceivesLkrFromBreakdown,
  resolveStoredPlatformProviderReceivable,
} from './platformSettlementHelpers';
import {
  groupAllUnsettledWithdrawalsByStoreId,
  type WithdrawalForDartCodesSettlement,
} from './settlementWithdrawalQuery';
import { paybackEnabledFromBreakdown } from './breakdownPayback';

export type EnrichedApprovedWithdrawal = WithdrawalForDartCodesSettlement & {
  storeId: string;
  storeName: string;
  dartCodesReceives: number;
  platformProviderReceivable: Awaited<
    ReturnType<typeof resolveStoredPlatformProviderReceivable>
  >;
};

export function calendarMonthFromPeriodFrom(periodFrom: string | null): string | null {
  if (!periodFrom || periodFrom.length < 7) return null;
  return periodFrom.slice(0, 7);
}

export function formatCalendarMonthLabel(calendarMonth: string): string {
  const [y, m] = calendarMonth.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-LK', { month: 'long', year: 'numeric' });
}

/** Platform share of SHARED promos from a locked withdrawal breakdown (LKR, 2 dp). */
export function sharedPromoPlatformLkrFromBreakdown(breakdown: unknown): number {
  const cents = parseSharedPromoFromBreakdown(breakdown).sharedPromoPlatformContributionAmount;
  return Math.round(cents) / 100;
}

/** Sum platform SHARED-promo share across multiple locked breakdown snapshots (LKR). */
export function sumSharedPromoPlatformLkrFromBreakdowns(breakdowns: unknown[]): number {
  const totalCents = breakdowns.reduce<number>(
    (acc, b) =>
      acc + parseSharedPromoFromBreakdown(b).sharedPromoPlatformContributionAmount,
    0,
  );
  return Math.round(totalCents) / 100;
}

export function combinePlatformProviderReceivableLkr(
  periodLkrs: PlatformProviderReceivableLkr[],
  breakdowns: unknown[],
): PlatformProviderReceivableLkr {
  if (periodLkrs.length === 0) {
    return computePlatformProviderReceivableLkr({
      commissionFeeLkr: 0,
      gatewayRatePct: 1.9,
      paybackEnabled: false,
    });
  }

  const paybackEnabled = breakdowns.some((b) => paybackEnabledFromBreakdown(b));
  const gatewayRatePct = periodLkrs[0]?.gatewayRatePct ?? 1.9;

  const perPeriodLkrs = breakdowns.map((b) =>
    computePlatformProviderReceivableLkrFromBreakdownCents(
      (b ?? {}) as Parameters<typeof computePlatformProviderReceivableLkrFromBreakdownCents>[0],
    ),
  );

  const sum = (pick: (l: PlatformProviderReceivableLkr) => number) =>
    perPeriodLkrs.reduce((acc, l) => acc + pick(l), 0);

  return computePlatformProviderReceivableLkr({
    commissionFeeLkr: sum((l) => l.commissionFeeLkr),
    platformPaybackLkr: sum((l) => l.platformPaybackLkr),
    loyaltyDiscountLkr: sum((l) => l.loyaltyDiscountLkr),
    sharedPromoPlatformLkr: sum((l) => l.sharedPromoPlatformLkr),
    normalConvenienceFeeLkr: sum((l) => l.normalConvenienceFeeLkr),
    completedRefundConvenienceFeeLkr: sum((l) => l.completedRefundConvenienceFeeLkr),
    rejectedRefundConvenienceFeeLkr: sum((l) => l.rejectedRefundConvenienceFeeLkr),
    gatewayRatePct,
    paybackEnabled,
  });
}

export async function loadEnrichedApprovedUnsettledWithdrawals(): Promise<
  EnrichedApprovedWithdrawal[]
> {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const byStore = await groupAllUnsettledWithdrawalsByStoreId();
  const rows: Array<{ storeId: string; withdrawal: WithdrawalForDartCodesSettlement }> = [];

  for (const [storeId, list] of byStore.entries()) {
    for (const w of list) {
      if (w.status === 'APPROVED' && w.periodFrom && w.periodTo) {
        rows.push({ storeId, withdrawal: w });
      }
    }
  }

  const firstIds = rows
    .filter(({ withdrawal: w }) => w.cycleStage === 'FIRST')
    .map(({ withdrawal: w }) => w.id);

  const completedFirstPairIds = new Set<string>();
  if (firstIds.length > 0) {
    const pairedSeconds = await prisma.storeWithdrawal.findMany({
      where: {
        cycleStage: 'SECOND',
        cyclePairId: { in: firstIds },
        status: 'APPROVED',
      },
      select: { cyclePairId: true },
    });
    for (const row of pairedSeconds) {
      if (row.cyclePairId) completedFirstPairIds.add(row.cyclePairId);
    }
  }

  const eligibleRows = rows.filter(({ withdrawal: w }) => {
    if (w.cycleStage === 'SECOND') return true;
    if (w.cycleStage === 'FIRST') return completedFirstPairIds.has(w.id);
    return true;
  });

  return Promise.all(
    eligibleRows.map(async ({ storeId, withdrawal: w }) => {
      const platformProviderReceivable = w.breakdown
        ? await resolveStoredPlatformProviderReceivable(w.breakdown)
        : await resolveStoredPlatformProviderReceivable({});
      return {
        ...w,
        storeId,
        storeName: storeNameById.get(storeId) ?? 'Unknown',
        dartCodesReceives: dartCodesReceivesLkrFromBreakdown(platformProviderReceivable),
        platformProviderReceivable,
      };
    }),
  );
}
