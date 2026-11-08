import { prisma } from './prisma';
import {
  accumulateSettlementBreakdown,
  buildSlabInfo,
  sumBreakdownCommission,
  sumBreakdownOrderCount,
  sumBreakdownProviderFee,
  sumCommissionableBase,
  getSlabIndex,
  serializeCommissionSlabsForApi,
  DEFAULT_COMMISSION_SLABS,
  type ChannelSettlementRow,
  type CommissionChannel,
  type CommissionSlab,
  type SlabInfo,
} from './commission';
import { getCommissionSlabs, getConvenienceFeeRates, getGatewayFeeRate } from './appSchema';
import { periodActivePaidOrdersWhere } from './walletRevenue';

const PAID_ORDER_SELECT = {
  subtotal: true,
  discount: true,
  loyaltyDiscount: true,
  convenientFee: true,
  deliveryFee: true,
  total: true,
  orderMode: true,
  paymentMethod: true,
  createdAt: true,
} as const;

export type PeriodChannelPreview = {
  period: { from: string; to: string };
  breakdown: Record<CommissionChannel, ChannelSettlementRow>;
  totalCommission: number;
  totalProviderFee: number;
  orderCount: number;
  /** Sum of promo + loyalty discounts on paid orders in period (invoice display only). */
  storeDiscountsTotal: number;
  slabInfo: Pick<SlabInfo, 'monthlyBase' | 'effectiveRate' | 'slabIndex'> & {
    slabs: ReturnType<typeof serializeCommissionSlabsForApi>;
  };
};

async function fetchPaidOrdersInRange(storeId: string, from: string, to: string) {
  return prisma.order.findMany({
    where: periodActivePaidOrdersWhere(storeId, from, to),
    select: PAID_ORDER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

export async function buildPeriodChannelPreview(
  storeId: string,
  from: string,
  to: string,
): Promise<PeriodChannelPreview> {
  const orders = await fetchPaidOrdersInRange(storeId, from, to);
  const [convenienceFeeRates, gatewayFeeRate, commissionSlabs] = await Promise.all([
    getConvenienceFeeRates(),
    getGatewayFeeRate(),
    getCommissionSlabs(),
  ]);
  const windowBase = sumCommissionableBase(orders);
  const breakdown = accumulateSettlementBreakdown(
    orders,
    windowBase,
    convenienceFeeRates,
    gatewayFeeRate,
    commissionSlabs,
  );
  const slabInfo = buildSlabInfo(windowBase, commissionSlabs);

  return {
    period: { from, to },
    breakdown,
    totalCommission: sumBreakdownCommission(breakdown),
    totalProviderFee: sumBreakdownProviderFee(breakdown),
    orderCount: sumBreakdownOrderCount(breakdown),
    storeDiscountsTotal: orders.reduce(
      (sum, o) => sum + (o.discount ?? 0) + (o.loyaltyDiscount ?? 0),
      0,
    ),
    slabInfo: {
      monthlyBase: slabInfo.monthlyBase,
      effectiveRate: slabInfo.effectiveRate,
      slabIndex: slabInfo.slabIndex,
      slabs: serializeCommissionSlabsForApi(commissionSlabs),
    },
  };
}

export function channelPreviewFromPeriodBreakdown(
  period: {
    channelBreakdown: Record<CommissionChannel, ChannelSettlementRow>;
    windowBase: number;
    commissionRate: number;
    periodDiscountsTotal: number;
    orderCount: number;
    commissionSlabs?: readonly CommissionSlab[];
    cycleStage?: string;
    cycleFrom?: string;
    cycleTo?: string;
  },
  windowFrom: string,
  windowTo: string,
): PeriodChannelPreview {
  const breakdown = period.channelBreakdown;
  const monthlyBaseLkr = period.windowBase / 100;
  const slabs = period.commissionSlabs ?? DEFAULT_COMMISSION_SLABS;
  const from =
    period.cycleStage === 'SECOND' && period.cycleFrom ? period.cycleFrom : windowFrom;
  const to = period.cycleTo ?? windowTo;
  return {
    period: { from, to },
    breakdown,
    totalCommission: sumBreakdownCommission(breakdown),
    totalProviderFee: sumBreakdownProviderFee(breakdown),
    orderCount: period.orderCount,
    storeDiscountsTotal: period.periodDiscountsTotal / 100,
    slabInfo: {
      monthlyBase: monthlyBaseLkr,
      effectiveRate: period.commissionRate,
      slabIndex: getSlabIndex(monthlyBaseLkr, slabs),
      slabs: serializeCommissionSlabsForApi(slabs),
    },
  };
}
