'use client';

import { Search, type LucideIcon } from 'lucide-react';
import type { Ref } from 'react';

type Props = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon?: LucideIcon;
  inputRef?: Ref<HTMLInputElement>;
};

/** Rounded search field from BranchSelectModal SearchField. */
export function OrderSetupSearchField({
  label,
  placeholder,
  value,
  onChange,
  icon: Icon = Search,
  inputRef,
}: Props) {
  return (
    <label className="relative block shrink-0">
      <span className="sr-only">{label}</span>
      <Icon
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-brand-500"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-full bg-brand-50/70 py-3 pr-4 pl-12 text-base text-slate-900 ring-1 ring-brand-100 ring-inset transition-shadow placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-600 focus:outline-none"
      />
    </label>
  );
}
