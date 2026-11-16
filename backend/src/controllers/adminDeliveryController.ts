import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getMaxCupsPerRider } from '../lib/appSchema';
import {
  clusterOrdersByDirection,
  DIRECTIONAL_CUP_THRESHOLD,
} from '../lib/orderClustering';
import {
  getPendingDeliveryOrders,
  orderToClusterable,
  resolveAdminStoreIdForRequest,
  resolveOptionalAdminStoreIdForRequest,
} from '../lib/adminDeliveryHelpers';
import { isAllBranchRole } from '../middleware/auth';
import { buildDeliveryRoutePayload } from '../lib/deliveryRouteResponse';
import { decimalFieldToLkrNumber, parseDecimalFromDb } from '../lib/moneyDecimal';
import { serializeDeliveryJobFees } from '../lib/walletApiMoney';
import {
  notifyDriverBranchRequestReviewed,
  notifyDriverComplaintStatusChange,
} from '../lib/driverNotifications';
import {
  adminJobOrdersInclude,
  classifyIncompleteJob,
  deriveAdminOrderDeliveryState,
  DRIVER_HELD_JOB_STATUSES,
  prismaKnowsDeliveryJobStatus,
  fetchJobGpsLocations,
  fetchLatestDriverLocation,
  fetchJobVehicleFailure,
  resolveJobPickupOverride,
  resolveJobRouteOrigin,
  fetchOrderComplaintsByOrderIds,
  formatJobOrder,
  isActiveDeliveryJobStatus,
  jobOrdersWithDetails,
  orderStopImageMeta,
  parseActualRouteJson,
  simplifyGpsPath,
  snapGpsPathForDisplay,
  visibleJobOrderLinksForDeliveryJob,
  jobPickedUpForList,
  mapListJobOrderStops,
  deliveryStateFromOrderStatusForList,
} from '../lib/deliveryJobHelpers';
import { jobHasPickedUp } from '../lib/liveDriverTracking';
import { optimizeDeliveryStops, type RouteStop } from '../lib/routeOptimizer';
import { dropoffApiFields, mapPinPoint, resolveLiveLastDropoff } from '@bingchun/delivery-domain';
import {
  assertDriverPinAvailable,
  driverInternalEmail,
  driverPinLookup,
  hashDriverPin,
  hashDriverPlaceholderPassword,
} from '../lib/driverPin';
import { assertDriverPhoneAvailable, parseDriverPhone } from '../lib/driverPhone';
import { phoneLookupVariants } from '../utils/phone';
import { uploadDriverAsset, viewableLicenseImageUrl, viewableLicenseImageUrlWithTimeout } from '../lib/spaces';
import { retryOnceOnDisconnect } from '../utils/prismaErrors';
import { DriverDutyStatus, DeliveryDomainState, Prisma } from '@prisma/client';
import { resolveCustomerDisplayName } from '../lib/customerName';
import {
  computeRiderEfficiencyMetrics,
  jobRiderDistanceKm,
  roundDistanceKm,
  sumRiderDistanceKm,
  syncRiderProfileFromAdminUser,
} from '@bingchun/delivery-domain';
import { meritStatusBand, applyMeritDelta, MERIT_DELTAS } from '../lib/meritPoints';
import {
  assertCashierCanViewJob,
  resolveCashierListDateFilters,
} from '../lib/cashierDeliveryScope';
import { parseDateQuery, todayDateRange } from '../lib/datetime';
import {
  aggregateTopBranches,
  buildDailySeries,
  buildStatusCounts,
} from '../lib/deliveryDashboardStats';
import {
  collectForwardOrders,
  deriveFailureReassignment,
  failureOutcomeAllowsRiderReassignment,
  loadReassignedRidersByFailedJob,
  reassignFailedDeliveryOrders,
  REDELIVERY_JOB_STATUSES,
} from '../lib/deliveryFailureReassign';

async function adminStoreId(req: Request, requested?: string): Promise<string> {
  try {
    return await resolveAdminStoreIdForRequest(req, requested);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : 'Invalid store', 400);
  }
}

async function adminStoreIdOptional(req: Request, requested?: string): Promise<string | undefined> {
  try {
    return await resolveOptionalAdminStoreIdForRequest(req, requested);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : 'Invalid store', 400);
  }
}

/** Resolve store scope for a single job. All-branch roles may omit storeId — it is inferred from the job row. */
async function resolveJobScopedStoreId(
  req: Request,
  jobId: string,
  requestedStoreId?: string,
): Promise<string> {
  if (isAllBranchRole(req.user?.role) && !requestedStoreId) {
    const row = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      select: { storeId: true },
    });
    if (!row) throw new AppError('Job not found', 404);
    return row.storeId;
  }
  return await adminStoreId(req, requestedStoreId);
}

async function buildClusterRoutePreview(
  store: { lat: number; lng: number; id: string; name: string; addressLine: string; city: string },
  orders: ReturnType<typeof orderToClusterable>[]
) {
  const valid = orders.filter((o): o is NonNullable<typeof o> => o != null);
  const rawStops: Omit<RouteStop, 'sequence' | 'distanceFromPreviousKm' | 'etaMinutesFromPrevious'>[] =
    valid.map((o) => ({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      customerPhone: '',
      addressLine: o.addressLine,
      city: o.city,
      district: o.district,
      status: 'READY',
      total: o.total,
      itemCount: o.itemCount,
      imageUrl: o.imageUrl,
      extraItemCount: o.extraItemCount,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      lat: o.lat,
      lng: o.lng,
    }));

  const stops = optimizeDeliveryStops({ lat: store.lat, lng: store.lng }, rawStops);
  return buildDeliveryRoutePayload(store, stops);
}

export async function classifyDeliveryOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({
        storeId: z.string().optional(),
        maxCupsPerRider: z.number().int().min(1).max(100).optional(),
      })
      .parse(req.body ?? {});

    const storeId = await adminStoreId(req, body.storeId);
    const maxCupsPerRider = body.maxCupsPerRider ?? await getMaxCupsPerRider();

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    const pending = await getPendingDeliveryOrders(storeId);
    const located: ReturnType<typeof orderToClusterable>[] = [];
    const unlocated: Array<{ orderId: string; orderNumber: string; reason: string }> = [];

    for (const order of pending) {
      const mapped = orderToClusterable(order);
      if (mapped) located.push(mapped);
      else unlocated.push({ orderId: order.id, orderNumber: order.orderNumber, reason: 'Missing coordinates' });
    }

    const locatedOrders = located.filter((o): o is NonNullable<typeof o> => o != null);
    const totalCups = locatedOrders.reduce((n, o) => n + o.itemCount, 0);
    const mode = totalCups >= DIRECTIONAL_CUP_THRESHOLD ? 'directional' : 'manual';
    const clusters = clusterOrdersByDirection(
      locatedOrders,
      { lat: store.lat, lng: store.lng },
      maxCupsPerRider,
    );

    const clustersWithRoutes = await Promise.all(
      clusters.map(async (cluster) => {
        const routePreview = await buildClusterRoutePreview(store, cluster.orders);
        return {
          ...cluster,
          routePreview: {
            stops: routePreview.stops,
            path: routePreview.path,
            summary: routePreview.summary,
          },
        };
      })
    );

    return success(res, {
      store,
      pendingCount: pending.length,
      locatedCount: located.length,
      unlocatedCount: unlocated.length,
      unlocated,
      maxCupsPerRider,
      totalCups,
      mode,
      clusters: clustersWithRoutes,
    });
  } catch (err) {
    next(err);
  }
}

export async function listAdminDeliveryJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { from: todayFrom } = todayDateRange();
    const scopedDates = resolveCashierListDateFilters(
      req.user?.role,
      statusFilter,
      req.query as Record<string, unknown>,
      {
        dateFrom: parseDateQuery(req.query.dateFrom),
        dateTo: parseDateQuery(req.query.dateTo, true),
        scheduledAtFrom: parseDateQuery(req.query.scheduledAtFrom),
        scheduledAtTo: parseDateQuery(req.query.scheduledAtTo, true),
      },
    );

    const completedAtFilter =
      scopedDates.dateFrom || scopedDates.dateTo
        ? {
            ...(scopedDates.dateFrom ? { gte: scopedDates.dateFrom } : {}),
            ...(scopedDates.dateTo ? { lte: scopedDates.dateTo } : {}),
          }
        : undefined;

    const scheduledAtFilter =
      scopedDates.scheduledAtFrom || scopedDates.scheduledAtTo
        ? {
            ...(scopedDates.scheduledAtFrom ? { gte: scopedDates.scheduledAtFrom } : {}),
            ...(scopedDates.scheduledAtTo ? { lte: scopedDates.scheduledAtTo } : {}),
          }
        : undefined;

    const vfInClient = prismaKnowsDeliveryJobStatus('VEHICLE_FAILURE');
    const incompleteNotIn = vfInClient
      ? ['COMPLETED', 'CANCELLED', 'VEHICLE_FAILURE']
      : ['COMPLETED', 'CANCELLED'];

    const statusWhere = scopedDates.liveStatusFilter
      ? { status: scopedDates.liveStatusFilter as any }
      : statusFilter === 'INCOMPLETE'
        ? ({
            OR: [
              { status: 'CANCELLED' },
              ...(vfInClient ? [{ status: 'VEHICLE_FAILURE' }] : []),
              {
                status: { notIn: incompleteNotIn },
                scheduledAt: { lt: todayFrom },
              },
            ],
          } as any)
        : statusFilter
          ? { status: statusFilter as any }
          : vfInClient
            ? { status: { notIn: ['CANCELLED', 'VEHICLE_FAILURE'] } }
            : { status: { not: 'CANCELLED' } };

    let jobs = await prisma.deliveryJob.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(driverId ? { driverId } : {}),
        ...statusWhere,
        ...(completedAtFilter ? { completedAt: completedAtFilter } : {}),
        ...(scheduledAtFilter ? { scheduledAt: scheduledAtFilter } : {}),
      },
      include: {
        store: { select: { id: true, name: true, city: true } },
        driver: { select: { id: true, name: true, email: true, phone: true } },
        jobOrders: {
          orderBy: { sequence: 'asc' },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                total: true,
                cancelReason: true,
              },
            },
          },
        },
      },
      // Latest scheduled job first, regardless of status — so Active isn't
      // grouped alphabetically by status ahead of recency.
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });

    if (!statusFilter && !scopedDates.liveStatusFilter) {
      jobs = jobs.filter((j) => j.status !== 'VEHICLE_FAILURE');
    }

    const reassignedByJob = await loadReassignedRidersByFailedJob(
      jobs.filter((j) => j.status === 'VEHICLE_FAILURE').map((j) => j.id),
    );

    return success(
      res,
      jobs.map((j) => {
        const visibleOrders = visibleJobOrderLinksForDeliveryJob(j.status, j.jobOrders);
        const deliveredCount = visibleOrders.filter((jo) => jo.order.status === 'DELIVERED').length;
        const totalRevenue = visibleOrders.reduce((sum, jo) => sum + jo.order.total, 0);
        return {
          id: j.id,
          rideCode: j.rideCode ?? null,
          title: j.title,
          status: j.status,
          createdAt: j.createdAt,
          displayStatus:
            j.status === 'CANCELLED'
              ? 'CANCELLED'
              : j.status === 'VEHICLE_FAILURE'
                ? 'VEHICLE_FAILURE'
                : j.status !== 'COMPLETED' && j.scheduledAt < todayFrom
                  ? classifyIncompleteJob(j, deliveredCount)
                  : null,
          scheduledAt: j.scheduledAt,
          assignedAt: j.assignedAt,
          startedAt: j.startedAt,
          returnStartedAt: j.returnStartedAt ?? null,
          completedAt: j.completedAt,
          orderCount: visibleOrders.length,
          deliveredCount,
          totalCups: j.totalCups ?? null,
          totalRevenue,
          totalDistanceKm: j.totalDistanceKm,
          estimatedDistanceKm: j.estimatedDistanceKm ?? j.totalDistanceKm ?? null,
          estimatedMinutes: j.estimatedMinutes ?? null,
          actualDistanceKm: j.actualDistanceKm ?? null,
          actualMinutes:
            j.startedAt && j.completedAt
              ? Math.max(1, Math.round((j.completedAt.getTime() - j.startedAt.getTime()) / 60_000))
              : null,
          totalDeliveryFees:
            j.totalDeliveryFees != null
              ? serializeDeliveryJobFees(parseDecimalFromDb(j.totalDeliveryFees))
              : null,
          hasActualRoute: Boolean(j.actualRoute),
          storeName: j.store.name,
          storeId: j.storeId,
          driver: j.driver
            ? {
                id: j.driver.id,
                name: j.driver.name,
                email: j.driver.email,
                phone: j.driver.phone ?? null,
              }
            : null,
          ...(j.status === 'VEHICLE_FAILURE'
            ? { reassignedRiders: reassignedByJob.get(j.id) ?? [] }
            : {}),
          pickedUp: jobPickedUpForList(j.startedAt, j.status),
          orders: mapListJobOrderStops(visibleOrders),
        };
      })
    );
  } catch (err) {
    next(err);
  }
}

