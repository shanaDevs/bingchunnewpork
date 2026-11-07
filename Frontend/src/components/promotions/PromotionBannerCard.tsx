'use client';

import Image from 'next/image';

/** The admin's live preview of an Upload Banner promotion (PromotionBannerSetup). */
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
