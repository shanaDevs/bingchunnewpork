'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatStoreCountLabel } from '@/lib/storeCount';
import type { Store } from '@/types';

export function useStoreCount() {
  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ['stores', 'public-count'],
    queryFn: () => api.get('/stores'),
    staleTime: 5 * 60 * 1000,
  });

  const count = stores.length;
  const label = formatStoreCountLabel(count);

  return { count, label, isLoading };
}
