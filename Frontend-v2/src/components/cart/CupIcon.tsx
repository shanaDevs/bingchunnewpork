'use client';

import PouringCup from '@/components/cart/PouringCup';
import { cupFillFromCount } from '@/lib/cupFill';

export type CupIconSize = 'sm' | 'md' | 'lg';

export interface CupIconProps {
  fillLevel?: number;
  fillFrom?: number;
  pouring?: boolean;
  size?: CupIconSize;
  itemCount?: number;
  className?: string;
  inverted?: boolean;
}

export { cupFillFromCount };

export default function CupIcon({
  fillLevel = 0,
  fillFrom,
  pouring = false,
  size = 'md',
  itemCount,
  className = '',
  inverted = false,
}: CupIconProps) {
  return (
    <PouringCup
      fillLevel={fillLevel}
      fillFrom={fillFrom}
      pouring={pouring}
      size={size}
      itemCount={itemCount}
      className={className}
      inverted={inverted}
    />
  );
}
