/**
 * backfill-default-permissions.ts
 *
 * 1) Grants full default menu matrix to staff with zero permission rows.
 * 2) Adds any preset menus missing from existing staff (e.g. DELIVERY for cashiers).
 *
 * Run: npx ts-node src/scripts/backfill-default-permissions.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  buildDefaultPermissionRows,
  getDefaultMenusForRole,
  ROLES_WITH_DEFAULT_MENUS,
} from '../constants/defaultPermissions';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

async function main() {
  console.log('Starting default-permissions backfill...\n');

  const staff = await prisma.adminUser.findMany({
    where: {
      role: { name: { in: ROLES_WITH_DEFAULT_MENUS } },
      permissions: { none: {} },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { name: true } },
    },
    orderBy: [{ role: { name: 'asc' } }, { name: 'asc' }],
  });

  let totalRows = 0;

  for (const user of staff) {
    const menus = getDefaultMenusForRole(user.role.name);
    if (menus.length === 0) continue;

    const rows = buildDefaultPermissionRows(user.id, menus);
    await prisma.permission.createMany({ data: rows });
    totalRows += rows.length;

    console.log(
      `Granted ${menus.length} menus to ${user.role.name} ${user.name} (${user.email}): ${menus.join(', ')}`,
    );
  }

  if (staff.length === 0) {
    console.log('No staff without permissions found.');
  }

  console.log('\nSyncing missing preset menus for existing staff...');

  const allStaff = await prisma.adminUser.findMany({
    where: { role: { name: { in: ROLES_WITH_DEFAULT_MENUS } } },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { name: true } },
      permissions: { select: { menu: true } },
    },
    orderBy: [{ role: { name: 'asc' } }, { name: 'asc' }],
  });

  let syncUsers = 0;

  for (const user of allStaff) {
    const preset = getDefaultMenusForRole(user.role.name);
    if (preset.length === 0) continue;

    const have = new Set(user.permissions.map((p) => p.menu));
    const missing = preset.filter((menu) => !have.has(menu));
    if (missing.length === 0) continue;

    const rows = buildDefaultPermissionRows(user.id, missing);
    await prisma.permission.createMany({ data: rows });
    totalRows += rows.length;
    syncUsers += 1;

    console.log(
      `Added ${missing.length} menu(s) for ${user.role.name} ${user.name} (${user.email}): ${missing.join(', ')}`,
    );
  }

  if (syncUsers === 0) {
    console.log('All staff already have their role preset menus.');
  }

  console.log(
    `\nDone. Bootstrapped ${staff.length} user(s), synced ${syncUsers} user(s), inserted ${totalRows} permission row(s).`,
  );
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
