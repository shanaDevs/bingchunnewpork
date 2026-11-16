'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { replaceAdminWalletQuery } from '@/components/admin/replaceAdminWalletQuery';
import { formatBranchName } from '@/lib/deliveryDisplay';

type Props = {
  stores: Array<{ id: string; name: string }>;
  className?: string;
};

/** Super Admin Payouts Due tab: branch scope via `?dueStoreId=` (all branches when unset). */
export default function WalletPayoutsDueBranchFilter({ stores, className }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dueStoreId = searchParams.get('dueStoreId') ?? '';

  const onChange = useCallback(
    (storeId: string) => {
      replaceAdminWalletQuery(router, (params) => {
        if (storeId) params.set('dueStoreId', storeId);
        else params.delete('dueStoreId');
      });
    },
    [router],
  );

  return (
    <SearchableBranchSelect
      stores={stores}
      value={dueStoreId || undefined}
      onChange={onChange}
      formatName={formatBranchName}
      allowAll
      placeholder="All branches"
      className={className ?? 'min-w-[12rem]'}
    />
  );
}
