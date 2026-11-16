import { describe, expect, it } from 'vitest';
import { rowMatchesPayoutListTab } from './payoutPeriodRowModel';
import type { PayoutPeriodRow } from './payoutPeriodTypes';

function row(
  overrides: Partial<PayoutPeriodRow> & Pick<PayoutPeriodRow, 'status'>,
): PayoutPeriodRow {
  return {
    key: 'k',
    periodFrom: '2026-01-01',
    periodTo: '2026-01-15',
    amountCents: 100,
    orderCount: 1,
    ...overrides,
  };
}

describe('rowMatchesPayoutListTab', () => {
  it('keeps in-review drafts on pending only', () => {
    const inReview = row({ status: 'PAYMENT_PENDING', withdrawal: { id: 'w1' } as PayoutPeriodRow['withdrawal'] });
    expect(rowMatchesPayoutListTab(inReview, 'pending')).toBe(true);
    expect(rowMatchesPayoutListTab(inReview, 'completed')).toBe(false);
  });

  it('shows paid periods on completed only', () => {
    const paid = row({ status: 'PAID', withdrawal: { id: 'w2', status: 'APPROVED' } as PayoutPeriodRow['withdrawal'] });
    expect(rowMatchesPayoutListTab(paid, 'completed')).toBe(true);
    expect(rowMatchesPayoutListTab(paid, 'pending')).toBe(false);
  });
});