export async function getAdminDeliveryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.id as string;
    const storeId = await resolveJobScopedStoreId(req, jobId, req.query.storeId as string | undefined);

    const job = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      include: {
        store: { select: { id: true, name: true, addressLine: true, city: true, lat: true, lng: true } },
        driver: { select: { id: true, name: true, email: true, phone: true } },
        jobOrders: adminJobOrdersInclude(jobId),
      },
    });
    if (!job || job.storeId !== storeId) throw new AppError('Job not found', 404);
    assertCashierCanViewJob(req.user?.role, job);

    const complaintsByOrder = await fetchOrderComplaintsByOrderIds(
      job.jobOrders.map((jo) => jo.orderId),
    );

    const orders = job.jobOrders.map((jo) => {
      const base = formatJobOrder(jo.order, jo.sequence, { redactPricing: false });
      const latestComplaint = (complaintsByOrder.get(jo.orderId) ?? []).find(
        (complaint) => complaint.status !== 'DISMISSED',
      );
      const delivery = deriveAdminOrderDeliveryState(
        jo.order.deliveryEvents,
        jo.order.deliveryAttempts,
        {
          orderStatus: jo.order.status,
          statusEvents: jo.order.statusEvents,
          updatedAt: jo.order.updatedAt,
          cancelReason: jo.order.cancelReason,
          complaint: latestComplaint ?? null,
        },
      );
      return {
        ...base,
        deliveryState: delivery.deliveryState,
        terminalEventAt: delivery.terminalEventAt,
        failureOutcome: delivery.failureOutcome,
        failureNote: delivery.failureNote,
      };
    });
    const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;
    const vehicleFailure = await fetchJobVehicleFailure(job.id);
    const reassignedRiders =
      job.status === 'VEHICLE_FAILURE'
        ? ((await loadReassignedRidersByFailedJob([job.id])).get(job.id) ?? [])
        : [];

    const returningToBranch =
      job.status === 'IN_PROGRESS' &&
      Boolean(job.driverId) &&
      orders.length > 0 &&
      orders.every((o) => o.deliveryState === 'Delivered' || o.deliveryState === 'Failed');

    return success(res, {
      id: job.id,
      rideCode: job.rideCode ?? null,
      title: job.title,
      status: job.status,
      createdAt: job.createdAt,
      returningToBranch,
      vehicleFailure,
      pickup:
        (job as { pickupLat?: number | null }).pickupLat != null &&
        (job as { pickupLng?: number | null }).pickupLng != null
          ? {
              lat: (job as { pickupLat: number }).pickupLat,
              lng: (job as { pickupLng: number }).pickupLng,
              label: (job as { pickupLabel?: string | null }).pickupLabel ?? 'Pickup location',
            }
          : null,
      scheduledAt: job.scheduledAt,
      assignedAt: job.assignedAt,
      startedAt: job.startedAt,
      returnStartedAt: job.returnStartedAt ?? null,
      completedAt: job.completedAt,
      totalCups: job.totalCups ?? null,
      estimatedDistanceKm: job.estimatedDistanceKm ?? job.totalDistanceKm ?? null,
      estimatedMinutes: job.estimatedMinutes ?? null,
      actualDistanceKm: job.actualDistanceKm ?? null,
      actualMinutes:
        job.startedAt && job.completedAt
          ? Math.max(1, Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 60_000))
          : null,
      totalDistanceKm: job.totalDistanceKm,
      totalDeliveryFees:
        job.totalDeliveryFees != null
          ? serializeDeliveryJobFees(parseDecimalFromDb(job.totalDeliveryFees))
          : null,
      hasActualRoute: Boolean(job.actualRoute),
      store: job.store,
      driver: job.driver
        ? {
            id: job.driver.id,
            name: job.driver.name,
            email: job.driver.email,
            phone: job.driver.phone ?? null,
          }
        : null,
      reassignedRiders,
      orderCount: orders.length,
      deliveredCount,
      pickedUp: await jobHasPickedUp(job.id, job.status),
      orders,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminDeliveryJobRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.id as string;
    const storeId = await resolveJobScopedStoreId(req, jobId, req.query.storeId as string | undefined);

    const job = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      include: {
        store: { select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true } },
        jobOrders: jobOrdersWithDetails,
      },
    });
    if (!job || job.storeId !== storeId) throw new AppError('Job not found', 404);
    assertCashierCanViewJob(req.user?.role, job);

    const rawStops: Omit<RouteStop, 'sequence' | 'distanceFromPreviousKm' | 'etaMinutesFromPrevious'>[] = [];
    for (const jo of job.jobOrders) {
      if (isActiveDeliveryJobStatus(job.status) && jo.order.status === 'CANCELLED') continue;
      const order = jo.order;
      const lat = order.deliveryLat ?? order.address?.lat;
      const lng = order.deliveryLng ?? order.address?.lng;
      if (lat == null || lng == null) continue;
      rawStops.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: resolveCustomerDisplayName({
          guestName: order.guestName,
          userName: order.user?.name,
          phone: order.guestPhone ?? order.user?.phone,
        }),
        customerPhone: order.user?.phone ?? order.guestPhone ?? '',
        addressLine: order.deliveryAddressLine ?? order.address?.addressLine ?? '',
        city: order.deliveryCity ?? order.address?.city ?? '',
        district: order.deliveryDistrict ?? order.address?.district ?? '',
        status: order.status,
        total: order.total,
        itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
        ...orderStopImageMeta(order.items),
        lat,
        lng,
        ...dropoffApiFields(order),
      });
    }

    const routeOrigin = resolveJobRouteOrigin(job);
    const pickup = resolveJobPickupOverride(job);
    const stops = optimizeDeliveryStops({ lat: routeOrigin.lat, lng: routeOrigin.lng }, rawStops);
    const payload = await buildDeliveryRoutePayload(routeOrigin, stops);
    const vehicleFailure = await fetchJobVehicleFailure(job.id);

    return success(res, {
      jobId: job.id,
      title: job.title,
      status: job.status,
      vehicleFailure,
      ...(pickup ? { branch: job.store, pickup } : {}),
      ...payload,
    });
  } catch (err) {
    next(err);
  }
}

/** Actual GPS route replay for a completed (or returning) delivery job. */
export async function getAdminDeliveryJobActualRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.id as string;
    const storeId = await resolveJobScopedStoreId(req, jobId, req.query.storeId as string | undefined);

    const job = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      include: {
        store: { select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true } },
        jobOrders: {
          orderBy: { sequence: 'asc' },
          include: {
            order: {
              select: {
                orderNumber: true,
                deliveryLat: true,
                deliveryLng: true,
                actualDropoffLat: true,
                actualDropoffLng: true,
                actualDropoffAt: true,
                address: { select: { lat: true, lng: true } },
              },
            },
          },
        },
      },
    });
    if (!job || job.storeId !== storeId) throw new AppError('Job not found', 404);
    assertCashierCanViewJob(req.user?.role, job);

    let path = parseActualRouteJson(job.actualRoute);
    let source: 'stored' | 'gps_fallback' = path.length >= 2 ? 'stored' : 'gps_fallback';

    if (path.length < 2) {
      const startedAt = job.startedAt ?? job.assignedAt ?? job.createdAt;
      const completedAt = job.completedAt ?? new Date();
      const locations = await fetchJobGpsLocations(jobId, startedAt, completedAt, job.driverId);
      if (locations.length >= 2) {
        path = await snapGpsPathForDisplay(locations);
        source = 'gps_fallback';
      }
    }

    const stops = job.jobOrders
      .map((jo) => {
        const pin = mapPinPoint(jo.order);
        if (!pin) return null;
        return { orderNumber: jo.order.orderNumber, lat: pin.lat, lng: pin.lng, ...dropoffApiFields(jo.order) };
      })
      .filter((s): s is { orderNumber: string; lat: number; lng: number } => s != null);

    return success(res, {
      jobId: job.id,
      rideCode: job.rideCode ?? null,
      title: job.title,
      status: job.status,
      store: job.store,
      estimatedDistanceKm: job.estimatedDistanceKm ?? job.totalDistanceKm ?? null,
      estimatedMinutes: job.estimatedMinutes ?? null,
      actualDistanceKm: job.actualDistanceKm ?? null,
      actualMinutes:
        job.startedAt && job.completedAt
          ? Math.max(1, Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 60_000))
          : null,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      path,
      stops,
      source,
    });
  } catch (err) {
    next(err);
  }
}

/** Live GPS path for an assigned, queued, in-progress, or returning delivery job. */
export async function getAdminDeliveryJobLiveRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.id as string;
    const storeId = await resolveJobScopedStoreId(req, jobId, req.query.storeId as string | undefined);

    const job = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      include: {
        store: { select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true } },
        jobOrders: {
          orderBy: { sequence: 'asc' },
          include: {
            order: {
              select: {
                orderNumber: true,
                deliveryLat: true,
                deliveryLng: true,
                actualDropoffLat: true,
                actualDropoffLng: true,
                actualDropoffAt: true,
                address: { select: { lat: true, lng: true } },
              },
            },
          },
        },
      },
    });
    if (!job || job.storeId !== storeId) throw new AppError('Job not found', 404);
    assertCashierCanViewJob(req.user?.role, job);

    if (!(DRIVER_HELD_JOB_STATUSES as readonly string[]).includes(job.status)) {
      throw new AppError('Live route is only available for active delivery jobs', 400);
    }

    const startedAt = job.startedAt ?? job.assignedAt ?? job.createdAt;
    let locations = await fetchJobGpsLocations(jobId, startedAt, new Date(), job.driverId);
    if (locations.length === 0 && job.driverId) {
      const latestPing = await fetchLatestDriverLocation(job.driverId);
      if (latestPing) locations = [latestPing];
    }
    const path = simplifyGpsPath(locations);
    const latest = locations[locations.length - 1];
    const vehicleFailure = await fetchJobVehicleFailure(jobId);

    const stops = job.jobOrders
      .map((jo) => {
        const pin = mapPinPoint(jo.order);
        if (!pin) return null;
        return { orderNumber: jo.order.orderNumber, lat: pin.lat, lng: pin.lng, ...dropoffApiFields(jo.order) };
      })
      .filter((s): s is { orderNumber: string; lat: number; lng: number } => s != null);

    return success(res, {
      jobId: job.id,
      rideCode: job.rideCode ?? null,
      title: job.title,
      status: job.status,
      driverId: job.driverId ?? null,
      store: job.store,
      actualDistanceKm: job.actualDistanceKm ?? null,
      startedAt: job.startedAt,
      path,
      driverPosition: latest
        ? { lat: latest.lat, lng: latest.lng, updatedAt: latest.recordedAt.toISOString() }
        : null,
      vehicleFailure,
      stops,
      source: 'live' as const,
    });
  } catch (err) {
    next(err);
  }
}

