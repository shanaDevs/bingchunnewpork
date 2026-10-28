'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';

const AUTO_PLAY_MS = 5000;

const HERO_SLIDES = [
  {
    id: 'joy',
    src: '/brand/home-hero-carousel-joy.jpg',
    alt: 'A little joy in every sip — Bing Chun brown sugar bubble tea',
  },
  {
    id: 'mood',
    src: '/brand/home-hero-carousel-mood.jpg',
    alt: 'Good tea, good mood — Bing Chun strawberry bubble tea',
  },
] as const;

export default function HomeHeroCarousel() {
  const [index, setIndex] = useState(0);
  const slideCount = HERO_SLIDES.length;

  const goTo = useCallback(
    (nextIndex: number) => {
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

  return (
    <section
      className="home-hero-carousel"
      aria-label="Featured promotions"
      aria-roledescription="carousel"
    >
      <div className="home-hero-carousel__viewport">
        <div
          className="home-hero-carousel__track"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {HERO_SLIDES.map((slide, slideIndex) => (
            <div key={slide.id} className="home-hero-carousel__slide">
              <button
                type="button"
                className="home-hero-carousel__slide-btn"
                aria-label={`${slide.alt}. Tap to order.`}
                onClick={() => openOrderModal({ allowSkip: true })}
              >
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  width={1024}
                  height={501}
                  priority={slideIndex === 0}
                  unoptimized
                  sizes="(min-width: 1280px) 75vw, 100vw"
                  className="home-hero-carousel__image"
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {slideCount > 1 && (
        <>
          <button
            type="button"
            className="home-hero-carousel__arrow home-hero-carousel__arrow--prev"
            aria-label="Previous slide"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="home-hero-carousel__arrow home-hero-carousel__arrow--next"
            aria-label="Next slide"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
          >
            <ChevronRight size={20} />
          </button>
          <div className="home-hero-carousel__dots" role="tablist" aria-label="Hero slides">
            {HERO_SLIDES.map((slide, dotIndex) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                className={`home-hero-carousel__dot${dotIndex === index ? ' home-hero-carousel__dot--active' : ''}`}
                aria-label={`Show slide ${dotIndex + 1} of ${slideCount}`}
                aria-selected={dotIndex === index}
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(dotIndex);
                }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
