import { randomUUID } from 'crypto';
import { prisma } from '@bingchun/db';
import type { DriverDutyStatus, Prisma } from '@prisma/client';

export function riderProfileEnabled(): boolean {
  return process.env.DELIVERY_RIDER_PROFILE_ENABLED === 'true';
}

const adminDriverProfileSelect = {
  id: true,
  pinLookup: true,
  phone: true,
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
  sessionVersion: true,
  role: { select: { name: true } },
} satisfies Prisma.AdminUserSelect;

type AdminDriverProfile = Prisma.AdminUserGetPayload<{ select: typeof adminDriverProfileSelect }>;

function profileFieldsFromAdmin(admin: AdminDriverProfile) {
  return {
    pinLookup: admin.pinLookup,
    phone: admin.phone,
    vehicleType: admin.vehicleType,
    vehicleNumber: admin.vehicleNumber,
    vehicleColor: admin.vehicleColor,
    licenseNumber: admin.licenseNumber,
    disabilities: admin.disabilities,
    profilePhotoUrl: admin.profilePhotoUrl,
    licenseImageUrl: admin.licenseImageUrl,
    dutyStatus: admin.dutyStatus,
    meritPoints: admin.meritPoints,
    consecutiveSuccessfulDeliveries: admin.consecutiveSuccessfulDeliveries,
    sessionVersion: admin.sessionVersion,
  };
}

/** Copy full driver ops row from admin_users → delivery.rider_profiles. */
export async function syncRiderProfileFromAdminUser(adminUserId: string): Promise<void> {
  if (!riderProfileEnabled()) return;

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: adminDriverProfileSelect,
  });
  if (!admin || admin.role.name !== 'DELIVERY_DRIVER') return;

  const data = profileFieldsFromAdmin(admin);
  await prisma.riderProfile.upsert({
    where: { adminUserId },
    create: { id: randomUUID(), adminUserId, ...data },
    update: data,
  });
}

export type DriverOpsPatch = {
  dutyStatus?: DriverDutyStatus;
  meritPoints?: number;
  consecutiveSuccessfulDeliveries?: number;
  sessionVersion?: number;
  pinLookup?: string | null;
  phone?: string | null;
  vehicleType?: string | null;
  vehicleNumber?: string | null;
  vehicleColor?: string | null;
  licenseNumber?: string | null;
  disabilities?: string | null;
  profilePhotoUrl?: string | null;
  licenseImageUrl?: string | null;
};

/** Dual-write ops fields to admin_users and rider_profiles when the flag is on. */
export async function patchDriverOpsProfile(driverId: string, patch: DriverOpsPatch): Promise<void> {
  await prisma.adminUser.update({ where: { id: driverId }, data: patch });
  if (!riderProfileEnabled()) return;

  const existing = await prisma.riderProfile.findUnique({
    where: { adminUserId: driverId },
    select: { id: true },
  });
  if (!existing) {
    await syncRiderProfileFromAdminUser(driverId);
  }
  await prisma.riderProfile.update({
    where: { adminUserId: driverId },
    data: patch,
  });
}

export async function getDriverSessionVersion(driverId: string): Promise<number | null> {
  if (riderProfileEnabled()) {
    const profile = await prisma.riderProfile.findUnique({
      where: { adminUserId: driverId },
      select: { sessionVersion: true },
    });
    if (profile) return profile.sessionVersion;
  }
  const row = await prisma.adminUser.findUnique({
    where: { id: driverId },
    select: { sessionVersion: true },
  });
  return row?.sessionVersion ?? null;
}

/** Login / device bind — bump session on admin and mirror to rider profile. */
export async function incrementDriverSessionVersion(driverId: string): Promise<number> {
  const updated = await prisma.adminUser.update({
    where: { id: driverId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  if (riderProfileEnabled()) {
    await prisma.riderProfile.upsert({
      where: { adminUserId: driverId },
      create: {
        id: randomUUID(),
        adminUserId: driverId,
        sessionVersion: updated.sessionVersion,
      },
      update: { sessionVersion: updated.sessionVersion },
    });
  }
  return updated.sessionVersion;
}
