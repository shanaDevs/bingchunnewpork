import type { CommissionChannel, SlabInfo } from '@/components/admin/commissionUtils';
import { formatMoneyAmount } from '@/lib/receipt';

import { LKR_EPSILON } from './lkrUtils';
import type { SettlementPreview } from './settlementModels';

export type ChannelSettlementRow = {
  revenueSubtotal: number;
  commission: number;
  rate: number;
  orderCount: number;
  transactionTotal: number;
  providerFee: number;
  providerFeeRate: number;
  convenientFeeTotal?: number;
  convenienceFeeBaseTotal?: number;
  deliveryFeeTotal?: number;
  grossSalesTotal?: number;
  subtotalBeforeDiscount?: number;
  discountTotal?: number;
  payhereTotal?: number;
  payhereRevenueSubtotal?: number;
  payhereDeliveryFee?: number;
  payhereConvenienceFee?: number;
  cardTotal?: number;
  loyaltyPointsTotal?: number;
};

export type SettlementBreakdown = Record<CommissionChannel, ChannelSettlementRow>;

export const SETTLEMENT_CHANNELS: Array<{ key: CommissionChannel; label: string }> = [
  { key: 'pickupCash', label: 'Pickup Cash' },
  { key: 'pickupCard', label: 'Pickup Card' },
  { key: 'pickupOnline', label: 'Pickup Online' },
  { key: 'deliveryOnline', label: 'Delivery Online' },
];

const ONLINE_PROVIDER_FEE_RATE = 0.019;

export function emptyChannelSettlementRow(rate = 0): ChannelSettlementRow {
  return {
    revenueSubtotal: 0,
    commission: 0,
    rate,
    orderCount: 0,
    transactionTotal: 0,
    providerFee: 0,
    providerFeeRate: ONLINE_PROVIDER_FEE_RATE,
    convenientFeeTotal: 0,
    convenienceFeeBaseTotal: 0,
    deliveryFeeTotal: 0,
    grossSalesTotal: 0,
    subtotalBeforeDiscount: 0,
    discountTotal: 0,
    payhereTotal: 0,
    payhereRevenueSubtotal: 0,
    payhereDeliveryFee: 0,
    payhereConvenienceFee: 0,
    cardTotal: 0,
    loyaltyPointsTotal: 0,
  };
}

export function emptySettlementBreakdown(): SettlementBreakdown {
  return {
    pickupCash: emptyChannelSettlementRow(),
    pickupCard: emptyChannelSettlementRow(),
    pickupOnline: emptyChannelSettlementRow(),
    deliveryOnline: emptyChannelSettlementRow(),
  };
}

/** Merge stored JSON breakdown with empty defaults for missing channels/fields. */
export function normalizeSettlementBreakdown(value: unknown): SettlementBreakdown {
  const empty = emptySettlementBreakdown();
  if (!value || typeof value !== 'object') return empty;

  const stored = value as Partial<Record<CommissionChannel, Partial<ChannelSettlementRow>>>;
  const result = { ...empty };

  for (const { key } of SETTLEMENT_CHANNELS) {
    const row = stored[key];
    if (row && typeof row === 'object') {
      result[key] = { ...empty[key], ...row };
    }
  }

  return result;
}

/** Sum per-channel commission from a stored channel snapshot (LKR). */
export function sumChannelBreakdownCommission(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].commission ?? 0),
    0,
  );
}

export function sumChannelBreakdownOrderCount(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].orderCount ?? 0),
    0,
  );
}

export function channelBreakdownHasSalesActivity(breakdown: SettlementBreakdown): boolean {
  if (sumChannelBreakdownOrderCount(breakdown) > 0) return true;
  return sumChannelRevenueSubtotals(breakdown) > LKR_EPSILON;
}

