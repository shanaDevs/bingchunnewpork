'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

/** True once persisted auth state has been restored from localStorage. */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persistApi = useAuthStore.persist;
    if (!persistApi) {
      setHydrated(true);
      return;
    }
    if (persistApi.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persistApi.onFinishHydration(() => {
      setHydrated(true);
    });
  }, []);

  return hydrated;
}
