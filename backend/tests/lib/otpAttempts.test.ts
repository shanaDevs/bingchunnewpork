import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: { redisUrl: '' },
}));

import {
  assertOtpAttemptsAllowed,
  clearOtpAttemptsMemoryForTests,
  OTP_LOCKOUT_MESSAGE,
  recordFailedOtpAttempt,
  resetOtpAttempts,
} from '../../src/lib/otpAttempts';

const PHONE = '0771234567';
const LOCKOUT_MS = 15 * 60 * 1000;

describe('otpAttempts (in-memory)', () => {
  beforeEach(() => {
    clearOtpAttemptsMemoryForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    clearOtpAttemptsMemoryForTests();
  });

  it('allows verify until the fifth failure', async () => {
    for (let i = 0; i < 4; i += 1) {
      await assertOtpAttemptsAllowed(PHONE);
      await recordFailedOtpAttempt(PHONE);
    }
    await assertOtpAttemptsAllowed(PHONE);
    await recordFailedOtpAttempt(PHONE);
    await expect(assertOtpAttemptsAllowed(PHONE)).rejects.toThrow(OTP_LOCKOUT_MESSAGE);
  });

  it('clears lockout on reset', async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordFailedOtpAttempt(PHONE);
    }
    await expect(assertOtpAttemptsAllowed(PHONE)).rejects.toThrow(OTP_LOCKOUT_MESSAGE);
    await resetOtpAttempts(PHONE);
    await expect(assertOtpAttemptsAllowed(PHONE)).resolves.toBeUndefined();
  });

  it('clears expired lockout on assert', async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordFailedOtpAttempt(PHONE);
    }
    vi.advanceTimersByTime(LOCKOUT_MS);
    await expect(assertOtpAttemptsAllowed(PHONE)).resolves.toBeUndefined();
    await recordFailedOtpAttempt(PHONE);
    await expect(assertOtpAttemptsAllowed(PHONE)).resolves.toBeUndefined();
  });
});

describe('otpAttempts (Redis)', () => {
  const store = new Map<string, string>();
  const evalSha = vi.fn();

  beforeEach(async () => {
    store.clear();
    vi.resetModules();
    clearOtpAttemptsMemoryForTests();

    const mockRedis = {
      isOpen: true,
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
      scriptLoad: vi.fn(async () => 'sha-record-fail'),
      evalSha: evalSha.mockImplementation(async (_sha: string, opts: { keys: string[]; arguments: string[] }) => {
        const key = opts.keys[0];
        const maxAttempts = Number(opts.arguments[0]);
        const lockoutMs = Number(opts.arguments[1]);
        const now = Number(opts.arguments[2]);
        const raw = store.get(key) ?? null;
        let count = 0;
        let lockedUntil: number | null = null;
        if (raw) {
          const state = JSON.parse(raw) as { count: number; lockedUntil: number | null };
          count = state.count;
          lockedUntil = state.lockedUntil;
        }
        if (lockedUntil && now < lockedUntil) return raw;
        if (lockedUntil && now >= lockedUntil) {
          count = 0;
          lockedUntil = null;
        }
        count += 1;
        if (count >= maxAttempts) {
          lockedUntil = now + lockoutMs;
          count = 0;
        }
        const payload = JSON.stringify({ count, lockedUntil });
        store.set(key, payload);
        return payload;
      }),
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('redis', () => ({
      createClient: () => mockRedis,
    }));
    vi.doMock('../../src/config', () => ({
      config: { redisUrl: 'redis://localhost:6379' },
    }));
  });

  it('shares lockout state via Redis key', async () => {
    const mod = await import('../../src/lib/otpAttempts');
    const phone = '0779999999';
    for (let i = 0; i < 5; i += 1) {
      await mod.recordFailedOtpAttempt(phone);
    }
    expect(store.has('otp:attempts:0779999999')).toBe(true);
    await expect(mod.assertOtpAttemptsAllowed(phone)).rejects.toThrow(OTP_LOCKOUT_MESSAGE);
    await mod.resetOtpAttempts(phone);
    expect(store.has('otp:attempts:0779999999')).toBe(false);
  });
});
