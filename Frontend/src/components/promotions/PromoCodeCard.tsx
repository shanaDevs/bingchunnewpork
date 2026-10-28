'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Copy, Check, Sparkles, ChevronRight, Dices } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { PromoDisplay } from '@/components/home/homeOffers';
import { isAutoApplyPromo } from '@/lib/promotionAutoApply';
import { useSpinStore } from '@/store/spinStore';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import {
  fetchSpinEligibility,
  SPIN_ELIGIBILITY_QUERY_KEY,
  shouldShowSpinEntryPoints,
} from '@/lib/spinEligibility';

interface PromoCodeCardProps {
  promo: PromoDisplay;
  index?: number;
}

export default function PromoCodeCard({ promo, index = 0 }: PromoCodeCardProps) {
  const [copied, setCopied] = useState(false);
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const storeId = useCartStore((s) => s.getFulfillmentStoreId());
  const isSpinOffer = Boolean(promo.isSpinOffer);

  const { data: spinEligibility } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, isAuthenticated ? 'auth' : 'guest', storeId ?? ''],
    queryFn: () => fetchSpinEligibility(isAuthenticated, storeId),
    enabled: authHydrated && isSpinOffer,
    staleTime: 15_000,
  });

  if (isSpinOffer && spinEligibility && !shouldShowSpinEntryPoints(spinEligibility)) {
    return null;
  }

  const autoApply = !isSpinOffer && isAutoApplyPromo(promo);
  const checkoutHref = autoApply
    ? '/cart'
    : `/checkout?promo=${encodeURIComponent(promo.code)}`;

  async function copyCode() {
    if (autoApply) return;
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      toast.success(`${promo.code} copied!`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy code');
    }
  }

  return (
    <article
      className={`promo-code-card promo-code-card--${promo.tone}`}
      style={{ animationDelay: `${Math.min(index * 0.06, 0.3)}s` }}
    >
      <div className="promo-code-card__pattern" aria-hidden />
      <div className="promo-code-card__glow" aria-hidden />

      <div className="promo-code-card__body">
        <div className="promo-code-card__main">
          <span className="promo-code-card__badge">
            {isSpinOffer ? (
              <Dices size={11} strokeWidth={2.25} aria-hidden />
            ) : (
              <Sparkles size={11} strokeWidth={2.25} aria-hidden />
            )}
            {isSpinOffer ? 'Spin wheel' : autoApply ? 'Auto offer' : 'Promo code'}
          </span>
          <h3 className="promo-code-card__title">{promo.title}</h3>
          <p className="promo-code-card__subtitle">{promo.subtitle}</p>

          <div className="promo-code-card__meta">
            {promo.minOrderValue > 0 && (
              <span>Min. LKR {promo.minOrderValue.toLocaleString()}</span>
            )}
            {promo.expiresAt && (
              <span>Expires {new Date(promo.expiresAt).toLocaleDateString()}</span>
            )}
          </div>

          <div className="promo-code-card__actions">
            {isSpinOffer ? (
              <button
                type="button"
                className="promo-code-card__order"
                onClick={() => requestOpenSpin()}
              >
                {promo.ctaLabel || 'Spin to win'}
                <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
              </button>
            ) : (
              <>
                {!autoApply && (
                  <button
                    type="button"
                    className="promo-code-card__code-btn"
                    onClick={copyCode}
                    aria-label={`Copy promo code ${promo.code}`}
                  >
                    <span className="promo-code-card__code">{promo.code}</span>
                    {copied ? (
                      <Check size={15} strokeWidth={2.5} aria-hidden />
                    ) : (
                      <Copy size={15} strokeWidth={2.5} aria-hidden />
                    )}
                  </button>
                )}
                <Link href={checkoutHref} className="promo-code-card__order">
                  {autoApply ? 'View in cup' : 'Use at checkout'}
                  <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="promo-code-card__visual" aria-hidden>
          <div className="promo-code-card__magic-wrap">
            <span className="promo-code-card__spark promo-code-card__spark--1" />
            <span className="promo-code-card__spark promo-code-card__spark--2" />
            <span className="promo-code-card__spark promo-code-card__spark--3" />
            <Image
              src={promo.image}
              alt=""
              fill
              className="promo-code-card__image"
              unoptimized
              sizes="(min-width: 768px) 120px, 88px"
            />
          </div>
        </div>
      </div>
    </article>
  );
}
