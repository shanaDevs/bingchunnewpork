'use client';

import { useEffect } from 'react';
import { ensureCustomerAccessToken } from '@/lib/customerSession';
import { useAuthStore } from '@/store/authStore';

const KEEP_ALIVE_MS = 60 * 1000;

/** Restores customer session on load and refreshes access tokens before they expire. */
export default function CustomerAuthSync() {
  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;

    const restore = async () => {
      const { isAuthenticated, logout } = useAuthStore.getState();
      if (!isAuthenticated || cancelled) return;

      const ok = await ensureCustomerAccessToken();
      if (!ok && !cancelled) logout();
    };

    const startKeepAlive = () => {
      void restore();
      interval = window.setInterval(() => {
        void restore();
      }, KEEP_ALIVE_MS);

      const onVisible = () => {
        if (document.visibilityState === 'visible') void restore();
      };
      window.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);

      return () => {
        if (interval) clearInterval(interval);
        window.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    };

    const persistApi = useAuthStore.persist;
    if (!persistApi) {
      return startKeepAlive();
    }

    if (persistApi.hasHydrated()) {
      return startKeepAlive();
    }

    let stopKeepAlive: (() => void) | undefined;
    const unsub = persistApi.onFinishHydration(() => {
      stopKeepAlive = startKeepAlive();
    });

    return () => {
      cancelled = true;
      unsub?.();
      stopKeepAlive?.();
      if (interval) clearInterval(interval);
    };
  }, []);

  return null;
}