const createDriverSchema = z.object({
  storeId: z.string().optional(),
  branchIds: z.array(z.string()).optional(),
  name: z.string().min(2).max(80),
  phone: z.string().min(9).max(20),
  nicNumber: z.string().min(5).max(20).optional(),
  address: z.string().max(300).optional(),
  vehicleType: z.string().max(40).optional(),
  vehicleNumber: z.string().min(2).max(20).optional(),
  vehicleColor: z.string().max(40).optional(),
  licenseNumber: z.string().max(40).optional(),
  disabilities: z.string().max(300).optional(),
  pin: z.string().regex(/^\d{3,12}$/, 'PIN must be 3–12 digits').optional(),
  isActive: z.boolean().optional(),
});

function parseBranchIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string' && !!x.trim());
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && !!x.trim());
      }
    } catch {
      // fall through
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

const driverListSelect = {
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
  isActive: true,
  dutyStatus: true,
  meritPoints: true,
  lastLoginAt: true,
  pinLookup: true,
  store: { select: { id: true, name: true, city: true } },
  accessibleStores: { select: { id: true, name: true, city: true } },
  deliveryJobs: {
    where: { status: 'COMPLETED' as const },
    select: {
      storeId: true,
      totalDeliveryFees: true,
      riderRatingSum: true,
      riderRatingCount: true,
    },
  },
} as const;

type DriverWithStats = {
  id: string;
  name: string;
  phone: string | null;
  nicNumber: string | null;
  address?: string | null;
  vehicleType?: string | null;
  vehicleNumber: string | null;
  vehicleColor?: string | null;
  licenseNumber?: string | null;
  disabilities?: string | null;
  profilePhotoUrl: string | null;
  licenseImageUrl: string | null;
  isActive: boolean;
  dutyStatus: DriverDutyStatus;
  meritPoints?: number;
  lastLoginAt: Date | null;
  pinLookup: string | null;
  store: { id: string; name: string; city: string } | null;
  accessibleStores: { id: string; name: string; city: string }[];
  deliveryJobs: Array<{
    storeId: string;
    totalDeliveryFees: import('@prisma/client').Prisma.Decimal | null;
    riderRatingSum: number;
    riderRatingCount: number;
  }>;
};

type RiderRatingAgg = { avg: number | null; count: number };

async function riderRatingAggsByDriverId(
  driverIds: string[],
): Promise<Map<string, RiderRatingAgg>> {
  const map = new Map<string, RiderRatingAgg>();
  if (driverIds.length === 0) return map;

  const rows = await prisma.riderRating.groupBy({
    by: ['driverId'],
    where: { driverId: { in: driverIds } },
    _avg: { stars: true },
    _count: { _all: true },
  });

  for (const row of rows) {
    map.set(row.driverId, {
      avg: row._avg.stars != null ? Math.round(row._avg.stars * 10) / 10 : null,
      count: row._count._all,
    });
  }
  return map;
}

async function mapDriverWithStats(
  driver: DriverWithStats,
  storeId?: string,
  rating?: RiderRatingAgg,
) {
  const relevantJobs = storeId
    ? driver.deliveryJobs.filter((job) => job.storeId === storeId)
    : driver.deliveryJobs;
  const completedJobCount = relevantJobs.length;
  const totalDeliveryFees = relevantJobs.reduce(
    (sum, job) => sum + (job.totalDeliveryFees != null ? decimalFieldToLkrNumber(job.totalDeliveryFees) : 0),
    0,
  );
  const riderRatingCount = rating?.count ?? 0;
  const avgRiderRating = riderRatingCount > 0 ? rating?.avg ?? null : null;

  const points = driver.meritPoints ?? 100;
  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    nicNumber: driver.nicNumber,
    address: driver.address ?? null,
    vehicleType: driver.vehicleType ?? null,
    vehicleNumber: driver.vehicleNumber,
    vehicleColor: driver.vehicleColor ?? null,
    licenseNumber: driver.licenseNumber ?? null,
    disabilities: driver.disabilities ?? null,
    profilePhotoUrl: driver.profilePhotoUrl,
    licenseImageUrl: await viewableLicenseImageUrl(driver.licenseImageUrl),
    isActive: driver.isActive,
    dutyStatus: driver.dutyStatus,
    lastLoginAt: driver.lastLoginAt,
    pinLookup: driver.pinLookup,
    store: driver.store,
    accessibleStores: driver.accessibleStores,
    completedJobCount,
    totalDeliveryFees: String(totalDeliveryFees),
    avgRiderRating,
    riderRatingCount,
    meritPoints: points,
    meritStatus: meritStatusBand(points),
  };
}

const DRIVER_DUTY_STATUSES: DriverDutyStatus[] = ['ONLINE', 'ON_DELIVERY', 'OFF_DUTY'];

function parseDriverListFilters(query: Request['query']) {
  const name = typeof query.name === 'string' ? query.name.trim() : '';
  const isActive =
    query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
  const dutyStatus =
    typeof query.dutyStatus === 'string' &&
    DRIVER_DUTY_STATUSES.includes(query.dutyStatus as DriverDutyStatus)
      ? (query.dutyStatus as DriverDutyStatus)
      : undefined;
  const pageRaw = Array.isArray(query.page) ? query.page[0] : query.page;
  const paginate = pageRaw != null && String(pageRaw).trim() !== '';
  return { name, isActive, dutyStatus, paginate };
}

function driverListWhere(
  storeId: string | undefined,
  filters: { name: string; isActive: boolean | undefined; dutyStatus: DriverDutyStatus | undefined },
): Prisma.AdminUserWhereInput {
  return {
    role: { name: 'DELIVERY_DRIVER' },
    ...(storeId
      ? {
          OR: [{ accessibleStores: { some: { id: storeId } } }, { storeId }],
        }
      : {}),
    ...(filters.name ? { name: { contains: filters.name, mode: 'insensitive' } } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.dutyStatus ? { dutyStatus: filters.dutyStatus } : {}),
  };
}

async function loadMappedDrivers(args: {
  where: Prisma.AdminUserWhereInput;
  statsStoreId?: string;
  jobStoreId?: string;
  orderBy: Prisma.AdminUserOrderByWithRelationInput | Prisma.AdminUserOrderByWithRelationInput[];
  skip?: number;
  take?: number;
}) {
  const drivers = await prisma.adminUser.findMany({
    where: args.where,
    select: {
      ...driverListSelect,
      deliveryJobs: {
        where: {
          status: 'COMPLETED',
          ...(args.jobStoreId ? { storeId: args.jobStoreId } : {}),
        },
        select: {
          storeId: true,
          totalDeliveryFees: true,
          riderRatingSum: true,
          riderRatingCount: true,
        },
      },
    },
    orderBy: args.orderBy,
    ...(args.skip !== undefined ? { skip: args.skip } : {}),
    ...(args.take !== undefined ? { take: args.take } : {}),
  });

  const ratingAggs = await riderRatingAggsByDriverId(drivers.map((driver) => driver.id));
  return Promise.all(
    drivers.map((driver) => mapDriverWithStats(driver, args.statsStoreId, ratingAggs.get(driver.id))),
  );
}

async function respondWithDriverList(
  res: Response,
  query: Request['query'],
  args: {
    where: Prisma.AdminUserWhereInput;
    statsStoreId?: string;
    jobStoreId?: string;
    orderBy: Prisma.AdminUserOrderByWithRelationInput | Prisma.AdminUserOrderByWithRelationInput[];
  },
) {
  if (!parseDriverListFilters(query).paginate) {
    return success(res, await loadMappedDrivers(args));
  }

  const { page, pageSize, skip } = parsePageQuery(query);
  const [total, rows] = await Promise.all([
    prisma.adminUser.count({ where: args.where }),
    loadMappedDrivers({ ...args, skip, take: pageSize }),
  ]);
  return success(res, { rows, total, page, pageSize });
}

export async function listDeliveryDrivers(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const filters = parseDriverListFilters(req.query);
    return await respondWithDriverList(res, req.query, {
      where: driverListWhere(storeId, filters),
      statsStoreId: storeId,
      jobStoreId: storeId,
      orderBy: { name: 'asc' },
    });
  } catch (err) {
    next(err);
  }
}

