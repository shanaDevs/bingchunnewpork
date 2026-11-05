import { describe, expect, it } from 'vitest';
import {
  isPlaceholderCustomerName,
  resolveCheckoutContactName,
  resolveCustomerDisplayName,
} from './customerName';

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

describe('resolveCheckoutContactName', () => {
  it('prefers a real form name over a placeholder account name', () => {
    expect(resolveCheckoutContactName('Nimal Perera', 'Guest')).toBe('Nimal Perera');
  });

  it('uses the account name when the form is empty', () => {
    expect(resolveCheckoutContactName('', 'Nimal Perera')).toBe('Nimal Perera');
    expect(resolveCheckoutContactName(undefined, 'Nimal Perera')).toBe('Nimal Perera');
  });

  it('returns empty when both inputs are placeholders', () => {
    expect(resolveCheckoutContactName('Guest', 'Guest')).toBe('');
    expect(resolveCheckoutContactName('  guest  ', 'Walk-in')).toBe('');
    expect(resolveCheckoutContactName('', 'Guest')).toBe('');
    expect(resolveCheckoutContactName(undefined, 'Guest')).toBe('');
    expect(resolveCheckoutContactName(undefined, undefined)).toBe('');
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
