'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import CupIcon, { cupFillFromCount } from '@/components/cart/CupIcon';
import { useClientHydrated } from '@/hooks/useClientHydrated';
import { useCupPourPulse } from '@/hooks/useCupPourPulse';
import FloatingRewardsPeek from '@/components/cart/FloatingRewardsPeek';

export type CupCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const STORAGE_KEY = 'bc-floating-cup-corner';
const CUP_SIZE = 56;
const EDGE = 12;
const HEADER_OFFSET = 64;
const BOTTOM_MOBILE_OFFSET = 20;
const DRAG_CLICK_THRESHOLD = 6;
const BOTTOM_NAV_HEIGHT_MOBILE = 84;

function readStoredCorner(): CupCorner {
  if (typeof window === 'undefined') return 'bottom-right';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'top-left' || v === 'top-right' || v === 'bottom-left' || v === 'bottom-right') {
      return v;
    }
  } catch {
    /* ignore */
  }
  return 'bottom-right';
}

function bottomNavOffset(): number {
  if (typeof window === 'undefined') return BOTTOM_MOBILE_OFFSET;
  if (window.innerWidth >= 768) return 16;
  return BOTTOM_NAV_HEIGHT_MOBILE + BOTTOM_MOBILE_OFFSET;
}

/** Keep the cup inside the visible viewport so it never “disappears” off-screen. */
function clampToViewport(x: number, y: number): { x: number; y: number } {
  const navOffset = bottomNavOffset();
  const minX = EDGE;
  const maxX = Math.max(EDGE, window.innerWidth - EDGE - CUP_SIZE);
  const minY = HEADER_OFFSET + EDGE;
  const maxY = Math.max(minY, window.innerHeight - navOffset - EDGE - CUP_SIZE);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

function cornerToPoint(corner: CupCorner): { x: number; y: number } {
  const navOffset = bottomNavOffset();
  const leftX = EDGE;
  const rightX = Math.max(EDGE, window.innerWidth - EDGE - CUP_SIZE);
  const topY = HEADER_OFFSET + EDGE;
  const bottomY = Math.max(topY, window.innerHeight - navOffset - EDGE - CUP_SIZE);

  switch (corner) {
    case 'top-left':
      return clampToViewport(leftX, topY);
    case 'top-right':
      return clampToViewport(rightX, topY);
    case 'bottom-left':
      return clampToViewport(leftX, bottomY);
    case 'bottom-right':
    default:
      return clampToViewport(rightX, bottomY);
  }
}

function nearestCorner(x: number, y: number): CupCorner {
  const centers: { corner: CupCorner; x: number; y: number }[] = (
    ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as CupCorner[]
  ).map((corner) => {
    const p = cornerToPoint(corner);
    return { corner, x: p.x + CUP_SIZE / 2, y: p.y + CUP_SIZE / 2 };
  });

  let best: CupCorner = 'bottom-right';
  let bestDist = Infinity;
  for (const c of centers) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c.corner;
    }
  }
  return best;
}

export default function FloatingCart() {
  const router = useRouter();
  const hydrated = useClientHydrated();
  const itemCount = useCartStore((s) => s.itemCount());
  const pourPulse = useCupPourPulse();
  const displayCount = hydrated ? itemCount : 0;
  const fillLevel = cupFillFromCount(displayCount);

  const [ready, setReady] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const dragged = useRef(false);
  const suppressClickUntil = useRef(0);
  const cornerRef = useRef<CupCorner>('bottom-right');

  const snapToCorner = useCallback(
    (next: CupCorner, spring = true) => {
      cornerRef.current = next;
      const p = cornerToPoint(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      if (spring) {
        animate(x, p.x, { type: 'spring', stiffness: 420, damping: 32 });
        animate(y, p.y, { type: 'spring', stiffness: 420, damping: 32 });
      } else {
        x.set(p.x);
        y.set(p.y);
      }
    },
    [x, y],
  );

  const reclampCurrent = useCallback(() => {
    const clamped = clampToViewport(x.get(), y.get());
    x.set(clamped.x);
    y.set(clamped.y);
    snapToCorner(cornerRef.current, false);
  }, [snapToCorner, x, y]);

  useEffect(() => {
    const corner = readStoredCorner();
    cornerRef.current = corner;
    snapToCorner(corner, false);
    setReady(true);

    const onResize = () => reclampCurrent();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, [snapToCorner, reclampCurrent]);

  const shouldSuppressClick = useCallback(() => {
    if (dragged.current || Date.now() < suppressClickUntil.current) {
      dragged.current = false;
      return true;
    }
    return false;
  }, []);

  const handleCupClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (shouldSuppressClick()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      router.push('/cart');
    },
    [router, shouldSuppressClick],
  );

  if (!hydrated) return null;

  const cupAriaLabel =
    displayCount > 0 ? `Your cup, ${displayCount} items` : 'Your cup, open cup';

  return (
    <>
      <FloatingRewardsPeek />
      <motion.div
        initial={false}
        animate={{ scale: ready ? 1 : 1, opacity: 1 }}
        className="floating-cup-fab no-print"
        style={{
          x,
          y,
          width: CUP_SIZE,
          height: CUP_SIZE,
          opacity: 1,
          visibility: 'visible',
        }}
        drag
        dragMomentum={false}
        dragElastic={0.08}
        dragConstraints={{
          left: EDGE,
          right: typeof window !== 'undefined' ? Math.max(EDGE, window.innerWidth - EDGE - CUP_SIZE) : 300,
          top: HEADER_OFFSET + EDGE,
          bottom:
            typeof window !== 'undefined'
              ? Math.max(HEADER_OFFSET + EDGE, window.innerHeight - bottomNavOffset() - EDGE - CUP_SIZE)
              : 500,
        }}
        onDragStart={() => {
          dragged.current = false;
        }}
        onDrag={(_, info) => {
          if (
            Math.abs(info.offset.x) > DRAG_CLICK_THRESHOLD ||
            Math.abs(info.offset.y) > DRAG_CLICK_THRESHOLD
          ) {
            dragged.current = true;
          }
        }}
        onDragEnd={(_, info) => {
          const wasDragged = dragged.current;
          const cx = x.get() + CUP_SIZE / 2 + info.velocity.x * 0.05;
          const cy = y.get() + CUP_SIZE / 2 + info.velocity.y * 0.05;
          snapToCorner(nearestCorner(cx, cy));
          if (wasDragged) {
            suppressClickUntil.current = Date.now() + 250;
            window.setTimeout(() => {
              dragged.current = false;
            }, 0);
          }
        }}
      >
        <Link
          href="/cart"
          data-loyalty-source="cart"
          className="floating-cup-fab__btn"
          aria-label={cupAriaLabel}
          onClick={handleCupClick}
        >
          <CupIcon
            fillLevel={fillLevel}
            fillFrom={pourPulse?.fillBefore}
            pouring={pourPulse != null}
            size="md"
            itemCount={displayCount}
            inverted
          />
        </Link>
      </motion.div>
    </>
  );
}
