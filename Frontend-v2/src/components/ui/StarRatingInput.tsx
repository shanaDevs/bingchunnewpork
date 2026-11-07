'use client';

import { Star } from 'lucide-react';

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: number;
  className?: string;
  showLabel?: boolean;
};

const LABELS = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export function StarRatingDisplay({
  value,
  size = 20,
  className = '',
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center gap-1 ${className}`} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <Star
            key={star}
            size={size}
            strokeWidth={1.5}
            className={filled ? 'text-amber-400' : 'text-amber-400/35'}
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            aria-hidden
          />
        );
      })}
    </div>
  );
}

export default function StarRatingInput({
  value,
  onChange,
  disabled = false,
  size = 32,
  className = '',
  showLabel = true,
}: Props) {
  return (
    <div className={className}>
      <div
        className="flex items-center justify-center gap-2"
        role="radiogroup"
        aria-label="Rate your experience from 1 to 5 stars"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= value;
          const active = value === star;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
              disabled={disabled}
              onClick={() => onChange(star)}
              className={`rounded-lg p-1.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 ${
                filled ? 'text-amber-400' : 'text-amber-400/40 hover:text-amber-300'
              } ${active ? 'scale-110 bg-amber-400/10' : ''}`}
            >
              <Star
                size={size}
                strokeWidth={1.5}
                className="block drop-shadow-sm"
                fill={filled ? 'currentColor' : 'none'}
                stroke="currentColor"
              />
            </button>
          );
        })}
      </div>
      {showLabel && value > 0 && (
        <p className="mt-2 text-center text-xs text-muted">{LABELS[value - 1]}</p>
      )}
    </div>
  );
}
