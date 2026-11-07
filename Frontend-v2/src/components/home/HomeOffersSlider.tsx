'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import HomeOfferCard from '@/components/home/HomeOfferCard';
import { useHomeOffers } from '@/hooks/useHomeOffers';
import type { HomeOffer } from '@/components/home/homeOffers';

const AUTO_PLAY_MS = 5000;
const GRID_PAGE_SIZE = 3;

interface HomeOffersSliderProps {
  className?: string;
  variant?: 'slider' | 'grid';
  /** Kept for compatibility; Order Now now applies the offer to the cup. */
  offerHref?: string;
}

function chunkOffers(offers: HomeOffer[], size: number): HomeOffer[][] {
  const pages: HomeOffer[][] = [];
  for (let i = 0; i < offers.length; i += size) {
    pages.push(offers.slice(i, i + size));
  }
  return pages;
}

export default function HomeOffersSlider({
  className = '',
  variant = 'slider',
  offerHref,
}: HomeOffersSliderProps) {
  const rawOffers = useHomeOffers();
  const offers = useMemo(
    () => (offerHref ? rawOffers.map((offer) => ({ ...offer, href: offerHref })) : rawOffers),
    [rawOffers, offerHref],
  );

  const [index, setIndex] = useState(0);
  const slideCount = offers.length;
  const current = offers[index] ?? offers[0];

  const pages = useMemo(() => chunkOffers(offers, GRID_PAGE_SIZE), [offers]);
  const pageCount = pages.length;
  const [page, setPage] = useState(0);
  const useGridCarousel = variant === 'grid' && offers.length > GRID_PAGE_SIZE;

  const goTo = useCallback((nextIndex: number) => {
    if (slideCount === 0) return;
    setIndex(((nextIndex % slideCount) + slideCount) % slideCount);
  }, [slideCount]);

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  const goToPage = useCallback((nextPage: number) => {
    if (pageCount === 0) return;
    setPage(((nextPage % pageCount) + pageCount) % pageCount);
  }, [pageCount]);

  const goNextPage = useCallback(() => goToPage(page + 1), [goToPage, page]);
  const goPrevPage = useCallback(() => goToPage(page - 1), [goToPage, page]);

  useEffect(() => {
    if (variant === 'grid' || slideCount <= 1) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slideCount);
    }, AUTO_PLAY_MS);
    return () => window.clearInterval(timer);
  }, [slideCount, variant]);

  useEffect(() => {
    if (!useGridCarousel || pageCount <= 1) return undefined;
    const timer = window.setInterval(() => {
      setPage((prev) => (prev + 1) % pageCount);
    }, AUTO_PLAY_MS);
    return () => window.clearInterval(timer);
  }, [useGridCarousel, pageCount]);

  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  if (offers.length === 0) return null;

  if (variant === 'grid' && !useGridCarousel) {
    return (
      <section
        className={`home-offers-slider home-offers-slider--grid ${className}`.trim()}
        aria-label="Special offers"
      >
        <div className="home-offers-slider__grid">
          {offers.map((offer, offerIndex) => (
            <HomeOfferCard key={offer.id} offer={offer} priority={offerIndex === 0} />
          ))}
        </div>
      </section>
    );
  }

  if (variant === 'grid' && useGridCarousel) {
    return (
      <section
        className={`home-offers-slider home-offers-slider--grid home-offers-slider--grid-carousel ${className}`.trim()}
        aria-label="Special offers"
        aria-roledescription="carousel"
      >
        <button
          type="button"
          className="home-offers-slider__arrow home-offers-slider__arrow--prev"
          aria-label="Previous offers"
          onClick={goPrevPage}
        >
          <ChevronLeft size={18} />
        </button>
        <motion.div
          className="home-offers-slider__viewport"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={(_, info) => {
            if (info.offset.x < -50 || info.velocity.x < -400) goNextPage();
            else if (info.offset.x > 50 || info.velocity.x > 400) goPrevPage();
          }}
        >
          <div
            className="home-offers-slider__track"
            style={{ transform: `translateX(-${page * 100}%)` }}
          >
            {pages.map((pageOffers, pageIndex) => (
              <div key={pageOffers.map((offer) => offer.id).join('-')} className="home-offers-slider__page">
                {pageOffers.map((offer, offerIndex) => (
                  <HomeOfferCard
                    key={offer.id}
                    offer={offer}
                    priority={pageIndex === 0 && offerIndex === 0}
                  />
                ))}
              </div>
            ))}
          </div>
        </motion.div>
        <button
          type="button"
          className="home-offers-slider__arrow home-offers-slider__arrow--next"
          aria-label="Next offers"
          onClick={goNextPage}
        >
          <ChevronRight size={18} />
        </button>
        <div className="home-offers-slider__dots" role="tablist" aria-label="Offer pages">
          {pages.map((pageOffers, dotIndex) => (
            <button
              key={pageOffers[0]?.id ?? dotIndex}
              type="button"
              role="tab"
              className={`home-offers-slider__dot${dotIndex === page ? ' home-offers-slider__dot--active' : ''}`}
              aria-label={`Show offers ${dotIndex + 1} of ${pageCount}`}
              aria-selected={dotIndex === page}
              onClick={() => goToPage(dotIndex)}
            />
          ))}
        </div>
      </section>
    );
  }

  if (!current) return null;

  return (
    <section
      className={`home-offers-slider ${className}`.trim()}
      aria-label="Special offers"
      aria-roledescription="carousel"
    >
      <div className="home-offers-slider__viewport">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            className="home-offers-slider__slide"
            initial={{ opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -48 }}
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

      <div className="home-offers-slider__dots" role="tablist" aria-label="Offer slides">
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
  );
}
