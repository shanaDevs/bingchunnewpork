'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Gift,
  ChevronRight,
  Truck,
  Award,
  ShoppingBag,
  Sparkles,
  Tag,
  Percent,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { PromoCode } from '@/types';
import HomeOffersSlider from '@/components/home/HomeOffersSlider';
import PromoCodeCard from '@/components/promotions/PromoCodeCard';
import PromotionBannerCard from '@/components/promotions/PromotionBannerCard';
import AnimatedMascot from '@/components/mascot/AnimatedMascot';
import { mapPromosToDisplays } from '@/components/home/homeOffers';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import {
  fetchSpinEligibility,
  SPIN_ELIGIBILITY_QUERY_KEY,
  shouldShowSpinEntryPoints,
} from '@/lib/spinEligibility';

const PERK_ITEMS = [
  {
    icon: Gift,
    title: 'Loyalty Rewards',
    description: 'Earn points on every order and redeem for free drinks.',
    href: '/account/loyalty',
    tone: 'purple',
  },
  {
    icon: Truck,
    title: 'Free Delivery',
    description: 'Get delivery on us when your order is above LKR 1,000.',
    href: '/menu',
    tone: 'green',
  },
  {
    icon: Award,
    title: 'Premium Quality',
    description: 'Freshly brewed bubble tea and ice cream, crafted with care.',
    href: '/menu',
    tone: 'gold',
  },
] as const;

const HOW_STEPS = [
  { step: '1', title: 'Pick your favourites', text: 'Browse the menu and add items to your cup.' },
  { step: '2', title: 'Apply your code', text: 'Tap Use at checkout, or copy the code and paste it before you pay.' },
  { step: '3', title: 'Enjoy the savings', text: 'Discount applies instantly — sip and celebrate!' },
] as const;

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
};

