import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { prisma } from './prisma';
import { haversineKm } from '../utils/geo';
import { isCorsAllowedOrigin } from './resolveFrontendUrl';
import { getLiveTrackingForOrder } from './liveDriverTracking';
import { resolveOrderAccess, orderIdentifierWhere } from './orderAccess';
import { isBranchScopedRole, assertDriverSession, SESSION_SUPERSEDED, type JwtPayload } from '../middleware/auth';
import { getDriverAccessibleStoreIds } from './driverAccess';
import { getRedisPubSub } from './redisClient';

let io: SocketServer | null = null;
let socketAdapterMode: 'redis' | 'http-relay' = 'http-relay';

export function getSocketAdapterMode(): 'redis' | 'http-relay' {
  return socketAdapterMode;
}

/** Avoid stampeding Prisma when many sockets reconnect and re-emit trackOrder. */
const TRACK_ORDER_CATCHUP_TTL_MS = 2_000;
const trackOrderCatchUpRecent = new Map<string, number>();
const trackOrderCatchUpInFlight = new Set<string>();

interface SocketJwtPayload {
  sub: string;
  type: 'user' | 'admin';
  role?: string;
  storeId?: string;
  sv?: number;
  tv?: number;
}

function shouldRunTrackOrderCatchUp(orderIdentifier: string): boolean {
  const now = Date.now();
  const last = trackOrderCatchUpRecent.get(orderIdentifier);
  if (last != null && now - last < TRACK_ORDER_CATCHUP_TTL_MS) return false;
  if (trackOrderCatchUpInFlight.has(orderIdentifier)) return false;
  return true;
}

function markTrackOrderCatchUpStarted(orderIdentifier: string): void {
  trackOrderCatchUpInFlight.add(orderIdentifier);
  trackOrderCatchUpRecent.set(orderIdentifier, Date.now());
}

function markTrackOrderCatchUpFinished(orderIdentifier: string): void {
  trackOrderCatchUpInFlight.delete(orderIdentifier);
}

function readHandshakeToken(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: string } | undefined;
  if (auth?.token && typeof auth.token === 'string') return auth.token;
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  const cookie = socket.handshake.headers.cookie;
  if (typeof cookie === 'string') {
    const adminMatch = cookie.match(/(?:^|;\s*)bc_admin_at=([^;]+)/);
    if (adminMatch?.[1]) return decodeURIComponent(adminMatch[1]);
    const customerMatch = cookie.match(/(?:^|;\s*)bc_customer_at=([^;]+)/);
    if (customerMatch?.[1]) return decodeURIComponent(customerMatch[1]);
  }
  return null;
}

function verifyToken(token: string): SocketJwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as SocketJwtPayload;
  } catch {
    return null;
  }
}

type LocationIngest = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedKph?: number | null;
  heading?: number | null;
  batteryPct?: number | null;
  jobId?: string | null;
  recordedAt?: string | null;
};

