import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { patchDriverOpsProfile } from '@bingchun/delivery-domain';
import { prisma } from './prisma';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';

/** Staff PINs are digits only; length is flexible (e.g. 123 or 123456789). */
const PIN_REGEX = /^\d{3,12}$/;

export function validateDriverPin(pin: string): void {
  if (!PIN_REGEX.test(pin)) {
    throw new AppError('PIN must be 3–12 digits', 400);
  }
}

/**
 * Dedicated pepper for PIN HMAC — must match delivery-service.
 * Falls back to JWT_SECRET only for dual-read of legacy rows.
 */
function pinPepper(): string {
  return config.driverPinPepper || config.jwtSecret;
}

function legacyPinPepper(): string {
  return config.jwtSecret;
}

/** Current (preferred) lookup: HMAC(pepper, storeId:pin). */
export function driverPinLookup(storeId: string, pin: string): string {
  return crypto.createHmac('sha256', pinPepper()).update(`${storeId}:${pin}`).digest('hex');
}

/** Legacy lookup keyed on JWT_SECRET — used only for dual-read migration. */
export function legacyDriverPinLookup(storeId: string, pin: string): string {
  return crypto.createHmac('sha256', legacyPinPepper()).update(`${storeId}:${pin}`).digest('hex');
}

/** Global PIN fingerprint (not branch-scoped) for uniqueness checks. */
export function driverPinFingerprint(pin: string): string {
  return crypto.createHmac('sha256', pinPepper()).update(`global:${pin}`).digest('hex');
}

export async function hashDriverPin(pin: string): Promise<string> {
  validateDriverPin(pin);
  return bcrypt.hash(pin, 12);
}

/**
 * PIN must be unique across all active delivery drivers (not just one branch).
 * A single driver account can still serve multiple branches via accessibleStores.
 */
export async function assertDriverPinAvailable(
  storeId: string,
  pin: string,
  excludeDriverId?: string,
): Promise<void> {
  validateDriverPin(pin);
  const candidates = [
    driverPinLookup(storeId, pin),
    legacyDriverPinLookup(storeId, pin),
  ];
  // Also check every other driver's store-scoped lookup by scanning active drivers
  // whose pinLookup matches either pepper for this PIN on any store.
  const drivers = await prisma.adminUser.findMany({
    where: {
      role: { name: 'DELIVERY_DRIVER' },
      isActive: true,
      pinLookup: { not: null },
      ...(excludeDriverId ? { id: { not: excludeDriverId } } : {}),
    },
    select: { id: true, storeId: true, pinLookup: true },
  });

  for (const d of drivers) {
    if (!d.storeId || !d.pinLookup) continue;
    const current = driverPinLookup(d.storeId, pin);
    const legacy = legacyDriverPinLookup(d.storeId, pin);
    if (d.pinLookup === current || d.pinLookup === legacy || candidates.includes(d.pinLookup)) {
      throw new AppError('PIN already used by another driver', 409);
    }
  }
}

/**
 * A rider who works at several branches has one account; PIN match is verified
 * against the home storeId (and legacy JWT_SECRET hash). Optional storeId in the
 * request only scopes which matched branches are reported — it does not require
 * storeId === driver.storeId when the PIN matches the home branch.
 */
type DriverPinMatch<T> = T & { matchedStoreIds: string[]; pinNeedsRehash?: boolean };

function withMatchedStores<T>(
  driver: T,
  matchedStoreIds: string[],
  pinNeedsRehash = false,
): DriverPinMatch<T> {
  return Object.assign(driver as object, { matchedStoreIds, pinNeedsRehash }) as DriverPinMatch<T>;
}

function pinMatchesStore(storeId: string, pin: string, pinLookup: string | null | undefined): {
  match: boolean;
  needsRehash: boolean;
} {
  if (!pinLookup) return { match: false, needsRehash: false };
  if (pinLookup === driverPinLookup(storeId, pin)) return { match: true, needsRehash: false };
  if (pinPepper() !== legacyPinPepper() && pinLookup === legacyDriverPinLookup(storeId, pin)) {
    return { match: true, needsRehash: true };
  }
  // When pepper === jwtSecret (default until DRIVER_PIN_PEPPER is set), current and
  // legacy digests are identical — no rehash needed.
  return { match: false, needsRehash: false };
}

export async function findDriverByPin(pin: string, storeId?: string) {
  validateDriverPin(pin);

  // Include inactive drivers so login can return a clear suspension message
  // instead of treating a valid PIN as "Invalid PIN" (QA #13).
  const drivers = await prisma.adminUser.findMany({
    where: { role: { name: 'DELIVERY_DRIVER' }, pinLookup: { not: null } },
    select: {
      id: true,
      name: true,
      storeId: true,
      isActive: true,
      pinLookup: true,
      lastLoginAt: true,
      createdAt: true,
      store: { select: { id: true, name: true, city: true } },
      role: { select: { name: true } },
      accessibleStores: { select: { id: true } },
    },
  });

  type Match = (typeof drivers)[number] & { needsRehash: boolean };
  const matches: Match[] = [];

  for (const d of drivers) {
    if (!d.storeId || !d.pinLookup) continue;
    const result = pinMatchesStore(d.storeId, pin, d.pinLookup);
    if (!result.match) continue;
    matches.push(Object.assign(d, { needsRehash: result.needsRehash }));
  }

  if (matches.length === 0) return null;

  // Optional storeId scopes to drivers who can serve that branch (home or accessible).
  let scoped = matches;
  if (storeId) {
    scoped = matches.filter(
      (d) =>
        d.storeId === storeId ||
        d.accessibleStores.some((s) => s.id === storeId),
    );
    if (scoped.length === 0) return null;
  }

  // Prefer an active account when the same PIN exists on a suspended row (PIN reuse).
  const active = scoped.filter((d) => d.isActive);
  const pool = active.length > 0 ? active : scoped;

  const matchedStoreIds = [
    ...new Set(
      pool.flatMap((d) => [
        ...(d.storeId ? [d.storeId] : []),
        ...d.accessibleStores.map((s) => s.id),
      ]),
    ),
  ];

  if (pool.length === 1) {
    return withMatchedStores(pool[0], matchedStoreIds, pool[0].needsRehash);
  }

  // Prefer most recently used account so the rider keeps their job history.
  const primary = [...pool].sort((a, b) => {
    const aSeen = a.lastLoginAt?.getTime() ?? 0;
    const bSeen = b.lastLoginAt?.getTime() ?? 0;
    if (aSeen !== bSeen) return bSeen - aSeen;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];

  return withMatchedStores(primary, matchedStoreIds, primary.needsRehash);
}

/** Lazily re-hash pinLookup to the dedicated pepper after a successful legacy login. */
export async function rehashDriverPinIfNeeded(
  driverId: string,
  storeId: string,
  pin: string,
  needsRehash?: boolean,
): Promise<void> {
  if (!needsRehash) return;
  if (pinPepper() === legacyPinPepper()) return;
  await patchDriverOpsProfile(driverId, { pinLookup: driverPinLookup(storeId, pin) });
}

export function driverInternalEmail(): string {
  return `driver.${crypto.randomUUID().slice(0, 8)}@drivers.bingchun.internal`;
}
