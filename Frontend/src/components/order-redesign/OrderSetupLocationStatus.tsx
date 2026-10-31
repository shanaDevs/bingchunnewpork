'use client';

import { LocateFixed, Loader2 } from 'lucide-react';
import { cn } from '@/components/home-redesign/lib/cn';
import { orderSetupCopy } from '@/components/order-redesign/orderSetupCopy';

type Props = {
  locating: boolean;
  located: boolean;
};

/** Green compass line under search (reference LocationStatus pickup). */
export function OrderSetupLocationStatus({ locating, located }: Props) {
  if (locating) {
    return (
      <p role="status" className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
        <Loader2
          className="mt-0.75 size-3.5 shrink-0 animate-spin text-brand-500"
          aria-hidden="true"
        />
        <span>{orderSetupCopy.findingBranches}</span>
      </p>
    );
  }

  if (!located) return null;

  return (
    <p role="status" className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
      <LocateFixed className="mt-0.75 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
      <span>
        <strong className="font-semibold text-emerald-700">{orderSetupCopy.nearestFirst.split(',')[0]}</strong>
        , based on your location
      </span>
    </p>
  );
}
