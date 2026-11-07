import { describe, expect, it } from 'vitest';
import {
  shouldAutoOpenSpinPopup,
  shouldShowSpinEntryPoints,
  shouldShowSpinFab,
  shouldShowSpinHeaderButton,
  type SpinEligibility,
} from './spinEligibility';

const loyaltyBase = {
  requiredOrders: 3,
  validOrderCount: 3,
  ordersNeeded: 0,
  minOrderAmount: 1000,
  winChanceNumerator: 1,
  winChanceDenominator: 10,
};

const loyaltyLocked: SpinEligibility = {
  enabled: true,
  canSpin: false,
  loyaltySpin: {
    ...loyaltyBase,
    enabled: true,
    gatesSpin: true,
    unlocked: false,
    validOrderCount: 1,
    ordersNeeded: 2,
  },
};

const loyaltyUnlocked: SpinEligibility = {
  enabled: true,
  canSpin: true,
  loyaltySpin: {
    ...loyaltyBase,
    enabled: true,
    gatesSpin: true,
    unlocked: true,
  },
};

describe('shouldAutoOpenSpinPopup', () => {
  it('blocks auto popup when loyalty journey criterion is locked', () => {
    expect(shouldAutoOpenSpinPopup(loyaltyLocked)).toBe(false);
    expect(shouldShowSpinEntryPoints(loyaltyLocked)).toBe(false);
  });

  it('allows auto popup when loyalty journey is unlocked', () => {
    expect(shouldAutoOpenSpinPopup(loyaltyUnlocked)).toBe(true);
  });

  it('allows auto popup for a regular spin, signed in or not', () => {
    const regular: SpinEligibility = { enabled: true, canSpin: true, loyaltySpin: null };
    expect(shouldAutoOpenSpinPopup(regular)).toBe(true);
  });

  it('hides the wheel from a guest when the admin requires sign-in', () => {
    // What the API answers a guest under the REQUIRE_LOGIN criterion.
    const guest: SpinEligibility = {
      enabled: true,
      canSpin: false,
      reason: 'Sign in to spin the wheel',
      loyaltySpin: null,
    };
    expect(shouldShowSpinEntryPoints(guest)).toBe(false);
    expect(shouldShowSpinHeaderButton(guest)).toBe(false);
    expect(shouldShowSpinFab(guest)).toBe(false);
    expect(shouldAutoOpenSpinPopup(guest)).toBe(false);
  });

  it('shows the wheel when journey exists but admin did not add it as a spin criterion', () => {
    const openWheel: SpinEligibility = {
      enabled: true,
      canSpin: true,
      loyaltySpin: {
        ...loyaltyBase,
        enabled: true,
        gatesSpin: false,
        unlocked: false,
        validOrderCount: 1,
        ordersNeeded: 2,
      },
    };
    expect(shouldShowSpinEntryPoints(openWheel)).toBe(true);
    expect(shouldAutoOpenSpinPopup(openWheel)).toBe(true);
  });

  it('respects admin auto-popup off and page targeting', () => {
    const eligibility: SpinEligibility = {
      enabled: true,
      canSpin: true,
      loyaltySpin: null,
      display: {
        autoPopup: false,
        showHeaderButton: true,
        showFab: true,
        popupPages: 'HOME',
        loseAutoHideSeconds: 2.5,
      },
    };
    expect(shouldAutoOpenSpinPopup(eligibility, { pathname: '/' })).toBe(false);

    const onOrder: SpinEligibility = {
      ...eligibility,
      display: { ...eligibility.display!, autoPopup: true, popupPages: 'HOME' },
    };
    expect(shouldAutoOpenSpinPopup(onOrder, { pathname: '/order/BC1' })).toBe(false);
    expect(
      shouldAutoOpenSpinPopup(
        { ...onOrder, display: { ...onOrder.display!, popupPages: 'HOME_AND_ORDER' } },
        { pathname: '/order/BC1' },
      ),
    ).toBe(true);
  });
});
