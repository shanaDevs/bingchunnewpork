'use client';

import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import {
  type WithdrawalBreakdown,
  withdrawalBreakdownToLkr,
} from '@/components/admin/settlementTypes';

type Props = {
  breakdown: WithdrawalBreakdown;
  variant?: 'panel' | 'compact' | 'table' | 'cards';
  gatewayRatePct?: number;
  className?: string;
};

function BreakdownRow({
  label,
  amountLkr,
  emphasize,
  negative,
  positive,
}: {
  label: string;
  amountLkr: number;
  emphasize?: boolean;
  negative?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 text-sm ${
        emphasize ? 'border-t border-[var(--color-navy-border)] pt-2 font-semibold' : ''
      }`}
    >
      <span className={emphasize ? 'text-fg' : 'text-muted'}>{label}</span>
      <span
        className={`tabular-nums ${
          emphasize
            ? 'text-[var(--color-brand)]'
            : positive
              ? 'text-emerald-400'
              : negative
                ? 'text-red-400'
                : 'text-fg'
        }`}
      >
        {positive ? '+' : negative ? '−' : ''}
        {formatMoneyAmount(amountLkr)}
      </span>
    </div>
  );
}

function BreakdownMetricCard({
  label,
  amountLkr,
  tone = 'default',
}: {
  label: string;
  amountLkr: number;
  tone?: 'default' | 'positive' | 'negative' | 'brand';
}) {
  const amountClass =
    tone === 'positive'
      ? 'text-emerald-400'
      : tone === 'negative'
        ? 'text-red-400'
        : tone === 'brand'
          ? 'text-[var(--color-brand)]'
          : 'text-[var(--color-text)]';

  return (
    <div className="flex flex-col rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${amountClass}`}>
        {tone === 'positive' ? '+' : tone === 'negative' ? '−' : ''}
        LKR {formatMoneyAmount(amountLkr)}
      </p>
    </div>
  );
}

export default function WithdrawalBreakdownDisplay({
  breakdown,
  variant = 'panel',
  gatewayRatePct: gatewayRatePctProp,
  className = '',
}: Props) {
  const lkr = withdrawalBreakdownToLkr(breakdown);
  const gatewayRatePct = gatewayRatePctProp ?? breakdown.gatewayRatePct ?? 1.9;
  const gatewayFeeLabel = `Payment gateway fee (${gatewayRatePct}%)`;
  const commissionRatePct =
    lkr.grossAmount - lkr.deliveryFee > 0
      ? Math.round((lkr.commissionFee / (lkr.grossAmount - lkr.deliveryFee)) * 1000) / 10
      : null;

  if (variant === 'compact') {
    return (
      <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${className}`}>
        <span className="rounded-md bg-[var(--color-input-bg)] px-2 py-0.5 text-[10px] text-muted">
          Gross {formatMoney(lkr.grossAmount)}
        </span>
        <span className="rounded-md bg-[var(--color-input-bg)] px-2 py-0.5 text-[10px] text-emerald-400/90">
          +Delivery {formatMoney(lkr.deliveryFee)}
        </span>
        <span className="rounded-md bg-[var(--color-input-bg)] px-2 py-0.5 text-[10px] text-red-400/90">
          −Commission {formatMoney(lkr.commissionFee)}
        </span>
        <span className="rounded-md bg-[var(--color-input-bg)] px-2 py-0.5 text-[10px] text-red-400/90">
          −Gateway {formatMoney(lkr.gatewayFee)}
        </span>
        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
          = Net {formatMoney(lkr.netAmount)}
        </span>
        {breakdown.orderCount > 0 && (
          <span className="text-[10px] text-muted">({breakdown.orderCount} orders)</span>
        )}
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className={className}>
        <div className="mb-4">
          <div className="inline-flex flex-col rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Paid orders
            </p>
            <p className="mt-1 text-3xl font-bold text-[var(--color-text)]">
              {breakdown.orderCount}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
              in selected period
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <BreakdownMetricCard label="Gross amount" amountLkr={lkr.grossAmount} />
          <BreakdownMetricCard
            label="Delivery rider share"
            amountLkr={lkr.deliveryFee}
            tone="positive"
          />
          <BreakdownMetricCard
            label={
              commissionRatePct != null
                ? `DartCodes commission (~${commissionRatePct}%)`
                : 'DartCodes commission'
            }
            amountLkr={lkr.commissionFee}
            tone="negative"
          />
          <BreakdownMetricCard
            label={gatewayFeeLabel}
            amountLkr={lkr.gatewayFee}
            tone="negative"
          />
        </div>

        <div className="rounded-xl border border-[var(--color-brand)]/40 bg-[var(--color-brand-subtle)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand)]">
            Branch net share
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--color-text)]">
            {formatMoney(lkr.netAmount)}
          </p>
        </div>
      </div>
    );
  }

  const isTable = variant === 'table';

  return (
    <div
      className={`rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 ${
        isTable ? 'p-3' : 'p-4'
      } ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Ledger split
        </p>
        {breakdown.orderCount > 0 && (
          <span className="text-[10px] text-muted">{breakdown.orderCount} paid orders</span>
        )}
      </div>
      <div className={`space-y-2 ${isTable ? 'text-xs' : ''}`}>
        <BreakdownRow label="Gross amount" amountLkr={lkr.grossAmount} />
        <BreakdownRow
          label="Delivery rider share (you pay riders)"
          amountLkr={lkr.deliveryFee}
          positive
        />
        <BreakdownRow
          label={
            commissionRatePct != null
              ? `DartCodes commission (~${commissionRatePct}%)`
              : 'DartCodes commission'
          }
          amountLkr={lkr.commissionFee}
          negative
        />
        <BreakdownRow label={gatewayFeeLabel} amountLkr={lkr.gatewayFee} negative />
        <BreakdownRow label="Branch net share" amountLkr={lkr.netAmount} emphasize />
      </div>
    </div>
  );
}
