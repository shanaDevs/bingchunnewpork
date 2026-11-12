import { describe, expect, it } from 'vitest';

import { platformPayoutInvoiceSettlementId } from '@/lib/platformPayoutInvoice';

describe('platformPayoutInvoiceSettlementId', () => {
  it('uses platformReceivableSettlementId when present', () => {
    expect(
      platformPayoutInvoiceSettlementId({
        id: 'withdrawal-1',
        platformReceivableSettlementId: 'settlement-9',
      }),
    ).toBe('settlement-9');
  });

  it('uses row id for commission settlement platform history rows', () => {
    expect(
      platformPayoutInvoiceSettlementId({
        id: 'settlement-abc',
        payoutSource: 'commissionSettlement',
      }),
    ).toBe('settlement-abc');
  });

  it('parses settlement id from platformInvoiceUrl', () => {
    expect(
      platformPayoutInvoiceSettlementId({
        id: 'ignored',
        platformInvoiceUrl: '/api/admin/invoices/settlement/settlement-xyz/platform-provider',
      }),
    ).toBe('settlement-xyz');
  });

  it('returns null when no platform invoice is available', () => {
    expect(
      platformPayoutInvoiceSettlementId({
        id: 'withdrawal-only',
        payoutSource: 'branchWithdrawal',
      }),
    ).toBeNull();
  });
});
