'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { replaceAdminRefundsQuery } from '@/components/admin/replaceAdminRefundsQuery';

export type RefundPageView = 'process' | 'analytics';

function parseView(value: string | null): RefundPageView {
  return value === 'analytics' ? 'analytics' : 'process';
}

export function useAdminRefundsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlView = parseView(searchParams.get('view'));
  const [activeView, setActiveViewState] = useState<RefundPageView>(urlView);

  useEffect(() => {
    setActiveViewState(urlView);
  }, [urlView]);

  const setActiveView = useCallback(
    (view: RefundPageView) => {
      setActiveViewState(view);
      replaceAdminRefundsQuery(router, (params) => {
        if (view === 'process') {
          params.delete('view');
        } else {
          params.set('view', 'analytics');
        }
      });
    },
    [router],
  );

  return { activeView, setActiveView };
}