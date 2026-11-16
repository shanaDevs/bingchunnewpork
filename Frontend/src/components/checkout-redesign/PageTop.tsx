import type { ReactNode } from 'react';
import { cn } from '@/components/home-redesign/lib/cn';
import { heroBackdropImage } from '@/components/home-redesign/sections/hero/hero.config';

/** Thin brand-blue strip behind the fixed header for pages without a full hero. */
export function HeaderBand() {
  return (
    <div
      aria-hidden="true"
      className="pt-22 pb-9 sm:pb-14 lg:pb-10 print:hidden"
      style={{ backgroundImage: heroBackdropImage }}
    />
  );
}

export const titleHighlight = (chunks: ReactNode) => (
  <span className="relative isolate inline-block px-[0.1em] text-brand-700">
    <span
      aria-hidden="true"
      className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.4em] -rotate-2 rounded-full bg-sun-300"
    />
    {chunks}
  </span>
);

export function PageTitle({
  headline,
  intro,
  className,
}: {
  headline: ReactNode;
  intro: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 sm:mb-8', className)}>
      <h1 className="font-display-condensed text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] text-brand-950 uppercase">
        {headline}
      </h1>
      <p className="mt-2 text-base text-slate-600 sm:text-lg">{intro}</p>
    </header>
  );
}
