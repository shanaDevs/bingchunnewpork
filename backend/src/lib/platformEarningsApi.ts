import type {
  MonthlyEarningsBreakdown,
  MonthlyEarningsSummaryResponse,
  SettlementPreview,
} from './platformEarningsService';
import type { PlatformMonthlySettlement } from '@prisma/client';
import { centsNumberToApiString } from './moneyDecimal';
import { serializePlatformMonthlySettlement } from './walletApiMoney';

export function serializeMonthlyEarningsSummary(data: MonthlyEarningsSummaryResponse) {
  return {
    months: data.months.map((m) => ({
      ...m,
      totalCommission: centsNumberToApiString(m.totalCommission),
      totalConvenienceFee: centsNumberToApiString(m.totalConvenienceFee),
      totalEarned: centsNumberToApiString(m.totalEarned),
      pendingEarned: centsNumberToApiString(m.pendingEarned),
    })),
    platformPosition: {
      lifetimeEarned: centsNumberToApiString(data.platformPosition.lifetimeEarned),
      availableToSettle: centsNumberToApiString(data.platformPosition.availableToSettle),
      settledWithdrawn: centsNumberToApiString(data.platformPosition.settledWithdrawn),
      totalPayoutsTracked: data.platformPosition.totalPayoutsTracked,
    },
  };
}

function serializeLineItem(item: MonthlyEarningsBreakdown['items'][number]) {
  return {
    ...item,
    commissionAmount: centsNumberToApiString(item.commissionAmount),
    convenienceFeeAmount: centsNumberToApiString(item.convenienceFeeAmount),
    platformPaybackAmount: centsNumberToApiString(item.platformPaybackAmount),
    totalEarned: centsNumberToApiString(item.totalEarned),
  };
}

function serializeBranchGroup(b: MonthlyEarningsBreakdown['branches'][number]) {
  return {
    ...b,
    commissionAmount: centsNumberToApiString(b.commissionAmount),
    convenienceFeeAmount: centsNumberToApiString(b.convenienceFeeAmount),
    totalEarned: centsNumberToApiString(b.totalEarned),
    items: b.items.map(serializeLineItem),
  };
}

export function serializeMonthlyEarningsBreakdown(data: MonthlyEarningsBreakdown) {
  return {
    ...data,
    items: data.items.map(serializeLineItem),
    branches: data.branches.map(serializeBranchGroup),
    totals: {
      ...data.totals,
      totalCommission: centsNumberToApiString(data.totals.totalCommission),
      totalConvenienceFee: centsNumberToApiString(data.totals.totalConvenienceFee),
      totalEarned: centsNumberToApiString(data.totals.totalEarned),
    },
  };
}

export function serializeSettlementPreview(data: SettlementPreview) {
  return {
    ...data,
    currentMonthItems: data.currentMonthItems.map(serializeLineItem),
    carriedForwardItems: data.carriedForwardItems.map(serializeLineItem),
    items: data.items.map(serializeLineItem),
    branches: data.branches.map(serializeBranchGroup),
    totals: {
      ...data.totals,
      totalCommission: centsNumberToApiString(data.totals.totalCommission),
      totalConvenienceFee: centsNumberToApiString(data.totals.totalConvenienceFee),
      totalEarned: centsNumberToApiString(data.totals.totalEarned),
    },
  };
}

export function serializeSettledMonth(data: PlatformMonthlySettlement) {
  return serializePlatformMonthlySettlement(data);
}
