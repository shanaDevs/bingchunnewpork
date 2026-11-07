'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import HomeOfferCard from '@/components/home/HomeOfferCard';
import { useHomeOffers } from '@/hooks/useHomeOffers';

const AUTO_PLAY_MS = 4500;

export default function MenuOffersSideSlider() {
  const offers = useHomeOffers();
  const [index, setIndex] = useState(0);
  const slideCount = offers.length;
  const current = offers[index] ?? offers[0];

  const goTo = useCallback(
    (nextIndex: number) => {
      if (slideCount === 0) return;
      setIndex(((nextIndex % slideCount) + slideCount) % slideCount);
    },
    [slideCount],
  );

  useEffect(() => {
    if (slideCount <= 1) return undefined;

    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slideCount);
    }, AUTO_PLAY_MS);
    return () => window.clearInterval(timer);
  }, [slideCount]);

  if (!current) return null;

  return (
    <section
      className="menu-offers-side"
      aria-label="Today's offers"
      aria-roledescription="carousel"
    >
      <p className="menu-offers-side__label">
        <span aria-hidden>🔥</span> Today&apos;s Special
      </p>

      <div className="menu-offers-side__viewport">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            className="menu-offers-side__slide"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
          >
            <HomeOfferCard offer={current} menuSide />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="menu-offers-side__dots" role="tablist" aria-label="Offer slides">
        {offers.map((slide, dotIndex) => (
          <button
            key={slide.id}
            type="button"
            role="tab"
            className={`menu-offers-side__dot${dotIndex === index ? ' menu-offers-side__dot--active' : ''}`}
            aria-label={`Show offer ${dotIndex + 1} of ${slideCount}`}
            aria-selected={dotIndex === index}
            onClick={() => goTo(dotIndex)}
          />
        ))}
      </div>
    </section>
  );
}
