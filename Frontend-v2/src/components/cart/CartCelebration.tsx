'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CART_CELEBRATION_EVENT, type CartCelebrationDetail } from '@/lib/cartCelebration';
import PouringCup from '@/components/cart/PouringCup';

const VISIBLE_MS = 2800;

export default function CartCelebration() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('Added to your cup!');
  const [pourDetail, setPourDetail] = useState<{ fillBefore: number; fillAfter: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    function show(detail?: CartCelebrationDetail) {
      if (detail?.productName) {
        const short = detail.productName.length > 22
          ? `${detail.productName.slice(0, 20)}…`
          : detail.productName;
        setMessage(`${short} added!`);
      } else {
        setMessage('Added to your cup!');
      }

      if (detail?.fillBefore != null && detail?.fillAfter != null) {
        setPourDetail({ fillBefore: detail.fillBefore, fillAfter: detail.fillAfter });
      }

      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        setPourDetail(null);
      }, VISIBLE_MS);
    }

    const onCelebration = (e: Event) => {
      show((e as CustomEvent<CartCelebrationDetail>).detail);
    };

    window.addEventListener(CART_CELEBRATION_EVENT, onCelebration);
    return () => {
      window.removeEventListener(CART_CELEBRATION_EVENT, onCelebration);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div
      className="cart-celebration-root pointer-events-none fixed inset-0 z-[120] flex items-end justify-center sm:items-end sm:justify-end p-4 sm:p-8"
      aria-live="polite"
      aria-hidden={!visible}
    >
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key="stitch-dance"
            className="cart-celebration flex flex-col items-center gap-2 sm:items-end"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.4, y: reduceMotion ? 0 : 60 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: -30 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="cart-celebration__bubble flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white shadow-lg"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              {pourDetail && (
                <PouringCup
                  size="md"
                  fillLevel={pourDetail.fillAfter}
                  fillFrom={pourDetail.fillBefore}
                  pouring
                  inverted
                />
              )}
              {message}
            </motion.div>

            <motion.div
              className="cart-celebration__character relative"
              animate={
                reduceMotion
                  ? { opacity: [1, 1] }
                  : {
                      rotate: [0, -14, 14, -12, 12, -8, 8, -4, 4, 0],
                      y: [0, -28, 0, -22, 0, -14, 0, -8, 0],
                      scale: [1, 1.06, 1, 1.04, 1, 1.02, 1],
                    }
              }
              transition={{
                duration: 2.4,
                ease: 'easeInOut',
              }}
            >
              <span className="cart-celebration__spark cart-celebration__spark--1" aria-hidden />
              <span className="cart-celebration__spark cart-celebration__spark--2" aria-hidden />
              <span className="cart-celebration__spark cart-celebration__spark--3" aria-hidden />

              <Image
                src="/brand/mascot-hero.avif"
                alt="Bing Chun mascot celebrating"
                width={200}
                height={200}
                className="cart-celebration__img w-[140px] h-[140px] sm:w-[180px] sm:h-[180px] object-contain drop-shadow-2xl"
                priority={false}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
