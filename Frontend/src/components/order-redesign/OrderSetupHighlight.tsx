import type { ReactNode } from 'react';

/** Brand highlight: yellow marker stroke (branch picker headings). */
export function OrderSetupHighlight({ children }: { children: ReactNode }) {
  return (
    <span className="relative isolate inline-block px-[0.1em] text-brand-700">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.45em] -rotate-2 rounded-full bg-sun-300"
      />
      {children}
    </span>
  );
}
