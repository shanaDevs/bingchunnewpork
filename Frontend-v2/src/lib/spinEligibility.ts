import { api } from '@/lib/api';
import { clearSpinConsumed, getSpinGuestKey } from '@/lib/spinStorage';
import {
  DEFAULT_SPIN_DISPLAY,
  isSpinPopupPath,
  parseSpinDisplay,
  type SpinDisplaySettings,
} from '@/lib/spinDisplay';

export type SpinEligibility = {
  enabled: boolean;
  canSpin: boolean;
  reason?: string | null;
  nextSpinAt?: string | null;
  spinsUsed?: number;
  spinsAllowed?: number;
  spinsRemaining?: number;
  spinDurationSeconds?: number;
  spinWindowHours?: number;
  loyaltySpin?: {
    enabled: boolean;
    gatesSpin?: boolean;
    unlocked: boolean;
    requiredOrders: number;
    validOrderCount: number;
    ordersNeeded: number;
    minOrderAmount: number;
    winChanceNumerator: number;
    winChanceDenominator: number;
  } | null;
  display?: SpinDisplaySettings;
};

function resolveDisplay(eligibility: SpinEligibility | null | undefined): SpinDisplaySettings {
  return parseSpinDisplay(eligibility?.display ?? DEFAULT_SPIN_DISPLAY);
}

function loyaltyGatesSpin(eligibility: SpinEligibility | null | undefined): boolean {
  const spin = eligibility?.loyaltySpin;
  if (!spin) return false;
  if (typeof spin.gatesSpin === 'boolean') return spin.gatesSpin;
  return Boolean(spin.enabled);
}

export function formatLoyaltySpinProgress(
  loyaltySpin: NonNullable<SpinEligibility['loyaltySpin']>,
): string {
  if (!loyaltySpin.unlocked) {
    if (loyaltySpin.ordersNeeded > 0) {
      return `${loyaltySpin.validOrderCount}/${loyaltySpin.requiredOrders} qualifying orders — ${loyaltySpin.ordersNeeded} more to unlock`;
    }
    return `Your ${loyaltySpin.requiredOrders}rd order must be at least LKR ${loyaltySpin.minOrderAmount.toLocaleString()} to unlock`;
  }
  return `${loyaltySpin.winChanceNumerator} in ${loyaltySpin.winChanceDenominator} spins win a special prize`;
}

export function loyaltySpinSubtitle(
  loyaltySpin: NonNullable<SpinEligibility['loyaltySpin']>,
): string {
  if (!loyaltySpin.unlocked) {
    if (loyaltySpin.ordersNeeded > 0) {
      return `Complete ${loyaltySpin.ordersNeeded} more order${loyaltySpin.ordersNeeded === 1 ? '' : 's'} to unlock Spin & Win.`;
    }
    return `Place your ${loyaltySpin.requiredOrders}rd order (min LKR ${loyaltySpin.minOrderAmount.toLocaleString()}) to unlock the wheel.`;
  }
  return `You're in! ${loyaltySpin.winChanceNumerator} in ${loyaltySpin.winChanceDenominator} chance to win a prize on each spin.`;
}

/**
 * Show spin FAB, header button, and auto-popup only when the customer may spin now.
 * Guests included: the API answers canSpin false for them when the admin's criteria need a sign-in.
 */
export function shouldShowSpinEntryPoints(
  eligibility: SpinEligibility | null | undefined,
): boolean {
  if (!eligibility?.enabled) return false;
  if (loyaltyGatesSpin(eligibility) && !eligibility.loyaltySpin?.unlocked) {
    return false;
  }
  return eligibility.canSpin;
}

export function shouldShowSpinHeaderButton(
  eligibility: SpinEligibility | null | undefined,
): boolean {
  return shouldShowSpinEntryPoints(eligibility) && resolveDisplay(eligibility).showHeaderButton;
}

export function shouldShowSpinFab(
  eligibility: SpinEligibility | null | undefined,
): boolean {
  return shouldShowSpinEntryPoints(eligibility) && resolveDisplay(eligibility).showFab;
}

/** Home (or configured pages) auto popup when the customer can spin. */
export function shouldAutoOpenSpinPopup(
  eligibility: SpinEligibility | null | undefined,
  opts?: { pathname?: string },
): boolean {
  if (!shouldShowSpinEntryPoints(eligibility)) return false;
  const display = resolveDisplay(eligibility);
  if (!display.autoPopup) return false;
  if (opts?.pathname && !isSpinPopupPath(opts.pathname, display.popupPages)) return false;
  if (loyaltyGatesSpin(eligibility)) {
    if (!eligibility?.loyaltySpin?.unlocked) return false;
  }
  return true;
}

export function formatSpinCooldownMessage(
  nextSpinAt?: string | null,
  fallback?: string,
): string {
  if (fallback?.trim()) return fallback.trim();
  if (nextSpinAt) {
    const at = new Date(nextSpinAt);
    if (!Number.isNaN(at.getTime())) {
      return `You can spin again after ${at.toLocaleString()}`;
    }
  }
  return 'You have already used your spins. Come back later!';
}

export const SPIN_ELIGIBILITY_QUERY_KEY = ['spin-eligibility'] as const;

export function isSpinUiHidden(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname === '/account/login' ||
    pathname === '/account/register' ||
    pathname.startsWith('/mock-payment') ||
    pathname.startsWith('/checkout')
  );
}

export async function fetchSpinEligibility(
  isAuthenticated: boolean,
  storeId?: string | null,
): Promise<SpinEligibility> {
  const guestKey = getSpinGuestKey();
  const params = new URLSearchParams();
  if (guestKey) params.set('guestKey', guestKey);
  if (storeId) params.set('storeId', storeId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const eligibility = await api.get<SpinEligibility>(`/spin/eligibility${qs}`, isAuthenticated);

  // The API is authoritative. This releases a stale local cooldown when a
  // customer has since completed the configured loyalty criteria.
  if (eligibility.enabled && eligibility.canSpin) {
    clearSpinConsumed();
  }

  return eligibility;
}
