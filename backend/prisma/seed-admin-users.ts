/**
 * Upsert production demo admin logins (super admin + Nugegoda branch admin).
 *
 *   npm run seed:admin-users -w @bingchun/backend
 */

import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  buildDefaultPermissionRows,
  getDefaultMenusForRole,
  ROLES_WITH_DEFAULT_MENUS,
} from '../src/constants/defaultPermissions';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function ensureRole(name: string): Promise<string> {
  const role = await prisma.role.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  return role.id;
}

async function grantDefaultPermissionsIfMissing(adminUserId: string, roleName: string) {
  if (!ROLES_WITH_DEFAULT_MENUS.includes(roleName as (typeof ROLES_WITH_DEFAULT_MENUS)[number])) {
    return;
  }
  const existing = await prisma.permission.count({ where: { adminUserId } });
  if (existing > 0) return;
  const menus = getDefaultMenusForRole(roleName);
  if (menus.length === 0) return;
  await prisma.permission.createMany({ data: buildDefaultPermissionRows(adminUserId, menus) });
}

async function main() {
  const systemAdminRoleId = await ensureRole('SYSTEM_ADMIN');
  const storeManagerRoleId = await ensureRole('STORE_MANAGER');

  const nugegodaStore = await prisma.store.findFirst({
    where: { name: { contains: 'Nugegoda', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (!nugegodaStore) {
    console.warn('⚠️  No Nugegoda store found — branch admin will be created without storeId.');
  }

  const adminHash = await bcrypt.hash('Admin@123', 12);
  const superAdmin = await prisma.adminUser.upsert({
    where: { email: 'admin@bingchunsrilanka.lk' },
    update: {
      name: 'System Admin',
      roleId: systemAdminRoleId,
      passwordHash: adminHash,
      isActive: true,
      storeId: null,
    },
    create: {
      name: 'System Admin',
      email: 'admin@bingchunsrilanka.lk',
      passwordHash: adminHash,
      roleId: systemAdminRoleId,
    },
  });
  await grantDefaultPermissionsIfMissing(superAdmin.id, 'SYSTEM_ADMIN');

  const branchHash = await bcrypt.hash('Branch@123', 12);
  const branchAdmin = await prisma.adminUser.upsert({
    where: { email: 'branch@bingchunsrilanka.lk' },
    update: {
      name: 'Nugegoda Branch Manager',
      roleId: storeManagerRoleId,
      storeId: nugegodaStore?.id ?? null,
      passwordHash: branchHash,
      isActive: true,
    },
    create: {
      name: 'Nugegoda Branch Manager',
      email: 'branch@bingchunsrilanka.lk',
      passwordHash: branchHash,
      roleId: storeManagerRoleId,
      storeId: nugegodaStore?.id,
    },
  });
  await grantDefaultPermissionsIfMissing(branchAdmin.id, 'STORE_MANAGER');

  console.log('✅ Admin users seeded');
  console.log('Super Admin: admin@bingchunsrilanka.lk / Admin@123');
  console.log(
    `Branch Admin (Nugegoda): branch@bingchunsrilanka.lk / Branch@123${
      nugegodaStore ? ` → ${nugegodaStore.name}` : ''
    }`,
  );
}

main()
  .catch((e) => {
    console.error('❌ seed-admin-users failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
