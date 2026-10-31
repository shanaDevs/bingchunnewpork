'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/components/home-redesign/lib/cn';
import type { OrderSetupBranchRow } from '@/components/order-redesign/OrderSetupBranchList';
import { orderSetupCopy } from '@/components/order-redesign/orderSetupCopy';
import { Check, MapPin, Navigation } from 'lucide-react';
import { distanceKm, formatDistance, type MapLocation } from '@/components/order-redesign/orderSetupGeo';

type CarouselProps = {
  branches: OrderSetupBranchRow[];
  selectedId: string | null;
  from?: MapLocation | null;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onHeightChange: (height: number) => void;
};

function CarouselCard({
  branch,
  selectedId,
  from,
  onSelect,
}: {
  branch: OrderSetupBranchRow;
  selectedId: string | null;
  from?: MapLocation | null;
  onSelect: (id: string) => void;
}) {
  const isSelected = branch.id === selectedId;
  const dist =
    branch.distanceKm != null
      ? branch.distanceKm
      : from
        ? distanceKm(from, branch.location)
        : null;

  return (
    <label
      className={cn(
        'relative flex h-full cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 shadow-lg shadow-brand-950/15 ring-1 ring-brand-100 ring-inset transition-[background-color,box-shadow]',
        'has-checked:ring-2 has-checked:ring-brand-600',
      )}
    >
      <input
        type="radio"
        name="order-setup-branch-card"
        checked={isSelected}
        onChange={() => onSelect(branch.id)}
        className="sr-only"
      />
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full',
          isSelected ? 'bg-brand-600 text-snow' : 'bg-brand-50 text-brand-600',
        )}
      >
        {isSelected ? <Check className="size-5" strokeWidth={3} /> : <MapPin className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-brand-900">{branch.name}</span>
        {dist != null && (
          <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-700">
            <Navigation className="size-3.5" />
            {orderSetupCopy.distanceAway(formatDistance(dist))}
          </span>
        )}
      </span>
    </label>
  );
}

export function OrderSetupBranchCarousel({
  branches,
  selectedId,
  from,
  onSelect,
  onFocus,
  onHeightChange,
}: CarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const selfScrolling = useRef(false);
  const shown = useRef(false);
  const listKey = branches.map((b) => b.id).join(',');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => onHeightChange(root.offsetHeight));
    observer.observe(root);
    return () => {
      observer.disconnect();
      onHeightChange(0);
    };
  }, [onHeightChange]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const card = selectedId ? list.querySelector<HTMLElement>(`[data-branch="${selectedId}"]`) : null;
    const max = list.scrollWidth - list.clientWidth;
    const left = card
      ? Math.min(Math.max(card.offsetLeft + card.offsetWidth / 2 - list.clientWidth / 2, 0), max)
      : 0;
    const smooth = shown.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    shown.current = true;
    if (Math.abs(left - list.scrollLeft) < 1) return;
    selfScrolling.current = true;
    list.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }, [selectedId, listKey]);

  const settle = () => {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      if (selfScrolling.current) {
        selfScrolling.current = false;
        return;
      }
      const centre = list.scrollLeft + list.clientWidth / 2;
      let nearest: HTMLElement | null = null;
      for (const card of list.children as HTMLCollectionOf<HTMLElement>) {
        const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - centre);
        if (
          !nearest ||
          distance < Math.abs(nearest.offsetLeft + nearest.offsetWidth / 2 - centre)
        ) {
          nearest = card;
        }
      }
      if (nearest?.dataset.branch) onFocus(nearest.dataset.branch);
    }, 120);
  };

  if (branches.length === 0) return null;

  return (
    <div ref={rootRef} className="absolute inset-x-0 bottom-0 z-10 md:hidden short:hidden">
      <ul
        ref={listRef}
        aria-label={orderSetupCopy.branches}
        onScroll={settle}
        className="relative flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {branches.map((branch) => (
          <li key={branch.id} data-branch={branch.id} className="w-[85%] max-w-80 shrink-0 snap-center">
            <CarouselCard branch={branch} selectedId={selectedId} from={from} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </div>
  );
}
