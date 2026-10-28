import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneLookupVariants } from '../../src/utils/phone';

describe('normalizePhone', () => {
  it('keeps a canonical local number', () => {
    expect(normalizePhone('0771234567')).toBe('0771234567');
  });

  it('normalizes an international +94 number', () => {
    expect(normalizePhone('+94771234567')).toBe('0771234567');
  });

  it('normalizes a 94-prefixed number without plus', () => {
    expect(normalizePhone('94771234567')).toBe('0771234567');
  });

  it('normalizes a 9-digit number starting with 7', () => {
    expect(normalizePhone('771234567')).toBe('0771234567');
  });

  it('returns trimmed input for unrecognized formats', () => {
    expect(normalizePhone('  not-a-phone  ')).toBe('not-a-phone');
  });
});

describe('phoneLookupVariants', () => {
  it('returns unique lookup variants for a local number', () => {
    const variants = phoneLookupVariants('0771234567');

    expect(variants).toEqual(
      expect.arrayContaining([
        '0771234567',
        '771234567',
        '+94771234567',
        '94771234567',
      ]),
    );
    expect(new Set(variants).size).toBe(variants.length);
  });
});
