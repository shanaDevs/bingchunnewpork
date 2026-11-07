import { playCartAddSound } from '@/lib/uiSounds';
import { cupFillFromCount } from '@/lib/cupFill';
import { DEFAULT_LOYALTY_SETTINGS, estimateLoyaltyPoints } from '@/lib/loyalty';

export const CUP_POUR_EVENT = 'bc-cup-pour';
export const CART_CELEBRATION_EVENT = 'bc-cart-celebration';
export const LOYALTY_FLOAT_EVENT = 'bc-loyalty-float';
export const LOYALTY_REWARDS_PULSE_EVENT = 'bc-loyalty-rewards-pulse';

/** Pour overlay duration — keep in sync with CupPourOverlay VISIBLE_MS */
const POUR_PHASE_MS = 1500;
/** Mascot bubble starts after pour fades */
const CELEBRATION_DELAY_MS = POUR_PHASE_MS + 200;
/** Points fly to rewards after mascot celebration */
const LOYALTY_DELAY_MS = CELEBRATION_DELAY_MS + 1400;

export interface CartCelebrationDetail {
  productName?: string;
  itemCountBefore?: number;
  itemCountAfter?: number;
  fillBefore?: number;
  fillAfter?: number;
}

export interface CupPourDetail {
  productName?: string;
  fillBefore: number;
  fillAfter: number;
  itemCountBefore: number;
  itemCountAfter: number;
}

export interface LoyaltyFloatDetail {
  direction: 'add' | 'remove';
  pointsEarned: number;
  pointsDelta: number;
  subtotal: number;
  minOrderToEarn: number;
}

let feedbackSeq = 0;
const feedbackTimers: ReturnType<typeof setTimeout>[] = [];

function clearPendingCartFeedback(): void {
  feedbackSeq += 1;
  for (const timer of feedbackTimers) clearTimeout(timer);
  feedbackTimers.length = 0;
}

function scheduleFeedback(delayMs: number, seq: number, run: () => void): void {
  const timer = setTimeout(() => {
    if (seq !== feedbackSeq) return;
    run();
  }, delayMs);
  feedbackTimers.push(timer);
}

export function triggerLoyaltyPointsFloat(
  direction: 'add' | 'remove',
  subtotalBefore: number,
  subtotalAfter: number,
): void {
  if (typeof window === 'undefined') return;
  if (subtotalBefore === subtotalAfter) return;

  const pointsBefore = estimateLoyaltyPoints(subtotalBefore);
  const pointsAfter = estimateLoyaltyPoints(subtotalAfter);

  window.dispatchEvent(
    new CustomEvent<LoyaltyFloatDetail>(LOYALTY_FLOAT_EVENT, {
      detail: {
        direction,
        pointsEarned: pointsAfter,
        pointsDelta: pointsAfter - pointsBefore,
        subtotal: subtotalAfter,
        minOrderToEarn: DEFAULT_LOYALTY_SETTINGS.minOrderToEarn,
      },
    }),
  );
}

/**
 * Staged add-to-cart feedback — one moment at a time:
 * 1) pour overlay + navbar cup pulse + sound
 * 2) mascot celebration bubble
 * 3) loyalty points float to rewards
 */
export function notifyCartItemAdded(
  productName: string,
  itemCountBefore: number,
  itemCountAfter: number,
  subtotalBefore: number,
  subtotalAfter: number,
): void {
  if (typeof window === 'undefined') return;

  clearPendingCartFeedback();
  const seq = feedbackSeq;

  playCartAddSound();

  const fillBefore = cupFillFromCount(itemCountBefore);
  const fillAfter = cupFillFromCount(itemCountAfter);

  const pourDetail: CupPourDetail = {
    productName,
    fillBefore,
    fillAfter,
    itemCountBefore,
    itemCountAfter,
  };

  const celebrationDetail: CartCelebrationDetail = {
    productName,
    itemCountBefore,
    itemCountAfter,
    fillBefore,
    fillAfter,
  };

  window.dispatchEvent(new CustomEvent<CupPourDetail>(CUP_POUR_EVENT, { detail: pourDetail }));

  scheduleFeedback(CELEBRATION_DELAY_MS, seq, () => {
    window.dispatchEvent(
      new CustomEvent<CartCelebrationDetail>(CART_CELEBRATION_EVENT, { detail: celebrationDetail }),
    );
  });

  if (subtotalBefore !== subtotalAfter) {
    scheduleFeedback(LOYALTY_DELAY_MS, seq, () => {
      triggerLoyaltyPointsFloat('add', subtotalBefore, subtotalAfter);
    });
  }
}

/** @deprecated Use notifyCartItemAdded */
export function triggerCartCelebration(
  productName?: string,
  itemCountBefore?: number,
  itemCountAfter?: number,
  subtotalBefore?: number,
  subtotalAfter?: number,
): void {
  if (
    !productName ||
    itemCountBefore == null ||
    itemCountAfter == null ||
    subtotalBefore == null ||
    subtotalAfter == null
  ) {
    return;
  }
  notifyCartItemAdded(productName, itemCountBefore, itemCountAfter, subtotalBefore, subtotalAfter);
}
