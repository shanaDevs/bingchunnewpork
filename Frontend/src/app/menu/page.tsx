import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { menuItemListSchema, type ProductForSchema } from '@/components/seo/schemas';
import { getApiBaseUrl } from '@/lib/apiBase';
import { absoluteUrl } from '@/lib/seo';
import type { Category, Product } from '@/types';
import MenuClient from './MenuClient';

export const metadata: Metadata = {
  title: 'Menu',
  description:
    'Browse the Bing Chun menu — premium bubble tea, milk tea, milkshakes, and ice cream. Order online for delivery or takeaway across Sri Lanka.',
  alternates: {
    canonical: '/menu',
  },
  openGraph: {
    title: 'Menu | Bing Chun Sri Lanka',
    description:
      'Browse the Bing Chun menu — premium bubble tea, milk tea, milkshakes, and ice cream.',
    url: absoluteUrl('/menu'),
  },
};

async function fetchMenuProducts(): Promise<Product[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/menu/products`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Product[] } | Product[];
    const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    return list.filter((p) => p?.id && p?.name);
  } catch {
    return [];
  }
}

async function fetchMenuCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/menu/categories`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Category[] } | Category[];
    const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    return list.filter((c) => c?.id && c?.slug);
  } catch {
    return [];
  }
}

export default async function MenuPage() {
  const [products, categories] = await Promise.all([fetchMenuProducts(), fetchMenuCategories()]);
  const schemaProducts = products as ProductForSchema[];

  return (
    <>
      {schemaProducts.length > 0 ? <JsonLd data={menuItemListSchema(schemaProducts)} /> : null}
      <MenuClient initialProducts={products} initialCategories={categories} />
    </>
  );
}
