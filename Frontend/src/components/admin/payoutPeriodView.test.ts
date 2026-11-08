import { describe, expect, it } from 'vitest';
import { dueFocusToPeriodView, duePeriodFocusFromRow } from '@/components/admin/payoutPeriodView';
import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';

describe('duePeriodFocusFromRow', () => {
  it('keeps the clicked payouts-due window (not the oldest for the branch)', () => {
    const second: PayoutDueRow = {
      storeId: 'nuge',
      storeName: 'Nugegoda',
      periodFrom: '2026-09-16',
      periodTo: '2026-09-30',
      days: 15,
      netAmountCents: 1_902_671,
      orderCount: 30,
    };
    const focus = duePeriodFocusFromRow(second);
    expect(focus.periodFrom).toBe('2026-09-16');
    expect(focus.periodTo).toBe('2026-09-30');
    expect(focus.netAmountCents).toBe(1_902_671);

    const { withdrawal } = dueFocusToPeriodView(focus);
    expect(withdrawal.periodFrom).toBe('2026-09-16');
    expect(withdrawal.periodTo).toBe('2026-09-30');
  });
});
