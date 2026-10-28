import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.DATABASE_URL) {
  config({ path: path.join(root, 'backend/.env') });
}

const prisma = new PrismaClient();
try {
  await prisma.$connect();
  await prisma.$executeRawUnsafe(`SET search_path TO public, delivery`);
  const schemas = await prisma.$queryRawUnsafe(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'delivery'`,
  );
  const tables = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'delivery' ORDER BY tablename`,
  );
  const publicDelivery = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'delivery%' OR tablename LIKE 'driver_%') ORDER BY tablename`,
  );
  const publicSample = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 15`,
  );
  let outboxCount = null;
  let outboxError = null;
  try {
    outboxCount = await prisma.deliveryOutbox.count();
  } catch (e) {
    outboxError = e.message?.split('\n')[0] ?? String(e);
  }
  console.log(
    JSON.stringify(
      {
        schemas,
        deliveryTableCount: tables.length,
        deliveryTables: tables.map((t) => t.tablename),
        publicDeliveryTables: publicDelivery,
        deliveryOutboxCount: outboxCount,
        deliveryOutboxError: outboxError,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
