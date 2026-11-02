import type { Metadata } from 'next';
import JsonLd from '@/components/seo/JsonLd';
import { productSchema } from '@/components/seo/schemas';
import { getApiBaseUrl } from '@/lib/apiBase';
import { absoluteUrl, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, SITE_NAME } from '@/lib/seo';
import ProductClient from './ProductClient';
import { MenuRedesignShell } from '@/components/menu-redesign/MenuRedesignShell';

type ProductMeta = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  basePrice?: number | null;
};

async function fetchProduct(id: string): Promise<ProductMeta | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/menu/products/${encodeURIComponent(id)}`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: ProductMeta } | ProductMeta;
    if (json && typeof json === 'object' && 'data' in json && json.data) return json.data;
    if (json && typeof json === 'object' && 'id' in json) return json as ProductMeta;
    return null;
  } catch {
    return null;
  }
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) {
    return {
      title: 'Product',
      description: DEFAULT_DESCRIPTION,
      alternates: { canonical: `/product/${id}` },
    };
  }

  const image = product.imageUrl || product.imageUrls?.[0] || DEFAULT_OG_IMAGE;
  const description =
    product.description?.trim() ||
    `Order ${product.name} from ${SITE_NAME}. Premium bubble tea & ice cream delivery and takeaway across Sri Lanka.`;

  return {
    title: product.name,
    description,
    alternates: {
      canonical: `/product/${product.id}`,
    },
    openGraph: {
      title: `${product.name} | ${SITE_NAME}`,
      description,
      url: absoluteUrl(`/product/${product.id}`),
      type: 'website',
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | ${SITE_NAME}`,
      description,
      images: [image],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = await fetchProduct(id);

  return (
    <>
      {product ? (
        <JsonLd
          data={productSchema({
            id: product.id,
            name: product.name,
            description: product.description,
            imageUrl: product.imageUrl || product.imageUrls?.[0],
            basePrice: product.basePrice,
          })}
        />
      ) : null}
      <MenuRedesignShell>
        <ProductClient />
      </MenuRedesignShell>
    </>
  );
}
