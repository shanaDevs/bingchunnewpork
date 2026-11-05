'use client';

import { Star } from 'lucide-react';

interface MascotHeadRatingProps {
  rating: number;
  maxRating?: number;
  onRatingChange?: (rating: number) => void;
  size?: number;
  interactive?: boolean;
  className?: string;
}

/** Star rating display/input (legacy name kept for existing imports). */
export default function MascotHeadRating({
  rating,
  maxRating = 5,
  onRatingChange,
  size = 18,
  interactive = false,
  className = '',
}: MascotHeadRatingProps) {
  const value = Math.round(rating);

  return (
    <div
      className={`mascot-head-rating star-rating flex items-center gap-0.5 min-w-0 max-w-full overflow-hidden ${className}`}
      aria-label={`${value} out of ${maxRating} stars`}
    >
      {Array.from({ length: maxRating }, (_, i) => i + 1).map((num) => {
        const isActive = num <= value;

        return (
          <button
            key={num}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onRatingChange?.(num)}
            style={{ width: size, height: size }}
            className={`mascot-head-rating__btn star-rating__btn flex items-center justify-center shrink-0 transition-all duration-200 transform ${
              interactive ? 'cursor-pointer hover:scale-125 active:scale-95' : 'cursor-default'
            } ${isActive ? 'text-amber-400' : 'text-amber-400/35'}`}
            title={`${num} star${num > 1 ? 's' : ''}`}
            tabIndex={interactive ? 0 : -1}
            aria-hidden={!interactive}
          >
            <Star
              size={size}
              strokeWidth={1.5}
              className="block"
              fill={isActive ? 'currentColor' : 'none'}
              stroke="currentColor"
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
