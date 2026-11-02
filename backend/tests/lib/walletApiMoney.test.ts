import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  serializeStoreWallet,
  serializeWalletSummary,
  serializeWithdrawal,
  walletBalanceCents,
  withdrawalAmountCents,
} from '../../src/lib/walletApiMoney';

describe('walletApiMoney serialization', () => {
  it('serializes wallet decimals as cent strings', () => {
    const wallet = {
      id: 'w1',
      storeId: 's1',
      balance: new Prisma.Decimal('150050'),
      totalEarnings: new Prisma.Decimal('200000'),
      totalWithdrawn: new Prisma.Decimal('49950'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const serialized = serializeStoreWallet(wallet as never);
    expect(serialized.balance).toBe('150050');
    expect(serialized.currentBalance).toBe('150050');
    expect(serialized.totalWithdrawn).toBe('49950');
  });

  it('serializes summary and withdrawal amounts as strings', () => {
    expect(
      serializeWalletSummary({
        storeId: 's1',
        currentBalance: 100,
        totalEarnings: 200,
        grossLedgerCredits: 220,
        netTransferableEarnings: 180,
        totalWithdrawn: 50,
        pendingWithdrawalTotal: 10,
        availableBalance: 120,
      }).availableBalance,
    ).toBe('120');

    const serialized = serializeWithdrawal({
      id: 'wd1',
      amount: new Prisma.Decimal('9999'),
      proofUrl: 'https://spaces.example/settlements/store/slip.pdf',
    } as never);
    expect(serialized.amount).toBe('9999');
    expect(serialized.hasProof).toBe(true);
    expect(serialized.proofUrl).toBeNull();
  });
});

describe('walletApiMoney legacy cents accessors', () => {
  it('reads wallet balance and withdrawal amount as safe integers', () => {
    expect(walletBalanceCents({ balance: new Prisma.Decimal('150050') })).toBe(150050);
    expect(withdrawalAmountCents({ amount: new Prisma.Decimal('2500') })).toBe(2500);
  });
});
