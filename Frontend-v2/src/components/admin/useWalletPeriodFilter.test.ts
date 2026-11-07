import { describe, expect, it } from 'vitest';

import {
  adminWalletOverviewQueryKey,
  resolveAppliedFromUrl,
} from '@/components/admin/useWalletPeriodFilter';

describe('resolveAppliedFromUrl', () => {
  it('returns null when dates are missing or invalid', () => {
    expect(resolveAppliedFromUrl(null, null)).toBeNull();
    expect(resolveAppliedFromUrl('2026-10-01', null)).toBeNull();
    expect(resolveAppliedFromUrl('bad', '2026-10-01')).toBeNull();
    expect(resolveAppliedFromUrl('2026-10-15', '2026-10-01')).toBeNull();
  });

  it('returns applied custom period for arbitrary valid range', () => {
    const applied = resolveAppliedFromUrl('2026-09-10', '2026-09-20');
    expect(applied).toEqual({
      from: '2026-09-10',
      to: '2026-09-20',
      mode: 'custom',
      monthKey: null,
    });
  });

  it('returns month mode for full calendar month', () => {
    const applied = resolveAppliedFromUrl('2026-08-01', '2026-08-31');
    expect(applied?.mode).toBe('month');
    expect(applied?.monthKey).toBe('2026-08');
  });
});

describe('adminWalletOverviewQueryKey', () => {
  it('keys by from and to strings', () => {
    expect(adminWalletOverviewQueryKey('2026-10-01', '2026-10-15')).toEqual([
      'admin-wallet-overview',
      '2026-10-01',
      '2026-10-15',
    ]);
    expect(adminWalletOverviewQueryKey(null, null)).toEqual(['admin-wallet-overview', '', '']);
  });
});
