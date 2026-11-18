'use client';

import { homeFontVariables } from '@/components/home-redesign/fonts';
import { SiteFooter } from '@/components/home-redesign/layout/SiteFooter';
import { SiteHeader } from '@/components/home-redesign/layout/SiteHeader';
import { HeaderBand } from './PageTop';
import './checkout-redesign.css';

export function CheckoutRedesignShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`home-redesign checkout-redesign-shell ${homeFontVariables} relative flex min-h-dvh flex-col bg-white antialiased`}
    >
      <SiteHeader />
      <HeaderBand />
      <main className="relative -mt-8 flex-1 overflow-visible rounded-t-[2.5rem] bg-white sm:-mt-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
