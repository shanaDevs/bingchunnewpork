'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { CUP_POUR_EVENT, type CupPourDetail } from '@/lib/cartCelebration';
import PouringCup from '@/components/cart/PouringCup';

const VISIBLE_MS = 1500;

export default function CupPourOverlay() {
  const [pour, setPour] = useState<CupPourDetail | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    function show(detail: CupPourDetail) {
      setPour(detail);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setPour(null), VISIBLE_MS);
    }

    const onPour = (e: Event) => {
      show((e as CustomEvent<CupPourDetail>).detail);
    };

    window.addEventListener(CUP_POUR_EVENT, onPour);
    return () => {
      window.removeEventListener(CUP_POUR_EVENT, onPour);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const shortName = pour?.productName
    ? pour.productName.length > 28
      ? `${pour.productName.slice(0, 26)}…`
      : pour.productName
    : null;

  return (
    <div
      className="cup-pour-overlay-root pointer-events-none fixed inset-0 z-[118] flex items-start justify-center pt-24 sm:pt-28"
      aria-live="polite"
      aria-hidden={!pour}
    >
      <AnimatePresence mode="wait">
        {pour && (
          <motion.div
            key={pour.fillAfter + (shortName ?? '')}
            className="cup-pour-overlay flex flex-col items-center gap-3"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -24, scale: reduceMotion ? 1 : 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -16, scale: 0.92 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="cup-pour-overlay__card flex flex-col items-center gap-3 px-6 py-5 rounded-3xl">
              <PouringCup
                size="xl"
                fillLevel={pour.fillAfter}
                fillFrom={pour.fillBefore}
                pouring
                showLabel
              />

              <div className="text-center">
                <p className="cup-pour-overlay__title text-sm font-bold text-white">
                  {shortName ? `Pouring ${shortName}` : 'Pouring into your cup…'}
                </p>
                <p className="text-xs text-white/75 mt-0.5">
                  {Math.round(pour.fillAfter * 100)}% full
                </p>
              </div>

              <div className="cup-pour-overlay__progress w-40 h-1.5 rounded-full overflow-hidden bg-white/20">
                <motion.div
                  className="cup-pour-overlay__progress-fill h-full rounded-full"
                  initial={{ width: `${pour.fillBefore * 100}%` }}
                  animate={{ width: `${pour.fillAfter * 100}%` }}
                  transition={{ duration: reduceMotion ? 0.15 : 0.85, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
