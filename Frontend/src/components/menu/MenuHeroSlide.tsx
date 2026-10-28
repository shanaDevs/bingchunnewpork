'use client';

import { type ReactNode } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import MenuOffersSideSlider from '@/components/menu/MenuOffersSideSlider';

interface MenuHeroSlideProps {
  search: ReactNode;
  categories: ReactNode;
}

const cupFloat = {
  y: [0, -14, 0],
  rotate: [0, 1.5, 0, -1.5, 0],
};

const cupTransition = {
  duration: 5,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

export default function MenuHeroSlide({ search, categories }: MenuHeroSlideProps) {
  return (
    <div className="menu-hero-banner">
      <div className="menu-hero-banner__bg" aria-hidden>
        <span className="menu-hero-banner__orb menu-hero-banner__orb--1" />
        <span className="menu-hero-banner__orb menu-hero-banner__orb--2" />
        <span className="menu-hero-banner__orb menu-hero-banner__orb--3" />
      </div>

      <div className="menu-hero-banner__top">
        <div className="menu-hero-banner__copy">
          <h1 className="menu-hero__title menu-hero-banner__title">
            <span className="menu-hero-banner__title-row">
              Discover Your <Sparkles size={18} className="menu-hero-banner__spark" aria-hidden />
            </span>
            <span className="menu-hero-banner__title-accent">
              <span className="menu-hero-banner__accent-perfect">Perfect</span>{' '}
              <span className="menu-hero-banner__accent-bubble">Bubble Tea</span>
            </span>
          </h1>
          <p className="menu-hero__subtitle menu-hero-banner__subtitle">
            Handcrafted goodness in every sip.
          </p>
          <div className="menu-hero-banner__search">{search}</div>
        </div>

        <div className="menu-hero-banner__visual" aria-hidden>
          <motion.div
            className="menu-hero-banner__cup-wrap"
            animate={cupFloat}
            transition={cupTransition}
          >
            <Image
              src="/promos/menu-hero-cup.png?v=2"
              alt=""
              width={480}
              height={480}
              className="menu-hero-banner__cup"
              priority
              unoptimized
              sizes="(min-width: 1024px) 360px, 80vw"
            />
          </motion.div>
          <motion.div
            className="menu-hero-banner__badge"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, duration: 0.45 }}
          >
            <span aria-hidden>❤️</span>
            <span>
              <strong>100K+</strong> Happy Customers
            </span>
          </motion.div>
          <span className="menu-hero-banner__bubble menu-hero-banner__bubble--1" />
          <span className="menu-hero-banner__bubble menu-hero-banner__bubble--2" />
          <span className="menu-hero-banner__bubble menu-hero-banner__bubble--3" />
          <span className="menu-hero-banner__leaf menu-hero-banner__leaf--1" aria-hidden>
            🍃
          </span>
          <span className="menu-hero-banner__leaf menu-hero-banner__leaf--2" aria-hidden>
            🍃
          </span>
        </div>

        <div className="menu-hero-banner__offers">
          <MenuOffersSideSlider />
        </div>
      </div>

      <div className="menu-hero-banner__categories">{categories}</div>
    </div>
  );
}
