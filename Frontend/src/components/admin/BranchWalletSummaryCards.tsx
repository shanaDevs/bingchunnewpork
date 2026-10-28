'use client';

import { ArrowLeftRight, BarChart3, ChevronDown, ChevronRight, RotateCcw, Wallet } from 'lucide-react';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { currentMonthKey } from '@/components/admin/MonthPickerSelect';
import { monthRange, todayDateStr } from '@/components/admin/useWalletPeriodFilter';
import { formatMoneyAmount } from '@/lib/receipt';
import { cn } from '@/lib/utils';

export type BranchWalletDashboard = {
  allTimeEarnings: {
    pickupOnlineIn: number;
    deliveryOnlineIn: number;
    total: number;
  };
  allTimePayments: {
    toBranchCents: number;
    toPlatformCents: number;
    toDeliveryLkr: number;
  };
  liveEarningsCents: number;
  refundsLkr: number;
};

function centsToMoney(cents: number): string {
  return formatMoneyAmount(cents / 100);
}

function lkrMoney(value: number): string {
  return formatMoneyAmount(value);
}

function pct(part: number, total: number) {
  if (total <= 0) return '0.0';
  return (Math.round((part / total) * 1000) / 10).toFixed(1);
}

function revenuePeriodCaption(
  periodFrom: string | null,
  periodTo: string | null,
  periodLabel: string | null,
): string {
  if (!periodFrom || !periodTo || !periodLabel) return 'All time';
  const ym = currentMonthKey();
  const range = monthRange(ym);
  const isThisMonth =
    periodFrom === `${ym}-01` && (periodTo === todayDateStr() || periodTo === range.to);
  return isThisMonth ? 'This Month' : periodLabel;
}

const DECORATIVE_BARS = [28, 40, 34, 52, 46, 68, 58, 78];

function DecorativeBars() {
  return (
    <div className="branch-wallet-metric-card__bars" aria-hidden>
      {DECORATIVE_BARS.map((height, index) => (
        <span
          key={index}
          style={{
            height: `${height}%`,
            opacity: 0.22 + index * 0.09,
          }}
        />
      ))}
    </div>
  );
}

