import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { syncAllSpinOffersToPromos, syncSpinOfferToPromo, deactivateSpinOfferPromo } from '../lib/spinOfferPromo';
import { getSpinSettings, ensureAppSchema } from '../lib/appSchema';
import { evaluateSpinAudienceRules } from '../lib/spinEligibilityRules';
import { ensureSpinWheelSchema, isSpinOfferDeleted, markSpinOfferDeleted, notDeletedSpinOfferFilter } from '../lib/spinSchema';
import {
  countActiveSpinOffersForStore,
  pruneDuplicateSpinOffers,
  resolveActiveSpinOffersForStore,
  resolveSpinOffersForStore,
  withSpinStoreIdFallback,
} from '../lib/spinOffers';
import { resolveBranchStoreId, isBranchScopedRole } from '../middleware/auth';
import { resolveAvailableProductId } from '../lib/resolveProductFk';

const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function clientIpFromReq(req: Request): string | null {
  const xf = req.headers['x-forwarded-for'];
  const raw = typeof xf === 'string' ? xf : Array.isArray(xf) ? xf[0] : '';
  const forwarded = raw.split(',')[0]?.trim() ?? '';
  const real = typeof req.headers['x-real-ip'] === 'string' ? req.headers['x-real-ip'].trim() : '';
  const fallback = req.ip || req.socket?.remoteAddress || '';
  const cleaned = (forwarded || real || fallback).replace(/^::ffff:/, '').trim();
  return cleaned ? cleaned.slice(0, 64) : null;
}

async function loadSpinUsage(opts: {
  userId?: string;
  guestKey?: string;
  clientIp?: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const db = opts.tx ?? prisma;
  await ensureAppSchema();
  const settings = await getSpinSettings();
  const windowMs = settings.spinWindowHours * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs);
  const clauses: string[] = [];
  const params: unknown[] = [since];
  let i = 1;

  // Identity must NOT OR with every client's IP. That made office/NAT users look
  // "already spun" when anyone on the same public IP had used the wheel.
  if (opts.userId) {
    i += 1;
    clauses.push(`"userId" = $${i}`);
    params.push(opts.userId);
    // Include unattached guest spins from this browser after login.
    if (opts.guestKey) {
      i += 1;
      clauses.push(`("guestKey" = $${i} AND "userId" IS NULL)`);
      params.push(opts.guestKey);
    }
  } else if (opts.guestKey) {
    i += 1;
    clauses.push(`"guestKey" = $${i}`);
    params.push(opts.guestKey);
    if (settings.spinTrackByIp && opts.clientIp) {
      i += 1;
      clauses.push(`("clientIp" = $${i} AND "userId" IS NULL)`);
      params.push(opts.clientIp);
    }
  } else if (settings.spinTrackByIp && opts.clientIp) {
    i += 1;
    clauses.push(`"clientIp" = $${i}`);
    params.push(opts.clientIp);
  }

  let used = 0;
  let oldestAt: Date | null = null;
  if (clauses.length > 0) {
    const rows = await db.$queryRawUnsafe<Array<{ createdAt: Date }>>(
      `SELECT "createdAt" FROM "spin_results"
       WHERE "createdAt" >= $1 AND (${clauses.join(' OR ')})
       ORDER BY "createdAt" ASC`,
      ...params,
    );
    used = rows.length;
    oldestAt = rows[0]?.createdAt ?? null;
  }

  const allowed = settings.spinsPerWindow;
  const remaining = Math.max(0, allowed - used);
  const canSpin = remaining > 0;
  const nextSpinAt =
    !canSpin && oldestAt ? new Date(new Date(oldestAt).getTime() + windowMs) : null;

  return { settings, used, allowed, remaining, canSpin, nextSpinAt, windowMs };
}

