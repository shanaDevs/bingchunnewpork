import { describe, expect, it } from 'vitest';
import { buildNetBranchPayoutRows } from '../src/lib/invoice/dataBuilders';
import type { InvoicePayoutStatement } from '../src/lib/invoice/types';

function baseStatement(
  overrides: Partial<InvoicePayoutStatement>,
): InvoicePayoutStatement {
  return {
    totalSaleCents: 0,
    onlineWalletCents: 0,
    commissionCents: 0,
    branchDiscountCents: 0,
    platformDiscountCents: 0,
    jasonDiscountCents: 0,
    costPartnerTotalCents: 0,
    nonReturningRefundsCents: 0,
    platformRefundsCents: 0,
    deliveryRefundsCents: 0,
    totalRefundCents: 0,
    platformDiscountsReportCents: 0,
    platformOwnedPromoCents: 0,
    sharedPlatformDiscountCents: 0,
    platformPaybackCents: 0,
    loyaltyDiscountCents: 0,
    netPlatformAmountCents: 0,
    gatewayFeeCents: 0,
    gatewayRatePct: 1.9,
    bankPenaltyCents: 0,
    bankPenaltyOrderCount: 0,
    jasonPayoutTopUpCents: 0,
    branchNetPayoutCents: 0,
    priorOnlineWalletAmountCents: 0,
    ...overrides,
  };
}

describe('buildNetBranchPayoutRows — negative net platform amount', () => {
  it('credits branch wallet before gateway when net platform amount is negative', () => {
    const statement = baseStatement({
      onlineWalletCents: 534_500,
      priorOnlineWalletAmountCents: 395_300,
      netPlatformAmountCents: -7_262,
      gatewayRatePct: 1.9,
      gatewayFeeCents: 27_830,
      branchNetPayoutCents: 143_679,
    });

    const rows = buildNetBranchPayoutRows(statement);

    const netPlatformRow = rows.find((r) => r.label.includes('Net Platform Amount'));
    expect(netPlatformRow?.label).toBe('+ Net Platform Amount');

    const beforeGatewayRow = rows.find((r) => r.label === 'Branch wallet before gateway');
    expect(beforeGatewayRow?.amount).toBe('LKR 1,464.62');

    const gatewayRow = rows.find((r) =>
      r.label.startsWith('– Payment Gateway Fee'),
    );
    expect(gatewayRow?.amount).toBe('27.83');
  });
});