/** Persist + fan-out a driver GPS fix to store/order rooms. */
export async function ingestDriverLocation(
  driverId: string,
  storeId: string | undefined,
  data: LocationIngest,
): Promise<void> {
  if (typeof data?.lat !== 'number' || typeof data?.lng !== 'number') return;

  const recordedAt = data.recordedAt ? new Date(data.recordedAt) : new Date();

  // Resolve active ride early so we can tighten GPS throttling during tracking.
  let trackingJobId = data.jobId ?? null;
  let trackingStatus: string | null = null;
  if (trackingJobId) {
    const j = await prisma.deliveryJob.findUnique({
      where: { id: trackingJobId },
      select: { id: true, status: true },
    });
    trackingStatus = j?.status ?? null;
  } else {
    const active = await prisma.deliveryJob.findFirst({
      where: {
        driverId,
        status: { in: ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'] },
      },
      select: { id: true, status: true },
      orderBy: { assignedAt: 'desc' },
    });
    if (active) {
      trackingJobId = active.id;
      trackingStatus = active.status;
    }
  }

  const isRideTracking =
    trackingStatus === 'ASSIGNED' ||
    trackingStatus === 'QUEUED' ||
    trackingStatus === 'IN_PROGRESS' ||
    trackingStatus === 'RETURNING';
  const minMoveKm = isRideTracking ? 0.025 : 0.05;
  const minAgeMs = isRideTracking ? 15_000 : 60_000;

  const last = await prisma.driverLocation.findFirst({
    where: { driverId },
    orderBy: { recordedAt: 'desc' },
    select: { lat: true, lng: true, recordedAt: true, jobId: true },
  });
  const movedKm = last ? haversineKm(last.lat, last.lng, data.lat, data.lng) : Infinity;
  const ageMs = last ? recordedAt.getTime() - last.recordedAt.getTime() : Infinity;
  const shouldPersist = !last || movedKm >= minMoveKm || ageMs >= minAgeMs;

  if (shouldPersist) {
    await prisma.driverLocation.create({
      data: {
        driverId,
        jobId: trackingJobId ?? data.jobId ?? null,
        lat: data.lat,
        lng: data.lng,
        accuracyM: data.accuracyM ?? null,
        speedKph: data.speedKph ?? null,
        heading: data.heading ?? null,
        batteryPct: data.batteryPct ?? null,
        recordedAt,
      },
    });

    if (
      isRideTracking &&
      trackingJobId &&
      last &&
      last.jobId === trackingJobId &&
      movedKm > 0 &&
      movedKm < 5
    ) {
      const { accumulateJobActualDistance } = await import('./deliveryJobHelpers');
      await accumulateJobActualDistance(
        trackingJobId,
        last.lat,
        last.lng,
        data.lat,
        data.lng,
      ).catch(() => {});
    }
  }

  if (!io) return;

  const activeJob = trackingJobId
    ? await prisma.deliveryJob.findUnique({
        where: { id: trackingJobId },
        select: {
          id: true,
          storeId: true,
          status: true,
          jobOrders: { select: { orderId: true, order: { select: { orderNumber: true } } } },
        },
      })
    : await prisma.deliveryJob.findFirst({
        where: {
          driverId,
          status: { in: ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'] },
        },
        select: {
          id: true,
          storeId: true,
          status: true,
          jobOrders: { select: { orderId: true, order: { select: { orderNumber: true } } } },
        },
        orderBy: { assignedAt: 'desc' },
      });

  const recordedAtIso = recordedAt.toISOString();
  const payload = {
    driverId,
    jobId: activeJob?.id ?? data.jobId ?? null,
    lat: data.lat,
    lng: data.lng,
    heading: data.heading ?? null,
    speedKph: data.speedKph ?? null,
    recordedAt: recordedAtIso,
    updatedAt: recordedAtIso,
  };

  const resolvedStoreId = activeJob?.storeId ?? storeId;
  if (resolvedStoreId) {
    io.to(`store:${resolvedStoreId}`).emit('driverLocation', payload);
  }
  if (activeJob) {
    for (const jo of activeJob.jobOrders) {
      const orderPayload = {
        ...payload,
        orderId: jo.orderId,
        orderNumber: jo.order.orderNumber,
      };
      io.to(`order:${jo.orderId}`).emit('driverLocation', orderPayload);
    }
  }
}

type TrackOrderPayload = string | { identifier: string; trackToken?: string };

async function authorizeTrackOrder(
  socket: Socket,
  payload: TrackOrderPayload,
): Promise<{ orderId: string } | null> {
  const identifier = typeof payload === 'string' ? payload : payload?.identifier;
  const trackToken = typeof payload === 'object' ? payload?.trackToken : undefined;
  if (!identifier || typeof identifier !== 'string') return null;

  const order = await prisma.order.findFirst({
    where: orderIdentifierWhere(identifier),
    select: { id: true, orderNumber: true, trackToken: true, userId: true },
  });
  if (!order) return null;

  const token = readHandshakeToken(socket);
  const jwtPayload = token ? verifyToken(token) : null;

  const access = resolveOrderAccess({
    order,
    identifier,
    trackToken,
    user: jwtPayload ?? undefined,
  });
  if (!access.allowed) {
    socket.emit('socketError', { code: 'UNAUTHORIZED', message: 'Valid track token or sign-in required' });
    return null;
  }

  return { orderId: order.id };
}

export async function initSocket(server: HttpServer): Promise<SocketServer> {
  io = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isCorsAllowedOrigin(origin));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  const redis = await getRedisPubSub();
  if (redis) {
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      io.adapter(createAdapter(redis.pub, redis.sub));
      socketAdapterMode = 'redis';
      logger.info('Socket.io Redis adapter enabled');
    } catch (err) {
      socketAdapterMode = 'http-relay';
      logger.warn('Socket.io Redis adapter unavailable', err);
    }
  } else {
    socketAdapterMode = 'http-relay';
  }

  io.use((socket, next) => {
    const handshakeToken = readHandshakeToken(socket);
    const handshakePayload = handshakeToken ? verifyToken(handshakeToken) : null;
    if (handshakePayload?.type !== 'admin' || handshakePayload.role !== 'DELIVERY_DRIVER') {
      return next();
    }
    void assertDriverSession(handshakePayload as JwtPayload)
      .then(() => {
        socket.data.driver = handshakePayload;
        next();
      })
      .catch(() => next(new Error(SESSION_SUPERSEDED)));
  });

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    const handshakePayload = socket.data.driver as SocketJwtPayload | undefined;
    if (handshakePayload?.type === 'admin' && handshakePayload.role === 'DELIVERY_DRIVER') {
      socket.join(`driver:${handshakePayload.sub}`);
      if (handshakePayload.storeId) socket.join(`store:${handshakePayload.storeId}`);
    }

    socket.on('trackOrder', (payload: TrackOrderPayload) => {
      void (async () => {
        const authorized = await authorizeTrackOrder(socket, payload);
        if (!authorized) return;

        const { orderId } = authorized;
        socket.join(`order:${orderId}`);
        logger.debug(`Socket ${socket.id} tracking order ${orderId}`);

        if (!shouldRunTrackOrderCatchUp(orderId)) return;

        markTrackOrderCatchUpStarted(orderId);
        try {
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              queuePosition: true,
              scheduledPickupAt: true,
            },
          });
          if (!order) return;
          socket.emit('orderStatus', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
          });
          if (order.queuePosition != null || order.scheduledPickupAt) {
            socket.emit('queueUpdate', {
              queuePosition: order.queuePosition,
              scheduledPickupAt: order.scheduledPickupAt?.toISOString() ?? undefined,
            });
          }
          const tracking = await getLiveTrackingForOrder(order.id).catch(() => null);
          if (tracking?.location) {
            socket.emit('driverLocation', tracking.location);
            if (tracking.phase) {
              socket.emit('etaUpdate', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                state: tracking.phase,
              });
            }
          }
        } catch (err) {
          logger.error('trackOrder catch-up failed', err);
        } finally {
          markTrackOrderCatchUpFinished(orderId);
        }
      })();
    });

    socket.on('joinUser', (userId: string) => {
      if (!userId || typeof userId !== 'string') return;
      void (async () => {
        if (config.socketAuthEnforced) {
          const token = readHandshakeToken(socket);
          const payload = token ? verifyToken(token) : null;
          if (!payload || payload.type !== 'user' || payload.sub !== userId) {
            logger.warn(`joinUser rejected for socket ${socket.id} (auth enforced)`);
            socket.emit('socketError', { code: 'UNAUTHORIZED', message: 'Invalid socket auth for joinUser' });
            return;
          }
          const { readUserTokenVersion } = await import('./userSession');
          const tv = await readUserTokenVersion(payload.sub);
          if ((payload.tv ?? 0) !== tv) {
            socket.emit('socketError', { code: 'UNAUTHORIZED', message: 'Invalid socket auth for joinUser' });
            return;
          }
        } else {
          logger.debug(`joinUser without enforced auth (deprecated) socket=${socket.id}`);
        }

        socket.join(`user:${userId}`);
        logger.debug(`Socket ${socket.id} joined user:${userId}`);
      })();
    });

    socket.on('joinAdmin', (payload: { adminId: string; storeId?: string }) => {
      if (!payload?.adminId) return;

      const token = readHandshakeToken(socket);
      const jwtPayload = token ? verifyToken(token) : null;

      if (config.socketAuthEnforced) {
        if (
          !jwtPayload ||
          jwtPayload.type !== 'admin' ||
          jwtPayload.sub !== payload.adminId
        ) {
          // Throttle: reconnect storms previously logged this hundreds of times/min.
          const rejects = ((socket.data.joinAdminRejects as number) || 0) + 1;
          socket.data.joinAdminRejects = rejects;
          if (rejects <= 2 || rejects % 25 === 0) {
            logger.warn(`joinAdmin rejected for socket ${socket.id} (auth enforced, n=${rejects})`);
          }
          socket.emit('socketError', { code: 'UNAUTHORIZED', message: 'Invalid socket auth for joinAdmin' });
          if (rejects >= 3) {
            socket.disconnect(true);
          }
          return;
        }
      } else {
        logger.debug(`joinAdmin without enforced auth (deprecated) socket=${socket.id}`);
      }

      socket.join(`admin:${payload.adminId}`);
      // stock:* events are also broadcast to this room (literal, not a glob).
      socket.join('admin:*');
      logger.debug(`Socket ${socket.id} joined admin:${payload.adminId} and admin:*`);

      // Prefer JWT claims — avoid Prisma on every join (P2024 under reconnect storms).
      if (jwtPayload?.role === 'DELIVERY_ADMIN') {
        socket.join('delivery-ops');
        logger.debug(`Socket ${socket.id} joined delivery-ops`);
      }

      if (!payload.storeId) return;

      if (jwtPayload?.role === 'SYSTEM_ADMIN' || jwtPayload?.role === 'DELIVERY_ADMIN') {
        socket.join(`store:${payload.storeId}`);
        return;
      }

      if (isBranchScopedRole(jwtPayload?.role)) {
        if (jwtPayload?.storeId && jwtPayload.storeId === payload.storeId) {
          socket.join(`store:${payload.storeId}`);
        } else {
          socket.emit('socketError', { code: 'FORBIDDEN', message: 'Cannot join another branch store room' });
        }
      }
    });

    socket.on('joinBranchPool', (payload: { storeIds: string[] }) => {
      if (!payload?.storeIds || !Array.isArray(payload.storeIds)) return;
      const driver = socket.data.driver as SocketJwtPayload | undefined;
      if ((!driver || driver.role !== 'DELIVERY_DRIVER') && config.socketAuthEnforced) {
        socket.emit('socketError', { code: 'UNAUTHORIZED', message: 'Driver auth required for joinBranchPool' });
        return;
      }
      void (async () => {
        const accessible = driver
          ? await getDriverAccessibleStoreIds(driver.sub, driver.storeId)
          : [];
        const allowed = new Set(accessible);
        for (const storeId of payload.storeIds) {
          if (typeof storeId !== 'string' || !storeId.trim()) continue;
          if (config.socketAuthEnforced && !allowed.has(storeId)) {
            logger.warn(`joinBranchPool rejected store ${storeId} for driver ${driver?.sub}`);
            continue;
          }
          socket.join(`branch-pool:${storeId}`);
          logger.debug(`Socket ${socket.id} joined branch-pool:${storeId}`);
        }
      })();
    });

    socket.on('driver:location', async (raw: unknown) => {
      const driver = socket.data.driver as SocketJwtPayload | undefined;
      if (!driver || driver.role !== 'DELIVERY_DRIVER') return;
      const data = raw as LocationIngest & { speed?: number; timestamp?: string; capturedAt?: string };
      if (typeof data?.lat !== 'number' || typeof data?.lng !== 'number') return;
      await ingestDriverLocation(driver.sub, driver.storeId, {
        lat: data.lat,
        lng: data.lng,
        heading: data.heading ?? null,
        speedKph: data.speedKph ?? data.speed ?? null,
        accuracyM: data.accuracyM ?? null,
        batteryPct: data.batteryPct ?? null,
        jobId: data.jobId ?? null,
        recordedAt: data.recordedAt ?? data.timestamp ?? data.capturedAt ?? null,
      }).catch((err) => logger.error('driver:location ingest failed', err));
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.io not initialised');
  return io;
}

/** Kick every live socket for this rider after a newer device logs in. */
export function revokeDriverSockets(driverId: string): void {
  if (!io) return;
  const room = `driver:${driverId}`;
  io.to(room).emit('session_revoked', { code: SESSION_SUPERSEDED });
  io.in(room).disconnectSockets(true);
}

export async function closeSocket(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => {
    io!.close(() => resolve());
  });
  io = null;
  const { closeRedisClients } = await import('./redisClient');
  await closeRedisClients();
}