export async function getDriverRatings(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.params.id as string;
    const driver = await prisma.adminUser.findFirst({
      where: { id: driverId, role: { name: 'DELIVERY_DRIVER' } },
      select: { id: true },
    });
    if (!driver) throw new AppError('Driver not found', 404);

    const ratings = await prisma.riderRating.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        stars: true,
        comment: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
    });

    const count = ratings.length;
    const average = count
      ? Math.round((ratings.reduce((sum, r) => r.stars + sum, 0) / count) * 10) / 10
      : null;

    return success(res, {
      average,
      count,
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

export async function getBranchDriverPool(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreId(req, req.params.storeId as string);
    const filters = parseDriverListFilters(req.query);
    return await respondWithDriverList(res, req.query, {
      where: driverListWhere(storeId, filters),
      statsStoreId: storeId,
      jobStoreId: storeId,
      orderBy: [{ dutyStatus: 'asc' }, { name: 'asc' }],
    });
  } catch (err) {
    next(err);
  }
}

const createdDriverSelect = {
  id: true,
  name: true,
  phone: true,
  nicNumber: true,
  vehicleNumber: true,
  profilePhotoUrl: true,
  licenseImageUrl: true,
  isActive: true,
  dutyStatus: true,
  store: { select: { id: true, name: true, city: true } },
  accessibleStores: { select: { id: true, name: true, city: true } },
} as const;

type CreatedDriver = Prisma.AdminUserGetPayload<{ select: typeof createdDriverSelect }>;

async function reconnectPrisma(): Promise<void> {
  await prisma.$disconnect().catch(() => undefined);
  await prisma.$connect();
}

/** A retry after insert already committed should return that rider, not insert again. */
async function findDriverCommittedForPin(
  primaryStoreId: string,
  pinLookup: string,
): Promise<CreatedDriver | null> {
  return prisma.adminUser.findFirst({
    where: {
      storeId: primaryStoreId,
      pinLookup,
      role: { name: 'DELIVERY_DRIVER' },
    },
    select: createdDriverSelect,
  });
}

/** Retry after insert committed for OTP-only riders (no pinLookup). */
async function findDriverCommittedForPhone(
  primaryStoreId: string,
  phone: string,
): Promise<CreatedDriver | null> {
  const canonical = parseDriverPhone(phone);
  return prisma.adminUser.findFirst({
    where: {
      storeId: primaryStoreId,
      phone: { in: phoneLookupVariants(canonical) },
      role: { name: 'DELIVERY_DRIVER' },
    },
    select: createdDriverSelect,
  });
}

async function insertDeliveryDriver(args: {
  body: z.infer<typeof createDriverSchema>;
  branchIds: string[];
  primaryStoreId: string;
  passwordHash: string;
  pinLookup: string | null;
  profilePhotoUrl?: string;
  licenseImageUrl: string;
  replay: boolean;
}): Promise<CreatedDriver> {
  const stores = await prisma.store.findMany({
    where: { id: { in: args.branchIds } },
    select: { id: true },
  });
  if (stores.length !== args.branchIds.length) {
    throw new AppError('One or more branches were not found', 404);
  }

  if (args.replay) {
    const existing = args.pinLookup
      ? await findDriverCommittedForPin(args.primaryStoreId, args.pinLookup)
      : await findDriverCommittedForPhone(args.primaryStoreId, args.body.phone);
    if (existing) {
      await syncRiderProfileFromAdminUser(existing.id);
      return existing;
    }
  }

  const phone = await assertDriverPhoneAvailable(args.body.phone);
  if (args.body.pin) {
    await assertDriverPinAvailable(args.primaryStoreId, args.body.pin);
  }
  const driver = await prisma.adminUser.create({
    data: {
      name: args.body.name,
      email: driverInternalEmail(),
      passwordHash: args.passwordHash,
      pinLookup: args.pinLookup,
      phone,
      nicNumber: args.body.nicNumber,
      address: args.body.address,
      vehicleType: args.body.vehicleType,
      vehicleNumber: args.body.vehicleNumber,
      vehicleColor: args.body.vehicleColor,
      licenseNumber: args.body.licenseNumber,
      disabilities: args.body.disabilities,
      profilePhotoUrl: args.profilePhotoUrl,
      licenseImageUrl: args.licenseImageUrl,
      isActive: args.body.isActive ?? true,
      dutyStatus: 'OFF_DUTY',
      meritPoints: 100,
      role: { connect: { name: 'DELIVERY_DRIVER' } },
      store: { connect: { id: args.primaryStoreId } },
      accessibleStores: { connect: args.branchIds.map((id) => ({ id })) },
    },
    select: createdDriverSelect,
  });

  await syncRiderProfileFromAdminUser(driver.id);
  return driver;
}

export async function createDeliveryDriver(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedBranchIds = parseBranchIds(req.body?.branchIds);
    const body = createDriverSchema.parse({
      ...req.body,
      branchIds: parsedBranchIds.length ? parsedBranchIds : undefined,
      isActive:
        req.body?.isActive === 'true' || req.body?.isActive === true
          ? true
          : req.body?.isActive === 'false' || req.body?.isActive === false
            ? false
            : undefined,
    });

    const branchIds = body.branchIds?.length ? body.branchIds : body.storeId ? [body.storeId] : [];
    if (branchIds.length === 0) {
      throw new AppError('At least one branch must be selected', 400);
    }

    const primaryStoreId = branchIds[0];
    const passwordHash = body.pin
      ? await hashDriverPin(body.pin)
      : await hashDriverPlaceholderPassword();
    const pinLookup = body.pin ? driverPinLookup(primaryStoreId, body.pin) : null;

    const files = req.files as { profilePhoto?: Express.Multer.File[]; licenseImage?: Express.Multer.File[] } | undefined;
    if (!files?.licenseImage?.[0]) {
      throw new AppError('Driving licence image is required', 400);
    }

    let profilePhotoUrl: string | undefined;
    if (files?.profilePhoto?.[0]) {
      const file = files.profilePhoto[0];
      profilePhotoUrl = await uploadDriverAsset(file.buffer, file.originalname, file.mimetype, 'profile');
    }
    const licenseFile = files.licenseImage[0];
    const licenseImageUrl = await uploadDriverAsset(
      licenseFile.buffer,
      licenseFile.originalname,
      licenseFile.mimetype,
      'license',
    );

    let attempt = 0;
    const driver = await retryOnceOnDisconnect(async () => {
      attempt += 1;
      return insertDeliveryDriver({
        body,
        branchIds,
        primaryStoreId,
        passwordHash,
        pinLookup,
        profilePhotoUrl,
        licenseImageUrl,
        replay: attempt > 1,
      });
    }, reconnectPrisma);

    return success(
      res,
      {
        ...driver,
        licenseImageUrl: await viewableLicenseImageUrlWithTimeout(driver.licenseImageUrl),
      },
      201,
    );
  } catch (err) {
    next(err);
  }
}

const updateDriverSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    phone: z.string().min(9).max(20).optional(),
    nicNumber: z.string().min(5).max(20).optional(),
    address: z.string().max(300).optional(),
    vehicleType: z.string().max(40).optional(),
    vehicleNumber: z.string().min(2).max(20).optional(),
    vehicleColor: z.string().max(40).optional(),
    licenseNumber: z.string().max(40).optional(),
    disabilities: z.string().max(300).optional(),
    branchIds: z.array(z.string()).min(1).optional(),
    isActive: z.boolean().optional(),
    pin: z.string().regex(/^\d{3,12}$/, 'PIN must be 3–12 digits').optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field is required',
  });

export async function updateDeliveryDriver(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.params.id as string;
    const parsedBranchIds = parseBranchIds(req.body?.branchIds);
    const body = updateDriverSchema.parse({
      ...req.body,
      branchIds: parsedBranchIds.length ? parsedBranchIds : undefined,
      isActive:
        req.body?.isActive === 'true' || req.body?.isActive === true
          ? true
          : req.body?.isActive === 'false' || req.body?.isActive === false
            ? false
            : undefined,
    });

    const existing = await prisma.adminUser.findFirst({
      where: { id: driverId, role: { name: 'DELIVERY_DRIVER' } },
      select: { id: true, isActive: true, storeId: true, pinLookup: true },
    });
    if (!existing) throw new AppError('Driver not found', 404);

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) {
      data.phone = await assertDriverPhoneAvailable(body.phone, driverId);
    }
    if (body.nicNumber !== undefined) data.nicNumber = body.nicNumber;
    if (body.address !== undefined) data.address = body.address;
    if (body.vehicleType !== undefined) data.vehicleType = body.vehicleType;
    if (body.vehicleNumber !== undefined) data.vehicleNumber = body.vehicleNumber;
    if (body.vehicleColor !== undefined) data.vehicleColor = body.vehicleColor;
    if (body.licenseNumber !== undefined) data.licenseNumber = body.licenseNumber;
    if (body.disabilities !== undefined) data.disabilities = body.disabilities;
    if (body.isActive !== undefined) {
      data.isActive = body.isActive;
      if (!body.isActive) data.dutyStatus = 'OFF_DUTY';
    }

    let primaryStoreId = existing.storeId ?? undefined;

    if (body.branchIds) {
      const branchIds = body.branchIds;
      const stores = await prisma.store.findMany({
        where: { id: { in: branchIds } },
        select: { id: true },
      });
      if (stores.length !== branchIds.length) {
        throw new AppError('One or more branches were not found', 404);
      }

      if (existing.storeId && branchIds.includes(existing.storeId)) {
        primaryStoreId = existing.storeId;
      } else {
        primaryStoreId = branchIds[0];
        if (!body.pin && existing.pinLookup) {
          data.pinLookup = null;
        }
      }

      data.store = { connect: { id: primaryStoreId } };
      data.accessibleStores = { set: branchIds.map((id) => ({ id })) };
    }

    if (body.pin) {
      if (!primaryStoreId) throw new AppError('Driver has no primary branch assigned', 400);
      await assertDriverPinAvailable(primaryStoreId, body.pin, driverId);
      data.passwordHash = await hashDriverPin(body.pin);
      data.pinLookup = driverPinLookup(primaryStoreId, body.pin);
    }

    const files = req.files as { profilePhoto?: Express.Multer.File[]; licenseImage?: Express.Multer.File[] } | undefined;

    if (files?.profilePhoto?.[0]) {
      const file = files.profilePhoto[0];
      data.profilePhotoUrl = await uploadDriverAsset(file.buffer, file.originalname, file.mimetype, 'profile');
    }
    if (files?.licenseImage?.[0]) {
      const file = files.licenseImage[0];
      data.licenseImageUrl = await uploadDriverAsset(file.buffer, file.originalname, file.mimetype, 'license');
    }

    const driver = await prisma.adminUser.update({
      where: { id: driverId },
      data,
      select: {
        id: true,
        name: true,
        phone: true,
        nicNumber: true,
        vehicleNumber: true,
        profilePhotoUrl: true,
        licenseImageUrl: true,
        isActive: true,
        dutyStatus: true,
        lastLoginAt: true,
        store: { select: { id: true, name: true, city: true } },
        accessibleStores: { select: { id: true, name: true, city: true } },
      },
    });

    await syncRiderProfileFromAdminUser(driver.id);

    return success(res, {
      ...driver,
      licenseImageUrl: await viewableLicenseImageUrl(driver.licenseImageUrl),
    });
  } catch (err) {
    next(err);
  }
}

export async function previewDeliveryRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({
        storeId: z.string().optional(),
        orderIds: z.array(z.string()).min(1),
        title: z.string().optional(),
      })
      .parse(req.body ?? {});

    const storeId = await adminStoreId(req, body.storeId);
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    const pending = await getPendingDeliveryOrders(storeId);
    const byId = new Map(pending.map((o) => [o.id, o]));
    const selected: ReturnType<typeof orderToClusterable>[] = [];

    for (const orderId of body.orderIds) {
      const order = byId.get(orderId);
      if (!order) throw new AppError('One or more orders are no longer available for delivery', 400);
      const mapped = orderToClusterable(order);
      if (!mapped) {
        throw new AppError(`Order ${order.orderNumber} is missing delivery coordinates`, 400);
      }
      selected.push(mapped);
    }

    const payload = await buildClusterRoutePreview(store, selected);

    return success(res, {
      title: body.title,
      ...payload,
    });
  } catch (err) {
    next(err);
  }
}

export async function listPendingDeliveryOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreId(req, req.query.storeId as string | undefined);
    const pending = await getPendingDeliveryOrders(storeId);

    return success(
      res,
      pending.map((order) => ({
        ...formatJobOrder(order, 0, { redactPricing: false }),
        hasLocation: (order.deliveryLat ?? order.address?.lat) != null,
      }))
    );
  } catch (err) {
    next(err);
  }
}

const LIVE_MAP_JOB_STATUSES = ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'] as const;

const LIVE_JOB_STATUS_RANK: Record<string, number> = {
  IN_PROGRESS: 0,
  RETURNING: 1,
  ASSIGNED: 2,
  QUEUED: 3,
};

function pickCurrentLiveJob<T extends { status: string }>(jobs: T[]): T | null {
  if (jobs.length === 0) return null;
  return [...jobs].sort(
    (a, b) => (LIVE_JOB_STATUS_RANK[a.status] ?? 9) - (LIVE_JOB_STATUS_RANK[b.status] ?? 9),
  )[0] ?? null;
}

type LiveJobOrderLink = {
  orderId: string;
  sequence: number;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    cancelReason?: string | null;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    actualDropoffLat?: number | null;
    actualDropoffLng?: number | null;
    actualDropoffAt?: Date | string | null;
  };
};

type LiveNextStop = {
  kind: 'branch' | 'stop' | 'return';
  sequence: number | null;
  label: string;
  lat: number;
  lng: number;
};

function storePoint(
  store: { lat?: number | null; lng?: number | null } | null | undefined,
): { lat: number; lng: number } | null {
  if (store?.lat == null || store?.lng == null) return null;
  return { lat: store.lat, lng: store.lng };
}

