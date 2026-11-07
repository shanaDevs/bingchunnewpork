'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DailySpecial, Product } from '@/types';
import ProductRadialImage from '@/components/menu/ProductRadialImage';

interface MenuTodaySpecialProps {
  onOrder: (product: Product) => void;
}

function useCountdown(endsAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (!endsAt) return { hours: 0, minutes: 0, seconds: 0, expired: true };

  const diff = Math.max(0, new Date(endsAt).getTime() - now);
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return { hours, minutes, seconds, expired: diff <= 0 };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function MenuTodaySpecial({ onOrder }: MenuTodaySpecialProps) {
  const { data: special } = useQuery<DailySpecial | null>({
    queryKey: ['menu-special-today'],
    queryFn: () => api.get('/menu/specials/today'),
    staleTime: 60_000,
  });

  const countdown = useCountdown(special?.endsAt);

  if (!special?.product || countdown.expired) return null;

  const { product } = special;
  const discount =
    product.basePrice > 0
      ? Math.round(((product.basePrice - special.specialPrice) / product.basePrice) * 100)
      : 0;

  return (
    <article className="menu-special-card">
      <div className="menu-special-card__badge">Today&apos;s Special</div>
      <div className="menu-special-card__body">
        <div className="menu-special-card__visual">
          <ProductRadialImage
            imageUrl={product.imageUrl}
            alt={product.name}
            emoji="🧋"
            className="h-full w-full"
          />
        </div>
        <div className="menu-special-card__copy">
          <h2 className="menu-special-card__title">{product.name}</h2>
          <div className="menu-special-card__prices">
            <span className="menu-special-card__price-old">LKR {product.basePrice.toLocaleString()}</span>
            <span className="menu-special-card__price">LKR {special.specialPrice.toLocaleString()}</span>
            {discount > 0 && <span className="menu-special-card__discount">{discount}% OFF</span>}
          </div>
          <button type="button" className="menu-special-card__cta" onClick={() => onOrder(product)}>
            Order Now
          </button>
        </div>
      </div>
      <div className="menu-special-card__countdown" aria-live="polite">
        <div className="menu-special-card__countdown-block">
          <span className="menu-special-card__countdown-value">{pad(countdown.hours)}</span>
          <span className="menu-special-card__countdown-label">HRS</span>
        </div>
        <span className="menu-special-card__countdown-sep">:</span>
        <div className="menu-special-card__countdown-block">
          <span className="menu-special-card__countdown-value">{pad(countdown.minutes)}</span>
          <span className="menu-special-card__countdown-label">MINS</span>
        </div>
        <span className="menu-special-card__countdown-sep">:</span>
        <div className="menu-special-card__countdown-block">
          <span className="menu-special-card__countdown-value">{pad(countdown.seconds)}</span>
          <span className="menu-special-card__countdown-label">SECS</span>
        </div>
      </div>
      <Image
        src="/brand/mascot-hero.avif"
        alt=""
        width={72}
        height={72}
        className="menu-special-card__mascot"
        aria-hidden
      />
    </article>
  );
}