export type DeliveryJobOrderPreview = {
  orderNumber: string;
  deliveryFee: number;
};

export type DeliveryJobPreviewStop = {
  customerName: string;
  addressLine: string;
  city: string;
  district: string;
};

export type DeliveryJobBroadcastPayload = {
  id: string;
  title: string;
  status: string;
  scheduledAt: Date;
  storeId: string;
  storeName: string;
  storeCity?: string;
  orderCount: number;
  rideCode?: string | null;
  totalCups?: number | null;
  estimatedDistanceKm?: number | null;
  estimatedMinutes?: number | null;
  deliveryFee?: number | null;
  previewStops?: DeliveryJobPreviewStop[];
  orderPreviews?: DeliveryJobOrderPreview[];
  /** Set on reject rebroadcast so clients can treat this as a fresh offer. */
  broadcastedAt?: string | Date | null;
  /** Admin re-ring only — clients jump the queue and ring immediately. */
  forceRing?: boolean;
};

export type BranchOperatingPayload = {
  storeId: string;
  branchClosedAt?: string | null;
  openTime?: string;
  closeTime?: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
};

/** Public store hours change — guests on the website may not be in a room. */
export function broadcastBranchOperating(payload: BranchOperatingPayload): void {
  if (!io || !payload.storeId) return;
  io.emit('branch:operating', payload);
  logger.debug(
    `Broadcast branch:operating ${payload.storeId} closedAt=${payload.branchClosedAt ?? 'unchanged'} stop=${payload.onlineOrderStopTime ?? 'unchanged'}`,
  );
}