function resolveLiveNextStop(
  job: {
    status: string;
    startedAt: Date | null;
    jobOrders: LiveJobOrderLink[];
  },
  branch: { lat: number; lng: number } | null,
): LiveNextStop | null {
  const pickedUp = jobPickedUpForList(job.startedAt, job.status);
  const headingToBranch = job.status === 'RETURNING' || (!pickedUp && job.status !== 'IN_PROGRESS');
  if (headingToBranch && branch) {
    const returning = job.status === 'RETURNING' || pickedUp;
    return {
      kind: returning ? 'return' : 'branch',
      sequence: null,
      label: returning ? 'Return' : 'Pickup',
      lat: branch.lat,
      lng: branch.lng,
    };
  }

  const visible = visibleJobOrderLinksForDeliveryJob(job.status, job.jobOrders);
  const pending = visible.find((link) => {
    const state = deliveryStateFromOrderStatusForList(link.order.status, link.order.cancelReason);
    return (
      state === 'Pending' &&
      link.order.status !== 'CANCELLED' &&
      link.order.deliveryLat != null &&
      link.order.deliveryLng != null
    );
  });
  if (pending?.order.deliveryLat != null && pending.order.deliveryLng != null) {
    return {
      kind: 'stop',
      sequence: pending.sequence,
      label: `#${pending.sequence}`,
      lat: pending.order.deliveryLat,
      lng: pending.order.deliveryLng,
    };
  }

  if (branch) {
    const returning = pickedUp || job.status === 'IN_PROGRESS' || job.status === 'RETURNING';
    return {
      kind: returning ? 'return' : 'branch',
      sequence: null,
      label: returning ? 'Return' : 'Pickup',
      lat: branch.lat,
      lng: branch.lng,
    };
  }
  return null;
}

export async function listLiveDrivers(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const activeJobOnBranch = storeId
      ? {
          deliveryJobs: {
            some: { storeId, status: { in: [...LIVE_MAP_JOB_STATUSES] } },
          },
        }
      : {
          deliveryJobs: {
            some: { status: { in: [...LIVE_MAP_JOB_STATUSES] } },
          },
        };

    const drivers = await prisma.adminUser.findMany({
      where: {
        role: { name: 'DELIVERY_DRIVER' },
        isActive: true,
        AND: [
          {
            OR: [
              { dutyStatus: { in: ['ONLINE', 'ON_DELIVERY'] } },
              activeJobOnBranch,
            ],
          },
          ...(storeId
            ? [
                {
                  OR: [{ storeId }, activeJobOnBranch],
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        dutyStatus: true,
        vehicleNumber: true,
        storeId: true,
        store: { select: { id: true, name: true, lat: true, lng: true } },
        driverLocations: {
          orderBy: { recordedAt: 'desc' },
          take: 10,
          select: { lat: true, lng: true, recordedAt: true, jobId: true, heading: true },
        },
        deliveryJobs: {
          where: {
            status: { in: ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'] },
            ...(storeId ? { storeId } : {}),
          },
          select: {
            id: true,
            status: true,
            title: true,
            startedAt: true,
            jobOrders: {
              orderBy: { sequence: 'asc' },
              select: {
                orderId: true,
                sequence: true,
                order: {
                  select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    cancelReason: true,
                    deliveryLat: true,
                    deliveryLng: true,
                    actualDropoffLat: true,
                    actualDropoffLng: true,
                    actualDropoffAt: true,
                  },
                },
              },
            },
          },
          take: 5,
        },
      },
    });

    const scopedStore =
      storeId != null
        ? await prisma.store.findUnique({
            where: { id: storeId },
            select: { id: true, name: true, lat: true, lng: true },
          })
        : null;

    return success(
      res,
      drivers.map((d) => {
        const loc = d.driverLocations[0];
        const recentPath = [...d.driverLocations].reverse().map((point) => ({
          lat: point.lat,
          lng: point.lng,
          recordedAt: point.recordedAt,
          heading: point.heading ?? null,
        }));
        const activeJobs = d.deliveryJobs.map((job) => ({
          id: job.id,
          status: job.status,
          title: job.title,
        }));
        const current = pickCurrentLiveJob(d.deliveryJobs);
        const displayStoreId = scopedStore?.id ?? d.storeId;
        const displayStoreName = scopedStore?.name ?? d.store?.name ?? null;
        const branchPoint = storePoint(scopedStore) ?? storePoint(d.store);
        const currentJob = current
          ? {
              id: current.id,
              status: current.status,
              title: current.title,
              pickedUp: jobPickedUpForList(current.startedAt, current.status),
              orders: mapListJobOrderStops(
                visibleJobOrderLinksForDeliveryJob(current.status, current.jobOrders),
              ),
              nextStop: resolveLiveNextStop(current, branchPoint),
              lastDropoff: resolveLiveLastDropoff(current.jobOrders),
            }
          : null;
        return {
          driverId: d.id,
          name: d.name,
          dutyStatus: d.dutyStatus,
          vehicleNumber: d.vehicleNumber,
          storeId: displayStoreId,
          storeName: displayStoreName,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          heading: loc?.heading ?? null,
          updatedAt: loc?.recordedAt ?? null,
          jobId: loc?.jobId ?? currentJob?.id ?? null,
          activeJobs,
          currentJob,
          recentPath,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
}

const deliveryFailureListInclude = {
  driver: { select: { id: true, name: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      storeId: true,
      deliveryAddressLine: true,
      deliveryCity: true,
      deliveryDistrict: true,
      deliveryLat: true,
      deliveryLng: true,
      guestName: true,
      guestPhone: true,
      user: { select: { name: true, phone: true } },
      store: {
        select: { id: true, name: true, lat: true, lng: true, addressLine: true },
      },
    },
  },
} as const;

async function buildDeliveryFailuresPayload(
  rows: Prisma.DeliveryAttemptGetPayload<{ include: typeof deliveryFailureListInclude }>[],
) {

    const orderIds = [...new Set(rows.map((row) => row.orderId))];
    const jobIds = [...new Set(rows.map((row) => row.jobId))];
    const [links, originalStops, jobs] = await Promise.all([
      orderIds.length === 0
        ? Promise.resolve([])
        : prisma.deliveryJobOrder.findMany({
            where: {
              orderId: { in: orderIds },
              job: { status: { in: [...REDELIVERY_JOB_STATUSES] } },
            },
            select: {
              orderId: true,
              jobId: true,
              job: {
                select: {
                  id: true,
                  status: true,
                  createdAt: true,
                  driver: { select: { id: true, name: true } },
                },
              },
            },
          }),
      jobIds.length === 0
        ? Promise.resolve([])
        : prisma.deliveryJobOrder.findMany({
            where: { jobId: { in: jobIds } },
            select: {
              jobId: true,
              orderId: true,
              sequence: true,
              order: { select: { orderNumber: true, status: true } },
            },
          }),
      jobIds.length === 0
        ? Promise.resolve([])
        : prisma.deliveryJob.findMany({
            where: { id: { in: jobIds } },
            select: {
              id: true,
              rideCode: true,
              store: { select: { id: true, name: true } },
            },
          }),
    ]);

    const linksByOrder = new Map<string, typeof links>();
    for (const link of links) {
      const list = linksByOrder.get(link.orderId) ?? [];
      list.push(link);
      linksByOrder.set(link.orderId, list);
    }

    const stopsByJob = new Map<string, typeof originalStops>();
    for (const stop of originalStops) {
      const list = stopsByJob.get(stop.jobId) ?? [];
      list.push(stop);
      stopsByJob.set(stop.jobId, list);
    }

    const jobById = new Map(jobs.map((job) => [job.id, job]));

    const latestAttemptIdByOrder = new Map<string, string>();
    for (const row of rows) {
      if (!latestAttemptIdByOrder.has(row.orderId)) {
        latestAttemptIdByOrder.set(row.orderId, row.id);
      }
    }

    return rows.map((row) => {
      const derived = deriveFailureReassignment({
        orderStatus: row.order.status,
        originalJobId: row.jobId,
        jobsForOrder: linksByOrder.get(row.orderId) ?? [],
        attemptOutcome: row.outcome,
      });
      const customerName = resolveCustomerDisplayName({
        guestName: row.order.guestName,
        userName: row.order.user?.name,
        phone: row.order.guestPhone ?? row.order.user?.phone,
      });
      const isLatestForOrder = latestAttemptIdByOrder.get(row.orderId) === row.id;
      const forwardOrders = collectForwardOrders({
        failedOrderId: row.orderId,
        stops: (stopsByJob.get(row.jobId) ?? []).map((stop) => ({
          orderId: stop.orderId,
          sequence: stop.sequence,
          orderNumber: stop.order.orderNumber,
          status: stop.order.status,
        })),
      });
      return {
        ...row,
        job: jobById.get(row.jobId) ?? null,
        customerName,
        reassignmentStatus: derived.reassignmentStatus,
        activeRedeliveryJob: derived.activeRedeliveryJob,
        canAssign:
          failureOutcomeAllowsRiderReassignment(row.outcome) &&
          derived.reassignmentStatus === 'needs_assignment' &&
          isLatestForOrder,
        forwardOrders,
      };
    });
}

export async function listDeliveryFailures(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const where = {
      outcome: { not: 'DELIVERED' as const },
      ...(storeId ? { order: { storeId } } : {}),
    };
    const orderBy = { createdAt: 'desc' as const };
    const paginate = wantsPagedList(req.query);

    if (paginate) {
      const { page, pageSize, skip } = parsePageQuery(req.query);
      const [total, rows] = await Promise.all([
        prisma.deliveryAttempt.count({ where }),
        prisma.deliveryAttempt.findMany({
          where,
          orderBy,
          skip,
          take: pageSize,
          include: deliveryFailureListInclude,
        }),
      ]);
      const payload = await buildDeliveryFailuresPayload(rows);
      return success(res, { rows: payload, total, page, pageSize });
    }

    const rows = await prisma.deliveryAttempt.findMany({
      where,
      orderBy,
      take: 200,
      include: deliveryFailureListInclude,
    });
    const payload = await buildDeliveryFailuresPayload(rows);
    return success(res, payload);
  } catch (err) {
    next(err);
  }
}

const reassignFailureSchema = z.object({
  assignments: z
    .array(
      z.object({
        driverId: z.string().min(1),
        orderIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

export async function reassignDeliveryFailure(req: Request, res: Response, next: NextFunction) {
  try {
    const { assignments } = reassignFailureSchema.parse(req.body);
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const result = await reassignFailedDeliveryOrders({
      attemptId: req.params.attemptId as string,
      assignments,
      allowedStoreId: storeId,
    });
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
}

const driverComplaintListInclude = {
  driver: { select: { id: true, name: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      deliveryAddressLine: true,
      deliveryCity: true,
      deliveryDistrict: true,
      guestName: true,
      guestPhone: true,
      user: { select: { name: true, phone: true } },
    },
  },
} as const;

async function mapDriverComplaintRows(
  rows: Prisma.DriverComplaintGetPayload<{ include: typeof driverComplaintListInclude }>[],
) {
  const resolverIds = [...new Set(rows.map((r) => r.resolvedBy).filter(Boolean))] as string[];
  const resolvers =
    resolverIds.length > 0
      ? await prisma.adminUser.findMany({
          where: { id: { in: resolverIds } },
          select: { id: true, name: true },
        })
      : [];
  const resolverNames = new Map(resolvers.map((u) => [u.id, u.name]));

  return rows.map((row) => ({
    ...row,
    resolvedByName: row.resolvedBy ? (resolverNames.get(row.resolvedBy) ?? null) : null,
  }));
}

export async function listDriverComplaints(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const where = storeId ? { storeId } : {};
    const orderBy = { createdAt: 'desc' as const };
    const paginate = wantsPagedList(req.query);

    if (paginate) {
      const { page, pageSize, skip } = parsePageQuery(req.query);
      const [total, rows] = await Promise.all([
        prisma.driverComplaint.count({ where }),
        prisma.driverComplaint.findMany({
          where,
          orderBy,
          skip,
          take: pageSize,
          include: driverComplaintListInclude,
        }),
      ]);
      const mapped = await mapDriverComplaintRows(rows);
      return success(res, { rows: mapped, total, page, pageSize });
    }

    const rows = await prisma.driverComplaint.findMany({
      where,
      orderBy,
      take: 200,
      include: driverComplaintListInclude,
    });
    const mapped = await mapDriverComplaintRows(rows);
    return success(res, mapped);
  } catch (err) {
    next(err);
  }
}

export async function getDriverComplaint(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const scopedStoreId = await adminStoreIdOptional(req);

    const row = await prisma.driverComplaint.findUnique({
      where: { id },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            meritPoints: true,
            vehicleType: true,
            vehicleNumber: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            orderMode: true,
            channel: true,
            createdAt: true,
            notes: true,
            paymentMethod: true,
            paymentStatus: true,
            subtotal: true,
            deliveryFee: true,
            convenientFee: true,
            discount: true,
            loyaltyDiscount: true,
            total: true,
            deliveryAddressLine: true,
            deliveryCity: true,
            deliveryDistrict: true,
            deliveryLat: true,
            deliveryLng: true,
            guestName: true,
            guestPhone: true,
            user: { select: { name: true, phone: true } },
            items: {
              select: {
                productName: true,
                size: true,
                quantity: true,
                unitPrice: true,
                totalPrice: true,
                toppings: { select: { toppingName: true, extraPrice: true } },
              },
            },
          },
        },
      },
    });

    if (!row) throw new AppError('Complaint not found', 404);
    if (scopedStoreId && row.storeId !== scopedStoreId) {
      throw new AppError('Complaint not found', 404);
    }

    let resolvedByName: string | null = null;
    if (row.resolvedBy) {
      const resolver = await prisma.adminUser.findUnique({
        where: { id: row.resolvedBy },
        select: { name: true },
      });
      resolvedByName = resolver?.name ?? null;
    }

    const otherComplaintsCount = await prisma.driverComplaint.count({
      where: { orderId: row.orderId, id: { not: id } },
    });

    return success(res, {
      ...row,
      resolvedByName,
      otherComplaintsCount,
    });
  } catch (err) {
    next(err);
  }
}

const complaintStatusSchema = z.object({
  status: z.enum(['OPEN', 'CONFIRMED', 'DISMISSED', 'RESOLVED']),
});

export async function updateDriverComplaint(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const body = complaintStatusSchema.parse(req.body);
    const existing = await prisma.driverComplaint.findUnique({ where: { id } });
    if (!existing) throw new AppError('Complaint not found', 404);

    const updated = await prisma.driverComplaint.update({
      where: { id },
      data: {
        status: body.status,
        resolvedAt: body.status === 'OPEN' ? null : new Date(),
        resolvedBy: req.user?.sub,
      },
    });

    if (body.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
      await applyMeritDelta({
        driverId: existing.driverId,
        orderId: existing.orderId,
        delta: MERIT_DELTAS.CONFIRMED_COMPLAINT,
        eventType: 'CONFIRMED_COMPLAINT',
        reason: `Confirmed customer complaint: ${existing.category}`,
        createdBy: req.user?.sub ?? 'ADMIN',
      }).catch(() => {});
    }

    if (existing.status !== updated.status) {
      notifyDriverComplaintStatusChange(existing.status, updated).catch(() => {});
    }

    return success(res, updated);
  } catch (err) {
    next(err);
  }
}

const driverBranchRequestListInclude = {
  driver: { select: { id: true, name: true, storeId: true } },
} as const;

async function mapDriverBranchRequestRows(
  rows: Prisma.DriverBranchRequestGetPayload<{ include: typeof driverBranchRequestListInclude }>[],
) {
  const storeIds = [
    ...new Set(rows.flatMap((r) => [r.toStoreId, r.fromStoreId].filter(Boolean))),
  ];
  const stores =
    storeIds.length > 0
      ? await prisma.store.findMany({
          where: { id: { in: storeIds as string[] } },
          select: { id: true, name: true },
        })
      : [];
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));

  return rows.map((row) => ({
    ...row,
    toStoreName: storeNames.get(row.toStoreId) ?? null,
    fromStoreName: row.fromStoreId ? storeNames.get(row.fromStoreId) ?? null : null,
  }));
}

export async function listDriverBranchRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where = status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {};
    const orderBy = [{ status: 'asc' as const }, { createdAt: 'desc' as const }];
    const paginate = wantsPagedList(req.query);

    if (paginate) {
      const { page, pageSize, skip } = parsePageQuery(req.query);
      const [total, rows] = await Promise.all([
        prisma.driverBranchRequest.count({ where }),
        prisma.driverBranchRequest.findMany({
          where,
          orderBy,
          skip,
          take: pageSize,
          include: driverBranchRequestListInclude,
        }),
      ]);
      const mapped = await mapDriverBranchRequestRows(rows);
      return success(res, { rows: mapped, total, page, pageSize });
    }

    const rows = await prisma.driverBranchRequest.findMany({
      where,
      orderBy,
      take: 200,
      include: driverBranchRequestListInclude,
    });
    const mapped = await mapDriverBranchRequestRows(rows);
    return success(res, mapped);
  } catch (err) {
    next(err);
  }
}

const branchReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().max(500).optional(),
});

export async function reviewDriverBranchRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const body = branchReviewSchema.parse(req.body);
    const request = await prisma.driverBranchRequest.findUnique({ where: { id } });
    if (!request) throw new AppError('Request not found', 404);
    if (request.status !== 'PENDING') throw new AppError('Request already reviewed', 400);

    if (body.status === 'APPROVED') {
      if (request.type === 'CHANGE_BRANCH') {
        await prisma.adminUser.update({
          where: { id: request.driverId },
          data: {
            store: { connect: { id: request.toStoreId } },
            accessibleStores: { connect: { id: request.toStoreId } },
          },
        });
      } else if (request.type === 'REMOVE_BRANCH') {
        const driver = await prisma.adminUser.findUnique({
          where: { id: request.driverId },
          select: { storeId: true },
        });
        if (driver?.storeId === request.toStoreId) {
          throw new AppError('Cannot remove the driver home branch while it is still their home store', 400);
        }
        await prisma.adminUser.update({
          where: { id: request.driverId },
          data: { accessibleStores: { disconnect: { id: request.toStoreId } } },
        });
      } else {
        await prisma.adminUser.update({
          where: { id: request.driverId },
          data: { accessibleStores: { connect: { id: request.toStoreId } } },
        });
      }
    }

    const updated = await prisma.driverBranchRequest.update({
      where: { id },
      data: {
        status: body.status,
        reviewedById: req.user?.sub,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote,
      },
    });

    const store = updated.toStoreId
      ? await prisma.store.findUnique({
          where: { id: updated.toStoreId },
          select: { name: true },
        })
      : null;
    notifyDriverBranchRequestReviewed(updated, store?.name).catch(() => {});

    return success(res, updated);
  } catch (err) {
    next(err);
  }
}

