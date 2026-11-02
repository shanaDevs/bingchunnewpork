import { describe, expect, it } from 'vitest';
import {
  isPlaceholderCustomerName,
  resolveCustomerDisplayName,
  resolveOrderContactName,
} from '../../src/lib/customerName';

describe('isPlaceholderCustomerName', () => {
  it('treats Guest and other OTP defaults as placeholders', () => {
    expect(isPlaceholderCustomerName('Guest')).toBe(true);
    expect(isPlaceholderCustomerName('  guest  ')).toBe(true);
    expect(isPlaceholderCustomerName('Walk-in')).toBe(true);
    expect(isPlaceholderCustomerName('Customer')).toBe(true);
    expect(isPlaceholderCustomerName('')).toBe(true);
    expect(isPlaceholderCustomerName(null)).toBe(true);
  });

  it('accepts a real name', () => {
    expect(isPlaceholderCustomerName('Nimal Perera')).toBe(false);
  });
});

describe('resolveOrderContactName', () => {
  it('prefers a real checkout name over a placeholder account name', () => {
    expect(resolveOrderContactName('Nimal Perera', 'Guest')).toBe('Nimal Perera');
  });

  it('uses the account name when the form is empty', () => {
    expect(resolveOrderContactName('', 'Nimal Perera')).toBe('Nimal Perera');
    expect(resolveOrderContactName(undefined, 'Nimal Perera')).toBe('Nimal Perera');
  });

  it('returns undefined when both inputs are placeholders', () => {
    expect(resolveOrderContactName('Guest', 'Guest')).toBeUndefined();
    expect(resolveOrderContactName('  guest  ', 'Walk-in')).toBeUndefined();
    expect(resolveOrderContactName(undefined, 'Guest')).toBeUndefined();
    expect(resolveOrderContactName('Guest', undefined)).toBeUndefined();
    expect(resolveOrderContactName(undefined, undefined)).toBeUndefined();
  });
});

describe('resolveCustomerDisplayName', () => {
  it('never surfaces Guest when a phone is available', () => {
    expect(
      resolveCustomerDisplayName({
        guestName: 'Guest',
        userName: 'Guest',
        phone: '0771234567',
      }),
    ).toBe('0771234567');
  });
});
