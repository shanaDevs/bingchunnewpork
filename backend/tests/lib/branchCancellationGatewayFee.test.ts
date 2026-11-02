import { describe, expect, it } from 'vitest';
import {
  GATEWAY_PENALTY_LKR,
  isBranchInitiatedRefund,
  resolveBranchCancellationGatewayFeeLkr,
} from '../../src/lib/refundPaymentStructure';

describe('branch cancellation gateway fee helpers', () => {
  it('treats BRANCH_ADMIN refunds as branch-initiated', () => {
    expect(
      isBranchInitiatedRefund({
        submittedBy: 'BRANCH_ADMIN',
        order: { cancelledBy: null },
      }),
    ).toBe(true);
  });

  it('treats staff-cancelled orders as branch-initiated', () => {
    expect(
      isBranchInitiatedRefund({
        submittedBy: 'CUSTOMER',
        order: { cancelledBy: 'Cashier A' },
      }),
    ).toBe(true);
  });

  it('excludes customer self-cancellations', () => {
    expect(
      isBranchInitiatedRefund({
        submittedBy: 'CUSTOMER',
        order: { cancelledBy: 'customer' },
      }),
    ).toBe(false);
  });

  it('uses stored additionalGatewayFee when present', () => {
    expect(
      resolveBranchCancellationGatewayFeeLkr({
        submittedBy: 'BRANCH_ADMIN',
        additionalGatewayFee: 200,
        order: { cancelledBy: null },
      }),
    ).toBe(200);
  });

  it('defaults to penalty when branch-initiated and fee is missing', () => {
    expect(
      resolveBranchCancellationGatewayFeeLkr({
        submittedBy: 'BRANCH_ADMIN',
        additionalGatewayFee: null,
        order: { cancelledBy: 'Branch Admin' },
      }),
    ).toBe(GATEWAY_PENALTY_LKR);
  });

  it('returns zero for customer cancellations', () => {
    expect(
      resolveBranchCancellationGatewayFeeLkr({
        submittedBy: 'CUSTOMER',
        additionalGatewayFee: null,
        order: { cancelledBy: 'customer' },
      }),
    ).toBe(0);
  });
});
