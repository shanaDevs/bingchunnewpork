'use client';

import { useEffect, useState } from 'react';

/** True after the first client paint — use to avoid SSR/client cart/theme mismatches */
export function useClientHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
