import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { openDriverShift, closeDriverShift, listDriverShifts } from '../lib/driverShift';
import { broadcastDriverDutyChanged, broadcastDeliveryJobUpdated } from '../lib/socket';
import { getDriverAccessibleStoreIds } from '../lib/driverAccess';
import { patchDriverOpsProfile } from '@bingchun/delivery-domain';
import { viewableLicenseImageUrlWithTimeout } from '../lib/spaces';
import { meritStatusBand } from '../lib/meritPoints';
import { computeRiderStats, isRiderStatsPeriod } from '@bingchun/delivery-domain';
import { deriveDriverJobFlags, DRIVER_HELD_JOB_STATUSES } from '../lib/deliveryJobHelpers';

function accessibleStoreIdsFromDriver(driver: {
  storeId: string | null;
  accessibleStores: ReadonlyArray<{ id: string }>;
}): string[] {
  const ids = new Set<string>();
  if (driver.storeId) ids.add(driver.storeId);
  for (const s of driver.accessibleStores) ids.add(s.id);
  return [...ids];
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const driver = await prisma.adminUser.findFirst({
      where: { id: driverId, role: { name: 'DELIVERY_DRIVER' } },
      select: {
        id: true,
        name: true,
        phone: true,
        nicNumber: true,
        address: true,
        vehicleType: true,
        vehicleNumber: true,
        vehicleColor: true,
        licenseNumber: true,
        disabilities: true,
        profilePhotoUrl: true,
        licenseImageUrl: true,
        dutyStatus: true,
        meritPoints: true,
        consecutiveSuccessfulDeliveries: true,
        storeId: true,
        store: { select: { id: true, name: true, city: true } },
        accessibleStores: { select: { id: true, name: true, city: true } },
      },
    });
    if (!driver) throw new AppError('Driver not found', 404);

    const storeIds = accessibleStoreIdsFromDriver(driver);
    const [stores, ratingAgg, heldJobs, licenseImageUrl] = await Promise.all([
      storeIds.length === 0
        ? Promise.resolve([] as Array<{ id: string; name: string; city: string | null }>)
        : prisma.store.findMany({
            where: { id: { in: storeIds } },
            select: { id: true, name: true, city: true },
            orderBy: { name: 'asc' },
          }),
      prisma.riderRating.aggregate({
        where: { driverId },
        _avg: { stars: true },
        _count: { _all: true },
      }),
      prisma.deliveryJob.findMany({
        where: { driverId, status: { in: [...DRIVER_HELD_JOB_STATUSES] } },
        select: { status: true },
      }),
      viewableLicenseImageUrlWithTimeout(driver.licenseImageUrl),
    ]);

    const points = driver.meritPoints ?? 100;
    const { alertEligible, activeRidePhase, canClaimMore } = deriveDriverJobFlags(heldJobs);

    return success(res, {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      nicNumber: driver.nicNumber,
      address: driver.address,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      vehicleColor: driver.vehicleColor,
      licenseNumber: driver.licenseNumber,
      disabilities: driver.disabilities,
      profilePhotoUrl: driver.profilePhotoUrl,
      licenseImageUrl,
      dutyStatus: driver.dutyStatus,
      storeId: driver.storeId,
      store: driver.store,
      accessibleStores: stores,
      meritPoints: points,
      meritStatus: meritStatusBand(points),
      consecutiveSuccessfulDeliveries: driver.consecutiveSuccessfulDeliveries ?? 0,
      avgRating: ratingAgg._avg.stars ? Math.round(ratingAgg._avg.stars * 10) / 10 : null,
      ratingCount: ratingAgg._count._all,
      alertEligible,
      activeRidePhase,
      canClaimMore,
    });
  } catch (err) {
    next(err);
  }
}

const fcmTokenSchema = z.object({
  token: z.string().min(10),
  deviceId: z.string().min(1).max(191).optional(),
});

