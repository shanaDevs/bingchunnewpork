import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { uploadToSpaces } from '../lib/spaces';
import { AppError } from '../middleware/errorHandler';
import {
  validateSharedPromotionShares,
  validateSelectedBranchShareSplits,
  normalizeBranchShareSplits,
  parseBranchShareSplits,
  assertPromoRedemptionAllowed,
  isPromoAvailableAtStore,
} from '../lib/promotionUsage';
import { generateInternalPromoCode, promotionKindRequiresCode } from '../lib/promotionKinds';
import { assertCustomerPromoEligibility } from '../lib/referral';
import { compareAutoApplyOffers, evaluateEligiblePromo, isAutoApplyPromoKind, isWelcomeFirstOrderPromo } from '../lib/promotionAutoApply';
import { evaluatePromoAgainstCart, resolvePromoGiftDisplay } from '../lib/promotionCartEligibility';
import type { PromoCartLine } from '../lib/promotionUsage';
import { resolveBranchStoreId } from '../middleware/auth';
import { assertAllowedImageUpload } from '../middleware/upload';
import { isSpinLinkedPromo, syncAllSpinOffersToPromos } from '../lib/spinOfferPromo';
import { evaluateLoyaltyForStore, isLoyaltyPromoCode } from '../lib/loyaltyCampaign';
import {
  buildPromoDiscountReport,
  parsePromoReportRange,
} from '../lib/promotionDiscountReport';
import { promoAnalysisOrderPaymentWhere } from '../lib/orderPayment';

const PROMO_PREVIEW_META = {
  authoritative: false as const,
  notice: 'Display only; final discount is computed at checkout from cart lines.',
};

const promoCartItemSchema = z.object({
  productId: z.string(),
  productName: z.string().optional(),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  lineTotal: z.coerce.number().nonnegative().optional(),
  categoryName: z.string().optional(),
});

function normalizeCartItems(items: z.infer<typeof promoCartItemSchema>[] | undefined): PromoCartLine[] {
  if (!items?.length) return [];
  return items.map((item) => ({
    productId: item.productId,
    productName: item.productName ?? '',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal ?? item.quantity * item.unitPrice,
    categoryName: item.categoryName,
  }));
}

function isBranchAdminRequest(req: Request): boolean {
  return req.user?.type === 'admin' && req.user.role === 'STORE_MANAGER';
}

function promoOwnershipOf(promo: { ownership?: string | null }): string {
  return (promo.ownership || '').toUpperCase();
}

function assertBranchCanMutatePromo(promo: { ownership?: string | null }) {
  if (promoOwnershipOf(promo) !== 'BRANCH') {
    throw new AppError('Branch admins can only manage branch-owned promotions', 403);
  }
}

export async function uploadPromoImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);
    assertAllowedImageUpload(req.file);
    const imageUrl = await uploadToSpaces(req.file.buffer, req.file.originalname, req.file.mimetype);
    return success(res, { imageUrl });
  } catch (err) { next(err); }
}

function isFreeDeliveryPromo(promo: {
  code: string;
  discountType: string;
  promotionKind?: string | null;
}): boolean {
  const kind = (promo.promotionKind || '').toUpperCase();
  const type = (promo.discountType || '').toUpperCase();
  const code = (promo.code || '').toUpperCase();
  return (
    kind === 'FREE_DELIVERY' ||
    type === 'DELIVERY' ||
    type === 'FREE_DELIVERY' ||
    code === 'FREEDELIVERY' ||
    code.includes('FREEDELIVERY')
  );
}

