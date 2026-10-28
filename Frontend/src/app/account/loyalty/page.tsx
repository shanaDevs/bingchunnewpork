'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useCartStore } from '@/store/cartStore';
import { api } from '@/lib/api';
import type { LoyaltySummary } from '@/lib/loyalty';
import RewardsDashboard from '@/components/loyalty/RewardsDashboard';

export default function LoyaltyPage() {
  const router = useRouter();
  const isAuthHydrated = useAuthHydrated();
  const { isAuthenticated } = useAuthStore();
  const storeId = useCartStore((s) => s.getFulfillmentStoreId());

  useEffect(() => {
    if (isAuthHydrated && !isAuthenticated) router.replace('/account/login');
  }, [isAuthHydrated, isAuthenticated, router]);

  const {
    data,
    error,
    isLoading,
    isFetching,
    isError,
    isRefetchError,
    dataUpdatedAt,
    refetch,
  } = useQuery<LoyaltySummary>({
    queryKey: ['loyalty-summary', storeId ?? ''],
    queryFn: () => {
      const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
      return api.get(`/loyalty/summary${qs}`, true);
    },
    enabled: isAuthHydrated && isAuthenticated,
    staleTime: 30_000,
    retry: 1,
  });

  if (!isAuthHydrated || isLoading) {
    return (
      <main className="rewards-page rewards-page--loading" aria-busy="true" aria-label="Loading rewards">
        <div className="rewards-page__skeleton-header">
          <span />
          <span />
          <span />
        </div>
        <div className="rewards-page__skeleton-hero" />
        <div className="rewards-page__skeleton-title" />
        <div className="rewards-page__skeleton-cards">
          <span />
          <span />
          <span />
        </div>
        <span className="sr-only">Loading your live rewards</span>
      </main>
    );
  }

  if (!isAuthenticated) return null;

  if ((isError && !data) || !data) {
    return (
      <main className="rewards-page rewards-page--state">
        <section className="rewards-page__state-card" role="alert">
          <span className="rewards-page__state-icon">
            <AlertTriangle size={26} aria-hidden />
          </span>
          <h1>We couldn&apos;t load your rewards</h1>
          <p>
            {error instanceof Error && !error.message.includes('port 4000')
              ? error.message
              : 'The rewards service is temporarily unavailable. Your points have not been changed.'}
          </p>
          <button type="button" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw size={16} className={isFetching ? 'rewards-page__spin' : undefined} />
            {isFetching ? 'Trying again…' : 'Try again'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <RewardsDashboard
      data={data}
      isRefreshing={isFetching}
      isStale={isRefetchError}
      updatedAt={dataUpdatedAt}
      onRefresh={() => void refetch()}
    />
  );
}
