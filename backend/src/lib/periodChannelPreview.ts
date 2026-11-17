import { prisma } from './prisma';
import {
  accumulateSettlementBreakdown,
  buildSlabInfo,
  sumBreakdownCommission,
  sumBreakdownOrderCount,
  sumBreakdownProviderFee,
  sumCommissionableBase,
  type ChannelSettlementRow,
  type CommissionChannel,
  type SlabInfo,
} from './commission';
import { getConvenienceFeeRates, getGatewayFeeRate } from './appSchema';
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
  slabInfo: Pick<SlabInfo, 'monthlyBase' | 'effectiveRate' | 'slabIndex'>;
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
  const [convenienceFeeRates, gatewayFeeRate] = await Promise.all([
    getConvenienceFeeRates(),
    getGatewayFeeRate(),
  ]);
  const windowBase = sumCommissionableBase(orders);
  const breakdown = accumulateSettlementBreakdown(
    orders,
    windowBase,
    convenienceFeeRates,
    gatewayFeeRate,
  );
  const slabInfo = buildSlabInfo(windowBase);

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
    },
  };
}