export async function validatePromo(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z.object({
      code: z.string().min(1),
      orderTotal: z.coerce.number().nonnegative(),
      orderMode: z.enum(['DELIVERY', 'TAKEAWAY']).nullish(),
      storeId: z.string().optional(),
      channel: z.enum(['WEB', 'APP', 'POS', 'WHATSAPP', 'TELEGRAM']).optional(),
      cartItems: z.array(promoCartItemSchema).optional(),
    }).parse(req.body);
    const code = parsed.code.trim().toUpperCase();
    const orderTotal = Math.floor(parsed.orderTotal);
    const orderMode = parsed.orderMode ?? undefined;
    const storeId = parsed.storeId;
    const cartItems = normalizeCartItems(parsed.cartItems);

    if (isLoyaltyPromoCode(code)) {
      const userId = req.user?.type === 'user' ? req.user.sub : undefined;
      if (!userId) throw new AppError('Sign in to use loyalty offers', 401);
      if (!storeId) throw new AppError('Select a branch to apply loyalty offers', 400);
      const loyaltyEval = await evaluateLoyaltyForStore({
        storeId,
        subtotal: orderTotal,
        userId,
        channel: parsed.channel,
      });
      const offer = loyaltyEval.cartDiscount;
      if (!offer || offer.code !== code) {
        throw new AppError('This loyalty offer is not available for your order', 400);
      }
      return success(res, {
        valid: true,
        discount: offer.discount,
        freeDelivery: false,
        description: offer.description,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        promotionKind: offer.promotionKind,
        code: offer.code,
        autoApply: true,
        hideCode: true,
        giftLabel: offer.giftLabel ?? null,
        giftProduct: offer.giftProduct ?? null,
        ...PROMO_PREVIEW_META,
      });
    }

    const promo = await prisma.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.isActive) throw new AppError('Invalid promo code', 400);
    if ((promo as { deletedAt?: Date | null }).deletedAt) throw new AppError('Invalid promo code', 400);
    if (isSpinLinkedPromo(promo)) {
      throw new AppError('Spin the wheel to unlock this offer, then apply your SPIN reward at checkout', 400);
    }
    if (promo.expiresAt && promo.expiresAt < new Date()) throw new AppError('Promo code has expired', 400);
    if (promo.startsAt && promo.startsAt > new Date()) throw new AppError('Promo code is not active yet', 400);
    assertPromoRedemptionAllowed(promo);
    if (orderTotal < promo.minOrderValue) throw new AppError(`Minimum order LKR ${promo.minOrderValue} required`, 400);
    if (storeId && !isPromoAvailableAtStore((promo as { storeIds?: unknown }).storeIds, storeId)) {
      throw new AppError('This promo code is not available at the selected branch', 400);
    }

    const userId = req.user?.type === 'user' ? req.user.sub : undefined;
    await assertCustomerPromoEligibility({
      promo: {
        id: promo.id,
        code: promo.code,
        promotionKind: promo.promotionKind,
        usageLimits: (promo as { usageLimits?: unknown }).usageLimits,
      },
      userId,
    });

    const freeDelivery = isFreeDeliveryPromo(promo);
    if (freeDelivery && orderMode === 'TAKEAWAY') {
      throw new AppError('Free delivery applies to delivery orders only', 400);
    }

    const cartEval = evaluatePromoAgainstCart({
      promotionKind: promo.promotionKind,
      promotionRules: promo.promotionRules,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      orderTotal,
      cartItems,
      orderMode,
      code: promo.code,
    });
    if (!cartEval.eligible) {
      throw new AppError('This offer does not apply to your current order', 400);
    }

    const discount = cartEval.freeDelivery ? 0 : cartEval.discount;
    let gift = resolvePromoGiftDisplay(promo.promotionKind, promo.promotionRules);
    if (gift.giftProduct?.id && !gift.giftProduct.imageUrl) {
      const product = await prisma.product.findUnique({
        where: { id: gift.giftProduct.id },
        select: { id: true, name: true, basePrice: true, imageUrl: true, isAvailable: true },
      });
      if (product?.isAvailable) {
        gift = {
          giftLabel: `Free ${product.name}`,
          giftProduct: {
            id: product.id,
            name: product.name,
            basePrice: product.basePrice,
            imageUrl: product.imageUrl,
          },
        };
      }
    }

    return success(res, {
      valid: true,
      discount,
      freeDelivery: cartEval.freeDelivery,
      description: promo.description || promo.title || promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      promotionKind: promo.promotionKind,
      code: promo.code,
      autoApply: isAutoApplyPromoKind(promo.promotionKind) || isWelcomeFirstOrderPromo(promo),
      hideCode: isAutoApplyPromoKind(promo.promotionKind) || isWelcomeFirstOrderPromo(promo),
      giftLabel: gift.giftLabel,
      giftProduct: gift.giftProduct,
      ...PROMO_PREVIEW_META,
    });
  } catch (err) { next(err); }
}

