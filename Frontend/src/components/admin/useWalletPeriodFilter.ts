'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { currentMonthKey } from '@/components/admin/MonthPickerSelect';

export type WalletPeriodMode = 'month' | 'custom';

export type AppliedWalletPeriod = {
  from: string;
  to: string;
  mode: WalletPeriodMode;
  monthKey: string | null;
};

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayDateStr() {
  return toDateStr(new Date());
}

export function monthRange(ym: string): { from: string; to: string } {
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function currentMonthPeriod(): { from: string; to: string } {
  const now = new Date();
  const ym = currentMonthKey();
  return { from: `${ym}-01`, to: toDateStr(now) };
}

function isValidYmd(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Applied period only when URL has valid `from`/`to`. Missing params = no filter (all-time). */
function resolveApplied(searchParams: URLSearchParams): AppliedWalletPeriod | null {
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!isValidYmd(from) || !isValidYmd(to) || from > to) return null;

  const monthKey = from.slice(0, 7);
  const range = monthRange(monthKey);
  const isFullMonth =
    from === range.from &&
    (to === range.to || (monthKey === currentMonthKey() && to === todayDateStr()));

  return {
    from,
    to,
    mode: isFullMonth ? 'month' : 'custom',
    monthKey: isFullMonth ? monthKey : null,
  };
}

/**
 * Shared wallet period filter (month or custom from/to) synced via URL `from`/`to`.
 * Draft fields update locally; Apply commits to the URL. No URL dates = all-time totals.
 */
export function useWalletPeriodFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applied = useMemo(() => resolveApplied(searchParams), [searchParams]);
  const isFiltered = applied != null;

  const [draftMonth, setDraftMonth] = useState('');
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [draftMode, setDraftMode] = useState<WalletPeriodMode>('month');

  useEffect(() => {
    if (!applied) {
      setDraftMode('month');
      setDraftMonth('');
      setDraftFrom('');
      setDraftTo('');
      return;
    }
    setDraftMode(applied.mode);
    setDraftMonth(applied.mode === 'month' ? (applied.monthKey ?? '') : '');
    setDraftFrom(applied.mode === 'custom' ? applied.from : '');
    setDraftTo(applied.mode === 'custom' ? applied.to : '');
  }, [applied]);

  const customRangeActive = draftMode === 'custom' && (!!draftFrom || !!draftTo);
  const monthDisabled = customRangeActive;

  const commitParams = useCallback(
    (from: string | null, to: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (from && to) {
        params.set('from', from);
        params.set('to', to);
      } else {
        params.delete('from');
        params.delete('to');
      }
      const qs = params.toString();
      router.replace(qs ? `/admin/wallet?${qs}` : '/admin/wallet', { scroll: false });
    },
    [router, searchParams],
  );

  const selectMonth = useCallback((monthKey: string) => {
    setDraftMode('month');
    setDraftMonth(monthKey);
    setDraftFrom('');
    setDraftTo('');
  }, []);

  const setCustomFrom = useCallback((value: string) => {
    setDraftMode('custom');
    setDraftMonth('');
    setDraftFrom(value);
  }, []);

  const setCustomTo = useCallback((value: string) => {
    setDraftMode('custom');
    setDraftMonth('');
    setDraftTo(value);
  }, []);

  const apply = useCallback(() => {
    if (draftMode === 'custom') {
      if (!isValidYmd(draftFrom) || !isValidYmd(draftTo) || draftFrom > draftTo) return;
      commitParams(draftFrom, draftTo);
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(draftMonth)) return;
    if (draftMonth === currentMonthKey()) {
      const { from, to } = currentMonthPeriod();
      commitParams(from, to);
    } else {
      const { from, to } = monthRange(draftMonth);
      commitParams(from, to);
    }
  }, [commitParams, draftFrom, draftMode, draftMonth, draftTo]);

  const reset = useCallback(() => {
    setDraftMode('month');
    setDraftMonth('');
    setDraftFrom('');
    setDraftTo('');
    commitParams(null, null);
  }, [commitParams]);

  const canApply =
    draftMode === 'month'
      ? /^\d{4}-\d{2}$/.test(draftMonth)
      : isValidYmd(draftFrom) && isValidYmd(draftTo) && draftFrom <= draftTo;

  return {
    applied,
    isFiltered,
    draftMode,
    draftMonth,
    draftFrom,
    draftTo,
    monthDisabled,
    canApply,
    selectMonth,
    setCustomFrom,
    setCustomTo,
    apply,
    reset,
  };
}

export type WalletPeriodFilterApi = ReturnType<typeof useWalletPeriodFilter>;

/** True when `iso` (date or datetime) falls on a calendar day within [from, to]. */
export function isoDateInRange(iso: string | null | undefined, from: string, to: string) {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
}
