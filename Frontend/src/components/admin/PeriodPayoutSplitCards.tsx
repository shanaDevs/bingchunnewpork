'use client';

import { formatMoneyAmount } from '@/lib/receipt';
import { CalendarRange, User, Percent, Truck, type LucideIcon } from 'lucide-react';
import BranchPayoutHero from '@/components/admin/BranchPayoutHero';
import {
  coalesceBranchPayoutDisplay,
  type BranchPayoutDisplay,
  type BranchReceiveDifference,
} from '@/components/admin/branchPayoutDisplay';
import type { PeriodPayoutSplitLkr } from '@/components/admin/settlementTypes';
import {
  formatPayoutAllocationPeriodLabel,
  resolvePeriodPayoutCardAmounts,
} from '@/components/admin/periodPayoutSplitDisplay';
import { PAYOUT_FIRST_CYCLE_COMMISSION_CARD_SUBTITLE } from '@/components/admin/payoutFirstCycleCopy';

type Props = {
  payoutSplit: PeriodPayoutSplitLkr | null;
  branchReceivesLkr?: number | null;
  platformCommissionLkr?: number | null;
  periodNetLkr?: number | null;
  deliveryFeeLkr?: number;
  dateFrom?: string;
  dateTo?: string;
  showAdvance?: boolean;
  advanceAmountLkr?: number;
  branchPayout?: BranchPayoutDisplay | null;
  branchReceiveDifference?: BranchReceiveDifference | null;
  cycleStage?: 'FIRST' | 'SECOND';
  className?: string;
};

type MetricCardVariant = 'platform' | 'neutral';

const METRIC_CARD_VARIANT_STYLES: Record<
  MetricCardVariant,
  { shell: string; iconRing: string; titleClass: string; amountClass: string }
> = {
  platform: {
    shell: 'border-[#fecaca] bg-[#fef2f2] dark:border-red-900/50 dark:bg-red-950/20',
    iconRing: 'border-red-500 text-red-500',
    titleClass: 'text-red-500',
    amountClass: 'text-red-500',
  },
  neutral: {
    shell: 'border-[#e2e8f0] bg-white dark:border-slate-700 dark:bg-slate-900',
    iconRing: 'border-[#cbd5e1] text-[#64748b]',
    titleClass: 'text-[#64748b] dark:text-slate-400',
    amountClass: 'text-[#1e293b] dark:text-slate-100',
  },
};

function PayoutMetricCard({
  icon: Icon,
  title,
  amount,
  amountLabel,
  subtitle,
  variant,
}: {
  icon: LucideIcon;
  title: string;
  amount: number;
  amountLabel?: string;
  subtitle: string;
  variant: MetricCardVariant;
}) {
  const { shell, iconRing, titleClass, amountClass } = METRIC_CARD_VARIANT_STYLES[variant];

  return (
    <div className={`flex gap-4 rounded-xl border p-4 ${shell}`}>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white dark:bg-slate-900 ${iconRing}`}
      >
        <Icon size={20} />
      </div>
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-wide ${titleClass}`}>{title}</p>
        <p className={`text-[16px] font-bold ${amountClass}`}>
          {amountLabel ?? formatMoneyAmount(amount)}
        </p>
        <p className="mt-1 text-[10px] text-[#64748b] dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

export default function PeriodPayoutSplitCards({
  payoutSplit,
  branchReceivesLkr = null,
  platformCommissionLkr = null,
  periodNetLkr = null,
  deliveryFeeLkr = 0,
  dateFrom,
  dateTo,
  showAdvance = false,
  advanceAmountLkr = 0,
  branchPayout = null,
  branchReceiveDifference = null,
  cycleStage,
  className = 'mb-6',
}: Props) {
  const isFirstCyclePayout = cycleStage === 'FIRST';
  const { branchReceives, commissionLkr, orderConvenienceFeeLkr, deliveryFee } =
    resolvePeriodPayoutCardAmounts({
      payoutSplit,
      branchReceivesLkr,
      platformCommissionLkr: isFirstCyclePayout ? 0 : platformCommissionLkr,
      periodNetLkr,
      deliveryFeeLkr,
    });

  const branchDisplay = coalesceBranchPayoutDisplay({
    branchPayout,
    branchReceivesLkr: branchReceives,
    periodNetLkr,
  });
  const walletLineLkr =
    branchPayout?.periodWalletNetLkr ?? periodNetLkr ?? branchReceives;

  const periodLabel = formatPayoutAllocationPeriodLabel(dateFrom, dateTo);

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange size={18} className="text-[#64748b]" />
          <h3 className="text-[14px] font-bold text-[#1e293b] dark:text-slate-100">
            Platform &amp; delivery share
          </h3>
        </div>
        {periodLabel && (
          <p className="text-[11px] font-medium text-[#64748b] dark:text-slate-400">For {periodLabel}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <PayoutMetricCard
          icon={User}
          variant="platform"
          title="Customer convenience fee"
          amount={orderConvenienceFeeLkr}
          subtitle="Platform share for this period"
        />
        <PayoutMetricCard
          icon={Percent}
          variant="platform"
          title="Platform commission"
          amount={commissionLkr}
          amountLabel={isFirstCyclePayout ? '—' : undefined}
          subtitle={
            isFirstCyclePayout
              ? PAYOUT_FIRST_CYCLE_COMMISSION_CARD_SUBTITLE
              : 'Platform commission for this period'
          }
        />
        <PayoutMetricCard
          icon={Truck}
          variant="neutral"
          title="Delivery fee received"
          amount={deliveryFee}
          subtitle="Delivery rider share for this period"
        />
      </div>

      <BranchPayoutHero
        display={branchDisplay}
        title="Branch receives"
        subtitle="Actual amount your branch receives for this payout"
        walletLineLkr={walletLineLkr}
        branchReceiveDifference={branchReceiveDifference}
        className="mt-4"
        size="md"
        compositionJoiner=" + "
      />

      {showAdvance && (
        <div className="mt-3 flex gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
              Advance portion
            </p>
            <p className="mt-1 text-[16px] font-bold text-[#1e293b] dark:text-slate-100">
              {formatMoneyAmount(advanceAmountLkr)}
            </p>
            <p className="mt-1 text-[10px] text-[#64748b] dark:text-slate-400">
              Amount above this period&apos;s net share
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
