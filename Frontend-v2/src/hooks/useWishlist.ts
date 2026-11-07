'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import type { Product } from '@/types';

const WISHLIST_IDS_KEY = ['wishlist-ids'] as const;
const WISHLIST_KEY = ['wishlist'] as const;

export interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product: Product;
}

export function useWishlist() {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<WishlistItem[]>({
    queryKey: WISHLIST_KEY,
    queryFn: async () => {
      const result = await api.get<WishlistItem[]>('/wishlist', true);
      return Array.isArray(result) ? result : [];
    },
    enabled: authHydrated && isAuthenticated,
    staleTime: 60_000,
  });
}

export function useWishlistIds() {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<string[]>({
    queryKey: WISHLIST_IDS_KEY,
    queryFn: () => api.get('/wishlist/ids', true),
    enabled: authHydrated && isAuthenticated,
    staleTime: 60_000,
  });
}

export function useWishlistToggle() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const mutation = useMutation({
    mutationFn: async ({ productId, wishlisted }: { productId: string; wishlisted: boolean }) => {
      if (wishlisted) {
        await api.delete(`/wishlist/${productId}`, true);
      } else {
        await api.post(`/wishlist/${productId}`, {}, true);
      }
    },
    onMutate: async ({ productId, wishlisted }) => {
      await queryClient.cancelQueries({ queryKey: WISHLIST_IDS_KEY });
      const previous = queryClient.getQueryData<string[]>(WISHLIST_IDS_KEY) ?? [];
      const next = wishlisted
        ? previous.filter((id) => id !== productId)
        : [...previous, productId];
      queryClient.setQueryData(WISHLIST_IDS_KEY, next);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(WISHLIST_IDS_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: WISHLIST_IDS_KEY });
      queryClient.invalidateQueries({ queryKey: WISHLIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['product'] });
    },
  });

  function toggle(productId: string, currentlyWishlisted: boolean) {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      router.push('/account/login');
      return;
    }
    mutation.mutate({ productId, wishlisted: currentlyWishlisted });
  }

  return { toggle, isPending: mutation.isPending };
}

export function useClearWishlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productIds: string[]) => {
      await Promise.all(productIds.map((id) => api.delete(`/wishlist/${id}`, true)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WISHLIST_IDS_KEY });
      queryClient.invalidateQueries({ queryKey: WISHLIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

export function formatRatingCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export interface SharedWishlist {
  ownerName: string;
  items: WishlistItem[];
}

export function useSharedWishlist(token: string | undefined) {
  return useQuery<SharedWishlist>({
    queryKey: ['wishlist-shared', token],
    queryFn: () => api.get<SharedWishlist>(`/wishlist/shared/${encodeURIComponent(token!)}`),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}

export async function createWishlistShareLink(): Promise<string> {
  const result = await api.post<{ token: string }>('/wishlist/share', {}, true);
  if (!result?.token) throw new Error('Could not create share link');
  return result.token;
}