export async function getEligiblePromos(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z.object({
      orderTotal: z.coerce.number().nonnegative(),
      orderMode: z.enum(['DELIVERY', 'TAKEAWAY']).nullish(),
      storeId: z.string().optional(),
      channel: z.enum(['WEB', 'APP', 'POS', 'WHATSAPP', 'TELEGRAM']).optional(),
      cartItems: z.array(promoCartItemSchema).optional(),
    }).parse(req.body);
    const orderTotal = Math.floor(parsed.orderTotal);
    const orderMode = parsed.orderMode ?? undefined;
    const storeId = parsed.storeId;
    const channel = parsed.channel;
    const cartItems = normalizeCartItems(parsed.cartItems);
    const userId = req.user?.type === 'user' ? req.user.sub : undefined;
    const now = new Date();

    const loyaltyEval = storeId
      ? await evaluateLoyaltyForStore({ storeId, subtotal: orderTotal, userId, channel, now })
      : null;

    const loyaltyOffer = loyaltyEval?.cartDiscount
      ? {
          code: loyaltyEval.cartDiscount.code,
          title: loyaltyEval.cartDiscount.label,
          description: loyaltyEval.cartDiscount.description,
          discount: loyaltyEval.cartDiscount.discount,
          freeDelivery: false,
          discountType: loyaltyEval.cartDiscount.discountType,
          discountValue: loyaltyEval.cartDiscount.discountValue,
          promotionKind: loyaltyEval.cartDiscount.promotionKind,
          autoApply: true,
          hideCode: true,
          label: loyaltyEval.cartDiscount.label,
          loyaltyOffer: true,
          giftLabel: loyaltyEval.cartDiscount.giftLabel ?? null,
          giftProduct: loyaltyEval.cartDiscount.giftProduct ?? null,
        }
      : null;

    const baseWhere = {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    };

    let promos: Awaited<ReturnType<typeof prisma.promoCode.findMany>>;
    try {
      promos = await prisma.promoCode.findMany({
        where: { deletedAt: null, ...baseWhere },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
    } catch {
      promos = await prisma.promoCode.findMany({
        where: baseWhere,
        orderBy: { createdAt: 'desc' },
      });
    }

    const eligible = [];
    for (const promo of promos) {
      if (isSpinLinkedPromo(promo)) continue;
      if (loyaltyOffer && isWelcomeFirstOrderPromo(promo)) continue;
      if (storeId && !isPromoAvailableAtStore((promo as { storeIds?: unknown }).storeIds, storeId)) {
        continue;
      }
      const evaluated = await evaluateEligiblePromo(
        {
          id: promo.id,
          code: promo.code,
          title: (promo as { title?: string | null }).title ?? null,
          description: promo.description,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          minOrderValue: promo.minOrderValue,
          promotionKind: (promo as { promotionKind?: string | null }).promotionKind ?? null,
          promotionRules: (promo as { promotionRules?: unknown }).promotionRules,
          usageLimits: (promo as { usageLimits?: unknown }).usageLimits,
          usedCount: promo.usedCount,
          maxUses: promo.maxUses,
          sortOrder: (promo as { sortOrder?: number }).sortOrder ?? 0,
          isActive: promo.isActive,
          startsAt: (promo as { startsAt?: Date | null }).startsAt ?? null,
          expiresAt: promo.expiresAt,
          deletedAt: (promo as { deletedAt?: Date | null }).deletedAt ?? null,
        },
        { orderTotal, orderMode, userId, cartItems },
      );
      if (evaluated) eligible.push(evaluated);
    }

    if (loyaltyOffer) {
      eligible.unshift(loyaltyOffer);
    }

    eligible.sort((a, b) =>
      compareAutoApplyOffers(
        { ...a, loyaltyOffer: (a as { loyaltyOffer?: boolean }).loyaltyOffer },
        { ...b, loyaltyOffer: (b as { loyaltyOffer?: boolean }).loyaltyOffer },
      ),
    );

    const autoApplyOffers = eligible.filter((o) => o.autoApply);

    const suggested = autoApplyOffers[0] ?? null;

    return success(res, {
      offers: eligible,
      autoApplyOffers,
      suggested,
      loyaltySpin: loyaltyEval?.spin ?? null,
    });
  } catch (err) { next(err); }
}

export async function getActivePromos(req: Request, res: Response, next: NextFunction) {
  try {
    await syncAllSpinOffersToPromos().catch(() => undefined);
    const { storeId } = z.object({ storeId: z.string().optional() }).parse(req.query);
    const now = new Date();
    const baseWhere = {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    };
    try {
      const promos = await prisma.promoCode.findMany({
        where: { deletedAt: null, ...baseWhere },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: {
          code: true,
          title: true,
          description: true,
          discountType: true,
          discountValue: true,
          minOrderValue: true,
          startsAt: true,
          expiresAt: true,
          promotionKind: true,
          promotionRules: true,
          cardDesign: true,
          storeIds: true,
          sortOrder: true,
          showOnHome: true,
        },
      });
      const filtered = storeId
        ? promos.filter((p) => isPromoAvailableAtStore((p as { storeIds?: unknown }).storeIds, storeId))
        : promos;
      return success(res, filtered);
    } catch {
      const promos = await prisma.promoCode.findMany({
        where: baseWhere,
        select: { code: true, description: true, discountType: true, discountValue: true, minOrderValue: true, expiresAt: true },
      });
      return success(res, promos);
    }
  } catch (err) { next(err); }
}

// Admin
const cardElementSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'image', 'badge', 'code']),
  content: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  fontSize: z.number().optional(),
  fontWeight: z.enum(['normal', 'semibold', 'bold']).optional(),
  color: z.string().optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  zIndex: z.number().int(),
  portrait: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }).optional(),
});

const singleCardDesignSchema = z.object({
  layoutPreset: z.enum(['text-left-image-right', 'text-right-image-left', 'text-on-image', 'background-image', 'custom']),
  backgroundColor: z.string(),
  backgroundImage: z.string().optional(),
  accentColor: z.string(),
  elements: z.array(cardElementSchema),
});

/** Accepts legacy single design or { dark, light } theme set */
const cardDesignSchema = z.union([
  z.object({ dark: singleCardDesignSchema, light: singleCardDesignSchema }),
  singleCardDesignSchema,
]).optional().nullable();

const usageLimitsSchema = z.object({
  maxTotal: z.number().int().positive().optional(),
  maxPerCustomer: z.number().int().positive().optional(),
  maxPerDay: z.number().int().positive().optional(),
  stock: z.number().int().min(0).optional(),
}).optional().nullable();

const promotionRulesSchema = z.record(z.string(), z.unknown()).optional().nullable();

const promoKindEnum = z.enum([
  'PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT', 'BOGO', 'BXGY', 'GIFT_ITEM', 'CATEGORY_OFF',
  'COMBO_OFFER', 'NEW_PRODUCT', 'FREE_DELIVERY', 'REDUCED_DELIVERY', 'DELIVERY_ZONE',
  'DELIVERY_DISTANCE', 'MIN_ORDER', 'SPEND_OVER', 'BULK_ORDER', 'HAPPY_HOUR', 'WEEKEND',
  'TIME_SLOT', 'EVERY_FRIDAY', 'BIRTHDAY', 'WELCOME', 'REFERRAL', 'WIN_BACK', 'LOYALTY_TIER',
  'WALLET_OFFER', 'BANK_OFFER', 'CARD_OFFER', 'SEASONAL', 'CUSTOM', 'UPLOAD_BANNER',
]);

const branchShareSplitsSchema = z.record(
  z.string().min(1),
  z.object({
    branchSharePct: z.number().int().min(0).max(100),
    platformSharePct: z.number().int().min(0).max(100),
  }),
).optional().nullable();

const promoSharedFields = {
  code: z.string().max(20).toUpperCase().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  promotionKind: promoKindEnum.optional(),
  promotionRules: promotionRulesSchema,
  usageLimits: usageLimitsSchema,
  startsAt: z.string().datetime().optional().nullable(),
  criteria: z.array(z.string()).optional(),
  ownership: z.enum(['BRANCH', 'SHARED', 'PLATFORM']).optional(),
  contributionSource: z.enum(['PLATFORM', 'JASON']).optional().nullable(),
  branchSharePct: z.number().int().min(0).max(100).optional().nullable(),
  platformSharePct: z.number().int().min(0).max(100).optional().nullable(),
  branchShareSplits: branchShareSplitsSchema,
  cardDesign: cardDesignSchema,
  sortOrder: z.number().int().min(0).optional(),
  storeIds: z.array(z.string().min(1)).optional().nullable(),
  showOnHome: z.boolean().optional(),
};

