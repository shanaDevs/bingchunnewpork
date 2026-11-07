'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import type { User } from '@/types';

type SocialAuthConfig = {
  google: { enabled: boolean; clientId: string | null };
};

interface SocialLoginButtonsProps {
  onSuccess?: () => void;
  /** Where to send the user after Google sign-in when onSuccess is not provided. */
  redirectTo?: string;
}

export function SocialLoginButtons({ onSuccess, redirectTo = '/' }: SocialLoginButtonsProps) {
  const router = useRouter();
  const { login } = useAuthStore();
  const [googleReady, setGoogleReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const googleInitClientIdRef = useRef<string | null>(null);
  const handleGoogleCredentialRef = useRef<(credential: string) => void>(() => undefined);

  const { data: socialConfig, isLoading: configLoading } = useQuery<SocialAuthConfig>({
    queryKey: ['auth-social-config'],
    queryFn: () => api.get('/auth/social-config'),
    staleTime: 5 * 60_000,
  });

  const googleClientId =
    socialConfig?.google?.clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const googleEnabled = Boolean(socialConfig?.google?.enabled && googleClientId);

  const completeLogin = useCallback(
    (user: User, accessExpiresAt?: number) => {
      login(user, { accessExpiresAt });
      toast.success('Signed in with Google! 🧋');
      if (onSuccess) onSuccess();
      else router.push(redirectTo);
    },
    [login, onSuccess, redirectTo, router],
  );

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setLoading(true);
      try {
        const res = await api.post<{ user: User; accessExpiresAt?: number }>('/auth/google', {
          idToken: credential,
        });
        completeLogin(res.user, res.accessExpiresAt);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Google sign-in failed';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [completeLogin],
  );

  handleGoogleCredentialRef.current = handleGoogleCredential;

  const renderGoogleButton = useCallback(() => {
    if (!googleBtnRef.current || !window.google?.accounts?.id) return;

    googleBtnRef.current.innerHTML = '';
    const parentW = googleBtnRef.current.parentElement?.clientWidth ?? 320;
    const width = Math.min(400, Math.max(240, parentW));
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline',
      size: 'large',
      width,
      text: 'continue_with',
      shape: 'rectangular',
    });
  }, []);

  useEffect(() => {
    if (!googleReady || !googleClientId || !window.google?.accounts?.id) return;
    if (googleInitClientIdRef.current === googleClientId) return;

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        if (response.credential) void handleGoogleCredentialRef.current(response.credential);
      },
    });

    googleInitClientIdRef.current = googleClientId;
    renderGoogleButton();
  }, [googleReady, googleClientId, renderGoogleButton]);

  useEffect(() => {
    if (!googleReady || googleInitClientIdRef.current !== googleClientId) return;
    renderGoogleButton();
  }, [googleReady, googleClientId, renderGoogleButton]);

  const showSetupHint = !configLoading && !googleEnabled;

  if (!configLoading && !googleEnabled) {
    return showSetupHint ? (
      <p className="text-xs text-center text-muted leading-relaxed mt-4">
        Add <code className="text-brand">GOOGLE_CLIENT_ID</code> to{' '}
        <code className="text-brand">backend/.env</code>, then restart the API server.
      </p>
    ) : null;
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGoogleReady(true)}
      />

      <div className="space-y-3 mt-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-navy-border" />
          <span className="text-xs text-muted uppercase tracking-wide">or continue with</span>
          <div className="flex-1 h-px bg-navy-border" />
        </div>

        <div className="relative w-full min-h-[44px]">
          <div
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-navy-border bg-white text-fg text-sm font-medium pointer-events-none"
            aria-hidden
          >
            <GoogleIcon />
            {loading ? 'Signing in...' : 'Continue with Google'}
          </div>
          <div
            ref={googleBtnRef}
            className="absolute inset-0 z-10 flex justify-center overflow-hidden opacity-[0.011] cursor-pointer"
            aria-label="Continue with Google"
          />
        </div>
      </div>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
