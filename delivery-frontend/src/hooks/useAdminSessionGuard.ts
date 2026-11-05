'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getAdminSession } from '@/lib/adminAuth';
import {
  ensureAdminAccessToken,
  forceAdminLogout,
  registerAdminForceLogoutHandler,
  touchAdminActivity,
} from '@/lib/adminSession';

const KEEP_ALIVE_MS = 30 * 1000;

export function useAdminSessionGuard(enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    registerAdminForceLogoutHandler((message) => {
      toast.error(message);
      router.replace('/login');
    });

    const logoutExpired = (message: string) => {
      forceAdminLogout(message);
    };

    const onActivity = () => touchAdminActivity();
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);
    window.addEventListener('scroll', onActivity);

    const tick = async () => {
      if (!getAdminSession()) return;

      // Keep access cookie/JWT fresh via refresh token — no idle auto-logout.
      const ok = await ensureAdminAccessToken();
      if (!ok && getAdminSession()) {
        logoutExpired('Session expired. Please sign in again.');
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };

    const interval = window.setInterval(() => {
      void tick();
    }, KEEP_ALIVE_MS);

    window.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('pageshow', onVisible);

    void tick();

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('scroll', onActivity);
      window.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('pageshow', onVisible);
      registerAdminForceLogoutHandler(() => undefined);
    };
  }, [enabled, router]);
}
