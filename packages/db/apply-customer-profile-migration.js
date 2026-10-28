/**
 * Idempotent apply of customer profile and ban fields:
 * - users.bannedAt
 * - users.bannedReason
 * - customer_audit_logs table
 *
 * Usage: node packages/db/apply-customer-profile-migration.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '../../backend/.env'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
    if (process.env.DATABASE_URL) break;
  }
}

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    table,
    column,
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function tableExists(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    table,
    column = undefined,
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }

  const prisma = new PrismaClient();
  try {
    console.log('Checking and applying customer profile schema updates...');

    // 1. users.bannedAt
    if (!(await columnExists(prisma, 'users', 'bannedAt'))) {
      console.log('Adding users.bannedAt...');
      await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN "bannedAt" TIMESTAMP(3);`);
    } else {
      console.log('users.bannedAt already exists.');
    }

    // 2. users.bannedReason
    if (!(await columnExists(prisma, 'users', 'bannedReason'))) {
      console.log('Adding users.bannedReason...');
      await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN "bannedReason" TEXT;`);
    } else {
      console.log('users.bannedReason already exists.');
    }

    // 3. Index on users.bannedAt
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "users_bannedAt_idx" ON "users"("bannedAt");`);

    // 4. customer_audit_logs table
    console.log('Ensuring customer_audit_logs table exists...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "customer_audit_logs" (
        "id" TEXT NOT NULL,
        "adminId" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "reason" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "customer_audit_logs_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "customer_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "customer_audit_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    // 5. Index on customer_audit_logs
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "customer_audit_logs_customerId_createdAt_idx" ON "customer_audit_logs"("customerId", "createdAt");
    `);

    console.log('Migration completed successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