/** Register/refresh this driver's FCM token so new-job pushes reach the device. */
export async function updateFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const { token, deviceId } = fcmTokenSchema.parse(req.body);

    if (deviceId) {
      await prisma.driverDevice.upsert({
        where: { driverId_deviceId: { driverId, deviceId } },
        create: {
          driverId,
          deviceId,
          fcmToken: token,
          approvedAt: new Date(),
          lastSeenAt: new Date(),
        },
        update: { fcmToken: token, lastSeenAt: new Date() },
      });
    } else {
      const device = await prisma.driverDevice.findFirst({
        where: { driverId },
        orderBy: { lastSeenAt: 'desc' },
        select: { id: true },
      });
      if (device) {
        await prisma.driverDevice.update({
          where: { id: device.id },
          data: { fcmToken: token, lastSeenAt: new Date() },
        });
      } else {
        await prisma.driverDevice.create({
          data: {
            driverId,
            deviceId: `unknown-${driverId}`,
            fcmToken: token,
            approvedAt: new Date(),
            lastSeenAt: new Date(),
          },
        });
      }
    }

    return success(res, { registered: true });
  } catch (err) {
    next(err);
  }
}

const fcmDeleteSchema = z.object({
  deviceId: z.string().min(1).max(191).optional(),
});

/** Clear the FCM token (logout) so a signed-out device stops receiving pushes. */
export async function deleteFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const { deviceId } = fcmDeleteSchema.parse(req.body ?? {});

    await prisma.driverDevice.updateMany({
      where: { driverId, ...(deviceId ? { deviceId } : {}) },
      data: { fcmToken: null },
    });

    return success(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

const dutySchema = z.object({
  dutyStatus: z.enum(['ONLINE', 'OFF_DUTY']),
});

export async function updateDuty(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const { dutyStatus } = dutySchema.parse(req.body);

    const driver = await prisma.adminUser.findFirst({
      where: { id: driverId, role: { name: 'DELIVERY_DRIVER' } },
      select: { id: true, isActive: true, storeId: true, dutyStatus: true },
    });
    if (!driver) throw new AppError('Driver not found', 404);
    if (!driver.isActive) throw new AppError('Driver account is suspended', 403);
    if (!driver.storeId) throw new AppError('Driver account is not linked to a branch', 403);

    if (dutyStatus === 'OFF_DUTY') {
      const active = await prisma.deliveryJob.findFirst({
        where: { driverId, status: { in: ['ASSIGNED', 'QUEUED', 'IN_PROGRESS'] } },
        select: { id: true },
      });
      if (active) {
        throw new AppError(
          'Cannot go off duty. You have an active delivery. Complete or resolve it before going off duty.',
          409,
          'ACTIVE_JOB',
        );
      }
    }

    await patchDriverOpsProfile(driverId, { dutyStatus });

    const updated = await prisma.adminUser.findUniqueOrThrow({
      where: { id: driverId },
      select: {
        id: true,
        name: true,
        dutyStatus: true,
        storeId: true,
      },
    });

    if (dutyStatus === 'ONLINE') {
      await openDriverShift(driverId, driver.storeId);
    } else {
      await closeDriverShift(driverId);
    }

    const storeIds = await getDriverAccessibleStoreIds(driverId, driver.storeId);
    for (const storeId of storeIds) {
      broadcastDriverDutyChanged(storeId, {
        driverId: updated.id,
        name: updated.name,
        dutyStatus: updated.dutyStatus,
      });
    }

    return success(res, {
      id: updated.id,
      dutyStatus: updated.dutyStatus,
    });
  } catch (err) {
    next(err);
  }
}

const complaintSchema = z.object({
  orderId: z.string().uuid(),
  category: z.string().min(2).max(80),
  description: z.string().min(5).max(1000),
});

function mapComplaintCreateError(err: unknown): AppError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2003') {
      return new AppError('Invalid order or driver reference', 400);
    }
    if (err.code === 'P2021') {
      return new AppError('Complaint service is temporarily unavailable', 503);
    }
  }
  return null;
}

export async function createComplaint(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const body = complaintSchema.parse(req.body);
    const accessible = await getDriverAccessibleStoreIds(driverId, req.user!.storeId);
    const link = await prisma.deliveryJobOrder.findFirst({
      where: { orderId: body.orderId, job: { driverId, storeId: { in: accessible } } },
      include: { job: { select: { id: true, storeId: true, status: true } } },
    });
    if (!link) throw new AppError('Order not in your jobs', 404);
    const { randomUUID } = await import('crypto');
    const complaint = await prisma.driverComplaint.create({
      data: {
        id: randomUUID(),
        orderId: body.orderId,
        driverId,
        storeId: link.job.storeId,
        category: body.category,
        description: body.description,
      },
    });
    broadcastDeliveryJobUpdated(link.job.storeId, { jobId: link.job.id, status: link.job.status });
    return success(res, complaint, 201);
  } catch (err) {
    const mapped = mapComplaintCreateError(err);
    next(mapped ?? err);
  }
}

