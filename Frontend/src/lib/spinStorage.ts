const GUEST_KEY = 'bc_spin_guest_key';
const CLAIM_KEY = 'bc_spin_claim';
const SHOWN_KEY = 'bc_spin_popup_shown';
export const SPIN_POPUP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type SpinOffer = {
  id: string;
  label: string;
  description?: string | null;
  offerType: 'PERCENTAGE' | 'FIXED' | 'FREE_DELIVERY' | 'GIFT' | 'NO_PRIZE';
  discountValue: number;
  color: string;
  sortOrder: number;
  minOrderValue: number;
  giftProductId?: string | null;
  giftProduct?: {
    id: string;
    name: string;
    basePrice: number;
    imageUrl?: string | null;
    slug?: string;
  } | null;
};

export type SpinClaim = {
  resultId: string;
  claimCode: string;
  expiresAt: string;
  offer: SpinOffer;
};

export function getSpinGuestKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    let key = localStorage.getItem(GUEST_KEY);
    if (!key) {
      key = `g_${crypto.randomUUID().replace(/-/g, '')}`;
      localStorage.setItem(GUEST_KEY, key);
    }
    return key;
  } catch {
    return `g_${Date.now()}`;
  }
}

export function shouldShowSpinPopup(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (getSpinClaim()) return false;
    const raw = localStorage.getItem(SHOWN_KEY);
    if (!raw) return true;
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as { until?: number };
      const until = Number(parsed?.until);
      if (Number.isFinite(until)) return Date.now() >= until;
      return true;
    }
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts >= SPIN_POPUP_COOLDOWN_MS;
  } catch {
    return true;
  }
}

export function markSpinPopupShown(untilMs?: number): void {
  if (typeof window === 'undefined') return;
  try {
    const until = untilMs && Number.isFinite(untilMs) && untilMs > Date.now()
      ? untilMs
      : Date.now() + SPIN_POPUP_COOLDOWN_MS;
    localStorage.setItem(SHOWN_KEY, JSON.stringify({ until }));
  } catch {
    /* ignore */
  }
}

const USED_KEY = 'bc_spin_used_until';

/** True after this browser has already used its spin for the current window. */
export function isSpinConsumedLocally(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const until = Number(localStorage.getItem(USED_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function markSpinConsumed(untilMs?: number): void {
  markSpinPopupShown(untilMs);
  if (typeof window === 'undefined') return;
  try {
    const until = untilMs && Number.isFinite(untilMs) && untilMs > Date.now()
      ? untilMs
      : Date.now() + SPIN_POPUP_COOLDOWN_MS;
    localStorage.setItem(USED_KEY, String(until));
  } catch {
    /* ignore */
  }
}

/** Clears a stale client-side lock once the server confirms the customer can spin. */
export function clearSpinConsumed(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(USED_KEY);
  } catch {
    /* ignore */
  }
}

/** Clears the once-per-day popup cooldown (dev / force reopen). */
export function clearSpinPopupShown(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SHOWN_KEY);
  } catch {
    /* ignore */
  }
}

export function saveSpinClaim(claim: SpinClaim): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLAIM_KEY, JSON.stringify(claim));
  } catch {
    /* ignore */
  }
}

export function getSpinClaim(): SpinClaim | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CLAIM_KEY);
    if (!raw) return null;
    const claim = JSON.parse(raw) as SpinClaim;
    if (!claim?.claimCode || !claim.expiresAt) return null;
    if (new Date(claim.expiresAt).getTime() < Date.now()) {
      clearSpinClaim();
      return null;
    }
    return claim;
  } catch {
    return null;
  }
}

export function clearSpinClaim(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CLAIM_KEY);
  } catch {
    /* ignore */
  }
}

export function formatSpinOffer(offer: SpinOffer): string {
  switch (offer.offerType) {
    case 'PERCENTAGE':
      return `${offer.discountValue}% OFF`;
    case 'FIXED':
      return `LKR ${offer.discountValue} OFF`;
    case 'FREE_DELIVERY':
      return 'Free Delivery';
    case 'GIFT':
      return offer.giftProduct?.name ? `Free ${offer.giftProduct.name}` : offer.label;
    case 'NO_PRIZE':
      return 'Try Again';
    default:
      return offer.label;
  }
}
