'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MASCOT_IMAGES } from '@/lib/mascotImages';
import { playOrderDeliveredSound } from '@/lib/uiSounds';

const VISIBLE_MS = 5800;
const CONFETTI_COUNT = 48;
const CONFETTI_COLORS = ['#fbbf24', '#fde047', '#34d399', '#307ef2', '#f472b6', '#a78bfa', '#fff', '#22c55e'];

type Props = {
  open: boolean;
  orderNumber: string;
  isDelivery: boolean;
  onClose: () => void;
};

export default function OrderDeliveredCelebration({ open, orderNumber, isDelivery, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedSound = useRef(false);
  const [mounted, setMounted] = useState(false);

  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        id: i,
        left: `${(i * 13 + 5) % 100}%`,
        delay: `${(i % 10) * 0.06}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 7 + (i % 6) * 2,
        rotate: (i * 53) % 360,
      })),
    []
  );

  const title = isDelivery ? 'Delivered!' : 'Ready for Pickup!';
  const subtitle = isDelivery
    ? 'Your order has arrived — enjoy every sip!'
    : 'Head to the counter and collect your order!';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;

    if (!playedSound.current && !reduceMotion) {
      playedSound.current = true;
      playOrderDeliveredSound();
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
          key="order-delivered"
          className="order-confirmed-celebration order-delivered-celebration"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-delivered-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.35 }}
          onClick={onClose}
        >
          <div className="order-confirmed-celebration__burst order-delivered-celebration__burst" aria-hidden />
          <div className="order-confirmed-celebration__ring order-delivered-celebration__ring order-confirmed-celebration__ring--1" aria-hidden />
          <div className="order-confirmed-celebration__ring order-delivered-celebration__ring order-confirmed-celebration__ring--2" aria-hidden />

          {confetti.map((c) => (
            <span
              key={c.id}
              className="order-confirmed-celebration__confetti order-delivered-celebration__confetti"
              style={{
                left: c.left,
                animationDelay: c.delay,
                backgroundColor: c.color,
                width: c.size,
                height: c.size * 1.4,
                transform: `rotate(${c.rotate}deg)`,
              }}
              aria-hidden
            />
          ))}

          <motion.div
            className="order-confirmed-celebration__panel order-delivered-celebration__panel"
            initial={{ scale: reduceMotion ? 1 : 0.45, y: reduceMotion ? 0 : 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 20, delay: 0.05 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.p
              className="order-confirmed-celebration__eyebrow order-delivered-celebration__eyebrow"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.1 }}
            >
              {isDelivery ? '🏆 You won!' : '🎊 Woohoo!'}
            </motion.p>

            <motion.h2
              id="order-delivered-title"
              className="order-confirmed-celebration__title order-delivered-celebration__title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
            >
              {title}
            </motion.h2>
            <p className="order-confirmed-celebration__order">#{orderNumber}</p>

            <motion.div
              className="order-confirmed-celebration__mascot-wrap"
              animate={
                reduceMotion
                  ? {}
                  : {
                      rotate: [0, -10, 10, -8, 8, -4, 4, 0],
                      y: [0, -22, 0, -16, 0, -10, 0],
                      scale: [1, 1.12, 1, 1.08, 1],
                    }
              }
              transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }}
            >
              <span className="order-confirmed-celebration__spark order-delivered-celebration__spark order-confirmed-celebration__spark--1" aria-hidden />
              <span className="order-confirmed-celebration__spark order-delivered-celebration__spark order-confirmed-celebration__spark--2" aria-hidden />
              <span className="order-confirmed-celebration__spark order-delivered-celebration__spark order-confirmed-celebration__spark--3" aria-hidden />
              <span className="order-confirmed-celebration__spark order-delivered-celebration__spark order-confirmed-celebration__spark--4" aria-hidden />
              <Image
                src={MASCOT_IMAGES.orderConfirmed}
                alt="Bing Chun mascot celebrating delivery"
                width={280}
                height={280}
                className="order-confirmed-celebration__mascot order-delivered-celebration__mascot"
                priority
              />
            </motion.div>

            <p className="order-confirmed-celebration__sub">{subtitle}</p>

            <button type="button" className="order-confirmed-celebration__btn order-delivered-celebration__btn" onClick={onClose}>
              {isDelivery ? 'Awesome!' : 'On my way!'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
