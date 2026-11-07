import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginPage from '@/components/login-redesign/LoginPage';

export const metadata: Metadata = {
  title: 'Sign In',
  robots: { index: false },
};

/** Sign in or join with a mobile number (components/login-redesign). Suspense: it reads ?ref= (useSearchParams). */
export default function AccountLoginPage() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
