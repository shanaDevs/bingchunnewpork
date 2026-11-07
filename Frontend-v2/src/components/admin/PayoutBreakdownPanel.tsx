'use client';

import ApprovePayoutBreakdown from '@/components/admin/ApprovePayoutBreakdown';
import PeriodPayoutSplitCards from '@/components/admin/PeriodPayoutSplitCards';
import PayoutBreakdownTabs from '@/components/admin/PayoutBreakdownTabs';
import PayoutFinancialReport from '@/components/admin/PayoutFinancialReport';
import {
  resolvePayoutBreakdownBundle,
  type PayoutBreakdownDisplayInput,
} from '@/components/admin/resolvePayoutReportValues';
import type {
  BranchPayoutDisplay,
  BranchReceiveDifference,
} from '@/components/admin/branchPayoutDisplay';
import type { PeriodPayoutSplitLkr } from '@/components/admin/settlementTypes';

type Props = PayoutBreakdownDisplayInput & {
  payoutSplit: PeriodPayoutSplitLkr | null;
  branchReceivesLkr: number;
  platformCommissionLkr: number;
  periodNetLkr: number | null;
  dateFrom: string;
  dateTo: string;
  showAdvance: boolean;
  advanceAmountLkr: number;
  branchPayout?: BranchPayoutDisplay | null;
  branchReceiveDifference?: BranchReceiveDifference | null;
  className?: string;
};

export default function PayoutBreakdownPanel({
  payoutSplit,
  branchReceivesLkr,
  platformCommissionLkr,
  periodNetLkr,
  dateFrom,
  dateTo,
  showAdvance,
  advanceAmountLkr,
  branchPayout = null,
  branchReceiveDifference = null,
  className = 'mb-4',
  ...breakdownInput
}: Props) {
  const bundle = resolvePayoutBreakdownBundle(breakdownInput);
  if (!bundle) return null;

  const { breakdownProps, reportValues } = bundle;

  const renderPayoutAllocationCards = () => (
    <PeriodPayoutSplitCards
      payoutSplit={payoutSplit}
      branchReceivesLkr={branchReceivesLkr}
      platformCommissionLkr={platformCommissionLkr}
      periodNetLkr={periodNetLkr}
      deliveryFeeLkr={breakdownInput.deliveryFeeLkr}
      dateFrom={dateFrom}
      dateTo={dateTo}
      showAdvance={showAdvance}
      advanceAmountLkr={advanceAmountLkr}
      branchPayout={branchPayout}
      branchReceiveDifference={branchReceiveDifference}
      className="mb-4"
    />
  );

  return (
    <PayoutBreakdownTabs
      className={className}
      classicContent={
        <>
          <ApprovePayoutBreakdown
            {...breakdownProps}
            values={reportValues}
            className="mb-4"
          />
          {renderPayoutAllocationCards()}
        </>
      }
      reportContent={
        <>
          <PayoutFinancialReport values={reportValues} />
          {renderPayoutAllocationCards()}
        </>
      }
    />
  );
}