function RevenueSparkline({
  pickup,
  delivery,
}: {
  pickup: number;
  delivery: number;
  total: number;
}) {
  const modeTotal = pickup + delivery;
  const pickupShare = modeTotal > 0 ? pickup / modeTotal : 0.38;
  const deliveryShare = modeTotal > 0 ? delivery / modeTotal : 0.62;
  const midY = (48 - pickupShare * 8 - deliveryShare * 12).toFixed(1);
  const endY = (22 - deliveryShare * 6).toFixed(1);
  const line = `M0 52 C 72 54, 118 58, 156 ${midY} C 204 26, 268 ${endY}, 320 18`;
  const area = `${line} L 320 72 L 0 72 Z`;

  return (
    <svg
      className="branch-wallet-revenue__spark"
      viewBox="0 0 320 72"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="branchWalletRevenueFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#307ef2" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#307ef2" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#branchWalletRevenueFill)" />
      <path d={line} fill="none" stroke="#307ef2" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

type Props = {
  dashboard: BranchWalletDashboard | null;
  loading?: boolean;
  periodLoading?: boolean;
  className?: string;
  allTimeBalanceCents?: number;
  periodFrom?: string | null;
  periodTo?: string | null;
  periodLabel?: string | null;
  hideDelivery?: boolean;
};

export default function BranchWalletSummaryCards({
  dashboard,
  loading = false,
  periodLoading = false,
  className = '',
  allTimeBalanceCents,
  periodFrom = null,
  periodTo = null,
  periodLabel = null,
  hideDelivery = false,
}: Props) {
  const earnings = dashboard?.allTimeEarnings;
  const pickup = earnings?.pickupOnlineIn ?? 0;
  const delivery = hideDelivery ? 0 : (earnings?.deliveryOnlineIn ?? 0);
  const total = hideDelivery ? pickup : (earnings?.total ?? pickup + delivery);
  const modeTotal = pickup + delivery;
  const periodCaption = revenuePeriodCaption(periodFrom, periodTo, periodLabel);
  const walletBalance = allTimeBalanceCents ?? dashboard?.liveEarningsCents ?? 0;
  const lifetimeLoading = loading;
  const filteredLoading = loading || periodLoading;

  return (
    <div className={cn('branch-wallet-overview', className)}>
      <section className="branch-wallet-balance">
        <Wallet
          aria-hidden
          size={118}
          strokeWidth={1}
          className="branch-wallet-balance__art"
        />
        <div className="branch-wallet-balance__icon" aria-hidden>
          <Wallet size={15} strokeWidth={2.25} />
        </div>
        <div className="branch-wallet-balance__body">
          <p className="branch-wallet-balance__label">Online Wallet Balance</p>
          <p className="branch-wallet-balance__amount">
            {lifetimeLoading ? (
              <DashSkel className="h-7 w-40 max-w-full bg-white/20" />
            ) : (
              centsToMoney(walletBalance)
            )}
          </p>
          <p className="branch-wallet-balance__hint">All-time available balance</p>
        </div>
        <span className="branch-wallet-balance__go" aria-hidden>
          <ChevronRight size={16} strokeWidth={2.25} />
        </span>
      </section>

      <section className="branch-wallet-metric-card">
        <div className="branch-wallet-metric-card__top">
          <span className="branch-wallet-metric-card__icon" aria-hidden>
            <RotateCcw size={14} strokeWidth={2.25} />
          </span>
          <h2>Refund Amount</h2>
        </div>
        <p className="branch-wallet-metric-card__amount">
          {lifetimeLoading ? (
            <DashSkel className="h-7 w-24" />
          ) : (
            lkrMoney(dashboard?.refundsLkr ?? 0)
          )}
        </p>
        <p className="branch-wallet-metric-card__hint">All-time refunds</p>
        <DecorativeBars />
      </section>

      <section className="branch-wallet-metric-card">
        <div className="branch-wallet-metric-card__top">
          <span className="branch-wallet-metric-card__icon" aria-hidden>
            <ArrowLeftRight size={14} strokeWidth={2.25} />
          </span>
          <h2>Branch Receivable</h2>
        </div>
        <p className="branch-wallet-metric-card__amount">
          {filteredLoading ? <DashSkel className="h-7 w-28" /> : centsToMoney(total)}
        </p>
        <p className="branch-wallet-metric-card__hint">
          {periodCaption === 'All time' ? 'All-time branch receivable' : `${periodCaption} receivable`}
        </p>
        <DecorativeBars />
      </section>

      <section className="branch-wallet-revenue">
        <div className="branch-wallet-revenue__head">
          <div className="branch-wallet-revenue__title">
            <span className="branch-wallet-revenue__icon" aria-hidden>
              <BarChart3 size={13} strokeWidth={2.25} />
            </span>
            <h2>Breakdown</h2>
          </div>
          <span className="branch-wallet-revenue__period">
            {periodCaption}
            <ChevronDown size={12} strokeWidth={2.25} />
          </span>
        </div>

        <div
          className={cn(
            'branch-wallet-revenue__metrics',
            hideDelivery && 'branch-wallet-revenue__metrics--two',
          )}
        >
          <div className="branch-wallet-revenue__metric">
            <p>Total Revenue</p>
            <strong>
              {filteredLoading ? <DashSkel className="h-4 w-24" /> : centsToMoney(total)}
            </strong>
            <span>{periodCaption}</span>
          </div>
          <div className="branch-wallet-revenue__metric">
            <p>Pickup Revenue</p>
            <strong>
              {filteredLoading ? <DashSkel className="h-4 w-20" /> : centsToMoney(pickup)}
            </strong>
            <span>{pct(pickup, modeTotal)}% of total</span>
          </div>
          {!hideDelivery && (
            <div className="branch-wallet-revenue__metric">
              <p>Delivery Revenue</p>
              <strong>
                {filteredLoading ? <DashSkel className="h-4 w-20" /> : centsToMoney(delivery)}
              </strong>
              <span>{pct(delivery, modeTotal)}% of total</span>
            </div>
          )}
        </div>

        <div className="branch-wallet-revenue__chart">
          {filteredLoading ? (
            <DashSkel className="block h-full w-full rounded-md" />
          ) : (
            <RevenueSparkline pickup={pickup} delivery={delivery} total={total} />
          )}
        </div>
      </section>
    </div>
  );
}
