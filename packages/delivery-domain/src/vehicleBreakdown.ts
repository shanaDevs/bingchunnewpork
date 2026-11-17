import { randomUUID } from 'crypto';
import { prisma } from '@bingchun/db';

export type VehicleBreakdownFixedByRole = 'DRIVER' | 'ADMIN';

export const VEHICLE_BREAKDOWN_OPEN_CODE = 'VEHICLE_BREAKDOWN_OPEN';
export const FIX_COMMENT_REQUIRED_CODE = 'FIX_COMMENT_REQUIRED';

export type OpenVehicleBreakdownInput = {
  driverId: string;
  jobId: string;
  storeId: string;
  lat: number;
  lng: number;
  note?: string;
};

export type MarkVehicleFixedInput = {
  driverId: string;
  fixedById: string;
  fixedByRole: VehicleBreakdownFixedByRole;
  comment?: string;
};

export type VehicleBreakdownSummary = {
  id: string;
  driverId: string;
  jobId: string;
  storeId: string;
  reportedAt: Date;
  reportedLat: number;
  reportedLng: number;
  note: string | null;
  rideCode: string | null;
};

function validateAdminFixComment(comment: string | undefined): string {
  const trimmed = comment?.trim() ?? '';
  if (trimmed.length < 3) {
    const err = new Error('A comment of at least 3 characters is required to mark the vehicle fixed');
    (err as Error & { statusCode: number; code: string }).statusCode = 400;
    (err as Error & { code: string }).code = FIX_COMMENT_REQUIRED_CODE;
    throw err;
  }
  if (trimmed.length > 500) {
    const err = new Error('Comment must be at most 500 characters');
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  return trimmed;
}

export async function getOpenVehicleBreakdown(driverId: string): Promise<VehicleBreakdownSummary | null> {
  const row = await prisma.vehicleBreakdown.findFirst({
    where: { driverId, fixedAt: null },
    orderBy: { reportedAt: 'desc' },
    select: {
      id: true,
      driverId: true,
      jobId: true,
      storeId: true,
      reportedAt: true,
      reportedLat: true,
      reportedLng: true,
      note: true,
      job: { select: { rideCode: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driverId,
    jobId: row.jobId,
    storeId: row.storeId,
    reportedAt: row.reportedAt,
    reportedLat: row.reportedLat,
    reportedLng: row.reportedLng,
    note: row.note,
    rideCode: row.job.rideCode,
  };
}

export async function driverHasOpenVehicleBreakdown(driverId: string): Promise<boolean> {
  const open = await getOpenVehicleBreakdown(driverId);
  return open != null;
}

export async function assertDriverVehicleReadyForWork(driverId: string): Promise<void> {
  if (await driverHasOpenVehicleBreakdown(driverId)) {
    const err = new Error('Mark your vehicle as fixed before going online or claiming jobs');
    (err as Error & { statusCode: number; code: string }).statusCode = 409;
    (err as Error & { code: string }).code = VEHICLE_BREAKDOWN_OPEN_CODE;
    throw err;
  }
}

export async function openVehicleBreakdown(input: OpenVehicleBreakdownInput): Promise<{ id: string }> {
  const existing = await prisma.vehicleBreakdown.findFirst({
    where: { driverId: input.driverId, fixedAt: null },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id };
  }

  const created = await prisma.vehicleBreakdown.create({
    data: {
      id: randomUUID(),
      driverId: input.driverId,
      jobId: input.jobId,
      storeId: input.storeId,
      reportedLat: input.lat,
      reportedLng: input.lng,
      note: input.note ?? null,
    },
    select: { id: true },
  });
  return created;
}

export async function markVehicleFixed(
  input: MarkVehicleFixedInput,
): Promise<{ id: string; jobId: string; fixedAt: Date; fixedComment: string | null }> {
  const open = await prisma.vehicleBreakdown.findFirst({
    where: { driverId: input.driverId, fixedAt: null },
    orderBy: { reportedAt: 'desc' },
    select: { id: true, jobId: true },
  });
  if (!open) {
    const err = new Error('No open vehicle breakdown for this rider');
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }

  let fixedComment: string | null = null;
  if (input.fixedByRole === 'ADMIN') {
    fixedComment = validateAdminFixComment(input.comment);
  }

  const fixedAt = new Date();
  await prisma.vehicleBreakdown.update({
    where: { id: open.id },
    data: {
      fixedAt,
      fixedById: input.fixedById,
      fixedByRole: input.fixedByRole,
      fixedComment,
    },
  });

  return { id: open.id, jobId: open.jobId, fixedAt, fixedComment };
}

export async function countOpenVehicleBreakdowns(storeId?: string): Promise<number> {
  return prisma.vehicleBreakdown.count({
    where: {
      fixedAt: null,
      ...(storeId ? { storeId } : {}),
    },
  });
}