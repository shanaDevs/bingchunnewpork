'use client';

import { useState } from 'react';
import BranchWalletSummaryCards, {
  type BranchWalletDashboard,
} from '@/components/admin/BranchWalletSummaryCards';
import BranchPayoutPeriodsSection from '@/components/admin/BranchPayoutPeriodsSection';
import WalletWithdrawalTable, {
  type WithdrawalPagination,
  type WithdrawalRow,
} from '@/components/admin/WalletWithdrawalTable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WALLET_TAB_TRIGGER_CLASS } from '@/components/admin/useAdminWalletTab';

type SectionTab = 'payouts' | 'history';

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
  const [sectionTab, setSectionTab] = useState<SectionTab>('payouts');
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
      <Tabs
        value={sectionTab}
        onValueChange={(value) => setSectionTab(value as SectionTab)}
        className="mb-2"
      >
        <TabsList className="branch-wallet-page__tabs mb-4 h-auto w-fit justify-start gap-0.5 overflow-y-hidden">
          <TabsTrigger
            value="payouts"
            className={`branch-wallet-page__tab ${WALLET_TAB_TRIGGER_CLASS}`}
          >
            15-Day Payouts
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className={`branch-wallet-page__tab ${WALLET_TAB_TRIGGER_CLASS}`}
          >
            Withdrawal History
          </TabsTrigger>
        </TabsList>

        <div hidden={sectionTab !== 'payouts'}>
          <BranchPayoutPeriodsSection
            storeId={storeId}
            walletBalance={walletBalance}
            availableBalance={availableBalance}
            refreshSignal={payoutPeriodsRefresh}
          />
        </div>
        <div className="mb-7" hidden={sectionTab !== 'history'}>
          <WalletWithdrawalTable
            rows={withdrawals}
            loading={withdrawalsLoading}
            storeNames={storeNames}
            showAdvance={false}
            pagination={withdrawalPagination}
            onPageChange={onPageChange}
            onView={onViewWithdrawal}
          />
        </div>
      </Tabs>
    </>
  );
}
