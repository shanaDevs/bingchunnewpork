import { describe, expect, it } from 'vitest';
import {
  shouldAutoOpenSpinPopup,
  shouldShowSpinEntryPoints,
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
    expect(shouldAutoOpenSpinPopup(loyaltyLocked, { isAuthenticated: true })).toBe(false);
    expect(shouldShowSpinEntryPoints(loyaltyLocked)).toBe(false);
  });

  it('blocks auto popup for guests when loyalty journey gates the wheel', () => {
    expect(shouldAutoOpenSpinPopup(loyaltyUnlocked, { isAuthenticated: false })).toBe(false);
  });

  it('allows auto popup when loyalty journey is unlocked and user is signed in', () => {
    expect(shouldAutoOpenSpinPopup(loyaltyUnlocked, { isAuthenticated: true })).toBe(true);
  });

  it('blocks auto popup for signed-out users even for regular spin', () => {
    const regular: SpinEligibility = { enabled: true, canSpin: true, loyaltySpin: null };
    expect(shouldAutoOpenSpinPopup(regular, { isAuthenticated: false })).toBe(false);
  });

  it('allows auto popup for regular spin when signed in', () => {
    const regular: SpinEligibility = { enabled: true, canSpin: true, loyaltySpin: null };
    expect(shouldAutoOpenSpinPopup(regular, { isAuthenticated: true })).toBe(true);
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
    expect(shouldAutoOpenSpinPopup(openWheel, { isAuthenticated: false })).toBe(false);
    expect(shouldAutoOpenSpinPopup(openWheel, { isAuthenticated: true })).toBe(true);
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
    expect(shouldAutoOpenSpinPopup(eligibility, { isAuthenticated: true, pathname: '/' })).toBe(false);

    const onOrder: SpinEligibility = {
      ...eligibility,
      display: { ...eligibility.display!, autoPopup: true, popupPages: 'HOME' },
    };
    expect(shouldAutoOpenSpinPopup(onOrder, { isAuthenticated: true, pathname: '/order/BC1' })).toBe(false);
    expect(
      shouldAutoOpenSpinPopup(
        { ...onOrder, display: { ...onOrder.display!, popupPages: 'HOME_AND_ORDER' } },
        { isAuthenticated: true, pathname: '/order/BC1' },
      ),
    ).toBe(true);
  });
});