const promoExpiresAtRequired = z.string().datetime({ message: 'End date is required' });
const promoExpiresAtOptional = z.string().datetime().optional();

const promoBaseSchema = z.object({
  ...promoSharedFields,
  discountType: z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
  discountValue: z.number().int().positive(),
  minOrderValue: z.number().int().min(0).default(0),
  maxUses: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
  expiresAt: promoExpiresAtRequired,
});

function refinePromoCodeRequirement(
  data: { code?: string; promotionKind?: z.infer<typeof promoKindEnum> },
  ctx: z.RefinementCtx,
) {
  const code = (data.code ?? '').trim();
  if (code.length > 0 && code.length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Promo code must be at least 3 characters',
      path: ['code'],
    });
  }
  if (data.promotionKind && promotionKindRequiresCode(data.promotionKind) && code.length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Promo code is required for this offer type',
      path: ['code'],
    });
  }
}

export const promoSchema = promoBaseSchema.superRefine(refinePromoCodeRequirement);

/**
 * Partial updates must not use `.default()` fields — Zod still applies those defaults
 * when keys are omitted, which would overwrite existing promo values on toggle.
 * Zod v4 also forbids `.partial()` on refined object schemas.
 */
export const promoUpdateSchema = z.object({
  ...promoSharedFields,
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().int().positive().optional(),
  minOrderValue: z.number().int().min(0).optional(),
  maxUses: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  expiresAt: promoExpiresAtOptional,
}).superRefine((data, ctx) => {
  if (data.code === undefined && data.promotionKind === undefined) return;
  refinePromoCodeRequirement(data, ctx);
});

async function resolvePromoCodeInput(
  code: string | undefined,
  promotionKind: string | undefined,
  title: string | undefined,
): Promise<string> {
  const trimmed = (code ?? '').trim().toUpperCase();
  if (trimmed.length >= 3) return trimmed;
  if (promotionKind && !promotionKindRequiresCode(promotionKind)) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateInternalPromoCode(promotionKind, title);
      const existing = await prisma.promoCode.findUnique({ where: { code: candidate } });
      if (!existing || (existing as { deletedAt?: Date | null }).deletedAt) return candidate;
    }
    throw new AppError('Could not generate a unique offer reference', 500);
  }
  throw new AppError('Promo code is required for this offer type', 400);
}

function parseStoredStoreIds(raw: unknown): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const ids = raw.map((id) => String(id)).filter(Boolean);
    return ids.length ? ids : null;
  }
  return null;
}

function assertSharedPromotionShares(data: {
  ownership?: string | null;
  branchSharePct?: number | null;
  platformSharePct?: number | null;
  storeIds?: string[] | null;
  branchShareSplits?: unknown;
}) {
  const storeIds = data.storeIds && data.storeIds.length > 0 ? data.storeIds : null;
  if (data.ownership === 'SHARED') {
    const splitErr = validateSelectedBranchShareSplits(data.ownership, storeIds, data.branchShareSplits);
    if (splitErr) throw new AppError(splitErr, 400);
    // Selected branches rely on per-branch splits; all-branches also needs the default pair.
    if (!storeIds) {
      const err = validateSharedPromotionShares(data.ownership, data.branchSharePct, data.platformSharePct);
      if (err) throw new AppError(err, 400);
    }
    return;
  }
  const err = validateSharedPromotionShares(data.ownership, data.branchSharePct, data.platformSharePct);
  if (err) throw new AppError(err, 400);
}

function normalizeContributionSource(data: {
  ownership?: string | null;
  contributionSource?: string | null;
}): 'PLATFORM' | 'JASON' | null {
  if (data.ownership !== 'SHARED') return null;
  return data.contributionSource === 'PLATFORM' ? 'PLATFORM' : 'JASON';
}

function normalizeShareFields(data: {
  ownership?: string | null;
  branchSharePct?: number | null;
  platformSharePct?: number | null;
}) {
  if (data.ownership === 'BRANCH') {
    return { branchSharePct: 100, platformSharePct: 0 };
  }
  if (data.ownership === 'PLATFORM') {
    return { branchSharePct: 0, platformSharePct: 100 };
  }
  if (data.ownership === 'SHARED') {
    return {
      branchSharePct: data.branchSharePct ?? 50,
      platformSharePct: data.platformSharePct ?? 50,
    };
  }
  return { branchSharePct: null, platformSharePct: null };
}

function toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function normalizeStoreIds(storeIds: string[] | null | undefined): string[] | null {
  if (!storeIds || storeIds.length === 0) return null;
  return storeIds;
}

function parseJsonColumn(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

async function loadBranchShareSplitsById(ids: string[]): Promise<Map<string, unknown>> {
  const map = new Map<string, unknown>();
  if (ids.length === 0) return map;
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; branchShareSplits: unknown }>>`
      SELECT id, "branchShareSplits" AS "branchShareSplits" FROM "promo_codes" WHERE id IN (${Prisma.join(ids)})
    `;
    for (const row of rows) map.set(row.id, parseJsonColumn(row.branchShareSplits));
  } catch {
    try {
      const placeholders = ids.map(() => '?').join(',');
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string; branchShareSplits: unknown }>>(
        `SELECT id, \`branchShareSplits\` AS branchShareSplits FROM \`promo_codes\` WHERE id IN (${placeholders})`,
        ...ids,
      );
      for (const row of rows) map.set(row.id, parseJsonColumn(row.branchShareSplits));
    } catch {
      return map;
    }
  }
  return map;
}

