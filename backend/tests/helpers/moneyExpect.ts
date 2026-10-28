import { expect } from 'vitest';
import {
  centsNumberToApiString,
  centsToDecimal,
  decimalFieldToCentsNumber,
  lkrToDecimal,
} from '../../src/lib/moneyDecimal';

/** Cent string as returned by wallet/platform admin APIs. */
export function centsApi(n: number): string {
  return centsNumberToApiString(n);
}

export function expectDbCents(actual: unknown, cents: number) {
  expect(decimalFieldToCentsNumber(actual)).toBe(cents);
}

export { centsToDecimal, lkrToDecimal };
