'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { isDeletedAccountUser } from '@/hooks/useDeletedAccountGuard';
import { ACCOUNT_SHELL_PATHS, AccountShell } from '@/components/account-redesign/AccountShell';

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
  /** A redesigned page: AccountShell guards it itself (so logging out there can go home rather than to sign-in). */
  const inShell = ACCOUNT_SHELL_PATHS.has(pathname ?? '');

  useEffect(() => {
    if (!authHydrated || isPublic || inShell) return;
    if (!isAuthenticated) router.replace('/account/login');
  }, [authHydrated, isAuthenticated, isPublic, inShell, router]);

  useEffect(() => {
    if (!authHydrated || !isAuthenticated || !isDeleted) return;
    if (pathname !== DELETED_ACCOUNT_HOME) {
      router.replace(DELETED_ACCOUNT_HOME);
    }
  }, [authHydrated, isAuthenticated, isDeleted, pathname, router]);

  if (inShell) return <AccountShell>{children}</AccountShell>;

  // Sign-in pages render immediately; other routes show a panel-shaped shell while auth hydrates.
  if (!authHydrated && !isPublic) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8" aria-busy="true" aria-label="Loading account">
        <div className="mb-6 h-10 w-48 rounded-xl bg-navy-light/50 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-navy-border/60 bg-navy-card/40 p-4 space-y-3"
            >
              <div className="h-4 w-2/5 rounded-full bg-navy-light/60 animate-pulse" />
              <div className="h-3 w-4/5 rounded-full bg-navy-light/50 animate-pulse" />
              <div className="h-3 w-3/5 rounded-full bg-navy-light/40 animate-pulse" />
              <div className="mt-4 h-24 rounded-xl bg-navy-light/40 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isPublic && !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