/** Build a SettlementPreview from stored channelBreakdown for display-only use. */
export function buildSettlementPreviewFromChannelBreakdown(
  channelBreakdown: SettlementBreakdown,
  opts: {
    from: string;
    to: string;
    commissionRate?: number;
    orderCount?: number;
    slabInfo?: SlabInfo;
    gatewayFeeLkr?: number;
  },
): SettlementPreview {
  const totalCommission = sumChannelBreakdownCommission(channelBreakdown);
  const summedOrderCount = sumChannelBreakdownOrderCount(channelBreakdown);
  const orderCount =
    opts.orderCount != null && opts.orderCount > 0 ? opts.orderCount : summedOrderCount;
  const effectiveRate = opts.commissionRate ?? channelBreakdown.pickupCash.rate ?? 0;

  return {
    period: { from: opts.from, to: opts.to },
    breakdown: channelBreakdown,
    totalCommission,
    totalProviderFee: opts.gatewayFeeLkr ?? 0,
    totalOwed: totalCommission,
    orderCount,
    slabInfo: opts.slabInfo ?? {
      monthlyBase: 0,
      effectiveRate,
      slabIndex: 0,
    },
  };
}

export function sumAllDiscounts(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].discountTotal ?? 0),
    0,
  );
}

/** Sum per-channel revenue subtotals after discount (LKR). */
export function sumChannelRevenueSubtotals(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].revenueSubtotal ?? 0),
    0,
  );
}

/** Gross sales across all channels from a settlement preview (LKR). */
export function sumAllRevenueSubtotal(preview: SettlementPreview): number {
  return sumChannelRevenueSubtotals(preview.breakdown);
}

/** Sum convenience fees from a settlement preview when breakdown LKR is unavailable. */
export function resolvePreviewConvenienceFeeLkr(
  preview: SettlementPreview | null | undefined,
  fallbackLkr = 0,
): number {
  if (!preview) return fallbackLkr;
  return sumChannelConvenienceFees(preview.breakdown);
}

/** Sum per-channel convenience fees (LKR). */
export function sumChannelConvenienceFees(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].convenientFeeTotal ?? 0),
    0,
  );
}

/** Delivery fee shown in Sales by channel — delivery online row only (LKR). */
export function resolveChannelDeliveryFeeLkr(breakdown: SettlementBreakdown | null | undefined): number {
  if (!breakdown) return 0;
  return breakdown.deliveryOnline.deliveryFeeTotal ?? 0;
}

/**
 * Period online revenue subtotals only (pickup cash/card, convenience, delivery fees excluded).
 * Initiate Payout “Available to withdraw” uses wallet all-time balance (online − branch receivable).
 */
export function computeAvailableToWithdrawFromChannelBreakdown(
  breakdown: SettlementBreakdown,
): number {
  return sumOnlineRevenueSubtotals(breakdown);
}

/** Delivery fee for the selected payout period — channel preview when available. */
export function resolvePeriodDeliveryFeeLkr(params: {
  channelBreakdown?: SettlementBreakdown | null;
  periodDeliveryFeeLkr?: number;
}): number {
  if (params.channelBreakdown) {
    return resolveChannelDeliveryFeeLkr(params.channelBreakdown);
  }
  return params.periodDeliveryFeeLkr ?? 0;
}

/** Late-cancel plus rejected retained refund convenience fees (LKR). */
export function resolveTotalRetainedRefundConvenienceFeeLkr(params: {
  refundConvenienceFeeLkr?: number;
  rejectedRefundConvenienceFeeLkr?: number;
}): number {
  return (params.refundConvenienceFeeLkr ?? 0) + (params.rejectedRefundConvenienceFeeLkr ?? 0);
}

/** Late-cancel plus rejected retained refund delivery fees (LKR). */
export function resolveTotalRetainedRefundDeliveryFeeLkr(params: {
  refundDeliveryFeeLkr?: number;
  rejectedRefundDeliveryFeeLkr?: number;
}): number {
  return (params.refundDeliveryFeeLkr ?? 0) + (params.rejectedRefundDeliveryFeeLkr ?? 0);
}

/** Delivery rider share: active-order delivery plus all retained refund delivery fees (LKR). */
export function resolveTotalDeliveryFeeForAllocationLkr(params: {
  periodDeliveryFeeLkr?: number;
  refundDeliveryFeeLkr?: number;
  rejectedRefundDeliveryFeeLkr?: number;
}): number {
  return (
    (params.periodDeliveryFeeLkr ?? 0) +
    resolveTotalRetainedRefundDeliveryFeeLkr(params)
  );
}

export function sumAllSubtotalBeforeDiscount(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) =>
      sum + (breakdown[key].subtotalBeforeDiscount ?? breakdown[key].revenueSubtotal),
    0,
  );
}

