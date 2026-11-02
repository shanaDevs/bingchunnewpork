'use client';

import { BarChart3, ChevronRight, HandCoins, Wallet } from 'lucide-react';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { formatMoneyAmount } from '@/lib/receipt';
import { cn } from '@/lib/utils';
import type { PayoutPeriodExpensesCents } from '@/components/admin/payoutPeriodRowAmounts';
import { usePaidPayoutPeriodExpenses } from '@/components/admin/usePaidPayoutPeriodExpenses';

export type BranchWalletPayablesBreakdown = {
  channelRevenueCents: {
    pickupCashIn: number;
    pickupOnlineIn: number;
    pickupCardIn: number;
    deliveryOnlineIn: number;
  };
  totalRevenueCents: number;
  /** Net platform amount from paid 15-day payouts (cents). */
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
const PAYOUT_PERIOD_EXPENSE_HINT = 'Paid 15-day payouts';

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
  /** When set, expenses use paid 15-day payout periods only (same query as the table). */
  storeId?: string;
  payoutPeriodExpenses?: PayoutPeriodExpensesCents | null;
  payoutPeriodExpensesLoading?: boolean;
};

const EMPTY_PAID_PAYOUT_EXPENSES: PayoutPeriodExpensesCents = {
  netPlatformAmountCents: 0,
  gatewayFeeCents: 0,
  branchReceivableCents: 0,
  totalExpensesCents: 0,
};

function RevenueChannelKpiCard({
  label,
  amount,
  loading,
  hint,
}: {
  label: string;
  amount: string;
  loading?: boolean;
  hint?: string;
}) {
  return (
    <div className="branch-wallet-payables-revenue__channel min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm dark:border-navy-border/60 dark:bg-[var(--color-navy-card)]">
      <p className="text-[0.78rem] font-semibold leading-[1.15] text-slate-950 dark:text-fg">
        {label}
      </p>
      <p className="mt-[0.28rem] truncate text-[1rem] font-bold tabular-nums leading-[1.15] text-slate-950 dark:text-fg">
        {loading ? <DashSkel className="h-4 w-28 max-w-full" /> : amount}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-[0.68rem] font-medium leading-[1.15] text-slate-500 dark:text-muted-fg">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function PayablesRevenueSummaryCard({
  totalRevenueCents,
  deliveryOnlineCents,
  pickupOnlineCents,
  pickupCashCents,
  pickupCardCents,
  loading,
  hideDelivery,
}: {
  totalRevenueCents: number;
  deliveryOnlineCents: number;
  pickupOnlineCents: number;
  pickupCashCents: number;
  pickupCardCents: number;
  loading: boolean;
  hideDelivery: boolean;
}) {
  const channelCols = hideDelivery
    ? 'sm:grid-cols-2 lg:grid-cols-3'
    : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <section className="branch-wallet-payables-summary branch-wallet-payables__metric">
      <div className="relative z-10 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB] dark:bg-[rgba(48,126,242,0.12)] dark:text-[#307ef2]">
          <BarChart3 size={14} strokeWidth={2.3} aria-hidden />
        </div>
        <h2 className="m-0 text-[0.9rem] font-bold leading-[1.15] text-slate-950 dark:text-fg">
          Revenue Summary
        </h2>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <p className="branch-wallet-payables-summary__total m-0 tabular-nums leading-[1.05] tracking-[-0.03em] text-slate-950 dark:text-fg">
          {loading ? <DashSkel className="h-8 w-48 max-w-full" /> : centsToMoney(totalRevenueCents)}
        </p>

        <div className={cn('mt-auto grid grid-cols-1 gap-2 pt-2', channelCols)}>
          {!hideDelivery && (
            <RevenueChannelKpiCard
              label="Delivery Online Revenue"
              amount={centsToMoney(deliveryOnlineCents)}
              loading={loading}
            />
          )}
          <RevenueChannelKpiCard
            label="Pickup Online Revenue"
            amount={centsToMoney(pickupOnlineCents)}
            loading={loading}
          />
          <RevenueChannelKpiCard
            label="Pickup Cash Revenue"
            amount={centsToMoney(pickupCashCents)}
            loading={loading}
          />
          <RevenueChannelKpiCard
            label="Pickup Card Revenue"
            amount={centsToMoney(pickupCardCents)}
            loading={loading}
          />
        </div>
      </div>
    </section>
  );
}

function BranchReceivableCard({
  branchReceivableCents,
  loading,
}: {
  branchReceivableCents: number;
  loading: boolean;
}) {
  return (
    <section className="branch-wallet-receivable branch-wallet-payables__receivable">
      <HandCoins
        aria-hidden
        size={96}
        strokeWidth={1}
        className="branch-wallet-receivable__art"
      />
      <div className="branch-wallet-receivable__icon" aria-hidden>
        <HandCoins size={15} strokeWidth={2.25} />
      </div>
      <div className="branch-wallet-receivable__body">
        <p className="branch-wallet-receivable__label">Branch Receivable</p>
        <p className="branch-wallet-receivable__amount">
          {loading ? (
            <DashSkel className="h-7 w-40 max-w-full bg-blue-900/10" />
          ) : (
            centsToMoney(branchReceivableCents)
          )}
        </p>
        <p className="branch-wallet-receivable__hint">{BRANCH_RECEIVABLE_HINT}</p>
      </div>
    </section>
  );
}

