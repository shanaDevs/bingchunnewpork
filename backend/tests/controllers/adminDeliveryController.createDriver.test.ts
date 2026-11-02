import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findMany: vi.fn() },
    adminUser: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
    },
    $disconnect: vi.fn(async () => undefined),
    $connect: vi.fn(async () => undefined),
  },
}));

vi.mock('../../src/lib/adminDeliveryHelpers', () => ({
  resolveAdminStoreIdForRequest: vi.fn(async () => 'store-1'),
  resolveOptionalAdminStoreIdForRequest: vi.fn(async () => undefined),
  getPendingDeliveryOrders: vi.fn(),
  orderToClusterable: vi.fn(),
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastDeliveryJobUpdated: vi.fn(),
}));

vi.mock('../../src/lib/spaces', () => ({
  uploadDriverAsset: vi.fn(async () => 'https://example.com/drivers/license/licence.png'),
  viewableLicenseImageUrl: vi.fn(async (url: string | null) =>
    url ? `https://example.com/signed?src=${encodeURIComponent(url)}` : null,
  ),
  viewableLicenseImageUrlWithTimeout: vi.fn(async (url: string | null) =>
    url ? `https://example.com/signed?src=${encodeURIComponent(url)}` : null,
  ),
}));

vi.mock('../../src/lib/driverPin', () => ({
  assertDriverPinAvailable: vi.fn(async () => undefined),
  driverInternalEmail: () => 'driver.abc@drivers.bingchun.internal',
  driverPinLookup: () => 'pin-lookup-1',
  hashDriverPin: vi.fn(async () => 'hashed-pin'),
}));

vi.mock('@bingchun/delivery-domain', () => ({
  syncRiderProfileFromAdminUser: vi.fn(async () => undefined),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createDeliveryDriver } from '../../src/controllers/adminDeliveryController';
import { prisma } from '../../src/lib/prisma';
import { uploadDriverAsset } from '../../src/lib/spaces';
import { syncRiderProfileFromAdminUser } from '@bingchun/delivery-domain';

const createdDriver = {
  id: 'driver-1',
  name: 'Nuwan Perera',
  phone: '0771234567',
  nicNumber: '200012345678',
  vehicleNumber: 'CAB-1234',
  profilePhotoUrl: null,
  licenseImageUrl: 'https://example.com/drivers/license/licence.png',
  isActive: true,
  dutyStatus: 'OFF_DUTY',
  store: { id: 'store-1', name: 'Nugegoda', city: 'Nugegoda' },
  accessibleStores: [{ id: 'store-1', name: 'Nugegoda', city: 'Nugegoda' }],
};

function registrationReq() {
  return createMockReq({
    body: {
      name: 'Nuwan Perera',
      phone: '0771234567',
      nicNumber: '200012345678',
      vehicleNumber: 'CAB-1234',
      pin: '1234',
      branchIds: JSON.stringify(['store-1']),
      isActive: 'true',
    },
    files: {
      licenseImage: [
        { buffer: Buffer.from('img'), originalname: 'licence.png', mimetype: 'image/png' },
      ],
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.store.findMany).mockResolvedValue([{ id: 'store-1' }] as never);
  vi.mocked(prisma.adminUser.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.adminUser.create).mockResolvedValue(createdDriver as never);
});

describe('createDeliveryDriver', () => {
  it('registers a driver and uploads the licence once', async () => {
    const res = createMockRes();

    await createDeliveryDriver(registrationReq(), res, createMockNext());

    expect(uploadDriverAsset).toHaveBeenCalledOnce();
    expect(prisma.adminUser.create).toHaveBeenCalledOnce();
    expect(prisma.$connect).not.toHaveBeenCalled();
    expect(syncRiderProfileFromAdminUser).toHaveBeenCalledWith('driver-1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        id: 'driver-1',
        pin: '1234',
        licenseImageUrl: expect.stringContaining('signed'),
      }),
    });
  });

  it('reconnects and retries once when the database socket is reset', async () => {
    const dropped = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });
    vi.mocked(prisma.adminUser.create)
      .mockRejectedValueOnce(dropped)
      .mockResolvedValueOnce(createdDriver as never);
    const res = createMockRes();

    await createDeliveryDriver(registrationReq(), res, createMockNext());

    expect(prisma.$disconnect).toHaveBeenCalledOnce();
    expect(prisma.$connect).toHaveBeenCalledOnce();
    expect(uploadDriverAsset).toHaveBeenCalledOnce();
    expect(prisma.adminUser.create).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns the rider already committed when the first insert reply was lost', async () => {
    const dropped = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });
    vi.mocked(prisma.adminUser.create).mockRejectedValueOnce(dropped);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue(createdDriver as never);
    const res = createMockRes();

    await createDeliveryDriver(registrationReq(), res, createMockNext());

    expect(prisma.adminUser.create).toHaveBeenCalledOnce();
    expect(prisma.adminUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          pinLookup: 'pin-lookup-1',
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ id: 'driver-1', pin: '1234' }),
    });
  });
});
