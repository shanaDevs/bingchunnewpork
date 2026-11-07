'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface WishlistScrollRailProps {
  children: ReactNode;
  className?: string;
  ariaLabel: string;
}

export default function WishlistScrollRail({
  children,
  className = '',
  ariaLabel,
}: WishlistScrollRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollState, children]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.wishlist-dash__rail-item');
    const gap = 9;
    const amount = (card?.offsetWidth ?? 144) + gap;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }, []);

  return (
    <div className={`wishlist-dash__rail ${className}`.trim()}>
      <button
        type="button"
        className="wishlist-dash__rail-arrow wishlist-dash__rail-arrow--prev"
        aria-label="Scroll previous"
        disabled={!canScrollLeft}
        onClick={() => scroll('left')}
      >
        <ChevronLeft size={20} strokeWidth={2.25} />
      </button>

      <div
        ref={scrollRef}
        className="wishlist-dash__rail-track"
        onScroll={updateScrollState}
        aria-label={ariaLabel}
      >
        {children}
      </div>

      <button
        type="button"
        className="wishlist-dash__rail-arrow wishlist-dash__rail-arrow--next"
        aria-label="Scroll next"
        disabled={!canScrollRight}
        onClick={() => scroll('right')}
      >
        <ChevronRight size={20} strokeWidth={2.25} />
      </button>
    </div>
  );
}
