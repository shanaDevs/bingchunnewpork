'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import HomeOfferCard from '@/components/home/HomeOfferCard';
import { useHomeOffers } from '@/hooks/useHomeOffers';

const AUTO_PLAY_MS = 5000;

export default function MenuPromoRail() {
  const { offers } = useHomeOffers();
  const [index, setIndex] = useState(0);
  const slideCount = offers.length;
  const current = offers[index] ?? offers[0];
  const sideOffer = offers[(index + 1) % slideCount] ?? current;

  const goTo = useCallback(
    (nextIndex: number) => {
      if (slideCount === 0) return;
      setIndex(((nextIndex % slideCount) + slideCount) % slideCount);
    },
    [slideCount],
  );

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    if (slideCount <= 1) return undefined;

    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slideCount);
    }, AUTO_PLAY_MS);
    return () => window.clearInterval(timer);
  }, [slideCount]);

  if (!current) return null;

  return (
    <div className="menu-promo-rail">
      <section
        className="menu-promo-rail__main home-offers-slider menu-promo-rail__slider"
        aria-label="Featured offers"
        aria-roledescription="carousel"
      >
        <div className="home-offers-slider__viewport menu-promo-rail__viewport">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              className="home-offers-slider__slide"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50 || info.velocity.x < -400) goNext();
                else if (info.offset.x > 50 || info.velocity.x > 400) goPrev();
              }}
            >
              <HomeOfferCard offer={current} priority={index === 0} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="home-offers-slider__dots" role="tablist" aria-label="Featured offer slides">
          {offers.map((slide, dotIndex) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              className={`home-offers-slider__dot${dotIndex === index ? ' home-offers-slider__dot--active' : ''}`}
              aria-label={`Show offer ${dotIndex + 1} of ${slideCount}`}
              aria-selected={dotIndex === index}
              onClick={() => goTo(dotIndex)}
            />
          ))}
        </div>
      </section>

      <section
        className="menu-promo-rail__side home-offers-slider menu-promo-rail__slider menu-promo-rail__slider--side"
        aria-label="More offers"
        aria-roledescription="carousel"
      >
        <p className="menu-promo-rail__side-label">More Offers</p>
        <div className="home-offers-slider__viewport menu-promo-rail__viewport menu-promo-rail__viewport--side">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={sideOffer.id}
              className="home-offers-slider__slide"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <HomeOfferCard offer={sideOffer} compact />
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