export function sumChannelGrossSales(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].grossSalesTotal ?? 0),
    0,
  );
}

export function sumOfflineGrossSales(breakdown: SettlementBreakdown): number {
  return (
    (breakdown.pickupCash.grossSalesTotal ?? 0) + (breakdown.pickupCard.grossSalesTotal ?? 0)
  );
}

export function sumOnlineGrossSales(breakdown: SettlementBreakdown): number {
  return (
    (breakdown.pickupOnline.grossSalesTotal ?? 0) +
    (breakdown.deliveryOnline.grossSalesTotal ?? 0)
  );
}

/** PayHere wallet inflow — pickup online & delivery online order totals. */
export function sumOnlinePaymentsCollected(breakdown: SettlementBreakdown): number {
  return (
    (breakdown.pickupOnline.payhereTotal ?? 0) + (breakdown.deliveryOnline.payhereTotal ?? 0)
  );
}

export function resolveOnlinePaymentsCollectedChannelAmounts(
  breakdown: SettlementBreakdown,
): { pickupOnlineLkr: number; deliveryOnlineLkr: number } {
  return {
    pickupOnlineLkr: breakdown.pickupOnline.payhereTotal ?? 0,
    deliveryOnlineLkr: breakdown.deliveryOnline.payhereTotal ?? 0,
  };
}

export type OnlinePaymentsCollectedComponents = {
  pickupRevenueLkr: number;
  deliveryRevenueLkr: number;
  revenueSubtotalLkr: number;
  deliveryFeeLkr: number;
  convenienceFeeLkr: number;
  totalLkr: number;
};

export function resolveOnlinePaymentsCollectedComponents(
  breakdown: SettlementBreakdown,
): OnlinePaymentsCollectedComponents {
  const pickup = breakdown.pickupOnline;
  const delivery = breakdown.deliveryOnline;
  // Same item net the Classic table shows. Card and loyalty delivery orders
  // sit in Delivery Online and must be included. Fees stay out of the sum.
  const pickupRevenueLkr = pickup.revenueSubtotal ?? 0;
  const deliveryRevenueLkr = delivery.revenueSubtotal ?? 0;
  const deliveryFeeLkr = delivery.deliveryFeeTotal ?? 0;
  const convenienceFeeLkr =
    (pickup.convenientFeeTotal ?? 0) + (delivery.convenientFeeTotal ?? 0);
  const revenueSubtotalLkr = pickupRevenueLkr + deliveryRevenueLkr;

  return {
    pickupRevenueLkr,
    deliveryRevenueLkr,
    revenueSubtotalLkr,
    deliveryFeeLkr,
    convenienceFeeLkr,
    totalLkr: revenueSubtotalLkr,
  };
}

export function formatOnlinePaymentsCollectedHint(
  components: OnlinePaymentsCollectedComponents,
): string {
  const amt = formatMoneyAmount;
  return `(Pickup online ${amt(components.pickupRevenueLkr)} + Delivery online ${amt(components.deliveryRevenueLkr)})`;
}

/** Pickup online + delivery online subtotal before discounts (Payout 1 channel table Subtotal column). */
export function sumOnlineSubtotalBeforeDiscount(breakdown: SettlementBreakdown): number {
  const pickup = breakdown.pickupOnline;
  const delivery = breakdown.deliveryOnline;
  return (
    (pickup.subtotalBeforeDiscount ?? pickup.revenueSubtotal ?? 0) +
    (delivery.subtotalBeforeDiscount ?? delivery.revenueSubtotal ?? 0)
  );
}

export function resolveFirstPayoutOnlineSubtotalComponents(
  breakdown: SettlementBreakdown,
): { pickupSubtotalLkr: number; deliverySubtotalLkr: number; totalLkr: number } {
  const components = resolveOnlinePaymentsCollectedComponents(breakdown);
  return {
    pickupSubtotalLkr: components.pickupRevenueLkr,
    deliverySubtotalLkr: components.deliveryRevenueLkr,
    totalLkr: components.revenueSubtotalLkr,
  };
}

/** Pickup online + delivery online revenue subtotals only (excludes delivery & convenience fees). */
export function sumOnlineRevenueSubtotals(breakdown: SettlementBreakdown): number {
  const components = resolveOnlinePaymentsCollectedComponents(breakdown);
  return components.revenueSubtotalLkr;
}