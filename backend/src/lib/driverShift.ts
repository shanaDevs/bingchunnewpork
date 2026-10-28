import { prisma } from './prisma';
import { logger } from '../utils/logger';

export async function openDriverShift(driverId: string, storeId: string): Promise<void> {
  const open = await prisma.driverShift.findFirst({
    where: { driverId, endedAt: null },
    select: { id: true },
  });
  if (open) return;

  await prisma.driverShift.create({ data: { driverId, storeId } });
  logger.info(`Driver ${driverId} started shift at store ${storeId}`);
}

export async function closeDriverShift(driverId: string): Promise<void> {
  const open = await prisma.driverShift.findFirst({
    where: { driverId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!open) return;

  await prisma.driverShift.update({ where: { id: open.id }, data: { endedAt: new Date() } });
  logger.info(`Driver ${driverId} ended shift ${open.id}`);
}

export interface DriverShiftEntry {
  id: string;
  storeId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number;
}

/** A driver's own duty on/off timeline, most recent first. An open shift has `endedAt: null`. */
export async function listDriverShifts(driverId: string, take = 200): Promise<DriverShiftEntry[]> {
  const rows = await prisma.driverShift.findMany({
    where: { driverId },
    orderBy: { startedAt: 'desc' },
    take,
    select: { id: true, storeId: true, startedAt: true, endedAt: true },
  });
  const now = new Date();
  return rows.map((row) => ({
    ...row,
    durationMinutes: Math.round(((row.endedAt ?? now).getTime() - row.startedAt.getTime()) / 60000),
  }));
}
