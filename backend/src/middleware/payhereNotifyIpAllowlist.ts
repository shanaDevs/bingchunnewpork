import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler';

/** Parse PAYHERE_NOTIFY_IP_ALLOWLIST (comma-separated IPs or IPv4 CIDRs). Empty = no gate. */
export function parsePayhereNotifyIpAllowlist(
  raw: string | undefined = process.env.PAYHERE_NOTIFY_IP_ALLOWLIST,
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    n = (n << 8) + octet;
  }
  return n >>> 0;
}

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

/** True if clientIp matches an exact IP or IPv4 CIDR entry. */
export function ipMatchesAllowlistEntry(clientIp: string, entry: string): boolean {
  const ip = normalizeIp(clientIp);
  const rule = entry.trim();
  if (!rule) return false;

  if (!rule.includes('/')) {
    return normalizeIp(rule) === ip;
  }

  const [network, prefixStr] = rule.split('/');
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt == null || netInt == null) return false;

  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

export function isPayhereNotifyIpAllowed(
  clientIp: string | undefined,
  allowlist: string[],
): boolean {
  if (allowlist.length === 0) return true;
  if (!clientIp) return false;
  const ip = normalizeIp(clientIp);
  return allowlist.some((entry) => ipMatchesAllowlistEntry(ip, entry));
}

/**
 * Optional IP allowlist for PayHere notify. When PAYHERE_NOTIFY_IP_ALLOWLIST is
 * unset/empty, all callers proceed (signature + amount checks still apply).
 * Relies on Express `trust proxy` so req.ip reflects the real client behind CapRover/nginx.
 */
export function payhereNotifyIpAllowlist(req: Request, _res: Response, next: NextFunction): void {
  const allowlist = parsePayhereNotifyIpAllowlist();
  if (allowlist.length === 0) {
    next();
    return;
  }

  const clientIp = req.ip || req.socket?.remoteAddress || '';
  if (!isPayhereNotifyIpAllowed(clientIp, allowlist)) {
    next(new AppError('Forbidden', 403));
    return;
  }
  next();
}
