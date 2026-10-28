import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@bingchun/db';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { findDriverByPin, rehashDriverPinIfNeeded } from '../lib/driverPin';
import {
  signDeliveryAccessToken,
  signDeliveryRefreshToken,
  verifyDeliveryRefreshToken,
  hashRefreshToken,
  compareRefreshToken,
} from '../lib/deliveryTokens';
import { config } from '../config';
import { incrementDriverSessionVersion } from '@bingchun/delivery-domain';
import { revokeDriverSockets } from '../sockets';

function driverPayload(driver: {
  id: string;
  name: string;
  role: { name: string };
  storeId: string | null;
  store?: { name: string; city: string } | null;
}) {
  return {
    id: driver.id,
    name: driver.name,
    role: driver.role.name,
    storeId: driver.storeId,
    storeName: driver.store?.name ?? null,
    storeCity: driver.store?.city ?? null,
  };
}

async function issueTokens(driverId: string, storeId: string, sessionVersion: number, deviceId?: string) {
  const token = signDeliveryAccessToken(driverId, storeId, sessionVersion);
  let refreshToken: string | null = null;

  if (deviceId) {
    const { token: rt } = signDeliveryRefreshToken(driverId, deviceId);
    refreshToken = rt;
    const refreshTokenHash = await hashRefreshToken(rt);
    await prisma.driverDevice.update({
      where: { driverId_deviceId: { driverId, deviceId } },
      data: { refreshTokenHash, lastSeenAt: new Date() },
    });
  }

  return { token, refreshToken };
}

const loginSchema = z.object({
  pin: z.string().regex(/^\d{3,12}$/, 'PIN must be 3–12 digits'),
  storeId: z.string().optional(),
  deviceId: z.string().optional(),
  platform: z.string().optional(),
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { pin, storeId, deviceId, platform } = loginSchema.parse(req.body);

    const driver = await findDriverByPin(pin, storeId);
    if (!driver || driver.role.name !== 'DELIVERY_DRIVER') {
      throw new AppError('Invalid PIN', 401);
    }
    if (!driver.isActive) {
      throw new AppError(
        'Your account has been suspended. Please contact the administrator.',
        403,
      );
    }
    if (!driver.storeId) {
      throw new AppError('Driver account is not linked to a branch', 403);
    }

    let deviceApproved = true;
    if (deviceId) {
      const existingDevice = await prisma.driverDevice.findUnique({
        where: { driverId_deviceId: { driverId: driver.id, deviceId } },
      });

      if (existingDevice) {
        await prisma.driverDevice.update({
          where: { id: existingDevice.id },
          data: { platform: platform ?? existingDevice.platform, lastSeenAt: new Date() },
        });
        deviceApproved = !!existingDevice.approvedAt;
      } else {
        const created = await prisma.driverDevice.create({
          data: {
            driverId: driver.id,
            deviceId,
            platform,
            lastSeenAt: new Date(),
            // MVP: auto-approve new devices — flip DRIVER_DEVICE_AUTO_APPROVE=false once
            // branch-manager approval UI exists (ADR 0006 §2).
            approvedAt: config.autoApproveDriverDevices ? new Date() : null,
          },
        });
        deviceApproved = !!created.approvedAt;
      }
    }

    await prisma.driverDevice.updateMany({
      where: {
        driverId: driver.id,
        ...(deviceId ? { deviceId: { not: deviceId } } : {}),
      },
      data: { fcmToken: null, refreshTokenHash: null },
    });

    await prisma.adminUser.update({
      where: { id: driver.id },
      data: { lastLoginAt: new Date() },
    });
    const sessionVersion = await incrementDriverSessionVersion(driver.id);
    revokeDriverSockets(driver.id);
    await rehashDriverPinIfNeeded(
      driver.id,
      driver.storeId,
      pin,
      (driver as { pinNeedsRehash?: boolean }).pinNeedsRehash,
    );

    const { token, refreshToken } = await issueTokens(
      driver.id,
      driver.storeId,
      sessionVersion,
      deviceId,
    );

    return success(res, {
      token,
      refreshToken,
      deviceApproved,
      driver: driverPayload(driver),
    });
  } catch (err) {
    next(err);
  }
}

const refreshSchema = z.object({
  refreshToken: z.string(),
  deviceId: z.string(),
});

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken, deviceId } = refreshSchema.parse(req.body);

    let payload;
    try {
      payload = verifyDeliveryRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }
    if (payload.deviceId !== deviceId) throw new AppError('Invalid refresh token', 401);

    const device = await prisma.driverDevice.findUnique({
      where: { driverId_deviceId: { driverId: payload.sub, deviceId } },
    });
    if (!device || !(await compareRefreshToken(refreshToken, device.refreshTokenHash))) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const driver = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: { store: { select: { name: true, city: true } }, role: true },
    });
    if (!driver || !driver.isActive || driver.role.name !== 'DELIVERY_DRIVER' || !driver.storeId) {
      throw new AppError('Invalid refresh token', 401);
    }

    const { token, refreshToken: newRefreshToken } = await issueTokens(
      driver.id,
      driver.storeId,
      driver.sessionVersion,
      deviceId,
    );

    return success(res, {
      token,
      refreshToken: newRefreshToken,
      driver: driverPayload(driver),
    });
  } catch (err) {
    next(err);
  }
}

const logoutSchema = z.object({ deviceId: z.string().optional() });

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const { deviceId } = logoutSchema.parse(req.body ?? {});

    await prisma.driverDevice.updateMany({
      where: { driverId, ...(deviceId ? { deviceId } : {}) },
      data: { refreshTokenHash: null, fcmToken: null },
    });

    return success(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
}
