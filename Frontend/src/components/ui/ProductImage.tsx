import { resolveProductImageUrl } from '@/lib/productImageUrl';

type Props = {
  name: string;
  imageUrl?: string | null;
  className?: string;
  contain?: boolean;
};

export default function ProductImage({ name, imageUrl, className = '', contain = false }: Props) {
  const src = resolveProductImageUrl(imageUrl);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${contain ? 'object-contain' : 'object-cover'} ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div className={`flex items-center justify-center bg-navy-light text-2xl ${className}`} aria-hidden>
      🧋
    </div>
  );
}
