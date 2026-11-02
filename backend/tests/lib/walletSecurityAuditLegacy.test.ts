import { describe, expect, it } from 'vitest';
import { mergeWalletSecurityAuditRows } from '../../src/lib/walletSecurityAuditLegacy';
import type { WalletSecurityAuditRow } from '../../src/lib/walletSecurityAuditSchema';

function row(id: string, createdAt: string): WalletSecurityAuditRow {
  return {
    id,
    event: 'wallet.sync',
    outcome: 'success',
    actorId: null,
    actorRole: null,
    storeId: null,
    amountCents: null,
    reference: null,
    withdrawalId: null,
    transactionId: null,
    payoutId: null,
    clientIp: null,
    reason: null,
    orderNumber: null,
    createdAt: new Date(createdAt),
  };
}

describe('mergeWalletSecurityAuditRows', () => {
  it('merges supplemental rows and paginates by newest first', () => {
    const primary = [row('a', '2026-01-03T12:00:00Z')];
    const supplemental = [row('b', '2026-01-04T12:00:00Z')];
    const result = mergeWalletSecurityAuditRows(primary, supplemental, 1, 10);
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('does not duplicate rows with the same id', () => {
    const primary = [row('same', '2026-01-01T12:00:00Z')];
    const supplemental = [row('same', '2026-01-02T12:00:00Z')];
    const result = mergeWalletSecurityAuditRows(primary, supplemental, 1, 10);
    expect(result.total).toBe(1);
  });
});
