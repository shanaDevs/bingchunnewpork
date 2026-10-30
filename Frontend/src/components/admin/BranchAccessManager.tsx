'use client';

import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';

type StoreRef = { id: string; name: string; city?: string };

/**
 * Staff accounts are tied to a single home branch (storeId).
 * Multi-branch selection is intentionally hidden.
 */
export default function BranchAccessManager({
  userId,
  primaryStore = null,
}: {
  userId: string;
  primaryStore?: StoreRef | null;
}) {
  const { data: userStoresData, isLoading } = useQuery<StoreRef[]>({
    queryKey: ['admin-user-stores', userId],
    queryFn: async () => {
      const raw = await adminFetch(`/admin/users/${userId}/stores`);
      return Array.isArray(raw) ? raw : [];
    },
  });

  // Prefer the profile home branch; otherwise show at most one assigned store.
  const assignedBranch = useMemo(() => {
    if (primaryStore?.id) return primaryStore;
    const first = userStoresData?.[0];
    return first ?? null;
  }, [primaryStore, userStoresData]);

  if (isLoading && !primaryStore) return null;

  const branchLabel = assignedBranch
    ? `${assignedBranch.name.replace('Bing Chun - ', '')}${
        assignedBranch.city ? ` (${assignedBranch.city})` : ''
      }`
    : null;

  return (
    <div className="card mt-4 p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-fg">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Store size={16} />
        </span>
        Branch Access Management
      </h3>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <span className="text-xs text-muted">Currently assigned branch:</span>

        {!branchLabel ? (
          <span className="text-sm italic text-muted">No branch assigned</span>
        ) : (
          <span className="inline-flex rounded-full border border-navy-border bg-navy-light px-3 py-1 text-xs font-medium text-fg">
            {branchLabel}
          </span>
        )}

        <span className="hidden h-4 w-px bg-navy-border sm:inline-block" aria-hidden />

        <p className="text-xs text-muted">Each staff account is linked to one branch only.</p>
      </div>
    </div>
  );
}
