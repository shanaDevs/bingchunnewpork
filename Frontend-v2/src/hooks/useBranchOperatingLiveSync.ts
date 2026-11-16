'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  applyBranchOperatingToCart,
  BRANCH_OPERATING_EVENT,
  operatingPatchFromStore,
  type BranchOperatingPayload,
} from '@/lib/branchOperatingLive';
import { getSocket } from '@/lib/socketClient';
import { selectActiveStoreId, useCartStore } from '@/store/cartStore';
import type { Store } from '@/types';

export function useBranchOperatingLiveSync() {
  const queryClient = useQueryClient();
  const storeId = useCartStore(selectActiveStoreId);

  useQuery({
    queryKey: ['store-operating', storeId],
    queryFn: async () => {
      const store = await api.get<Store>(`/stores/${storeId}`);
      const changed = applyBranchOperatingToCart(operatingPatchFromStore(store));
      if (changed) {
        void queryClient.invalidateQueries({ queryKey: ['stores'] });
      }
      return {
        branchClosedAt: store.branchClosedAt ?? null,
        onlineOrderStartTime: store.onlineOrderStartTime ?? null,
        onlineOrderStopTime: store.onlineOrderStopTime ?? null,
      };
    },
    enabled: Boolean(storeId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!storeId) return;
    const socket = getSocket();

    const onOperating = (payload: BranchOperatingPayload) => {
      if (!payload?.storeId || payload.storeId !== storeId) return;
      applyBranchOperatingToCart(payload);
      void queryClient.invalidateQueries({ queryKey: ['stores'] });
      void queryClient.invalidateQueries({ queryKey: ['store-operating', storeId] });
    };

    socket.on(BRANCH_OPERATING_EVENT, onOperating);
    return () => {
      socket.off(BRANCH_OPERATING_EVENT, onOperating);
    };
  }, [queryClient, storeId]);
}

export default function BranchOperatingLiveSync() {
  useBranchOperatingLiveSync();
  return null;
}
