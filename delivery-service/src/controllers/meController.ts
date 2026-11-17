import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '@bingchun/db';
import {
  meritStatusBand,
  computeRiderStats,
  creditedDeliveredTotals,
  groupLatestFailedAttemptsByJob,
  isRiderStatsPeriod,
  assertDriverVehicleReadyForWork,
  getOpenVehicleBreakdown,
  markVehicleFixed,
  patchDriverOpsProfile,
  VEHICLE_BREAKDOWN_OPEN_CODE,
} from '@bingchun/delivery-domain';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { openDriverShift, closeDriverShift, listDriverShifts } from '../lib/driverShift';
import { getDeliverySocketServer } from '../sockets';
import { getDriverAccessibleStoreIds } from '../lib/driverAccess';
import { applyMeritDelta } from '../lib/meritPoints';
import { heldJobStatuses, canDriverClaimMore, classifyIncompleteJob, prismaKnowsDeliveryJobStatus } from '../lib/deliveryJobHelpers';
import { todayDateRange } from '../lib/datetime';
import { getEventPublisher } from '../sockets/eventPublisher';
import { replayPendingJobsForDriverGoingOnline } from '../lib/pendingJobAlerts';
import { logger } from '../utils/logger';
import {
  RIDER_LICENSE_IMAGE_ENDPOINT_TIMEOUT_MS,
  RIDER_LICENSE_PRESIGN_TIMEOUT_MS,
  viewableLicenseImageUrlWithTimeout,
} from '@bingchun/backend/dist/lib/spaces';

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
    const stores =
      storeIds.length === 0
        ? []
        : await prisma.store.findMany({
            where: { id: { in: storeIds } },
            select: { id: true, name: true, city: true },
            orderBy: { name: 'asc' },
          });

    const ratingAgg = await prisma.riderRating.aggregate({
      where: { driverId },
      _avg: { stars: true },
      _count: { _all: true },
    });

    const storedLicense = driver.licenseImageUrl?.trim() || null;
    const hasLicenseImage = Boolean(storedLicense);
    let licenseImageUrl: string | null = null;
    try {
      licenseImageUrl = await viewableLicenseImageUrlWithTimeout(
        storedLicense,
        RIDER_LICENSE_PRESIGN_TIMEOUT_MS,
      );
    } catch (err) {
      logger.warn('Licence presign failed for rider profile (delivery-service)', err);
      licenseImageUrl = null;
    }

    const points = driver.meritPoints ?? 100;
    const [claimMore, vehicleBreakdown] = await Promise.all([
      canDriverClaimMore(driverId),
      getOpenVehicleBreakdown(driverId),
    ]);

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
      hasLicenseImage,
      dutyStatus: driver.dutyStatus,
      storeId: driver.storeId,
      store: driver.store,
      accessibleStores: stores,
      meritPoints: points,
      meritStatus: meritStatusBand(points),
      consecutiveSuccessfulDeliveries: driver.consecutiveSuccessfulDeliveries ?? 0,
      avgRating: ratingAgg._avg.stars
        ? Math.round(ratingAgg._avg.stars * 10) / 10
        : null,
      ratingCount: ratingAgg._count._all,
      canClaimMore: claimMore,
      vehicleBreakdown: vehicleBreakdown
        ? {
            id: vehicleBreakdown.id,
            jobId: vehicleBreakdown.jobId,
            reportedAt: vehicleBreakdown.reportedAt.toISOString(),
            lat: vehicleBreakdown.reportedLat,
            lng: vehicleBreakdown.reportedLng,
            note: vehicleBreakdown.note,
            rideCode: vehicleBreakdown.rideCode,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function markMyVehicleFixed(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    let result;
    try {
      result = await markVehicleFixed({
        driverId,
        fixedById: driverId,
        fixedByRole: 'DRIVER',
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      if (typeof e.statusCode === 'number') {
        throw new AppError(e.message, e.statusCode, e.code);
      }
      throw err;
    }

    const open = await prisma.vehicleBreakdown.findUnique({
      where: { id: result.id },
      select: { storeId: true, driverId: true, jobId: true, reportedLat: true, reportedLng: true },
    });
    if (open) {
      const payload = {
        breakdownId: result.id,
        driverId: open.driverId,
        jobId: open.jobId,
        storeId: open.storeId,
        fixedByRole: 'DRIVER' as const,
        fixedComment: null,
      };
      getEventPublisher()
        .publish(`store:${open.storeId}`, 'vehicleBreakdownCleared', payload)
        .catch(() => {});
      getEventPublisher().publish('delivery-ops', 'vehicleBreakdownCleared', payload).catch(() => {});
    }

    return success(res, {
      breakdownId: result.id,
      jobId: result.jobId,
      fixedAt: result.fixedAt.toISOString(),
      fixedComment: result.fixedComment,
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyLicenseImage(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const driver = await prisma.adminUser.findFirst({
      where: { id: driverId, role: { name: 'DELIVERY_DRIVER' } },
      select: { licenseImageUrl: true },
    });
    if (!driver) throw new AppError('Driver not found', 404);
    const stored = driver.licenseImageUrl?.trim() || null;
    if (!stored) {
      throw new AppError('No licence image on file', 404, 'LICENSE_NOT_UPLOADED');
    }
    const licenseImageUrl = await viewableLicenseImageUrlWithTimeout(
      stored,
      RIDER_LICENSE_IMAGE_ENDPOINT_TIMEOUT_MS,
    );
    if (!licenseImageUrl) {
      throw new AppError('Could not prepare licence image', 503, 'LICENSE_SIGN_FAILED');
    }
    return success(res, { licenseImageUrl, hasLicenseImage: true });
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
      select: { id: true, isActive: true, storeId: true, dutyStatus: true, name: true },
    });
    if (!driver) throw new AppError('Driver not found', 404);
    if (!driver.isActive) throw new AppError('Driver account is suspended', 403);
    if (!driver.storeId) throw new AppError('Driver account is not linked to a branch', 403);

    if (dutyStatus === 'OFF_DUTY') {
      const active = await prisma.deliveryJob.findFirst({
        where: { driverId, status: { in: await heldJobStatuses() } },
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

    if (dutyStatus === 'ONLINE') {
      try {
        await assertDriverVehicleReadyForWork(driverId);
      } catch (err) {
        const e = err as Error & { statusCode?: number; code?: string };
        if (typeof e.statusCode === 'number') {
          throw new AppError(e.message, e.statusCode, e.code ?? VEHICLE_BREAKDOWN_OPEN_CODE);
        }
        throw err;
      }
    }

    await patchDriverOpsProfile(driverId, { dutyStatus });

    const updated = await prisma.adminUser.findUniqueOrThrow({
      where: { id: driverId },
      select: { id: true, name: true, dutyStatus: true, storeId: true },
    });

    if (dutyStatus === 'ONLINE') {
      await openDriverShift(driverId, driver.storeId);
    } else {
      await closeDriverShift(driverId);
    }

    try {
      const nsp = getDeliverySocketServer().of('/delivery');
      const storeIds = await getDriverAccessibleStoreIds(driverId, driver.storeId);
      const payload = {
        driverId: updated.id,
        name: updated.name,
        dutyStatus: updated.dutyStatus,
      };
      for (const storeId of storeIds) {
        nsp.to(`store:${storeId}`).emit('driverDutyChanged', payload);
      }
    } catch {
      // Socket may be unavailable — duty DB update still applies.
    }

    if (dutyStatus === 'ONLINE' && driver.dutyStatus !== 'ONLINE') {
      const storeIds = await getDriverAccessibleStoreIds(driverId, driver.storeId);
      replayPendingJobsForDriverGoingOnline(driverId, storeIds).catch((err) =>
        logger.warn('Pending job replay on go-online failed', { driverId, err }),
      );
    }

    return success(res, {
      id: updated.id,
      dutyStatus: updated.dutyStatus,
    });
  } catch (err) {
    next(err);
  }
}

const fcmTokenSchema = z.object({ token: z.string().min(10), deviceId: z.string().optional() });

export async function updateFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const { token, deviceId } = fcmTokenSchema.parse(req.body);

    if (deviceId) {
      await prisma.driverDevice.upsert({
        where: { driverId_deviceId: { driverId, deviceId } },
        create: { driverId, deviceId, fcmToken: token, approvedAt: new Date(), lastSeenAt: new Date() },
        update: { fcmToken: token, lastSeenAt: new Date() },
      });
    } else {
      const anyDevice = await prisma.driverDevice.findFirst({
        where: { driverId },
        orderBy: { lastSeenAt: 'desc' },
      });
      if (!anyDevice) throw new AppError('No registered device — pass deviceId', 400);
      await prisma.driverDevice.update({ where: { id: anyDevice.id }, data: { fcmToken: token } });
    }

    return success(res, { updated: true });
  } catch (err) {
    next(err);
  }
}

const fcmDeleteSchema = z.object({
  deviceId: z.string().min(1).max(191).optional(),
});

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

export async function getHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;

    const jobs = await prisma.deliveryJob.findMany({
      where: {
        driverId,
        OR: [
          { status: 'COMPLETED' },
          ...(prismaKnowsDeliveryJobStatus('VEHICLE_FAILURE') ? [{ status: 'VEHICLE_FAILURE' as const }] : []),
          // Own past-due held jobs (never finished) surface here as Incomplete
          // instead of lingering in the active pick list indefinitely.
          { status: { in: await heldJobStatuses() }, scheduledAt: { lt: todayDateRange().from } },
        ],
      },
      orderBy: [{ completedAt: 'desc' }, { scheduledAt: 'desc' }],
      take: 50,
      include: {
        store: { select: { name: true, city: true } },
        jobOrders: {
          select: {
            orderId: true,
            order: { select: { status: true, deliveryFee: true, cancelledAtStatus: true } },
          },
        },
      },
    });

    const failedAttempts =
      jobs.length === 0
        ? []
        : await prisma.deliveryAttempt.findMany({
            where: {
              jobId: { in: jobs.map((j) => j.id) },
              outcome: { not: 'DELIVERED' },
            },
            select: {
              jobId: true,
              orderId: true,
              outcome: true,
              note: true,
              attemptNo: true,
              createdAt: true,
            },
            orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }],
          });
    const latestFailedByJob = groupLatestFailedAttemptsByJob(failedAttempts);

    return success(
      res,
      jobs.map((j) => {
        const { deliveredCount, deliveredTotal } = creditedDeliveredTotals(
          j.jobOrders.map((jo) => ({
            orderId: jo.orderId,
            order: {
              status: jo.order.status,
              deliveryFee: jo.order.deliveryFee,
              cancelledAtStatus: jo.order.cancelledAtStatus ?? null,
            },
          })),
          latestFailedByJob.get(j.id) ?? new Map(),
        );
        return {
          id: j.id,
          title: j.title,
          status: j.status,
          displayStatus:
            j.status === 'COMPLETED'
              ? 'COMPLETED'
              : j.status === 'VEHICLE_FAILURE'
                ? 'VEHICLE_FAILURE'
                : classifyIncompleteJob(j, deliveredCount),
          storeName: j.store.name,
          storeCity: j.store.city,
          completedAt: j.completedAt,
          orderCount: j.jobOrders.length,
          deliveredCount,
          totalDistanceKm: j.totalDistanceKm,
          totalDeliveryFees: j.totalDeliveryFees ?? deliveredTotal,
          riderRatingAvg:
            j.riderRatingCount > 0 ? Math.round((j.riderRatingSum / j.riderRatingCount) * 10) / 10 : null,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
}

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

export async function getMeritHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const rows = await prisma.meritPointHistory.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return success(res, rows);
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
      where: {
        orderId: body.orderId,
        job: { driverId, storeId: { in: accessible } },
      },
      include: { job: { select: { id: true, storeId: true, status: true } } },
    });
    if (!link) throw new AppError('Order not in your jobs', 404);

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

    getEventPublisher()
      .publish(`store:${link.job.storeId}`, 'deliveryJobUpdated', {
        jobId: link.job.id,
        orderId: body.orderId,
        status: link.job.status,
      })
      .catch(() => {});

    return success(res, complaint, 201);
  } catch (err) {
    const mapped = mapComplaintCreateError(err);
    next(mapped ?? err);
  }
}

export async function listMyComplaints(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const rows = await prisma.driverComplaint.findMany({
      where: { driverId },
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
  // Store ids are slug-style (e.g. store-bing-chun---nugegoda), not UUIDs.
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

    const pending = await prisma.driverBranchRequest.findFirst({
      where: { driverId, status: 'PENDING' },
    });
    if (pending) throw new AppError('You already have a pending branch request', 409);

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
    const driverId = req.user!.sub;
    const rows = await prisma.driverBranchRequest.findMany({
      where: { driverId },
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

// Re-export for admin confirmation path used by tests/services
export { applyMeritDelta };
