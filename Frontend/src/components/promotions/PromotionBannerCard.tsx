'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PromoDisplay } from '@/components/home/homeOffers';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';

interface PromotionBannerCardProps {
  promo: PromoDisplay;
  index?: number;
}

export default function PromotionBannerCard({ promo, index = 0 }: PromotionBannerCardProps) {
  const [copied, setCopied] = useState(false);
  const showCode = promo.requiresPromoCode !== false && !promo.isDirectOffer;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      toast.success(`${promo.code} copied!`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy code');
    }
  }

  const priceLabel = promo.displayPrice != null && promo.displayPrice > 0
    ? `+ Rs. ${promo.displayPrice.toLocaleString()}`
    : null;

  const ctaHref = promo.productHref ?? '/menu';

  return (
    <article
      className="promo-banner-card"
      style={{ animationDelay: `${Math.min(index * 0.06, 0.3)}s` }}
    >
      <div className="promo-banner-card__media">
        {promo.image ? (
          <Image
            src={promo.image}
            alt=""
            fill
            className="promo-banner-card__image"
            unoptimized
            sizes="(min-width: 768px) 280px, 100vw"
          />
        ) : (
          <div className="promo-banner-card__image-placeholder">Banner</div>
        )}
      </div>

      <div className="promo-banner-card__body">
        <h3 className="promo-banner-card__title">{promo.title}</h3>
        {promo.subtitle && !promo.isBanner && (
          <p className="promo-banner-card__subtitle">{promo.subtitle}</p>
        )}
        {priceLabel && <p className="promo-banner-card__price">{priceLabel}</p>}

        <div className="promo-banner-card__actions">
          {promo.isDirectOffer && promo.productHref ? (
            <Link href={ctaHref} className="promo-banner-card__cta">
              {promo.ctaLabel ?? 'Add to Cup'}
            </Link>
          ) : (
            <button
              type="button"
              className="promo-banner-card__cta"
              onClick={() => openOrderModal({ allowSkip: true })}
            >
              {promo.ctaLabel ?? 'Add to Bucket'}
            </button>
          )}
          {showCode && (
            <button
              type="button"
              className="promo-banner-card__code"
              onClick={copyCode}
              aria-label={`Copy promo code ${promo.code}`}
              title={`Code: ${promo.code}`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{promo.code}</span>
            </button>
          )}
        </div>

        {promo.productHref && !promo.isDirectOffer && (
          <Link href={promo.productHref} className="promo-banner-card__link">
            View product
          </Link>
        )}
      </div>
    </article>
  );
}

export function PromotionBannerCardPreview({
  title,
  image,
  displayPrice,
  ctaLabel,
  code = 'PROMO',
}: {
  title: string;
  image?: string;
  displayPrice?: number;
  ctaLabel?: string;
  code?: string;
}) {
  return (
    <div className="promo-banner-card promo-banner-card--preview">
      <div className="promo-banner-card__media">
        {image ? (
          <Image src={image} alt="" fill className="promo-banner-card__image" unoptimized sizes="240px" />
        ) : (
          <div className="promo-banner-card__image-placeholder">Upload banner</div>
        )}
      </div>
      <div className="promo-banner-card__body">
        <h3 className="promo-banner-card__title">{title || 'Promotion Title'}</h3>
        {displayPrice != null && displayPrice > 0 && (
          <p className="promo-banner-card__price">+ Rs. {displayPrice.toLocaleString()}</p>
        )}
        <div className="promo-banner-card__actions">
          <span className="promo-banner-card__cta">{ctaLabel ?? 'Add to Bucket'}</span>
          <span className="promo-banner-card__code promo-banner-card__code--static">{code}</span>
        </div>
      </div>
    </div>
  );
}
