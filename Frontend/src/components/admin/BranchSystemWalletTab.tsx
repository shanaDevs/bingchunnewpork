'use client';

import BranchWalletSummaryCards, {
  type BranchWalletDashboard,
} from '@/components/admin/BranchWalletSummaryCards';
import BranchPayoutPeriodsSection from '@/components/admin/BranchPayoutPeriodsSection';
import type {
  WithdrawalPagination,
  WithdrawalRow,
} from '@/components/admin/WalletWithdrawalTable';

type Props = {
  dashboard: BranchWalletDashboard | null;
  loading: boolean;
  periodLoading?: boolean;
  allTimeBalanceCents?: number;
  withdrawals: WithdrawalRow[];
  withdrawalsLoading: boolean;
  storeNames: Record<string, string>;
  withdrawalPagination: WithdrawalPagination | null;
  onPageChange: (page: number) => void;
  onViewWithdrawal: (row: WithdrawalRow) => void;
  periodFrom?: string | null;
  periodTo?: string | null;
  periodLabel?: string | null;
  hideDelivery?: boolean;
  storeId?: string;
  walletBalance?: number;
  availableBalance?: number;
  payoutPeriodsRefresh?: number;
};

export default function BranchSystemWalletTab({
  dashboard,
  loading,
  periodLoading = false,
  allTimeBalanceCents,
  withdrawals,
  withdrawalsLoading,
  storeNames,
  withdrawalPagination,
  onPageChange,
  onViewWithdrawal,
  periodFrom = null,
  periodTo = null,
  periodLabel = null,
  hideDelivery = false,
  storeId,
  walletBalance = 0,
  availableBalance = 0,
  payoutPeriodsRefresh = 0,
}: Props) {
  return (
    <>
      <BranchWalletSummaryCards
        dashboard={dashboard}
        loading={loading}
        periodLoading={periodLoading}
        allTimeBalanceCents={allTimeBalanceCents}
        periodFrom={periodFrom}
        periodTo={periodTo}
        periodLabel={periodLabel}
        hideDelivery={hideDelivery}
        storeId={storeId}
      />
      <BranchPayoutPeriodsSection
        storeId={storeId}
        walletBalance={walletBalance}
        availableBalance={availableBalance}
        refreshSignal={payoutPeriodsRefresh}
        withdrawals={withdrawals}
        withdrawalsLoading={withdrawalsLoading}
        withdrawalStoreNames={storeNames}
        withdrawalPagination={withdrawalPagination}
        onWithdrawalPageChange={onPageChange}
        onViewWithdrawal={onViewWithdrawal}
      />
    </>
  );
}
