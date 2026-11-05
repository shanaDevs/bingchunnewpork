import { isCardPaymentMethod, isCounterCashPaymentMethod } from './walletRevenue';

/** Default delivery convenience fee rate when resolving legacy orders missing stored `convenientFee`. */
export const DEFAULT_CONVENIENCE_FEE_RATE = 0.075;

/** Default pickup convenience fee rate for legacy fallbacks. */
export const DEFAULT_PICKUP_CONVENIENCE_FEE_RATE = 0.06;

export type ConvenienceFeeRates = {
  pickup: number;
  delivery: number;
};

/** Payment gateway fee for online orders and net transferable wallet earnings (default 1.9%, DB-configurable). */
export const GATEWAY_FEE_RATE = 0.019;

/** Used in commission settlement breakdown (audit display for online channels). */
export const ONLINE_PROVIDER_FEE_RATE = GATEWAY_FEE_RATE;

/** Rolling payout window slab tiers — rate applies to period commissionable base (excludes delivery & convenience fees). */
export const DEFAULT_COMMISSION_SLABS = [
  { upTo: 1_000_000, rate: 0.065, label: 'Up to LKR 1,000,000' },
  { upTo: Infinity, rate: 0.05, label: 'Above LKR 1,000,000' },
] as const;

/** @deprecated Use DEFAULT_COMMISSION_SLABS or getCommissionSlabs() */
export const COMMISSION_SLABS = DEFAULT_COMMISSION_SLABS;

export type CommissionSlab = {
  upTo: number;
  rate: number;
  label: string;
};

export function normalizeCommissionSlabs(
  input: readonly { upTo: number; rate: number; label?: string }[] | null | undefined,
): readonly CommissionSlab[] {
  if (!input?.length) return DEFAULT_COMMISSION_SLABS;
  const sorted = [...input].sort((a, b) => a.upTo - b.upTo);
  return sorted.map((row, index) => ({
    upTo: row.upTo,
    rate: row.rate,
    label:
      row.label ??
      (Number.isFinite(row.upTo) && row.upTo < Infinity
        ? index === 0
          ? `Up to LKR ${row.upTo.toLocaleString('en-LK')}`
          : `Above LKR ${sorted[index - 1]?.upTo.toLocaleString('en-LK')}`
        : `Above LKR ${sorted[index - 1]?.upTo.toLocaleString('en-LK')}`),
  }));
}

export type CommissionChannel = 'pickupCash' | 'pickupCard' | 'pickupOnline' | 'deliveryOnline';

export type SlabInfo = {
  /** Period commissionable gross sales used to determine slab (excludes delivery & convenience fees). */
  monthlyBase: number;
  effectiveRate: number;
  slabIndex: number;
  slabs: readonly CommissionSlab[];
};

export type PeriodSlabInfo = SlabInfo & { period: string };

/** @deprecated Use PeriodSlabInfo */
export type MonthlySlabInfo = PeriodSlabInfo & { month: string };

type CommissionOrderFields = {
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
  orderMode: string;
  paymentMethod: string;
};

type SettlementOrderFields = CommissionOrderFields & {
  total: number;
  convenientFee?: number;
  deliveryFee?: number;
  createdAt: Date | string;
};

export function commissionableSubtotal(order: {
  subtotal: number;
  discount?: number;
  loyaltyDiscount?: number;
}): number {
  return Math.max(0, order.subtotal - (order.discount ?? 0) - (order.loyaltyDiscount ?? 0));
}

/**
 * Customer convenience fee from the order row (`convenientFee` column).
 * Does not recalculate from rates — payout math always uses the stored amount.
 */
export function resolveOrderConvenienceFeeLkr(
  order: {
    subtotal?: number;
    discount?: number;
    loyaltyDiscount?: number;
    convenientFee?: number;
    orderMode?: string;
    paymentMethod?: string;
  },
  _feeRates?: ConvenienceFeeRates | number,
): number {
  const stored = order.convenientFee ?? 0;
  return stored > 0 ? stored : 0;
}

export type PayHereOrderComponents = {
  revenueSubtotal: number;
  deliveryFee: number;
  convenienceFee: number;
  total: number;
};

