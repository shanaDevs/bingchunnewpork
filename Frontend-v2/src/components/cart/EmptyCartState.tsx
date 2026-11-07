'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import AddToCupIcon from '@/components/cart/AddToCupIcon';
import { MASCOT_IMAGES } from '@/lib/mascotImages';

export default function EmptyCartState() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 sm:px-8 py-12 sm:py-16">
      <motion.div
        className="mb-8 sm:mb-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="empty-cart-mascot-wrap"
          animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
          transition={reduceMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <img
            src={MASCOT_IMAGES.emptyCartSad}
            alt="Sad Stitch holding an empty Bing Chun cup"
            width={320}
            height={320}
            className="empty-cart-mascot-img w-[220px] h-[220px] sm:w-[300px] sm:h-[300px] object-contain"
            loading="eager"
            decoding="async"
          />
        </motion.div>
      </motion.div>

      <motion.div
        className="text-center max-w-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.4 }}
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-fg mb-2">Fill Your Cup</h1>
        <p className="text-muted text-sm sm:text-base leading-relaxed mb-8">
          Stitch is holding an empty Bing Chun cup… Let&apos;s fill it with something delicious!
        </p>
        <Link
          href="/menu"
          className="btn-primary px-8 py-3.5 inline-flex items-center justify-center gap-2 text-sm sm:text-base"
        >
          <AddToCupIcon inverted fillLevel={0.15} className="add-to-cup-icon--btn" />
          Fill Your Cup
        </Link>
      </motion.div>
    </div>
  );
}