export async function listMyComplaints(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.driverComplaint.findMany({
      where: { driverId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return success(res, rows);
  } catch (err) {
    next(err);
  }
}

const branchRequestSchema = z.object({
  type: z.enum(['ADD_BRANCH', 'CHANGE_BRANCH', 'REMOVE_BRANCH']),
  // Store ids in this project are slug-style (e.g. store-bing-chun---nugegoda), not UUIDs.
  toStoreId: z.string().min(1).max(120),
  reason: z.string().max(500).optional(),
});

export async function createBranchRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const body = branchRequestSchema.parse(req.body);
    const driver = await prisma.adminUser.findUnique({
      where: { id: driverId },
      select: {
        storeId: true,
        accessibleStores: { select: { id: true } },
      },
    });
    if (!driver) throw new AppError('Driver not found', 404);
    const store = await prisma.store.findUnique({ where: { id: body.toStoreId }, select: { id: true } });
    if (!store) throw new AppError('Branch not found', 404);

    const accessibleIds = new Set(driver.accessibleStores.map((s) => s.id));
    if (driver.storeId) accessibleIds.add(driver.storeId);

    if (body.type === 'CHANGE_BRANCH') {
      const otherAssigned = [...accessibleIds].filter((id) => id !== driver.storeId);
      if (otherAssigned.length === 0) {
        throw new AppError(
          'You only have one assigned branch, so you cannot change your home branch.',
          400,
        );
      }
      if (driver.storeId === body.toStoreId) {
        throw new AppError('Choose another assigned branch as your home branch', 400);
      }
      if (!accessibleIds.has(body.toStoreId)) {
        throw new AppError(
          'You can only change your home branch to a branch you are already assigned to',
          400,
        );
      }
    }

    if (body.type === 'REMOVE_BRANCH') {
      if (!accessibleIds.has(body.toStoreId)) {
        throw new AppError('You can only request removal of a branch you already have', 400);
      }
      if (driver.storeId === body.toStoreId) {
        throw new AppError('Cannot remove your home branch — request a home branch change first', 400);
      }
    }

    const pending = await prisma.driverBranchRequest.findFirst({ where: { driverId, status: 'PENDING' } });
    if (pending) throw new AppError('You already have a pending branch request', 409);
    const { randomUUID } = await import('crypto');
    const row = await prisma.driverBranchRequest.create({
      data: {
        id: randomUUID(),
        driverId,
        type: body.type,
        fromStoreId: driver.storeId,
        toStoreId: body.toStoreId,
        reason: body.reason,
      },
    });
    return success(res, row, 201);
  } catch (err) {
    next(err);
  }
}

export async function listMyBranchRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.driverBranchRequest.findMany({
      where: { driverId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const storeIds = [...new Set(rows.flatMap((r) => [r.toStoreId, r.fromStoreId].filter(Boolean)))];
    const stores =
      storeIds.length > 0
        ? await prisma.store.findMany({
            where: { id: { in: storeIds as string[] } },
            select: { id: true, name: true },
          })
        : [];
    const storeNames = new Map(stores.map((s) => [s.id, s.name]));
    return success(
      res,
      rows.map((row) => ({
        ...row,
        toStoreName: storeNames.get(row.toStoreId) ?? null,
        fromStoreName: row.fromStoreId ? storeNames.get(row.fromStoreId) ?? null : null,
      })),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMeritHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.meritPointHistory.findMany({
      where: { driverId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return success(res, rows);
  } catch (err) {
    next(err);
  }
}

/** Customer reviews of this rider, newest first. */
export async function getRatings(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;

    const ratings = await prisma.riderRating.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { order: { select: { orderNumber: true } } },
    });

    const average = ratings.length
      ? Math.round((ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length) * 10) / 10
      : null;

    return success(res, {
      average,
      count: ratings.length,
      ratings: ratings.map((r) => ({
        id: r.id,
        orderNumber: r.order.orderNumber,
        stars: r.stars,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/** Rider-facing performance figures for the driver app's Stats tab. Read-only. */
export async function getMyStats(req: Request, res: Response, next: NextFunction) {
  try {
    const period = isRiderStatsPeriod(req.query.period) ? req.query.period : '7d';
    const stats = await computeRiderStats(req.user!.sub, period);
    return success(res, stats);
  } catch (err) {
    next(err);
  }
}

export async function listMyShifts(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await listDriverShifts(req.user!.sub);
    return success(res, rows);
  } catch (err) {
    next(err);
  }
}
