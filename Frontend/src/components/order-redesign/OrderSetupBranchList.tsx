'use client';

import { Check, Loader2, MapPin, Navigation } from 'lucide-react';
import { cn } from '@/components/home-redesign/lib/cn';
import { orderSetupCopy } from '@/components/order-redesign/orderSetupCopy';
import { distanceKm, formatDistance, type MapLocation } from '@/components/order-redesign/orderSetupGeo';
import type { Ref } from 'react';

export type OrderSetupBranchRow = {
  id: string;
  name: string;
  location: MapLocation;
  distanceKm?: number | null;
  disabled?: boolean;
  disabledReason?: string;
  badge?: string;
};

type ListProps = {
  listRef?: Ref<HTMLUListElement>;
  branches: OrderSetupBranchRow[];
  selectedId: string | null;
  from?: MapLocation | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  loading?: boolean;
  emptyMessage?: string;
  group?: string;
  /** Phones: horizontal cards over the map. */
  carousel?: boolean;
  onFocus?: (id: string) => void;
  onHeightChange?: (height: number) => void;
};

function BranchOption({
  branch,
  group,
  card = false,
  selectedId,
  from,
  onSelect,
  onHover,
}: {
  branch: OrderSetupBranchRow;
  group: string;
  card?: boolean;
  selectedId: string | null;
  from?: MapLocation | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
}) {
  const isSelected = branch.id === selectedId;
  const tooFar = Boolean(branch.disabled);
  const dist =
    branch.distanceKm != null
      ? branch.distanceKm
      : from
        ? distanceKm(from, branch.location)
        : null;

  return (
    <label
      onPointerEnter={tooFar || !onHover ? undefined : () => onHover(branch.id)}
      onPointerLeave={tooFar || !onHover ? undefined : () => onHover(null)}
      className={cn(
        'relative flex gap-3 rounded-2xl ring-1 ring-brand-100 ring-inset transition-[background-color,box-shadow]',
        card ? 'h-full items-center bg-white p-3 shadow-lg shadow-brand-950/15' : 'items-start p-4',
        tooFar ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-brand-50/60',
        'has-checked:bg-brand-50 has-checked:ring-2 has-checked:ring-brand-600',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600',
      )}
    >
      <input
        type="radio"
        name={group}
        value={branch.id}
        checked={isSelected}
        disabled={tooFar}
        onChange={() => onSelect(branch.id)}
        className="sr-only"
      />
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full transition-colors',
          isSelected ? 'bg-brand-600 text-snow' : 'bg-brand-50 text-brand-600',
        )}
      >
        {isSelected ? (
          <Check className="size-5" strokeWidth={3} aria-hidden="true" />
        ) : (
          <MapPin className="size-5" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-brand-900">{branch.name}</span>
          {branch.badge ? (
            <span className="rounded-full bg-sun-300 px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-900">
              {branch.badge}
            </span>
          ) : null}
        </span>
        {(dist != null || branch.disabledReason) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {dist != null && (
              <span className="flex items-center gap-1 font-semibold text-brand-700">
                <Navigation className="size-3.5" aria-hidden="true" />
                {orderSetupCopy.distanceAway(formatDistance(dist))}
              </span>
            )}
            {branch.disabledReason ? (
              <span className="font-semibold text-slate-600">{branch.disabledReason}</span>
            ) : null}
          </span>
        )}
      </span>
    </label>
  );
}

/** Scrollable branch list (desktop) — reference BranchList. */
export function OrderSetupBranchList({
  listRef,
  branches,
  selectedId,
  from,
  onSelect,
  onHover,
  loading,
  emptyMessage,
  group = 'order-setup-branch',
}: ListProps) {
  if (loading) {
    return (
      <p role="status" className="mt-3 flex shrink-0 items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 shrink-0 animate-spin text-brand-500" aria-hidden="true" />
        {orderSetupCopy.findingBranches}
      </p>
    );
  }

  if (branches.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-600" role="status">
        {emptyMessage ?? orderSetupCopy.hintBranch}
      </p>
    );
  }

  return (
    <ul
      ref={listRef}
      aria-label={orderSetupCopy.branches}
      className="-mx-1 mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-width:none] max-md:hidden short:flex! [&::-webkit-scrollbar]:hidden"
    >
      {branches.map((branch) => (
        <li key={branch.id} data-branch={branch.id}>
          <BranchOption
            branch={branch}
            group={group}
            selectedId={selectedId}
            from={from}
            onSelect={onSelect}
            onHover={onHover}
          />
        </li>
      ))}
    </ul>
  );
}
