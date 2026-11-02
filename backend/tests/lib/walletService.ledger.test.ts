import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    walletTransaction: {
      findMany: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    storeWallet: {
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { refreshWalletCaches } from '../../src/lib/walletService';
import { centsToDecimal } from '../helpers/moneyExpect';

const storeId = 'store-ledger-1';

describe('refreshWalletCaches — FIN-002 ledger immutability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([
      {
        id: 'tx-1',
        amount: 50_000,
        balanceAfter: 40_000,
        type: 'ORDER_PAYMENT',
      },
    ] as never);
    vi.mocked(prisma.walletTransaction.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 50_000 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: 0 } } as never);
    vi.mocked(prisma.storeWallet.upsert).mockResolvedValue({
      id: 'wallet-1',
      storeId,
      balance: 50_000,
      totalEarnings: 50_000,
      totalWithdrawn: 0,
      lastSettledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  it('does not rewrite historical walletTransaction.balanceAfter values', async () => {
    await refreshWalletCaches(storeId);

    expect(prisma.walletTransaction.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[wallet-audit] balanceAfter mismatch on tx tx-1'),
    );
    expect(prisma.storeWallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ balance: centsToDecimal(50_000) }),
      }),
    );
  });
});