async function resolveSpinEligibility(opts: {
  userId?: string;
  guestKey?: string;
  clientIp?: string | null;
  activeOfferCount: number;
  storeId?: string;
}) {
  const usage = await loadSpinUsage({
    userId: opts.userId,
    guestKey: opts.guestKey,
    clientIp: opts.clientIp,
  });
  const audience = await evaluateSpinAudienceRules({
    settings: usage.settings,
    userId: opts.userId,
    guestKey: opts.guestKey,
    storeId: opts.storeId,
  });

  const hasOffers = opts.activeOfferCount >= 2;
  const enabled = hasOffers && usage.settings.spinEnabled;
  const windowBlocked = !usage.canSpin;
  const canSpin = enabled && audience.canSpin && !windowBlocked;

  let reason = audience.reason;
  let nextSpinAt = audience.nextSpinAt ?? usage.nextSpinAt;
  if (!hasOffers) {
    reason = 'Spin wheel is not configured yet';
  } else if (!usage.settings.spinEnabled) {
    reason = 'Spin wheel is currently unavailable';
  } else if (windowBlocked && !reason) {
    reason = usage.nextSpinAt
      ? `You can spin again after ${usage.nextSpinAt.toLocaleString()}`
      : 'You have used all spins in this window';
    nextSpinAt = usage.nextSpinAt;
  }

  return {
    enabled,
    canSpin,
    reason,
    usage,
    nextSpinAt: nextSpinAt?.toISOString() ?? null,
    loyaltySpin: audience.loyaltySpin ?? null,
  };
}

const giftProductInclude = {
  giftProduct: { select: { id: true, name: true, basePrice: true, imageUrl: true, slug: true } },
} as const;

const offerSchema = z.object({
  label: z.string().min(1).max(40),
  description: z.string().max(200).optional().nullable(),
  offerType: z.enum(['PERCENTAGE', 'FIXED', 'FREE_DELIVERY', 'GIFT', 'NO_PRIZE']).default('PERCENTAGE'),
  discountValue: z.number().int().min(0).default(0),
  winRate: z.number().min(0).max(1000),
  color: z.string().min(3).max(20).default('#307ef2'),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  minOrderValue: z.number().int().min(0).default(0),
  giftProductId: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().min(1).max(128).nullable().optional(),
  ),
});

/** Partial updates must not apply create-time defaults (e.g. offerType → PERCENTAGE). */
const offerUpdateSchema = z.object({
  label: z.string().min(1).max(40).optional(),
  description: z.string().max(200).optional().nullable(),
  offerType: z.enum(['PERCENTAGE', 'FIXED', 'FREE_DELIVERY', 'GIFT', 'NO_PRIZE']).optional(),
  discountValue: z.number().int().min(0).optional(),
  winRate: z.number().min(0).max(1000).optional(),
  color: z.string().min(3).max(20).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  minOrderValue: z.number().int().min(0).optional(),
  giftProductId: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().min(1).max(128).nullable().optional(),
  ),
});

