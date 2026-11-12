'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current || typeof window === 'undefined') return;
    handledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      toast.error(decodeURIComponent(error));
      router.replace('/account/login');
      return;
    }

    const rawReturnTo = params.get('returnTo');
    // Mirror backend safeReturnTo: only same-origin paths (block //evil.com open redirects).
    const returnTo =
      typeof rawReturnTo === 'string' && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
        ? rawReturnTo
        : '/';

    void (async () => {
      try {
        const user = await api.get<User>('/auth/me', false);
        login(user);
        try {
          await import('@/lib/customerSession').then((m) => m.refreshCustomerAuth());
        } catch {
          // access expiry is optional; cookie session still valid
        }
        router.replace(returnTo);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Sign-in failed');
        router.replace('/account/login');
      }
    })();
  }, [login, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="flex items-center gap-3 text-muted">
        <Loader2 className="animate-spin text-brand" size={22} />
        <span>Completing sign-in…</span>
      </div>
    </div>
  );
}
