import { describe, expect, it, vi } from 'vitest';
import {
  ipMatchesAllowlistEntry,
  isPayhereNotifyIpAllowed,
  parsePayhereNotifyIpAllowlist,
  payhereNotifyIpAllowlist,
} from '../../src/middleware/payhereNotifyIpAllowlist';
import { AppError } from '../../src/middleware/errorHandler';

describe('parsePayhereNotifyIpAllowlist', () => {
  it('returns empty when unset (no gate)', () => {
    expect(parsePayhereNotifyIpAllowlist(undefined)).toEqual([]);
    expect(parsePayhereNotifyIpAllowlist('')).toEqual([]);
    expect(parsePayhereNotifyIpAllowlist('  ')).toEqual([]);
  });

  it('splits comma-separated entries', () => {
    expect(parsePayhereNotifyIpAllowlist('1.2.3.4, 10.0.0.0/8')).toEqual([
      '1.2.3.4',
      '10.0.0.0/8',
    ]);
  });
});

describe('ipMatchesAllowlistEntry', () => {
  it('matches exact IPs and IPv4-mapped forms', () => {
    expect(ipMatchesAllowlistEntry('1.2.3.4', '1.2.3.4')).toBe(true);
    expect(ipMatchesAllowlistEntry('::ffff:1.2.3.4', '1.2.3.4')).toBe(true);
    expect(ipMatchesAllowlistEntry('1.2.3.5', '1.2.3.4')).toBe(false);
  });

  it('matches IPv4 CIDR ranges', () => {
    expect(ipMatchesAllowlistEntry('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipMatchesAllowlistEntry('11.0.0.1', '10.0.0.0/8')).toBe(false);
    expect(ipMatchesAllowlistEntry('192.168.1.50', '192.168.1.0/24')).toBe(true);
  });
});

describe('isPayhereNotifyIpAllowed', () => {
  it('allows everyone when allowlist is empty', () => {
    expect(isPayhereNotifyIpAllowed(undefined, [])).toBe(true);
    expect(isPayhereNotifyIpAllowed('9.9.9.9', [])).toBe(true);
  });

  it('rejects missing IP when allowlist is set', () => {
    expect(isPayhereNotifyIpAllowed(undefined, ['1.2.3.4'])).toBe(false);
  });
});

describe('payhereNotifyIpAllowlist middleware', () => {
  it('passes through when env allowlist is unset', () => {
    const prev = process.env.PAYHERE_NOTIFY_IP_ALLOWLIST;
    delete process.env.PAYHERE_NOTIFY_IP_ALLOWLIST;
    const next = vi.fn();
    payhereNotifyIpAllowlist({ ip: '9.9.9.9' } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();
    if (prev !== undefined) process.env.PAYHERE_NOTIFY_IP_ALLOWLIST = prev;
  });

  it('rejects non-listed IPs with 403', () => {
    const prev = process.env.PAYHERE_NOTIFY_IP_ALLOWLIST;
    process.env.PAYHERE_NOTIFY_IP_ALLOWLIST = '1.2.3.4';
    const next = vi.fn();
    payhereNotifyIpAllowlist({ ip: '9.9.9.9' } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
    if (prev !== undefined) process.env.PAYHERE_NOTIFY_IP_ALLOWLIST = prev;
    else delete process.env.PAYHERE_NOTIFY_IP_ALLOWLIST;
  });

  it('allows listed IPs', () => {
    const prev = process.env.PAYHERE_NOTIFY_IP_ALLOWLIST;
    process.env.PAYHERE_NOTIFY_IP_ALLOWLIST = '1.2.3.4,10.0.0.0/8';
    const next = vi.fn();
    payhereNotifyIpAllowlist({ ip: '10.5.0.1' } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();
    if (prev !== undefined) process.env.PAYHERE_NOTIFY_IP_ALLOWLIST = prev;
    else delete process.env.PAYHERE_NOTIFY_IP_ALLOWLIST;
  });
});
