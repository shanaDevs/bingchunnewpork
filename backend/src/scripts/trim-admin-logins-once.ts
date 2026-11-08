/**
 * Dev one-off: keep only super admin + Nugegoda branch manager logins.
 */
import path from 'path';
import dotenv from 'dotenv';
import { prisma } from '../lib/prisma';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const KEEP_EMAILS = ['admin@bingchunsrilanka.lk', 'branch@bingchunsrilanka.lk'] as const;

async function main() {
  assertDevSeedOnly();
  await prisma.adminNotification.deleteMany({
    where: { adminUser: { email: { notIn: [...KEEP_EMAILS] } } },
  });
  const removed = await prisma.adminUser.deleteMany({
    where: { email: { notIn: [...KEEP_EMAILS] } },
  });
  const remaining = await prisma.adminUser.findMany({
    select: {
      email: true,
      name: true,
      role: { select: { name: true } },
      store: { select: { name: true } },
    },
    orderBy: { email: 'asc' },
  });
  console.log(`Removed ${removed.count} admin account(s).`);
  console.log('Remaining logins:');
  for (const u of remaining) {
    console.log(`  ${u.email}  (${u.role.name}${u.store ? ` — ${u.store.name}` : ''})`);
  }
  console.log(
    `Data: orders=${await prisma.order.count()} customers=${await prisma.user.count()} admins=${await prisma.adminUser.count()}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
