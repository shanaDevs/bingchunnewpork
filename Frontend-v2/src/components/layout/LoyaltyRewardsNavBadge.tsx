'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LOYALTY_FLOAT_EVENT, type LoyaltyFloatDetail } from '@/lib/cartCelebration';
import { useCartStore } from '@/store/cartStore';
import { estimateLoyaltyPoints } from '@/lib/loyalty';

type Flash = {
  points: number;
  delta: number;
  direction: 'add' | 'remove';
};

function formatPoints(n: number): string {
  if (n > 999) return '999+';
  return String(Math.max(0, Math.round(n)));
}

/** Rewards nav badge — cart-based earn estimate for this order (not lifetime balance). */
export default function LoyaltyRewardsNavBadge() {
  const subtotal = useCartStore((s) => s.subtotal());
  const estimatedPoints = estimateLoyaltyPoints(subtotal);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function onFloat(e: Event) {
      const detail = (e as CustomEvent<LoyaltyFloatDetail>).detail;
      if (!detail) return;
      if (timer) clearTimeout(timer);
      setFlash({
        points: detail.pointsEarned,
        delta: detail.pointsDelta,
        direction: detail.direction,
      });
      timer = setTimeout(() => setFlash(null), 2200);
    }

    window.addEventListener(LOYALTY_FLOAT_EVENT, onFloat);
    return () => {
      window.removeEventListener(LOYALTY_FLOAT_EVENT, onFloat);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!mounted) return null;

  const showBalance = estimatedPoints > 0;
  const showFlash = flash != null;

  if (!showBalance && !showFlash) return null;

  return (
    <AnimatePresence mode="wait">
      {showFlash ? (
        <motion.span
          key="flash"
          initial={{ opacity: 0, y: 4, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.9 }}
          className="loyalty-rewards-nav-badge loyalty-rewards-nav-badge--flash"
          aria-live="polite"
        >
          {flash.points > 0
            ? `${formatPoints(flash.points)} pts`
            : flash.direction === 'add'
              ? '+0'
              : '−0'}
        </motion.span>
      ) : showBalance ? (
        <motion.span
          key="cart-earn"
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="loyalty-rewards-nav-badge"
          title={`${estimatedPoints} points you will earn on this order`}
        >
          {formatPoints(estimatedPoints)}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
