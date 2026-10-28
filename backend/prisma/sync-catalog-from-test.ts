/**
 * Copy catalog + staff from TEST_DATABASE_URL → LIVE_DATABASE_URL.
 * Does not copy users, orders, wallets ledger, or delivery operational data.
 *
 *   set ALLOW_CATALOG_SYNC=true
 *   set TEST_DATABASE_URL=postgresql://...
 *   set LIVE_DATABASE_URL=postgresql://...
 *   npm run sync:catalog-from-test -w @bingchun/backend
 */

import { Prisma, PrismaClient } from '@prisma/client';

const BATCH = 200;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function assertAllowed(): void {
  if (process.env.ALLOW_CATALOG_SYNC !== 'true') {
    throw new Error('Set ALLOW_CATALOG_SYNC=true to run catalog sync');
  }
  requireEnv('TEST_DATABASE_URL');
  requireEnv('LIVE_DATABASE_URL');
}

function prismaFor(url: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } },
  });
}

type MetricRow = { metric: string; n: number };

const COUNT_SQL = `
SELECT metric, n::int AS n
FROM (
  SELECT 1 AS ord, 'stores' AS metric, COUNT(*)::int AS n FROM stores
  UNION ALL SELECT 2, 'products', COUNT(*)::int FROM products
  UNION ALL SELECT 3, 'categories', COUNT(*)::int FROM categories
  UNION ALL SELECT 4, 'store_products', COUNT(*)::int FROM store_products
  UNION ALL SELECT 5, 'delivery_zones', COUNT(*)::int FROM delivery.delivery_zones
  UNION ALL SELECT 6, 'admin_users', COUNT(*)::int FROM admin_users
  UNION ALL SELECT 7, 'promo_codes', COUNT(*)::int FROM promo_codes
  UNION ALL SELECT 8, 'orders_total', COUNT(*)::int FROM orders
  UNION ALL SELECT 9, 'users_total', COUNT(*)::int FROM users
  UNION ALL SELECT 10, 'wallet_tx_total', COUNT(*)::int FROM wallet_transactions
  UNION ALL SELECT 11, 'store_wallets', COUNT(*)::int FROM store_wallets
) x
ORDER BY ord`;

async function fetchCounts(client: PrismaClient): Promise<MetricRow[]> {
  return client.$queryRawUnsafe<MetricRow[]>(COUNT_SQL);
}

function printCounts(label: string, rows: MetricRow[]): void {
  console.log(`\n--- ${label} ---`);
  for (const r of rows) {
    console.log(`  ${r.metric}: ${r.n}`);
  }
}

async function batchCreateMany<T>(
  items: T[],
  run: (slice: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH) {
    await run(items.slice(i, i + BATCH));
  }
}

async function inspect(source: PrismaClient, live: PrismaClient): Promise<void> {
  const [src, tgt] = await Promise.all([fetchCounts(source), fetchCounts(live)]);
  printCounts('TEST (source)', src);
  printCounts('LIVE (target)', tgt);
}