/** PayHere collected amount: items + delivery + convenience when paid via PayHere (LKR). */
export function resolvePayHereOrderComponents(
  order: {
    subtotal: number;
    discount?: number;
    loyaltyDiscount?: number;
    convenientFee?: number;
    deliveryFee?: number;
    total: number;
    orderMode: string;
    paymentMethod: string;
  },
  convenienceFeeRates: ConvenienceFeeRates | number = DEFAULT_CONVENIENCE_FEE_RATE,
): PayHereOrderComponents | null {
  if (!qualifiesForPayHereGatewayFee(order.orderMode, order.paymentMethod)) {
    return null;
  }
  const revenueSubtotal = commissionableSubtotal(order);
  const deliveryFee = order.orderMode === 'DELIVERY' ? (order.deliveryFee ?? 0) : 0;
  const convenienceFee = order.convenientFee ?? 0;
  const componentTotal = revenueSubtotal + deliveryFee + convenienceFee;
  const total = Math.max(order.total, componentTotal);
  return { revenueSubtotal, deliveryFee, convenienceFee, total };
}

export function getSlabIndex(
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): number {
  for (let i = 0; i < slabs.length; i++) {
    if (monthlyBase <= slabs[i].upTo) return i;
  }
  return slabs.length - 1;
}

export function getEffectiveRate(
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): number {
  return slabs[getSlabIndex(monthlyBase, slabs)].rate;
}

export function buildSlabInfo(
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): SlabInfo {
  const slabIndex = getSlabIndex(monthlyBase, slabs);
  return {
    monthlyBase,
    effectiveRate: slabs[slabIndex].rate,
    slabIndex,
    slabs,
  };
}

export function monthKeyFromDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T12:00:00.000Z`) : date;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Calendar half-month period key: YYYY-MM-P1 (1–15) or YYYY-MM-P2 (16–EOM). */
export function periodKeyFromDate(date: Date | string): string {
  const dateStr =
    typeof date === 'string'
      ? date.slice(0, 10)
      : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const month = dateStr.slice(0, 7);
  const day = Number(dateStr.slice(8, 10));
  return `${month}-P${day <= 15 ? 1 : 2}`;
}

export function storePeriodKey(storeId: string, date: Date | string): string {
  return `${storeId}|${periodKeyFromDate(date)}`;
}

/** @deprecated Use storePeriodKey */
export function storeMonthKey(storeId: string, date: Date | string): string {
  return storePeriodKey(storeId, date);
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getPeriodDateRange(periodKey: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})-P([12])$/.exec(periodKey);
  if (!match) throw new Error(`Invalid period key: ${periodKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const half = Number(match[3]);
  const monthStr = `${match[1]}-${match[2]}`;
  if (half === 1) {
    return { from: `${monthStr}-01`, to: `${monthStr}-15` };
  }
  const lastDay = lastDayOfMonth(year, month);
  return { from: `${monthStr}-16`, to: `${monthStr}-${String(lastDay).padStart(2, '0')}` };
}

