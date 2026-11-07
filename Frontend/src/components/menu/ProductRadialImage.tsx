'use client';

interface ProductRadialImageProps {
  imageUrl?: string;
  alt?: string;
  emoji?: string;
  className?: string;
  /** First visible cards can opt into higher fetch priority. */
  priority?: boolean;
}

export default function ProductRadialImage({
  imageUrl,
  alt = '',
  emoji = '🍦',
  className = '',
  priority = false,
}: ProductRadialImageProps) {
  return (
    <div className={`product-radial-image ${className}`.trim()}>
      <div className="product-radial-image__glow" aria-hidden />
      <div className="product-radial-image__content">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={alt}
            className="product-radial-image__img"
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'low'}
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
          />
        ) : (
          <span className="product-radial-image__placeholder" aria-hidden>
            {emoji}
          </span>
        )}
      </div>
    </div>
  );
}
