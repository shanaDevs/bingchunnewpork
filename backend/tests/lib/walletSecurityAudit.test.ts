import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deliveryPayoutAmountCents,
  logWalletSecurityEvent,
  logWalletSecurityEventFromRequest,
} from '../../src/lib/walletSecurityAudit';
import { logger } from '../../src/utils/logger';

vi.mock('../../src/lib/walletSecurityAuditSchema', () => ({
  insertWalletSecurityAuditRow: vi.fn().mockResolvedValue(undefined),
}));

import { insertWalletSecurityAuditRow } from '../../src/lib/walletSecurityAuditSchema';

describe('logWalletSecurityEvent', () => {
  beforeEach(() => {
    vi.mocked(insertWalletSecurityAuditRow).mockClear();
  });

  it('persists audit rows', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    logWalletSecurityEvent({
      event: 'wallet.withdrawal.approve',
      outcome: 'success',
      withdrawalId: 'w-1',
    });
    expect(insertWalletSecurityAuditRow).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'wallet.withdrawal.approve', withdrawalId: 'w-1' }),
    );
    spy.mockRestore();
  });

  it('emits structured audit metadata without secrets', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    logWalletSecurityEvent({
      event: 'wallet.adjustment',
      outcome: 'success',
      actorId: 'admin-1',
      actorRole: 'SYSTEM_ADMIN',
      storeId: 'store-1',
      amountCents: 5000,
      transactionId: 'txn-1',
      clientIp: '127.0.0.1',
    });
    expect(spy).toHaveBeenCalledWith('[wallet-security]', {
      kind: 'wallet_security_audit',
      event: 'wallet.adjustment',
      outcome: 'success',
      actorId: 'admin-1',
      actorRole: 'SYSTEM_ADMIN',
      storeId: 'store-1',
      amountCents: 5000,
      transactionId: 'txn-1',
      clientIp: '127.0.0.1',
    });
    spy.mockRestore();
  });

  it('logWalletSecurityEventFromRequest fills actor and IP', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    logWalletSecurityEventFromRequest(
      { ip: '10.0.0.1', socket: {} },
      { sub: 'admin-2', role: 'SYSTEM_ADMIN' },
      { event: 'delivery.payout.pay', payoutId: 'p-1', amountCents: 1000 },
    );
    expect(spy).toHaveBeenCalledWith(
      '[wallet-security]',
      expect.objectContaining({
        event: 'delivery.payout.pay',
        actorId: 'admin-2',
        clientIp: '10.0.0.1',
        payoutId: 'p-1',
      }),
    );
    spy.mockRestore();
  });
});

describe('deliveryPayoutAmountCents', () => {
  it('rounds LKR to integer cents', () => {
    expect(deliveryPayoutAmountCents(882.9)).toBe(88290);
  });
});
