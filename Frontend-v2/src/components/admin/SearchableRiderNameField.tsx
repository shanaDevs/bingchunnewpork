'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import type { Driver, DriverDutyStatus } from '@/types';

type Suggestion = Pick<Driver, 'id' | 'name' | 'dutyStatus'>;

type Props = {
  value: string;
  onChange: (name: string) => void;
  poolStoreId?: string;
  showAllBranches?: boolean;
  filterStoreId?: string;
  enabled?: boolean;
  placeholder?: string;
};

function dutyLabel(status: DriverDutyStatus): string {
  if (status === 'ONLINE') return 'Online';
  if (status === 'ON_DELIVERY') return 'On delivery';
  return 'Off duty';
}

function buildSuggestEndpoint(
  query: string,
  args: {
    poolStoreId?: string;
    showAllBranches?: boolean;
    filterStoreId?: string;
  },
): string {
  const qs = new URLSearchParams();
  qs.set('page', '1');
  qs.set('pageSize', '8');
  const trimmed = query.trim();
  if (trimmed) qs.set('name', trimmed);
  if (!args.poolStoreId && args.showAllBranches && args.filterStoreId) {
    qs.set('storeId', args.filterStoreId);
  }
  const queryStr = `?${qs.toString()}`;
  return args.poolStoreId
    ? `/admin/branches/${encodeURIComponent(args.poolStoreId)}/driver-pool${queryStr}`
    : `/admin/drivers${queryStr}`;
}

function extractDriverRows(data: unknown): Suggestion[] {
  if (data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)) {
    return ((data as { rows: Driver[] }).rows ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      dutyStatus: d.dutyStatus,
    }));
  }
  if (Array.isArray(data)) {
    return (data as Driver[]).map((d) => ({ id: d.id, name: d.name, dutyStatus: d.dutyStatus }));
  }
  return [];
}

export default function SearchableRiderNameField({
  value,
  onChange,
  poolStoreId,
  showAllBranches = false,
  filterStoreId = '',
  enabled = true,
  placeholder = 'Search by rider name...',
}: Props) {
  const [open, setOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = 'rider-name-suggestions';

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQ(value.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [value]);

  useEffect(() => {
    if (!enabled || debouncedQ.length < 1) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const endpoint = buildSuggestEndpoint(debouncedQ, {
      poolStoreId,
      showAllBranches,
      filterStoreId,
    });

    adminFetch(endpoint)
      .then((res) => {
        if (cancelled) return;
        setSuggestions(extractDriverRows(res.data));
        setHighlight(0);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQ, poolStoreId, showAllBranches, filterStoreId, enabled]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const showList = open && value.trim().length > 0;

  function selectSuggestion(name: string) {
    onChange(name);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className={`input-icon-wrap w-full${value ? ' input-icon-wrap--end' : ''}`}>
        <Search size={14} className="input-icon" aria-hidden />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (value.trim()) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!showList || suggestions.length === 0) {
              if (e.key === 'Escape') setOpen(false);
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const picked = suggestions[highlight];
              if (picked) selectSuggestion(picked.name);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="input-field text-sm w-full"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="input-action p-1 text-muted hover:text-fg"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-navy-border bg-navy-light py-1 shadow-lg"
        >
          {loading ? (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Searching riders…
            </li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No matching riders</li>
          ) : (
            suggestions.map((s, index) => (
              <li key={s.id} role="option" aria-selected={index === highlight}>
                <button
                  type="button"
                  className={[
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-navy-border/40',
                    index === highlight ? 'bg-navy-border/30 text-fg' : 'text-fg',
                  ].join(' ')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(s.name)}
                >
                  <span>{s.name}</span>
                  <span className="text-[11px] text-muted">{dutyLabel(s.dutyStatus)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
