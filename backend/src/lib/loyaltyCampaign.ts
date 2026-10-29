import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { computePromoDiscount } from './promotionUsage';
import { ensureLoyaltySchema, isMissingLoyaltyCampaignTable } from './loyaltySchema';
import { AppError } from '../middleware/errorHandler';

export const LOYALTY_OFFER1_CODE = 'LOYALTY-OFFER1';
export const LOYALTY_OFFER2_CODE = 'LOYALTY-OFFER2';

export type LoyaltyOfferKey = 'OFFER_1' | 'OFFER_2';
export type LoyaltyOffer2RewardType = 'DISCOUNT' | 'GIFT';
export type OrderChannel = 'WEB' | 'APP' | 'POS' | 'WHATSAPP' | 'TELEGRAM';

export type LoyaltyCampaignRow = {
  id: string;
  storeId: string | null;
  offer1Enabled: boolean;
  offer1DiscountType: string;
  offer1DiscountValue: number;
  offer1WebDiscountValue: number;
  offer1AppDiscountValue: number;
  offer1MinSubtotal: number;
  offer2Enabled: boolean;
  offer2DiscountType: string;
  offer2DiscountValue: number;
  offer2RewardType: string;
  offer2GiftProductId: string | null;
  offer2WindowDays: number;
  offer2MinSubtotal: number;
  offer3Enabled: boolean;
  offer3RequiredOrders: number;
  offer3MinOrderAmount: number;
  offer3WinChanceNumerator: number;
  offer3WinChanceDenominator: number;
  offer3OptionAMinEach: number;
  offer3OptionBCombinedMin: number;
  offer3MatchMode: string;
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  ownership: string | null;
  contributionSource: string | null;
  branchSharePct: number | null;
  platformSharePct: number | null;
  branchShareSplits: unknown;
};

export type ResolvedLoyaltyCampaign = LoyaltyCampaignRow & {
  source: 'PLATFORM' | 'BRANCH_OVERRIDE';
  hasBranchOverride: boolean;
};

export type CustomerOrderStats = {
  /** Paid orders — used for Spin & Win unlock only. */
  validOrderCount: number;
  validOrderSubtotals: number[];
  /** First paid order date (spin window). */
  firstOrderAt: Date | null;
  /** Non-cancelled placed orders — Offer 1 / Offer 2 eligibility. */
  placedOrderCount: number;
  /** First placed order date — Offer 2 come-back window. */
  firstPlacedOrderAt: Date | null;
  /** Offer 1 already on a non-cancelled order (including unpaid checkout). */
  offer1Claimed: boolean;
  /** Offer 2 already on a non-cancelled order (including unpaid checkout). */
  offer2Claimed: boolean;
};

export type LoyaltyGiftProduct = {
  id: string;
  name: string;
  basePrice: number;
  imageUrl: string | null;
};

export type LoyaltyCartDiscount = {
  offerKey: LoyaltyOfferKey;
  code: string;
  discount: number;
  discountType: string;
  discountValue: number;
  /** Wallet cost for GIFT offers (product base price); cart discount stays 0. */
  giftCost?: number;
  label: string;
  description: string;
  promotionKind: string;
  ownership: string | null;
  contributionSource: string | null;
  branchSharePct: number | null;
  platformSharePct: number | null;
  branchShareSplits: unknown;
  autoApply: true;
  hideCode: true;
  giftLabel?: string | null;
  giftProduct?: LoyaltyGiftProduct | null;
  giftProductId?: string | null;
};

export type LoyaltySpinProgress = {
  enabled: boolean;
  /** True when admin added the loyalty-journey criterion — wheel stays hidden until unlocked. */
  gatesSpin: boolean;
  unlocked: boolean;
  requiredOrders: number;
  validOrderCount: number;
  ordersNeeded: number;
  minOrderAmount: number;
  winChanceNumerator: number;
  winChanceDenominator: number;
};

export type LoyaltyEvaluation = {
  campaign: ResolvedLoyaltyCampaign | null;
  cartDiscount: LoyaltyCartDiscount | null;
  spin: LoyaltySpinProgress;
};

