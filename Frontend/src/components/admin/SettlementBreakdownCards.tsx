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
  const convenience = sumSettlementConvenienceFee(normalized);
  return totalCommission + convenience;
}

export function sumSettlementConvenienceFee(breakdown: SettlementBreakdown | unknown): number {
  const normalized = normalizeSettlementBreakdown(breakdown);
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (normalized[key].convenientFeeTotal ?? 0),
    0,
  );
}

type Props = {
  breakdown: SettlementBreakdown | unknown;
  totalCommission: number;
  platformPaybackAmount?: number;
  orderCount?: number;
  totalLabel?: string;
  className?: string;
};

function FooterRow({
  label,
  value,
  bold,
  brand,
}: {
  label: string;
  value: string;
  bold?: boolean;
  brand?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span
        className={[
          bold ? 'font-bold' : 'font-medium',
          brand ? 'text-[var(--color-brand)]' : 'text-[var(--color-text)]',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

export default function SettlementBreakdownCards({
  breakdown,
  totalCommission,
  platformPaybackAmount = 0,
  orderCount,
  totalLabel = 'Total owed to DartCodes',
  className = '',
}: Props) {
  const normalized = normalizeSettlementBreakdown(breakdown);
  const orders = orderCount ?? sumSettlementOrderCount(normalized);
  const totalConvenience = sumSettlementConvenienceFee(normalized);
  const payback = platformPaybackAmount > 0.001 ? platformPaybackAmount : 0;
  const netPlatformEarning = totalCommission - payback;
  const totalOwed = netPlatformEarning + totalConvenience;

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
      <div className="mt-4 rounded-lg border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/40 px-4 py-3">
        <FooterRow label="Gross commission" value={formatMoney(totalCommission)} />
        {payback > 0.001 && (
          <FooterRow
            label="Platform discount payback"
            value={`− ${formatMoney(payback)}`}
          />
        )}
        <FooterRow label="Net platform earning" value={formatMoney(netPlatformEarning)} />
        {totalConvenience > 0.001 && (
          <FooterRow label="Total convenience fee" value={formatMoney(totalConvenience)} />
        )}
        <div className="my-2 border-t border-[var(--color-navy-border)]/60" />
        <div className="flex flex-wrap items-center justify-between gap-2 py-1">
          <span className="text-sm font-semibold text-[var(--color-text)]">{totalLabel}</span>
          <span className="text-base font-bold text-[var(--color-brand)]">
            {formatMoney(totalOwed)}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {orders} order{orders !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
