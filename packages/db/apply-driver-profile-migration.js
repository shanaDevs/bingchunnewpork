/**
 * Idempotent apply of 20260725190000_driver_profile_duty_status against the live DB.
 * Skips columns that already exist (e.g. after the cashierBase SQL was applied manually).
 *
 * Usage: node packages/db/apply-driver-profile-migration.js
 * Requires DATABASE_URL in env or backend/.env
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '../../backend/.env'),
    path.join(__dirname, '../../delivery-service/.env'),
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
  }
}

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }

  // Prefer shared package client when built; fall back to @prisma/client from workspace.
  let PrismaClient;
  try {
    ({ PrismaClient } = require('@prisma/client'));
  } catch {
    ({ PrismaClient } = require('../../node_modules/@prisma/client'));
  }

  const prisma = new PrismaClient();
  try {
    const adminCols = [
      ['nicNumber', "ADD COLUMN `nicNumber` VARCHAR(191) NULL"],
      ['vehicleNumber', "ADD COLUMN `vehicleNumber` VARCHAR(191) NULL"],
      ['profilePhotoUrl', "ADD COLUMN `profilePhotoUrl` VARCHAR(191) NULL"],
      ['licenseImageUrl', "ADD COLUMN `licenseImageUrl` VARCHAR(191) NULL"],
      [
        'dutyStatus',
        "ADD COLUMN `dutyStatus` ENUM('ONLINE', 'ON_DELIVERY', 'OFF_DUTY') NOT NULL DEFAULT 'OFF_DUTY'",
      ],
    ];

    for (const [col, ddl] of adminCols) {
      if (await columnExists(prisma, 'admin_users', col)) {
        console.log(`[skip] admin_users.${col} already exists`);
      } else {
        await prisma.$executeRawUnsafe(`ALTER TABLE \`admin_users\` ${ddl}`);
        console.log(`[ok] admin_users.${col} added`);
      }
    }

    if (await columnExists(prisma, 'delivery_jobs', 'broadcastedAt')) {
      console.log('[skip] delivery_jobs.broadcastedAt already exists');
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `delivery_jobs` ADD COLUMN `broadcastedAt` DATETIME(3) NULL',
      );
      console.log('[ok] delivery_jobs.broadcastedAt added');
    }

    console.log('Driver profile / duty status migration applied.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
