import { describe, expect, it } from 'vitest';
import { enrichWalletRow } from '../../src/lib/walletService';

const baseWallet = {
  id: 'wallet-1',
  storeId: 'store-1',
  balance: 50_000,
  totalEarnings: 80_000,
  totalWithdrawn: 20_000,
  lastSettledAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('enrichWalletRow', () => {
  it('computes available balance from net transferable earnings minus pending withdrawals', () => {
    expect(enrichWalletRow(baseWallet, 5_000, 80_000)).toEqual(
      expect.objectContaining({
        storeId: 'store-1',
        currentBalance: 50_000,
        netTransferableEarnings: 80_000,
        // remainingNet = 80000 - 20000 = 60000; available = 60000 - 5000
        availableBalance: 55_000,
      }),
    );
  });

  it('falls back to totalEarnings when net transferable is omitted', () => {
    expect(enrichWalletRow(baseWallet, 0).netTransferableEarnings).toBe(80_000);
    expect(enrichWalletRow(baseWallet, 0).availableBalance).toBe(60_000);
  });

  it('never returns a negative available balance', () => {
    expect(enrichWalletRow(baseWallet, 100_000, 30_000).availableBalance).toBe(0);
    expect(enrichWalletRow({ ...baseWallet, totalWithdrawn: 90_000 }, 0, 80_000).availableBalance).toBe(0);
  });
});