type PromoSplitSource = {
  id: string;
  ownership?: string | null;
  storeIds?: unknown;
  branchShareSplits?: unknown;
};

function promoNeedsBranchShareSplitsReload(promo: PromoSplitSource): boolean {
  const ownership = (promo.ownership ?? '').toUpperCase();
  const storeIds = parseStoredStoreIds(promo.storeIds);
  if (ownership !== 'SHARED' || !storeIds?.length) return false;
  if (!('branchShareSplits' in promo)) return true;
  const parsed = parseBranchShareSplits(promo.branchShareSplits);
  return Object.keys(parsed).length === 0;
}

async function hydratePromoBranchShareSplits<T extends PromoSplitSource>(promo: T): Promise<T> {
  if (!promoNeedsBranchShareSplitsReload(promo)) return promo;
  const map = await loadBranchShareSplitsById([promo.id]);
  const sqlValue = map.get(promo.id);
  if (sqlValue == null) return promo;
  return { ...promo, branchShareSplits: sqlValue };
}

async function attachBranchShareSplits<T extends PromoSplitSource>(promos: T[]): Promise<T[]> {
  if (promos.length === 0) return promos;
  const toReload = promos.filter((p) => promoNeedsBranchShareSplitsReload(p as PromoSplitSource));
  if (toReload.length === 0) return promos;
  const map = await loadBranchShareSplitsById(toReload.map((p) => p.id));
  if (map.size === 0) return promos;
  return promos.map((p) => {
    if (!promoNeedsBranchShareSplitsReload(p as PromoSplitSource)) return p;
    const sqlValue = map.get(p.id);
    if (sqlValue == null) return p;
    return { ...p, branchShareSplits: sqlValue };
  });
}

/** Persist share columns via SQL when Prisma client predates the migration. */
async function applyPromoExtendedFields(
  id: string,
  fields: {
    ownership?: string | null;
    branchSharePct?: number | null;
    platformSharePct?: number | null;
    contributionSource?: string | null;
    title?: string | null;
    criteria?: unknown;
    cardDesign?: unknown;
    sortOrder?: number;
    promotionKind?: string | null;
    promotionRules?: unknown;
    usageLimits?: unknown;
    storeIds?: unknown;
    branchShareSplits?: unknown;
    showOnHome?: boolean | null;
  },
) {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.ownership !== undefined) {
    sets.push('`ownership` = ?');
    values.push(fields.ownership);
  }
  if (fields.branchSharePct !== undefined) {
    sets.push('`branchSharePct` = ?');
    values.push(fields.branchSharePct);
  }
  if (fields.platformSharePct !== undefined) {
    sets.push('`platformSharePct` = ?');
    values.push(fields.platformSharePct);
  }
  if (fields.contributionSource !== undefined) {
    sets.push('`contributionSource` = ?');
    values.push(fields.contributionSource);
  }
  if (fields.title !== undefined) {
    sets.push('`title` = ?');
    values.push(fields.title);
  }
  if (fields.criteria !== undefined) {
    sets.push('`criteria` = ?');
    values.push(fields.criteria ? JSON.stringify(fields.criteria) : null);
  }
  if (fields.cardDesign !== undefined) {
    sets.push('`cardDesign` = ?');
    values.push(fields.cardDesign ? JSON.stringify(fields.cardDesign) : null);
  }
  if (fields.sortOrder !== undefined) {
    sets.push('`sortOrder` = ?');
    values.push(fields.sortOrder);
  }
  if (fields.promotionKind !== undefined) {
    sets.push('`promotionKind` = ?');
    values.push(fields.promotionKind);
  }
  if (fields.promotionRules !== undefined) {
    sets.push('`promotionRules` = ?');
    values.push(fields.promotionRules ? JSON.stringify(fields.promotionRules) : null);
  }
  if (fields.usageLimits !== undefined) {
    sets.push('`usageLimits` = ?');
    values.push(fields.usageLimits ? JSON.stringify(fields.usageLimits) : null);
  }
  if (fields.storeIds !== undefined) {
    sets.push('`storeIds` = ?');
    values.push(fields.storeIds ? JSON.stringify(fields.storeIds) : null);
  }
  if (fields.branchShareSplits !== undefined) {
    sets.push('`branchShareSplits` = ?');
    values.push(fields.branchShareSplits ? JSON.stringify(fields.branchShareSplits) : null);
  }
  if (fields.showOnHome !== undefined) {
    sets.push('`showOnHome` = ?');
    values.push(fields.showOnHome);
  }

  if (sets.length === 0) return;
  values.push(id);
  await prisma.$executeRawUnsafe(
    `UPDATE \`promo_codes\` SET ${sets.join(', ')} WHERE \`id\` = ?`,
    ...values,
  );
}