export default function PromotionsDashboard() {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const storeId = useCartStore((s) => s.getFulfillmentStoreId());

  const { data: promos = [], isLoading } = useQuery<PromoCode[]>({
    queryKey: ['promos'],
    queryFn: () => api.get('/promos'),
  });

  const { data: spinEligibility } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, isAuthenticated ? 'auth' : 'guest', storeId ?? ''],
    queryFn: () => fetchSpinEligibility(isAuthenticated, storeId),
    enabled: authHydrated,
    staleTime: 15_000,
  });

  const promoDisplays = useMemo(() => mapPromosToDisplays(promos), [promos]);
  const bannerPromos = useMemo(() => promoDisplays.filter((p) => p.isBanner), [promoDisplays]);
  const spinPromos = useMemo(() => {
    if (!shouldShowSpinEntryPoints(spinEligibility)) return [];
    return promoDisplays.filter((p) => p.isSpinOffer);
  }, [promoDisplays, spinEligibility]);
  const directOfferPromos = useMemo(
    () => promoDisplays.filter((p) => p.isDirectOffer && !p.isSpinOffer),
    [promoDisplays],
  );
  const codePromos = useMemo(
    () => promoDisplays.filter((p) => !p.isBanner && !p.isDirectOffer && !p.isSpinOffer && p.requiresPromoCode !== false),
    [promoDisplays],
  );

  return (
    <div className="promotions-page">
      <div className="promotions-page__bubbles" aria-hidden>
        <span className="promotions-page__bubble promotions-page__bubble--1" />
        <span className="promotions-page__bubble promotions-page__bubble--2" />
        <span className="promotions-page__bubble promotions-page__bubble--3" />
        <span className="promotions-page__bubble promotions-page__bubble--4" />
        <span className="promotions-page__bubble promotions-page__bubble--5" />
      </div>

      {/* Hero */}
      <motion.section
        className="promotions-page__hero"
        {...fadeUp}
        transition={{ duration: 0.45 }}
        aria-label="Promotions hero"
      >
        <div className="promotions-page__hero-card">
          <div className="promotions-page__hero-glow" aria-hidden />
          <div className="promotions-page__hero-orbs" aria-hidden>
            <span className="promotions-page__hero-orb promotions-page__hero-orb--1" />
            <span className="promotions-page__hero-orb promotions-page__hero-orb--2" />
          </div>

          <div className="promotions-page__hero-top">
            <div className="promotions-page__hero-copy">
              <span className="promotions-page__hero-badge">
                <Sparkles size={12} strokeWidth={2.25} aria-hidden />
                Deals &amp; Savings
              </span>
              <h1 className="promotions-page__hero-title">
                <span className="promotions-page__hero-title-lead">Exclusive</span>
                <span className="promotions-page__hero-title-accent">Promotions &amp; Offers</span>
              </h1>
              <p className="promotions-page__hero-subtitle">
                Limited-time discounts on bubble tea, boba favourites, and free delivery — apply a
                code at checkout.
              </p>
              <div className="promotions-page__hero-actions">
                <button
                  type="button"
                  className="promotions-page__hero-btn promotions-page__hero-btn--primary"
                  onClick={() => openOrderModal({ allowSkip: true })}
                >
                  Order Now <Zap size={15} strokeWidth={2.25} aria-hidden />
                </button>
                <Link href="/menu" className="promotions-page__hero-btn promotions-page__hero-btn--ghost">
                  View Menu <ChevronRight size={15} strokeWidth={2.25} aria-hidden />
                </Link>
              </div>
            </div>

            <div className="promotions-page__hero-visual" aria-hidden>
              <AnimatedMascot
                pose="cup-offer"
                size="md"
                showCup
                showBubble={false}
                className="promotions-page__hero-mascot"
              />
              <div className="promotions-page__hero-stat">
                <Tag size={14} strokeWidth={2.25} aria-hidden />
                <span>
                  <strong>{isLoading ? '…' : codePromos.length + directOfferPromos.length + bannerPromos.length + spinPromos.length}</strong> Active Offers
                </span>
              </div>
              <span className="promotions-page__hero-deco promotions-page__hero-deco--1" />
              <span className="promotions-page__hero-deco promotions-page__hero-deco--2" />
              <span className="promotions-page__hero-deco promotions-page__hero-deco--3" />
            </div>
          </div>

          <div className="promotions-page__hero-chips">
            <span className="promotions-page__hero-chip">
              <Percent size={13} strokeWidth={2.25} aria-hidden />
              Up to LKR 100 off
            </span>
            <span className="promotions-page__hero-chip">
              <Truck size={13} strokeWidth={2.25} aria-hidden />
              Free delivery deals
            </span>
            <span className="promotions-page__hero-chip">
              <Gift size={13} strokeWidth={2.25} aria-hidden />
              Stack with loyalty
            </span>
            <span className="promotions-page__hero-chip">
              <Sparkles size={13} strokeWidth={2.25} aria-hidden />
              Spin the wheel
            </span>
          </div>
        </div>
      </motion.section>

      {/* Featured offers */}
      <motion.section
        className="promotions-page__section promotions-page__featured"
        {...fadeUp}
        transition={{ duration: 0.45, delay: 0.06 }}
        aria-label="Featured offers"
      >
        <div className="promotions-page__section-head">
          <div>
            <h2 className="promotions-page__section-title">
              Featured Offers <span aria-hidden>🔥</span>
            </h2>
            <p className="promotions-page__section-sub">Our best deals, hand-picked for you</p>
          </div>
        </div>

        <div className="promotions-page__featured-panel">
          <div className="promotions-page__slider-wrap">
            <HomeOffersSlider
              className="home-offers-slider--promotions-page"
              offerHref="/menu"
            />
          </div>
          <div className="promotions-page__featured-grid-wrap">
            <HomeOffersSlider
              variant="grid"
              className="home-offers-slider--promotions-page home-offers-slider--promotions-grid"
              offerHref="/menu"
            />
          </div>
        </div>
      </motion.section>

      {/* Banner promotions — KFC-style cards */}
      {(isLoading || bannerPromos.length > 0) && (
        <motion.section
          className="promotions-page__section promotions-page__banners"
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.08 }}
          aria-labelledby="banner-promos-heading"
        >
          <div className="promotions-page__section-head">
            <div>
              <h2 id="banner-promos-heading" className="promotions-page__section-title">
                Banner Offers
              </h2>
              <p className="promotions-page__section-sub">Order now — tap Add to Bucket on the offer card</p>
            </div>
          </div>
          <div className="promotions-page__banners-panel">
            {isLoading ? (
              <div className="promotions-page__banners-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="promo-banner-card promo-banner-card--skeleton animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="promotions-page__banners-grid">
                {bannerPromos.map((promo, i) => (
                  <PromotionBannerCard key={promo.code} promo={promo} index={i} />
                ))}
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* Product & bundle offers — Add to Cup, no checkout code */}
      {(isLoading || directOfferPromos.length > 0) && (
        <motion.section
          className="promotions-page__section promotions-page__banners"
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.09 }}
          aria-labelledby="direct-offers-heading"
        >
          <div className="promotions-page__section-head">
            <div>
              <h2 id="direct-offers-heading" className="promotions-page__section-title">
                Product &amp; Bundle Offers
              </h2>
              <p className="promotions-page__section-sub">Add items to your cup — no promo code needed</p>
            </div>
          </div>
          <div className="promotions-page__banners-panel">
            {isLoading ? (
              <div className="promotions-page__banners-grid">
                {[1, 2].map((i) => (
                  <div key={i} className="promo-banner-card promo-banner-card--skeleton animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="promotions-page__banners-grid">
                {directOfferPromos.map((promo, i) => (
                  <PromotionBannerCard key={promo.code} promo={promo} index={i} />
                ))}
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* Spin wheel prizes */}
      {(isLoading || spinPromos.length > 0) && (
        <motion.section
          className="promotions-page__section promotions-page__codes"
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.095 }}
          aria-labelledby="spin-offers-heading"
        >
          <div className="promotions-page__section-head">
            <div>
              <h2 id="spin-offers-heading" className="promotions-page__section-title">
                Spin Wheel Offers
              </h2>
              <p className="promotions-page__section-sub">
                Spin to win these prizes — apply your SPIN reward at checkout
              </p>
            </div>
            <span className="promotions-page__count">
              {isLoading ? '…' : `${spinPromos.length} prizes`}
            </span>
          </div>

          <div className="promotions-page__codes-panel">
            {isLoading ? (
              <div className="promotions-page__codes-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="promo-code-card promo-code-card--skeleton animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="promotions-page__codes-grid">
                {spinPromos.map((promo, i) => (
                  <PromoCodeCard key={promo.code} promo={promo} index={i} />
                ))}
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* All promo codes */}
      {(isLoading || codePromos.length > 0) && (
        <motion.section
          className="promotions-page__section promotions-page__codes"
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.1 }}
          aria-labelledby="promo-codes-heading"
        >
        <div className="promotions-page__section-head">
          <div>
            <h2 id="promo-codes-heading" className="promotions-page__section-title">
              All Promo Codes
            </h2>
            <p className="promotions-page__section-sub">Copy a code or tap Use at checkout to apply it</p>
          </div>
          <span className="promotions-page__count">
            {isLoading ? '…' : `${codePromos.length} active`}
          </span>
        </div>

        <div className="promotions-page__codes-panel">
          {isLoading ? (
            <div className="promotions-page__codes-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="promo-code-card promo-code-card--skeleton animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="promotions-page__codes-grid">
              {codePromos.map((promo, i) => (
                <PromoCodeCard key={promo.code} promo={promo} index={i} />
              ))}
            </div>
          )}
        </div>
      </motion.section>
      )}

      {/* Perks */}
      <motion.section
        className="promotions-page__section promotions-page__perks"
        {...fadeUp}
        transition={{ duration: 0.45, delay: 0.14 }}
        aria-label="More ways to save"
      >
        <h2 className="promotions-page__section-title promotions-page__section-title--center">
          More Ways to Save
        </h2>
        <p className="promotions-page__section-sub promotions-page__section-sub--center">
          Combine promotions with these Bing Chun perks
        </p>
        <div className="promotions-page__perks-grid">
          {PERK_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.title}
                href={item.href}
                className={`promotions-page__perk promotions-page__perk--${item.tone}`}
              >
                <span className="promotions-page__perk-icon" aria-hidden>
                  <Icon size={22} strokeWidth={2} />
                </span>
                <div className="promotions-page__perk-copy">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <ChevronRight size={16} className="promotions-page__perk-arrow" aria-hidden />
              </Link>
            );
          })}
        </div>
      </motion.section>

      {/* How to use */}
      <motion.section
        className="promotions-page__section promotions-page__how"
        {...fadeUp}
        transition={{ duration: 0.45, delay: 0.18 }}
        aria-labelledby="how-to-use-heading"
      >
        <h2 id="how-to-use-heading" className="promotions-page__section-title promotions-page__section-title--center">
          How to Use a Promo Code
        </h2>
        <ol className="promotions-page__steps">
          {HOW_STEPS.map((item) => (
            <li key={item.step} className="promotions-page__step">
              <span className="promotions-page__step-num">{item.step}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </motion.section>

      {/* CTA */}
      <motion.section
        className="promotions-page__section promotions-page__cta"
        {...fadeUp}
        transition={{ duration: 0.45, delay: 0.22 }}
        aria-label="Order now"
      >
        <div className="promotions-page__cta-card">
          <div className="promotions-page__cta-glow" aria-hidden />
          <ShoppingBag size={28} className="promotions-page__cta-icon" aria-hidden />
          <div className="promotions-page__cta-copy">
            <h2>Ready to order?</h2>
            <p>Your next favourite drink is waiting on the menu.</p>
          </div>
          <div className="promotions-page__cta-actions">
            <button
              type="button"
              className="promotions-page__cta-btn promotions-page__cta-btn--primary"
              onClick={() => openOrderModal({ allowSkip: true })}
            >
              Order Now <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
            </button>
            <Link href="/menu" className="promotions-page__cta-secondary">
              View Menu <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
