import type { MetadataRoute } from 'next';
import { getApiBaseUrl } from '@/lib/apiBase';
import { SITE_URL } from '@/lib/seo';

type ProductRow = {
  id: string;
  isAvailable?: boolean;
};

async function fetchProductIds(): Promise<string[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/menu/products`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as ProductRow[] | { data?: ProductRow[] };
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    return list.filter((p) => p?.id && p.isAvailable !== false).map((p) => p.id);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/menu`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/stores`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/promotions`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];

  const productIds = await fetchProductIds();
  const productRoutes: MetadataRoute.Sitemap = productIds.map((id) => ({
    url: `${SITE_URL}/product/${id}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...productRoutes];
}
