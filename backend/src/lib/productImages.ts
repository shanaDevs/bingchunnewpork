import { rewriteSpacesPublicUrl } from './spaces';

/** Public URL paths for product photos (served from API /products) */
export const PRODUCT_IMAGES: Record<string, string> = {
  'Bobo Milk Tea': '/products/Bobo-Milk-Tea-500u.png',
  'Brown Sugar Boba Milk Tea': '/products/Brown-Black-Sugar-Boba-Milk-Tea-500u.png',
  'Blueberry Bobo Tea': '/products/Blueberry-Bobo-Tea-500u.png',
  'Grape Bobo Tea': '/products/Grape-Bobo-Tea-700ml.png',
  'Strawberry Bobo Jasmine Milk Tea': '/products/Strawberry-Bobo-Jasmine-Milk-Tea-700ml.png',
  'Original Milk Tea': '/products/Original-Milk-Tea-500u.png',
  'Lychee Jasmine Milk Tea': '/products/Lychee-Jasmine-Tea-700ml.png',
  'Fresh Lemonade': '/products/Fresh-Lemonade-700ml.png',
  'Jasmine Green Tea': '/products/Jasmine-Green-Tea-700ml.png',
  'Lemon Black Tea': '/products/Lemon-Black-Tea-700ml.png',
  'Lemon Green Tea': '/products/Lemon-Green-Tea-700ml.png',
  'Strawberry Lemon Tea': '/products/Strawberry-Lemon-Tea-700ml.png',
  'Strawberry Mango Lemon Tea': '/products/Strawberry-Mango-Lemon-Tea-v2.png',
  'Blueberry Milkshake': '/products/Blueberry-Milkshake-500u.png',
  'Strawberry Milkshake': '/products/Strawberry-Milkshake-500u.png',
  'Chocolate Oreo Milkshake': '/products/Chocolate-Oreo-Milkshake.png',
  'Mulberry Milkshake': '/products/Mulberry-Milkshake.png',
  'Strawberry Oreo Milkshake': '/products/Strawberry-Oreo-Milkshake-500u.png',
  'Blueberry Sundae': '/products/Blueberry-Sundae-360.png',
  'Blueberry Chocolate Sundae': '/products/Blueberry-Chocolate-Sundae-360.png',
  'Brown Sugar Boba Sundae': '/products/Brown-Black-Sugar-Boba-Sundae-360.png',
  'Chocolate Oreo Sundae': '/products/Chocolate-Oreo-Sundae-360.png',
  'Chocolate Biscuit Sundae': '/products/Chocolate-Biscuit-Sundae-360.png',
  'Mango Sundae': '/products/Mango-Sundae.png',
  'Mango Pomelo Sago': '/products/Mango-Pomelo-Sago.png',
  'Oreo Chocolate Sundae': '/products/Oreo-Chocolate-Sundae-360.png',
  'Strawberry Sundae': '/products/Strawberry-Sundae-360.png',
  'Vanilla Ice Cream': '/products/Vanilla-Ice-Cream.png',
  'Chocolate Ice Cream': '/products/Chocolate-Ice-Cream.png',
  'Mix Choco Vanilla Ice Cream': '/products/Mix-Choco-Vanilla-Ice-Cream.png',
};

export function productImageUrl(name: string): string | undefined {
  return PRODUCT_IMAGES[name];
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** Parse products.imageUrls JSON (array of strings) from Prisma Json or a raw string. */
export function parseProductImageUrls(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return uniqueUrls(value.map((item) => (typeof item === 'string' ? item.trim() : '')));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return parseProductImageUrls(JSON.parse(trimmed));
    } catch {
      return uniqueUrls([trimmed]);
    }
  }
  return [];
}

export function resolveProductImageFields(input: {
  imageUrl?: string | null;
  imageUrls?: unknown;
}): { imageUrl: string | null; imageUrls: string[] } {
  const urls = uniqueUrls([
    ...parseProductImageUrls(input.imageUrls).map(normalizeProductImageUrl),
    normalizeProductImageUrl(input.imageUrl),
  ]);
  return { imageUrl: urls[0] ?? null, imageUrls: urls };
}

/** DB may store .avif paths while assets on disk are .png under /products.
 *  Full Spaces URLs are rewritten to path-style when the bucket name has a dot
 *  (virtual-hosted hostnames break TLS for those buckets). */
export function normalizeProductImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    return rewriteSpacesPublicUrl(imageUrl);
  }
  if (imageUrl.startsWith('/products/') && imageUrl.endsWith('.avif')) {
    return `${imageUrl.slice(0, -5)}.png`;
  }
  return imageUrl;
}

export function withProductImageUrl<T extends { imageUrl?: string | null; imageUrls?: unknown }>(
  product: T,
): T & { imageUrl: string | null; imageUrls: string[] } {
  const images = resolveProductImageFields(product);
  return { ...product, imageUrl: images.imageUrl, imageUrls: images.imageUrls };
}

export function normalizeOrderItemImages<T extends {
  items?: Array<{
    product?: { imageUrl?: string | null } | null;
    imageUrl?: string | null;
  }>;
}>(order: T): T {
  if (!order.items?.length) return order;
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      product: item.product
        ? { ...item.product, imageUrl: normalizeProductImageUrl(item.product.imageUrl) }
        : item.product,
    })),
  };
}
