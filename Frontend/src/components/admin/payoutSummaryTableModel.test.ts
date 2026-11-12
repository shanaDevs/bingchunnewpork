import { describe, expect, it } from 'vitest';
import type { PayoutPeriodRow } from './payoutPeriodTypes';
import type { WithdrawalRow } from './WalletWithdrawalTable';
import {
  buildPayoutSummaryRecords,
  findPeriodRowForWithdrawal,
  isPaidOrRejectedWithdrawal,
} from './payoutSummaryTableModel';

function period(
  overrides: Partial<PayoutPeriodRow> & Pick<PayoutPeriodRow, 'status' | 'key'>,
): PayoutPeriodRow {
  return {
    periodFrom: '2026-09-06',
    periodTo: '2026-09-21',
    amountCents: 100,
    orderCount: 1,
    ...overrides,
  };
}

function withdrawal(
  overrides: Partial<WithdrawalRow> & Pick<WithdrawalRow, 'id' | 'status'>,
): WithdrawalRow {
  return {
    amount: 100,
    remarks: null,
    rejectionReason: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    periodFrom: '2026-09-06T00:00:00.000Z',
    periodTo: '2026-09-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('isPaidOrRejectedWithdrawal', () => {
  it('keeps paid and rejected records only', () => {
    expect(isPaidOrRejectedWithdrawal({ status: 'APPROVED' })).toBe(true);
    expect(isPaidOrRejectedWithdrawal({ status: 'REJECTED' })).toBe(true);
    expect(isPaidOrRejectedWithdrawal({ status: 'IN_REVIEW' })).toBe(false);
    expect(isPaidOrRejectedWithdrawal({ status: 'PENDING' })).toBe(false);
  });
});

describe('findPeriodRowForWithdrawal', () => {
  it('matches on calendar dates even when withdrawal dates are ISO timestamps', () => {
    const rows = [period({ key: 'p1', status: 'PAID' })];
    expect(findPeriodRowForWithdrawal(rows, withdrawal({ id: 'w1', status: 'APPROVED' }) )?.key).toBe(
      'p1',
    );
  });
});

describe('buildPayoutSummaryRecords', () => {
  const pendingPeriod = period({
    key: 'pending',
    status: 'PENDING',
    periodFrom: '2026-09-21',
    periodTo: '2026-10-06',
  });
  const paidPeriod = period({
    key: 'paid',
    status: 'PAID',
    withdrawal: withdrawal({ id: 'paid-w', status: 'APPROVED' }),
  });

  it('uses period rows on the pending tab', () => {
    const records = buildPayoutSummaryRecords({
      listTab: 'pending',
      periodTabRows: [pendingPeriod],
      allPeriodRows: [pendingPeriod, paidPeriod],
      withdrawals: [withdrawal({ id: 'rej', status: 'REJECTED' })],
    });
    expect(records.map((row) => row.key)).toEqual(['pending']);
  });

  it('lists each paid and rejected payout as its own completed row', () => {
    const records = buildPayoutSummaryRecords({
      listTab: 'completed',
      periodTabRows: [paidPeriod],
      allPeriodRows: [pendingPeriod, paidPeriod],
      withdrawals: [
        withdrawal({ id: 'paid-w', status: 'APPROVED' }),
        withdrawal({ id: 'rej-1', status: 'REJECTED' }),
        withdrawal({ id: 'rej-2', status: 'REJECTED', amount: 90 }),
        withdrawal({ id: 'draft', status: 'IN_REVIEW' }),
      ],
    });
    expect(records.map((row) => row.key)).toEqual(['paid-w', 'rej-1', 'rej-2']);
    expect(records[0]?.periodRow?.key).toBe('paid');
  });

  it('falls back to paid period rows when withdrawals are not provided', () => {
    const records = buildPayoutSummaryRecords({
      listTab: 'completed',
      periodTabRows: [paidPeriod],
      allPeriodRows: [paidPeriod],
    });
    expect(records.map((row) => row.key)).toEqual(['paid']);
  });
});
