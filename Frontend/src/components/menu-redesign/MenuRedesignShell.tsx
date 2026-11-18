'use client';

import { homeFontVariables } from '@/components/home-redesign/fonts';
import { SiteFooter } from '@/components/home-redesign/layout/SiteFooter';
import { SiteHeader } from '@/components/home-redesign/layout/SiteHeader';

export function MenuRedesignShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`home-redesign menu-redesign-shell ${homeFontVariables} relative flex min-h-dvh flex-col antialiased`}>
      <SiteHeader />
      <main className="flex-1 overflow-visible">{children}</main>
      <SiteFooter />
    </div>
  );
}