const APP_TIMEZONE = 'Asia/Colombo';

function wantsPagedList(query: Request['query']): boolean {
  const pageRaw = Array.isArray(query.page) ? query.page[0] : query.page;
  return pageRaw != null && String(pageRaw).trim() !== '';
}

function parsePageQuery(
  query: Request['query'],
  defaultPageSize = 20,
  maxPageSize = 100,
): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, parseInt(String(query.pageSize ?? String(defaultPageSize)), 10) || defaultPageSize),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function buildAssignedAtRange(dateFrom?: Date, dateTo?: Date) {
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom ? { gte: dateFrom } : {}),
    ...(dateTo ? { lte: dateTo } : {}),
  };
}

function buildAnalyticsJobWhere(
  storeId: string | undefined,
  driverId: string | undefined,
  dateFrom?: Date,
  dateTo?: Date,
) {
  const assignedAt = buildAssignedAtRange(dateFrom, dateTo);
  return {
    ...(storeId ? { storeId } : {}),
    ...(driverId ? { driverId } : { driverId: { not: null } }),
    ...(assignedAt ? { assignedAt } : {}),
  };
}

/** Completed jobs for distance totals — matches rider Stats (`completedAt` window). */
function buildCompletedDistanceJobWhere(
  storeId: string | undefined,
  driverId: string | string[] | undefined,
  dateFrom?: Date,
  dateTo?: Date,
) {
  const completedAt = buildAssignedAtRange(dateFrom, dateTo);
  return {
    status: 'COMPLETED' as const,
    ...(storeId ? { storeId } : {}),
    ...(driverId
      ? Array.isArray(driverId)
        ? { driverId: { in: driverId } }
        : { driverId }
      : { driverId: { not: null } }),
    ...(completedAt ? { completedAt } : {}),
  };
}

function buildAnalyticsRiderWhere(storeId: string | undefined, driverId?: string) {
  return {
    role: { name: 'DELIVERY_DRIVER' },
    isActive: true,
    ...(driverId ? { id: driverId } : {}),
    ...(storeId
      ? {
          OR: [{ accessibleStores: { some: { id: storeId } } }, { storeId }],
        }
      : {}),
  };
}

function buildShiftOverlapWhere(
  storeId: string | undefined,
  driverIds: string[],
  dateFrom?: Date,
  dateTo?: Date,
) {
  return {
    driverId: { in: driverIds },
    ...(storeId ? { storeId } : {}),
    ...(dateTo ? { startedAt: { lt: dateTo } } : {}),
    ...(dateFrom ? { OR: [{ endedAt: { gt: dateFrom } }, { endedAt: null }] } : {}),
  };
}

function colomboDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(date);
}

