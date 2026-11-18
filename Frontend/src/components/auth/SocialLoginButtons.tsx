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
  /** Extra classes for the outer wrapper (e.g. login-redesign spacing). */
  className?: string;
  disabled?: boolean;
}

function isGoogleSdkReady() {
  return Boolean(typeof window !== 'undefined' && window.google?.accounts?.id);
}

export function SocialLoginButtons({
  onSuccess,
  redirectTo = '/',
  className,
  disabled = false,
}: SocialLoginButtonsProps) {
  const router = useRouter();
  const { login } = useAuthStore();
  const [googleReady, setGoogleReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const googleHostRef = useRef<HTMLDivElement>(null);
  const googleInitClientIdRef = useRef<string | null>(null);
  const handleGoogleCredentialRef = useRef<(credential: string) => void>(() => undefined);

  const { data: socialConfig, isLoading: configLoading } = useQuery<SocialAuthConfig>({
    queryKey: ['auth-social-config'],
    queryFn: () => api.get('/auth/social-config'),
    staleTime: 5 * 60_000,
  });

  const googleClientId =
    socialConfig?.google?.clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const googleEnabled = Boolean(
    (socialConfig?.google?.enabled || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) && googleClientId,
  );

  const completeLogin = useCallback(
    (user: User, accessExpiresAt?: number) => {
      login(user, { accessExpiresAt });
      toast.success('Signed in with Google!');
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

  const renderOfficialButton = useCallback(() => {
    const host = googleHostRef.current;
    const wrap = host?.parentElement;
    if (!host || !wrap || !isGoogleSdkReady() || !googleClientId) return;

    if (googleInitClientIdRef.current !== googleClientId) {
      window.google!.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (response.credential) void handleGoogleCredentialRef.current(response.credential);
        },
      });
      googleInitClientIdRef.current = googleClientId;
    }

    host.innerHTML = '';
    const width = Math.max(240, Math.min(400, Math.floor(wrap.clientWidth || 320)));
    window.google!.accounts.id.renderButton(host, {
      theme: 'outline',
      size: 'large',
      width,
      text: 'continue_with',
      shape: 'pill',
    });
  }, [googleClientId]);

  // Poll briefly if Script onLoad races ahead of the GIS global.
  useEffect(() => {
    if (!googleEnabled) return;
    if (isGoogleSdkReady()) {
      setGoogleReady(true);
      return;
    }
    const id = window.setInterval(() => {
      if (isGoogleSdkReady()) {
        setGoogleReady(true);
        window.clearInterval(id);
      }
    }, 200);
    const stop = window.setTimeout(() => window.clearInterval(id), 8000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [googleEnabled]);

  useEffect(() => {
    if (!googleReady || !googleEnabled || disabled || loading) return;
    renderOfficialButton();
  }, [googleReady, googleEnabled, disabled, loading, renderOfficialButton]);

  if (!configLoading && !googleEnabled) {
    return (
      <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
        Google sign-in is not configured yet.
      </p>
    );
  }

  if (configLoading && !googleClientId) {
    return (
      <div className={className}>
        <div className="inline-flex h-12.5 w-full items-center justify-center gap-3 rounded-full bg-white text-[0.9375rem] font-semibold text-slate-400 ring-1 ring-slate-200 ring-inset low:h-11">
          Loading Google…
        </div>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGoogleReady(true)}
        onError={() => {
          window.setTimeout(() => {
            if (!isGoogleSdkReady()) {
              toast.error('Could not load Google sign-in. Allow accounts.google.com or refresh.');
            }
          }, 2500);
        }}
      />

      <div className={className}>
        <div className="relative w-full">
          <div
            className="pointer-events-none inline-flex h-12.5 w-full items-center justify-center gap-3 rounded-full bg-white text-[0.9375rem] font-semibold text-slate-700 shadow-[0_1px_2px_rgb(15_33_71/0.06)] ring-1 ring-slate-200 ring-inset low:h-11"
            aria-hidden
          >
            <GoogleIcon />
            {loading ? 'Signing in…' : !googleReady ? 'Loading Google…' : 'Continue with Google'}
          </div>
          <div
            ref={googleHostRef}
            className="absolute inset-0 z-10 overflow-hidden opacity-[0.02] [& iframe]:!h-full [& iframe]:!min-h-full [& iframe]:!w-full"
            aria-label="Continue with Google"
          />
        </div>
      </div>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className="size-5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
