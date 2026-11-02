import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomInt } from 'crypto';
import { generateOrderNumber } from '../../src/utils/orderNumber';

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomInt: vi.fn(actual.randomInt),
  };
});

describe('generateOrderNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds a BC prefix with date and random suffix', () => {
    vi.mocked(randomInt).mockReturnValue(5777);

    expect(generateOrderNumber()).toBe('BC260722-5777');
  });

  it('pads single-digit months and days', () => {
    vi.setSystemTime(new Date('2026-01-05T12:00:00.000Z'));
    vi.mocked(randomInt).mockReturnValue(1000);

    expect(generateOrderNumber()).toBe('BC260105-1000');
  });

  it('uses a four-digit random suffix between 1000 and 9999', () => {
    vi.mocked(randomInt).mockReturnValue(9999);

    expect(generateOrderNumber()).toBe('BC260722-9999');
  });
});