async function sync(source: PrismaClient, live: PrismaClient): Promise<void> {
  const liveOrders = await live.order.count();
  if (liveOrders > 0) {
    throw new Error(`Live has ${liveOrders} orders; aborting catalog sync`);
  }

  const snapshot = {
    roles: await source.role.findMany(),
    stores: await source.store.findMany(),
    zones: await source.deliveryZone.findMany(),
    categories: await source.category.findMany(),
    products: await source.product.findMany(),
    toppings: await source.topping.findMany(),
    productToppings: await source.productTopping.findMany(),
    storeProducts: await source.storeProduct.findMany(),
    dailySpecials: await source.dailySpecial.findMany(),
    promos: await source.promoCode.findMany(),
    loyaltyCampaigns: await source.loyaltyCampaign.findMany(),
    spinOffers: await source.spinWheelOffer.findMany(),
    systemSettings: await source.systemSetting.findMany(),
    loyaltySettings: await source.loyaltySetting.findMany(),
    appSettings: await source.appSetting.findMany(),
    cancelReasons: await source.cancelReasonConfig.findMany(),
    refundConfigs: await source.orderStatusRefundConfig.findMany(),
    admins: await source.adminUser.findMany(),
    permissions: await source.permission.findMany(),
    accessibleLinks: await source.$queryRaw<{ A: string; B: string }[]>`
      SELECT "A", "B" FROM "_adminuseraccessiblestores"
    `,
  };

  const testStoreIds = snapshot.stores.map((s) => s.id);
  const usersBefore = await live.user.count();

  await live.$transaction(
    async (tx) => {
      await tx.permission.deleteMany();
      await tx.$executeRawUnsafe('DELETE FROM "_adminuseraccessiblestores"');
      await tx.adminUser.deleteMany();
      await tx.role.deleteMany();

      await tx.storeProduct.deleteMany();
      await tx.dailySpecial.deleteMany();
      await tx.productTopping.deleteMany();
      await tx.product.deleteMany();
      await tx.category.deleteMany();
      await tx.topping.deleteMany();
      await tx.deliveryZone.deleteMany();
      await tx.loyaltyCampaign.deleteMany();
      await tx.spinWheelOffer.deleteMany();
      await tx.promoCode.deleteMany();
      await tx.cancelReasonConfig.deleteMany();
      await tx.orderStatusRefundConfig.deleteMany();

      await tx.store.deleteMany({
        where: { id: { notIn: testStoreIds.length ? testStoreIds : ['__none__'] } },
      });

      if (snapshot.roles.length) {
        await tx.role.createMany({ data: snapshot.roles, skipDuplicates: true });
      }

      for (const s of snapshot.stores) {
        await tx.store.upsert({
          where: { id: s.id },
          create: s,
          update: { ...s, createdAt: s.createdAt },
        });
      }

      if (snapshot.zones.length) {
        await batchCreateMany(snapshot.zones, (slice) =>
          tx.deliveryZone.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.categories.length) {
        await batchCreateMany(snapshot.categories, (slice) =>
          tx.category.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.products.length) {
        await batchCreateMany(snapshot.products, (slice) =>
          tx.product.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.toppings.length) {
        await batchCreateMany(snapshot.toppings, (slice) =>
          tx.topping.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.productToppings.length) {
        await batchCreateMany(snapshot.productToppings, (slice) =>
          tx.productTopping.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.storeProducts.length) {
        await batchCreateMany(snapshot.storeProducts, (slice) =>
          tx.storeProduct.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.dailySpecials.length) {
        await batchCreateMany(snapshot.dailySpecials, (slice) =>
          tx.dailySpecial.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.promos.length) {
        await batchCreateMany(snapshot.promos, (slice) =>
          tx.promoCode.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.loyaltyCampaigns.length) {
        await batchCreateMany(snapshot.loyaltyCampaigns, (slice) =>
          tx.loyaltyCampaign.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.spinOffers.length) {
        await batchCreateMany(snapshot.spinOffers, (slice) =>
          tx.spinWheelOffer.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      for (const row of snapshot.systemSettings) {
        await tx.systemSetting.upsert({
          where: { id: row.id },
          create: row,
          update: row as Prisma.SystemSettingUpdateInput,
        });
      }

      for (const row of snapshot.loyaltySettings) {
        await tx.loyaltySetting.upsert({
          where: { id: row.id },
          create: row,
          update: row as Prisma.LoyaltySettingUpdateInput,
        });
      }

      for (const row of snapshot.appSettings) {
        await tx.appSetting.upsert({
          where: { id: row.id },
          create: row,
          update: row as Prisma.AppSettingUpdateInput,
        });
      }

      if (snapshot.cancelReasons.length) {
        await batchCreateMany(snapshot.cancelReasons, (slice) =>
          tx.cancelReasonConfig.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.refundConfigs.length) {
        await batchCreateMany(snapshot.refundConfigs, (slice) =>
          tx.orderStatusRefundConfig.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.admins.length) {
        await batchCreateMany(snapshot.admins, (slice) =>
          tx.adminUser.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      if (snapshot.permissions.length) {
        await batchCreateMany(snapshot.permissions, (slice) =>
          tx.permission.createMany({ data: slice, skipDuplicates: true }),
        );
      }

      for (const link of snapshot.accessibleLinks) {
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "_adminuseraccessiblestores" ("A", "B") VALUES (${link.A}, ${link.B}) ON CONFLICT DO NOTHING`,
        );
      }

      await tx.storeWallet.deleteMany();
      await tx.$executeRawUnsafe(`
        INSERT INTO store_wallets (id, "storeId", balance, "totalEarnings", "totalWithdrawn", currency, "createdAt", "updatedAt")
        SELECT gen_random_uuid(), s.id, 0, 0, 0, 'LKR', NOW(), NOW()
        FROM stores s
      `);
    },
    { maxWait: 120_000, timeout: 600_000 },
  );

  const usersAfter = await live.user.count();
  if (usersAfter !== usersBefore) {
    console.warn(`Warning: live user count changed ${usersBefore} → ${usersAfter}`);
  }

  console.log('\nCatalog sync complete.');
}

async function main(): Promise<void> {
  const mode = process.argv[2] === 'inspect' ? 'inspect' : 'sync';
  assertAllowed();
  const testUrl = requireEnv('TEST_DATABASE_URL');
  const liveUrl = requireEnv('LIVE_DATABASE_URL');

  const source = prismaFor(testUrl);
  const live = prismaFor(liveUrl);

  try {
    if (mode === 'inspect') {
      await inspect(source, live);
      return;
    }
    console.log('Inspecting before sync...');
    await inspect(source, live);
    console.log('\nSyncing catalog test → live...');
    await sync(source, live);
    console.log('\nInspecting after sync...');
    await inspect(source, live);
  } finally {
    await source.$disconnect();
    await live.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
