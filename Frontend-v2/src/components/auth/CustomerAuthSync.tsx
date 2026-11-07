'use client';

import { useEffect } from 'react';
import { ensureCustomerAccessToken } from '@/lib/customerSession';
import { useAuthStore } from '@/store/authStore';

/** Restores customer session on load and refreshes expired access tokens when possible. */
export default function CustomerAuthSync() {
  useEffect(() => {
    const restore = async () => {
      const { isAuthenticated, logout } = useAuthStore.getState();
      if (!isAuthenticated) return;

      const ok = await ensureCustomerAccessToken();
      if (!ok) logout();
    };

    const persistApi = useAuthStore.persist;
    if (!persistApi) {
      void restore();
      return;
    }

    if (persistApi.hasHydrated()) {
      void restore();
      return;
    }

    return persistApi.onFinishHydration(() => {
      void restore();
    });
  }, []);

  return null;
}
