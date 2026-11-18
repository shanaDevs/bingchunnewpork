import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { menuItemListSchema, type ProductForSchema } from '@/components/seo/schemas';
import { MenuGate } from '@/components/menu-redesign/MenuGate';
import { MenuRedesignShell } from '@/components/menu-redesign/MenuRedesignShell';
import { getApiBaseUrl } from '@/lib/apiBase';
import { absoluteUrl } from '@/lib/seo';

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

async function fetchMenuProducts(): Promise<ProductForSchema[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/menu/products`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: ProductForSchema[] } | ProductForSchema[];
    const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    return list.filter((p) => p?.id && p?.name);
  } catch {
    return [];
  }
}

export default async function MenuPage() {
  const products = await fetchMenuProducts();

  return (
    <>
      {products.length > 0 ? <JsonLd data={menuItemListSchema(products)} /> : null}
      <MenuRedesignShell>
        <MenuGate />
      </MenuRedesignShell>
    </>
  );
}
