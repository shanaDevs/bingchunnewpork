'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  ChevronRight,
  CreditCard,
  Landmark,
  HandCoins,
  Percent,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { formatMoneyAmount } from '@/lib/receipt';
import { cn } from '@/lib/utils';

export type BranchWalletPayablesBreakdown = {
  channelRevenueCents: {
    pickupCashIn: number;
    pickupOnlineIn: number;
    pickupCardIn: number;
    deliveryOnlineIn: number;
  };
  totalRevenueCents: number;
  platformCommissionCents: number;
  deliveryCommissionCents: number;
  gatewayFeeCents: number;
  branchReceivableCents: number;
  totalExpensesCents: number;
  allTimeAvailableBalanceCents: number;
};

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
  payablesBreakdown?: BranchWalletPayablesBreakdown;
};

function centsToMoney(cents: number): string {
  return formatMoneyAmount(cents / 100);
}

const ALL_TIME_HINT = 'All-time';
const BRANCH_RECEIVABLE_HINT = 'Paid 15-day payouts';

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

function PayablesMetricCard({
  title,
  amountCents,
  loading,
  primary = false,
  hint = ALL_TIME_HINT,
  icon: Icon,
}: {
  title: string;
  amountCents: number;
  loading: boolean;
  primary?: boolean;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <section
      className={cn(
        'branch-wallet-metric-card branch-wallet-payables__metric',
        primary && 'branch-wallet-metric-card--primary',
      )}
    >
      <div className="branch-wallet-metric-card__top">
        <span className="branch-wallet-metric-card__icon" aria-hidden>
          <Icon size={14} strokeWidth={2.25} />
        </span>
        <h2>{title}</h2>
      </div>
      <p className="branch-wallet-metric-card__amount">
        {loading ? <DashSkel className="h-7 w-28" /> : centsToMoney(amountCents)}
      </p>
      <p className="branch-wallet-metric-card__hint">{hint}</p>
    </section>
  );
}

export default function BranchWalletSummaryCards({
  dashboard,
  loading = false,
  periodLoading = false,
  className = '',
  hideDelivery = false,
}: Props) {
  const payables = dashboard?.payablesBreakdown;
  const channels = payables?.channelRevenueCents;
  const deliveryOnlineCents = hideDelivery ? 0 : (channels?.deliveryOnlineIn ?? 0);
  const pickupCashCents = channels?.pickupCashIn ?? 0;
  const pickupOnlineCents = channels?.pickupOnlineIn ?? 0;
  const pickupCardCents = channels?.pickupCardIn ?? 0;

  const totalRevenueCents = hideDelivery
    ? Math.max(0, (payables?.totalRevenueCents ?? 0) - deliveryOnlineCents)
    : (payables?.totalRevenueCents ?? 0);

  const totalExpensesCents = payables?.totalExpensesCents ?? 0;
  const availableBalanceCents = hideDelivery
    ? totalRevenueCents - totalExpensesCents
    : (payables?.allTimeAvailableBalanceCents ?? 0);

  const cardLoading = loading || periodLoading;

  return (
    <div className={cn('branch-wallet-overview branch-wallet-payables', className)}>
      <div className="branch-wallet-payables__balance-row">
        <section className="branch-wallet-balance branch-wallet-payables__balance">
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
            <p className="branch-wallet-balance__label">All-Time Available Balance</p>
            <p className="branch-wallet-balance__amount">
              {cardLoading ? (
                <DashSkel className="h-7 w-40 max-w-full bg-white/20" />
              ) : (
                centsToMoney(availableBalanceCents)
              )}
            </p>
            <p className="branch-wallet-balance__hint">{ALL_TIME_HINT}</p>
          </div>
          <span className="branch-wallet-balance__go" aria-hidden>
            <ChevronRight size={16} strokeWidth={2.25} />
          </span>
        </section>
      </div>

      <div className="branch-wallet-payables__row">
        <PayablesMetricCard
          title="Total Revenue (Net)"
          amountCents={totalRevenueCents}
          loading={cardLoading}
          primary
          icon={TrendingUp}
        />
        {!hideDelivery && (
          <PayablesMetricCard
            title="Delivery Online Revenue"
            amountCents={deliveryOnlineCents}
            loading={cardLoading}
            icon={Truck}
          />
        )}
        <PayablesMetricCard
          title="Pickup Online Revenue"
          amountCents={pickupOnlineCents}
          loading={cardLoading}
          icon={ShoppingBag}
        />
        <PayablesMetricCard
          title="Pickup Cash Revenue"
          amountCents={pickupCashCents}
          loading={cardLoading}
          icon={Banknote}
        />
        <PayablesMetricCard
          title="Pickup Card Revenue"
          amountCents={pickupCardCents}
          loading={cardLoading}
          icon={CreditCard}
        />
      </div>

      <div className="branch-wallet-payables__row branch-wallet-payables__row--expenses">
        <PayablesMetricCard
          title="Total Expenses"
          amountCents={totalExpensesCents}
          loading={cardLoading}
          primary
          icon={TrendingDown}
        />
        <PayablesMetricCard
          title="Platform Commission"
          amountCents={payables?.platformCommissionCents ?? 0}
          loading={cardLoading}
          icon={Percent}
        />
        <PayablesMetricCard
          title="Payment Gateway Fees"
          amountCents={payables?.gatewayFeeCents ?? 0}
          loading={cardLoading}
          icon={Landmark}
        />
        <PayablesMetricCard
          title="Branch Receivable"
          amountCents={payables?.branchReceivableCents ?? 0}
          loading={cardLoading}
          hint={BRANCH_RECEIVABLE_HINT}
          icon={HandCoins}
        />
      </div>
    </div>
  );
}