function makeClaimCode() {
  return `SPIN-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function pickWeighted<T extends { id: string; winRate: number }>(offers: T[]): T {
  const total = offers.reduce((s, o) => s + Math.max(0, o.winRate), 0);
  if (total <= 0) return offers[Math.floor(Math.random() * offers.length)];
  let r = Math.random() * total;
  for (const offer of offers) {
    r -= Math.max(0, offer.winRate);
    if (r <= 0) return offer;
  }
  return offers[offers.length - 1];
}

type GiftProductBrief = {
  id: string;
  name: string;
  basePrice: number;
  imageUrl: string | null;
  slug: string;
} | null;

function publicOffer(o: {
  id: string;
  label: string;
  description: string | null;
  offerType: string;
  discountValue: number;
  color: string;
  sortOrder: number;
  minOrderValue: number;
  giftProductId?: string | null;
  giftProduct?: GiftProductBrief;
}) {
  return {
    id: o.id,
    label: o.label,
    description: o.description,
    offerType: o.offerType,
    discountValue: o.discountValue,
    color: o.color,
    sortOrder: o.sortOrder,
    minOrderValue: o.minOrderValue,
    giftProductId: o.giftProductId ?? null,
    giftProduct: o.giftProduct ?? null,
  };
}

function giftLabelFromOffer(offer: {
  label: string;
  description: string | null;
  giftProduct?: { name: string } | null;
}) {
  if (offer.giftProduct?.name) return `Free ${offer.giftProduct.name}`;
  return offer.description || offer.label;
}

async function assertGiftProduct(offerType: string, giftProductId?: string | null): Promise<string | null> {
  if (offerType !== 'GIFT') return null;
  if (!giftProductId) throw new AppError('Select a gift product for gift offers', 400);
  return resolveAvailableProductId(giftProductId);
}

const DEFAULT_SPIN_OFFERS = [
  { label: '10% OFF', offerType: 'PERCENTAGE' as const, discountValue: 10, winRate: 25, color: '#307ef2', sortOrder: 0 },
  { label: 'LKR 100 OFF', offerType: 'FIXED' as const, discountValue: 100, winRate: 20, color: '#22c55e', sortOrder: 1, minOrderValue: 500 },
  { label: 'Free Delivery', offerType: 'FREE_DELIVERY' as const, discountValue: 0, winRate: 20, color: '#f59e0b', sortOrder: 2 },
  { label: '15% OFF', offerType: 'PERCENTAGE' as const, discountValue: 15, winRate: 10, color: '#a855f7', sortOrder: 3 },
  { label: 'Try Again', offerType: 'NO_PRIZE' as const, discountValue: 0, winRate: 25, color: '#64748b', sortOrder: 4 },
];

let ensureDefaultsInFlight: Promise<void> | null = null;

async function ensureDefaultSpinOffers() {
  if (ensureDefaultsInFlight) return ensureDefaultsInFlight;

  ensureDefaultsInFlight = (async () => {
    await ensureSpinWheelSchema();
    await pruneDuplicateSpinOffers(null);
    const notDeleted = await notDeletedSpinOfferFilter();
    const count = await withSpinStoreIdFallback(
      () => prisma.spinWheelOffer.count({ where: { storeId: null, ...notDeleted } }),
      () => prisma.spinWheelOffer.count({ where: notDeleted }),
    );
    if (count > 0) return;
    const rows = DEFAULT_SPIN_OFFERS.map((o) => ({
      label: o.label,
      offerType: o.offerType,
      discountValue: o.discountValue,
      winRate: o.winRate,
      color: o.color,
      sortOrder: o.sortOrder,
      minOrderValue: 'minOrderValue' in o ? o.minOrderValue ?? 0 : 0,
      isActive: true,
    }));
    await withSpinStoreIdFallback(
      () => prisma.spinWheelOffer.createMany({ data: rows.map((row) => ({ ...row, storeId: null })) }),
      () => prisma.spinWheelOffer.createMany({ data: rows }),
    );
    await syncAllSpinOffersToPromos();
  })().finally(() => {
    ensureDefaultsInFlight = null;
  });

  return ensureDefaultsInFlight;
}

async function resolveAdminSpinStoreId(req: Request): Promise<string | null> {
  if (req.user?.role === 'SYSTEM_ADMIN') {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
    return storeId ?? null;
  }
  if (isBranchScopedRole(req.user?.role)) {
    return resolveBranchStoreId(req);
  }
  return null;
}

async function assertCanMutateSpinOffer(req: Request, offer: { storeId?: string | null }) {
  if (req.user?.role === 'SYSTEM_ADMIN') return;
  if (isBranchScopedRole(req.user?.role)) {
    const branchStoreId = await resolveBranchStoreId(req);
    if (offer.storeId !== branchStoreId) {
      throw new AppError('You can only manage spin prizes for your branch', 403);
    }
    return;
  }
  throw new AppError('Forbidden', 403);
}

export async function getPublicOffers(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDefaultSpinOffers();
    // ensureDefaultSpinOffers syncs only when seeding; always keep promos aligned for existing offers.
    await syncAllSpinOffersToPromos().catch(() => undefined);
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
    const offers = await resolveActiveSpinOffersForStore(storeId);
    const settings = await getSpinSettings();
    return success(res, {
      enabled: offers.length >= 2 && settings.spinEnabled,
      offers: offers.map(publicOffer),
    });
  } catch (err) {
    next(err);
  }
}

export async function getSpinEligibility(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDefaultSpinOffers();
    const guestKey = typeof req.query.guestKey === 'string' ? req.query.guestKey : undefined;
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
    const userId = req.user?.type === 'user' ? req.user.sub : undefined;
    const clientIp = clientIpFromReq(req);

    const activeOfferCount = await countActiveSpinOffersForStore(storeId);
    const eligibility = await resolveSpinEligibility({
      userId,
      guestKey,
      clientIp,
      activeOfferCount,
      storeId,
    });

    return success(res, {
      enabled: eligibility.enabled,
      canSpin: eligibility.canSpin,
      reason: eligibility.reason,
      spinsUsed: eligibility.usage.used,
      spinsAllowed: eligibility.usage.allowed,
      spinsRemaining: eligibility.canSpin ? eligibility.usage.remaining : 0,
      spinDurationSeconds: eligibility.usage.settings.spinDurationSeconds,
      spinWindowHours: eligibility.usage.settings.spinWindowHours,
      nextSpinAt: eligibility.nextSpinAt,
      loyaltySpin: eligibility.loyaltySpin,
      display: eligibility.usage.settings.display,
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const guestKey = typeof req.query.guestKey === 'string' ? req.query.guestKey : undefined;
    const userId = req.user?.type === 'user' ? req.user.sub : undefined;
    if (!userId && !guestKey) return success(res, null);

    const claim = await prisma.spinResult.findFirst({
      where: {
        status: 'CLAIMED',
        expiresAt: { gt: new Date() },
        ...(userId ? { userId } : { guestKey: guestKey! }),
      },
      include: { offer: { include: giftProductInclude } },
      orderBy: { createdAt: 'desc' },
    });

    if (!claim || claim.offer.offerType === 'NO_PRIZE') return success(res, null);

    return success(res, {
      resultId: claim.id,
      claimCode: claim.claimCode,
      expiresAt: claim.expiresAt,
      offer: publicOffer(claim.offer),
    });
  } catch (err) {
    next(err);
  }
}

export async function playSpin(req: Request, res: Response, next: NextFunction) {
  try {
    const { guestKey, finalizePractice, storeId } = z
      .object({
        guestKey: z.string().min(8).max(64).optional(),
        /** After the client-side practice spin, guarantee a real prize on the daily spin. */
        finalizePractice: z.boolean().optional(),
        /** Branch ids are slug-style (e.g. store-bing-chun---kandy-city), not UUIDs. */
        storeId: z.string().min(1).max(128).optional(),
      })
      .parse(req.body ?? {});

    const userId = req.user?.type === 'user' ? req.user.sub : undefined;
    if (!userId && !guestKey) throw new AppError('Guest key required to spin', 400);

    const clientIp = clientIpFromReq(req);
    const activeOfferCount = await countActiveSpinOffersForStore(storeId);
    const eligibility = await resolveSpinEligibility({
      userId,
      guestKey,
      clientIp,
      activeOfferCount,
      storeId,
    });
    if (!eligibility.canSpin) {
      throw new AppError(
        eligibility.reason ?? 'You cannot spin right now',
        429,
      );
    }
    const usage = eligibility.usage;

    const activeClaim = await prisma.spinResult.findFirst({
      where: {
        status: 'CLAIMED',
        expiresAt: { gt: new Date() },
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(guestKey ? [{ guestKey }] : []),
        ],
      },
      include: { offer: { include: giftProductInclude } },
    });

    if (activeClaim && activeClaim.offer.offerType !== 'NO_PRIZE') {
      return success(res, {
        alreadyClaimed: true,
        resultId: activeClaim.id,
        claimCode: activeClaim.claimCode,
        expiresAt: activeClaim.expiresAt,
        offer: publicOffer(activeClaim.offer),
        offerIndex: -1,
      });
    }

    const offers = await resolveActiveSpinOffersForStore(storeId);
    const offersWithGifts = await prisma.spinWheelOffer.findMany({
      where: { id: { in: offers.map((o) => o.id) } },
      include: giftProductInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (offersWithGifts.length < 2) throw new AppError('Spin wheel is not configured yet', 400);

    const prizeOffers = offersWithGifts.filter((o) => o.offerType !== 'NO_PRIZE');

    let won: (typeof offersWithGifts)[number];
    let isPrize: boolean;

    // Results follow the admin spin win-rate weights (/admin/spin). finalizePractice (after a
    // client practice spin) still guarantees a real prize, weighted among prize segments only.
    if (finalizePractice && prizeOffers.length > 0) {
      won = pickWeighted(prizeOffers);
      isPrize = true;
    } else {
      won = pickWeighted(offersWithGifts);
      isPrize = won.offerType !== 'NO_PRIZE';
    }

    const offerIndex = offersWithGifts.findIndex((o) => o.id === won.id);
    const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);
    const spinLockKey = userId ? `spin:${userId}` : `spin:g:${guestKey}`;

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${spinLockKey}))`;
      const usageInTx = await loadSpinUsage({
        userId,
        guestKey,
        clientIp,
        tx,
      });
      if (!usageInTx.canSpin) {
        throw new AppError(
          eligibility.reason ?? 'You cannot spin right now',
          429,
        );
      }

      const created = await tx.spinResult.create({
        data: {
          userId,
          guestKey,
          offerId: won.id,
          claimCode: makeClaimCode(),
          status: isPrize ? 'CLAIMED' : 'NO_PRIZE',
          expiresAt,
        },
        include: { offer: { include: giftProductInclude } },
      });
      if (clientIp) {
        await tx.$executeRawUnsafe(
          `UPDATE "spin_results" SET "clientIp" = $1 WHERE "id" = $2`,
          clientIp,
          created.id,
        ).catch(() => undefined);
      }
      return created;
    });

    return success(res, {
      alreadyClaimed: false,
      resultId: result.id,
      claimCode: isPrize ? result.claimCode : null,
      expiresAt: isPrize ? result.expiresAt : null,
      offer: publicOffer(result.offer),
      offerIndex,
      isPrize,
    });
  } catch (err) {
    next(err);
  }
}

