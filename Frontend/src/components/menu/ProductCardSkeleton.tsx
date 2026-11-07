'use client';

type ProductCardSkeletonProps = {
  count?: number;
  layout?: 'grid' | 'list';
  className?: string;
};

export default function ProductCardSkeleton({
  count = 8,
  layout = 'grid',
  className = '',
}: ProductCardSkeletonProps) {
  const isList = layout === 'list';
  const gridClass = isList
    ? 'product-card-grid product-card-grid--list flex flex-col gap-3'
    : 'product-card-grid grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4 md:gap-5';

  return (
    <div className={`${gridClass} ${className}`.trim()} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`product-card-shell product-card-skeleton${isList ? ' product-card-shell--list' : ''}`}
        >
          <div
            className={`product-card product-card--app product-card-skeleton__card${
              isList ? ' product-card--row' : ''
            }`}
          >
            <div className="product-card__image-area product-card-skeleton__image" />
            <div className="product-card-skeleton__body">
              <div className="product-card-skeleton__line product-card-skeleton__line--title" />
              <div className="product-card-skeleton__line product-card-skeleton__line--meta" />
              <div className="product-card-skeleton__footer">
                <div className="product-card-skeleton__line product-card-skeleton__line--price" />
                <div className="product-card-skeleton__add" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
