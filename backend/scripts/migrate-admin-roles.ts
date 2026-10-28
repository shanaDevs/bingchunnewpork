/**
 * Migrate admin_users from enum `role` column → `roles` table + `roleId` FK.
 * Safe to re-run: skips steps that are already done.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const p = new PrismaClient();

const DEFAULT_ROLES = [
  'SYSTEM_ADMIN',
  'STORE_MANAGER',
  'CASHIER',
  'DELIVERY_ADMIN',
  'REPORT_VIEWER',
  'DELIVERY_DRIVER',
] as const;

async function tableExists(name: string): Promise<boolean> {
  const rows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SHOW TABLES LIKE '${name}'`,
  );
  return rows.length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await p.$queryRawUnsafe<Array<{ Field: string }>>(
    `SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`,
  );
  return rows.length > 0;
}

async function main() {
  console.log('Starting admin role migration...');

  // 1) Create roles table
  if (!(await tableExists('roles'))) {
    await p.$executeRawUnsafe(`
      CREATE TABLE \`roles\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`roles_name_key\` (\`name\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('Created roles table');
  } else {
    console.log('roles table already exists');
  }

  // 2) Upsert default roles
  for (const name of DEFAULT_ROLES) {
    const existing = await p.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM roles WHERE name = ?`,
      name,
    );
    if (existing.length === 0) {
      await p.$executeRawUnsafe(`INSERT INTO roles (id, name) VALUES (?, ?)`, randomUUID(), name);
      console.log(`  + role ${name}`);
    }
  }

  // 3) Add roleId (nullable first)
  if (!(await columnExists('admin_users', 'roleId'))) {
    await p.$executeRawUnsafe(
      `ALTER TABLE \`admin_users\` ADD COLUMN \`roleId\` VARCHAR(191) NULL`,
    );
    console.log('Added admin_users.roleId');
  } else {
    console.log('admin_users.roleId already exists');
  }

  // 4) Backfill roleId from old enum column if present
  if (await columnExists('admin_users', 'role')) {
    const updated = await p.$executeRawUnsafe(`
      UPDATE admin_users au
      JOIN roles r ON r.name = au.role
      SET au.roleId = r.id
      WHERE au.roleId IS NULL
    `);
    console.log(`Backfilled roleId from role enum (rows affected: ${updated})`);
  }

  // 5) Fail if any user still missing roleId
  const missing = await p.$queryRawUnsafe<Array<{ id: string; email: string }>>(
    `SELECT id, email FROM admin_users WHERE roleId IS NULL`,
  );
  if (missing.length > 0) {
    console.error('Users still missing roleId:', missing);
    throw new Error('Cannot finalize migration: some admin users have no roleId');
  }

  // 6) Make roleId NOT NULL + FK (if not already)
  const roleIdCol = await p.$queryRawUnsafe<Array<{ Null: string; Key: string }>>(
    `SHOW COLUMNS FROM admin_users LIKE 'roleId'`,
  );
  if (roleIdCol[0]?.Null === 'YES') {
    await p.$executeRawUnsafe(
      `ALTER TABLE \`admin_users\` MODIFY COLUMN \`roleId\` VARCHAR(191) NOT NULL`,
    );
    console.log('Set roleId NOT NULL');
  }

  const fks = await p.$queryRawUnsafe<Array<{ CONSTRAINT_NAME: string }>>(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'admin_users'
       AND COLUMN_NAME = 'roleId'
       AND REFERENCED_TABLE_NAME = 'roles'`,
  );
  if (fks.length === 0) {
    await p.$executeRawUnsafe(`
      ALTER TABLE \`admin_users\`
      ADD CONSTRAINT \`admin_users_roleId_fkey\`
      FOREIGN KEY (\`roleId\`) REFERENCES \`roles\`(\`id\`)
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    console.log('Added roleId foreign key');
  }

  // 7) Drop old enum column
  if (await columnExists('admin_users', 'role')) {
    await p.$executeRawUnsafe(`ALTER TABLE \`admin_users\` DROP COLUMN \`role\``);
    console.log('Dropped old admin_users.role enum column');
  }

  console.log('Admin role migration complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
