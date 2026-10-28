'use client';

import ChannelSettlementCard from '@/components/admin/ChannelSettlementCard';
import {
  normalizeSettlementBreakdown,
  SETTLEMENT_CHANNELS,
  type SettlementBreakdown,
} from '@/components/admin/settlementTypes';
import { formatMoney } from '@/lib/receipt';

export function sumSettlementOrderCount(breakdown: SettlementBreakdown | unknown): number {
  const normalized = normalizeSettlementBreakdown(breakdown);
  return SETTLEMENT_CHANNELS.reduce((sum, { key }) => sum + normalized[key].orderCount, 0);
}

export function settlementServiceProviderTotal(
  breakdown: SettlementBreakdown | unknown,
  totalCommission: number,
): number {
  const normalized = normalizeSettlementBreakdown(breakdown);
  const convenience = SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (normalized[key].convenientFeeTotal ?? 0),
    0,
  );
  return totalCommission + convenience;
}

type Props = {
  breakdown: SettlementBreakdown | unknown;
  totalCommission: number;
  orderCount?: number;
  totalLabel?: string;
  className?: string;
};

export default function SettlementBreakdownCards({
  breakdown,
  totalCommission,
  orderCount,
  totalLabel = 'Total owed to DartCodes',
  className = '',
}: Props) {
  const normalized = normalizeSettlementBreakdown(breakdown);
  const orders = orderCount ?? sumSettlementOrderCount(normalized);
  const totalOwed = settlementServiceProviderTotal(normalized, totalCommission);

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        {SETTLEMENT_CHANNELS.map(({ key, label }) => (
          <ChannelSettlementCard
            key={key}
            label={label}
            row={normalized[key]}
            isOnline={key === 'pickupOnline' || key === 'deliveryOnline'}
            isDeliveryOnline={key === 'deliveryOnline'}
            showGatewayFees={false}
          />
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/40 px-4 py-3 text-sm">
        <span className="text-[var(--color-text-muted)]">{totalLabel}: </span>
        <span className="font-bold text-[var(--color-text)]">{formatMoney(totalOwed)}</span>
        <span className="ml-3 text-xs text-[var(--color-text-muted)]">
          ({orders} order{orders !== 1 ? 's' : ''})
        </span>
      </div>
    </div>
  );
}
