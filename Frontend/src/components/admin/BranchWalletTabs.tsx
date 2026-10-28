'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BranchSystemWalletTab from '@/components/admin/BranchSystemWalletTab';
import type { BranchWalletDashboard } from '@/components/admin/BranchWalletSummaryCards';
import PaymentHistoryContent from '@/components/admin/PaymentHistoryContent';
import type { WithdrawalPagination, WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';
import {
  useAdminWalletTab,
  WALLET_TAB_TRIGGER_CLASS,
} from '@/components/admin/useAdminWalletTab';

export type BranchWalletTab = 'system' | 'platform';

const TAB_VALUES: BranchWalletTab[] = ['system', 'platform'];

function parseTab(value: string | null): BranchWalletTab {
  return value === 'platform' ? 'platform' : 'system';
}

const platformFallback = (
  <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">
    Loading settlement payouts…
  </div>
);

type Props = {
  dashboard: BranchWalletDashboard | null;
  loading: boolean;
  periodLoading?: boolean;
  allTimeBalanceCents?: number;
  periodFrom?: string | null;
  periodTo?: string | null;
  periodLabel?: string | null;
  withdrawals: WithdrawalRow[];
  withdrawalsLoading: boolean;
  storeNames: Record<string, string>;
  withdrawalPagination: WithdrawalPagination | null;
  onPageChange: (page: number) => void;
  onViewWithdrawal: (row: WithdrawalRow) => void;
  hideDelivery?: boolean;
  tabActions?: ReactNode;
  storeId?: string;
  walletBalance?: number;
  availableBalance?: number;
  payoutPeriodsRefresh?: number;
};

export default function BranchWalletTabs({
  periodFrom = null,
  periodTo = null,
  periodLabel = null,
  hideDelivery = false,
  tabActions,
  ...props
}: Props) {
  const { activeTab, tabParam, visitedTabs, setActiveTab, replaceQuery } =
    useAdminWalletTab(parseTab);

  useEffect(() => {
    if (tabParam === 'requests') {
      replaceQuery((params) => {
        params.delete('tab');
      });
    }
  }, [tabParam, replaceQuery]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-2 overflow-y-visible">
      <div className="branch-wallet-page__toolbar mb-4 flex flex-wrap items-center justify-between gap-2">
        <TabsList className="branch-wallet-page__tabs mb-0 h-auto w-fit justify-start gap-0.5 overflow-y-hidden">
          <TabsTrigger value="system" className={`branch-wallet-page__tab ${WALLET_TAB_TRIGGER_CLASS}`}>
            System Wallet
          </TabsTrigger>
          <TabsTrigger value="platform" className={`branch-wallet-page__tab ${WALLET_TAB_TRIGGER_CLASS}`}>
            Platform Payments
          </TabsTrigger>
        </TabsList>
        {tabActions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">{tabActions}</div>
        ) : null}
      </div>

      <TabsContent value="system" className="mt-0 outline-none">
        <BranchSystemWalletTab
          {...props}
          periodFrom={periodFrom}
          periodTo={periodTo}
          periodLabel={periodLabel}
          hideDelivery={hideDelivery}
        />
      </TabsContent>

      {(visitedTabs.has('platform') || activeTab === 'platform') && (
        <div hidden={activeTab !== 'platform'} className="mt-0 outline-none">
          <Suspense fallback={platformFallback}>
            <PaymentHistoryContent
              embedded
              headerIcon={History}
              periodFrom={periodFrom ?? undefined}
              periodTo={periodTo ?? undefined}
            />
          </Suspense>
        </div>
      )}
    </Tabs>
  );
}

export { TAB_VALUES };
