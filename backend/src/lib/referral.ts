import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import { parsePromoUsageLimits } from './promotionUsage';

type PromoEligibilityDb = Prisma.TransactionClient | typeof prisma;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Matches loyalty UI codes: BC + optional initials + 4 hex chars from user id */
const REFERRAL_CODE_RE = /^BC[A-Z]{0,2}([A-F0-9]{4})$/i;

export function isFirstOrderPromoKind(kind: string | null | undefined): boolean {
  const k = (kind || '').toUpperCase();
  return k === 'WELCOME' || k === 'FIRST_ORDER' || k === 'LOYALTY_OFFER_1';
}

export function isReferralPromoKind(kind: string | null | undefined): boolean {
  return (kind || '').toUpperCase() === 'REFERRAL';
}

export function isWelcomeOfferCode(code: string | null | undefined): boolean {
  const c = (code || '').toUpperCase();
  return c === 'WELCOME10' || c.startsWith('WELCOME') || c === 'LOYALTY-OFFER1';
}

export function isWelcomeFirstOrderOffer(promo: {
  promotionKind?: string | null;
  code?: string | null;
}): boolean {
  return isFirstOrderPromoKind(promo.promotionKind) || isWelcomeOfferCode(promo.code);
}

async function getReferredByUserId(userId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ referredByUserId: string | null }[]>`
    SELECT referredByUserId FROM users WHERE id = ${userId} LIMIT 1
  `;
  return rows[0]?.referredByUserId ?? null;
}

/** Resolve a loyalty referral code or raw user id to the referrer user id. */
export async function resolveReferrerUserId(referralCode: string | null | undefined): Promise<string | null> {
  const raw = (referralCode ?? '').trim();
  if (!raw) return null;

  if (UUID_RE.test(raw)) {
    const user = await prisma.user.findFirst({
      where: { id: raw, deletedAt: null },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  const match = raw.toUpperCase().match(REFERRAL_CODE_RE);
  if (!match) return null;

  const suffix = match[1].toLowerCase();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM users
    WHERE deletedAt IS NULL
      AND LOWER(REPLACE(id, '-', '')) LIKE ${`${suffix}%`}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

/** Attach referrer once — ignores invalid codes and never overwrites an existing referral. */
export async function applyReferralCodeToUser(
  userId: string,
  referralCode: string | null | undefined,
): Promise<void> {
  const code = (referralCode ?? '').trim();
  if (!code) return;

  const existing = await getReferredByUserId(userId);
  if (existing) return;

  const referrerId = await resolveReferrerUserId(code);
  if (!referrerId || referrerId === userId) return;

  await prisma.$executeRaw`
    UPDATE users SET referredByUserId = ${referrerId} WHERE id = ${userId} AND referredByUserId IS NULL
  `;
}

async function countUserPromoUsesOnDb(
  db: PromoEligibilityDb,
  params: {
    userId: string;
    promoId: string;
    promoCode?: string | null;
  },
): Promise<number> {
  const code = (params.promoCode || '').trim().toUpperCase();
  return db.promotionUsage.count({
    where: {
      userId: params.userId,
      OR: [
        { promoCodeId: params.promoId },
        ...(code ? [{ promoCode: code }] : []),
      ],
    },
  });
}

async function getReferredByUserIdOnDb(db: PromoEligibilityDb, userId: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ referredByUserId: string | null }[]>`
    SELECT referredByUserId FROM users WHERE id = ${userId} LIMIT 1
  `;
  return rows[0]?.referredByUserId ?? null;
}

async function assertCustomerPromoEligibilityOnDb(
  db: PromoEligibilityDb,
  params: {
    promo: {
      id: string;
      code?: string | null;
      promotionKind?: string | null;
      usageLimits?: unknown;
    };
    userId?: string | null;
  },
): Promise<void> {
  const { promo, userId } = params;
  const kind = (promo.promotionKind || '').toUpperCase();
  const limits = parsePromoUsageLimits(promo.usageLimits);
  const welcomeOffer = isWelcomeFirstOrderOffer(promo) || isFirstOrderPromoKind(kind);

  if (welcomeOffer) {
    if (!userId) throw new AppError('Sign in to use this first-order offer', 401);

    const alreadyUsed = await countUserPromoUsesOnDb(db, {
      userId,
      promoId: promo.id,
      promoCode: promo.code,
    });
    if (alreadyUsed > 0) {
      throw new AppError('You have already used this first-order offer', 400);
    }

    const priorOrders = await db.order.count({
      where: { userId, status: { not: 'CANCELLED' } },
    });
    if (priorOrders > 0) {
      throw new AppError('This offer is for your first order only', 400);
    }
  }

  if (isReferralPromoKind(kind)) {
    if (!userId) throw new AppError('Sign in to use this referral offer', 401);
    const referredByUserId = await getReferredByUserIdOnDb(db, userId);
    if (!referredByUserId) {
      throw new AppError('This offer is for referred customers only', 400);
    }
  }

  const maxPerCustomer = welcomeOffer
    ? (limits.maxPerCustomer ?? 1)
    : limits.maxPerCustomer;

  if (maxPerCustomer != null) {
    if (!userId) throw new AppError('Sign in to use this promo code', 401);
    const used = await countUserPromoUsesOnDb(db, {
      userId,
      promoId: promo.id,
      promoCode: promo.code,
    });
    if (used >= maxPerCustomer) {
      throw new AppError('You have already used this promo code', 400);
    }
  }

  if (limits.maxPerDay != null) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usedToday = await db.promotionUsage.count({
      where: {
        promoCodeId: promo.id,
        createdAt: { gte: startOfDay },
      },
    });
    if (usedToday >= limits.maxPerDay) {
      throw new AppError('Daily usage limit for this promo has been reached', 400);
    }
  }
}

function promoEligibilityNeedsUserRowLock(params: {
  promo: {
    promotionKind?: string | null;
    code?: string | null;
    usageLimits?: unknown;
  };
  userId?: string | null;
}): boolean {
  if (!params.userId) return false;
  const kind = (params.promo.promotionKind || '').toUpperCase();
  const limits = parsePromoUsageLimits(params.promo.usageLimits);
  const welcomeOffer =
    isWelcomeFirstOrderOffer(params.promo) || isFirstOrderPromoKind(kind);
  if (welcomeOffer || isReferralPromoKind(kind)) return true;
  const maxPerCustomer = welcomeOffer
    ? (limits.maxPerCustomer ?? 1)
    : limits.maxPerCustomer;
  return maxPerCustomer != null;
}

/** Re-run promo eligibility under row locks (source of truth under concurrency). */
export async function assertCustomerPromoEligibilityInTx(
  tx: Prisma.TransactionClient,
  params: {
    promo: {
      id: string;
      code?: string | null;
      promotionKind?: string | null;
      usageLimits?: unknown;
    };
    userId?: string | null;
  },
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM promo_codes WHERE id = ${params.promo.id} FOR UPDATE`;
  if (promoEligibilityNeedsUserRowLock(params)) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${params.userId!} FOR UPDATE`;
  }
  await assertCustomerPromoEligibilityOnDb(tx, params);
}

/**
 * Welcome / first-order offers:
 * - only after login
 * - only on the customer's first non-cancelled order
 * - never again if this offer was already used
 */
export async function assertCustomerPromoEligibility(params: {
  promo: {
    id: string;
    code?: string | null;
    promotionKind?: string | null;
    usageLimits?: unknown;
  };
  userId?: string | null;
}): Promise<void> {
  await assertCustomerPromoEligibilityOnDb(prisma, params);
}
