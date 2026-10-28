import { prisma } from './prisma';
import { isUnknownPrismaArg, markSpinOfferDeleted, notDeletedSpinOfferFilter } from './spinSchema';
import { deactivateSpinOfferPromo } from './spinOfferPromo';

const giftProductInclude = {
  giftProduct: { select: { id: true, name: true, basePrice: true, imageUrl: true, slug: true } },
} as const;

function spinOfferDedupeKey(offer: {
  storeId?: string | null;
  sortOrder: number;
  offerType: string;
  label: string;
  discountValue: number;
  giftProductId?: string | null;
}): string {
  return [
    offer.storeId ?? 'platform',
    offer.sortOrder,
    offer.offerType,
    offer.label.trim().toLowerCase(),
    offer.discountValue,
    offer.giftProductId ?? '',
  ].join('|');
}

/** Soft-delete duplicate seeded prizes (same slice content) keeping the oldest row. */
export async function pruneDuplicateSpinOffers(storeId?: string | null): Promise<number> {
  const notDeleted = await notDeletedSpinOfferFilter();
  const offers = await withSpinStoreIdFallback(
    () =>
      prisma.spinWheelOffer.findMany({
        where: {
          ...(storeId === undefined ? {} : { storeId: storeId ?? null }),
          ...notDeleted,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          storeId: true,
          sortOrder: true,
          offerType: true,
          label: true,
          discountValue: true,
          giftProductId: true,
        },
      }),
    () =>
      prisma.spinWheelOffer.findMany({
        where: notDeleted,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          storeId: true,
          sortOrder: true,
          offerType: true,
          label: true,
          discountValue: true,
          giftProductId: true,
        },
      }),
  );

  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  for (const offer of offers) {
    const key = spinOfferDedupeKey(offer);
    if (seen.has(key)) duplicateIds.push(offer.id);
    else seen.add(key);
  }

  for (const id of duplicateIds) {
    await markSpinOfferDeleted(id);
    await deactivateSpinOfferPromo(id).catch(() => undefined);
  }
  return duplicateIds.length;
}

export function dedupeSpinOffersKeepFirst<T extends {
  storeId?: string | null;
  sortOrder: number;
  offerType: string;
  label: string;
  discountValue: number;
  giftProductId?: string | null;
}>(offers: T[]): T[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = spinOfferDedupeKey(offer);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function withSpinStoreIdFallback<T>(
  withStoreId: () => Promise<T>,
  withoutStoreId: () => Promise<T>,
): Promise<T> {
  try {
    return await withStoreId();
  } catch (err) {
    if (!isUnknownPrismaArg(err, 'storeId')) throw err;
    return withoutStoreId();
  }
}

export async function countActiveSpinOffersForStore(storeId?: string | null): Promise<number> {
  const offers = await resolveActiveSpinOffersForStore(storeId);
  return offers.length;
}

export async function resolveSpinOffersForStore(storeId?: string | null) {
  const notDeleted = await notDeletedSpinOfferFilter();
  const orderBy = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

  return withSpinStoreIdFallback(
    async () => {
      if (storeId) {
        const branchOffers = await prisma.spinWheelOffer.findMany({
          where: { storeId, ...notDeleted },
          include: giftProductInclude,
          orderBy,
        });
        if (branchOffers.length > 0) return dedupeSpinOffersKeepFirst(branchOffers);
      }
      return dedupeSpinOffersKeepFirst(
        await prisma.spinWheelOffer.findMany({
          where: { storeId: null, ...notDeleted },
          include: giftProductInclude,
          orderBy,
        }),
      );
    },
    async () =>
      dedupeSpinOffersKeepFirst(
        await prisma.spinWheelOffer.findMany({
          where: notDeleted,
          include: giftProductInclude,
          orderBy,
        }),
      ),
  );
}

export async function resolveActiveSpinOffersForStore(storeId?: string | null) {
  const offers = await resolveSpinOffersForStore(storeId);
  return offers.filter((o) => o.isActive);
}
