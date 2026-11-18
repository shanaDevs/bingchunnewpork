'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SuperAdminSystemWalletTab, {
  type SuperAdminSystemWalletTabProps,
} from '@/components/admin/SuperAdminSystemWalletTab';
import PaymentHistoryContent from '@/components/admin/PaymentHistoryContent';
import PayoutsDueSubTabs from '@/components/admin/PayoutsDueSubTabs';
import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';
import {
  useAdminWalletTab,
  WALLET_TAB_TRIGGER_CLASS,
} from '@/components/admin/useAdminWalletTab';

export type SuperAdminWalletTab = 'system' | 'due' | 'platform';

const TAB_VALUES: SuperAdminWalletTab[] = ['system', 'due', 'platform'];

function parseTab(value: string | null): SuperAdminWalletTab {
  if (value === 'platform' || value === 'due') return value;
  return 'system';
}

const platformFallback = (
  <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">
    Loading settlement payouts…
  </div>
);

export type SuperAdminWalletTabsProps = SuperAdminSystemWalletTabProps & {
  periodFrom?: string | null;
  periodTo?: string | null;
  periodLabel?: string | null;
  tabActions?: ReactNode;
  duePayouts?: PayoutDueRow[];
  duePayoutsLoading?: boolean;
  duePayoutsLoadingMore?: boolean;
  onViewDuePayout?: (row: PayoutDueRow) => void;
  onReviewDuePayout?: (row: PayoutDueRow) => void;
  onDueTabOpen?: () => void;
};

export default function SuperAdminWalletTabs({
  periodFrom = null,
  periodTo = null,
  periodLabel = null,
  tabActions,
  duePayouts = [],
  duePayoutsLoading = false,
  duePayoutsLoadingMore = false,
  onViewDuePayout,
  onReviewDuePayout,
  onDueTabOpen,
  ...systemProps
}: SuperAdminWalletTabsProps) {
  const { activeTab, visitedTabs, setActiveTab } = useAdminWalletTab(parseTab);
  const [deliveryDueCount, setDeliveryDueCount] = useState(0);

  const branchDueCount = duePayouts.length;
  const dueCount = branchDueCount + deliveryDueCount;

  useEffect(() => {
    if (activeTab === 'due') {
      onDueTabOpen?.();
    }
    // Intentionally omit onDueTabOpen from deps — parent passes a stable-enough loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-0 gap-2 overflow-y-visible">
      <div className="flex flex-nowrap items-center justify-between gap-2 max-sm:flex-wrap">
        <TabsList className="mb-0 h-8 w-fit shrink-0 justify-start gap-0.5 overflow-y-hidden">
          <TabsTrigger value="system" className={WALLET_TAB_TRIGGER_CLASS}>
            System Wallet
          </TabsTrigger>
          <TabsTrigger value="due" className={WALLET_TAB_TRIGGER_CLASS}>
            Payouts Due
            {dueCount > 0 && (
              <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold !text-white">
                {dueCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="platform" className={WALLET_TAB_TRIGGER_CLASS}>
            Platform Payments
          </TabsTrigger>
        </TabsList>
        <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2 max-sm:flex-wrap [&>*]:shrink-0">
          <div
            id="wallet-platform-branch"
            className={
              activeTab === 'platform'
                ? 'flex flex-nowrap items-center justify-end gap-2 max-sm:flex-wrap [&>*]:shrink-0'
                : 'hidden'
            }
          />
          {tabActions}
          <div
            id="wallet-platform-process"
            className={
              activeTab === 'platform'
                ? 'flex flex-nowrap items-center justify-end gap-2 max-sm:flex-wrap [&>*]:shrink-0'
                : 'hidden'
            }
          />
        </div>
      </div>

      <TabsContent value="system" className="mt-0 outline-none">
        <SuperAdminSystemWalletTab {...systemProps} periodLabel={periodLabel} />
      </TabsContent>

      <TabsContent value="due" className="mt-0 outline-none">
        <PayoutsDueSubTabs
          branchRows={duePayouts}
          branchLoading={duePayoutsLoading}
          branchLoadingMore={duePayoutsLoadingMore}
          onViewBranchDue={onViewDuePayout ?? (() => {})}
          onReviewBranchDue={onReviewDuePayout ?? (() => {})}
          onDeliveryDueCountChange={setDeliveryDueCount}
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
              actionsPortalId="wallet-platform-branch"
              processPortalId="wallet-platform-process"
            />
          </Suspense>
        </div>
      )}

    </Tabs>
  );
}

export { TAB_VALUES };
