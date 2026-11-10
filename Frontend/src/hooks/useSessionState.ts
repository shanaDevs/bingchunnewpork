'use client';

import { useCallback, useState } from 'react';

function readSessionValue<T>(key: string, initial: T): T {
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch {
    // ignore
  }
  return initial;
}

/** Session-persisted state (cleared when the tab closes). */
export function useSessionState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readSessionValue(key, initial));

  const setStored = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [key],
  );

  return [value, setStored];
}
