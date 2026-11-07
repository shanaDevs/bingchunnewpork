'use client';

import CupIcon, { type CupIconSize } from '@/components/cart/CupIcon';

export interface AddToCupIconProps {
  /** White cup variant for brand / blue buttons */
  inverted?: boolean;
  size?: CupIconSize;
  className?: string;
  /** Liquid fill level 0–1 */
  fillLevel?: number;
}

/** Branded Bing Chun cup for “Add to Cup” actions */
export default function AddToCupIcon({
  inverted = false,
  size = 'sm',
  className = '',
  fillLevel = 0.4,
}: AddToCupIconProps) {
  return (
    <span className={`add-to-cup-icon ${className}`.trim()} aria-hidden>
      <CupIcon size={size} fillLevel={fillLevel} inverted={inverted} />
    </span>
  );
}
