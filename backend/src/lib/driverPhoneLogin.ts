import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { config } from '../config';
import { hashLoginOtp, verifyLoginOtp } from './otpHash';
import { phoneLookupVariants } from '../utils/phone';

/**
 * Rider sign-in by mobile OTP.
 *
 * Riders are AdminUser rows, so the customer `otp_records` table (FK → users) can't
 * hold their codes. Instead the request step returns a short-lived signed challenge
 * carrying HMAC(otpPepper, phone:code); the login step checks the code against it.
 * The hash can't be brute-forced offline without the server pepper, and online
 * guessing is capped by the per-phone OTP attempt lockout.
 */
const CHALLENGE_TTL_SECONDS = 10 * 60;
const CHALLENGE_TYPE = 'driver_login_otp';

type ChallengePayload = { typ: string; phone: string; h: string; jti: string };

/** Challenges already used to sign in — keeps a code single-use on this instance. */
const consumedChallenges = new Map<string, number>();

function pruneConsumed(now: number) {
  for (const [jti, exp] of consumedChallenges) {
    if (exp <= now) consumedChallenges.delete(jti);
  }
}

export function generateDriverOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function signDriverOtpChallenge(phone: string, code: string): { challenge: string; expiresInSeconds: number } {
  const challenge = jwt.sign(
    { typ: CHALLENGE_TYPE, phone, h: hashLoginOtp(code, phone) },
    config.jwtSecret,
    { expiresIn: CHALLENGE_TTL_SECONDS, jwtid: crypto.randomUUID() },
  );
  return { challenge, expiresInSeconds: CHALLENGE_TTL_SECONDS };
}

/** True when [code] is the one sent to [phone] for this unused, unexpired challenge. */
export function verifyDriverOtpChallenge(challenge: string, phone: string, code: string): boolean {
  let payload: ChallengePayload;
  try {
    payload = jwt.verify(challenge, config.jwtSecret) as ChallengePayload;
  } catch {
    return false;
  }
  if (payload.typ !== CHALLENGE_TYPE || payload.phone !== phone || !payload.jti) return false;
  if (consumedChallenges.has(payload.jti)) return false;
  return verifyLoginOtp(code, phone, payload.h);
}

export function consumeDriverOtpChallenge(challenge: string): void {
  const payload = jwt.decode(challenge) as (ChallengePayload & { exp?: number }) | null;
  if (!payload?.jti) return;
  const now = Date.now();
  pruneConsumed(now);
  consumedChallenges.set(payload.jti, (payload.exp ?? now / 1000 + CHALLENGE_TTL_SECONDS) * 1000);
}

/**
 * Rider account registered with this mobile number. Prefers an active account and,
 * when the number sits on several rows (one per branch), the most recently used one;
 * `matchedStoreIds` covers every branch those rows serve so the rider can work all of them.
 */
export async function findDriverByPhone(phone: string) {
  const drivers = await prisma.adminUser.findMany({
    where: { role: { name: 'DELIVERY_DRIVER' }, phone: { in: phoneLookupVariants(phone) } },
    select: {
      id: true,
      name: true,
      storeId: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      store: { select: { id: true, name: true, city: true } },
      role: { select: { name: true } },
      accessibleStores: { select: { id: true } },
    },
  });
  if (drivers.length === 0) return null;

  const active = drivers.filter((d) => d.isActive);
  const pool = active.length > 0 ? active : drivers;
  const matchedStoreIds = [
    ...new Set(pool.flatMap((d) => [...(d.storeId ? [d.storeId] : []), ...d.accessibleStores.map((s) => s.id)])),
  ];
  const primary = [...pool].sort((a, b) => {
    const aSeen = a.lastLoginAt?.getTime() ?? 0;
    const bSeen = b.lastLoginAt?.getTime() ?? 0;
    if (aSeen !== bSeen) return bSeen - aSeen;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
  return { ...primary, matchedStoreIds };
}
