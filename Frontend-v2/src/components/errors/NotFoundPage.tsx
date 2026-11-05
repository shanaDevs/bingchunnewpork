'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, CupSoda, Home, MapPin } from 'lucide-react';

const floatTransition = {
  y: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const },
};

export default function NotFoundPage() {
  return (
    <div className="not-found-page">
      <div className="not-found-page__glow not-found-page__glow--left" aria-hidden />
      <div className="not-found-page__glow not-found-page__glow--right" aria-hidden />

      <motion.div
        className="not-found-page__badge"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        Error 404
      </motion.div>

      <motion.div
        className="not-found-page__art"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
        transition={{
          opacity: { duration: 0.5 },
          scale: { duration: 0.5, ease: 'backOut' },
          y: floatTransition.y,
        }}
      >
        <Image
          src="/mascots/404-lost.png"
          alt="Lost mascot standing next to a rock with 404 written on it"
          width={420}
          height={420}
          className="not-found-page__image"
          priority
        />
      </motion.div>

      <motion.div
        className="not-found-page__copy"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <h1 className="not-found-page__title">Lost in the desert?</h1>
        <p className="not-found-page__subtitle">
          This page doesn&apos;t exist or may have moved. Let&apos;s get you back to something refreshing.
        </p>
      </motion.div>

      <motion.div
        className="not-found-page__actions"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25 }}
      >
        <Link href="/" className="btn-primary not-found-page__btn">
          <Home size={18} />
          Back to home
        </Link>
        <Link href="/menu" className="btn-outline not-found-page__btn">
          <CupSoda size={18} />
          Browse menu
        </Link>
        <Link href="/stores" className="btn-ghost not-found-page__btn not-found-page__btn--ghost">
          <MapPin size={18} />
          Find a store
        </Link>
      </motion.div>

      <motion.button
        type="button"
        className="not-found-page__back"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        onClick={() => window.history.back()}
      >
        <ArrowLeft size={14} />
        Go back
      </motion.button>
    </div>
  );
}