export const PDF_DEFAULT_CAMPAIGN = {
  offer1Enabled: true,
  offer1DiscountType: 'PERCENTAGE',
  offer1DiscountValue: 20,
  offer1WebDiscountValue: 20,
  offer1AppDiscountValue: 30,
  offer1MinSubtotal: 0,
  offer2Enabled: true,
  offer2DiscountType: 'PERCENTAGE',
  offer2DiscountValue: 5,
  offer2RewardType: 'GIFT' as LoyaltyOffer2RewardType,
  offer2GiftProductId: null as string | null,
  offer2WindowDays: 7,
  offer2MinSubtotal: 0,
  offer3Enabled: true,
  offer3RequiredOrders: 3,
  offer3MinOrderAmount: 1000,
  offer3WinChanceNumerator: 1,
  offer3WinChanceDenominator: 10,
  offer3OptionAMinEach: 1500,
  offer3OptionBCombinedMin: 4500,
  offer3MatchMode: 'A_OR_B',
  isActive: true,
  ownership: 'PLATFORM',
  contributionSource: 'JASON',
  branchSharePct: 0,
  platformSharePct: 100,
  branchShareSplits: null as unknown,
};

export function isLoyaltyPromoCode(code: string | null | undefined): boolean {
  const c = (code || '').trim().toUpperCase();
  return c === LOYALTY_OFFER1_CODE || c === LOYALTY_OFFER2_CODE;
}

export function loyaltyCodeForOffer(offerKey: LoyaltyOfferKey): string {
  return offerKey === 'OFFER_1' ? LOYALTY_OFFER1_CODE : LOYALTY_OFFER2_CODE;
}

export function loyaltyPromotionKind(offerKey: LoyaltyOfferKey): string {
  return offerKey === 'OFFER_1' ? 'LOYALTY_OFFER_1' : 'LOYALTY_OFFER_2';
}

export function normalizeOrderChannel(channel?: string | null): OrderChannel {
  const c = (channel || 'WEB').toUpperCase();
  if (c === 'APP' || c === 'POS' || c === 'WHATSAPP' || c === 'TELEGRAM') return c;
  return 'WEB';
}

export function offer1DiscountForChannel(
  campaign: Pick<LoyaltyCampaignRow, 'offer1DiscountValue' | 'offer1WebDiscountValue' | 'offer1AppDiscountValue'>,
  channel?: string | null,
): number {
  const normalized = normalizeOrderChannel(channel);
  if (normalized === 'APP') {
    return campaign.offer1AppDiscountValue ?? campaign.offer1DiscountValue ?? 30;
  }
  return campaign.offer1WebDiscountValue ?? campaign.offer1DiscountValue ?? 20;
}

/** Returns true when the spin roll should pick a real prize (vs Try Again). */
export function rollSpinPrizeWin(
  numerator: number,
  denominator: number,
  random = Math.random(),
): boolean {
  const num = Math.max(0, Math.floor(numerator));
  const den = Math.max(1, Math.floor(denominator));
  if (num <= 0) return false;
  if (num >= den) return true;
  return random < num / den;
}

function campaignIsWithinSchedule(campaign: LoyaltyCampaignRow, now: Date): boolean {
  if (!campaign.isActive) return false;
  if (campaign.startsAt && campaign.startsAt > now) return false;
  if (campaign.expiresAt && campaign.expiresAt <= now) return false;
  return true;
}

function normalizeCampaignRow(row: Record<string, unknown>): LoyaltyCampaignRow {
  return {
    ...(row as unknown as LoyaltyCampaignRow),
    offer1WebDiscountValue: Number(row.offer1WebDiscountValue ?? row.offer1DiscountValue ?? 20),
    offer1AppDiscountValue: Number(row.offer1AppDiscountValue ?? row.offer1DiscountValue ?? 30),
    offer2RewardType: String(row.offer2RewardType ?? 'GIFT'),
    offer2GiftProductId: (row.offer2GiftProductId as string | null) ?? null,
    offer3MinOrderAmount: Number(row.offer3MinOrderAmount ?? 1000),
    offer3WinChanceNumerator: Number(row.offer3WinChanceNumerator ?? 1),
    offer3WinChanceDenominator: Number(row.offer3WinChanceDenominator ?? 10),
    contributionSource: (row.contributionSource as string | null) ?? 'JASON',
    branchShareSplits: row.branchShareSplits ?? null,
  };
}

