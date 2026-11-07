'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncCartStorageWithAuth } from '@/lib/cartAuthSync';
import { useAuthStore } from '@/store/authStore';

function migrateLegacyCartStorage() {
  if (typeof window === 'undefined') return;
  const legacy = localStorage.getItem('bc-cart');
  if (!legacy || localStorage.getItem('bc-cart-guest')) return;
  localStorage.setItem('bc-cart-guest', legacy);
  localStorage.removeItem('bc-cart');
}

/** Keeps cart localStorage scoped per user and rehydrates on initial load. */
export default function CartAuthSync() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();

  useEffect(() => {
    migrateLegacyCartStorage();

    const apply = () => {
      const id = useAuthStore.getState().user?.id ?? null;
      void syncCartStorageWithAuth(id);
    };

    const persistApi = useAuthStore.persist;
    if (!persistApi) {
      apply();
      return;
    }

    if (persistApi.hasHydrated()) {
      apply();
      return;
    }

    return persistApi.onFinishHydration(apply);
  }, []);

  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const prev = prevUserIdRef.current;
    prevUserIdRef.current = userId;
    if (prev && !userId) {
      queryClient.clear();
    }
  }, [userId, queryClient]);

  return null;
}
