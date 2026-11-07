import ProductCardSkeleton from '@/components/menu/ProductCardSkeleton';

export default function MenuLoading() {
  return (
    <div className="menu-page min-h-screen bg-white md:bg-navy">
      <div className="menu-page__section-inner py-4 sm:py-5 px-4">
        <div className="mb-4 h-28 rounded-2xl bg-navy-light/60 animate-pulse" />
        <div className="mb-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-20 shrink-0 rounded-full bg-navy-light/60 animate-pulse" />
          ))}
        </div>
        <ProductCardSkeleton count={8} />
      </div>
    </div>
  );
}
