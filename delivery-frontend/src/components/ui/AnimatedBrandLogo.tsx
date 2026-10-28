'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

type Props = {
  size?: number;
  className?: string;
  repeat?: boolean;
};

export default function AnimatedBrandLogo({ size = 72, className = '', repeat = true }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ scale: reduceMotion ? 1 : 0.65, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
      className={`inline-flex ${className}`}
    >
      <motion.div
        animate={
          reduceMotion || !repeat
            ? {}
            : {
                scale: [1, 1.07, 1],
                rotate: [0, -2, 2, 0],
              }
        }
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="relative" style={{ width: size, height: size }}>
          <Image
            src="/brand/logo.avif"
            alt="Bing Chun"
            fill
            sizes={`${size}px`}
            className="object-contain drop-shadow-lg"
            priority
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
