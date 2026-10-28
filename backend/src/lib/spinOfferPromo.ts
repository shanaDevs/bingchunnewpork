import { prisma } from './prisma';
import { notDeletedSpinOfferFilter } from './spinSchema';

export const SPIN_PROMO_SOURCE = 'SPIN_WHEEL';

type SpinOfferRow = {
  id: string;
  label: string;
  description: string | null;
  offerType: string;
  discountValue: number;
  isActive: boolean;
  minOrderValue: number;
  giftProductId: string | null;
  color?: string;
};

export function spinOfferPromoCode(offerId: string): string {
  return `SW${offerId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

export function isSpinLinkedPromo(promo: {
  promotionKind?: string | null;
  promotionRules?: unknown;
}): boolean {
  const rules = promo.promotionRules;
  if (rules && typeof rules === 'object' && 'spinOfferId' in rules) {
    return Boolean((rules as { spinOfferId?: unknown }).spinOfferId);
  }
  return (promo.promotionKind || '').toUpperCase() === SPIN_PROMO_SOURCE;
}

function mapSpinOfferToPromoFields(offer: SpinOfferRow, giftProduct?: { id: string; name: string; imageUrl: string | null } | null) {
  const isPrize = offer.offerType !== 'NO_PRIZE';
  let promotionKind = 'PERCENTAGE_DISCOUNT';
  let discountType = 'PERCENTAGE';
  let discountValue = offer.discountValue;

  if (offer.offerType === 'FIXED') {
    promotionKind = 'FIXED_DISCOUNT';
    discountType = 'FIXED';
  } else if (offer.offerType === 'FREE_DELIVERY') {
    promotionKind = 'FREE_DELIVERY';
    discountType = 'FIXED';
    discountValue = 0;
  } else if (offer.offerType === 'GIFT') {
    promotionKind = 'GIFT_ITEM';
    discountType = 'FIXED';
    discountValue = 0;
  } else if (offer.offerType === 'PERCENTAGE') {
    promotionKind = 'PERCENTAGE_DISCOUNT';
    discountType = 'PERCENTAGE';
  }

  return {
    code: spinOfferPromoCode(offer.id),
    title: offer.label,
    description: offer.description,
    promotionKind,
    promotionRules: {
      source: SPIN_PROMO_SOURCE,
      spinOfferId: offer.id,
      offerType: offer.offerType,
      giftProductId: offer.giftProductId,
      color: offer.color,
      ...(giftProduct
        ? {
            giftProductName: giftProduct.name,
            giftProduct: {
              id: giftProduct.id,
              name: giftProduct.name,
              imageUrl: giftProduct.imageUrl,
            },
          }
        : {}),
    },
    discountType,
    discountValue,
    minOrderValue: offer.minOrderValue,
    isActive: offer.isActive && isPrize,
    ownership: 'PLATFORM',
    branchSharePct: 0,
    platformSharePct: 100,
  };
}

async function findLinkedPromo(offerId: string) {
  const code = spinOfferPromoCode(offerId);
  const byCode = await prisma.promoCode.findUnique({ where: { code } });
  if (byCode) return byCode;
  try {
    return await prisma.promoCode.findFirst({
      where: {
        promotionRules: { path: ['spinOfferId'], equals: offerId },
      },
    });
  } catch {
    return null;
  }
}

function isUniqueCodeConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}

export async function syncSpinOfferToPromo(offer: SpinOfferRow): Promise<void> {
  let giftProduct: { id: string; name: string; imageUrl: string | null } | null = null;
  if (offer.offerType === 'GIFT' && offer.giftProductId) {
    giftProduct = await prisma.product.findUnique({
      where: { id: offer.giftProductId },
      select: { id: true, name: true, imageUrl: true },
    });
  }
  const fields = mapSpinOfferToPromoFields(offer, giftProduct);
  const existing = await findLinkedPromo(offer.id);

  if (!fields.isActive) {
    if (existing && !existing.deletedAt) {
      await prisma.promoCode.update({
        where: { id: existing.id },
        data: { isActive: false, deletedAt: new Date() },
      });
    }
    return;
  }

  // Prefer updating the spin-linked row when found by rules (may predate the derived code).
  if (existing && existing.code !== fields.code) {
    try {
      await prisma.promoCode.update({
        where: { id: existing.id },
        data: {
          ...fields,
          deletedAt: null,
        },
      });
      return;
    } catch (err) {
      if (!isUniqueCodeConflict(err)) throw err;
      // Fall through to upsert by the derived code when another row already owns it.
    }
  }

  // Upsert by unique `code` so concurrent eligibility/public-offers syncs don't race on create.
  await prisma.promoCode.upsert({
    where: { code: fields.code },
    create: {
      ...fields,
      usedCount: 0,
      sortOrder: 0,
    },
    update: {
      ...fields,
      deletedAt: null,
    },
  });
}

export async function deactivateSpinOfferPromo(offerId: string): Promise<void> {
  const existing = await findLinkedPromo(offerId);
  if (!existing || existing.deletedAt) return;
  await prisma.promoCode.update({
    where: { id: existing.id },
    data: { isActive: false, deletedAt: new Date() },
  });
}

export async function findPromoForSpinOffer(offerId: string) {
  const promo = await findLinkedPromo(offerId);
  if (!promo || promo.deletedAt) return null;
  return promo;
}

let syncAllInFlight: Promise<void> | null = null;

export async function syncAllSpinOffersToPromos(): Promise<void> {
  if (syncAllInFlight) return syncAllInFlight;

  syncAllInFlight = (async () => {
    const notDeleted = await notDeletedSpinOfferFilter();
    const offers = await prisma.spinWheelOffer.findMany({ where: { ...notDeleted } });
    for (const offer of offers) {
      await syncSpinOfferToPromo(offer);
    }
  })().finally(() => {
    syncAllInFlight = null;
  });

  return syncAllInFlight;
}
