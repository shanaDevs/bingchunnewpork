import { prisma } from '@bingchun/db';
import { haversineKm } from '@bingchun/delivery-domain';

export interface LiveLocation {
  driverId: string;
  jobId?: string | null;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedKph?: number | null;
  heading?: number | null;
  batteryPct?: number | null;
  recordedAt: string;
}

const IDLE_MOVE_THRESHOLD_M = 50;
const IDLE_TIME_THRESHOLD_MS = 60_000;
const RIDE_MOVE_THRESHOLD_M = 25;
const RIDE_TIME_THRESHOLD_MS = 15_000;

/** Hot in-process cache of the latest known position per driver.
 *  Swap for Redis once the service runs multi-replica. */
const hotCache = new Map<string, LiveLocation>();
const lastPersisted = new Map<string, { lat: number; lng: number; at: number }>();

export function setLiveLocation(loc: LiveLocation): void {
  hotCache.set(loc.driverId, loc);
}

export function getLiveLocation(driverId: string): LiveLocation | null {
  return hotCache.get(driverId) ?? null;
}

export function getAllLiveLocations(): LiveLocation[] {
  return [...hotCache.values()];
}

function shouldPersist(driverId: string, lat: number, lng: number, rideTracking: boolean): boolean {
  const prev = lastPersisted.get(driverId);
  if (!prev) return true;
  const moveThresholdM = rideTracking ? RIDE_MOVE_THRESHOLD_M : IDLE_MOVE_THRESHOLD_M;
  const timeThresholdMs = rideTracking ? RIDE_TIME_THRESHOLD_MS : IDLE_TIME_THRESHOLD_MS;
  const movedM = haversineKm(prev.lat, prev.lng, lat, lng) * 1000;
  const elapsedMs = Date.now() - prev.at;
  return movedM > moveThresholdM || elapsedMs > timeThresholdMs;
}

/** Downsampled persistence — only writes a row when the driver moved >50m or
 *  >60s elapsed since the last persisted point, to keep `driver_locations` small. */
export async function recordDriverLocation(loc: {
  driverId: string;
  jobId?: string | null;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedKph?: number | null;
  heading?: number | null;
  batteryPct?: number | null;
  recordedAt?: Date;
  rideTracking?: boolean;
}): Promise<boolean> {
  setLiveLocation({
    driverId: loc.driverId,
    jobId: loc.jobId ?? null,
    lat: loc.lat,
    lng: loc.lng,
    accuracyM: loc.accuracyM ?? null,
    speedKph: loc.speedKph ?? null,
    heading: loc.heading ?? null,
    batteryPct: loc.batteryPct ?? null,
    recordedAt: (loc.recordedAt ?? new Date()).toISOString(),
  });

  if (!shouldPersist(loc.driverId, loc.lat, loc.lng, loc.rideTracking ?? false)) return false;

  await prisma.driverLocation.create({
    data: {
      driverId: loc.driverId,
      jobId: loc.jobId ?? null,
      lat: loc.lat,
      lng: loc.lng,
      accuracyM: loc.accuracyM ?? null,
      speedKph: loc.speedKph ?? null,
      heading: loc.heading ?? null,
      batteryPct: loc.batteryPct ?? null,
      recordedAt: loc.recordedAt ?? new Date(),
    },
  });

  lastPersisted.set(loc.driverId, { lat: loc.lat, lng: loc.lng, at: Date.now() });
  return true;
}

export async function deleteExpiredLocations(retentionDays: number): Promise<number> {
  const { deleteExpiredDriverLocations } = await import('@bingchun/delivery-domain');
  return deleteExpiredDriverLocations(retentionDays);
}
