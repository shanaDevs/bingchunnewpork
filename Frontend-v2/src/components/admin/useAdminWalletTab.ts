'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { replaceAdminWalletQuery } from '@/components/admin/replaceAdminWalletQuery';

/** Shared trigger styles for System / Platform / Payouts Due wallet tabs. */
export const WALLET_TAB_TRIGGER_CLASS =
  'h-7 flex-none px-2.5 text-xs font-semibold shadow-none data-active:bg-transparent data-active:text-[var(--color-brand,#307ef2)] data-active:shadow-none dark:data-active:bg-transparent dark:data-active:text-[var(--color-brand,#307ef2)]';

/**
 * Syncs wallet page tabs with `?tab=` and tracks which tabs have been opened
 * so heavy tab panels can mount lazily and stay mounted after first visit.
 */
export function useAdminWalletTab<T extends string>(parseTab: (value: string | null) => T) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const urlTab = parseTab(tabParam);
  const [activeTab, setActiveTabState] = useState(urlTab);

  // Keep local highlight in sync when URL changes from elsewhere (links, period race recovery).
  useEffect(() => {
    setActiveTabState(urlTab);
  }, [urlTab]);

  const [visitedTabs, setVisitedTabs] = useState<Set<T>>(() => new Set([urlTab]));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const setActiveTab = useCallback(
    (value: string) => {
      const tab = parseTab(value);
      setActiveTabState(tab);
      replaceAdminWalletQuery(router, (params) => {
        if (tab === 'system') {
          params.delete('tab');
        } else {
          params.set('tab', tab);
        }
      });
    },
    [parseTab, router],
  );

  const replaceQuery = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      replaceAdminWalletQuery(router, mutate);
    },
    [router],
  );

  return { activeTab, tabParam, visitedTabs, setActiveTab, replaceQuery };
}
