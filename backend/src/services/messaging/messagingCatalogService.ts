import { prisma } from '../../lib/prisma';
import { getStockAvailability } from '../inventoryReservationService';

export type MessagingProductHit = {
  productId: string;
  name: string;
  unitPrice: number;
  available: number;
  unitLabel: string;
};

/** Search active products at a store using the same Product + StoreProduct inventory. */
export async function searchStoreProducts(
  storeId: string,
  query: string,
  limit = 8,
): Promise<MessagingProductHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const products = await prisma.product.findMany({
    where: {
      isAvailable: true,
      OR: [
        { name: { contains: trimmed } },
        { description: { contains: trimmed } },
        { slug: { contains: trimmed.toLowerCase().replace(/\s+/g, '-') } },
      ],
    },
    take: Math.max(limit * 3, 20),
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      basePrice: true,
    },
  });

  if (products.length === 0) return [];

  const storeRows = await prisma.storeProduct.findMany({
    where: {
      storeId,
      productId: { in: products.map((p) => p.id) },
      isAvailable: true,
    },
    select: { productId: true, stock: true, isAvailable: true },
  });
  const storeMap = new Map(storeRows.map((r) => [r.productId, r]));

  const hits: MessagingProductHit[] = [];
  for (const product of products) {
    const row = storeMap.get(product.id);
    if (!row) continue;
    const availability = await getStockAvailability(storeId, product.id);
    hits.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.basePrice,
      available: Math.max(0, availability.availableStock),
      unitLabel: 'unit',
    });
    if (hits.length >= limit) break;
  }

  return hits;
}

export async function getStoreProductDetail(
  storeId: string,
  productId: string,
): Promise<MessagingProductHit | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, isAvailable: true },
    select: { id: true, name: true, basePrice: true },
  });
  if (!product) return null;

  const row = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
    select: { isAvailable: true },
  });
  if (!row?.isAvailable) return null;

  const availability = await getStockAvailability(storeId, productId);
  return {
    productId: product.id,
    name: product.name,
    unitPrice: product.basePrice,
    available: Math.max(0, availability.availableStock),
    unitLabel: 'unit',
  };
}

export async function listPopularStoreProducts(
  storeId: string,
  limit = 10,
): Promise<MessagingProductHit[]> {
  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    take: Math.max(limit * 3, 30),
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, basePrice: true },
  });
  if (!products.length) return [];

  const storeRows = await prisma.storeProduct.findMany({
    where: {
      storeId,
      productId: { in: products.map((p) => p.id) },
      isAvailable: true,
    },
    select: { productId: true },
  });
  const availableIds = new Set(storeRows.map((r) => r.productId));

  const hits: MessagingProductHit[] = [];
  for (const product of products) {
    if (!availableIds.has(product.id)) continue;
    const availability = await getStockAvailability(storeId, product.id);
    if (availability.availableStock <= 0) continue;
    hits.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.basePrice,
      available: Math.max(0, availability.availableStock),
      unitLabel: 'unit',
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function listActiveStores(options?: { city?: string; query?: string; limit?: number }) {
  const limit = options?.limit ?? 50;
  const city = options?.city?.trim();
  const query = options?.query?.trim();

  const where: {
    isActive: true;
    OR?: Array<{ city?: { contains: string }; name?: { contains: string } }>;
  } = { isActive: true };

  const needle = city || query;
  if (needle) {
    where.OR = [
      { city: { contains: needle } },
      { name: { contains: needle } },
    ];
  }

  return prisma.store.findMany({
    where,
    orderBy: { name: 'asc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      id: true,
      name: true,
      city: true,
      addressLine: true,
      isBusy: true,
      deliveryEnabled: true,
    },
  });
}

/** Resolve a default messaging store from env when set and active. */
export async function getDefaultMessagingStore() {
  const defaultId = (process.env.WHATSAPP_DEFAULT_STORE_ID || '').trim();
  if (!defaultId) return null;
  return prisma.store.findFirst({
    where: { id: defaultId, isActive: true },
    select: {
      id: true,
      name: true,
      city: true,
      addressLine: true,
      isBusy: true,
      deliveryEnabled: true,
    },
  });
}
