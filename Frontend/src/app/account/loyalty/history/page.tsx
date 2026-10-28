'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import type { LoyaltySummary } from '@/lib/loyalty';
import LoyaltyHistoryDashboard from '@/components/loyalty/LoyaltyHistoryDashboard';

export default function LoyaltyHistoryPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) router.replace('/account/login');
  }, [isAuthenticated, router]);

  const { data, isLoading, isError, refetch } = useQuery<LoyaltySummary>({
    queryKey: ['loyalty-summary'],
    queryFn: () => api.get('/loyalty/summary', true),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="loyalty-dash loyalty-dash--loading">
        <div className="loyalty-dash__loading card">Loading your points history…</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="loyalty-dash loyalty-dash--loading">
        <div className="loyalty-dash__loading card">
          <p>Could not load points history.</p>
          <button type="button" onClick={() => refetch()} className="loyalty-dash__btn loyalty-dash__btn--primary">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <LoyaltyHistoryDashboard data={data} />;
}
