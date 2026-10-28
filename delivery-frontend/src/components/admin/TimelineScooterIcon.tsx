'use client';

import { Bike } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  moving?: boolean;
  stranded?: boolean;
  className?: string;
};

/** Bicycle marker for the Timeline. Wheelie rotates around the rear wheel. */
export default function TimelineScooterIcon({ moving = false, stranded = false, className }: Props) {
  return (
    <Bike
      aria-hidden
      strokeWidth={2.4}
      className={cn(
        'delivery-timeline-scooter',
        stranded ? 'text-red-500' : 'text-brand-dark',
        moving && 'delivery-timeline-scooter--wheelie',
        className,
      )}
    />
  );
}
