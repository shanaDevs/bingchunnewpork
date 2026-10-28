/**
 * Upsert all Bing Chun store branches with map coordinates and delivery zones.
 *
 * Safe to re-run — updates name, address, lat/lng on existing rows.
 *
 * Usage: npm run seed:stores
 */
import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  BINGCHUN_STORES,
  isDeliveryEnabledStore,
  storeIdCandidates,
  storeIdFromName,
  type StoreSeed,
} from './data/stores';
import { syncAllStoreProducts } from '../src/lib/storeInventory';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function resolveStoreId(store: StoreSeed): Promise<string> {
  for (const id of storeIdCandidates(store)) {
    const existing = await prisma.store.findUnique({ where: { id }, select: { id: true } });
    if (existing) return existing.id;
  }

  const names = [store.name, ...(store.legacyNames ?? [])];
  const byName = await prisma.store.findFirst({
    where: { name: { in: names } },
    select: { id: true },
  });
  if (byName) return byName.id;

  return storeIdFromName(store.name);
}

function storeWriteData(store: StoreSeed) {
  return {
    name: store.name,
    addressLine: store.addressLine,
    city: store.city,
    district: store.district,
    lat: store.lat,
    lng: store.lng,
    phone: store.phone ?? null,
    openTime: store.openTime ?? '09:00',
    closeTime: store.closeTime ?? '23:00',
  };
}

async function upsertDeliveryZones(storeId: string) {
  await prisma.deliveryZone.upsert({
    where: { id: `zone-${storeId}-5km` },
    update: {},
    create: {
      id: `zone-${storeId}-5km`,
      storeId,
      name: 'Zone 1 (0-5 km)',
      radiusKm: 5,
      fee: 150,
      minOrder: 500,
    },
  });

  await prisma.deliveryZone.upsert({
    where: { id: `zone-${storeId}-10km` },
    update: {},
    create: {
      id: `zone-${storeId}-10km`,
      storeId,
      name: 'Zone 2 (5-10 km)',
      radiusKm: 10,
      fee: 300,
      minOrder: 800,
    },
  });
}

async function main() {
  console.log(`🏪 Seeding ${BINGCHUN_STORES.length} Bing Chun stores...`);

  let created = 0;
  let updated = 0;

  for (const store of BINGCHUN_STORES) {
    const storeId = await resolveStoreId(store);
    const deliveryEnabled = isDeliveryEnabledStore(storeId);
    const writeData = storeWriteData(store);

    const existing = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });

    await prisma.store.upsert({
      where: { id: storeId },
      update: {
        ...writeData,
        isActive: true,
        deliveryEnabled,
      },
      create: {
        id: storeId,
        ...writeData,
        isActive: true,
        deliveryEnabled,
      },
    });

    if (existing) updated++;
    else created++;

    await upsertDeliveryZones(storeId);
    console.log(`  ✓ ${store.name} (${store.lat}, ${store.lng})`);
  }

  const inventoryAdded = await syncAllStoreProducts({ stock: 0, isAvailable: false });

  console.log('');
  console.log(`✅ Stores seeded: ${created} created, ${updated} updated`);
  if (inventoryAdded > 0) {
    console.log(`📦 Branch inventory: ${inventoryAdded} new store-product rows (stock 0 until RESET batches)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
