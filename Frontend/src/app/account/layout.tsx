'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { isDeletedAccountUser } from '@/hooks/useDeletedAccountGuard';

const PUBLIC_ACCOUNT_PATHS = new Set(['/account/login', '/account/register']);
const DELETED_ACCOUNT_HOME = '/account';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isPublic = PUBLIC_ACCOUNT_PATHS.has(pathname ?? '');
  const isDeleted = isDeletedAccountUser(user);

  useEffect(() => {
    if (!authHydrated || isPublic) return;
    if (!isAuthenticated) router.replace('/account/login');
  }, [authHydrated, isAuthenticated, isPublic, router]);

  useEffect(() => {
    if (!authHydrated || !isAuthenticated || !isDeleted) return;
    if (pathname !== DELETED_ACCOUNT_HOME) {
      router.replace(DELETED_ACCOUNT_HOME);
    }
  }, [authHydrated, isAuthenticated, isDeleted, pathname, router]);

  if (!authHydrated) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-muted text-sm">
        Loading your account…
      </div>
    );
  }

  if (!isPublic && !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