function enumerateColomboDates(from: Date, to: Date): string[] {
  const dates: string[] = [];
  const seen = new Set<string>();
  const endStr = colomboDateString(to);
  let current = new Date(from);

  for (let i = 0; i < 800; i += 1) {
    const dateStr = colomboDateString(current);
    if (!seen.has(dateStr)) {
      seen.add(dateStr);
      dates.push(dateStr);
    }
    if (dateStr >= endStr) break;
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  return dates;
}

type ShiftRow = { driverId: string; startedAt: Date; endedAt: Date | null };

function computeShiftMetricsByDriver(
  shifts: ShiftRow[],
  dateFrom?: Date,
  dateTo?: Date,
): Map<string, { attendanceDays: number; onlineTimeMinutes: number }> {
  const onlineByDriver = new Map<string, number>();
  const datesByDriver = new Map<string, Set<string>>();
  const now = new Date();

  for (const shift of shifts) {
    const rangeStart = dateFrom ?? shift.startedAt;
    const rangeEnd = dateTo ?? now;
    const effectiveStart = shift.startedAt > rangeStart ? shift.startedAt : rangeStart;
    const shiftEnd = shift.endedAt ?? now;
    const effectiveEnd = shiftEnd < rangeEnd ? shiftEnd : rangeEnd;

    if (effectiveEnd <= effectiveStart) continue;

    const onlineMs = effectiveEnd.getTime() - effectiveStart.getTime();
    onlineByDriver.set(shift.driverId, (onlineByDriver.get(shift.driverId) ?? 0) + onlineMs);

    const attendanceDates = enumerateColomboDates(effectiveStart, effectiveEnd);
    const dateSet = datesByDriver.get(shift.driverId) ?? new Set<string>();
    for (const dateStr of attendanceDates) {
      dateSet.add(dateStr);
    }
    datesByDriver.set(shift.driverId, dateSet);
  }

  const result = new Map<string, { attendanceDays: number; onlineTimeMinutes: number }>();
  for (const [driverId, onlineMs] of onlineByDriver) {
    result.set(driverId, {
      attendanceDays: datesByDriver.get(driverId)?.size ?? 0,
      onlineTimeMinutes: Math.round((onlineMs / 60000) * 10) / 10,
    });
  }

  for (const [driverId, dateSet] of datesByDriver) {
    if (!result.has(driverId)) {
      result.set(driverId, {
        attendanceDays: dateSet.size,
        onlineTimeMinutes: 0,
      });
    }
  }

  return result;
}

type JobOrderLink = { orderId: string };

type JobKpiRow = {
  driverId: string | null;
  status: string;
  totalDistanceKm: number | null;
  jobOrders: JobOrderLink[];
};

type DriverDistanceRow = {
  driverId: string | null;
  actualDistanceKm: number | null;
  totalDistanceKm: number | null;
};

function aggregateDriverDistanceByDriver(jobs: DriverDistanceRow[]) {
  const totals = new Map<string, number>();
  for (const job of jobs) {
    if (!job.driverId) continue;
    totals.set(job.driverId, (totals.get(job.driverId) ?? 0) + jobRiderDistanceKm(job));
  }
  const rounded = new Map<string, number>();
  for (const [driverId, km] of totals) {
    rounded.set(driverId, roundDistanceKm(km));
  }
  return rounded;
}

function aggregateJobMetricsByDriver(
  jobs: JobKpiRow[],
  distanceByDriver: Map<string, number> = new Map(),
) {
  const result = new Map<
    string,
    { jobCount: number; orderIds: Set<string> }
  >();

  for (const job of jobs) {
    if (!job.driverId) continue;
    const existing = result.get(job.driverId) ?? {
      jobCount: 0,
      orderIds: new Set<string>(),
    };

    existing.jobCount += 1;
    for (const link of job.jobOrders) {
      existing.orderIds.add(link.orderId);
    }
    result.set(job.driverId, existing);
  }

  const driverIds = new Set([...result.keys(), ...distanceByDriver.keys()]);
  const mapped = new Map<string, { jobCount: number; orderCount: number; totalDistanceKm: number }>();
  for (const driverId of driverIds) {
    const data = result.get(driverId);
    mapped.set(driverId, {
      jobCount: data?.jobCount ?? 0,
      orderCount: data?.orderIds.size ?? 0,
      totalDistanceKm: distanceByDriver.get(driverId) ?? 0,
    });
  }
  return mapped;
}

const riderJobDetailSelect = {
  id: true,
  rideCode: true,
  status: true,
  assignedAt: true,
  startedAt: true,
  completedAt: true,
  actualDistanceKm: true,
  totalDistanceKm: true,
  jobOrders: { select: { orderId: true } },
};

type RiderJobDetailRow = {
  id: string;
  /** Present for rider KPI detail; omitted on some dashboard aggregates that only need KPI math. */
  rideCode?: string | null;
  status: string;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  actualDistanceKm: number | null;
  totalDistanceKm: number | null;
  jobOrders: JobOrderLink[];
};

type DeliveryEventRow = {
  orderId: string;
  jobId: string;
  state: DeliveryDomainState;
  createdAt: Date;
};

const KPI_EVENT_STATES = ['PICKED_UP', 'EN_ROUTE', 'DELIVERED', 'FAILED'] as const;

function groupEventsByJobId(events: DeliveryEventRow[]): Map<string, DeliveryEventRow[]> {
  const map = new Map<string, DeliveryEventRow[]>();
  for (const event of events) {
    const existing = map.get(event.jobId) ?? [];
    existing.push(event);
    map.set(event.jobId, existing);
  }
  return map;
}

function computeRiderDetailKpi(
  jobs: RiderJobDetailRow[],
  eventsByJobId: Map<string, DeliveryEventRow[]> = new Map(),
  completedDistanceJobs: DriverDistanceRow[] = [],
) {
  const allOrderIds = new Set<string>();
  let totalJobs = 0;
  let completedJobs = 0;
  let cancelledJobs = 0;

  const distanceJobs =
    completedDistanceJobs.length > 0
      ? completedDistanceJobs
      : jobs.filter((job) => job.status === 'COMPLETED');

  for (const job of jobs) {
    totalJobs += 1;

    for (const link of job.jobOrders) {
      allOrderIds.add(link.orderId);
    }

    if (job.status === 'COMPLETED') {
      completedJobs += 1;
    } else if (job.status === 'CANCELLED') {
      cancelledJobs += 1;
    }
  }

  const efficiency = computeRiderEfficiencyMetrics(
    jobs.filter((job) => job.status === 'COMPLETED'),
    eventsByJobId,
  );

  return {
    totalJobs,
    completedJobs,
    cancelledJobs,
    totalOrders: allOrderIds.size,
    totalDistanceKm: roundDistanceKm(sumRiderDistanceKm(distanceJobs)),
    totalDeliveryTimeMinutes: efficiency.totalDeliveryTimeMinutes,
    averageTimePerOrderMinutes: efficiency.averageTimePerOrderMinutes,
    averageStationTimeMinutes: efficiency.averageStationTimeMinutes,
  };
}

function mapRiderJobDetailRow(job: RiderJobDetailRow) {
  const deliveryMs = durationMs(job.startedAt, job.completedAt);
  return {
    id: job.id,
    rideCode: job.rideCode ?? null,
    date: job.assignedAt?.toISOString() ?? null,
    status: job.status,
    orderCount: job.jobOrders.length,
    distanceKm: job.status === 'COMPLETED' ? roundDistanceKm(jobRiderDistanceKm(job)) : job.totalDistanceKm,
    assignedAt: job.assignedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    durationMinutes: msToMinutes(deliveryMs),
    cancellationReason: null,
  };
}

export async function getDriverAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const dateFrom = parseDateQuery(req.query.dateFrom);
    const dateTo = parseDateQuery(req.query.dateTo, true);
    const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;
    const { page, pageSize, skip } = parsePageQuery(req.query);

    const jobWhere = buildAnalyticsJobWhere(storeId, driverId, dateFrom, dateTo);
    const riderWhere = buildAnalyticsRiderWhere(storeId, driverId);

    const [accepted, cancelled, completed, riderTotal, riders] = await Promise.all([
      prisma.deliveryJob.count({
        where: {
          ...jobWhere,
          status: { in: ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'COMPLETED'] },
        },
      }),
      prisma.deliveryJob.count({
        where: { ...jobWhere, status: 'CANCELLED' },
      }),
      prisma.deliveryJob.findMany({
        where: buildCompletedDistanceJobWhere(storeId, driverId, dateFrom, dateTo),
        select: {
          assignedAt: true,
          startedAt: true,
          completedAt: true,
          actualDistanceKm: true,
          totalDistanceKm: true,
        },
      }),
      prisma.adminUser.count({ where: riderWhere }),
      prisma.adminUser.findMany({
        where: riderWhere,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    const riderIds = riders.map((r) => r.id);
    const assignedAtRange = buildAssignedAtRange(dateFrom, dateTo);

    const [jobsForRiders, completedJobsForDistance, shiftsForRiders] =
      riderIds.length > 0
        ? await Promise.all([
            prisma.deliveryJob.findMany({
              where: {
                driverId: { in: riderIds },
                ...(storeId ? { storeId } : {}),
                ...(assignedAtRange ? { assignedAt: assignedAtRange } : {}),
              },
              select: {
                driverId: true,
                status: true,
                totalDistanceKm: true,
                jobOrders: { select: { orderId: true } },
              },
            }),
            prisma.deliveryJob.findMany({
              where: buildCompletedDistanceJobWhere(storeId, riderIds, dateFrom, dateTo),
              select: {
                driverId: true,
                actualDistanceKm: true,
                totalDistanceKm: true,
              },
            }),
            prisma.driverShift.findMany({
              where: buildShiftOverlapWhere(storeId, riderIds, dateFrom, dateTo),
              select: { driverId: true, startedAt: true, endedAt: true },
            }),
          ])
        : [[], [], []];

    const distanceByDriver = aggregateDriverDistanceByDriver(completedJobsForDistance);
    const jobMetrics = aggregateJobMetricsByDriver(jobsForRiders, distanceByDriver);
    const shiftMetrics = computeShiftMetricsByDriver(shiftsForRiders, dateFrom, dateTo);

    const completedCount = completed.length;
    const cancelRate = accepted + cancelled > 0 ? cancelled / (accepted + cancelled) : 0;
    const totalDistance = sumRiderDistanceKm(completed);

    return success(res, {
      filters: { storeId: storeId ?? null, driverId: driverId ?? null, dateFrom, dateTo },
      summary: {
        acceptedRides: accepted,
        cancelledRides: cancelled,
        cancelRate,
        completedRides: completedCount,
        totalDistanceKm: roundDistanceKm(totalDistance),
        averagePickupMinutes: msToMinutes(
          averageDuration(completed.map((j) => durationMs(j.assignedAt, j.startedAt))),
        ),
        averageDeliveryMinutes: msToMinutes(
          averageDuration(completed.map((j) => durationMs(j.startedAt, j.completedAt))),
        ),
        averageTotalMinutes: msToMinutes(
          averageDuration(completed.map((j) => durationMs(j.assignedAt, j.completedAt))),
        ),
      },
      riders: {
        rows: riders.map((rider) => {
          const jobs = jobMetrics.get(rider.id);
          const shifts = shiftMetrics.get(rider.id);
          return {
            riderId: rider.id,
            riderName: rider.name,
            attendanceDays: shifts?.attendanceDays ?? 0,
            onlineTimeMinutes: shifts?.onlineTimeMinutes ?? 0,
            jobCount: jobs?.jobCount ?? 0,
            orderCount: jobs?.orderCount ?? 0,
            totalDistanceKm: jobs?.totalDistanceKm ?? 0,
          };
        }),
        total: riderTotal,
        page,
        pageSize,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getRiderKpiDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const dateFrom = parseDateQuery(req.query.dateFrom);
    const dateTo = parseDateQuery(req.query.dateTo, true);
    const riderId = req.params.riderId as string;
    const { page: jobsPage, pageSize: jobsPageSize, skip: jobsSkip } = parsePageQuery(
      { page: req.query.jobsPage, pageSize: req.query.jobsPageSize },
      20,
      100,
    );

    const jobWhere = buildAnalyticsJobWhere(storeId, riderId, dateFrom, dateTo);
    const rejectedAtRange = buildAssignedAtRange(dateFrom, dateTo);

    const rider = await prisma.adminUser.findFirst({
      where: buildAnalyticsRiderWhere(storeId, riderId),
      select: {
        id: true,
        name: true,
        dutyStatus: true,
        store: { select: { name: true } },
      },
    });

    if (!rider) {
      throw new AppError('Rider not found', 404);
    }

    const completedDistanceWhere = buildCompletedDistanceJobWhere(storeId, riderId, dateFrom, dateTo);

    const [allJobs, jobsTotal, paginatedJobs, shifts, rejectedJobs, completedDistanceJobs] =
      await Promise.all([
      prisma.deliveryJob.findMany({
        where: jobWhere,
        select: riderJobDetailSelect,
      }),
      prisma.deliveryJob.count({ where: jobWhere }),
      prisma.deliveryJob.findMany({
        where: jobWhere,
        select: riderJobDetailSelect,
        orderBy: { assignedAt: 'desc' },
        skip: jobsSkip,
        take: jobsPageSize,
      }),
      prisma.driverShift.findMany({
        where: buildShiftOverlapWhere(storeId, [riderId], dateFrom, dateTo),
        select: { driverId: true, startedAt: true, endedAt: true },
      }),
      prisma.deliveryJobRejection.count({
        where: {
          driverId: riderId,
          ...(rejectedAtRange ? { rejectedAt: rejectedAtRange } : {}),
          ...(storeId ? { job: { storeId } } : {}),
        },
      }),
      prisma.deliveryJob.findMany({
        where: completedDistanceWhere,
        select: {
          driverId: true,
          actualDistanceKm: true,
          totalDistanceKm: true,
        },
      }),
    ]);

    const completedJobIds = allJobs.filter((job) => job.status === 'COMPLETED').map((job) => job.id);
    const eventRows =
      completedJobIds.length > 0
        ? await prisma.deliveryEvent.findMany({
            where: {
              jobId: { in: completedJobIds },
              state: { in: [...KPI_EVENT_STATES] },
            },
            select: { orderId: true, jobId: true, state: true, createdAt: true },
          })
        : [];
    const eventsByJobId = groupEventsByJobId(
      eventRows.filter((event): event is DeliveryEventRow => event.jobId != null),
    );

    const shiftMetrics = computeShiftMetricsByDriver(shifts, dateFrom, dateTo).get(riderId);
    const kpi = computeRiderDetailKpi(allJobs, eventsByJobId, completedDistanceJobs);

    return success(res, {
      rider: {
        id: rider.id,
        name: rider.name,
        branch: rider.store?.name ?? null,
        dutyStatus: rider.dutyStatus,
      },
      period: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null },
      kpi: {
        attendanceDays: shiftMetrics?.attendanceDays ?? 0,
        onlineTimeMinutes: shiftMetrics?.onlineTimeMinutes ?? 0,
        ...kpi,
        rejectedJobs,
      },
      jobs: {
        rows: paginatedJobs.map(mapRiderJobDetailRow),
        total: jobsTotal,
        page: jobsPage,
        pageSize: jobsPageSize,
      },
    });
  } catch (err) {
    next(err);
  }
}

const ACTIVE_DASHBOARD_STATUSES = ['ASSIGNED', 'QUEUED', 'IN_PROGRESS'] as const;
const ACTIVE_JOB_STATUS_ORDER: Record<string, number> = {
  IN_PROGRESS: 0,
  ASSIGNED: 1,
  QUEUED: 2,
};

function buildCompletedJobWhere(
  storeId: string | undefined,
  driverId: string | undefined,
  dateFrom?: Date,
  dateTo?: Date,
) {
  return {
    status: 'COMPLETED' as const,
    ...(storeId ? { storeId } : {}),
    ...(driverId ? { driverId } : {}),
    ...(dateFrom || dateTo
      ? {
          completedAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };
}

function buildDashboardScope(storeId: string | undefined, driverId: string | undefined) {
  return {
    ...(storeId ? { storeId } : {}),
    ...(driverId ? { driverId } : {}),
  };
}

/** Jobs scheduled or completed in the selected period, grouped by current status. */
function buildPeriodStatusWhere(
  storeId: string | undefined,
  driverId: string | undefined,
  dateFrom?: Date,
  dateTo?: Date,
) {
  const scope = buildDashboardScope(storeId, driverId);
  if (!dateFrom && !dateTo) return scope;
  const range = {
    ...(dateFrom ? { gte: dateFrom } : {}),
    ...(dateTo ? { lte: dateTo } : {}),
  };
  return {
    ...scope,
    OR: [{ scheduledAt: range }, { completedAt: range }],
  };
}

function aggregateTopRiders(
  completedJobs: Array<{
    driverId: string | null;
    actualDistanceKm: number | null;
    totalDistanceKm: number | null;
    jobOrders: JobOrderLink[];
    driver: { id: string; name: string } | null;
  }>,
  shiftMetrics: Map<string, { attendanceDays: number; onlineTimeMinutes: number }>,
) {
  const byDriver = new Map<
    string,
    {
      riderName: string;
      completedJobs: number;
      orderIds: Set<string>;
      totalDistanceKm: number;
    }
  >();

  for (const job of completedJobs) {
    if (!job.driverId) continue;
    const existing = byDriver.get(job.driverId) ?? {
      riderName: job.driver?.name ?? 'Unknown',
      completedJobs: 0,
      orderIds: new Set<string>(),
      totalDistanceKm: 0,
    };
    existing.completedJobs += 1;
    existing.totalDistanceKm += jobRiderDistanceKm(job);
    for (const link of job.jobOrders) {
      existing.orderIds.add(link.orderId);
    }
    byDriver.set(job.driverId, existing);
  }

  return [...byDriver.entries()]
    .map(([riderId, data]) => ({
      riderId,
      riderName: data.riderName,
      completedJobs: data.completedJobs,
      distinctOrders: data.orderIds.size,
      totalDistanceKm: roundDistanceKm(data.totalDistanceKm),
      onlineTimeMinutes: shiftMetrics.get(riderId)?.onlineTimeMinutes ?? 0,
    }))
    .sort(
      (a, b) =>
        b.completedJobs - a.completedJobs ||
        b.distinctOrders - a.distinctOrders ||
        b.totalDistanceKm - a.totalDistanceKm,
    )
    .slice(0, 5);
}

export async function getDeliveryDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await adminStoreIdOptional(req, req.query.storeId as string | undefined);
    const dateFrom = parseDateQuery(req.query.dateFrom);
    const dateTo = parseDateQuery(req.query.dateTo, true);
    const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;

    const liveScope = buildDashboardScope(storeId, driverId);
    const [riders, activeJobRows, completedJobRows, statusGroups, openComplaints, vehicleFailures, pendingBranchRequests] =
      await Promise.all([
      prisma.adminUser.findMany({
        where: buildAnalyticsRiderWhere(storeId, driverId),
        select: { id: true, dutyStatus: true },
      }),
      prisma.deliveryJob.findMany({
        where: {
          status: { in: [...ACTIVE_DASHBOARD_STATUSES] },
          ...liveScope,
        },
        select: {
          id: true,
          rideCode: true,
          storeId: true,
          driverId: true,
          status: true,
          scheduledAt: true,
          startedAt: true,
          totalDistanceKm: true,
          driver: { select: { name: true } },
          jobOrders: { select: { orderId: true } },
        },
      }),
      prisma.deliveryJob.findMany({
        where: buildCompletedJobWhere(storeId, driverId, dateFrom, dateTo),
        select: {
          id: true,
          storeId: true,
          driverId: true,
          status: true,
          assignedAt: true,
          startedAt: true,
          completedAt: true,
          actualDistanceKm: true,
          totalDistanceKm: true,
          store: { select: { name: true } },
          driver: { select: { id: true, name: true } },
          jobOrders: { select: { orderId: true } },
        },
      }),
      prisma.deliveryJob.groupBy({
        by: ['status'],
        where: buildPeriodStatusWhere(storeId, driverId, dateFrom, dateTo),
        _count: { _all: true },
      }),
      prisma.driverComplaint.count({
        where: {
          status: 'OPEN',
          ...liveScope,
        },
      }),
      prismaKnowsDeliveryJobStatus('VEHICLE_FAILURE')
        ? prisma.deliveryJob.count({
            where: {
              status: 'VEHICLE_FAILURE',
              ...liveScope,
            },
          })
        : Promise.resolve(0),
      isAllBranchRole(req.user?.role)
        ? prisma.driverBranchRequest.count({ where: { status: 'PENDING' } })
        : Promise.resolve(0),
    ]);

    const eligibleRiderIds = riders.map((rider) => rider.id);
    const completedJobIds = completedJobRows.map((job) => job.id);

    const [shiftRows, eventRows] = await Promise.all([
      eligibleRiderIds.length > 0
        ? prisma.driverShift.findMany({
            where: buildShiftOverlapWhere(storeId, eligibleRiderIds, dateFrom, dateTo),
            select: { driverId: true, startedAt: true, endedAt: true },
          })
        : Promise.resolve([]),
      completedJobIds.length > 0
        ? prisma.deliveryEvent.findMany({
            where: {
              jobId: { in: completedJobIds },
              state: { in: [...KPI_EVENT_STATES] },
            },
            select: { orderId: true, jobId: true, state: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const eventsByJobId = groupEventsByJobId(
      eventRows.filter((event): event is DeliveryEventRow => event.jobId != null),
    );
    const shiftMetrics = computeShiftMetricsByDriver(shiftRows, dateFrom, dateTo);
    const periodKpi = computeRiderDetailKpi(completedJobRows, eventsByJobId);

    const riderStatus = {
      online: riders.filter((rider) => rider.dutyStatus === 'ONLINE').length,
      onDelivery: riders.filter((rider) => rider.dutyStatus === 'ON_DELIVERY').length,
      offDuty: riders.filter((rider) => rider.dutyStatus === 'OFF_DUTY').length,
    };

    const jobsInProgress = activeJobRows.filter((job) => job.status === 'IN_PROGRESS').length;

    const activeJobs = [...activeJobRows]
      .sort((a, b) => {
        const statusDiff =
          (ACTIVE_JOB_STATUS_ORDER[a.status] ?? 99) - (ACTIVE_JOB_STATUS_ORDER[b.status] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        const aTime = (a.startedAt ?? a.scheduledAt).getTime();
        const bTime = (b.startedAt ?? b.scheduledAt).getTime();
        return bTime - aTime;
      })
      .slice(0, 8)
      .map((job) => ({
        id: job.id,
        rideCode: job.rideCode ?? null,
        storeId: job.storeId,
        driverId: job.driverId,
        riderName: job.driver?.name ?? null,
        status: job.status,
        orderCount: job.jobOrders.length,
        totalDistanceKm: job.totalDistanceKm,
        scheduledAt: job.scheduledAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
      }));

    let attendanceDays = 0;
    let onlineTimeMinutes = 0;
    for (const metrics of shiftMetrics.values()) {
      attendanceDays += metrics.attendanceDays;
      onlineTimeMinutes += metrics.onlineTimeMinutes;
    }
    onlineTimeMinutes = Math.round(onlineTimeMinutes * 10) / 10;

    const distinctOrderIds = new Set<string>();
    for (const job of completedJobRows) {
      for (const link of job.jobOrders) {
        distinctOrderIds.add(link.orderId);
      }
    }

    return success(res, {
      filters: {
        storeId: storeId ?? null,
        driverId: driverId ?? null,
        dateFrom: dateFrom?.toISOString() ?? null,
        dateTo: dateTo?.toISOString() ?? null,
      },
      live: {
        riderStatus,
        jobsInProgress,
        activeJobs,
      },
      period: {
        completedJobs: periodKpi.completedJobs,
        distinctOrders: distinctOrderIds.size,
        attendanceDays,
        onlineTimeMinutes,
        totalDistanceKm: periodKpi.totalDistanceKm,
        averageTimePerOrderMinutes: periodKpi.averageTimePerOrderMinutes,
        averageStationTimeMinutes: periodKpi.averageStationTimeMinutes,
        topRiders: aggregateTopRiders(completedJobRows, shiftMetrics),
        statusCounts: buildStatusCounts(
          statusGroups.map((row) => ({
            status: String(row.status),
            count: row._count._all,
          })),
        ),
        daily: buildDailySeries(completedJobRows, dateFrom, dateTo),
        topBranches: aggregateTopBranches(completedJobRows),
      },
      attention: {
        openComplaints,
        vehicleFailures,
        pendingBranchRequests,
      },
    });
  } catch (err) {
    next(err);
  }
}

function durationMs(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return to.getTime() - from.getTime();
}

function averageDuration(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && v >= 0);
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function msToMinutes(ms: number | null): number | null {
  if (ms == null) return null;
  return Math.round((ms / 60000) * 10) / 10;
}