export async function createPromo(req: Request, res: Response, next: NextFunction) {
  try {
    const data = promoSchema.parse(req.body);
    if (isBranchAdminRequest(req)) {
      data.ownership = 'BRANCH';
      data.branchSharePct = 100;
      data.platformSharePct = 0;
      data.branchShareSplits = null;
      data.contributionSource = null;
      const branchStoreId = await resolveBranchStoreId(req);
      const storeIds = data.storeIds;
      if (!storeIds || (Array.isArray(storeIds) && storeIds.length === 0)) {
        data.storeIds = [branchStoreId];
      }
    }
    assertSharedPromotionShares(data);
    const shares = normalizeShareFields(data);
    const contributionSource = normalizeContributionSource(data);
    const resolvedStoreIds = normalizeStoreIds(data.storeIds ?? undefined);
    const resolvedSplits = normalizeBranchShareSplits(data.ownership, resolvedStoreIds, data.branchShareSplits);
    const resolvedCode = await resolvePromoCodeInput(data.code, data.promotionKind, data.title);
    const existing = await prisma.promoCode.findUnique({ where: { code: resolvedCode } });
    if (existing && !(existing as { deletedAt?: Date | null }).deletedAt) throw new AppError('Promo code already exists', 409);

    const base = {
      code: resolvedCode,
      description: data.description,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderValue: data.minOrderValue,
      maxUses: data.usageLimits?.maxTotal ?? data.maxUses,
      isActive: data.isActive,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
    };

    let promo;
    try {
      promo = await prisma.promoCode.create({
        data: {
          ...base,
          title: data.title,
          promotionKind: data.promotionKind,
          promotionRules: toInputJson(data.promotionRules),
          usageLimits: toInputJson(data.usageLimits),
          criteria: toInputJson(data.criteria),
          ownership: data.ownership,
          contributionSource: contributionSource ?? undefined,
          branchSharePct: shares.branchSharePct ?? undefined,
          platformSharePct: shares.platformSharePct ?? undefined,
          cardDesign: toInputJson(data.cardDesign),
          sortOrder: data.sortOrder ?? 0,
          storeIds: toInputJson(resolvedStoreIds),
          branchShareSplits: toInputJson(resolvedSplits),
          showOnHome: data.showOnHome ?? true,
        },
      });
    } catch {
      promo = await prisma.promoCode.create({ data: base });
      await applyPromoExtendedFields(promo.id, {
        title: data.title ?? null,
        promotionKind: data.promotionKind ?? null,
        promotionRules: data.promotionRules ?? null,
        usageLimits: data.usageLimits ?? null,
        criteria: data.criteria ?? null,
        ownership: data.ownership ?? null,
        contributionSource,
        branchSharePct: shares.branchSharePct,
        platformSharePct: shares.platformSharePct,
        cardDesign: data.cardDesign ?? null,
        sortOrder: data.sortOrder ?? 0,
        storeIds: resolvedStoreIds,
        branchShareSplits: resolvedSplits,
        showOnHome: data.showOnHome ?? true,
      });
      promo = await prisma.promoCode.findUnique({ where: { id: promo.id } });
    }
    const [withSplits] = promo ? await attachBranchShareSplits([promo]) : [promo];
    return success(res, withSplits ?? promo, 201);
  } catch (err) { next(err); }
}

export async function updatePromo(req: Request, res: Response, next: NextFunction) {
  try {
    const data = promoUpdateSchema.parse(req.body);
    const promoId = req.params.id as string;
    const existingRaw = await prisma.promoCode.findUnique({ where: { id: promoId } });
    if (!existingRaw || (existingRaw as { deletedAt?: Date | null }).deletedAt) {
      throw new AppError('Promotion not found', 404);
    }
    const existing = await hydratePromoBranchShareSplits(existingRaw);
    if (isSpinLinkedPromo(existing)) {
      throw new AppError('Edit this offer in Spin Wheel settings', 400);
    }
    if (isBranchAdminRequest(req)) {
      assertBranchCanMutatePromo(existing);
      data.ownership = 'BRANCH';
      data.branchSharePct = 100;
      data.platformSharePct = 0;
      data.branchShareSplits = null;
      data.contributionSource = null;
    }
    if (
      data.ownership !== undefined
      || data.branchSharePct !== undefined
      || data.platformSharePct !== undefined
      || data.contributionSource !== undefined
      || data.storeIds !== undefined
      || data.branchShareSplits !== undefined
    ) {
      const existingStoreIds = parseStoredStoreIds((existing as { storeIds?: unknown }).storeIds);
      const merged = {
        ownership: data.ownership ?? existing?.ownership,
        branchSharePct: data.branchSharePct ?? (existing as { branchSharePct?: number | null })?.branchSharePct,
        platformSharePct: data.platformSharePct ?? (existing as { platformSharePct?: number | null })?.platformSharePct,
        contributionSource:
          data.contributionSource !== undefined
            ? data.contributionSource
            : (existing as { contributionSource?: string | null })?.contributionSource,
        storeIds: data.storeIds !== undefined ? normalizeStoreIds(data.storeIds ?? undefined) : existingStoreIds,
        branchShareSplits: data.branchShareSplits !== undefined
          ? data.branchShareSplits
          : (existing as { branchShareSplits?: unknown }).branchShareSplits,
      };
      assertSharedPromotionShares(merged);
      const shares = normalizeShareFields(merged);
      data.branchSharePct = shares.branchSharePct;
      data.platformSharePct = shares.platformSharePct;
      data.contributionSource = normalizeContributionSource(merged);
      data.branchShareSplits = normalizeBranchShareSplits(
        merged.ownership,
        merged.storeIds,
        merged.branchShareSplits,
      );
    }
    if (data.code !== undefined) {
      const resolvedCode = await resolvePromoCodeInput(
        data.code,
        data.promotionKind ?? existing?.promotionKind ?? undefined,
        data.title ?? existing?.title ?? undefined,
      );
      if (resolvedCode !== existing?.code) {
        const duplicate = await prisma.promoCode.findUnique({ where: { code: resolvedCode } });
        if (duplicate && duplicate.id !== promoId && !(duplicate as { deletedAt?: Date | null }).deletedAt) {
          throw new AppError('Promo code already exists', 409);
        }
      }
      data.code = resolvedCode;
    }
    const { showOnHome, ...rest } = data;
    const branchShareSplitsJson =
      data.branchShareSplits !== undefined ? toInputJson(data.branchShareSplits) : undefined;
    const payload = {
      ...rest,
      ...(showOnHome !== undefined ? { showOnHome } : {}),
      maxUses: data.usageLimits?.maxTotal ?? data.maxUses,
      startsAt: data.startsAt ? new Date(data.startsAt) : data.startsAt === null ? null : undefined,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : data.expiresAt === null ? null : undefined,
      promotionRules: data.promotionRules !== undefined ? toInputJson(data.promotionRules) : undefined,
      usageLimits: data.usageLimits !== undefined ? toInputJson(data.usageLimits) : undefined,
      criteria: data.criteria !== undefined ? toInputJson(data.criteria) : undefined,
      cardDesign: data.cardDesign !== undefined ? toInputJson(data.cardDesign) : undefined,
      storeIds: data.storeIds !== undefined ? toInputJson(normalizeStoreIds(data.storeIds ?? undefined)) : undefined,
      ...(branchShareSplitsJson !== undefined ? { branchShareSplits: branchShareSplitsJson } : {}),
    } as Prisma.PromoCodeUpdateInput;
    let promo;
    try {
      promo = await prisma.promoCode.update({ where: { id: promoId }, data: payload });
    } catch {
      const {
        title,
        criteria,
        ownership,
        cardDesign,
        sortOrder,
        promotionKind,
        promotionRules,
        usageLimits,
        branchSharePct,
        platformSharePct,
        storeIds,
        showOnHome: showOnHomeField,
        ...legacy
      } = payload;
      promo = await prisma.promoCode.update({ where: { id: promoId }, data: legacy });
      await applyPromoExtendedFields(promoId, {
        title: data.title ?? null,
        criteria: data.criteria ?? null,
        ownership: data.ownership ?? null,
        cardDesign: data.cardDesign ?? null,
        sortOrder: data.sortOrder ?? 0,
        promotionKind: data.promotionKind ?? null,
        promotionRules: data.promotionRules ?? null,
        usageLimits: data.usageLimits ?? null,
        branchSharePct: data.branchSharePct ?? null,
        platformSharePct: data.platformSharePct ?? null,
        contributionSource: data.contributionSource ?? null,
        storeIds: data.storeIds !== undefined ? normalizeStoreIds(data.storeIds ?? undefined) : undefined,
        branchShareSplits: data.branchShareSplits !== undefined ? data.branchShareSplits : undefined,
        showOnHome: showOnHome !== undefined ? showOnHome : undefined,
      });
      promo = await prisma.promoCode.findUnique({ where: { id: promoId } });
    }
    const [withSplits] = promo ? await attachBranchShareSplits([promo]) : [promo];
    return success(res, withSplits ?? promo);
  } catch (err) { next(err); }
}

