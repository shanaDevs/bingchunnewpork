import Image from 'next/image';
import { resolveProductImageUrl } from '@/lib/productImageUrl';

type Props = {
  name: string;
  imageUrl?: string | null;
  className?: string;
  contain?: boolean;
  /** Prefer for above-the-fold thumbs (rare). */
  priority?: boolean;
  sizes?: string;
};

/**
 * Product thumb using next/image so shop/checkout get responsive srcset + WebP/AVIF.
 * Class names stay on the <img> so existing size/layout CSS keeps working.
 */
export default function ProductImage({
  name,
  imageUrl,
  className = '',
  contain = false,
  priority = false,
  sizes = '(max-width: 640px) 45vw, 160px',
}: Props) {
  const src = resolveProductImageUrl(imageUrl);
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={160}
        height={160}
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : 'lazy'}
        decoding="async"
        className={`${contain ? 'object-contain' : 'object-cover'} ${className}`}
      />
    );
  }

  return (
    <div className={`flex items-center justify-center bg-navy-light text-2xl ${className}`} aria-hidden>
      🧋
    </div>
  );
}