export async function getPlatformLoyaltyCampaign(): Promise<LoyaltyCampaignRow | null> {
  try {
    await ensureLoyaltySchema();
    const row = await prisma.loyaltyCampaign.findFirst({ where: { storeId: null } });
    return row ? normalizeCampaignRow(row as unknown as Record<string, unknown>) : null;
  } catch (err) {
    if (isMissingLoyaltyCampaignTable(err)) return null;
    throw err;
  }
}

export async function getBranchLoyaltyOverride(storeId: string): Promise<LoyaltyCampaignRow | null> {
  try {
    await ensureLoyaltySchema();
    const row = await prisma.loyaltyCampaign.findFirst({ where: { storeId } });
    return row ? normalizeCampaignRow(row as unknown as Record<string, unknown>) : null;
  } catch (err) {
    if (isMissingLoyaltyCampaignTable(err)) return null;
    throw err;
  }
}

export async function resolveLoyaltyCampaign(storeId: string): Promise<ResolvedLoyaltyCampaign | null> {
  const [branchOverride, platform] = await Promise.all([
    getBranchLoyaltyOverride(storeId),
    getPlatformLoyaltyCampaign(),
  ]);

  if (branchOverride?.isActive) {
    return {
      ...branchOverride,
      source: 'BRANCH_OVERRIDE',
      hasBranchOverride: true,
    };
  }

  if (platform?.isActive) {
    return {
      ...platform,
      source: 'PLATFORM',
      hasBranchOverride: Boolean(branchOverride),
    };
  }

  return null;
}

function buildCustomerOrderStatsFromRows(
  orders: Array<{
    subtotal: number;
    createdAt: Date;
    paymentStatus: string;
    promoCode: string | null;
  }>,
): CustomerOrderStats {
  const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID');
  const offer1Claimed = orders.some(
    (o) => (o.promoCode || '').trim().toUpperCase() === LOYALTY_OFFER1_CODE,
  );
  const offer2Claimed = orders.some(
    (o) => (o.promoCode || '').trim().toUpperCase() === LOYALTY_OFFER2_CODE,
  );

  return {
    validOrderCount: paidOrders.length,
    validOrderSubtotals: paidOrders.map((o) => o.subtotal),
    firstOrderAt: paidOrders[0]?.createdAt ?? null,
    placedOrderCount: orders.length,
    firstPlacedOrderAt: orders[0]?.createdAt ?? null,
    offer1Claimed,
    offer2Claimed,
  };
}

export async function getCustomerOrderStats(userId: string): Promise<CustomerOrderStats> {
  // Paid orders advance spin / journey counts. Loyalty cart offers (Offer 1 & 2) are
  // consumed when applied on any non-cancelled order so an unpaid 2nd order with free
  // ice cream cannot be claimed again on a 3rd checkout.
  const orders = await prisma.order.findMany({
    where: {
      userId,
      status: { not: 'CANCELLED' },
    },
    orderBy: { createdAt: 'asc' },
    select: { subtotal: true, createdAt: true, paymentStatus: true, promoCode: true },
  });

  return buildCustomerOrderStatsFromRows(orders);
}

export async function getCustomerOrderStatsInTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<CustomerOrderStats> {
  const orders = await tx.order.findMany({
    where: {
      userId,
      status: { not: 'CANCELLED' },
    },
    orderBy: { createdAt: 'asc' },
    select: { subtotal: true, createdAt: true, paymentStatus: true, promoCode: true },
  });
  return buildCustomerOrderStatsFromRows(orders);
}