async function listPromosOrdered() {
  type PromoListRow = Awaited<ReturnType<typeof prisma.promoCode.findMany>>[number];
  let promos: PromoListRow[];
  try {
    promos = await prisma.promoCode.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  } catch {
    try {
      promos = await prisma.promoCode.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
    } catch {
      promos = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    }
  }
  return attachBranchShareSplits(promos);
}

export async function deletePromo(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const promo = await prisma.promoCode.findUnique({ where: { id } });
    if (!promo || promo.deletedAt) throw new AppError('Promotion not found', 404);
    if (isSpinLinkedPromo(promo)) {
      throw new AppError('Remove this offer in Spin Wheel settings', 400);
    }
    if (isBranchAdminRequest(req)) assertBranchCanMutatePromo(promo);
    if (promo.isActive) {
      throw new AppError('Deactivate the promotion before deleting it', 400);
    }

    // Always soft-delete so offer history and usage records stay intact.
    await prisma.promoCode.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return success(res, { id, deleted: true, soft: true });
  } catch (err) { next(err); }
}

export async function bulkDeletePromos(req: Request, res: Response, next: NextFunction) {
  try {
    const { ids } = z.object({
      ids: z.array(z.string().min(1)).min(1).max(100),
    }).parse(req.body);

    const promos = await prisma.promoCode.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    if (promos.length === 0) throw new AppError('No promotions found to archive', 404);

    if (isBranchAdminRequest(req)) {
      for (const promo of promos) assertBranchCanMutatePromo(promo);
    }

    const active = promos.filter((p) => p.isActive);
    if (active.length > 0) {
      throw new AppError(
        `Deactivate ${active.length} selected promotion${active.length === 1 ? '' : 's'} before archiving`,
        400,
      );
    }

    const now = new Date();
    const result = await prisma.promoCode.updateMany({
      where: { id: { in: promos.map((p) => p.id) }, isActive: false, deletedAt: null },
      data: { deletedAt: now, isActive: false },
    });

    return success(res, { deleted: result.count, soft: true, ids: promos.map((p) => p.id) });
  } catch (err) { next(err); }
}

export async function bulkSetPromoActive(req: Request, res: Response, next: NextFunction) {
  try {
    const { ids, isActive } = z.object({
      ids: z.array(z.string().min(1)).min(1).max(100),
      isActive: z.boolean(),
    }).parse(req.body);

    const promos = await prisma.promoCode.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, isActive: true, ownership: true },
    });

    if (promos.length === 0) throw new AppError('No promotions found', 404);

    if (isBranchAdminRequest(req)) {
      for (const promo of promos) assertBranchCanMutatePromo(promo);
    }

    const targetIds = promos
      .filter((p) => p.isActive !== isActive)
      .map((p) => p.id);

    if (targetIds.length === 0) {
      return success(res, {
        updated: 0,
        isActive,
        ids: [],
        message: isActive ? 'Selected promotions are already active' : 'Selected promotions are already inactive',
      });
    }

    const result = await prisma.promoCode.updateMany({
      where: { id: { in: targetIds }, deletedAt: null },
      data: { isActive },
    });

    return success(res, { updated: result.count, isActive, ids: targetIds });
  } catch (err) { next(err); }
}

