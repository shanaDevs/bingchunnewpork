import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  assertDriverPinAvailable,
  driverInternalEmail,
  driverPinLookup,
  findDriverByPin,
  hashDriverPin,
  legacyDriverPinLookup,
  validateDriverPin,
} from '../../src/lib/driverPin';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

describe('validateDriverPin', () => {
  it('accepts 3–12 digit pins', () => {
    expect(() => validateDriverPin('123')).not.toThrow();
    expect(() => validateDriverPin('1234')).not.toThrow();
    expect(() => validateDriverPin('123456')).not.toThrow();
    expect(() => validateDriverPin('123456789')).not.toThrow();
  });

  it('rejects invalid pins', () => {
    expect(() => validateDriverPin('12')).toThrow(AppError);
    expect(() => validateDriverPin('1234567890123')).toThrow(AppError);
    expect(() => validateDriverPin('abc')).toThrow('PIN must be 3–12 digits');
  });
});

describe('driverPinLookup', () => {
  it('returns a deterministic hex digest for store and pin', () => {
    const a = driverPinLookup('store-1', '1234');
    const b = driverPinLookup('store-1', '1234');
    const c = driverPinLookup('store-2', '1234');

    expect(a).toHaveLength(64);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('matches legacy lookup when DRIVER_PIN_PEPPER is unset', () => {
    expect(driverPinLookup('store-1', '1234')).toBe(legacyDriverPinLookup('store-1', '1234'));
  });
});

describe('hashDriverPin', () => {
  it('returns a bcrypt hash for a valid pin', async () => {
    const hash = await hashDriverPin('5678');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});

describe('assertDriverPinAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when no driver uses the pin', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([]);

    await expect(assertDriverPinAvailable('store-1', '1234')).resolves.toBeUndefined();
  });

  it('throws when the pin is already taken by another driver', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      {
        id: 'driver-1',
        storeId: 'store-2',
        pinLookup: driverPinLookup('store-2', '1234'),
      },
    ] as never);

    await expect(assertDriverPinAvailable('store-1', '1234')).rejects.toMatchObject({
      message: 'PIN already used by another driver',
      statusCode: 409,
    });
  });
});

describe('findDriverByPin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a driver by home-branch pin even when request storeId is a secondary branch', async () => {
    const driver = {
      id: 'd1',
      storeId: 'store-1',
      isActive: true,
      pinLookup: driverPinLookup('store-1', '1234'),
      lastLoginAt: null,
      createdAt: new Date('2025-01-01'),
      role: { name: 'DELIVERY_DRIVER' },
      accessibleStores: [{ id: 'store-1' }, { id: 'store-2' }],
      store: { id: 'store-1', name: 'A', city: 'C' },
    };
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([driver] as never);

    await expect(findDriverByPin('1234', 'store-2')).resolves.toMatchObject({
      id: 'd1',
      matchedStoreIds: expect.arrayContaining(['store-1', 'store-2']),
    });
  });

  it('returns null when no global match exists', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([]);

    await expect(findDriverByPin('1234')).resolves.toBeNull();
  });

  it('signs in the most recent account and reports every matched branch', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      {
        id: 'd1',
        storeId: 'store-1',
        isActive: true,
        pinLookup: driverPinLookup('store-1', '1234'),
        lastLoginAt: new Date('2026-01-01'),
        createdAt: new Date('2025-01-01'),
        accessibleStores: [{ id: 'store-1' }],
        role: { name: 'DELIVERY_DRIVER' },
        store: { id: 'store-1', name: 'A', city: 'C' },
      },
      {
        id: 'd2',
        storeId: 'store-2',
        isActive: true,
        pinLookup: driverPinLookup('store-2', '1234'),
        lastLoginAt: new Date('2026-06-01'),
        createdAt: new Date('2025-06-01'),
        accessibleStores: [{ id: 'store-2' }],
        role: { name: 'DELIVERY_DRIVER' },
        store: { id: 'store-2', name: 'B', city: 'C' },
      },
    ] as never);

    await expect(findDriverByPin('1234')).resolves.toMatchObject({
      id: 'd2',
      matchedStoreIds: expect.arrayContaining(['store-1', 'store-2']),
    });
  });

  it('returns a suspended driver when the PIN matches only an inactive account', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      {
        id: 'd-suspended',
        storeId: 'store-1',
        isActive: false,
        pinLookup: driverPinLookup('store-1', '1234'),
        lastLoginAt: null,
        createdAt: new Date('2025-01-01'),
        accessibleStores: [{ id: 'store-1' }],
        role: { name: 'DELIVERY_DRIVER' },
        store: { id: 'store-1', name: 'A', city: 'C' },
      },
    ] as never);

    await expect(findDriverByPin('1234')).resolves.toMatchObject({
      id: 'd-suspended',
      isActive: false,
    });
  });
});

describe('driverInternalEmail', () => {
  it('returns a unique internal driver email', () => {
    expect(driverInternalEmail()).toMatch(/^driver\.[a-f0-9-]+@drivers\.bingchun.internal$/);
    expect(driverInternalEmail()).not.toBe(driverInternalEmail());
  });
});