function PayablesExpensesSummaryCard({
  totalExpensesCents,
  platformCommissionCents,
  gatewayFeeCents,
  loading,
  fromPayoutPeriods,
}: {
  totalExpensesCents: number;
  platformCommissionCents: number;
  gatewayFeeCents: number;
  loading: boolean;
  fromPayoutPeriods?: boolean;
}) {
  const periodHint = fromPayoutPeriods ? PAYOUT_PERIOD_EXPENSE_HINT : undefined;
  return (
    <section className="branch-wallet-payables-summary branch-wallet-payables__metric">
      <div className="relative z-10 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB] dark:bg-[rgba(48,126,242,0.12)] dark:text-[#307ef2]">
          <BarChart3 size={14} strokeWidth={2.3} aria-hidden />
        </div>
        <h2 className="m-0 text-[0.9rem] font-bold leading-[1.15] text-slate-950 dark:text-fg">
          Expenses Summary
        </h2>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <p className="branch-wallet-payables-summary__total m-0 tabular-nums leading-[1.05] tracking-[-0.03em] text-slate-950 dark:text-fg">
          {loading ? <DashSkel className="h-8 w-48 max-w-full" /> : centsToMoney(totalExpensesCents)}
        </p>

        <div className="mt-auto grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
          <RevenueChannelKpiCard
            label="Net Platform Amount"
            amount={centsToMoney(platformCommissionCents)}
            loading={loading}
            hint={periodHint}
          />
          <RevenueChannelKpiCard
            label="Payment Gateway Fees"
            amount={centsToMoney(gatewayFeeCents)}
            loading={loading}
            hint={periodHint}
          />
        </div>
      </div>
    </section>
  );
}

export default function BranchWalletSummaryCards({
  dashboard,
  loading = false,
  periodLoading = false,
  className = '',
  hideDelivery = false,
  storeId,
  payoutPeriodExpenses: payoutPeriodExpensesProp = null,
  payoutPeriodExpensesLoading: payoutPeriodExpensesLoadingProp = false,
}: Props) {
  const { expenses: paidPeriodExpenses, loading: paidPeriodExpensesLoading } =
    usePaidPayoutPeriodExpenses(storeId);
  const paidPayoutExpensesOnly = Boolean(storeId);
  const payoutPeriodExpenses =
    payoutPeriodExpensesProp ?? (paidPayoutExpensesOnly ? paidPeriodExpenses : null);
  const payoutPeriodExpensesLoading =
    payoutPeriodExpensesLoadingProp ||
    (paidPayoutExpensesOnly ? paidPeriodExpensesLoading : false);

  const payables = dashboard?.payablesBreakdown;
  const channels = payables?.channelRevenueCents;
  const deliveryOnlineCents = hideDelivery ? 0 : (channels?.deliveryOnlineIn ?? 0);
  const pickupCashCents = channels?.pickupCashIn ?? 0;
  const pickupOnlineCents = channels?.pickupOnlineIn ?? 0;
  const pickupCardCents = channels?.pickupCardIn ?? 0;

  const totalRevenueCents = hideDelivery
    ? Math.max(0, (payables?.totalRevenueCents ?? 0) - deliveryOnlineCents)
    : (payables?.totalRevenueCents ?? 0);

  const usePayoutPeriodExpenses = paidPayoutExpensesOnly || payoutPeriodExpenses != null;
  const resolvedPaidExpenses =
    payoutPeriodExpenses ?? (paidPayoutExpensesOnly ? EMPTY_PAID_PAYOUT_EXPENSES : null);
  const platformCommissionCents = usePayoutPeriodExpenses
    ? (resolvedPaidExpenses?.netPlatformAmountCents ?? 0)
    : (payables?.platformCommissionCents ?? 0);
  const gatewayFeeCents = usePayoutPeriodExpenses
    ? (resolvedPaidExpenses?.gatewayFeeCents ?? 0)
    : (payables?.gatewayFeeCents ?? 0);
  const branchReceivableCents = usePayoutPeriodExpenses
    ? (resolvedPaidExpenses?.branchReceivableCents ?? 0)
    : (payables?.branchReceivableCents ?? 0);
  const totalExpensesCents = usePayoutPeriodExpenses
    ? (resolvedPaidExpenses?.totalExpensesCents ?? 0)
    : (payables?.totalExpensesCents ?? 0);
  const availableBalanceCents = hideDelivery
    ? totalRevenueCents - totalExpensesCents
    : (payables?.allTimeAvailableBalanceCents ?? 0);

  const cardLoading = loading || periodLoading || payoutPeriodExpensesLoading;

  return (
    <div className={cn('branch-wallet-overview branch-wallet-payables', className)}>
      <div className="branch-wallet-payables__row branch-wallet-payables__row--top">
        <PayablesRevenueSummaryCard
          totalRevenueCents={totalRevenueCents}
          deliveryOnlineCents={deliveryOnlineCents}
          pickupOnlineCents={pickupOnlineCents}
          pickupCashCents={pickupCashCents}
          pickupCardCents={pickupCardCents}
          loading={cardLoading}
          hideDelivery={hideDelivery}
        />
        <section className="branch-wallet-balance branch-wallet-payables__balance">
          <Wallet
            aria-hidden
            size={96}
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

      <div className="branch-wallet-payables__row branch-wallet-payables__row--expenses">
        <PayablesExpensesSummaryCard
          totalExpensesCents={totalExpensesCents}
          platformCommissionCents={platformCommissionCents}
          gatewayFeeCents={gatewayFeeCents}
          loading={cardLoading}
          fromPayoutPeriods={usePayoutPeriodExpenses}
        />
        <BranchReceivableCard
          branchReceivableCents={branchReceivableCents}
          loading={cardLoading}
        />
      </div>
    </div>
  );
}
