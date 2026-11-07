'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Store = { id: string; name: string };

type Props = {
  stores: Store[];
  value: string | undefined;
  onChange: (storeId: string) => void;
  formatName: (name: string) => string;
  allowAll?: boolean;
  placeholder?: string;
  className?: string;
  fullWidth?: boolean;
  /** Compact trigger matching brand leaderboard cards (text-xs, gray border). */
  compact?: boolean;
};

export default function SearchableBranchSelect({
  stores,
  value,
  onChange,
  formatName,
  allowAll = true,
  placeholder = 'All Branches',
  className = '',
  fullWidth = false,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const storeList = Array.isArray(stores) ? stores : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return storeList;
    return storeList.filter(
      (s) =>
        formatName(s.name).toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [storeList, search, formatName]);

  const selectedLabel = value
    ? formatName(storeList.find((s) => s.id === value)?.name ?? '')
    : placeholder;

  const select = (storeId: string) => {
    onChange(storeId);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className={fullWidth ? 'w-full' : className}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            requestAnimationFrame(() => {
              searchRef.current?.focus({ preventScroll: true });
            });
          } else {
            setSearch('');
          }
        }}
      >
        <PopoverTrigger
          className={
            compact
              ? 'inline-flex min-w-0 w-full max-w-[10rem] items-center justify-between gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs text-fg'
              : fullWidth
                ? 'input-field flex w-full max-w-none min-w-0 items-center justify-between gap-2 text-sm'
                : 'payment-history-header__branch-select input-field flex w-full min-w-0 items-center justify-between gap-2 text-sm'
          }
          aria-label="Select branch"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown size={14} className="shrink-0 opacity-60" />
        </PopoverTrigger>
        <PopoverContent
          className="min-w-[200px] p-0"
          align="start"
          sideOffset={8}
        >
        <div className="border-b border-[var(--color-navy-border)] p-2">
          <div className="input-icon-wrap">
            <Search size={14} className="input-icon" aria-hidden />
            <input
              ref={searchRef}
              className="input-field text-xs"
              placeholder="Search branches..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <ul className="max-h-52 overflow-y-auto py-1">
          {allowAll && (
            <li>
              <button
                type="button"
                className={[
                  'w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-input-bg)]',
                  !value
                    ? 'font-semibold text-[var(--color-brand)]'
                    : 'text-[var(--color-text)]',
                ].join(' ')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select('')}
              >
                {placeholder}
              </button>
            </li>
          )}
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={[
                  'w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-input-bg)]',
                  value === s.id
                    ? 'font-semibold text-[var(--color-brand)]'
                    : 'text-[var(--color-text)]',
                ].join(' ')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(s.id)}
              >
                {formatName(s.name)}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--color-text-muted)]">No branches found</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
    </div>
  );
}
