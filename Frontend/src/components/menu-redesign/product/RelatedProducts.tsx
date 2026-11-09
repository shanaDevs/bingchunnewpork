'use client';

import { useQuery } from '@tanstack/react-query';
import { MenuProductCard } from '@/components/menu-redesign/MenuProductCard';
import { Container } from '@/components/home-redesign/ui/Container';
import { api } from '@/lib/api';
import { isProductInStock } from '@/lib/productAvailability';
import type { Product } from '@/types';

const SUGGESTIONS = 4;

export function RelatedProducts({ product }: { product: Product }) {
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products', 'related', product.category?.slug],
    queryFn: () => {
      const params = new URLSearchParams();
      if (product.category?.slug) params.set('category', product.category.slug);
      return api.get(`/menu/products?${params.toString()}`);
    },
  });

  const suggestions = allProducts
    .filter((other) => other.id !== product.id)
    .sort(
      (a, b) =>
        Number(isProductInStock(b)) - Number(isProductInStock(a)) ||
        (b.avgRating ?? 0) - (a.avgRating ?? 0),
    )
    .slice(0, SUGGESTIONS);

  if (suggestions.length === 0) return null;

  const categoryName = product.category?.name ?? 'Menu';

  return (
    <section aria-labelledby="related-heading">
      <Container className="pb-16 sm:pb-20 lg:pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2
            id="related-heading"
            className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-semibold text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96]"
          >
            You might also like
          </h2>
          <a
            href={`/menu?category=${encodeURIComponent(product.category?.slug ?? '')}`}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            See all {categoryName}
          </a>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
          {suggestions.map((item) => (
            <MenuProductCard key={item.id} product={item} available={isProductInStock(item)} fromMenu={false} />
          ))}
        </div>
      </Container>
    </section>
  );
}
