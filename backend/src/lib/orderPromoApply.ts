import type { LoyaltyCartDiscount, ResolvedLoyaltyCampaign } from './loyaltyCampaign';
import {
  contributionSourceForOwnership,
  positiveCost,
  resolveSharePercentagesForStore,
  type AppliedPromoSnapshot,
} from './promotionUsage';

export type LoyaltyOfferApplication = {
  discount: number;
  giftProductId?: string;
  giftNote?: string;
  giftCostForUsage?: number;
  appliedPromo: AppliedPromoSnapshot;
};

type NcjShareCampaign = Pick<
  ResolvedLoyaltyCampaign,
  'offer3Enabled' | 'ownership' | 'contributionSource' | 'branchSharePct' | 'platformSharePct' | 'branchShareSplits'
>;

export function applyLoyaltyCartDiscount(
  offer: LoyaltyCartDiscount,
  storeId: string,
): LoyaltyOfferApplication {
  const shares = resolveSharePercentagesForStore(
    offer.ownership,
    storeId,
    offer.branchSharePct,
    offer.platformSharePct,
    offer.branchShareSplits,
  );
  const giftProduct = offer.giftProductId && offer.giftProduct ? offer.giftProduct : undefined;

  return {
    discount: offer.discount,
    giftProductId: giftProduct?.id,
    giftNote: giftProduct
      ? (offer.giftLabel ?? `Free ${giftProduct.name}`)
      : undefined,
    giftCostForUsage: positiveCost(offer.giftCost),
    appliedPromo: {
      id: `loyalty-${offer.offerKey.toLowerCase()}`,
      code: offer.code,
      ownership: offer.ownership,
      contributionSource: contributionSourceForOwnership(offer.ownership, offer.contributionSource),
      branchSharePct: shares.branchSharePct,
      platformSharePct: shares.platformSharePct,
      promotionKind: offer.promotionKind,
      promotionRules: {
        loyaltyOffer: offer.offerKey,
        ...(giftProduct
          ? { giftProductId: offer.giftProductId, giftProduct: offer.giftProduct }
          : {}),
      },
      discountType: offer.discountType,
      discountValue: offer.discountValue,
    },
  };
}

export function overlayNcjCampaignShares(
  appliedPromo: AppliedPromoSnapshot,
  campaign: NcjShareCampaign | null | undefined,
  storeId: string,
): AppliedPromoSnapshot {
  if (!campaign?.offer3Enabled) return appliedPromo;
  const shares = resolveSharePercentagesForStore(
    campaign.ownership,
    storeId,
    campaign.branchSharePct,
    campaign.platformSharePct,
    campaign.branchShareSplits,
  );
  return {
    ...appliedPromo,
    ownership: campaign.ownership,
    contributionSource: contributionSourceForOwnership(
      campaign.ownership,
      campaign.contributionSource,
    ),
    branchSharePct: shares.branchSharePct,
    platformSharePct: shares.platformSharePct,
  };
}
