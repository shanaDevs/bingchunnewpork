import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { patchDriverOpsProfile } from '@bingchun/delivery-domain';
import { prisma } from '@bingchun/db';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';

const PIN_REGEX = /^\d{3,12}$/;

export function validateDriverPin(pin: string): void {
  if (!PIN_REGEX.test(pin)) {
    throw new AppError('PIN must be 3–12 digits', 400);
  }
}

/** Must match backend/src/lib/driverPin.ts exactly — same pepper, same lookup values. */
function pinPepper(): string {
  return config.driverPinPepper || config.jwtSecret;
}

function legacyPinPepper(): string {
  return config.jwtSecret;
}

export function driverPinLookup(storeId: string, pin: string): string {
  return crypto.createHmac('sha256', pinPepper()).update(`${storeId}:${pin}`).digest('hex');
}

export function legacyDriverPinLookup(storeId: string, pin: string): string {
  return crypto.createHmac('sha256', legacyPinPepper()).update(`${storeId}:${pin}`).digest('hex');
}

export async function hashDriverPin(pin: string): Promise<string> {
  validateDriverPin(pin);
  return bcrypt.hash(pin, 12);
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
  return { match: false, needsRehash: false };
}

export async function findDriverByPin(pin: string, storeId?: string) {
  validateDriverPin(pin);

  // Include inactive drivers so login can return a clear suspension message (QA #13).
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

  type Match = (typeof drivers)[number] & { needsRehash: boolean; matchedStoreIds?: string[] };
  const matches: Match[] = [];

  for (const d of drivers) {
    if (!d.storeId || !d.pinLookup) continue;
    const result = pinMatchesStore(d.storeId, pin, d.pinLookup);
    if (!result.match) continue;
    matches.push(Object.assign(d, { needsRehash: result.needsRehash }));
  }

  if (matches.length === 0) return null;

  let scoped = matches;
  if (storeId) {
    scoped = matches.filter(
      (d) =>
        d.storeId === storeId ||
        d.accessibleStores.some((s) => s.id === storeId),
    );
    if (scoped.length === 0) return null;
  }

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

  const pick =
    pool.length === 1
      ? pool[0]
      : [...pool].sort((a, b) => {
          const aSeen = a.lastLoginAt?.getTime() ?? 0;
          const bSeen = b.lastLoginAt?.getTime() ?? 0;
          if (aSeen !== bSeen) return bSeen - aSeen;
          return a.createdAt.getTime() - b.createdAt.getTime();
        })[0];

  return Object.assign(pick, { matchedStoreIds, pinNeedsRehash: pick.needsRehash });
}

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
