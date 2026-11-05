'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { api } from '@/lib/api';
import type { User } from '@/types';

const DELETED_ACCOUNT_HOME = '/account';
const PUBLIC_ACCOUNT_PATHS = new Set(['/account/login', '/account/register']);

/** Redirect soft-deleted customers to profile-only access. */
export function useDeletedAccountGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userDeleted = useAuthStore((s) => Boolean(s.user?.isDeleted));
  const updateUser = useAuthStore((s) => s.updateUser);

  const { data: profile } = useQuery({
    queryKey: ['me-deleted-status'],
    queryFn: () => api.get<User>('/auth/me', true),
    enabled: authHydrated && isAuthenticated,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!profile) return;
    const current = useAuthStore.getState().user;
    // Avoid looping when session has a token but user has not hydrated yet —
    // updateUser cannot apply fields without a user object.
    if (!current) return;
    const nextDeleted = Boolean(profile.isDeleted);
    if (Boolean(current.isDeleted) === nextDeleted) return;
    updateUser({ isDeleted: nextDeleted });
  }, [profile, userDeleted, updateUser]);

  useEffect(() => {
    if (!authHydrated || !isAuthenticated || !userDeleted) return;
    if (PUBLIC_ACCOUNT_PATHS.has(pathname ?? '')) return;
    if (pathname === DELETED_ACCOUNT_HOME) return;
    router.replace(DELETED_ACCOUNT_HOME);
  }, [authHydrated, isAuthenticated, userDeleted, pathname, router]);
}

export function isDeletedAccountUser(user: { isDeleted?: boolean } | null | undefined): boolean {
  return Boolean(user?.isDeleted);
}
