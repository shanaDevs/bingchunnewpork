/**
 * Seed dummy customers only (150 users + 1–3 addresses each).
 * Does not create orders, wallets, or delivery data.
 *
 *   npm run seed:dummy-users -w @bingchun/backend
 *
 * Prerequisites: main seed (stores/products). Refused when NODE_ENV=production.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { assertDevSeedOnly } from '../src/scripts/seedGuard';

assertDevSeedOnly();

const prisma = new PrismaClient();

const DUMMY_EMAIL_DOMAIN = '@bingchun-test.lk';

function uuid(): string {
  return crypto.randomUUID();
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function randomDate(daysBack: number): Date {
  const now = Date.now();
  const past = now - daysBack * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
}

function padNum(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

const FIRST_NAMES = [
  'Kamal', 'Nimal', 'Sunil', 'Chamara', 'Dilshan', 'Ruwani', 'Sachini', 'Tharushi',
  'Kavinda', 'Nimesh', 'Sanduni', 'Malsha', 'Lahiru', 'Dinesh', 'Ishara', 'Pooja',
  'Ravindu', 'Hasini', 'Nadeesha', 'Sampath', 'Thilini', 'Sahan', 'Amaya', 'Chathura',
];

const LAST_NAMES = [
  'Perera', 'Silva', 'Fernando', 'Jayawardena', 'Wickramasinghe', 'Bandara', 'Rathnayake',
  'Dissanayake', 'Gunasekara', 'Senanayake', 'Karunaratne', 'Amarasinghe', 'Weerasinghe',
];

const CITIES = [
  'Colombo', 'Nugegoda', 'Dehiwala', 'Mount Lavinia', 'Rathmalana', 'Battaramulla',
  'Kohuwala', 'Pannipitiya', 'Kelaniya', 'Wattala', 'Gampaha', 'Negombo',
];

const DISTRICTS = ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matara', 'Galle'];

const STREET_NAMES = [
  'Galle Road', 'Havelock Road', 'High Level Road', 'Main Street', 'Park Road', 'Temple Road',
];

const USER_COUNT = 150;

async function main() {
  console.log('👥 Seeding dummy customers only...\n');

  const storeCount = await prisma.store.count();
  const productCount = await prisma.product.count();
  if (storeCount === 0 || productCount === 0) {
    console.error('❌ Run main seed first: npm run prisma:seed -w @bingchun/backend');
    process.exit(1);
  }

  const dummyUserIds = await prisma.user.findMany({
    where: { email: { endsWith: DUMMY_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const ids = dummyUserIds.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.cart.deleteMany({ where: { userId: { in: ids } } });
    await prisma.address.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`  🧹 Removed ${ids.length} existing dummy users`);
  }

  const userBatch: { id: string; name: string; email: string; phone: string; passwordHash: string; isEmailVerified: boolean; isPhoneVerified: boolean; loyaltyPoints: number; createdAt: Date }[] = [];
  const userIds: string[] = [];

  for (let i = 0; i < USER_COUNT; i++) {
    const id = uuid();
    userIds.push(id);
    const firstName = randomPick(FIRST_NAMES);
    const lastName = randomPick(LAST_NAMES);
    userBatch.push({
      id,
      name: `${firstName} ${lastName}`,
      email: `test.user${i + 1}${DUMMY_EMAIL_DOMAIN}`,
      phone: `077${padNum(1000000 + i, 7)}`,
      passwordHash: '$2a$12$dummyHashForTestingOnlyXXXXXXXXXXXXXXXXXXXXXXXXXX',
      isEmailVerified: Math.random() > 0.3,
      isPhoneVerified: true,
      loyaltyPoints: randomInt(0, 5000),
      createdAt: randomDate(180),
    });
  }

  await prisma.user.createMany({ data: userBatch, skipDuplicates: true });
  console.log(`  ✅ Upserted ${USER_COUNT} users (${DUMMY_EMAIL_DOMAIN})`);

  const addressBatch: {
    id: string;
    userId: string;
    label: string;
    addressLine: string;
    city: string;
    district: string;
    lat: number;
    lng: number;
    isDefault: boolean;
    createdAt: Date;
  }[] = [];

  for (const userId of userIds) {
    const numAddresses = randomInt(1, 3);
    for (let a = 0; a < numAddresses; a++) {
      addressBatch.push({
        id: uuid(),
        userId,
        label: a === 0 ? 'Home' : a === 1 ? 'Office' : 'Other',
        addressLine: `${randomInt(1, 500)} ${randomPick(STREET_NAMES)}`,
        city: randomPick(CITIES),
        district: randomPick(DISTRICTS),
        lat: 6.7 + Math.random() * 0.5,
        lng: 79.8 + Math.random() * 0.3,
        isDefault: a === 0,
        createdAt: randomDate(150),
      });
    }
  }

  await prisma.address.createMany({ data: addressBatch, skipDuplicates: true });
  console.log(`  ✅ Created ${addressBatch.length} addresses`);

  const total = await prisma.user.count({ where: { email: { endsWith: DUMMY_EMAIL_DOMAIN } } });
  const addrTotal = await prisma.address.count({
    where: { user: { email: { endsWith: DUMMY_EMAIL_DOMAIN } } },
  });
  console.log(`\nDone: ${total} dummy users, ${addrTotal} addresses.`);
}

main()
  .catch((e) => {
    console.error('❌ seed-dummy-users failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
