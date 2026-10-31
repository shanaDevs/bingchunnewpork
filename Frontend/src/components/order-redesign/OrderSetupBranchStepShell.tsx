'use client';

import type { ReactNode } from 'react';

/** Two-column branch step shell from BranchSelectModal. */
export function OrderSetupBranchStepShell({
  sidebar,
  map,
}: {
  sidebar: ReactNode;
  map: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-3 sm:px-8">
      <div className="flex min-h-0 flex-col gap-4 max-md:flex-1 md:mt-1 md:grid md:h-123 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:grid-rows-[minmax(0,1fr)] md:gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] short:grid short:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] short:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col max-md:shrink-0">{sidebar}</div>
        <div className="relative grid min-h-0 grid-rows-[minmax(0,1fr)] max-md:min-h-48 max-md:flex-1 short:min-h-0!">
          {map}
        </div>
      </div>
    </div>
  );
}
