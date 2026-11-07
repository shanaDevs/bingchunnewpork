'use client';

import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

type Props = {
  value: number;
  onChange: (year: number) => void;
  minYear?: number;
  maxYear?: number;
  className?: string;
};

export default function YearSelect({
  value,
  onChange,
  minYear = 2020,
  maxYear = new Date().getFullYear(),
  className = '',
}: Props) {
  const years = useMemo(() => {
    const list: number[] = [];
    for (let year = maxYear; year >= minYear; year -= 1) {
      list.push(year);
    }
    return list;
  }, [minYear, maxYear]);

  return (
    <div className={`relative ${className}`.trim()}>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="payment-history-header__branch-select input-field w-full appearance-none pr-8 text-sm"
        aria-label="Select year"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60"
      />
    </div>
  );
}
