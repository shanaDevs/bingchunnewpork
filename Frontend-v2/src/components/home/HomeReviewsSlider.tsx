'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Star } from 'lucide-react';

const REVIEWS = [
  {
    id: 'chamath',
    text: 'Best bubble tea in Sri Lanka! The brown sugar boba is absolutely amazing.',
    author: 'Chamath N.',
    rating: 5,
  },
  {
    id: 'dilani',
    text: 'Super fast delivery and the drinks always arrive fresh. My go-to treat!',
    author: 'Dilani P.',
    rating: 5,
  },
  {
    id: 'kasun',
    text: 'Love the strawberry mango tea — perfect balance of sweet and tangy.',
    author: 'Kasun R.',
    rating: 5,
  },
] as const;

const AUTO_PLAY_MS = 6000;

export default function HomeReviewsSlider() {
  const [index, setIndex] = useState(0);
  const count = REVIEWS.length;
  const current = REVIEWS[index] ?? REVIEWS[0];

  const goTo = useCallback((next: number) => {
    setIndex(((next % count) + count) % count);
  }, [count]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % count);
    }, AUTO_PLAY_MS);
    return () => window.clearInterval(timer);
  }, [count]);

  return (
    <div className="home-reviews-slider" aria-label="Customer reviews" aria-roledescription="carousel">
      <div className="home-reviews-slider__viewport">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            className="home-reviews-slider__slide"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="home-reviews-slider__stars" aria-label={`${current.rating} out of 5 stars`}>
              {Array.from({ length: current.rating }).map((_, i) => (
                <Star key={i} size={12} fill="currentColor" />
              ))}
            </div>
            <p className="home-reviews-slider__text">&ldquo;{current.text}&rdquo;</p>
            <p className="home-reviews-slider__author">— {current.author}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="home-reviews-slider__dots" role="tablist" aria-label="Review slides">
        {REVIEWS.map((review, dotIndex) => (
          <button
            key={review.id}
            type="button"
            role="tab"
            className={`home-reviews-slider__dot${dotIndex === index ? ' home-reviews-slider__dot--active' : ''}`}
            aria-label={`Show review ${dotIndex + 1} of ${count}`}
            aria-selected={dotIndex === index}
            onClick={() => goTo(dotIndex)}
          />
        ))}
      </div>
    </div>
  );
}