export function periodsInRange(from: string, to: string): string[] {
  const periods: string[] = [];
  let cursor = periodKeyFromDate(from);
  const endKey = periodKeyFromDate(to);
  while (true) {
    periods.push(cursor);
    if (cursor === endKey) break;
    const { to: cursorEnd } = getPeriodDateRange(cursor);
    const nextStart = addDaysToDateStr(cursorEnd, 1);
    cursor = periodKeyFromDate(nextStart);
  }
  return periods;
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function buildPeriodBaseLookup(
  orders: Array<CommissionOrderFields & { createdAt: Date | string; storeId: string }>,
): Record<string, number> {
  const buckets = new Map<string, CommissionOrderFields[]>();
  for (const order of orders) {
    const key = storePeriodKey(order.storeId, order.createdAt);
    const list = buckets.get(key) ?? [];
    list.push(order);
    buckets.set(key, list);
  }
  const result: Record<string, number> = {};
  for (const [key, list] of buckets) {
    result[key] = sumCommissionableBase(list);
  }
  return result;
}

/** @deprecated Use buildPeriodBaseLookup */
export function buildMonthlyBaseLookup(
  orders: Array<CommissionOrderFields & { createdAt: Date | string; storeId: string }>,
): Record<string, number> {
  return buildPeriodBaseLookup(orders);
}

/** @deprecated Use periodsInRange */
export function monthsInRange(from: string, to: string): string[] {
  return periodsInRange(from, to);
}

export function computePlatformCommission(
  base: number,
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): number {
  return base * getEffectiveRate(monthlyBase, slabs);
}

/** Per-order commission in cents (half-up to nearest cent when stored). */
export function computePlatformCommissionCents(
  base: number,
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): number {
  return Math.round(computePlatformCommission(base, monthlyBase, slabs) * 100);
}

export function computeProviderFee(orderSubtotal: number, rate = GATEWAY_FEE_RATE): number {
  return Math.round(orderSubtotal * rate);
}

/** PayHere gateway fee applies to full transaction total on PayHere pickup online & delivery online orders. */
export function qualifiesForPayHereGatewayFee(orderMode: string, paymentMethod: string): boolean {
  if (paymentMethod !== 'PAYHERE') return false;
  const channel = orderCommissionChannel(orderMode, paymentMethod);
  return channel === 'pickupOnline' || channel === 'deliveryOnline';
}

export function computePayHereGatewayFeeCents(orderTotalLkr: number, rate = GATEWAY_FEE_RATE): number {
  return Math.round(orderTotalLkr * 100 * rate);
}

export function isOnlineProviderChannel(channel: CommissionChannel): boolean {
  return channel === 'pickupOnline' || channel === 'deliveryOnline';
}

export type OrderChannelHints = {
  /** Precomputed: CARD pickup was collected through an online gateway. */
  onlineCard?: boolean;
  paymentGateway?: string | null;
  paymentRef?: string | null;
};

/** Card pickup paid via PayHere/WebXPay. Counter card collection has neither gateway nor payment ref. */
export function takeawayCardPaidOnline(hints?: OrderChannelHints): boolean {
  if (!hints) return false;
  if (hints.onlineCard) return true;
  if (typeof hints.paymentGateway === 'string' && hints.paymentGateway.trim()) return true;
  if (typeof hints.paymentRef === 'string' && hints.paymentRef.trim()) return true;
  return false;
}

export function orderCommissionChannel(
  orderMode: string,
  paymentMethod: string,
  hints?: OrderChannelHints,
): CommissionChannel | null {
  if (orderMode === 'TAKEAWAY') {
    if (isCounterCashPaymentMethod(paymentMethod)) return 'pickupCash';
    if (paymentMethod === 'PAYHERE') return 'pickupOnline';
    if (paymentMethod === 'CARD') {
      return takeawayCardPaidOnline(hints) ? 'pickupOnline' : 'pickupCard';
    }
    if (paymentMethod === 'LOYALTY_POINTS') return 'pickupCard';
    return null;
  }
  if (orderMode === 'DELIVERY' && isCardPaymentMethod(paymentMethod)) {
    return 'deliveryOnline';
  }
  return null;
}

export function sumCommissionableBase(orders: CommissionOrderFields[]): number {
  let total = 0;
  for (const order of orders) {
    const channel = orderCommissionChannel(order.orderMode, order.paymentMethod);
    if (!channel) continue;
    total += commissionableSubtotal(order);
  }
  return total;
}

export type ChannelBreakdown = {
  revenueSubtotal: number;
  commission: number;
  rate: number;
  orderCount: number;
};

export type ChannelSettlementRow = ChannelBreakdown & {
  transactionTotal: number;
  providerFee: number;
  providerFeeRate: number;
  convenientFeeTotal: number;
  convenienceFeeBaseTotal: number;
  deliveryFeeTotal: number;
  grossSalesTotal: number;
  /** Sum of order.subtotal before promo/loyalty discounts (LKR). */
  subtotalBeforeDiscount: number;
  /** Sum of promo + loyalty discounts (LKR). */
  discountTotal: number;
  /** Full order.total collected via PayHere on this channel (LKR). */
  payhereTotal: number;
  /** PayHere portion — item subtotal after discounts (LKR). */
  payhereRevenueSubtotal: number;
  /** PayHere portion — delivery fees (LKR). */
  payhereDeliveryFee: number;
  /** PayHere portion — convenience fees (LKR). */
  payhereConvenienceFee: number;
  /** Full order.total collected via card on this channel (LKR). */
  cardTotal: number;
  /** Full order.total collected via loyalty points on this channel (LKR). */
  loyaltyPointsTotal: number;
};

export function emptyChannelBreakdown(rate = 0): ChannelBreakdown {
  return { revenueSubtotal: 0, commission: 0, rate, orderCount: 0 };
}

export function emptyChannelSettlementRow(
  rate = 0,
  providerFeeRate = GATEWAY_FEE_RATE,
): ChannelSettlementRow {
  return {
    ...emptyChannelBreakdown(rate),
    transactionTotal: 0,
    providerFee: 0,
    providerFeeRate,
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

export function emptyCommissionBreakdown(): Record<CommissionChannel, ChannelBreakdown> {
  return {
    pickupCash: emptyChannelBreakdown(),
    pickupCard: emptyChannelBreakdown(),
    pickupOnline: emptyChannelBreakdown(),
    deliveryOnline: emptyChannelBreakdown(),
  };
}

export function emptySettlementBreakdown(
  gatewayFeeRate = GATEWAY_FEE_RATE,
): Record<CommissionChannel, ChannelSettlementRow> {
  return {
    pickupCash: emptyChannelSettlementRow(0, gatewayFeeRate),
    pickupCard: emptyChannelSettlementRow(0, gatewayFeeRate),
    pickupOnline: emptyChannelSettlementRow(0, gatewayFeeRate),
    deliveryOnline: emptyChannelSettlementRow(0, gatewayFeeRate),
  };
}

/** Merge stored JSON breakdown with empty defaults for missing channels/fields. */
export function normalizeStoredSettlementBreakdown(
  breakdown: unknown,
): Record<CommissionChannel, ChannelSettlementRow> {
  const empty = emptySettlementBreakdown();
  if (!breakdown || typeof breakdown !== 'object') return empty;

  const stored = breakdown as Partial<Record<CommissionChannel, Partial<ChannelSettlementRow>>>;
  const result = { ...empty };

  for (const key of Object.keys(empty) as CommissionChannel[]) {
    const row = stored[key];
    if (row && typeof row === 'object') {
      result[key] = { ...empty[key], ...row };
    }
  }

  return result;
}

function applyChannelRate(breakdown: Record<CommissionChannel, ChannelBreakdown>): void {
  for (const key of Object.keys(breakdown) as CommissionChannel[]) {
    const row = breakdown[key];
    row.rate =
      row.revenueSubtotal > 0
        ? Math.round((row.commission / row.revenueSubtotal) * 10000) / 10000
        : 0;
  }
}

export function accumulateCommissionBreakdown(
  orders: CommissionOrderFields[],
  monthlyBase: number,
): Record<CommissionChannel, ChannelBreakdown> {
  const breakdown = emptyCommissionBreakdown();
  const effectiveRate = getEffectiveRate(monthlyBase);

  for (const order of orders) {
    const channel = orderCommissionChannel(order.orderMode, order.paymentMethod);
    if (!channel) continue;

    const base = commissionableSubtotal(order);
    breakdown[channel].revenueSubtotal += base;
    breakdown[channel].commission += computePlatformCommission(base, monthlyBase);
    breakdown[channel].orderCount += 1;
    breakdown[channel].rate = effectiveRate;
  }

  return breakdown;
}

export function accumulateSettlementBreakdown(
  orders: SettlementOrderFields[],
  windowBase: number,
  convenienceFeeRates: ConvenienceFeeRates | number = DEFAULT_CONVENIENCE_FEE_RATE,
  gatewayFeeRate = GATEWAY_FEE_RATE,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): Record<CommissionChannel, ChannelSettlementRow> {
  const breakdown = emptySettlementBreakdown(gatewayFeeRate);
  const effectiveRate = getEffectiveRate(windowBase, slabs);

  for (const order of orders) {
    const channel = orderCommissionChannel(order.orderMode, order.paymentMethod);
    if (!channel) continue;

    const base = commissionableSubtotal(order);
    breakdown[channel].revenueSubtotal += base;
    breakdown[channel].commission += computePlatformCommission(base, windowBase, slabs);
    breakdown[channel].orderCount += 1;
    breakdown[channel].rate = effectiveRate;
    breakdown[channel].grossSalesTotal += base;
    breakdown[channel].subtotalBeforeDiscount += order.subtotal;
    breakdown[channel].discountTotal += (order.discount ?? 0) + (order.loyaltyDiscount ?? 0);

    if (qualifiesForPayHereGatewayFee(order.orderMode, order.paymentMethod)) {
      const payhere = resolvePayHereOrderComponents(order, convenienceFeeRates)!;
      breakdown[channel].transactionTotal += payhere.total;
      breakdown[channel].providerFee += computeProviderFee(payhere.total, gatewayFeeRate);
      breakdown[channel].payhereTotal += payhere.total;
      breakdown[channel].payhereRevenueSubtotal += payhere.revenueSubtotal;
      breakdown[channel].payhereDeliveryFee += payhere.deliveryFee;
      breakdown[channel].payhereConvenienceFee += payhere.convenienceFee;
    } else if (channel === 'pickupOnline' || channel === 'deliveryOnline') {
      if (order.paymentMethod === 'CARD') {
        breakdown[channel].cardTotal += order.total;
      } else if (order.paymentMethod === 'LOYALTY_POINTS') {
        breakdown[channel].loyaltyPointsTotal += order.total;
      }
    }

    // Stored DB amount only — same source for all four channel cards.
    const convenienceLkr = order.convenientFee ?? 0;
    breakdown[channel].convenientFeeTotal += convenienceLkr;
    if (convenienceLkr > 0) {
      breakdown[channel].convenienceFeeBaseTotal += commissionableSubtotal(order);
    }

    if (channel === 'deliveryOnline') {
      breakdown[channel].deliveryFeeTotal += order.deliveryFee ?? 0;
    }
  }

  applyChannelRate(breakdown);
  return breakdown;
}

export function accumulateCommissionBreakdownMultiMonth(
  orders: Array<CommissionOrderFields & { createdAt: Date | string; storeId: string }>,
  monthlyBaseLookup: Record<string, number>,
): Record<CommissionChannel, ChannelBreakdown> {
  const breakdown = emptyCommissionBreakdown();

  for (const order of orders) {
    const channel = orderCommissionChannel(order.orderMode, order.paymentMethod);
    if (!channel) continue;

    const monthlyBase = monthlyBaseLookup[storePeriodKey(order.storeId, order.createdAt)] ?? 0;
    const effectiveRate = getEffectiveRate(monthlyBase);

    const base = commissionableSubtotal(order);
    breakdown[channel].revenueSubtotal += base;
    breakdown[channel].commission += computePlatformCommission(base, monthlyBase);
    breakdown[channel].orderCount += 1;
    breakdown[channel].rate = effectiveRate;
  }

  applyChannelRate(breakdown);
  return breakdown;
}

export function computeAllTimeCommission(
  orders: Array<CommissionOrderFields & { createdAt: Date | string; storeId: string }>,
  monthlyBaseLookup: Record<string, number>,
): number {
  const breakdown = accumulateCommissionBreakdownMultiMonth(orders, monthlyBaseLookup);
  return sumBreakdownCommission(breakdown);
}

export function buildPeriodSlabInfoList(
  periodBaseLookup: Record<string, number>,
): PeriodSlabInfo[] {
  return Object.entries(periodBaseLookup)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([storePeriod, monthlyBase]) => {
      const period = storePeriod.includes('|') ? storePeriod.split('|')[1]! : storePeriod;
      return {
        period,
        ...buildSlabInfo(monthlyBase),
      };
    });
}

/** @deprecated Use buildPeriodSlabInfoList */
export function buildMonthlySlabInfoList(
  monthlyBaseLookup: Record<string, number>,
): MonthlySlabInfo[] {
  return buildPeriodSlabInfoList(monthlyBaseLookup).map(({ period, ...rest }) => ({
    month: period,
    period,
    ...rest,
  }));
}

export function sumBreakdownCommission(
  breakdown: Record<CommissionChannel, ChannelBreakdown | ChannelSettlementRow>,
): number {
  return Object.values(breakdown).reduce((sum, row) => sum + row.commission, 0);
}

export function sumBreakdownConvenienceFee(
  breakdown: Record<CommissionChannel, ChannelSettlementRow>,
): number {
  return Object.values(breakdown).reduce((sum, row) => sum + row.convenientFeeTotal, 0);
}

export function sumBreakdownProviderFee(
  breakdown: Record<CommissionChannel, ChannelSettlementRow>,
): number {
  return Object.values(breakdown).reduce((sum, row) => sum + row.providerFee, 0);
}

export function sumBreakdownOrderCount(
  breakdown: Record<CommissionChannel, ChannelBreakdown | ChannelSettlementRow>,
): number {
  return Object.values(breakdown).reduce((sum, row) => sum + row.orderCount, 0);
}

/** Matches frontend sumOnlineRevenueSubtotals — pickup/delivery online item revenue for net payout. */
export function sumOnlinePaymentsCollectedFromBreakdown(
  breakdown: Record<CommissionChannel, ChannelSettlementRow>,
): number {
  return (
    (breakdown.pickupOnline.revenueSubtotal ?? 0) +
    (breakdown.deliveryOnline.revenueSubtotal ?? 0)
  );
}

/** Pickup + delivery online subtotal before discounts (channel table Subtotal column). */
export function sumFirstPayoutOnlineWalletBaseFromBreakdown(
  breakdown: Record<CommissionChannel, ChannelSettlementRow>,
): number {
  const pickup = breakdown.pickupOnline;
  const delivery = breakdown.deliveryOnline;
  return (
    (pickup.subtotalBeforeDiscount ?? pickup.revenueSubtotal ?? 0) +
    (delivery.subtotalBeforeDiscount ?? delivery.revenueSubtotal ?? 0)
  );
}

export type OrderPlatformPaybackUsage = {
  ownership?: string | null;
  platformShareAmount?: number;
  platformPaybackEligible: boolean;
  platformPaybackAmount: number;
  platformPaybackSettledAt?: Date | string | null;
  platformPaybackReversedAt?: Date | string | null;
};

function isUnsettledPaybackUsage(u: OrderPlatformPaybackUsage): boolean {
  return !u.platformPaybackSettledAt && !u.platformPaybackReversedAt;
}

/** Sum unsettled platform payback for an order (LKR, not cents). */
export function orderPlatformPayback(
  order: {
    promotionUsages?: OrderPlatformPaybackUsage[] | null;
  },
  options?: { storePaybackEnabled?: boolean },
): number {
  const storePaybackEnabled = options?.storePaybackEnabled;

  return (order.promotionUsages ?? [])
    .filter((u) => {
      if (!isUnsettledPaybackUsage(u)) return false;
      if (storePaybackEnabled === true) {
        return (u.ownership ?? 'PLATFORM') === 'PLATFORM';
      }
      return u.platformPaybackEligible;
    })
    .reduce((sum, u) => {
      if (storePaybackEnabled === true) {
        return sum + (u.platformShareAmount ?? u.platformPaybackAmount ?? 0);
      }
      return sum + u.platformPaybackAmount;
    }, 0);
}

/** Sum platform payback across orders (LKR). */
export function sumOrdersPlatformPaybackLkr(
  orders: Array<{ promotionUsages?: OrderPlatformPaybackUsage[] | null }>,
): number {
  return orders.reduce((sum, order) => sum + orderPlatformPayback(order), 0);
}

export function computePendingDuesLkr(params: {
  allTimeCommission: number;
  allTimePayback: number;
  settlements: Array<{ totalCommission: number; platformPaybackAmount: number }>;
}): number {
  const settledNetLkr = params.settlements.reduce(
    (sum, s) => sum + (s.totalCommission - s.platformPaybackAmount) / 100,
    0,
  );
  return Math.max(0, params.allTimeCommission - params.allTimePayback - settledNetLkr);
}
