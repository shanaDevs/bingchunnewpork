import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { storesItemListSchema, type StoreForSchema } from '@/components/seo/schemas';
import { getApiBaseUrl } from '@/lib/apiBase';
import { absoluteUrl, BUSINESS_PHONE_DISPLAY } from '@/lib/seo';
import StoresClient from './StoresClient';

export const metadata: Metadata = {
  title: 'Store Locations',
  description: `Find Bing Chun bubble tea stores across Sri Lanka — 32+ branches island-wide. Call ${BUSINESS_PHONE_DISPLAY} for inquiries. Delivery and takeaway available.`,
  alternates: {
    canonical: '/stores',
  },
  openGraph: {
    title: 'Store Locations | Bing Chun Sri Lanka',
    description: `Find Bing Chun stores across Sri Lanka. Call ${BUSINESS_PHONE_DISPLAY} for inquiries.`,
    url: absoluteUrl('/stores'),
  },
};

async function fetchStores(): Promise<StoreForSchema[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/stores`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: StoreForSchema[] } | StoreForSchema[];
    const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    return list.filter((s) => s?.id && s?.name);
  } catch {
    return [];
  }
}

export default async function StoresPage() {
  const stores = await fetchStores();

  return (
    <>
      {stores.length > 0 ? <JsonLd data={storesItemListSchema(stores)} /> : null}
      <StoresClient />
    </>
  );
}
