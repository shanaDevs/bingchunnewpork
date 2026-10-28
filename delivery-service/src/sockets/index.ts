import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getEventPublisher } from './eventPublisher';
import { recordDriverLocation } from '../lib/locationCache';
import { openDriverShift, closeDriverShift } from '../lib/driverShift';
import { prisma } from '@bingchun/db';
import { assertDriverSession, SESSION_SUPERSEDED, type JwtPayload } from '../middleware/auth';

interface DriverSocketAuth {
  sub: string;
  type: 'admin';
  role: string;
  storeId?: string;
  sv?: number;
}

interface AuthedSocket extends Socket {
  driver?: DriverSocketAuth;
}

function extractToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token as string | undefined;
  if (authToken) return authToken;

  const header = socket.handshake.headers?.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  return null;
}

let io: SocketServer | null = null;

export function initDeliverySocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: [config.frontendUrl, config.adminUrl, 'http://localhost:3000', 'http://localhost:3001'],
      methods: ['GET', 'POST'],
    },
  });

  const nsp = io.of('/delivery');

  nsp.use((socket: AuthedSocket, next) => {
    const token = extractToken(socket);
    if (!token) return next(new Error('Unauthorised'));

    try {
      const payload = jwt.verify(token, config.jwtSecret) as DriverSocketAuth;
      if (payload.type !== 'admin' || payload.role !== 'DELIVERY_DRIVER') {
        return next(new Error('Delivery driver access only'));
      }
      void assertDriverSession(payload as JwtPayload)
        .then(() => {
          socket.driver = payload;
          next();
        })
        .catch(() => next(new Error(SESSION_SUPERSEDED)));
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  nsp.on('connection', (socket: AuthedSocket) => {
    const driver = socket.driver!;
    socket.join(`driver:${driver.sub}`);
    if (driver.storeId) socket.join(`store:${driver.storeId}`);
    logger.info(`Driver socket connected: ${driver.sub} (${socket.id})`);

    socket.on('driver:online', async () => {
      logger.info(`Driver online: ${driver.sub}`);
      if (driver.storeId) {
        await openDriverShift(driver.sub, driver.storeId).catch((err) =>
          logger.error('Failed to open driver shift', err)
        );
      }
    });

    socket.on('driver:offline', async () => {
      logger.info(`Driver offline: ${driver.sub}`);
      await closeDriverShift(driver.sub).catch((err) => logger.error('Failed to close driver shift', err));
    });

    socket.on(
      'driver:location',
      async (data: {
        lat: number;
        lng: number;
        accuracyM?: number;
        speedKph?: number;
        heading?: number;
        batteryPct?: number;
        jobId?: string;
        recordedAt?: string;
      }) => {
        try {
          await handleDriverLocation(driver.sub, driver.storeId, data);
        } catch (err) {
          logger.error(`Failed to process driver:location for ${driver.sub}`, err);
        }
      }
    );

    socket.on('disconnect', () => {
      logger.debug(`Driver socket disconnected: ${driver.sub} (${socket.id})`);
    });
  });

  return io;
}

export function getDeliverySocketServer(): SocketServer {
  if (!io) throw new Error('Delivery socket server not initialised');
  return io;
}

/** Kick every live /delivery socket for this rider after a newer device logs in. */
export function revokeDriverSockets(driverId: string): void {
  if (!io) return;
  const nsp = io.of('/delivery');
  const room = `driver:${driverId}`;
  nsp.to(room).emit('session_revoked', { code: SESSION_SUPERSEDED });
  nsp.in(room).disconnectSockets(true);
}

/** Shared by the socket handler (M5 §1) and the offline-flush REST endpoint (M5 §6). */
export async function handleDriverLocation(
  driverId: string,
  storeId: string | undefined,
  data: {
    lat: number;
    lng: number;
    accuracyM?: number | null;
    speedKph?: number | null;
    heading?: number | null;
    batteryPct?: number | null;
    jobId?: string | null;
    recordedAt?: string | null;
  }
): Promise<void> {
  if (typeof data?.lat !== 'number' || typeof data?.lng !== 'number') return;

  const publisher = getEventPublisher();

  const jobId = data.jobId ?? undefined;
  let rideTracking = false;
  const activeJob = jobId
    ? await prisma.deliveryJob.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          status: true,
          storeId: true,
          jobOrders: { select: { orderId: true, order: { select: { orderNumber: true } } } },
        },
      })
    : await prisma.deliveryJob.findFirst({
        where: { driverId, status: { in: ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'] } },
        select: {
          id: true,
          status: true,
          storeId: true,
          jobOrders: { select: { orderId: true, order: { select: { orderNumber: true } } } },
        },
        orderBy: { assignedAt: 'desc' },
      });

  if (activeJob?.status) {
    rideTracking = ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'].includes(activeJob.status);
  }

  const resolvedJobId = data.jobId ?? activeJob?.id ?? null;

  await recordDriverLocation({
    driverId,
    jobId: resolvedJobId,
    lat: data.lat,
    lng: data.lng,
    accuracyM: data.accuracyM ?? null,
    speedKph: data.speedKph ?? null,
    heading: data.heading ?? null,
    batteryPct: data.batteryPct ?? null,
    recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
    rideTracking,
  });

  const fanoutPayload = {
    driverId,
    jobId: resolvedJobId,
    lat: data.lat,
    lng: data.lng,
    heading: data.heading ?? null,
    speedKph: data.speedKph ?? null,
    recordedAt: data.recordedAt ?? new Date().toISOString(),
  };

  const publishes: Promise<void>[] = [];
  const resolvedStoreId = activeJob?.storeId ?? storeId;
  if (resolvedStoreId) publishes.push(publisher.publish(`store:${resolvedStoreId}`, 'driverLocation', fanoutPayload));

  if (activeJob) {
    for (const jo of activeJob.jobOrders) {
      const orderPayload = {
        ...fanoutPayload,
        jobId: activeJob.id,
        orderId: jo.orderId,
        orderNumber: jo.order.orderNumber,
      };
      publishes.push(publisher.publish(`order:${jo.orderId}`, 'driverLocation', orderPayload));
      if (jo.order.orderNumber) {
        publishes.push(publisher.publish(`order:${jo.order.orderNumber}`, 'driverLocation', orderPayload));
      }
    }
  }

  await Promise.all(publishes);
}
