import { describe, expect, it } from 'vitest';
import {
  filterWithdrawalsForCompletedPayoutTab,
  type WithdrawalRow,
} from './WalletWithdrawalTable';

const base: Omit<WithdrawalRow, 'id' | 'status'> = {
  amount: 100,
  remarks: null,
  rejectionReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('filterWithdrawalsForCompletedPayoutTab', () => {
  it('excludes IN_REVIEW from completed payout summary list', () => {
    const rows: WithdrawalRow[] = [
      { ...base, id: 'a', status: 'IN_REVIEW' },
      { ...base, id: 'b', status: 'REJECTED' },
      { ...base, id: 'c', status: 'APPROVED' },
    ];
    expect(filterWithdrawalsForCompletedPayoutTab(rows).map((r) => r.id)).toEqual(['b', 'c']);
  });
});