export async function validateSpinClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z
      .object({
        claimCode: z.string().min(4),
        orderTotal: z.coerce.number().nonnegative(),
        // cart store may send null before mode is chosen — treat as unset
        orderMode: z.enum(['DELIVERY', 'TAKEAWAY']).nullish(),
      })
      .parse(req.body);
    const claimCode = parsed.claimCode.trim().toUpperCase();
    const orderTotal = Math.floor(parsed.orderTotal);
    const orderMode = parsed.orderMode ?? undefined;

    const claim = await prisma.spinResult.findUnique({
      where: { claimCode },
      include: { offer: { include: giftProductInclude } },
    });
    if (!claim || claim.status !== 'CLAIMED') throw new AppError('Invalid or already used spin reward', 400);
    if (claim.expiresAt < new Date()) throw new AppError('Spin reward has expired', 400);
    if (claim.offer.offerType === 'NO_PRIZE') throw new AppError('No prize to apply', 400);
    if (orderTotal < claim.offer.minOrderValue) {
      throw new AppError(`Minimum order LKR ${claim.offer.minOrderValue} required`, 400);
    }

    let discount = 0;
    let freeDelivery = false;
    let giftLabel: string | null = null;
    let giftProduct: GiftProductBrief = null;

    if (claim.offer.offerType === 'PERCENTAGE') {
      discount = Math.min(orderTotal, Math.floor((orderTotal * claim.offer.discountValue) / 100));
    } else if (claim.offer.offerType === 'FIXED') {
      discount = Math.min(orderTotal, claim.offer.discountValue);
    } else if (claim.offer.offerType === 'FREE_DELIVERY') {
      if (orderMode === 'TAKEAWAY') throw new AppError('Free delivery applies to delivery orders only', 400);
      freeDelivery = true;
    } else if (claim.offer.offerType === 'GIFT') {
      giftLabel = giftLabelFromOffer(claim.offer);
      giftProduct = claim.offer.giftProduct ?? null;
    }

    return success(res, {
      valid: true,
      claimCode: claim.claimCode,
      discount,
      freeDelivery,
      giftLabel,
      giftProduct,
      offer: publicOffer(claim.offer),
      expiresAt: claim.expiresAt,
    });
  } catch (err) {
    next(err);
  }
}

