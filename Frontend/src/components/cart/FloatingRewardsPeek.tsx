'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, animate } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { CUP_POUR_EVENT, LOYALTY_FLOAT_EVENT } from '@/lib/cartCelebration';
import { useClientHydrated } from '@/hooks/useClientHydrated';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useSpinStore } from '@/store/spinStore';
import { isSpinConsumedLocally } from '@/lib/spinStorage';
import {
  fetchSpinEligibility,
  formatSpinCooldownMessage,
  SPIN_ELIGIBILITY_QUERY_KEY,
  shouldShowSpinFab,
} from '@/lib/spinEligibility';
import SpinCasinoIcon from '@/components/promo/SpinCasinoIcon';

export type RewardsDock =
  | 'top-left'
  | 'mid-left'
  | 'bottom-left'
  | 'top-right'
  | 'mid-right'
  | 'bottom-right';

const STORAGE_KEY = 'bc-floating-rewards-dock';
const BTN_SIZE = 48;
const PEEK = 16;
const EDGE = 12;
const HEADER_OFFSET = 64;
const BOTTOM_MOBILE_OFFSET = 20;
const BOTTOM_NAV_HEIGHT_MOBILE = 84;
const DRAG_CLICK_THRESHOLD = 6;
const AUTO_HIDE_MS = 4500;
const DEFAULT_DOCK: RewardsDock = 'mid-right';

function readStoredDock(): RewardsDock {
  if (typeof window === 'undefined') return DEFAULT_DOCK;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (
      v === 'top-left' ||
      v === 'mid-left' ||
      v === 'bottom-left' ||
      v === 'top-right' ||
      v === 'mid-right' ||
      v === 'bottom-right'
    ) {
      return v;
    }
    // Migrate old corner key
    const legacy = localStorage.getItem('bc-floating-rewards-corner');
    if (legacy === 'top-left') return 'top-left';
    if (legacy === 'bottom-left') return 'bottom-left';
    if (legacy === 'top-right') return 'top-right';
    if (legacy === 'bottom-right') return 'bottom-right';
  } catch {
    /* ignore */
  }
  return DEFAULT_DOCK;
}

function bottomNavOffset(): number {
  if (typeof window === 'undefined') return BOTTOM_MOBILE_OFFSET;
  if (window.innerWidth >= 768) return 16;
  return BOTTOM_NAV_HEIGHT_MOBILE + BOTTOM_MOBILE_OFFSET;
}

function shellBounds() {
  const shell = document.querySelector('.customer-app-shell');
  if (shell) {
    const r = shell.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }
  return {
    left: 0,
    right: window.innerWidth,
    top: 0,
    bottom: window.innerHeight,
  };
}

function isLeftDock(dock: RewardsDock): boolean {
  return dock.endsWith('left');
}

function openPoint(dock: RewardsDock): { x: number; y: number } {
  const b = shellBounds();
  const navOffset = bottomNavOffset();
  const safeBottom = Math.min(b.bottom, window.innerHeight) - navOffset - EDGE - BTN_SIZE;
  const safeTop = b.top + HEADER_OFFSET + EDGE;
  const midY = (safeTop + safeBottom) / 2;
  const leftX = b.left + EDGE;
  const rightX = b.right - EDGE - BTN_SIZE;

  let y = midY;
  if (dock.startsWith('top')) y = safeTop;
  else if (dock.startsWith('bottom')) y = safeTop > safeBottom ? safeTop : safeBottom;

  return { x: isLeftDock(dock) ? leftX : rightX, y };
}

function peekPoint(dock: RewardsDock): { x: number; y: number } {
  const open = openPoint(dock);
  const b = shellBounds();
  if (isLeftDock(dock)) {
    return { x: b.left - (BTN_SIZE - PEEK), y: open.y };
  }
  return { x: b.right - PEEK, y: open.y };
}

function nearestDock(x: number, y: number): RewardsDock {
  const docks: RewardsDock[] = [
    'top-left',
    'mid-left',
    'bottom-left',
    'top-right',
    'mid-right',
    'bottom-right',
  ];
  let best: RewardsDock = DEFAULT_DOCK;
  let bestDist = Infinity;
  for (const dock of docks) {
    const p = openPoint(dock);
    const d = (p.x + BTN_SIZE / 2 - x) ** 2 + (p.y + BTN_SIZE / 2 - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = dock;
    }
  }
  return best;
}

