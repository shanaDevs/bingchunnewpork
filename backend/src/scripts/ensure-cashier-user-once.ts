/**
 * Upsert global Nugegoda cashier login (matches prisma/seed.ts).
 *
 *   npx ts-node --transpile-only src/scripts/ensure-cashier-user-once.ts
 */
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import {
  buildDefaultPermissionRows,
  getDefaultMenusForRole,
} from '../constants/defaultPermissions';
import { prisma } from '../lib/prisma';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const CASHIER_EMAIL = 'cashier@bingchunsrilanka.lk';
const CASHIER_PASSWORD = 'Cashier@123';

async function main() {
  assertDevSeedOnly();

  const role = await prisma.role.findFirst({ where: { name: 'CASHIER' }, select: { id: true } });
  if (!role) throw new Error('CASHIER role missing — run prisma:seed');

  const store = await prisma.store.findFirst({
    where: {
      isActive: true,
      OR: [{ name: 'Bing Chun - Nugegoda' }, { name: { contains: 'Nugegoda', mode: 'insensitive' } }],
    },
    select: { id: true, name: true },
  });
  if (!store) throw new Error('Nugegoda store not found');

  const passwordHash = await bcrypt.hash(CASHIER_PASSWORD, 12);
  const user = await prisma.adminUser.upsert({
    where: { email: CASHIER_EMAIL },
    update: {
      name: 'Nugegoda Cashier',
      roleId: role.id,
      storeId: store.id,
      passwordHash,
      isActive: true,
    },
    create: {
      name: 'Nugegoda Cashier',
      email: CASHIER_EMAIL,
      passwordHash,
      roleId: role.id,
      storeId: store.id,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      isActive: true,
      role: { select: { name: true } },
      store: { select: { name: true } },
    },
  });

  const permCount = await prisma.permission.count({ where: { adminUserId: user.id } });
  if (permCount === 0) {
    const menus = getDefaultMenusForRole('CASHIER');
    await prisma.permission.createMany({
      data: buildDefaultPermissionRows(user.id, menus),
    });
    console.log(`Granted default menus: ${menus.join(', ')}`);
  }

  console.log(`✅ Cashier ready: ${user.email} / ${CASHIER_PASSWORD}`);
  console.log(`   Role: ${user.role.name}  Store: ${user.store?.name ?? '—'}  Permissions: ${permCount || getDefaultMenusForRole('CASHIER').length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