/** Admin */
export async function getAllOffers(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureSpinWheelSchema();
    const storeId = await resolveAdminSpinStoreId(req);
    const notDeleted = await notDeletedSpinOfferFilter();
    const offers = await withSpinStoreIdFallback(
      () =>
        prisma.spinWheelOffer.findMany({
          where: {
            ...notDeleted,
            storeId: storeId ?? null,
          },
          include: giftProductInclude,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
      () =>
        prisma.spinWheelOffer.findMany({
          where: notDeleted,
          include: giftProductInclude,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
    );
    const totalWeight = offers.filter((o) => o.isActive).reduce((s, o) => s + o.winRate, 0);
    return success(res, { offers, totalWeight, storeId });
  } catch (err) {
    next(err);
  }
}

export async function createOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = offerSchema.parse(req.body);
    const data = { ...parsed };
    let storeId: string | null = null;
    if (req.user?.role === 'SYSTEM_ADMIN') {
      storeId = typeof req.body?.storeId === 'string' ? req.body.storeId : null;
    } else if (isBranchScopedRole(req.user?.role)) {
      storeId = await resolveBranchStoreId(req);
    }
    if (data.offerType === 'PERCENTAGE' && (data.discountValue <= 0 || data.discountValue > 100)) {
      throw new AppError('Percentage discount must be 1–100', 400);
    }
    if (data.offerType === 'FIXED' && data.discountValue <= 0) {
      throw new AppError('Fixed discount must be greater than 0', 400);
    }
    if (data.offerType === 'FREE_DELIVERY' || data.offerType === 'NO_PRIZE') {
      data.discountValue = 0;
      data.giftProductId = null;
    }
    if (data.offerType === 'GIFT') {
      data.discountValue = 0;
      data.giftProductId = await assertGiftProduct(data.offerType, data.giftProductId);
    } else {
      data.giftProductId = null;
    }
    const offer = await withSpinStoreIdFallback(
      () => prisma.spinWheelOffer.create({ data: { ...data, storeId }, include: giftProductInclude }),
      () => prisma.spinWheelOffer.create({ data, include: giftProductInclude }),
    );
    await syncSpinOfferToPromo(offer);
    return success(res, offer, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateOffer(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureSpinWheelSchema();
    const offerId = req.params.id as string;
    const existing = await prisma.spinWheelOffer.findUnique({ where: { id: offerId } });
    if (!existing || (await isSpinOfferDeleted(offerId))) throw new AppError('Offer not found', 404);
    await assertCanMutateSpinOffer(req, existing);

    const data = offerUpdateSchema.parse(req.body);
    if (data.offerType === 'GIFT' || data.giftProductId) {
      const offerType = data.offerType ?? existing.offerType ?? 'GIFT';
      const giftProductId =
        data.giftProductId !== undefined ? data.giftProductId : existing.giftProductId;
      if (offerType === 'GIFT') {
        data.giftProductId = await assertGiftProduct(offerType, giftProductId);
      } else if (data.giftProductId) {
        data.giftProductId = await resolveAvailableProductId(data.giftProductId);
      }
    }
    if (data.offerType && data.offerType !== 'GIFT') {
      data.giftProductId = null;
    }
    const offer = await prisma.spinWheelOffer.update({
      where: { id: offerId },
      data,
      include: giftProductInclude,
    });
    await syncSpinOfferToPromo(offer);
    return success(res, offer);
  } catch (err) {
    next(err);
  }
}

export async function deleteOffer(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureSpinWheelSchema();
    const id = req.params.id as string;
    const existing = await prisma.spinWheelOffer.findUnique({ where: { id } });
    if (!existing || (await isSpinOfferDeleted(id))) throw new AppError('Offer not found', 404);
    await assertCanMutateSpinOffer(req, existing);

    const used = await prisma.spinResult.count({ where: { offerId: id } });
    if (used > 0) {
      await markSpinOfferDeleted(id);
      await deactivateSpinOfferPromo(id);
      return success(res, { removed: true });
    }

    await prisma.spinWheelOffer.delete({ where: { id } });
    await deactivateSpinOfferPromo(id);
    return success(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

export async function getRecentResults(_req: Request, res: Response, next: NextFunction) {
  try {
    const results = await prisma.spinResult.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        offer: {
          select: {
            label: true,
            offerType: true,
            discountValue: true,
            giftProduct: { select: { name: true } },
          },
        },
        user: { select: { name: true, phone: true } },
      },
    });
    return success(res, results);
  } catch (err) {
    next(err);
  }
}
