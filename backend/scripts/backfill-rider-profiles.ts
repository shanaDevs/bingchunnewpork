/**
 * Copy DELIVERY_DRIVER rows from admin_users into delivery.rider_profiles.
 * Safe to re-run (upsert by adminUserId).
 *
 *   npx ts-node backend/scripts/backfill-rider-profiles.ts
 */
import { randomUUID } from 'crypto';
import { prisma, connectDb, disconnectDb } from '@bingchun/db';

async function main() {
  await connectDb();

  const drivers = await prisma.adminUser.findMany({
    where: { role: { name: 'DELIVERY_DRIVER' } },
    select: {
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
    },
  });

  let created = 0;
  let updated = 0;

  for (const d of drivers) {
    const existing = await prisma.riderProfile.findUnique({
      where: { adminUserId: d.id },
      select: { id: true },
    });

    const data = {
      pinLookup: d.pinLookup,
      phone: d.phone,
      vehicleType: d.vehicleType,
      vehicleNumber: d.vehicleNumber,
      vehicleColor: d.vehicleColor,
      licenseNumber: d.licenseNumber,
      disabilities: d.disabilities,
      profilePhotoUrl: d.profilePhotoUrl,
      licenseImageUrl: d.licenseImageUrl,
      dutyStatus: d.dutyStatus,
      meritPoints: d.meritPoints,
      consecutiveSuccessfulDeliveries: d.consecutiveSuccessfulDeliveries,
      sessionVersion: d.sessionVersion,
    };

    if (existing) {
      await prisma.riderProfile.update({ where: { adminUserId: d.id }, data });
      updated += 1;
    } else {
      await prisma.riderProfile.create({
        data: { id: randomUUID(), adminUserId: d.id, ...data },
      });
      created += 1;
    }
  }

  console.log(`Rider profiles: ${created} created, ${updated} updated (${drivers.length} drivers).`);
  await disconnectDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