export async function getAllPromos(req: Request, res: Response, next: NextFunction) {
  try {
    await syncAllSpinOffersToPromos().catch(() => undefined);
    let promos = await listPromosOrdered();
    if (isBranchAdminRequest(req)) {
      promos = promos.filter((p) => promoOwnershipOf(p) === 'BRANCH');
    }
    return success(res, promos);
  } catch (err) { next(err); }
}

export async function reorderPromos(req: Request, res: Response, next: NextFunction) {
  try {
    const { order } = z.object({
      order: z.array(z.object({ id: z.string(), sortOrder: z.number().int().min(0) })),
    }).parse(req.body);

    if (isBranchAdminRequest(req) && order.length > 0) {
      const promos = await prisma.promoCode.findMany({
        where: { id: { in: order.map((o) => o.id) }, deletedAt: null },
        select: { id: true, ownership: true },
      });
      for (const promo of promos) assertBranchCanMutatePromo(promo);
    }

    try {
      await prisma.$transaction(
        order.map(({ id, sortOrder }) =>
          prisma.promoCode.update({ where: { id }, data: { sortOrder } }),
        ),
      );
    } catch {
      throw new AppError('Promotion reorder requires database migration. Run: npm run db:push', 501);
    }
    let promos = await listPromosOrdered();
    if (isBranchAdminRequest(req)) {
      promos = promos.filter((p) => promoOwnershipOf(p) === 'BRANCH');
    }
    return success(res, promos);
  } catch (err) { next(err); }
}

export async function getPromotionUsages(req: Request, res: Response, next: NextFunction) {
  try {
    const { promoCode, storeId, limit } = z.object({
      promoCode: z.string().optional(),
      storeId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const where: Record<string, unknown> = {};
    if (promoCode) where.promoCode = promoCode.toUpperCase();
    if (isBranchAdminRequest(req)) {
      const branchStoreId = await resolveBranchStoreId(req);
      if (branchStoreId) where.storeId = branchStoreId;
    } else if (storeId) {
      where.storeId = storeId;
    }

    try {
      const usages = await (prisma as any).promotionUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          order: { select: { orderNumber: true, total: true, status: true } },
          store: { select: { name: true } },
        },
      });
      return success(res, usages);
    } catch {
      throw new AppError('Promotion usage tracking requires migration. Run: npm run migrate:promotion-shared', 501);
    }
  } catch (err) { next(err); }
}

export async function getPromoDiscountReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, storeId } = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      storeId: z.string().optional(),
    }).parse(req.query);

    const { fromDate, toDate } = parsePromoReportRange(from, to);

    let scopedStoreId = storeId;
    if (isBranchAdminRequest(req)) {
      const branchStoreId = await resolveBranchStoreId(req);
      if (branchStoreId) scopedStoreId = branchStoreId;
    }

    try {
      const orderWhere = {
        ...promoAnalysisOrderPaymentWhere(),
        status: { not: 'CANCELLED' as const },
        createdAt: { gte: fromDate, lte: toDate },
        ...(scopedStoreId ? { storeId: scopedStoreId } : {}),
      };

      const [usages, salesGroups] = await Promise.all([
        prisma.promotionUsage.findMany({
          where: {
            ...(scopedStoreId ? { storeId: scopedStoreId } : {}),
            order: {
              ...promoAnalysisOrderPaymentWhere(),
              status: { not: 'CANCELLED' },
              createdAt: { gte: fromDate, lte: toDate },
            },
          },
          select: {
            storeId: true,
            promoCode: true,
            promoCodeId: true,
            ownership: true,
            totalDiscountAmount: true,
            branchShareAmount: true,
            platformShareAmount: true,
            orderSubtotal: true,
            store: { select: { name: true } },
            promo: { select: { title: true } },
          },
        }),
        prisma.order.groupBy({
          by: ['storeId'],
          where: orderWhere,
          _sum: { subtotal: true },
          _count: { _all: true },
        }),
      ]);

      const storeIds = Array.from(
        new Set([
          ...salesGroups.map((row) => row.storeId),
          ...usages.map((row) => row.storeId),
        ]),
      );
      const stores = storeIds.length
        ? await prisma.store.findMany({
            where: { id: { in: storeIds } },
            select: { id: true, name: true },
          })
        : [];
      const storeNameById = new Map(stores.map((store) => [store.id, store.name]));

      const report = buildPromoDiscountReport(
        usages.map((row) => ({
          storeId: row.storeId,
          storeName: row.store?.name ?? storeNameById.get(row.storeId) ?? 'Unknown branch',
          promoCode: row.promoCode,
          promoCodeId: row.promoCodeId,
          promoTitle: row.promo?.title ?? null,
          ownership: row.ownership,
          totalDiscountAmount: row.totalDiscountAmount,
          branchShareAmount: row.branchShareAmount,
          platformShareAmount: row.platformShareAmount,
          orderSubtotal: row.orderSubtotal,
        })),
        from,
        to,
        salesGroups.map((row) => ({
          storeId: row.storeId,
          storeName: storeNameById.get(row.storeId) ?? 'Unknown branch',
          orderCount: row._count._all,
          grossSales: row._sum.subtotal ?? 0,
        })),
      );
      return success(res, report);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('Promotion usage tracking requires migration. Run: npm run migrate:promotion-shared', 501);
    }
  } catch (err) { next(err); }
}
