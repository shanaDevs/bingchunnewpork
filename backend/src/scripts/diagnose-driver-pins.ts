/**
 * Read-only diagnostic: verify DRIVER_PIN_PEPPER / JWT_SECRET alignment and
 * whether existing driver pinLookup rows would match a candidate PIN.
 *
 * Usage (from backend/):
 *   npx tsx src/scripts/diagnose-driver-pins.ts [--pin 1234] [--storeId <uuid>]
 *
 * Never logs plaintext PINs in production logs beyond the CLI args you pass.
 */
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { driverPinLookup, legacyDriverPinLookup } from '../lib/driverPin';

async function main() {
  const args = process.argv.slice(2);
  const pinIdx = args.indexOf('--pin');
  const storeIdx = args.indexOf('--storeId');
  const pin = pinIdx >= 0 ? args[pinIdx + 1] : undefined;
  const storeId = storeIdx >= 0 ? args[storeIdx + 1] : undefined;

  const pepperSet = Boolean(config.driverPinPepper);
  console.log('DRIVER_PIN_PEPPER set:', pepperSet);
  console.log('JWT_SECRET length:', config.jwtSecret.length);

  const drivers = await prisma.adminUser.findMany({
    where: { role: { name: 'DELIVERY_DRIVER' }, pinLookup: { not: null } },
    select: {
      id: true,
      name: true,
      storeId: true,
      isActive: true,
      pinLookup: true,
      lastLoginAt: true,
    },
  });

  console.log(`Drivers with pinLookup: ${drivers.length}`);

  if (!pin) {
    console.log('Pass --pin <digits> to test match counts (optional --storeId).');
    return;
  }

  let currentHits = 0;
  let legacyHits = 0;
  for (const d of drivers) {
    if (!d.storeId || !d.pinLookup) continue;
    if (storeId && d.storeId !== storeId) continue;
    if (d.pinLookup === driverPinLookup(d.storeId, pin)) currentHits += 1;
    if (d.pinLookup === legacyDriverPinLookup(d.storeId, pin)) legacyHits += 1;
  }
  console.log(`Matches for provided PIN — current pepper: ${currentHits}, legacy JWT_SECRET: ${legacyHits}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
