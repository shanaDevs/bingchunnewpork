'use client';

interface ProductRadialImageProps {
  imageUrl?: string;
  alt?: string;
  emoji?: string;
  className?: string;
}

export default function ProductRadialImage({
  imageUrl,
  alt = '',
  emoji = '🍦',
  className = '',
}: ProductRadialImageProps) {
  return (
    <div className={`product-radial-image ${className}`.trim()}>
      <div className="product-radial-image__glow" aria-hidden />
      <div className="product-radial-image__content">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={alt} className="product-radial-image__img" loading="lazy" decoding="async" />
        ) : (
          <span className="product-radial-image__placeholder" aria-hidden>
            {emoji}
          </span>
        )}
      </div>
    </div>
  );
}
