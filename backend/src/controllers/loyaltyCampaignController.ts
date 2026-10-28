import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { resolveBranchStoreId } from '../middleware/auth';
import {
  ensurePlatformLoyaltyCampaign,
  getBranchLoyaltyOverride,
  getPlatformLoyaltyCampaign,
  resolveLoyaltyCampaign,
} from '../lib/loyaltyCampaign';
import {
  normalizeBranchShareSplits,
  parseBranchShareSplits,
  validateSelectedBranchShareSplits,
  validateSharedPromotionShares,
} from '../lib/promotionUsage';
import { resolveAvailableProductId } from '../lib/resolveProductFk';

const branchShareSplitsSchema = z.record(
  z.string().min(1),
  z.object({
    branchSharePct: z.number().int().min(0).max(100),
    platformSharePct: z.number().int().min(0).max(100),
  }),
).optional().nullable();

const campaignBodySchema = z.object({
  storeId: z.string().min(1).max(128).optional().nullable(),
  offer1Enabled: z.boolean().optional(),
  offer1DiscountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  offer1DiscountValue: z.number().int().min(0).optional(),
  offer1WebDiscountValue: z.number().int().min(0).max(100).optional(),
  offer1AppDiscountValue: z.number().int().min(0).max(100).optional(),
  offer1MinSubtotal: z.number().int().min(0).optional(),
  offer2Enabled: z.boolean().optional(),
  offer2DiscountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  offer2DiscountValue: z.number().int().min(0).optional(),
  offer2RewardType: z.enum(['DISCOUNT', 'GIFT']).optional(),
  offer2GiftProductId: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().min(1).max(128).nullable().optional(),
  ),
  offer2WindowDays: z.number().int().min(1).max(90).optional(),
  offer2MinSubtotal: z.number().int().min(0).optional(),
  offer3Enabled: z.boolean().optional(),
  offer3RequiredOrders: z.number().int().min(1).max(20).optional(),
  offer3MinOrderAmount: z.number().int().min(0).optional(),
  offer3WinChanceNumerator: z.number().int().min(0).max(1000).optional(),
  offer3WinChanceDenominator: z.number().int().min(1).max(10000).optional(),
  offer3OptionAMinEach: z.number().int().min(0).optional(),
  offer3OptionBCombinedMin: z.number().int().min(0).optional(),
  offer3MatchMode: z.enum(['A_OR_B', 'A_ONLY', 'B_ONLY']).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  ownership: z.enum(['PLATFORM', 'BRANCH', 'SHARED']).optional(),
  contributionSource: z.enum(['PLATFORM', 'JASON']).optional().nullable(),
  branchSharePct: z.number().int().min(0).max(100).optional(),
  platformSharePct: z.number().int().min(0).max(100).optional(),
  branchShareSplits: branchShareSplitsSchema,
});

export const loyaltyCampaignBodySchema = campaignBodySchema;

function isBranchAdminRequest(req: Request): boolean {
  return req.user?.type === 'admin' && req.user.role === 'STORE_MANAGER';
}

function isSuperAdminRequest(req: Request): boolean {
  return req.user?.type === 'admin' && req.user.role === 'SYSTEM_ADMIN';
}

function toInputJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function serializeCampaign(row: {
  id: string;
  storeId: string | null;
  offer1Enabled: boolean;
  offer1DiscountType: string;
  offer1DiscountValue: number;
  offer1WebDiscountValue?: number | null;
  offer1AppDiscountValue?: number | null;
  offer1MinSubtotal: number;
  offer2Enabled: boolean;
  offer2DiscountType: string;
  offer2DiscountValue: number;
  offer2RewardType?: string | null;
  offer2GiftProductId?: string | null;
  offer2WindowDays: number;
  offer2MinSubtotal: number;
  offer3Enabled: boolean;
  offer3RequiredOrders: number;
  offer3MinOrderAmount?: number | null;
  offer3WinChanceNumerator?: number | null;
  offer3WinChanceDenominator?: number | null;
  offer3OptionAMinEach: number;
  offer3OptionBCombinedMin: number;
  offer3MatchMode: string;
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  ownership: string | null;
  contributionSource?: string | null;
  branchSharePct: number | null;
  platformSharePct: number | null;
  branchShareSplits?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}, meta?: { source?: string; hasBranchOverride?: boolean; inheritedFromPlatform?: boolean }) {
  return {
    ...row,
    offer1WebDiscountValue: row.offer1WebDiscountValue ?? row.offer1DiscountValue ?? 20,
    offer1AppDiscountValue: row.offer1AppDiscountValue ?? row.offer1DiscountValue ?? 30,
    offer2RewardType: row.offer2RewardType ?? 'GIFT',
    offer2GiftProductId: row.offer2GiftProductId ?? null,
    offer3MinOrderAmount: row.offer3MinOrderAmount ?? 1000,
    offer3WinChanceNumerator: row.offer3WinChanceNumerator ?? 1,
    offer3WinChanceDenominator: row.offer3WinChanceDenominator ?? 10,
    contributionSource: row.contributionSource ?? 'JASON',
    branchShareSplits: parseBranchShareSplits(row.branchShareSplits),
    startsAt: row.startsAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
    ...meta,
  };
}

export async function getLoyaltyCampaignAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    await ensurePlatformLoyaltyCampaign();
    const { storeId: requestedStoreId } = z
      .object({ storeId: z.string().min(1).max(128).optional() })
      .parse(req.query);

    if (isBranchAdminRequest(req)) {
      const branchStoreId = await resolveBranchStoreId(req);
      const resolved = await resolveLoyaltyCampaign(branchStoreId);
      const override = await getBranchLoyaltyOverride(branchStoreId);
      const platform = await getPlatformLoyaltyCampaign();

      return success(res, {
        storeId: branchStoreId,
        resolved: resolved ? serializeCampaign(resolved, { source: resolved.source, hasBranchOverride: resolved.hasBranchOverride }) : null,
        override: override ? serializeCampaign(override, { source: 'BRANCH_OVERRIDE', hasBranchOverride: true }) : null,
        platform: platform ? serializeCampaign(platform, { source: 'PLATFORM', hasBranchOverride: false }) : null,
        inheritedFromPlatform: !override,
      });
    }

    if (!isSuperAdminRequest(req)) {
      throw new AppError('Forbidden', 403);
    }

    if (!requestedStoreId) {
      const platform = await getPlatformLoyaltyCampaign();
      const overrides = await prisma.loyaltyCampaign.findMany({
        where: { storeId: { not: null } },
        orderBy: { updatedAt: 'desc' },
      });
      return success(res, {
        platform: platform ? serializeCampaign(platform, { source: 'PLATFORM' }) : null,
        branchOverrides: overrides.map((o) => serializeCampaign(o, { source: 'BRANCH_OVERRIDE', hasBranchOverride: true })),
      });
    }

    const resolved = await resolveLoyaltyCampaign(requestedStoreId);
    const override = await getBranchLoyaltyOverride(requestedStoreId);
    const platform = await getPlatformLoyaltyCampaign();

    return success(res, {
      storeId: requestedStoreId,
      resolved: resolved ? serializeCampaign(resolved, { source: resolved.source, hasBranchOverride: resolved.hasBranchOverride }) : null,
      override: override ? serializeCampaign(override, { source: 'BRANCH_OVERRIDE', hasBranchOverride: true }) : null,
      platform: platform ? serializeCampaign(platform, { source: 'PLATFORM' }) : null,
      inheritedFromPlatform: !override,
    });
  } catch (err) {
    next(err);
  }
}

export async function upsertLoyaltyCampaignAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    await ensurePlatformLoyaltyCampaign();
    const data = campaignBodySchema.parse(req.body);

    if (data.offer2GiftProductId) {
      data.offer2GiftProductId = await resolveAvailableProductId(data.offer2GiftProductId);
    }

    let targetStoreId: string | null = data.storeId ?? null;

    if (isBranchAdminRequest(req)) {
      targetStoreId = await resolveBranchStoreId(req);
      data.ownership = 'BRANCH';
      data.branchSharePct = 100;
      data.platformSharePct = 0;
      data.contributionSource = null;
      data.branchShareSplits = null;
    } else if (!isSuperAdminRequest(req)) {
      throw new AppError('Forbidden', 403);
    }

    const ownership = data.ownership;
    if (ownership === 'SHARED') {
      const shareErr = validateSharedPromotionShares(ownership, data.branchSharePct, data.platformSharePct);
      if (shareErr) throw new AppError(shareErr, 400);
      const splitErr = validateSelectedBranchShareSplits(ownership, null, data.branchShareSplits);
      if (splitErr) throw new AppError(splitErr, 400);
    }

    let contributionSource: string | null | undefined = data.contributionSource;
    let branchShareSplitsJson: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;

    if (ownership === 'SHARED') {
      contributionSource = data.contributionSource === 'PLATFORM' ? 'PLATFORM' : 'JASON';
      const resolvedSplits = normalizeBranchShareSplits('SHARED', null, data.branchShareSplits);
      branchShareSplitsJson = toInputJson(resolvedSplits);
    } else if (ownership === 'PLATFORM' || ownership === 'BRANCH') {
      contributionSource = null;
      branchShareSplitsJson = Prisma.JsonNull;
      if (ownership === 'PLATFORM') {
        data.branchSharePct = data.branchSharePct ?? 0;
        data.platformSharePct = data.platformSharePct ?? 100;
      }
      if (ownership === 'BRANCH') {
        data.branchSharePct = data.branchSharePct ?? 100;
        data.platformSharePct = data.platformSharePct ?? 0;
      }
    }

    const payload = {
      offer1Enabled: data.offer1Enabled,
      offer1DiscountType: data.offer1DiscountType,
      offer1DiscountValue: data.offer1DiscountValue,
      offer1WebDiscountValue: data.offer1WebDiscountValue,
      offer1AppDiscountValue: data.offer1AppDiscountValue,
      offer1MinSubtotal: data.offer1MinSubtotal,
      offer2Enabled: data.offer2Enabled,
      offer2DiscountType: data.offer2DiscountType,
      offer2DiscountValue: data.offer2DiscountValue,
      offer2RewardType: data.offer2RewardType,
      offer2GiftProductId: data.offer2GiftProductId,
      offer2WindowDays: data.offer2WindowDays,
      offer2MinSubtotal: data.offer2MinSubtotal,
      offer3Enabled: data.offer3Enabled,
      offer3RequiredOrders: data.offer3RequiredOrders,
      offer3MinOrderAmount: data.offer3MinOrderAmount,
      offer3WinChanceNumerator: data.offer3WinChanceNumerator,
      offer3WinChanceDenominator: data.offer3WinChanceDenominator,
      offer3OptionAMinEach: data.offer3OptionAMinEach,
      offer3OptionBCombinedMin: data.offer3OptionBCombinedMin,
      offer3MatchMode: data.offer3MatchMode,
      isActive: data.isActive,
      startsAt: data.startsAt === undefined ? undefined : data.startsAt ? new Date(data.startsAt) : null,
      expiresAt: data.expiresAt === undefined ? undefined : data.expiresAt ? new Date(data.expiresAt) : null,
      ownership: data.ownership,
      contributionSource,
      branchSharePct: data.branchSharePct,
      platformSharePct: data.platformSharePct,
      ...(branchShareSplitsJson !== undefined ? { branchShareSplits: branchShareSplitsJson } : {}),
    };

    if (targetStoreId === null) {
      const platform = await getPlatformLoyaltyCampaign();
      if (!platform) throw new AppError('Platform campaign not found', 404);
      const updated = await prisma.loyaltyCampaign.update({
        where: { id: platform.id },
        data: payload,
      });
      return success(res, serializeCampaign(updated, { source: 'PLATFORM' }));
    }

    const existing = await getBranchLoyaltyOverride(targetStoreId);
    if (existing) {
      const updated = await prisma.loyaltyCampaign.update({
        where: { id: existing.id },
        data: payload,
      });
      return success(res, serializeCampaign(updated, { source: 'BRANCH_OVERRIDE', hasBranchOverride: true }));
    }

    const platform = await getPlatformLoyaltyCampaign();
    const base = platform ?? (await ensurePlatformLoyaltyCampaign());
    const created = await prisma.loyaltyCampaign.create({
      data: {
        storeId: targetStoreId,
        offer1Enabled: data.offer1Enabled ?? base.offer1Enabled,
        offer1DiscountType: data.offer1DiscountType ?? base.offer1DiscountType,
        offer1DiscountValue: data.offer1DiscountValue ?? base.offer1DiscountValue,
        offer1WebDiscountValue: data.offer1WebDiscountValue ?? base.offer1WebDiscountValue,
        offer1AppDiscountValue: data.offer1AppDiscountValue ?? base.offer1AppDiscountValue,
        offer1MinSubtotal: data.offer1MinSubtotal ?? base.offer1MinSubtotal,
        offer2Enabled: data.offer2Enabled ?? base.offer2Enabled,
        offer2DiscountType: data.offer2DiscountType ?? base.offer2DiscountType,
        offer2DiscountValue: data.offer2DiscountValue ?? base.offer2DiscountValue,
        offer2RewardType: data.offer2RewardType ?? base.offer2RewardType,
        offer2GiftProductId: data.offer2GiftProductId === undefined ? base.offer2GiftProductId : data.offer2GiftProductId,
        offer2WindowDays: data.offer2WindowDays ?? base.offer2WindowDays,
        offer2MinSubtotal: data.offer2MinSubtotal ?? base.offer2MinSubtotal,
        offer3Enabled: data.offer3Enabled ?? base.offer3Enabled,
        offer3RequiredOrders: data.offer3RequiredOrders ?? base.offer3RequiredOrders,
        offer3MinOrderAmount: data.offer3MinOrderAmount ?? base.offer3MinOrderAmount,
        offer3WinChanceNumerator: data.offer3WinChanceNumerator ?? base.offer3WinChanceNumerator,
        offer3WinChanceDenominator: data.offer3WinChanceDenominator ?? base.offer3WinChanceDenominator,
        offer3OptionAMinEach: data.offer3OptionAMinEach ?? base.offer3OptionAMinEach,
        offer3OptionBCombinedMin: data.offer3OptionBCombinedMin ?? base.offer3OptionBCombinedMin,
        offer3MatchMode: data.offer3MatchMode ?? base.offer3MatchMode,
        isActive: data.isActive ?? true,
        startsAt: data.startsAt === undefined ? base.startsAt : data.startsAt ? new Date(data.startsAt) : null,
        expiresAt: data.expiresAt === undefined ? base.expiresAt : data.expiresAt ? new Date(data.expiresAt) : null,
        ownership: data.ownership ?? 'BRANCH',
        contributionSource: contributionSource ?? null,
        branchSharePct: data.branchSharePct ?? 100,
        platformSharePct: data.platformSharePct ?? 0,
        branchShareSplits: branchShareSplitsJson === undefined ? Prisma.JsonNull : branchShareSplitsJson,
      },
    });
    return success(res, serializeCampaign(created, { source: 'BRANCH_OVERRIDE', hasBranchOverride: true }));
  } catch (err) {
    next(err);
  }
}

export async function deleteBranchLoyaltyOverride(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isBranchAdminRequest(req) && !isSuperAdminRequest(req)) {
      throw new AppError('Forbidden', 403);
    }

    let storeId: string;
    if (isBranchAdminRequest(req)) {
      storeId = await resolveBranchStoreId(req);
    } else {
      const parsed = z.object({ storeId: z.string().min(1).max(128) }).parse(req.query);
      storeId = parsed.storeId;
    }

    const override = await getBranchLoyaltyOverride(storeId);
    if (!override) {
      return success(res, { deleted: false, message: 'No branch override to remove' });
    }

    await prisma.loyaltyCampaign.delete({ where: { id: override.id } });
    const platform = await getPlatformLoyaltyCampaign();
    return success(res, {
      deleted: true,
      platform: platform ? serializeCampaign(platform, { source: 'PLATFORM' }) : null,
    });
  } catch (err) {
    next(err);
  }
}
