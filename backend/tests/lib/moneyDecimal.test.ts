import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  centsNumberToApiString,
  centsToDecimal,
  centsToLkr,
  decimalFieldToCentsNumber,
  decimalFieldToLkrNumber,
  decimalToCentsString,
  decimalToLkrString,
  lkrToCents,
  lkrToDecimal,
} from '../../src/lib/moneyDecimal';
import { serializeDeliveryJobFees } from '../../src/lib/walletApiMoney';

describe('moneyDecimal', () => {
  it('preserves values above INT32 max as cent strings', () => {
    const overInt32 = 2_200_000_000;
    const d = centsToDecimal(overInt32);
    expect(decimalToCentsString(d)).toBe(String(overInt32));
    expect(decimalFieldToCentsNumber(d)).toBe(overInt32);
  });

  it('round-trips Prisma.Decimal from DB-like strings', () => {
    const d = new Prisma.Decimal('2147483648.0000');
    expect(decimalToCentsString(d)).toBe('2147483648');
  });

  it('formats in-process cents as API cent strings', () => {
    expect(centsNumberToApiString(150050)).toBe('150050');
    expect(centsNumberToApiString(150050.9)).toBe('150050');
  });

  it('converts whole LKR to cents at the commerce boundary', () => {
    expect(lkrToCents(1500)).toBe(150_000);
    expect(lkrToCents(882.9)).toBe(88_290);
    expect(centsToLkr(88_290)).toBe(882.9);
  });

  it('stores delivery job fees as integer cents while API stays whole LKR', () => {
    const stored = lkrToDecimal(200);
    expect(decimalFieldToCentsNumber(stored)).toBe(20_000);
    expect(serializeDeliveryJobFees(stored)).toBe('200');
    expect(decimalFieldToLkrNumber(stored)).toBe(200);
    expect(decimalToLkrString(stored)).toBe('200');
  });
});