export function broadcastNewJob(storeId: string, job: DeliveryJobBroadcastPayload): void {
  if (!io) return;
  io.to(`branch-pool:${storeId}`).emit('newDeliveryJob', job);
  logger.debug(`Broadcast newDeliveryJob ${job.id} to branch-pool:${storeId}`);
}

/** Catch-up for a rider who went ONLINE after a pool broadcast they missed. */
export function emitNewJobToDriver(driverId: string, job: DeliveryJobBroadcastPayload): void {
  if (!io) return;
  io.to(`driver:${driverId}`).emit('newDeliveryJob', job);
  logger.debug(`Emit newDeliveryJob ${job.id} to driver:${driverId} (go-online replay)`);
}

export function broadcastJobClaimed(
  storeId: string,
  jobId: string,
  driverId: string,
  driverName?: string,
): void {
  if (!io) return;
  io.to(`branch-pool:${storeId}`).emit('deliveryJobClaimed', { jobId, driverId, driverName });
  logger.debug(`Broadcast deliveryJobClaimed ${jobId} to branch-pool:${storeId}`);
}

export type JobAssignedToDriverPayload = {
  jobId: string;
  title: string;
  status: string;
  storeId: string;
  storeName: string;
  storeCity?: string;
  orderCount: number;
  rideCode?: string | null;
  totalCups?: number;
  estimatedDistanceKm?: number;
  estimatedMinutes?: number;
  deliveryFee?: number;
  previewStops?: DeliveryJobPreviewStop[];
  orderPreviews?: DeliveryJobOrderPreview[];
  /** Immediate incoming-ride ring for a failure offer. Absent on ordinary assignments. */
  forceRing?: boolean;
};

