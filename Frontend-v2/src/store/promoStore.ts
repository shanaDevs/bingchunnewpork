import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isAutoApplyPromo } from '@/lib/promotionAutoApply';
import { getSpinClaim } from '@/lib/spinStorage';

export interface AppliedPromoReward {
  code: string;
  discount: number;
  freeDelivery: boolean;
  giftLabel: string | null;
  giftProduct: {
    id: string;
    name: string;
    basePrice: number;
    imageUrl?: string | null;
  } | null;
  label: string;
  promotionKind?: string | null;
  /** PERCENTAGE | FIXED — used for summary labels like Discount (10%). */
  discountType?: string | null;
  /** Raw promo value (e.g. 10 for 10%, or LKR amount for FIXED). */
  discountValue?: number | null;
  /** Auto-applied offers are locked — no clear / no swap. */
  locked: boolean;
  /** Hide the raw promo code in the UI. */
  hideCode: boolean;
  source: 'auto' | 'manual' | 'spin' | 'carousel';
}

interface PromoState {
  reward: AppliedPromoReward | null;
  /** Shopper hit Remove — do not auto-apply until they pick an offer again. */
  skipAutoApply: boolean;
  dismissedCodes: string[];
  /** Offers removed from the cup — shown again in the available-offer slider. */
  parkedRewards: AppliedPromoReward[];
  setReward: (reward: AppliedPromoReward | null) => void;
  clearReward: () => void;
  /** User clicked Remove on the cup. Stops auto-reapply of that offer. */
  dismissReward: () => void;
  /** Clear only if not locked (or force). */
  clearIfAllowed: (force?: boolean) => boolean;
}

function parkReward(list: AppliedPromoReward[], reward: AppliedPromoReward): AppliedPromoReward[] {
  const code = reward.code.toUpperCase();
  return [reward, ...list.filter((item) => item.code.toUpperCase() !== code)].slice(0, 8);
}

function withoutCode(codes: string[], code: string): string[] {
  const upper = code.toUpperCase();
  return codes.filter((c) => c !== upper);
}

export const usePromoStore = create<PromoState>()(
  persist(
    (set, get) => ({
      reward: null,
      skipAutoApply: false,
      dismissedCodes: [],
      parkedRewards: [],
      setReward: (reward) => {
        if (!reward) {
          set({ reward: null });
          return;
        }
        const code = reward.code.toUpperCase();
        set({
          reward,
          skipAutoApply: false,
          dismissedCodes: withoutCode(get().dismissedCodes, reward.code),
          parkedRewards: get().parkedRewards.filter((item) => item.code.toUpperCase() !== code),
        });
      },
      clearReward: () => set({ reward: null }),
      dismissReward: () => {
        const current = get().reward;
        if (!current) {
          set({ reward: null, skipAutoApply: true });
          return;
        }
        const code = current.code.toUpperCase();
        set({
          reward: null,
          skipAutoApply: true,
          dismissedCodes: Array.from(new Set([...get().dismissedCodes, code])),
          parkedRewards: parkReward(get().parkedRewards, current),
        });
      },
      clearIfAllowed: (force = false) => {
        const current = get().reward;
        if (!current) return true;
        if (!force && current.locked) return false;
        set({ reward: null });
        return true;
      },
    }),
    {
      name: 'bingchun-applied-promo',
      storage: createJSONStorage(() => localStorage),
      // Persist locked auto-apply rewards plus the shopper's "I removed this" choice.
      partialize: (s) => ({
        reward: s.reward?.locked ? s.reward : null,
        skipAutoApply: s.skipAutoApply,
        dismissedCodes: s.dismissedCodes,
        parkedRewards: s.parkedRewards,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.skipAutoApply) {
          state.reward = null;
          return;
        }
        if (!state.reward) return;
        const reward = state.reward;
        if (!reward.locked) {
          state.reward = null;
          return;
        }
        const code = reward.code?.toUpperCase() ?? '';
        if (code.startsWith('SPIN-')) {
          const claim = getSpinClaim();
          if (!claim || claim.claimCode.toUpperCase() !== code) {
            state.reward = null;
          }
        }
      },
    },
  ),
);

export function rewardFromEligibleOffer(
  offer: {
    code: string;
    discount: number;
    freeDelivery: boolean;
    label: string;
    promotionKind?: string | null;
    hideCode?: boolean;
    autoApply?: boolean;
    discountType?: string | null;
    discountValue?: number | null;
    giftLabel?: string | null;
    giftProduct?: AppliedPromoReward['giftProduct'];
  },
  source: AppliedPromoReward['source'] = 'auto',
): AppliedPromoReward {
  const auto = offer.autoApply ?? isAutoApplyPromo(offer);
  return {
    code: offer.code,
    discount: offer.freeDelivery ? 0 : offer.discount,
    freeDelivery: offer.freeDelivery,
    giftLabel: offer.giftLabel ?? null,
    giftProduct: offer.giftProduct ?? null,
    label: offer.label,
    promotionKind: offer.promotionKind,
    discountType: offer.discountType ?? null,
    discountValue: offer.discountValue ?? null,
    locked: source === 'auto' && auto,
    hideCode: source === 'auto',
    source,
  };
}
