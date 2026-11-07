'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import type { HomeOffer } from '@/components/home/homeOffers';
import { applyHomeOfferToCart } from '@/lib/applyHomeOffer';

interface HomeOfferCardProps {
  offer: HomeOffer;
  priority?: boolean;
  compact?: boolean;
  menuSide?: boolean;
}

export default function HomeOfferCard({
  offer,
  priority = false,
  compact = false,
  menuSide = false,
}: HomeOfferCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      toast.success(`${offer.code} copied`);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy code');
    }
  }

  async function orderNow() {
    if (applying) return;
    setApplying(true);
    try {
      const { shouldGoToCart } = await applyHomeOfferToCart(offer);
      if (shouldGoToCart) router.push('/cart');
    } finally {
      setApplying(false);
    }
  }

  return (
    <article
      className={`home-offer-card-v2 home-offer-card-v2--${offer.tone}${compact ? ' home-offer-card-v2--compact' : ''}${menuSide ? ' home-offer-card-v2--menu-side' : ''}`}
    >
      <div className="home-offer-card-v2__pattern" aria-hidden />
      <div className="home-offer-card-v2__glow" aria-hidden />
      <div className="home-offer-card-v2__content">
        <span className="home-offer-card-v2__badge">
          <Sparkles size={11} strokeWidth={2.25} aria-hidden />
          {menuSide ? "Today's Special" : 'Limited time'}
        </span>
        <button
          type="button"
          className={`home-offer-card-v2__code${copied ? ' home-offer-card-v2__code--copied' : ''}`}
          onClick={() => void copyCode()}
          title={`Copy ${offer.code}`}
          aria-label={`Copy promo code ${offer.code}`}
        >
          {offer.code}
        </button>
        <p className="home-offer-card-v2__title">{offer.title}</p>
        <p className="home-offer-card-v2__subtitle">{offer.subtitle}</p>
        <button
          type="button"
          className="home-offer-card-v2__cta"
          onClick={() => void orderNow()}
          disabled={applying}
          aria-label={`Add ${offer.code} to your cup`}
        >
          {applying ? 'Adding...' : 'Order Now'}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
          </svg>
        </button>
      </div>
      <div className="home-offer-card-v2__visual" aria-hidden>
        <div className="home-offer-card-v2__magic-wrap">
          <span className="home-offer-card-v2__spark home-offer-card-v2__spark--1" />
          <span className="home-offer-card-v2__spark home-offer-card-v2__spark--2" />
          <span className="home-offer-card-v2__spark home-offer-card-v2__spark--3" />
          <Image
            src={offer.image}
            alt=""
            fill
            className="home-offer-card-v2__image"
            priority={priority}
            unoptimized
            sizes="(min-width: 1280px) 160px, (min-width: 768px) 140px, 42vw"
          />
        </div>
      </div>
    </article>
  );
}
