'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
  const activeTab = parseTab(tabParam);

  const [visitedTabs, setVisitedTabs] = useState<Set<T>>(() => new Set([activeTab]));

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
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'system') {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      router.replace(qs ? `/admin/wallet?${qs}` : '/admin/wallet', { scroll: false });
    },
    [parseTab, router, searchParams],
  );

  const replaceQuery = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `/admin/wallet?${qs}` : '/admin/wallet', { scroll: false });
    },
    [router, searchParams],
  );

  return { activeTab, tabParam, visitedTabs, setActiveTab, replaceQuery };
}
