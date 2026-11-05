'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import AnimatedBrandLogo from '@/components/ui/AnimatedBrandLogo';
import { playOrderConfirmedSound } from '@/lib/uiSounds';

const VISIBLE_MS = 1800;

type Props = {
  open: boolean;
  orderNumber: string;
  onClose: () => void;
};

/** Brief order-placed flash — auto-dismisses to reveal tracking below */
export default function OrderConfirmedCelebration({ open, orderNumber, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedSound = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;

    if (!playedSound.current && !reduceMotion) {
      playedSound.current = true;
      playOrderConfirmedSound();
    }

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(onClose, VISIBLE_MS);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [open, mounted, onClose, reduceMotion]);

  useEffect(() => {
    if (!open) playedSound.current = false;
  }, [open]);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="order-confirmed"
          className="order-confirmed-celebration order-confirmed-celebration--minimal"
          role="status"
          aria-live="polite"
          aria-labelledby="order-confirmed-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.28 }}
        >
          <motion.div
            className="order-confirmed-celebration__panel order-confirmed-celebration__panel--minimal"
            initial={{ scale: reduceMotion ? 1 : 0.88, y: reduceMotion ? 0 : 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
          >
            <div className="flex justify-center mb-4">
              <AnimatedBrandLogo size={88} />
            </div>

            <h2 id="order-confirmed-title" className="order-confirmed-celebration__title">
              Order Confirmed!
            </h2>
            <p className="order-confirmed-celebration__order">Order #{orderNumber}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