/** Admin direct-assignment — rings/refreshes only the chosen rider, not the branch pool. */
export function broadcastJobAssignedToDriver(
  driverId: string,
  payload: JobAssignedToDriverPayload,
): void {
  if (!io) return;
  io.to(`driver:${driverId}`).emit('jobAssignedToDriver', { ...payload, id: payload.jobId });
  logger.debug(`Broadcast jobAssignedToDriver ${payload.jobId} to driver:${driverId}`);
}

export function broadcastDeliveryJobUpdated(
  storeId: string,
  payload: { jobId: string; status: string },
): void {
  if (!io) return;
  io.to(`store:${storeId}`).emit('deliveryJobUpdated', payload);
  logger.debug(
    `Broadcast deliveryJobUpdated ${payload.jobId} → ${payload.status} to store:${storeId}`,
  );
}

export type VehicleFailureReportedPayload = {
  jobId: string;
  driverId: string;
  orderId: string;
  lat: number;
  lng: number;
  storeId?: string;
  rideCode?: string | null;
  storeName?: string | null;
};

export function broadcastVehicleFailureReported(
  storeId: string,
  payload: VehicleFailureReportedPayload,
): void {
  if (!io) return;
  const body: VehicleFailureReportedPayload = { ...payload, storeId };
  io.to(`store:${storeId}`).emit('vehicleFailureReported', body);
  io.to('delivery-ops').emit('vehicleFailureReported', body);
  logger.debug(
    `Broadcast vehicleFailureReported ${payload.jobId} (driver ${payload.driverId}) to store:${storeId} and delivery-ops`,
  );
}

export type OrderCancelledDriverPayload = {
  jobId: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  cancelledBy: string;
  cancelledAt: string;
};

/** Tell the rider holding this order that it was cancelled out from under them. */
export function broadcastOrderCancelledToDriver(
  driverId: string,
  payload: OrderCancelledDriverPayload,
): void {
  if (!io) return;
  io.to(`driver:${driverId}`).emit('orderCancelled', payload);
  logger.debug(`Broadcast orderCancelled ${payload.orderNumber} to driver:${driverId}`);
}

export function broadcastDriverDutyChanged(
  storeId: string,
  payload: { driverId: string; name: string; dutyStatus: string },
): void {
  if (!io) return;
  io.to(`store:${storeId}`).emit('driverDutyChanged', payload);
  logger.debug(`Broadcast driverDutyChanged ${payload.driverId} → ${payload.dutyStatus}`);
}
