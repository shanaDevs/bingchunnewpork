'use client';

import BrandOrderSummaryByBranchChart, {
  type BranchOrderSummaryPoint,
} from '@/components/admin/BrandOrderSummaryByBranchChart';

type Props = {
  orderSummaryByBranch?: BranchOrderSummaryPoint[];
  periodLabel: string;
  loading?: boolean;
  compact?: boolean;
};

export default function DashboardOrderSummaryPaymentChannels({
  orderSummaryByBranch = [],
  periodLabel,
  loading,
  compact = false,
}: Props) {
  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className={`border-b border-navy-border ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
        <h2 className="text-sm font-semibold text-fg">Order Summary & Payment Channels</h2>
        <p className="mt-0.5 text-[11px] text-muted">
          Top 5 branches by gross sales · {periodLabel}
        </p>
      </div>
      <div className={`min-h-0 flex-1 ${compact ? 'p-3' : 'p-5'}`}>
        <BrandOrderSummaryByBranchChart
          data={orderSummaryByBranch}
          periodLabel={periodLabel}
          loading={loading}
          pickupOnly={false}
          maxBranches={5}
          sortBy="revenue"
          compact={compact}
        />
      </div>
    </div>
  );
}