export default function FloatingRewardsPeek() {
  const hydrated = useClientHydrated();
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const storeId = useCartStore((s) => s.getFulfillmentStoreId());
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);

  const { data: eligibility } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, isAuthenticated ? 'auth' : 'guest', storeId ?? ''],
    queryFn: () => fetchSpinEligibility(isAuthenticated, storeId),
    enabled: authHydrated && isAuthenticated,
    staleTime: 15_000,
  });

  const [open, setOpen] = useState(false);
  const [dock, setDock] = useState<RewardsDock>(DEFAULT_DOCK);
  const [ready, setReady] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragged = useRef(false);
  const suppressNavUntil = useRef(0);
  const dockRef = useRef<RewardsDock>(DEFAULT_DOCK);
  const openRef = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const persistDock = useCallback((next: RewardsDock) => {
    dockRef.current = next;
    setDock(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const moveTo = useCallback(
    (next: RewardsDock, visible: boolean, spring = true) => {
      const p = visible ? openPoint(next) : peekPoint(next);
      if (spring) {
        animate(x, p.x, { type: 'spring', stiffness: 420, damping: 34 });
        animate(y, p.y, { type: 'spring', stiffness: 420, damping: 34 });
      } else {
        x.set(p.x);
        y.set(p.y);
      }
    },
    [x, y],
  );

  const snapOpen = useCallback(
    (autoHide = true) => {
      openRef.current = true;
      setOpen(true);
      moveTo(dockRef.current, true);
      clearHideTimer();
      if (autoHide) {
        hideTimer.current = setTimeout(() => {
          openRef.current = false;
          setOpen(false);
          moveTo(dockRef.current, false);
        }, AUTO_HIDE_MS);
      }
    },
    [clearHideTimer, moveTo],
  );

  const snapClosed = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    clearHideTimer();
    dragged.current = false;
    suppressNavUntil.current = 0;
    moveTo(dockRef.current, false);
  }, [clearHideTimer, moveTo]);

  useEffect(() => {
    const initial = readStoredDock();
    dockRef.current = initial;
    setDock(initial);
    const p = peekPoint(initial);
    x.set(p.x);
    y.set(p.y);
    setReady(true);

    const onResize = () => {
      moveTo(dockRef.current, openRef.current, false);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearHideTimer();
    };
  }, [clearHideTimer, moveTo, x, y]);

  useEffect(() => {
    function reveal() {
      if (!shouldShowSpinFab(eligibility)) return;
      snapOpen(true);
    }
    window.addEventListener(CUP_POUR_EVENT, reveal);
    window.addEventListener(LOYALTY_FLOAT_EVENT, reveal);
    return () => {
      window.removeEventListener(CUP_POUR_EVENT, reveal);
      window.removeEventListener(LOYALTY_FLOAT_EVENT, reveal);
    };
  }, [snapOpen, eligibility]);

  const toggleHide = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      e?.preventDefault();
      // Hide/show must always work — never blocked by post-drag click suppression.
      dragged.current = false;
      suppressNavUntil.current = 0;
      clearHideTimer();
      if (openRef.current) snapClosed();
      else snapOpen(false);
    },
    [clearHideTimer, snapClosed, snapOpen],
  );

  const openSpin = useCallback(() => {
    if (!eligibility?.enabled) {
      toast.error('Spin & Win is not available right now');
      return;
    }
    const locked = !eligibility.canSpin || isSpinConsumedLocally();
    if (locked) {
      toast.error(formatSpinCooldownMessage(eligibility.nextSpinAt, eligibility.reason ?? undefined));
      return;
    }
    requestOpenSpin();
  }, [eligibility, requestOpenSpin]);

  const handleSpinClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragged.current || Date.now() < suppressNavUntil.current) {
        dragged.current = false;
        return;
      }
      if (!openRef.current) {
        snapOpen(false);
        return;
      }
      openSpin();
    },
    [openSpin, snapOpen],
  );

  if (!hydrated || !ready) return null;
  if (!isAuthenticated) return null;
  if (!shouldShowSpinFab(eligibility)) return null;

  const leftSide = isLeftDock(dock);

  return (
    <AnimatePresence>
      <motion.div
        className={`floating-rewards-peek no-print${open ? ' floating-rewards-peek--open' : ''}${
          leftSide ? ' floating-rewards-peek--left' : ''
        }`}
        style={{ x, y, width: BTN_SIZE, height: BTN_SIZE }}
        drag
        dragMomentum={false}
        dragElastic={0.08}
        onDragStart={() => {
          dragged.current = false;
          clearHideTimer();
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
          const cx = x.get() + BTN_SIZE / 2 + info.velocity.x * 0.05;
          const cy = y.get() + BTN_SIZE / 2 + info.velocity.y * 0.05;
          const next = nearestDock(cx, cy);
          persistDock(next);
          openRef.current = true;
          setOpen(true);
          moveTo(next, true);
          if (wasDragged) {
            // Only block opening spin — hide toggle stays available immediately.
            suppressNavUntil.current = Date.now() + 200;
            window.setTimeout(() => {
              dragged.current = false;
            }, 0);
          }
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <button
          type="button"
          className="floating-rewards-peek__handle"
          aria-label={open ? 'Hide spin' : 'Show spin'}
          aria-expanded={open}
          onPointerDown={(e) => {
            // Keep hide/show taps out of the drag gesture.
            e.stopPropagation();
          }}
          onClick={toggleHide}
        >
          {leftSide ? (
            <ChevronRight
              size={14}
              strokeWidth={2.5}
              className={`floating-rewards-peek__chevron${open ? ' floating-rewards-peek__chevron--open' : ''}`}
              aria-hidden
            />
          ) : (
            <ChevronLeft
              size={14}
              strokeWidth={2.5}
              className={`floating-rewards-peek__chevron${open ? ' floating-rewards-peek__chevron--open' : ''}`}
              aria-hidden
            />
          )}
        </button>

        <button
          type="button"
          data-loyalty-target="spin-wheel"
          className="floating-rewards-fab__btn floating-rewards-peek__btn"
          aria-label="Spin to win — daily prize wheel"
          onClick={handleSpinClick}
        >
          <span className="floating-rewards-fab__icon-bg" aria-hidden>
            <SpinCasinoIcon size={24} />
          </span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
