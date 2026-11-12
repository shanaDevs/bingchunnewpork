'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import PayoutsDuePanel, { type PayoutDueRow } from '@/components/admin/PayoutsDuePanel';
import DeliveryPayoutsDuePanel from '@/components/admin/DeliveryPayoutsDuePanel';
import DeliveryPayoutPayModal from '@/components/admin/DeliveryPayoutPayModal';
import DeliveryWalletPinOverlay from '@/components/admin/DeliveryWalletPinOverlay';
import { DeliveryWalletUnlockProvider } from '@/components/admin/DeliveryWalletUnlockContext';
import { deliveryWalletFetch, unlockDeliveryWallet } from '@/lib/deliveryWalletApi';
import type { DeliveryPayoutDueRow } from '@/lib/deliveryPayoutTypes';

type Props = {
  branchListEnabled?: boolean;
  dueStoreId?: string | null;
  onViewBranchDue: (row: PayoutDueRow) => void;
  onReviewBranchDue: (row: PayoutDueRow) => void;
  onDeliveryDueCountChange?: (count: number) => void;
  onBranchDueCountChange?: (count: number) => void;
};

async function fetchDeliveryPayoutsDue(unlockToken: string): Promise<DeliveryPayoutDueRow[]> {
  return deliveryWalletFetch('/admin/delivery-wallet/payouts-due', unlockToken);
}

export default function PayoutsDueSubTabs({
  branchListEnabled = true,
  dueStoreId = null,
  onViewBranchDue,
  onReviewBranchDue,
  onDeliveryDueCountChange,
  onBranchDueCountChange,
}: Props) {
  const queryClient = useQueryClient();
  const [deliverySubTab, setDeliverySubTab] = useState<'branch' | 'delivery'>('branch');
  const [unlockToken, setUnlockToken] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [payTarget, setPayTarget] = useState<DeliveryPayoutDueRow | null>(null);
  const [viewTarget, setViewTarget] = useState<DeliveryPayoutDueRow | null>(null);

  const deliveryQueryEnabled = Boolean(unlockToken) && deliverySubTab === 'delivery';

  const { data: deliveryDue = [], isLoading: deliveryLoading } = useQuery({
    queryKey: ['delivery-payouts-due', unlockToken],
    queryFn: () => fetchDeliveryPayoutsDue(unlockToken),
    enabled: deliveryQueryEnabled,
  });

  async function submitDeliveryUnlock() {
    const value = pin.trim();
    if (!value || pinSubmitting) return;
    setPinSubmitting(true);
    setPinError('');
    try {
      const token = await unlockDeliveryWallet(value);
      setUnlockToken(token);
      setPin('');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setPinSubmitting(false);
    }
  }

  async function refreshDeliveryDue() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['delivery-payouts-due'] }),
      queryClient.invalidateQueries({ queryKey: ['delivery-wallet-payouts'] }),
      queryClient.invalidateQueries({ queryKey: ['delivery-wallet'] }),
      queryClient.invalidateQueries({ queryKey: ['delivery-payout-preview-info'] }),
    ]);
  }

  const [branchCount, setBranchCount] = useState(0);
  const deliveryCount = unlockToken ? deliveryDue.length : 0;

  function handleBranchDueCountChange(count: number) {
    setBranchCount(count);
    onBranchDueCountChange?.(count);
  }

  useEffect(() => {
    onDeliveryDueCountChange?.(unlockToken ? deliveryDue.length : 0);
  }, [unlockToken, deliveryDue.length, onDeliveryDueCountChange]);

  return (
    <div className="space-y-4">
      <Tabs
        value={deliverySubTab}
        onValueChange={(v) => setDeliverySubTab(v as 'branch' | 'delivery')}
        className="gap-4 overflow-y-visible"
      >
        <TabsList className="h-auto w-fit justify-start gap-0.5 overflow-y-hidden">
          <TabsTrigger
            value="branch"
            className={cn(
              'h-8 flex-none px-3 text-[12px] font-semibold shadow-none',
              'data-active:bg-transparent data-active:text-[var(--color-brand,#307ef2)] data-active:shadow-none',
            )}
          >
            Branch
            <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--color-navy-border)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
              {branchCount}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="delivery"
            className={cn(
              'h-8 flex-none px-3 text-[12px] font-semibold shadow-none',
              'data-active:bg-transparent data-active:text-[var(--color-brand,#307ef2)] data-active:shadow-none',
            )}
          >
            Delivery
            {unlockToken && deliveryCount > 0 && (
              <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold !text-white">
                {deliveryCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branch" className="mt-0 outline-none">
          <PayoutsDuePanel
            enabled={branchListEnabled}
            storeId={dueStoreId}
            onView={onViewBranchDue}
            onReviewAndPay={onReviewBranchDue}
            onTotalChange={handleBranchDueCountChange}
          />
        </TabsContent>

        <TabsContent value="delivery" className="mt-0 outline-none">
          {!unlockToken ? (
            <DeliveryWalletPinOverlay
              password={pin}
              showPassword={showPin}
              error={pinError}
              submitting={pinSubmitting}
              title="Enter admin password"
              description="Unlock delivery wallet data to review and pay delivery payouts."
              onPasswordChange={(value) => {
                setPin(value);
                setPinError('');
              }}
              onToggleShow={() => setShowPin((v) => !v)}
              onSubmit={() => void submitDeliveryUnlock()}
              onBack={() => {
                setDeliverySubTab('branch');
                setPin('');
                setPinError('');
                setShowPin(false);
              }}
            />
          ) : (
            <DeliveryWalletUnlockProvider token={unlockToken}>
              <DeliveryPayoutsDuePanel
                rows={deliveryDue}
                loading={deliveryLoading}
                onView={(row) => setViewTarget(row)}
                onReviewAndPay={(row) => setPayTarget(row)}
              />
              {viewTarget && (
                <DeliveryPayoutPayModal
                  open
                  due={viewTarget}
                  readOnly
                  onClose={() => setViewTarget(null)}
                />
              )}
              {payTarget && (
                <DeliveryPayoutPayModal
                  open
                  due={payTarget}
                  onClose={() => setPayTarget(null)}
                  onCompleted={refreshDeliveryDue}
                />
              )}
            </DeliveryWalletUnlockProvider>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
