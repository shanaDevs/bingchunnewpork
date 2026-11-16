import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBranchPayoutsDue,
  formatPayoutReviewDraftError,
  isOldestUnpaidBranchPayoutRow,
  sortBranchPayoutDueRows,
} from '@/lib/branchPayoutsDue';
import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';

function row(
  storeId: string,
  periodFrom: string,
  periodTo: string,
  storeName = storeId,
): PayoutDueRow {
  return {
    storeId,
    storeName,
    periodFrom,
    periodTo,
    days: 15,
    netAmountCents: 100,
    orderCount: 1,
  };
}

describe('fetchBranchPayoutsDue', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws instead of returning an empty page when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'unavailable' }),
      }),
    );

    await expect(fetchBranchPayoutsDue('http://api.test', { page: 1 })).rejects.toThrow(
      /Failed to load payouts due/,
    );
  });

  it('sends storeId when filtering by branch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { items: [], total: 0, allTotal: 0, page: 1, limit: 10, pages: 1 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchBranchPayoutsDue('http://api.test', {
      page: 1,
      storeId: 'store-moratuwa',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/admin/wallet/payouts-due?page=1&limit=10&storeId=store-moratuwa',
      expect.any(Object),
    );
  });

  it('sends the wallet month range on the payouts-due request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { items: [], total: 0, allTotal: 0, page: 1, limit: 10, pages: 1 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchBranchPayoutsDue('http://api.test', {
      page: 1,
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/admin/wallet/payouts-due?page=1&limit=10&from=2026-10-01&to=2026-10-31',
      expect.any(Object),
    );
  });
});

describe('sortBranchPayoutDueRows', () => {
  it('orders by period start, then end, then branch name', () => {
    const sorted = sortBranchPayoutDueRows([
      row('b', '2026-10-07', '2026-10-21', 'Beta'),
      row('a', '2026-09-07', '2026-09-21', 'Alpha'),
      row('a', '2026-09-22', '2026-10-06', 'Alpha'),
    ]);
    expect(sorted.map((r) => `${r.storeId}:${r.periodFrom}`)).toEqual([
      'a:2026-09-07',
      'a:2026-09-22',
      'b:2026-10-07',
    ]);
  });
});

describe('formatPayoutReviewDraftError', () => {
  it('explains out-of-order period starts in plain language', () => {
    const message = formatPayoutReviewDraftError(
      'Payout period must start on 2026-09-20 (the day after your last payout request).',
      'Bing Chun - Nugegoda',
    );
    expect(message).toContain('Sep 20, 2026');
    expect(message).toContain('oldest unpaid period');
  });
});

describe('isOldestUnpaidBranchPayoutRow', () => {
  const all = [
    row('store-1', '2026-09-07', '2026-09-21'),
    row('store-1', '2026-10-07', '2026-10-21'),
    row('store-2', '2026-08-01', '2026-08-15'),
  ];

  it('allows pay only on the oldest period per branch', () => {
    expect(isOldestUnpaidBranchPayoutRow(all[0], all)).toBe(true);
    expect(isOldestUnpaidBranchPayoutRow(all[1], all)).toBe(false);
    expect(isOldestUnpaidBranchPayoutRow(all[2], all)).toBe(true);
  });
});