/** Re-validates a loyalty journey code under a user row lock (no discount recomputation). */
export async function assertLoyaltyOfferCodeStillValidInTx(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    promoCode: string;
    storeId: string;
    subtotal: number;
    channel?: string | null;
  },
): Promise<void> {
  const normalized = params.promoCode.trim().toUpperCase();
  if (!isLoyaltyPromoCode(normalized)) return;

  await tx.$queryRaw`SELECT id FROM users WHERE id = ${params.userId} FOR UPDATE`;
  const stats = await getCustomerOrderStatsInTx(tx, params.userId);
  const campaign = await resolveLoyaltyCampaign(params.storeId);
  const giftProduct = campaign ? await loadOffer2GiftProduct(campaign) : null;
  const evaluation = evaluateLoyaltyOffers({
    campaign,
    stats,
    subtotal: params.subtotal,
    userId: params.userId,
    channel: params.channel,
    giftProduct,
  });
  if (!evaluation.cartDiscount || evaluation.cartDiscount.code !== normalized) {
    throw new AppError('This loyalty offer is not available for your order', 400);
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function evaluateSpinUnlock(
  subtotals: number[],
  requiredOrders: number,
  minOrderAmount: number,
): boolean {
  if (subtotals.length < requiredOrders) return false;
  if (minOrderAmount <= 0) return true;
  // Unlock on the Nth paid order OR any later paid order that meets the minimum.
  // Previously only the exact Nth order was checked, so a small 3rd order permanently
  // blocked Spin & Win even after larger follow-up orders.
  return subtotals.slice(requiredOrders - 1).some((subtotal) => subtotal >= minOrderAmount);
}

function buildOffer1Discount(
  campaign: ResolvedLoyaltyCampaign,
  subtotal: number,
  channel?: string | null,
): LoyaltyCartDiscount {
  const discountType = campaign.offer1DiscountType;
  const discountValue = offer1DiscountForChannel(campaign, channel);
  const discount = computePromoDiscount(discountType, discountValue, subtotal);
  const percentLabel = discountType === 'PERCENTAGE' ? `${discountValue}%` : `LKR ${discountValue}`;
  const channelLabel = normalizeOrderChannel(channel) === 'APP' ? 'app' : 'website';

  return {
    offerKey: 'OFFER_1',
    code: loyaltyCodeForOffer('OFFER_1'),
    discount,
    discountType,
    discountValue,
    label: `First order ${percentLabel} off`,
    description: `Welcome! Enjoy ${percentLabel} off your first order on the ${channelLabel}.`,
    promotionKind: loyaltyPromotionKind('OFFER_1'),
    ownership: campaign.ownership,
    contributionSource: campaign.contributionSource,
    branchSharePct: campaign.branchSharePct,
    platformSharePct: campaign.platformSharePct,
    branchShareSplits: campaign.branchShareSplits,
    autoApply: true,
    hideCode: true,
  };
}

function buildOffer2Discount(
  campaign: ResolvedLoyaltyCampaign,
  subtotal: number,
  giftProduct?: LoyaltyGiftProduct | null,
): LoyaltyCartDiscount | null {
  const rewardType = (campaign.offer2RewardType || 'GIFT').toUpperCase();

  if (rewardType === 'GIFT') {
    if (!giftProduct) return null;
    return {
      offerKey: 'OFFER_2',
      code: loyaltyCodeForOffer('OFFER_2'),
      discount: 0,
      discountType: 'FIXED',
      discountValue: 0,
      giftCost: giftProduct.basePrice,
      label: `Free ${giftProduct.name}`,
      description: `Your 2nd order within ${campaign.offer2WindowDays} days includes a free ${giftProduct.name}!`,
      promotionKind: 'LOYALTY_OFFER_2_GIFT',
      ownership: campaign.ownership,
      contributionSource: campaign.contributionSource,
      branchSharePct: campaign.branchSharePct,
      platformSharePct: campaign.platformSharePct,
      branchShareSplits: campaign.branchShareSplits,
      autoApply: true,
      hideCode: true,
      giftLabel: `Free ${giftProduct.name}`,
      giftProduct,
      giftProductId: giftProduct.id,
    };
  }

  const discountType = campaign.offer2DiscountType;
  const discountValue = campaign.offer2DiscountValue;
  const discount = computePromoDiscount(discountType, discountValue, subtotal);
  const percentLabel = discountType === 'PERCENTAGE' ? `${discountValue}%` : `LKR ${discountValue}`;

  return {
    offerKey: 'OFFER_2',
    code: loyaltyCodeForOffer('OFFER_2'),
    discount,
    discountType,
    discountValue,
    label: `Follow-up ${percentLabel} off`,
    description: `Come back within ${campaign.offer2WindowDays} days for ${percentLabel} off.`,
    promotionKind: loyaltyPromotionKind('OFFER_2'),
    ownership: campaign.ownership,
    contributionSource: campaign.contributionSource,
    branchSharePct: campaign.branchSharePct,
    platformSharePct: campaign.platformSharePct,
    branchShareSplits: campaign.branchShareSplits,
    autoApply: true,
    hideCode: true,
  };
}

export function evaluateLoyaltyOffers(params: {
  campaign: ResolvedLoyaltyCampaign | null;
  stats: CustomerOrderStats;
  subtotal: number;
  userId?: string | null;
  channel?: string | null;
  giftProduct?: LoyaltyGiftProduct | null;
  now?: Date;
}): LoyaltyEvaluation {
  const now = params.now ?? new Date();
  const emptySpin: LoyaltySpinProgress = {
    enabled: false,
    gatesSpin: false,
    unlocked: false,
    requiredOrders: 3,
    validOrderCount: 0,
    ordersNeeded: 3,
    minOrderAmount: 1000,
    winChanceNumerator: 1,
    winChanceDenominator: 10,
  };

  if (!params.campaign || !campaignIsWithinSchedule(params.campaign, now)) {
    return { campaign: params.campaign, cartDiscount: null, spin: emptySpin };
  }

  const campaign = params.campaign;
  const stats = params.stats;
  const spinUnlocked = evaluateSpinUnlock(
    stats.validOrderSubtotals,
    campaign.offer3RequiredOrders,
    campaign.offer3MinOrderAmount,
  );

  const spin: LoyaltySpinProgress = {
    enabled: campaign.offer3Enabled,
    gatesSpin: false,
    unlocked: campaign.offer3Enabled && spinUnlocked,
    requiredOrders: campaign.offer3RequiredOrders,
    validOrderCount: stats.validOrderCount,
    ordersNeeded: Math.max(0, campaign.offer3RequiredOrders - stats.validOrderCount),
    minOrderAmount: campaign.offer3MinOrderAmount,
    winChanceNumerator: campaign.offer3WinChanceNumerator,
    winChanceDenominator: campaign.offer3WinChanceDenominator,
  };

  if (!params.userId) {
    return { campaign, cartDiscount: null, spin };
  }

  let cartDiscount: LoyaltyCartDiscount | null = null;

  if (
    campaign.offer1Enabled &&
    stats.placedOrderCount === 0 &&
    !stats.offer1Claimed &&
    params.subtotal >= campaign.offer1MinSubtotal
  ) {
    cartDiscount = buildOffer1Discount(campaign, params.subtotal, params.channel);
  } else if (
    campaign.offer2Enabled &&
    stats.placedOrderCount === 1 &&
    !stats.offer2Claimed &&
    stats.firstPlacedOrderAt &&
    params.subtotal >= campaign.offer2MinSubtotal
  ) {
    const windowEnd = addDays(stats.firstPlacedOrderAt, campaign.offer2WindowDays);
    if (now <= windowEnd) {
      cartDiscount = buildOffer2Discount(campaign, params.subtotal, params.giftProduct);
    }
  }

  return { campaign, cartDiscount, spin };
}

async function loadOffer2GiftProduct(campaign: ResolvedLoyaltyCampaign): Promise<LoyaltyGiftProduct | null> {
  if ((campaign.offer2RewardType || 'GIFT').toUpperCase() !== 'GIFT') return null;
  if (!campaign.offer2GiftProductId) return null;
  const product = await prisma.product.findFirst({
    where: { id: campaign.offer2GiftProductId, isAvailable: true },
    select: { id: true, name: true, basePrice: true, imageUrl: true },
  });
  if (!product) return null;
  return product;
}

export type CustomerLoyaltyJourneyStepKey = 'OFFER_1' | 'OFFER_2' | 'OFFER_3';

export type CustomerLoyaltyJourneyStepStatus =
  | 'locked'
  | 'current'
  | 'completed'
  | 'expired'
  | 'disabled';

export type CustomerLoyaltyJourneyStep = {
  key: CustomerLoyaltyJourneyStepKey;
  stepNumber: number;
  title: string;
  description: string;
  status: CustomerLoyaltyJourneyStepStatus;
  statusLabel: string;
  detail: string | null;
  progress: { current: number; required: number } | null;
};

export type CustomerLoyaltyJourney = {
  active: boolean;
  validOrderCount: number;
  currentStepKey: CustomerLoyaltyJourneyStepKey | null;
  headline: string;
  steps: CustomerLoyaltyJourneyStep[];
};

function emptyCustomerLoyaltyJourney(validOrderCount = 0): CustomerLoyaltyJourney {
  return {
    active: false,
    validOrderCount,
    currentStepKey: null,
    headline: 'New customer journey is not available right now',
    steps: [],
  };
}

export async function getCustomerLoyaltyJourney(params: {
  userId: string;
  storeId?: string | null;
  now?: Date;
}): Promise<CustomerLoyaltyJourney> {
  const now = params.now ?? new Date();
  const campaign = params.storeId
    ? await resolveLoyaltyCampaign(params.storeId)
    : await (async () => {
        const platform = await getPlatformLoyaltyCampaign();
        if (!platform?.isActive) return null;
        return {
          ...platform,
          source: 'PLATFORM' as const,
          hasBranchOverride: false,
        };
      })();

  const stats = await getCustomerOrderStats(params.userId);

  if (!campaign || !campaignIsWithinSchedule(campaign, now)) {
    return emptyCustomerLoyaltyJourney(stats.validOrderCount);
  }

  const giftProduct = await loadOffer2GiftProduct(campaign);
  const webPct = offer1DiscountForChannel(campaign, 'WEB');
  const appPct = offer1DiscountForChannel(campaign, 'APP');
  const offer2IsGift = (campaign.offer2RewardType || 'GIFT').toUpperCase() === 'GIFT';
  const offer2DiscountLabel =
    campaign.offer2DiscountType === 'PERCENTAGE'
      ? `${campaign.offer2DiscountValue}% off`
      : `LKR ${campaign.offer2DiscountValue} off`;
  const spinUnlocked = evaluateSpinUnlock(
    stats.validOrderSubtotals,
    campaign.offer3RequiredOrders,
    campaign.offer3MinOrderAmount,
  );

  let offer2WindowExpired = false;
  let offer2DaysLeft: number | null = null;
  if (stats.placedOrderCount === 1 && stats.firstPlacedOrderAt) {
    const windowEnd = addDays(stats.firstPlacedOrderAt, campaign.offer2WindowDays);
    offer2WindowExpired = now > windowEnd;
    if (!offer2WindowExpired) {
      offer2DaysLeft = Math.max(
        0,
        Math.ceil((windowEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }
  }

  const steps: CustomerLoyaltyJourneyStep[] = [];

  // Offer 1
  if (!campaign.offer1Enabled) {
    steps.push({
      key: 'OFFER_1',
      stepNumber: 1,
      title: 'First order welcome',
      description: 'Welcome discount on your first order',
      status: 'disabled',
      statusLabel: 'Off',
      detail: null,
      progress: null,
    });
  } else if (stats.placedOrderCount >= 1 || stats.offer1Claimed) {
    steps.push({
      key: 'OFFER_1',
      stepNumber: 1,
      title: 'First order welcome',
      description: `${webPct}% web · ${appPct}% app`,
      status: 'completed',
      statusLabel: 'Done',
      detail: null,
      progress: null,
    });
  } else {
    steps.push({
      key: 'OFFER_1',
      stepNumber: 1,
      title: 'First order welcome',
      description: `${webPct}% web · ${appPct}% app`,
      status: 'current',
      statusLabel: 'Available',
      detail:
        campaign.offer1MinSubtotal > 0
          ? `Min LKR ${campaign.offer1MinSubtotal.toLocaleString()}`
          : null,
      progress: null,
    });
  }

  // Offer 2
  if (!campaign.offer2Enabled) {
    steps.push({
      key: 'OFFER_2',
      stepNumber: 2,
      title: 'Come-back reward',
      description: `Within ${campaign.offer2WindowDays} days of your first order`,
      status: 'disabled',
      statusLabel: 'Off',
      detail: null,
      progress: null,
    });
  } else {
    const rewardCopy = offer2IsGift
      ? giftProduct
        ? `Free ${giftProduct.name}`
        : 'A free gift drink'
      : offer2DiscountLabel;
    const baseDesc = `${rewardCopy} within ${campaign.offer2WindowDays} days of order 1`;

    if (stats.placedOrderCount >= 2 || stats.offer2Claimed) {
      steps.push({
        key: 'OFFER_2',
        stepNumber: 2,
        title: 'Come-back reward',
        description: baseDesc,
        status: 'completed',
        statusLabel: 'Done',
        detail: null,
        progress: null,
      });
    } else if (stats.placedOrderCount === 1 && offer2WindowExpired) {
      steps.push({
        key: 'OFFER_2',
        stepNumber: 2,
        title: 'Come-back reward',
        description: baseDesc,
        status: 'expired',
        statusLabel: 'Expired',
        detail: null,
        progress: null,
      });
    } else if (stats.placedOrderCount === 1) {
      steps.push({
        key: 'OFFER_2',
        stepNumber: 2,
        title: 'Come-back reward',
        description: baseDesc,
        status: 'current',
        statusLabel: 'Available',
        detail:
          offer2DaysLeft != null
            ? `${offer2DaysLeft}d left`
            : null,
        progress: null,
      });
    } else {
      steps.push({
        key: 'OFFER_2',
        stepNumber: 2,
        title: 'Come-back reward',
        description: baseDesc,
        status: 'locked',
        statusLabel: 'Locked',
        detail: null,
        progress: null,
      });
    }
  }

  // Offer 3 — spin unlock. Unlocked ≠ journey complete: stay "Ready" until they spin.
  if (!campaign.offer3Enabled) {
    steps.push({
      key: 'OFFER_3',
      stepNumber: 3,
      title: 'Spin & win',
      description: `Unlock after ${campaign.offer3RequiredOrders} orders`,
      status: 'disabled',
      statusLabel: 'Off',
      detail: null,
      progress: null,
    });
  } else if (spinUnlocked) {
    const lifetimeSpins = params.userId
      ? await prisma.spinResult.count({ where: { userId: params.userId } }).catch(() => 0)
      : 0;
    const hasUsedSpin = lifetimeSpins > 0;
    steps.push({
      key: 'OFFER_3',
      stepNumber: 3,
      title: 'Spin & win',
      description: hasUsedSpin ? 'Spin unlocked' : 'Spin unlocked — ready to play',
      status: hasUsedSpin ? 'completed' : 'current',
      statusLabel: hasUsedSpin ? 'Done' : 'Ready',
      detail: hasUsedSpin ? null : 'Open the wheel to claim Offer 3',
      progress: {
        current: campaign.offer3RequiredOrders,
        required: campaign.offer3RequiredOrders,
      },
    });
  } else {
    const ordersNeeded = Math.max(0, campaign.offer3RequiredOrders - stats.validOrderCount);
    const reachedCount = stats.validOrderCount >= campaign.offer3RequiredOrders;
    const isCurrent =
      steps.every((s) => s.status !== 'current') &&
      (stats.validOrderCount > 0 || !campaign.offer1Enabled);
    // Don't show full N/N progress until the min-amount unlock actually clears —
    // otherwise Offer 3 looks complete while Spin & Win stays locked.
    const progressCurrent = reachedCount
      ? Math.max(0, campaign.offer3RequiredOrders - 1)
      : Math.min(stats.validOrderCount, campaign.offer3RequiredOrders);
    steps.push({
      key: 'OFFER_3',
      stepNumber: 3,
      title: 'Spin & win',
      description: `${campaign.offer3RequiredOrders} orders · min LKR ${campaign.offer3MinOrderAmount.toLocaleString()}`,
      status: isCurrent ? 'current' : 'locked',
      statusLabel: reachedCount ? 'Need min order' : isCurrent ? 'In progress' : 'Locked',
      detail: reachedCount
        ? `Min LKR ${campaign.offer3MinOrderAmount.toLocaleString()} on unlock order`
        : ordersNeeded > 0
          ? `${stats.validOrderCount}/${campaign.offer3RequiredOrders}`
          : null,
      progress: {
        current: progressCurrent,
        required: campaign.offer3RequiredOrders,
      },
    });
  }

  const currentStep = steps.find((s) => s.status === 'current') ?? null;
  const spinStep = steps.find((s) => s.key === 'OFFER_3');
  const currentStepKey = currentStep?.key ?? null;

  let headline = 'Welcome offers';
  if (currentStep?.key === 'OFFER_1') {
    headline = 'Offer 1 available';
  } else if (currentStep?.key === 'OFFER_2') {
    headline = 'Offer 2 available';
  } else if (currentStep?.key === 'OFFER_3' && spinStep?.statusLabel === 'Ready') {
    headline = 'Spin unlocked';
  } else if (currentStep?.key === 'OFFER_3') {
    headline = 'Unlock spin';
  } else if (spinStep?.status === 'completed') {
    headline = 'Journey complete';
  } else if (steps.every((s) => s.status === 'completed' || s.status === 'disabled' || s.status === 'expired')) {
    headline = 'Journey complete';
  }

  return {
    active: true,
    validOrderCount: stats.validOrderCount,
    currentStepKey,
    headline,
    steps,
  };
}

export async function evaluateLoyaltySpinAudience(params: {
  storeId?: string;
  userId?: string | null;
  now?: Date;
}): Promise<LoyaltyEvaluation> {
  const campaign = params.storeId
    ? await resolveLoyaltyCampaign(params.storeId)
    : await (async () => {
        const platform = await getPlatformLoyaltyCampaign();
        if (!platform?.isActive) return null;
        return {
          ...platform,
          source: 'PLATFORM' as const,
          hasBranchOverride: false,
        };
      })();
  const stats = params.userId
    ? await getCustomerOrderStats(params.userId)
    : {
        validOrderCount: 0,
        validOrderSubtotals: [],
        firstOrderAt: null,
        placedOrderCount: 0,
        firstPlacedOrderAt: null,
        offer1Claimed: false,
        offer2Claimed: false,
      };

  return evaluateLoyaltyOffers({
    campaign,
    stats,
    subtotal: 0,
    userId: params.userId,
    now: params.now,
  });
}

export async function evaluateLoyaltyForStore(params: {
  storeId: string;
  subtotal: number;
  userId?: string | null;
  channel?: string | null;
  now?: Date;
}): Promise<LoyaltyEvaluation> {
  const campaign = await resolveLoyaltyCampaign(params.storeId);
  const stats = params.userId
    ? await getCustomerOrderStats(params.userId)
    : {
        validOrderCount: 0,
        validOrderSubtotals: [],
        firstOrderAt: null,
        placedOrderCount: 0,
        firstPlacedOrderAt: null,
        offer1Claimed: false,
        offer2Claimed: false,
      };

  const giftProduct = campaign ? await loadOffer2GiftProduct(campaign) : null;

  return evaluateLoyaltyOffers({
    campaign,
    stats,
    subtotal: params.subtotal,
    userId: params.userId,
    channel: params.channel,
    giftProduct,
    now: params.now,
  });
}

export async function ensurePlatformLoyaltyCampaign(): Promise<LoyaltyCampaignRow> {
  await ensureLoyaltySchema();
  const existing = await getPlatformLoyaltyCampaign();
  if (existing) return existing;

  const { branchShareSplits: _splits, ...defaults } = PDF_DEFAULT_CAMPAIGN;
  return normalizeCampaignRow(
    (await prisma.loyaltyCampaign.create({
      data: {
        storeId: null,
        ...defaults,
      },
    })) as unknown as Record<string, unknown>,
  );
}
