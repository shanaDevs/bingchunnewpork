'use client';

import { formatCommissionRate } from '@/components/admin/commissionUtils';
import type { SettlementPreview } from '@/components/admin/settlementTypes';
import { formatMoneyAmount } from '@/lib/receipt';

type ChannelKey = keyof SettlementPreview['breakdown'];

function money(lkr: number) {
  return `LKR ${formatMoneyAmount(lkr)}`;
}

export default function ChannelSettlementCard({
  label,
  row,
  isOnline,
  isDeliveryOnline = false,
  showGatewayFees = true,
}: {
  label: string;
  row: SettlementPreview['breakdown'][ChannelKey];
  isOnline: boolean;
  isDeliveryOnline?: boolean;
  showGatewayFees?: boolean;
}) {
  const hasActivity = row.orderCount > 0;
  const discountTotal = row.discountTotal ?? 0;
  const subtotalBeforeDiscount = row.subtotalBeforeDiscount ?? row.revenueSubtotal;
  const hasDiscount = discountTotal > 0.001;
  const payhereTotal = row.payhereTotal ?? 0;
  const customerConvenienceFee = row.convenientFeeTotal ?? 0;

  return (
    <div
      className={[
        'flex flex-col rounded-xl border p-4 transition-colors',
        hasActivity
          ? 'border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/40'
          : 'border-[var(--color-navy-border)]/60 bg-[var(--color-input-bg)]/20 opacity-70',
      ].join(' ')}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text)]">
          {label}
        </h3>
        <span className="shrink-0 rounded-full border border-[var(--color-navy-border)] bg-[var(--color-card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
          {row.orderCount} order{row.orderCount !== 1 ? 's' : ''}
        </span>
      </div>

      <dl className="grid flex-1 gap-2 text-xs">
        {hasDiscount ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--color-text-muted)]">Subtotal before discount</dt>
              <dd className="font-medium text-[var(--color-text)]">
                {money(subtotalBeforeDiscount)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--color-text-muted)]">Discounts applied</dt>
              <dd className="font-semibold text-red-400">− {money(discountTotal)}</dd>
            </div>
            <div className="my-1 border-t border-[var(--color-navy-border)]/60" />
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--color-text-muted)]">Revenue subtotal (after discount)</dt>
              <dd className="font-medium text-[var(--color-text)]">
                {money(row.revenueSubtotal)}
              </dd>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[var(--color-text-muted)]">Revenue subtotal</dt>
            <dd className="font-medium text-[var(--color-text)]">
              {money(row.revenueSubtotal)}
            </dd>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <dt className="text-[var(--color-text-muted)]">Commission</dt>
          <dd className="font-semibold text-[var(--color-brand)]">
            {money(row.commission)}
            {row.rate > 0 ? ` @ ${formatCommissionRate(row.rate)}` : ''}
          </dd>
        </div>

        {customerConvenienceFee > 0.001 && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[var(--color-text-muted)]">Customer convenience fee</dt>
            <dd className="font-medium text-[var(--color-text)]">
              {money(customerConvenienceFee)}
            </dd>
          </div>
        )}

        {isDeliveryOnline && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[var(--color-text-muted)]">Delivery fee</dt>
            <dd className="font-medium text-emerald-400">
              {money(row.deliveryFeeTotal ?? 0)}
            </dd>
          </div>
        )}

        {isOnline && showGatewayFees && payhereTotal > 0.001 && (
          <>
            <div className="my-1 border-t border-[var(--color-navy-border)]/60" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Payment gateway
            </p>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--color-text-muted)]">Transaction total</dt>
              <dd className="font-medium text-[var(--color-text)]">
                {money(row.transactionTotal)}
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}
