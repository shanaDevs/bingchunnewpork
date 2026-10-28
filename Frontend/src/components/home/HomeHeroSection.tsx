'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, UtensilsCrossed } from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';
import HomeHeroCarousel from '@/components/home/HomeHeroCarousel';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';

interface HomeHeroSectionProps {
  variant: 'compact' | 'desktop';
  storeCountLabel: string;
}

export default function HomeHeroSection({ variant, storeCountLabel }: HomeHeroSectionProps) {
  const isDesktop = variant === 'desktop';

  if (isDesktop) {
    return <HomeHeroCarousel />;
  }

  return (
    <section className="home-hero">
      <div className="home-hero__card">
        <div className="home-hero__media" aria-hidden>
          <Image
            src="/brand/home-hero-magic-mobile.png"
            alt=""
            fill
            priority
            unoptimized
            sizes="100vw"
            className="home-hero__media-img home-hero__media-img--mobile"
          />
          <Image
            src="/brand/home-hero-magic.png"
            alt=""
            fill
            priority
            unoptimized
            sizes="(max-width: 1279px) 90vw, 80rem"
            className="home-hero__media-img home-hero__media-img--desktop"
          />
        </div>
        <div className="home-hero__media-veil" aria-hidden />
        <div className="home-hero__copy">
          <BrandLogo size={36} className="home-hero__brand" />
          <span className="home-hero__badge">Since 2012 · {storeCountLabel} Stores</span>
          <h1 className="home-hero__title">
            <span className="home-hero__title-accent">Bubble Tea &amp; Ice Cream</span>
          </h1>
          <p className="home-hero__subtitle">Premium ingredients, crafted with love</p>
          <div className="home-hero__actions">
            <button
              type="button"
              className="home-hero__btn home-hero__btn--primary home-hero__btn--press"
              onClick={() => openOrderModal({ allowSkip: true })}
            >
              Order Now <ZapIcon />
            </button>
            <Link href="/menu" className="home-hero__btn home-hero__btn--ghost home-hero__btn--ghost-visible">
              View Menu <UtensilsCrossed size={15} strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  );
}
